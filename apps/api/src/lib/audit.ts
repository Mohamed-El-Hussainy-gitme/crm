import { prisma } from "./prisma.js";

type AuditInput = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

export async function writeAuditLog(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? undefined,
      actorEmail: input.actorEmail ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : (input.before as any),
      after: input.after === undefined ? undefined : (input.after as any),
    },
  }).catch(() => null);
}
