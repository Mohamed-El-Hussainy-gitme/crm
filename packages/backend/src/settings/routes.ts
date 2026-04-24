import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { readJsonBody } from "../common/validation.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { createId, nowIso, requireMinimumRole } from "../core/utils.js";
import { writeAudit } from "../core/business.js";

const defaults = {
  pipelineStages: ["LEAD", "INTERESTED", "POTENTIAL", "VISIT", "FREE_TRIAL", "CLIENT", "ON_HOLD", "LOST"],
  dealStages: ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST", "ON_HOLD"],
  contactSources: ["WhatsApp", "Referral", "Website", "Call", "Walk-in"],
  lostReasons: ["No budget", "No reply", "Not fit", "Competitor"],
  tags: ["new", "hot", "whatsapp", "referral"],
  reminderPresets: [1, 3, 7],
  whatsappTemplates: [
    { name: "follow_up", body: "مرحبًا، نود متابعة طلبك ومشاركة الخطوة التالية." },
    { name: "payment_reminder", body: "تذكير ودي بوجود دفعة مستحقة، يسعدنا مساعدتك." },
  ],
};

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : fallback;
}

function settingsValue(value: unknown) {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    pipelineStages: stringArray(input.pipelineStages, defaults.pipelineStages),
    dealStages: stringArray(input.dealStages, defaults.dealStages),
    contactSources: stringArray(input.contactSources, defaults.contactSources),
    lostReasons: stringArray(input.lostReasons, defaults.lostReasons),
    tags: stringArray(input.tags, defaults.tags),
    reminderPresets: Array.isArray(input.reminderPresets) ? input.reminderPresets.map(Number).filter((item) => Number.isFinite(item) && item > 0) : defaults.reminderPresets,
    whatsappTemplates: Array.isArray(input.whatsappTemplates)
      ? input.whatsappTemplates.map((item) => ({ name: String((item as { name?: unknown }).name ?? "").trim(), body: String((item as { body?: unknown }).body ?? "").trim() })).filter((item) => item.name && item.body)
      : defaults.whatsappTemplates,
  };
}

export async function handleSettingsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  if (pathSegments[0] !== "settings") return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);
  const user = await requireUser(request, env);
  const repo = new CoreRepository(env);
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const row = await repo.appSettingByKey("crm_settings");
    return jsonResponse(settingsValue(row?.value ?? defaults));
  }

  if (method === "PUT") {
    requireMinimumRole(user, ["ADMIN"]);
    const current = await repo.appSettingByKey("crm_settings");
    const body = settingsValue(await readJsonBody(request));
    const saved = current
      ? await repo.updateAppSetting(current.id, { value: body, updatedAt: nowIso() })
      : await repo.createAppSetting({ id: createId(), key: "crm_settings", value: body, createdAt: nowIso(), updatedAt: nowIso() });
    if (!saved) throw new HttpError("Failed to save settings", 500);
    await writeAudit(repo, user, { action: "SETTINGS_UPDATED", entityType: "setting", entityId: saved.id, before: current?.value ?? defaults, after: body });
    return jsonResponse(body);
  }

  return null;
}
