import { digitsOnly, normalizeWhatsappPhone } from "@smartcrm/shared";
import type { DealStage, PaymentStatus, TaskType } from "@prisma/client";
import { prisma } from "./prisma.js";

const CONTACT_TOUCH_TASK_TYPES: TaskType[] = [
  "FOLLOW_UP",
  "CALL",
  "WHATSAPP",
  "MEETING",
  "GENERAL",
];

function httpError(
  message: string,
  statusCode = 400,
): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export function normalizePhone(value?: string | null) {
  return normalizeWhatsappPhone(value) ?? digitsOnly(value);
}

export function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function requiresContactTouch(type?: string | null) {
  return Boolean(type && CONTACT_TOUCH_TASK_TYPES.includes(type as TaskType));
}

export function isFollowUpLikeTask(type?: string | null) {
  return requiresContactTouch(type);
}

export async function touchContact(contactId: string, touchedAt = new Date()) {
  await prisma.contact.update({
    where: { id: contactId },
    data: { lastContactedAt: touchedAt },
  }).catch(() => null);
}

export async function syncContactNextFollowUp(contactId: string) {
  const nextTask = await prisma.task.findFirst({
    where: {
      contactId,
      status: "PENDING",
      type: { in: CONTACT_TOUCH_TASK_TYPES },
    },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true },
  });

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      nextFollowUpAt: nextTask?.dueAt ?? null,
    },
  }).catch(() => null);
}

export async function assertUniqueContactIdentity(input: {
  phone?: string | null;
  email?: string | null;
  excludeContactId?: string;
}) {
  const normalizedPhone = normalizePhone(input.phone);
  const normalizedEmail = normalizeEmail(input.email);

  if (!normalizedPhone && !normalizedEmail) return;

  const contacts = await prisma.contact.findMany({
    where: input.excludeContactId
      ? { id: { not: input.excludeContactId } }
      : undefined,
    select: {
      id: true,
      fullName: true,
      phone: true,
      normalizedPhone: true,
      email: true,
    },
  });

  if (normalizedPhone) {
    const phoneMatch = contacts.find(
      (contact: {
        phone: string;
        normalizedPhone: string | null;
        fullName: string;
      }) =>
        normalizePhone(contact.normalizedPhone || contact.phone) ===
        normalizedPhone,
    );
    if (phoneMatch) {
      throw httpError(
        `A contact with this phone already exists: ${phoneMatch.fullName}.`,
        409,
      );
    }
  }

  if (normalizedEmail) {
    const emailMatch = contacts.find(
      (contact: { email: string | null; fullName: string }) =>
        normalizeEmail(contact.email) === normalizedEmail,
    );
    if (emailMatch) {
      throw httpError(
        `A contact with this email already exists: ${emailMatch.fullName}.`,
        409,
      );
    }
  }
}

export async function findContactByPhone(phone: string) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const exact = await prisma.contact.findFirst({
    where: { OR: [{ normalizedPhone }, { phone: phone.trim() }] },
  });
  if (exact) return exact;

  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      fullName: true,
      phone: true,
      normalizedPhone: true,
      email: true,
      stage: true,
      lastContactedAt: true,
    },
  });

  return (
    contacts.find(
      (contact: { phone: string; normalizedPhone: string | null }) =>
        normalizePhone(contact.normalizedPhone || contact.phone) ===
        normalizedPhone,
    ) ?? null
  );
}

export async function ensureContactStageChangeAllowed(
  contactId: string,
  nextStage: string,
) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      tasks: {
        where: { status: "PENDING" },
        select: { id: true, type: true, dueAt: true },
      },
      deals: { select: { id: true, stage: true, amount: true } },
      payments: { select: { id: true, status: true } },
    },
  });

  if (!contact) {
    throw httpError("Contact not found", 404);
  }

  const hasExplicitNextAction =
    Boolean(contact.nextFollowUpAt) ||
    contact.tasks.some((task: { type: string }) => isFollowUpLikeTask(task.type));
  const hasCommercialProof =
    contact.deals.some(
      (deal: { stage: string; amount: number }) =>
        deal.stage === "WON" && deal.amount > 0,
    ) ||
    contact.payments.some((payment: { status: string }) =>
      ["PENDING", "PARTIAL", "PAID", "OVERDUE"].includes(payment.status),
    );

  if (
    ["INTERESTED", "POTENTIAL", "VISIT", "FREE_TRIAL", "ON_HOLD"].includes(
      nextStage,
    ) &&
    !hasExplicitNextAction
  ) {
    throw httpError(
      "This stage requires a scheduled next action. Create a follow-up or task first.",
      409,
    );
  }

  if (nextStage === "CLIENT" && !hasCommercialProof) {
    throw httpError(
      "Move a contact to CLIENT only after a won deal or a scheduled payment exists.",
      409,
    );
  }

  return contact;
}

export async function applyLostContactState(contactId: string) {
  await prisma.task.updateMany({
    where: {
      contactId,
      status: "PENDING",
      type: { in: CONTACT_TOUCH_TASK_TYPES },
    },
    data: { status: "CANCELLED" },
  });

  await prisma.contact.update({
    where: { id: contactId },
    data: { nextFollowUpAt: null },
  });
}


export function resolvePaymentStatus(dueDate: Date, now = new Date()): PaymentStatus {
  return dueDate.getTime() < now.getTime() ? "OVERDUE" : "PENDING";
}

export async function promoteContactToClient(contactId: string) {
  const [wonDeal, payment] = await Promise.all([
    prisma.deal.findFirst({
      where: { contactId, stage: "WON" },
      select: { id: true },
    }),
    prisma.paymentInstallment.findFirst({
      where: {
        contactId,
        status: { in: ["PENDING", "PARTIAL", "PAID", "OVERDUE"] },
      },
      select: { id: true },
    }),
  ]);

  if (!wonDeal && !payment) return null;

  return prisma.contact
    .update({
      where: { id: contactId },
      data: { stage: "CLIENT" },
    })
    .catch(() => null);
}

type AssertDealWorkflowInput = {
  contactId?: string;
  dealId?: string;
  stage: DealStage;
  amount: number;
};

export async function assertDealWorkflow(input: AssertDealWorkflowInput) {
  const existingDeal = input.dealId
    ? await prisma.deal.findUnique({
        where: { id: input.dealId },
        select: { id: true, contactId: true },
      })
    : null;

  const contactId = input.contactId ?? existingDeal?.contactId;
  if (!contactId) {
    throw httpError("Contact not found", 404);
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, stage: true, nextFollowUpAt: true },
  });

  if (!contact) {
    throw httpError("Contact not found", 404);
  }

  if (input.stage === "WON" && input.amount <= 0) {
    throw httpError("A won deal must have an amount greater than zero.", 409);
  }

  if (["PROPOSAL", "NEGOTIATION", "WON"].includes(input.stage) && contact.stage === "LOST") {
    throw httpError("Reopen the contact before moving a deal into an active commercial stage.", 409);
  }

  return contact;
}
