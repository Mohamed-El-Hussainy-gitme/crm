import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security.js";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await hashPassword("Admin123!");

  const admin = await prisma.user.upsert({
    where: { email: "admin@smartcrm.local" },
    update: {},
    create: { fullName: "Local Admin", email: "admin@smartcrm.local", passwordHash: adminPassword, role: "ADMIN" },
  });

  const alpha = await prisma.company.upsert({ where: { name: "Alpha Interiors" }, update: {}, create: { name: "Alpha Interiors", industry: "Design" } });
  const beta = await prisma.company.upsert({ where: { name: "Beta Design" }, update: {}, create: { name: "Beta Design", industry: "Creative Studio" } });

  const ahmed = await prisma.contact.upsert({
    where: { phone: "201001234567" },
    update: { companyId: alpha.id, company: alpha.name },
    create: {
      firstName: "Ahmed",
      lastName: "Ali",
      fullName: "Ahmed Ali",
      phone: "201001234567",
      email: "ahmed@example.local",
      source: "WhatsApp",
      company: alpha.name,
      companyId: alpha.id,
      stage: "LEAD",
      expectedDealValue: 4500,
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isWhatsappOptedIn: true,
      tags: "new,whatsapp",
      ownerId: admin.id,
    },
  });

  const sara = await prisma.contact.upsert({
    where: { phone: "201009876543" },
    update: { companyId: beta.id, company: beta.name },
    create: {
      firstName: "Sara",
      lastName: "Mohamed",
      fullName: "Sara Mohamed",
      phone: "201009876543",
      source: "Referral",
      company: beta.name,
      companyId: beta.id,
      stage: "POTENTIAL",
      expectedDealValue: 12000,
      lastContactedAt: new Date(),
      nextFollowUpAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      isWhatsappOptedIn: true,
      tags: "hot,referral",
      ownerId: admin.id,
    },
  });

  if (!(await prisma.task.findFirst({ where: { contactId: ahmed.id, title: "Call back on proposal questions" } }))) {
    await prisma.task.create({
      data: {
        contactId: ahmed.id,
        title: "Call back on proposal questions",
        description: "Customer asked for another follow-up call.",
        dueAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        type: "FOLLOW_UP",
        priority: "HIGH",
      },
    });
  }

  if (!(await prisma.note.findFirst({ where: { contactId: ahmed.id, body: "طلب تفاصيل الأسعار على واتساب." } }))) {
    await prisma.note.create({ data: { contactId: ahmed.id, body: "طلب تفاصيل الأسعار على واتساب." } });
  }

  if (!(await prisma.note.findFirst({ where: { contactId: sara.id, body: "مهتمة بعرض سعر كامل مع موعد متابعة بعد يومين." } }))) {
    await prisma.note.create({ data: { contactId: sara.id, body: "مهتمة بعرض سعر كامل مع موعد متابعة بعد يومين." } });
  }

  if (!(await prisma.task.findFirst({ where: { contactId: sara.id, title: "Follow up pricing on WhatsApp" } }))) {
    await prisma.task.create({
      data: {
        contactId: sara.id,
        ownerId: admin.id,
        title: "Follow up pricing on WhatsApp",
        description: "Send final offer and confirm meeting time",
        type: "FOLLOW_UP",
        priority: "HIGH",
        status: "PENDING",
        dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
  }

  if (!(await prisma.deal.findFirst({ where: { contactId: ahmed.id, title: "Website redesign package" } }))) {
    await prisma.deal.create({
      data: {
        contactId: ahmed.id,
        companyId: alpha.id,
        ownerId: admin.id,
        title: "Website redesign package",
        amount: 12000,
        probability: 25,
        stage: "QUALIFIED",
        expectedCloseAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        notes: "Requested full proposal with timeline.",
      },
    });
  }

  if (!(await prisma.deal.findFirst({ where: { contactId: sara.id, title: "Retainer support agreement" } }))) {
    await prisma.deal.create({
      data: {
        contactId: sara.id,
        companyId: beta.id,
        ownerId: admin.id,
        title: "Retainer support agreement",
        amount: 8000,
        probability: 70,
        stage: "NEGOTIATION",
        expectedCloseAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        notes: "Pending final approval from finance.",
      },
    });
  }

  if (!(await prisma.paymentInstallment.findFirst({ where: { contactId: sara.id, label: "Initial deposit" } }))) {
    await prisma.paymentInstallment.create({ data: { contactId: sara.id, label: "Initial deposit", amount: 3000, dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), status: "OVERDUE" } });
  }


  await prisma.appSetting.upsert({
    where: { key: "crm_settings" },
    update: {},
    create: {
      key: "crm_settings",
      value: {
        pipelineStages: ["LEAD", "INTERESTED", "POTENTIAL", "VISIT", "FREE_TRIAL", "CLIENT", "ON_HOLD", "LOST"],
        dealStages: ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ON_HOLD"],
        contactSources: ["WhatsApp", "Referral", "Website", "Call", "Walk-in"],
        lostReasons: ["No budget", "No reply", "Not fit", "Competitor"],
        tags: ["new", "hot", "whatsapp", "referral"],
        reminderPresets: [1, 3, 7],
        whatsappTemplates: [
          { name: "follow_up", body: "مرحبًا، نود متابعة طلبك ومشاركة الخطوة التالية." },
          { name: "payment_reminder", body: "تذكير ودي بوجود دفعة مستحقة، يسعدنا مساعدتك." }
        ]
      } as any,
    },
  });

  if (!(await prisma.broadcast.findFirst({ where: { name: "Interested leads follow-up" } }))) {
    await prisma.broadcast.create({ data: { name: "Interested leads follow-up", description: "Local demo broadcast", content: "مرحبًا، نود متابعة طلبك ومشاركة التفاصيل المناسبة.", filters: { stages: ["INTERESTED", "POTENTIAL"] }, status: "DRAFT" } });
  }

  if (!(await prisma.auditLog.findFirst({ where: { action: "SEED_INITIALIZED" } }))) {
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        actorEmail: admin.email,
        action: "SEED_INITIALIZED",
        entityType: "system",
        entityId: "seed",
        after: { contacts: 2, companies: 2, deals: 2 } as any,
      },
    });
  }

}

main().then(async () => {
  await prisma.$disconnect();
}).catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
