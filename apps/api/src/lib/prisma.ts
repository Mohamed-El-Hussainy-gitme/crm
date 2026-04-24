import { PrismaClient } from "@prisma/client";

declare global {
  var __smartcrm_prisma__: PrismaClient | undefined;
}

export const prisma = global.__smartcrm_prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__smartcrm_prisma__ = prisma;
}
