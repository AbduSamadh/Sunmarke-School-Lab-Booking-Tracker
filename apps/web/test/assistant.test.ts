import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@sunmarke/db";
import { seed } from "../lib/server/seed";
import { ask } from "../lib/server/assistant";
import { createBooking, type Actor } from "../lib/server/bookings";
import { parseRequest, type ParseContext } from "../lib/shared/assistantParse";

process.env.FAKE_NOW = "2026-11-30T04:00:00.000Z"; // Mon 30 Nov 08:00 Dubai

const ctx: ParseContext = {
  today: "2026-11-30",
  resources: [
    { id: "quantum", name: "Quantum Lab", type: "room" },
    { id: "carts", name: "AI Carts", type: "cart_pool" },
    { id: "dollarx", name: "DollarX Lab", type: "room" },
    { id: "xreal", name: "XReal Lab", type: "room" },
    { id: "strike", name: "Strike Lab", type: "room" },
  ],
  incharges: [{ id: "ram", name: "Ram" }, { id: "abdul", name: "Abdul" }],
  staff: [{ id: "t-omar", name: "Omar Haddad" }, { id: "t-sara", name: "Sara Khan" }],
  subjects: ["Science", "Computing", "Design & Technology", "Maths"],
  years: ["FS1", "FS2", ...Array.from({ length: 13 }, (_, i) => `Y${i + 1}`)],
  sections: ["A", "B", "C", "D", "E", "F"],
  blockCodes: ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
};

describe("assistant parser", () => {
  it("reads a full booking request", () => {
    const p = parseRequest("Book Quantum next Tuesday P3-P4 for Y8 B Science, 24 students", ctx);
    expect(p).toMatchObject({ intent: "book", resourceId: "quantum", date: "2026-12-08", blockCodes: ["P3", "P4"], yearGroup: "Y8", section: "B", subject: "Science", studentCount: 24 });
  });
  it("reads carts, rooms, dates and in-charges", () => {
    expect(parseRequest("I need 4 carts on 10 Dec period 2 to room 2.14", ctx)).toMatchObject({ intent: "book", resourceId: "carts", cartCount: 4, date: "2026-12-10", blockCodes: ["P2"], classroom: "Room 2.14" });
    expect(parseRequest("is dollar x free tomorrow?", ctx)).toMatchObject({ intent: "free", resourceId: "dollarx", date: "2026-12-01" });
    expect(parseRequest("book xreal thursday p5 with abdul", ctx)).toMatchObject({ resourceId: "xreal", date: "2026-12-03", blockCodes: ["P5"], inchargeId: "abdul" });
    expect(parseRequest("book strike wed double p3 for omar", ctx)).toMatchObject({ blockCodes: ["P3", "P4"], double: true, forStaffId: "t-omar" });
  });
  it("routes questions", () => {
    expect(parseRequest("how far ahead can I book?", ctx)).toMatchObject({ intent: "rules", topic: "window" });
    expect(parseRequest("cancel my quantum booking on tuesday", ctx)).toMatchObject({ intent: "cancel", resourceId: "quantum" });
    expect(parseRequest("what have I booked?", ctx).intent).toBe("mine");
    expect(parseRequest("hello", ctx).intent).toBe("help");
    expect(parseRequest("8B computing 20 students", ctx)).toMatchObject({ yearGroup: "Y8", section: "B", subject: "Computing", studentCount: 20 });
  });
});

const sara: Actor = { id: "t-sara", name: "Sara Khan", email: "sara.khan@sunmarke.example", role: "teacher", department: "Science" };
const omar: Actor = { id: "t-omar", name: "Omar Haddad", email: "omar.haddad@sunmarke.example", role: "teacher", department: "Computing" };
const admin: Actor = { id: "abd", name: "Abd", email: "abd@sunmarke.example", role: "admin", department: "Labs" };

let db: Db;
beforeEach(async () => {
  db = await openDb();
  await seed(db);
});

describe("assistant answers from the rules engine", () => {
  it("proposes a booking the API accepts, and asks for missing class details first", async () => {
    const a = await ask(db, omar, "book quantum 2026-12-22 P4");
    // Omar has seeded bookings, so his last class fills the details.
    const r = a.proposal ? a : await ask(db, omar, "Computing Y9 A 20 students", a.draft);
    expect(r.proposal?.input).toMatchObject({ resourceId: "quantum", date: "2026-12-22" });
    const made = await createBooking(db, omar, r.proposal!.input as never);
    expect(made.ok).toBe(true);
  });
  it("explains a taken slot, offers alternatives and the waitlist", async () => {
    const first = await ask(db, sara, "book quantum 2026-12-22 P4 science y8 b 24 students");
    await createBooking(db, sara, first.proposal!.input as never);
    const r = await ask(db, omar, "book quantum 2026-12-22 P4 computing y9 a 20 students");
    expect(r.proposal).toBeUndefined();
    expect(r.text.join(" ")).toMatch(/isn't available/);
    expect(r.slots?.length).toBeGreaterThan(0);
    expect(r.waitlist).toBeTruthy();
  });
  it("lists free slots and never shows a booked one", async () => {
    const first = await ask(db, sara, "book quantum 2026-12-22 P4 science y8 b 24 students");
    await createBooking(db, sara, first.proposal!.input as never);
    const r = await ask(db, omar, "what's free on 22 dec at P4?");
    expect(r.slots?.length).toBeGreaterThan(0);
    expect(r.slots!.some((s) => s.resourceId === "quantum")).toBe(false);
  });
  it("teachers can't pick an in-charge; admin gets a reassign step", async () => {
    const t = await ask(db, sara, "book quantum 2026-12-22 P2 with abdul science y8 b 24 students");
    expect(t.proposal?.reassignTo).toBeUndefined();
    expect(t.proposal?.note).toMatch(/Ram will be with you/);
    const a = await ask(db, admin, "book quantum 2026-12-22 P2 with abdul for sara science y8 b 24 students");
    expect(a.proposal?.reassignTo?.id).toBe("abdul");
    expect(a.proposal?.input.onBehalfOf).toBe("t-sara");
  });
});

describe("assistant follow-ups", () => {
  it("a follow-up message updates the proposed booking", async () => {
    const a = await ask(db, omar, "I need 2 carts on 22 dec p2 computing y9 a 20 students room 2.14");
    expect(a.proposal?.input).toMatchObject({ cartCount: 2, classroom: "Room 2.14" });
    const b = await ask(db, omar, "make it 3 carts and room 3.01", a.draft);
    expect(b.proposal?.input).toMatchObject({ resourceId: "carts", cartCount: 3, classroom: "Room 3.01", date: "2026-12-22" });
  });
});
