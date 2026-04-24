import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { readJsonBody } from "../common/validation.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { createId, normalizeEmail, normalizePhone, nowIso, optionalText, requireMinimumRole, uniqueTags } from "../core/utils.js";

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = (lines[0] ?? "").split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });
}

export async function handleDataToolsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "data-tools") return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);
  const user = await requireUser(request, env);
  requireMinimumRole(user, ["SALES_MANAGER", "ADMIN"]);
  const repo = new CoreRepository(env);
  const method = request.method.toUpperCase();

  if (pathSegments[1] === "duplicates" && method === "GET") {
    const contacts = await repo.contacts();
    const maps: Array<{ type: string; values: Map<string, typeof contacts> }> = [
      { type: "phone", values: new Map() },
      { type: "email", values: new Map() },
      { type: "name_company", values: new Map() },
    ];
    for (const contact of contacts) {
      const phone = normalizePhone(contact.normalizedPhone || contact.phone);
      if (phone) maps[0]?.values.set(phone, [...(maps[0]?.values.get(phone) ?? []), contact]);
      const email = normalizeEmail(contact.email);
      if (email) maps[1]?.values.set(email, [...(maps[1]?.values.get(email) ?? []), contact]);
      const key = `${contact.fullName.toLowerCase()}::${(contact.company ?? "").toLowerCase()}`;
      maps[2]?.values.set(key, [...(maps[2]?.values.get(key) ?? []), contact]);
    }
    const groups = maps.flatMap(({ type, values }) => Array.from(values.entries()).filter(([, group]) => group.length > 1).map(([value, contacts]) => ({ type, value, contacts })));
    return jsonResponse({ groups });
  }

  if (pathSegments[1] === "import" && pathSegments[2] === "contacts" && method === "POST") {
    const body = (await readJsonBody(request)) as { csv?: unknown };
    if (typeof body.csv !== "string" || !body.csv.trim()) throw new HttpError("CSV text is required", 400);
    const rows = parseCsv(body.csv);
    const existingContacts = await repo.contacts();
    const existingPhones = new Set(existingContacts.map((contact) => normalizePhone(contact.normalizedPhone || contact.phone)).filter(Boolean));
    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const firstName = row.firstName || row["First Name"] || row.name || row.fullName || "";
      const lastName = row.lastName || row["Last Name"] || "";
      const phone = row.phone || row.Phone || row.mobile || "";
      const normalizedPhone = normalizePhone(phone);
      if (!firstName || !phone || !normalizedPhone || existingPhones.has(normalizedPhone)) {
        skipped += 1;
        continue;
      }
      const companyName = row.company || row.Company || "";
      let companyId: string | null = null;
      if (companyName) {
        const existingCompany = await repo.companyByName(companyName);
        const company = existingCompany ?? await repo.createCompany({ id: createId(), name: companyName, industry: null, website: null, notes: null, createdAt: nowIso(), updatedAt: nowIso() });
        companyId = company.id;
      }
      const timestamp = nowIso();
      await repo.createContact({ id: createId(), firstName, lastName: optionalText(lastName), fullName: `${firstName} ${lastName}`.trim(), phone, normalizedPhone, email: normalizeEmail(row.email || row.Email), source: row.source || row.Source || "CSV Import", company: optionalText(companyName), companyId, locationText: null, area: null, mapUrl: null, placeLabel: null, stage: ["LEAD", "INTERESTED", "POTENTIAL", "VISIT", "FREE_TRIAL", "CLIENT", "ON_HOLD", "LOST"].includes((row.stage || "").trim()) ? (row.stage || "").trim() : "LEAD", expectedDealValue: 0, lastContactedAt: null, nextFollowUpAt: null, isWhatsappOptedIn: true, tags: uniqueTags(String(row.tags ?? "").split(",")), ownerId: user.id, createdAt: timestamp, updatedAt: timestamp });
      existingPhones.add(normalizedPhone);
      created += 1;
    }
    return jsonResponse({ created, skipped, total: rows.length });
  }

  return null;
}
