"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Send, Sparkles, X } from "lucide-react";
import type { AssistantReply, Draft, Proposal, SlotCard } from "@/lib/server/assistant";
import { fmtDateShort } from "@/lib/shared/format";
import { LabIcon } from "./LabIcon";

type MsgBody = { from: "me"; text: string } | { from: "bot"; reply: AssistantReply; done?: string; tick?: boolean };
type Msg = MsgBody & { id: number };

const KEY = "slb_assistant_v1";
let seq = 1;

/** Floating booking assistant. Answers come from /api/v1/assistant; every change is confirmed here and made through the normal API. */
export function Assistant({ firstName, role }: { firstName: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const fab = useRef<HTMLButtonElement | null>(null);
  const log = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
      if (s?.msgs) {
        setMsgs(s.msgs);
        setDraft(s.draft ?? {});
        seq = Math.max(1, ...s.msgs.map((m: Msg) => m.id + 1));
      }
    } catch {
      /* private mode: start fresh */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ msgs: msgs.slice(-30), draft }));
    } catch {
      /* ignore */
    }
  }, [msgs, draft]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setTimeout(() => fab.current?.focus(), 30);
  }
  const push = (m: MsgBody) => setMsgs((x) => [...x, { ...m, id: seq++ } as Msg]);
  const patch = (id: number, p: Partial<Extract<Msg, { from: "bot" }>>) => setMsgs((x) => x.map((m) => (m.id === id ? ({ ...m, ...p } as Msg) : m)));

  async function send(message: string, d: Draft = draft) {
    const m = message.trim();
    if (!m || busy) return;
    const history = msgs.slice(-10).map((x) => (x.from === "me" ? { role: "user", text: x.text } : { role: "assistant", text: x.reply.text.join(" ").slice(0, 2000) }));
    push({ from: "me", text: m });
    setText("");
    setBusy(true);
    try {
      const r = await fetch("/api/v1/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: m, draft: d, history }) });
      const j = await r.json();
      if (!r.ok) push({ from: "bot", reply: { text: [j.error?.message ?? "Something went wrong. Try again."] } });
      else {
        push({ from: "bot", reply: j });
        setDraft(j.draft ?? {});
      }
    } catch {
      push({ from: "bot", reply: { text: ["I can't reach the server. Check your connection and try again."] } });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(id: number, p: Proposal) {
    patch(id, { done: "Booking…" });
    const r = await fetch("/api/v1/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p.input) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 201) {
      let extra = "";
      if (p.reassignTo) {
        const rr = await fetch(`/api/v1/bookings/${j.booking.id}/reassign`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ staffId: p.reassignTo.id, reason: "Requested through the assistant" }),
        });
        extra = rr.ok ? ` Moved to ${p.reassignTo.name}.` : ` ${p.reassignTo.name} isn't free, so ${j.booking.inchargeName} stays.`;
      }
      patch(id, { done: "Booked", tick: true });
      push({
        from: "bot",
        tick: true,
        reply: {
          text: [`Booked: ${j.booking.resourceName}, ${j.booking.blockLabel} (${j.booking.timeLabel}) with ${j.booking.inchargeName}.${extra}`, "A Teams message and a calendar invite are on their way."],
          link: { label: "See My bookings", href: "/bookings" },
        },
      });
      router.refresh();
    } else if (r.status === 409 && j.ok === false) {
      patch(id, { done: "Not booked" });
      push({
        from: "bot",
        reply: {
          text: [j.code === "just_taken" ? "Someone booked it a moment ago." : `Couldn't book it: ${j.reason}`, ...(j.alternatives?.length ? ["These are free instead:"] : [])],
          slots: (j.alternatives ?? []).map((a: { resourceId: string; resourceName: string; date: string; blockCode: string; inchargeName: string }) => ({
            resourceId: a.resourceId, resourceName: a.resourceName, date: a.date, dateLabel: fmtDateShort(a.date), blockCodes: [a.blockCode], blockLabel: a.blockCode, time: "", inchargeName: a.inchargeName,
          })),
        },
      });
    } else {
      patch(id, { done: undefined });
      push({ from: "bot", reply: { text: [j.error?.message ?? "Couldn't book it. Try again."] } });
    }
  }

  async function cancelBooking(id: number, bookingId: string, title: string) {
    patch(id, { done: `cancel:${bookingId}:busy` });
    const r = await fetch(`/api/v1/bookings/${bookingId}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await r.json().catch(() => ({}));
    patch(id, { done: r.ok ? `cancelled:${bookingId}` : undefined });
    push({ from: "bot", reply: { text: [r.ok ? `Cancelled ${title}. The slot is free again.` : (j.error?.message ?? "Couldn't cancel it.")] } });
    if (r.ok) router.refresh();
  }

  async function joinWaitlist(id: number, w: NonNullable<AssistantReply["waitlist"]>) {
    patch(id, { done: "Joining…" });
    const r = await fetch("/api/v1/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceId: w.resourceId, date: w.date, blockId: w.blockId, ...(w.units ? { units: w.units } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    patch(id, { done: r.ok ? "On the waitlist" : undefined });
    push({ from: "bot", reply: { text: [r.ok ? `You're number ${j.position} on the waitlist for ${w.label}. I'll email you if it frees up.` : (j.error?.message ?? "Couldn't join the waitlist.")] } });
  }

  const pickSlot = (s: SlotCard) => send(`Book ${s.resourceName} ${s.date} ${s.blockCodes.join("-")}`, { ...draft, pending: "book" });

  return (
    <>
      <button
        ref={fab}
        type="button"
        className={`bot-fab${open ? " is-open" : ""}`}
        aria-label={open ? "Close booking assistant" : "Open booking assistant"}
        aria-expanded={open}
        aria-controls="bot-panel"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="bot-fab-icon" aria-hidden="true">{open ? <X size={22} /> : <Bot size={24} />}</span>
        {!open && <span className="bot-fab-label">Ask</span>}
      </button>

      {open && (
        <section id="bot-panel" className="bot-panel" role="dialog" aria-modal="false" aria-labelledby="bot-title">
          <header className="bot-head">
            <span className="bot-avatar" aria-hidden="true"><Sparkles size={16} /></span>
            <div style={{ flex: 1 }}>
              <h2 id="bot-title">Booking assistant</h2>
              <div className="small muted">Finds free slots and books for you. You confirm every booking.</div>
            </div>
            {msgs.length > 0 && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setMsgs([]); setDraft({}); }}>Clear</button>
            )}
            <button type="button" className="btn btn-quiet btn-sm" aria-label="Close" onClick={close}><X size={18} aria-hidden="true" /></button>
          </header>

          <div className="bot-log" ref={log} role="log" aria-live="polite" aria-relevant="additions">
            {msgs.length === 0 && (
              <div className="bot-msg bot">
                <p>Hi {firstName}. Tell me what you need, like &ldquo;Book Quantum next Tuesday P3 for Y8 B Science&rdquo; or &ldquo;What&apos;s free tomorrow?&rdquo;</p>
                {role === "viewer" && <p className="small muted">Leadership accounts can look but not book.</p>}
                <Chips items={["What's free tomorrow?", "Book Quantum next Tuesday P3", "My bookings", "How far ahead can I book?"]} onPick={(s) => send(s)} />
              </div>
            )}
            {msgs.map((m) =>
              m.from === "me" ? (
                <div key={m.id} className="bot-msg me"><p>{m.text}</p></div>
              ) : (
                <BotMessage key={m.id} m={m} onSend={send} onSlot={pickSlot} onConfirm={confirm} onCancel={cancelBooking} onWait={joinWaitlist} />
              ),
            )}
            {busy && (
              <div className="bot-msg bot typing" aria-label="Assistant is typing"><span /><span /><span /></div>
            )}
          </div>

          <form className="bot-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <label htmlFor="bot-text" className="sr-only">Message the booking assistant</label>
            <input
              ref={input}
              id="bot-text"
              type="text"
              autoComplete="off"
              maxLength={500}
              placeholder={draft.pending === "book" ? "Add details or say \"book it\"…" : "Ask or book…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn btn-primary bot-send" type="submit" disabled={!text.trim() || busy} aria-label="Send">
              <Send size={18} aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function Chips({ items, onPick }: { items: string[]; onPick: (s: string) => void }) {
  return (
    <div className="bot-chips">
      {items.map((s) => (
        <button key={s} type="button" className="chip" onClick={() => onPick(s)}>{s}</button>
      ))}
    </div>
  );
}

function BotMessage(props: {
  m: Extract<Msg, { from: "bot" }>;
  onSend: (s: string) => void;
  onSlot: (s: SlotCard) => void;
  onConfirm: (id: number, p: Proposal) => void;
  onCancel: (id: number, bookingId: string, title: string) => void;
  onWait: (id: number, w: NonNullable<AssistantReply["waitlist"]>) => void;
}) {
  const { m } = props;
  const r = m.reply;
  const [sure, setSure] = useState<string | null>(null);
  const locked = Boolean(m.done);
  return (
    <div className="bot-msg bot">
      {m.tick && (
        <svg className="tick" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22" /><path d="M16 27l7 7 14-15" /></svg>
      )}
      {r.text.map((t, i) => <p key={i}>{t}</p>)}

      {r.slots && r.slots.length > 0 && (
        <ul className="bot-slots">
          {r.slots.map((s) => (
            <li key={`${s.resourceId}-${s.date}-${s.blockLabel}`}>
              <button type="button" className="bot-slot" onClick={() => props.onSlot(s)}>
                <LabIcon colour={s.resourceId} />
                <span className="bot-slot-main">
                  <strong>{s.resourceName}</strong>
                  <span className="small muted">{s.dateLabel} · {s.blockLabel}{s.time ? ` ${s.time}` : ""} · {s.inchargeName}{s.unitsLeft !== undefined ? ` · ${s.unitsLeft} carts free` : ""}</span>
                </span>
                <span className="bot-slot-go" aria-hidden="true">Book</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {r.proposal && (
        <div className="bot-card">
          <dl>
            {r.proposal.rows.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {r.proposal.note && <p className="small" style={{ marginTop: 8 }}>{r.proposal.note}</p>}
          {m.done ? (
            <p className="small muted" style={{ margin: "8px 0 0" }}>{m.done}</p>
          ) : (
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => props.onConfirm(m.id, r.proposal!)}>Confirm booking</button>
              <a className="btn btn-sm" href={`/?date=${r.proposal.input.date}&r=${r.proposal.input.resourceId}`}>Open the form</a>
            </div>
          )}
        </div>
      )}

      {r.bookings && r.bookings.length > 0 && (
        <ul className="bot-slots">
          {r.bookings.map((b) => {
            const gone = m.done === `cancelled:${b.id}`;
            return (
              <li key={b.id} className="bot-booking">
                <div>
                  <strong style={gone ? { textDecoration: "line-through" } : undefined}>{b.title}</strong>
                  <div className="small muted">{b.sub}</div>
                </div>
                {!gone && b.cancellable && !locked && (
                  sure === b.id ? (
                    <span className="btn-row">
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => props.onCancel(m.id, b.id, b.title)}>Yes, cancel</button>
                      <button type="button" className="btn btn-sm" onClick={() => setSure(null)}>Keep</button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-sm" onClick={() => setSure(b.id)}>Cancel</button>
                  )
                )}
                {!gone && !b.cancellable && <span className="small muted">Too late to cancel here</span>}
              </li>
            );
          })}
        </ul>
      )}

      {r.waitlist && (
        <div className="btn-row" style={{ marginTop: 8 }}>
          {m.done ? <span className="small muted">{m.done}</span> : <button type="button" className="btn btn-sm" onClick={() => props.onWait(m.id, r.waitlist!)}>Join the waitlist</button>}
        </div>
      )}
      {r.link && <p style={{ marginTop: 8 }}><a href={r.link.href}>{r.link.label}</a></p>}
      {r.suggestions && <Chips items={r.suggestions} onPick={props.onSend} />}
    </div>
  );
}
