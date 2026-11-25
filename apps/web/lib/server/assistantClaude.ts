import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import type { Db } from "@sunmarke/db";
import { book, cancel, context, free, mine, rules, waitlistCard, who, type AssistantReply, type Draft, type History } from "./assistant";
import { campusOf, type Actor } from "./bookings";
import { fmtDateLong } from "../shared/format";

/**
 * Claude-backed assistant (opt-in: ASSISTANT_PROVIDER=claude plus Anthropic
 * credentials). Claude only understands the request and chooses a tool; every
 * tool is the built-in assistant's own read-only function, so availability still
 * comes from packages/rules and every change is a card the person confirms.
 *
 * Data sent to Anthropic: the person's messages, their first name and role,
 * and what the tools return (lab names, free slots, their own bookings).
 */

const MODEL = process.env.ASSISTANT_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 1, timeout: 30_000 }));

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("School day as YYYY-MM-DD (Asia/Dubai).");
const Blocks = z.array(z.string().regex(/^[A-Za-z0-9]{1,10}$/)).min(1).max(3).describe('Period codes such as ["P3"] or ["P3","P4"] for a double.');

export async function askClaude(db: Db, actor: Actor, message: string, history: History): Promise<AssistantReply> {
  const ctx = await context(db, campusOf(actor));
  // Cards produced by tools in this turn; the latest of each kind is shown under Claude's answer.
  const cards: AssistantReply = { text: [] };
  const keep = (r: AssistantReply) => {
    if (r.slots) cards.slots = r.slots;
    if (r.proposal) cards.proposal = r.proposal;
    if (r.bookings) cards.bookings = r.bookings;
    if (r.waitlist) cards.waitlist = r.waitlist;
    if (r.link) cards.link = r.link;
    // Claude sees the same facts the person will see on the cards.
    return JSON.stringify({ said: r.text, slots: r.slots, proposal: r.proposal && { rows: r.proposal.rows, note: r.proposal.note }, bookings: r.bookings, waitlist: r.waitlist });
  };
  const draft = (i: Record<string, unknown>): Draft => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined && v !== null)) as Draft;

  const tools = [
    betaZodTool({
      name: "find_free_slots",
      description: "List free lab or cart slots. Omit date to search the next two weeks. Use before proposing when the person has not picked an exact slot.",
      inputSchema: z.object({ resourceId: z.string().optional(), date: Day.optional(), blockCodes: Blocks.optional(), cartCount: z.number().int().min(1).max(10).optional() }),
      run: async (i) => keep(await free(db, actor, ctx, draft(i))),
    }),
    betaZodTool({
      name: "propose_booking",
      description:
        "Check one slot with the booking rules and, if it is free, prepare a booking card for the person to confirm. This never books by itself. Missing class details are filled from the teacher's last booking; if still missing, the result asks for them.",
      inputSchema: z.object({
        resourceId: z.string(), date: Day, blockCodes: Blocks,
        subject: z.string().optional(), yearGroup: z.string().optional().describe('e.g. "Y8" or "FS2"'), section: z.string().optional(),
        studentCount: z.number().int().min(1).max(60).optional(), cartCount: z.number().int().min(1).max(10).optional(), classroom: z.string().optional(),
        inchargeId: z.string().optional().describe("Only if the person asked for a specific in-charge."),
        forStaffId: z.string().optional().describe("Lab admin only: the teacher this booking is for."),
      }),
      run: async (i) => keep(await book(db, actor, ctx, { ...draft(i), pending: "book" })),
    }),
    betaZodTool({
      name: "my_bookings",
      description: "The person's upcoming bookings, each with a Cancel button. Filter to find one they want to cancel.",
      inputSchema: z.object({ resourceId: z.string().optional(), date: Day.optional(), blockCodes: Blocks.optional() }),
      run: async (i) => keep(Object.keys(draft(i)).length ? await cancel(db, actor, draft(i)) : await mine(db, actor)),
    }),
    betaZodTool({
      name: "offer_waitlist",
      description: "For a slot that is taken: show a Join waitlist button.",
      inputSchema: z.object({ resourceId: z.string(), date: Day, blockCode: z.string() }),
      run: async (i) => keep(await waitlistCard(db, actor, ctx, { resourceId: i.resourceId, date: i.date, blockCodes: [i.blockCode] })),
    }),
    betaZodTool({
      name: "booking_rules",
      description: "School booking rules and who the lab in-charges are.",
      inputSchema: z.object({ topic: z.enum(["window", "cancel", "double", "carts", "waitlist", "incharge", "series", "checkin", "quota", "general"]) }),
      run: async (i) => JSON.stringify((i.topic === "incharge" ? await who(db, ctx, {}) : rules(i.topic === "general" ? undefined : i.topic, ctx.settings)).text),
    }),
  ];

  const system = [
    "You are the booking assistant inside Sunmarke School's lab booking app. Teachers book the Quantum, DollarX, XReal and Strike labs and the AI Carts by period.",
    "Use the tools for every fact about availability, rules and bookings; never guess or invent a slot. You cannot book, cancel or join a waitlist yourself: the tools put a card under your reply and the person presses its button. Say so when relevant (\"Press Confirm booking below\").",
    "Reply in two or three short sentences, plain text, no lists or markdown, British spelling, no emoji. If a request is unclear, ask one short question.",
    `Labs: ${ctx.resources.map((r) => `${r.name} (id ${r.id})`).join(", ")}. In-charges: ${ctx.incharges.map((s) => `${s.name} (id ${s.id})`).join(", ")}. Periods: ${ctx.blockCodes.join(", ")}.`,
  ].join("\n");
  const turn = [
    `Today is ${fmtDateLong(ctx.today)} (${ctx.today}). You are talking to ${actor.name.split(" ")[0]}, role ${actor.role}.`,
    actor.role === "admin" ? `Staff for booking on behalf: ${ctx.staff.map((s) => `${s.name} (id ${s.id})`).join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.text }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: message },
  ];
  // History must start with the person; drop a leading assistant line.
  while (messages[0]?.role === "assistant") messages.shift();

  const final = await getClient().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 4000,
    max_iterations: 6,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools,
    messages: [...messages.slice(0, -1), { role: "user", content: `${turn}\n\n${message}` }],
  });

  if (final.stop_reason === "refusal") return { ...cards, text: ["I can't help with that one. I can find free slots, book, cancel, or explain the booking rules."] };
  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text.trim())
    .filter(Boolean);
  return { ...cards, text: text.length ? text : ["Here's what I found."], draft: cards.proposal ? {} : undefined };
}
