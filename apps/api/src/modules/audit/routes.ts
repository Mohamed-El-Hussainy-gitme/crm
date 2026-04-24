import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireRole } from "../../lib/authz.js";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/audit", { preHandler: [app.authenticate, requireRole("SALES_MANAGER")] }, async (request) => {
    const query = z.object({ limit: z.coerce.number().min(1).max(200).default(50), entityType: z.string().optional(), action: z.string().optional() }).parse(request.query);
    return prisma.auditLog.findMany({
      where: {
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.action ? { action: query.action } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
  });
}
