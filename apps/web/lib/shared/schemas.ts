import { z } from "zod";

/** /api/v1 request contracts, shared by the web UI and (later) the mobile app. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const BookingInput = z
  .object({
    resourceId: z.string().min(1).max(40),
    date: isoDate,
    blockIds: z.array(z.string().min(1).max(60)).min(1).max(3),
    subject: z.string().trim().min(1, "Choose a subject").max(80),
    yearGroup: z.string().trim().min(1, "Choose a year group").max(20),
    section: z.string().trim().max(10).default(""),
    studentCount: z.coerce.number().int().min(1, "At least 1 student").max(60),
    cartCount: z.coerce.number().int().min(1).max(10).optional(),
    classroom: z.string().trim().max(40).optional(),
    objective: z.string().trim().max(300).default(""),
    lessonPlanUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
    specialRequirements: z.string().trim().max(300).default(""),
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
    blockCodes: z.array(z.string().min(1).max(20)).min(1).max(3),
    subject: z.string().trim().min(1, "Choose a subject").max(80),
    yearGroup: z.string().trim().min(1, "Choose a year group").max(20),
    section: z.string().trim().max(10).default(""),
    studentCount: z.coerce.number().int().min(1).max(60),
    cartCount: z.coerce.number().int().min(1).max(10).optional(),
    classroom: z.string().trim().max(40).optional(),
    objective: z.string().trim().max(300).default(""),
    specialRequirements: z.string().trim().max(300).default(""),
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
