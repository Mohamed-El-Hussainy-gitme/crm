import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export async function createActivity(contactId: string, kind: string, payload: unknown) {
  return prisma.activity.create({
    data: {
      contactId,
      kind,
      meta: payload === undefined ? undefined : payload === null ? Prisma.JsonNull : (payload as Prisma.InputJsonValue),
    },
  });
}
