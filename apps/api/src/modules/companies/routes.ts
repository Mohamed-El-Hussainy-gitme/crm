import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { serializeCompanyListItem } from "./serializers.js";

const optionalText = z.string().transform((value) => value.trim()).optional().or(z.literal("")).transform((value) => value || undefined);

const companySchema = z.object({
  name: z.string().min(2).max(160),
  industry: optionalText,
  website: optionalText.refine((value) => !value || /^https?:\/\//.test(value), "Website must start with http:// or https://"),
  notes: optionalText,
});

export async function companyRoutes(app: FastifyInstance) {
  app.get("/companies", { preHandler: [app.authenticate] }, async (request) => {
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    const companies = await prisma.company.findMany({
      where: query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { industry: { contains: query.search } },
              { website: { contains: query.search } },
            ],
          }
        : undefined,
      include: {
        _count: { select: { contacts: true, deals: true } },
        deals: { where: { stage: { notIn: ["WON", "LOST"] } }, select: { amount: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return companies.map((company) => serializeCompanyListItem(company));
  });

  app.get("/companies/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { updatedAt: "desc" } },
        deals: { orderBy: { updatedAt: "desc" }, include: { contact: true } },
      },
    });
    if (!company) return reply.notFound("Company not found");
    return company;
  });

  app.post("/companies", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = companySchema.parse(request.body);
    const created = await prisma.company.create({ data: body });
    return reply.code(201).send(created);
  });

  app.patch("/companies/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = companySchema.partial().parse(request.body);
    const updated = await prisma.company.update({ where: { id }, data: body }).catch(() => null);
    if (!updated) return reply.notFound("Company not found");
    return updated;
  });
}
