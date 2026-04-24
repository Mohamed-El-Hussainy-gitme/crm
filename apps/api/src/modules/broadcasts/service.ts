import { type Contact, type PaymentInstallment, type PipelineStage } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export type BroadcastFilters = {
  stages?: PipelineStage[];
  optedInOnly?: boolean;
  overduePaymentsOnly?: boolean;
  withoutNextAction?: boolean;
  inactiveDays?: number;
  tags?: string[];
};

type ContactWithPayments = Contact & { payments: PaymentInstallment[] };

export async function resolveBroadcastAudience(filters: BroadcastFilters): Promise<ContactWithPayments[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      ...(filters.stages?.length ? { stage: { in: filters.stages } } : {}),
      ...(filters.optedInOnly ? { isWhatsappOptedIn: true } : {}),
      ...(filters.withoutNextAction ? { nextFollowUpAt: null } : {}),
      ...(filters.inactiveDays
        ? {
            OR: [
              { lastContactedAt: null },
              { lastContactedAt: { lte: new Date(Date.now() - filters.inactiveDays * 86400000) } },
            ],
          }
        : {}),
    },
    include: { payments: true },
  });

  const filteredByTags = filters.tags?.length
    ? contacts.filter((contact) => {
        const tags = (contact.tags ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

        return filters.tags?.some((tag) => tags.includes(tag)) ?? false;
      })
    : contacts;

  if (!filters.overduePaymentsOnly) return filteredByTags;

  return filteredByTags.filter((contact: ContactWithPayments) =>
    contact.payments.some(
      (payment: PaymentInstallment) => payment.status === "OVERDUE" || (payment.status === "PENDING" && payment.dueDate < new Date()),
    ),
  );
}
