import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireRole } from "../../lib/authz.js";
import { writeAuditLog } from "../../lib/audit.js";

const defaults = {
  pipelineStages: [
    "LEAD",
    "INTERESTED",
    "POTENTIAL",
    "VISIT",
    "FREE_TRIAL",
    "CLIENT",
    "ON_HOLD",
    "LOST",
  ],
  dealStages: [
    "NEW",
    "QUALIFIED",
    "PROPOSAL",
    "NEGOTIATION",
    "WON",
    "LOST",
    "ON_HOLD",
  ],
  contactSources: ["WhatsApp", "Referral", "Website", "Call", "Walk-in"],
  lostReasons: ["No budget", "No reply", "Not fit", "Competitor"],
  tags: ["new", "hot", "whatsapp", "referral"],
  reminderPresets: [1, 3, 7],
  whatsappTemplates: [
    {
      name: "follow_up",
      body: "مرحبًا، نود متابعة طلبك ومشاركة الخطوة التالية.",
    },
    {
      name: "payment_reminder",
      body: "تذكير ودي بوجود دفعة مستحقة، يسعدنا مساعدتك.",
    },
  ],
};

const settingsSchema = z.object({
  pipelineStages: z.array(z.string()).default(defaults.pipelineStages),
  dealStages: z.array(z.string()).default(defaults.dealStages),
  contactSources: z.array(z.string()).default(defaults.contactSources),
  lostReasons: z.array(z.string()).default(defaults.lostReasons),
  tags: z.array(z.string()).default(defaults.tags),
  reminderPresets: z.array(z.number()).default(defaults.reminderPresets),
  whatsappTemplates: z
    .array(z.object({ name: z.string(), body: z.string() }))
    .default(defaults.whatsappTemplates),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/settings", { preHandler: [app.authenticate] }, async () => {
    const row = await prisma.appSetting.findUnique({
      where: { key: "crm_settings" },
    });
    return settingsSchema.parse(row?.value ?? defaults);
  });

  app.put(
    "/settings",
    { preHandler: [app.authenticate, requireRole("ADMIN")] },
    async (request) => {
      const body = settingsSchema.parse(request.body);
      const current = await prisma.appSetting.findUnique({
        where: { key: "crm_settings" },
      });
      const saved = await prisma.appSetting.upsert({
        where: { key: "crm_settings" },
        update: { value: body as any },
        create: { key: "crm_settings", value: body as any },
      });
      const user = request.user;
      await writeAuditLog({
        actorId: user?.sub,
        actorEmail: user?.email,
        action: "SETTINGS_UPDATED",
        entityType: "setting",
        entityId: saved.id,
        before: current?.value ?? defaults,
        after: body,
      });
      return body;
    },
  );
}
