import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createDatabaseBackup,
  getStorageStatus,
  restoreDatabaseBackup,
} from "../../lib/local-storage.js";
import { prisma } from "../../lib/prisma.js";
import { requireRole } from "../../lib/authz.js";

export async function storageRoutes(app: FastifyInstance) {
  app.get("/storage", { preHandler: [app.authenticate, requireRole("ADMIN")] }, async () => {
    return getStorageStatus();
  });

  app.post("/storage/backups", { preHandler: [app.authenticate, requireRole("ADMIN")] }, async (request, reply) => {
    const body = z
      .object({
        label: z.string().min(1).max(40).optional(),
      })
      .parse(request.body ?? {});

    const backup = await createDatabaseBackup(body.label);
    return reply.code(201).send({
      message: "Backup created successfully",
      backup,
    });
  });

  app.post("/storage/restore", { preHandler: [app.authenticate, requireRole("ADMIN")] }, async (request) => {
    const body = z
      .object({
        fileName: z.string().min(1),
      })
      .parse(request.body);

    await prisma.$disconnect();
    return restoreDatabaseBackup(body.fileName);
  });
}
