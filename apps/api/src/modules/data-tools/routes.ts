import { FastifyInstance } from "fastify";
import { z } from "zod";
import { PipelineStage, type Contact } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { requireRole } from "../../lib/authz.js";

function parseCsv(raw: string) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [] as Record<string, string>[];
  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });
}

export async function dataToolRoutes(app: FastifyInstance) {
  app.get("/data-tools/duplicates", { preHandler: [app.authenticate, requireRole("SALES_MANAGER")] }, async () => {
    const contacts = await prisma.contact.findMany({ orderBy: { createdAt: "desc" } });
    const phoneMap = new Map<string, Contact[]>();
    const emailMap = new Map<string, Contact[]>();
    const nameCompanyMap = new Map<string, Contact[]>();

    for (const contact of contacts) {
      if (contact.phone) phoneMap.set(contact.phone, [...(phoneMap.get(contact.phone) ?? []), contact]);
      if (contact.email) emailMap.set(contact.email.toLowerCase(), [...(emailMap.get(contact.email.toLowerCase()) ?? []), contact]);
      const key = `${contact.fullName.toLowerCase()}::${(contact.company ?? "").toLowerCase()}`;
      nameCompanyMap.set(key, [...(nameCompanyMap.get(key) ?? []), contact]);
    }

    const groups = [
      ...[...phoneMap.entries()].filter(([, group]) => group.length > 1).map(([value, contacts]) => ({ type: "phone", value, contacts })),
      ...[...emailMap.entries()].filter(([, group]) => group.length > 1).map(([value, contacts]) => ({ type: "email", value, contacts })),
      ...[...nameCompanyMap.entries()].filter(([, group]) => group.length > 1).map(([value, contacts]) => ({ type: "name_company", value, contacts })),
    ];

    return { groups };
  });

  app.post("/data-tools/import/contacts", { preHandler: [app.authenticate, requireRole("SALES_MANAGER")] }, async (request) => {
    const body = z.object({ csv: z.string().min(1) }).parse(request.body);
    const rows = parseCsv(body.csv);
    let created = 0;
    let skipped = 0;

    for (const row of rows) {
      const firstName = row.firstName || row["First Name"] || row.name || row.fullName || "";
      const lastName = row.lastName || row["Last Name"] || "";
      const phone = row.phone || row.Phone || row.mobile || "";
      if (!firstName || !phone) {
        skipped += 1;
        continue;
      }
      const exists = await prisma.contact.findUnique({ where: { phone } });
      if (exists) {
        skipped += 1;
        continue;
      }
      const companyName = row.company || row.Company || "";
      let companyId: string | undefined;
      if (companyName) {
        const company = await prisma.company.upsert({ where: { name: companyName }, update: {}, create: { name: companyName } });
        companyId = company.id;
      }
      await prisma.contact.create({
        data: {
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`.trim(),
          phone,
          email: row.email || row.Email || undefined,
          source: row.source || row.Source || "CSV Import",
          company: companyName || undefined,
          companyId,
          stage: Object.values(PipelineStage).includes((row.stage || "").trim() as PipelineStage) ? ((row.stage || "").trim() as PipelineStage) : PipelineStage.LEAD,
          tags: row.tags || undefined,
          isWhatsappOptedIn: true,
        },
      });
      created += 1;
    }

    return { created, skipped, total: rows.length };
  });
}
