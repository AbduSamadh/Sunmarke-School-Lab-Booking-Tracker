import { z } from "zod";

/** /api/v1 request contracts, shared by the web UI and (later) the mobile app. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const BookingInput = z
  .object({
    resourceId: z.string().min(1).max(40),
    date: isoDate,
    blockIds: z.array(z.string().min(1).max(60)).min(1).max(1, "Book one period at a time."),
    subject: z.string().trim().min(1, "Choose a subject").max(80).refine((s) => s !== "Other", "Say which subject"),
    yearGroup: z.string().trim().min(1, "Choose a year group").max(20),
    section: z.string().trim().max(10).default(""),
    studentCount: z.coerce.number().int().min(1, "At least 1 student").max(60),
    cartCount: z.coerce.number().int().min(1).max(3, "At most 3 AI Carts: each goes with its own lab in-charge.").optional(),
    classroom: z.string().trim().max(40).optional(),
    objective: z.string().trim().max(300).default(""),
    lessonPlanUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
    specialRequirements: z.string().trim().max(300).default(""),
    /** Release 2: KS3 progressive plan levels this lesson covers. */
    curriculumIds: z.array(z.string().min(1).max(40)).max(5, "Pick up to 5 levels").optional(),
    overrideWindow: z.boolean().optional(),
    /** Admin only: book in a teacher's name. */
    onBehalfOf: z.string().min(1).max(40).optional(),
  })
  .strict();
export type BookingInput = z.infer<typeof BookingInput>;

export const BookingPatch = z
  .object({
    subject: z.string().trim().min(1).max(80).optional(),
    yearGroup: z.string().trim().min(1).max(20).optional(),
    section: z.string().trim().max(10).optional(),
    studentCount: z.coerce.number().int().min(1).max(60).optional(),
    classroom: z.string().trim().max(40).optional(),
    objective: z.string().trim().max(300).optional(),
    lessonPlanUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
    specialRequirements: z.string().trim().max(300).optional(),
    /** Release 2: KS3 progressive plan levels this lesson covers. */
    curriculumIds: z.array(z.string().min(1).max(40)).max(5, "Pick up to 5 levels").optional(),
  })
  .strict();
export type BookingPatch = z.infer<typeof BookingPatch>;

export const AttendanceInput = z.object({ status: z.enum(["completed", "no_show"]) }).strict();
export const DeclineInput = z.object({ reason: z.string().trim().min(3, "Give a short reason").max(200) }).strict();
export const CancelInput = z.object({ undo: z.boolean().optional() }).strict();
export const WaitlistInput = z
  .object({ resourceId: z.string().min(1), date: isoDate, blockId: z.string().min(1), units: z.coerce.number().int().min(1).max(10).optional() })
  .strict();
export const SignInInput = z.object({ email: z.string().trim().toLowerCase().email() }).strict();

export const SeriesInput = z
  .object({
    resourceId: z.string().min(1).max(40),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    everyWeeks: z.coerce.number().int().min(1).max(4).default(1),
    blockCodes: z.array(z.string().min(1).max(20)).min(1).max(1, "Book one period at a time."),
    subject: z.string().trim().min(1, "Choose a subject").max(80).refine((s) => s !== "Other", "Say which subject"),
    yearGroup: z.string().trim().min(1, "Choose a year group").max(20),
    section: z.string().trim().max(10).default(""),
    studentCount: z.coerce.number().int().min(1).max(60),
    cartCount: z.coerce.number().int().min(1).max(3, "At most 3 AI Carts: each goes with its own lab in-charge.").optional(),
    classroom: z.string().trim().max(40).optional(),
    objective: z.string().trim().max(300).default(""),
    specialRequirements: z.string().trim().max(300).default(""),
    /** Release 2: KS3 progressive plan levels this lesson covers. */
    curriculumIds: z.array(z.string().min(1).max(40)).max(5, "Pick up to 5 levels").optional(),
    onBehalfOf: z.string().min(1).max(40).optional(),
    preview: z.boolean().optional(),
  })
  .strict();
export type SeriesInput = z.infer<typeof SeriesInput>;

export const FeedbackInput = z
  .object({
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().max(500).default(""),
    issue: z.string().trim().max(300).optional(),
    item: z.string().trim().max(60).optional(),
  })
  .strict();

export const ReassignInput = z.object({ staffId: z.string().min(1).max(40).optional(), reason: z.string().trim().max(200).default("") }).strict();

export const IssueInput = z
  .object({
    resourceId: z.string().min(1).max(40),
    item: z.string().trim().max(60).default(""),
    title: z.string().trim().min(3, "Describe the problem in a few words").max(120),
    detail: z.string().trim().max(500).default(""),
    severity: z.enum(["low", "medium", "high"]).default("medium"),
    blockFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    blockTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();
export type IssueInput = z.infer<typeof IssueInput>;

/** Release 1.1: in-charge leave. */
export const AbsenceInput = z
  .object({
    staffId: z.string().min(1).max(40),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    blockCodes: z.array(z.string().max(20)).max(10).optional(),
    reason: z.string().trim().max(120).default(""),
  })
  .strict();

const opt = (n: number) => z.string().max(n).optional();
const AssistantDraft = z
  .object({
    resourceId: opt(40), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), blockCodes: z.array(z.string().max(10)).max(3).optional(), double: z.boolean().optional(),
    inchargeId: opt(40), forStaffId: opt(40), subject: opt(80), yearGroup: opt(20), section: opt(10), studentCount: z.number().int().min(1).max(60).optional(),
    cartCount: z.number().int().min(1).max(50).optional(), classroom: opt(40), pending: z.enum(["book", "waitlist"]).optional(),
  })
  .strip();
export const AssistantInput = z
  .object({
    message: z.string().trim().min(1).max(500),
    draft: AssistantDraft.optional(),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(12).optional(),
  })
  .strict();

/** Release 2: phone app push tokens. */
export const DeviceInput = z
  .object({
    token: z.string().min(10).max(200).regex(/^[\w\-[\]:.]+$/, "Not a push token"),
    platform: z.enum(["ios", "android", "web"]),
  })
  .strict();
export const DeviceRemove = z.object({ token: z.string().min(10).max(200) }).strict();
export const CheckinInput = z.object({ code: z.string().min(4).max(40) }).strict();
export const StaffImportInput = z.object({ csv: z.string().max(500_000) }).strict();
export const ResolveIssueInput = z.object({ note: z.string().trim().max(300).default("") }).strict();
export const CampusSwitch = z.object({ campusId: z.string().min(1).max(40), back: z.string().max(200).optional() });
