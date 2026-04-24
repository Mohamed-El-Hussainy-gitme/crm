import { HttpError } from "../common/errors.js";
import { readJsonBody } from "../common/validation.js";
import { CoreRepository } from "../core/repository.js";
import type { BackendEnv } from "../app.js";
import type { AuthUser } from "../auth/types.js";
import type { CompanyRow } from "../core/types.js";
import { createId, nowIso, optionalText, requireMinimumRole, serializeCompany } from "../core/utils.js";

function validateWebsite(value: string | null): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    throw new HttpError("Website must start with http:// or https://", 400);
  }
  return value;
}

function validateCompanyInput(input: Record<string, unknown>, partial = false) {
  const output: Record<string, unknown> = {};

  if (!partial || Object.prototype.hasOwnProperty.call(input, "name")) {
    const name = optionalText(input.name);
    if (!name || name.length < 2 || name.length > 160) throw new HttpError("Company name must be between 2 and 160 characters", 400);
    output.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(input, "industry")) output.industry = optionalText(input.industry);
  if (Object.prototype.hasOwnProperty.call(input, "website")) output.website = validateWebsite(optionalText(input.website));
  if (Object.prototype.hasOwnProperty.call(input, "notes")) output.notes = optionalText(input.notes);

  return output;
}

function matchesCompanySearch(company: CompanyRow, search: string): boolean {
  return [company.name, company.industry, company.website, company.notes].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase());
}

export class CompaniesService {
  private readonly repo: CoreRepository;

  constructor(env: BackendEnv, private readonly user: AuthUser) {
    this.repo = new CoreRepository(env);
  }

  async list(request: Request) {
    const search = new URL(request.url).searchParams.get("search")?.trim();
    const [companies, contacts] = await Promise.all([this.repo.companies(), this.repo.contacts()]);
    const dealsByCompany = await Promise.all(companies.map((company) => this.repo.dealsByCompany(company.id).then((deals) => [company.id, deals] as const)));
    const dealMap = new Map(dealsByCompany);

    return companies
      .filter((company) => !search || matchesCompanySearch(company, search))
      .map((company) => {
        const companyDeals = dealMap.get(company.id) ?? [];
        const openPipelineValue = companyDeals.filter((deal) => !["WON", "LOST"].includes(deal.stage)).reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0);
        return serializeCompany(company, contacts.filter((contact) => contact.companyId === company.id).length, companyDeals.length, openPipelineValue);
      });
  }

  async details(id: string) {
    const company = await this.repo.companyById(id);
    if (!company) throw new HttpError("Company not found", 404);
    const [contacts, deals] = await Promise.all([this.repo.contacts([{ column: "companyId", value: id }]), this.repo.dealsByCompany(id)]);
    return {
      ...company,
      contacts,
      deals,
      contactCount: contacts.length,
      dealCount: deals.length,
      openPipelineValue: deals.filter((deal) => !["WON", "LOST"].includes(deal.stage)).reduce((sum, deal) => sum + Number(deal.amount ?? 0), 0),
    };
  }

  async create(request: Request) {
    requireMinimumRole(this.user, ["SALES_MANAGER", "ADMIN"]);
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const input = validateCompanyInput(body);
    const existing = await this.repo.companyByName(String(input.name));
    if (existing) throw new HttpError("Company with this name already exists", 409);
    const timestamp = nowIso();
    return this.repo.createCompany({ id: createId(), ...input, createdAt: timestamp, updatedAt: timestamp });
  }

  async update(request: Request, id: string) {
    requireMinimumRole(this.user, ["SALES_MANAGER", "ADMIN"]);
    const existing = await this.repo.companyById(id);
    if (!existing) throw new HttpError("Company not found", 404);
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const input = validateCompanyInput(body, true);
    if (input.name && input.name !== existing.name) {
      const duplicate = await this.repo.companyByName(String(input.name));
      if (duplicate && duplicate.id !== id) throw new HttpError("Company with this name already exists", 409);
    }
    const updated = await this.repo.updateCompany(id, { ...input, updatedAt: nowIso() });
    if (!updated) throw new HttpError("Company not found", 404);
    return updated;
  }
}
