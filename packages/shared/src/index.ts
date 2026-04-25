import { z } from "zod";

export const PIPELINE_STAGES = [
  "LEAD",
  "INTERESTED",
  "POTENTIAL",
  "VISIT",
  "FREE_TRIAL",
  "CLIENT",
  "ON_HOLD",
  "LOST",
] as const;

export const DEAL_STAGES = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ON_HOLD",
] as const;

export const TASK_TYPES = [
  "FOLLOW_UP",
  "CALL",
  "WHATSAPP",
  "MEETING",
  "PAYMENT",
  "GENERAL",
] as const;

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export const TASK_STATUSES = ["PENDING", "COMPLETED", "CANCELLED"] as const;

export const FOLLOW_UP_COMPLETION_RESULTS = [
  "CONNECTED",
  "NO_ANSWER",
  "RESCHEDULED",
  "INTERESTED",
  "NOT_INTERESTED",
  "VISIT_BOOKED",
  "FREE_TRIAL_BOOKED",
  "PAYMENT_COMMITTED",
  "DONE",
] as const;

export const userRoleSchema = z.enum([
  "VIEWER",
  "SALES_REP",
  "SALES_MANAGER",
  "ADMIN",
]);
export const prioritySchema = z.enum(TASK_PRIORITIES);
export const taskTypeSchema = z.enum(TASK_TYPES);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const followUpCompletionResultSchema = z.enum(FOLLOW_UP_COMPLETION_RESULTS);
export const pipelineStageSchema = z.enum(PIPELINE_STAGES);
export const dealStageSchema = z.enum(DEAL_STAGES);

const nullableTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalDurationSchema = z.number().int().min(5).max(480).optional();
const optionalOwnerSchema = z.string().cuid().optional();
const optionalExactTimeSchema = z.boolean().optional().default(false);

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export const createContactSchema = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().max(100).optional().default(""),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().email().optional(),
  source: nullableTrimmedString(100),
  company: nullableTrimmedString(120),
  locationText: nullableTrimmedString(180),
  area: nullableTrimmedString(120),
  mapUrl: z.string().trim().url().max(2000).optional(),
  placeLabel: nullableTrimmedString(160),
  notes: z.string().trim().max(2000).optional(),
  stage: pipelineStageSchema.default("LEAD"),
  expectedDealValue: z.number().nonnegative().optional().default(0),
  lastContactedAt: z.string().datetime().optional(),
  nextFollowUpAt: z.string().datetime().optional(),
  isWhatsappOptedIn: z.boolean().optional().default(false),
  tags: z.array(z.string().trim().max(40)).optional().default([]),
});

export const createTaskSchema = z.object({
  contactId: z.string().cuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).optional(),
  dueAt: z.string().datetime(),
  priority: prioritySchema.default("MEDIUM"),
  type: taskTypeSchema.default("FOLLOW_UP"),
  hasExactTime: optionalExactTimeSchema,
  durationMins: optionalDurationSchema,
  ownerId: optionalOwnerSchema,
});

export const quickFollowUpSchema = z.object({
  title: z.string().trim().min(3).max(160),
  dueAt: z.string().datetime(),
  description: z.string().trim().max(1000).optional(),
  priority: prioritySchema.default("MEDIUM"),
  type: taskTypeSchema.default("FOLLOW_UP"),
  hasExactTime: optionalExactTimeSchema,
  durationMins: optionalDurationSchema,
  ownerId: optionalOwnerSchema,
});

export const rescheduleTaskSchema = z.object({
  dueAt: z.string().datetime(),
  hasExactTime: optionalExactTimeSchema,
});

export const updateTaskStatusSchema = z.object({
  status: taskStatusSchema,
  result: nullableTrimmedString(240),
});

export const completeScheduledContactSchema = z.object({
  result: nullableTrimmedString(240),
});

export const createNoteSchema = z.object({
  body: z.string().trim().min(2).max(2000),
});

export const createCallSchema = z.object({
  outcome: z.string().trim().min(2).max(100),
  summary: z.string().trim().min(2).max(1000),
  durationMins: z.number().int().min(1).max(480).default(5),
});

export const createPaymentSchema = z.object({
  label: z.string().trim().min(2).max(160),
  amount: z.number().positive(),
  dueDate: z.string().datetime(),
});

export const createDealSchema = z.object({
  title: z.string().trim().min(2).max(160),
  amount: z.number().nonnegative(),
  probability: z.number().min(0).max(100),
  stage: dealStageSchema.default("NEW"),
  expectedCloseAt: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateStageSchema = z.object({
  stage: pipelineStageSchema,
});

export function digitsOnly(value?: string | null) {
  return (value ?? "").replace(/[^\d]/g, "");
}

export function normalizeWhatsappPhone(value?: string | null) {
  const digits = digitsOnly(value);
  if (!digits) return null;

  if (digits.startsWith("0020") && digits.length === 14) {
    return digits.slice(2);
  }

  if (digits.startsWith("20") && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 11) {
    return `20${digits.slice(1)}`;
  }

  if (digits.startsWith("1") && digits.length === 10) {
    return `20${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return digits;
  }

  return null;
}

export function buildWhatsappUrl(phone?: string | null, text?: string) {
  const normalized = normalizeWhatsappPhone(phone) ?? digitsOnly(phone);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${normalized}${query}`;
}

function decodeMapFragment(value: string) {
  return decodeURIComponent(value.replace(/\+/g, " ")).trim();
}

function normalizeLocationText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function inferArea(locationText?: string) {
  if (!locationText) return undefined;

  const segments = locationText
    .split(/[\n,،|-]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (segments.length >= 3) {
    return segments[segments.length - 3];
  }

  if (segments.length === 2) {
    return segments[1];
  }

  return undefined;
}

export type ParsedLocationIntake = {
  source: string;
  mapUrl?: string;
  placeLabel?: string;
  locationText?: string;
  area?: string;
  company?: string;
  firstName?: string;
  warnings: string[];
};

export function parseLocationIntake(
  input?: string | null,
): ParsedLocationIntake {
  const raw = (input ?? "").trim();
  if (!raw) {
    return {
      source: "Google Maps",
      warnings: ["Paste a Google Maps link or copied place text first."],
    };
  }

  const warnings: string[] = [];
  let mapUrl: string | undefined;
  let placeLabel: string | undefined;
  let locationText: string | undefined;
  let source =
    raw.toLowerCase().includes("google") || raw.toLowerCase().includes("maps")
      ? "Google Maps"
      : "Manual";

  try {
    const url = new URL(raw);
    mapUrl = url.toString();
    source =
      url.hostname.includes("google") || url.hostname.includes("goo.gl")
        ? "Google Maps"
        : "Manual";

    const q =
      url.searchParams.get("q") ??
      url.searchParams.get("query") ??
      url.searchParams.get("destination") ??
      url.searchParams.get("daddr");
    if (q) {
      locationText = normalizeLocationText(decodeMapFragment(q));
    }

    if (url.pathname.includes("/place/")) {
      const placeSegment = url.pathname.split("/place/")[1]?.split("/")[0];
      if (placeSegment) {
        placeLabel = normalizeLocationText(decodeMapFragment(placeSegment));
      }
    }

    if (!locationText && url.pathname && url.pathname !== "/") {
      const pathCandidate = url.pathname
        .split("/")
        .map((item) => decodeMapFragment(item))
        .find(
          (item) =>
            item &&
            !["maps", "place", "search", "dir"].includes(item.toLowerCase()),
        );
      if (pathCandidate) {
        locationText = normalizeLocationText(pathCandidate);
      }
    }
  } catch {
    locationText = normalizeLocationText(raw);
    if (
      raw.toLowerCase().includes("google") ||
      raw.toLowerCase().includes("maps")
    ) {
      source = "Google Maps";
    }
  }

  if (!placeLabel && locationText) {
    const segments = locationText
      .split(/[\n,،|-]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (segments.length) {
      placeLabel = segments[0];
    }
  }

  const area = inferArea(locationText);

  if (!placeLabel) {
    warnings.push("Could not extract the place name automatically.");
  }

  if (!locationText) {
    warnings.push("Could not extract a reliable address from this input.");
  }

  return {
    source,
    mapUrl,
    placeLabel,
    locationText,
    area,
    company: placeLabel,
    firstName: placeLabel,
    warnings,
  };
}


export const CAFE_CALL_OUTCOMES = [
  "NO_ANSWER",
  "WRONG_NUMBER",
  "INTERESTED",
  "NEEDS_CALLBACK",
  "MEETING_BOOKED",
  "REJECTED",
  "ALREADY_HAS_SYSTEM",
  "NEEDS_OWNER",
] as const;

export const cafeCallOutcomeSchema = z.enum(CAFE_CALL_OUTCOMES);

export const parseCafeLeadsSchema = z.object({
  input: z.string().trim().min(3).max(20000),
  defaultArea: z.string().trim().max(120).optional(),
  defaultSource: z.string().trim().max(100).optional().default("Google Maps"),
});

export const cafeLeadCandidateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(30).optional(),
  area: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  coordinates: z.string().trim().max(80).optional(),
  plusCode: z.string().trim().max(120).optional(),
  mapUrl: z.string().trim().url().max(2000).optional(),
  source: z.string().trim().max(100).optional().default("Google Maps"),
  notes: z.string().trim().max(1000).optional(),
  score: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string().trim().max(40)).optional().default([]),
});

export const importCafeLeadsSchema = z.object({
  leads: z.array(cafeLeadCandidateSchema).min(1).max(100),
});

export const cafeCallOutcomeRequestSchema = z.object({
  contactId: z.string().trim().min(3).max(80),
  outcome: cafeCallOutcomeSchema,
  summary: z.string().trim().max(1000).optional(),
  meetingAt: z.string().datetime().optional(),
  followUpAt: z.string().datetime().optional(),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type QuickFollowUpInput = z.infer<typeof quickFollowUpSchema>;
export type RescheduleTaskInput = z.infer<typeof rescheduleTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
export type CompleteScheduledContactInput = z.infer<typeof completeScheduledContactSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type CreateCallInput = z.infer<typeof createCallSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type CafeCallOutcome = z.infer<typeof cafeCallOutcomeSchema>;
export type CafeLeadCandidate = z.infer<typeof cafeLeadCandidateSchema>;
export type PipelineStage = z.infer<typeof pipelineStageSchema>;
