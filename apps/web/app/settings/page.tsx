"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/layout";
import { Card, PageHeader } from "@/components/cards";
import { PermissionGate } from "@/components/permissions";
import { useI18n, useSession, useToast } from "@/components/providers";
import { buttonStyles } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useApiQuery } from "@/lib/query";

export default function SettingsPage() {
  const { can, user } = useSession();
  const { notify } = useToast();
  const { t, locale, setLocale } = useI18n();
  const [settings, setSettings] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = can("ADMIN");

  const decorate = (incoming: any) => ({
    ...incoming,
    pipelineStagesText: incoming.pipelineStages.join("\n"),
    dealStagesText: incoming.dealStages.join("\n"),
    contactSourcesText: incoming.contactSources.join("\n"),
    lostReasonsText: incoming.lostReasons.join("\n"),
    tagsText: incoming.tags.join(", "),
    reminderPresetsText: incoming.reminderPresets.join(", "),
    whatsappTemplatesText: incoming.whatsappTemplates.map((item: any) => `${item.name}\n${item.body}`).join("\n\n"),
  });

  const { data, error, reload } = useApiQuery<any>(() => apiFetch("/settings"), [], { cacheKey: "settings:workspace" });

  useEffect(() => {
    if (data) setSettings(decorate(data));
  }, [data]);

  const update = (key: string, value: string) => setSettings((current: any) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings || !canEdit) return;

    try {
      setSaving(true);
      const payload = {
        ...settings,
        pipelineStages: String(settings.pipelineStagesText || "").split("\n").map((value) => value.trim()).filter(Boolean),
        dealStages: String(settings.dealStagesText || "").split("\n").map((value) => value.trim()).filter(Boolean),
        contactSources: String(settings.contactSourcesText || "").split("\n").map((value) => value.trim()).filter(Boolean),
        lostReasons: String(settings.lostReasonsText || "").split("\n").map((value) => value.trim()).filter(Boolean),
        tags: String(settings.tagsText || "").split(",").map((value) => value.trim()).filter(Boolean),
        reminderPresets: String(settings.reminderPresetsText || "").split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value)),
        whatsappTemplates: String(settings.whatsappTemplatesText || "").split("\n\n").map((block) => block.trim()).filter(Boolean).map((block) => {
          const [name, ...rest] = block.split("\n");
          return { name: name.trim(), body: rest.join("\n").trim() };
        }),
      };

      delete payload.pipelineStagesText;
      delete payload.dealStagesText;
      delete payload.contactSourcesText;
      delete payload.lostReasonsText;
      delete payload.tagsText;
      delete payload.reminderPresetsText;
      delete payload.whatsappTemplatesText;

      const saved = await apiFetch("/settings", { method: "PUT", body: JSON.stringify(payload) });
      setSettings(decorate(saved));
      notify({ tone: "success", title: t("settings.saved"), description: t("settings.savedDescription") });
      await reload({ force: true });
    } catch (error) {
      notify({ tone: "error", title: t("settings.saveFailed"), description: error instanceof Error ? error.message : t("settings.saveFailedDescription") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("settings.eyebrow")}
          title={t("settings.title")}
          description={t("settings.description")}
          actions={<div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{t("settings.signedInAs", { role: user?.role ?? "VIEWER" })}</div>}
        />

        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
        {!canEdit ? <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{t("settings.reviewOnly")}</p> : null}

        <Card title={t("settings.localeCardTitle")} description={t("settings.localeCardDescription")}>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setLocale("en")} className={buttonStyles(locale === "en" ? "primary" : "secondary", "sm")}>{t("common.english")}</button>
            <button type="button" onClick={() => setLocale("ar")} className={buttonStyles(locale === "ar" ? "primary" : "secondary", "sm")}>{t("common.arabic")}</button>
            <p className="text-sm text-slate-500">{t("settings.browserPreferenceHint")}</p>
          </div>
        </Card>

        {!settings ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{t("settings.loading")}</p>
        ) : (
          <form onSubmit={save} className="grid gap-6 xl:grid-cols-2">
            <Card title={t("settings.pipelineSettings")} description={t("settings.pipelineSettingsDescription")}>
              <div className="space-y-4">
                <Field label={t("settings.contactStages")} value={settings.pipelineStagesText} onChange={(value) => update("pipelineStagesText", value)} disabled={!canEdit} />
                <Field label={t("settings.dealStages")} value={settings.dealStagesText} onChange={(value) => update("dealStagesText", value)} disabled={!canEdit} />
                <Field label={t("settings.lostReasons")} value={settings.lostReasonsText} onChange={(value) => update("lostReasonsText", value)} disabled={!canEdit} />
              </div>
            </Card>

            <Card title={t("settings.sourcesTagsReminders")} description={t("settings.sourcesTagsRemindersDescription")}>
              <div className="space-y-4">
                <Field label={t("settings.contactSources")} value={settings.contactSourcesText} onChange={(value) => update("contactSourcesText", value)} disabled={!canEdit} />
                <Field label={t("settings.tags")} value={settings.tagsText} onChange={(value) => update("tagsText", value)} disabled={!canEdit} />
                <Field label={t("settings.reminderPresets")} value={settings.reminderPresetsText} onChange={(value) => update("reminderPresetsText", value)} short disabled={!canEdit} />
              </div>
            </Card>

            <div className="xl:col-span-2">
              <Card title={t("settings.whatsappTemplates")} description={t("settings.whatsappTemplatesDescription")}>
                <textarea value={settings.whatsappTemplatesText} onChange={(event) => update("whatsappTemplatesText", event.target.value)} disabled={!canEdit} className="min-h-80 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 disabled:bg-slate-50 disabled:text-slate-500" />
                <PermissionGate minimumRole="ADMIN">
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="submit" disabled={saving} className={buttonStyles("primary")}>{saving ? t("common.saving") : t("settings.saveSettings")}</button>
                  </div>
                </PermissionGate>
              </Card>
            </div>
          </form>
        )}

        <Card title={t("settings.advancedTools")} description={t("settings.advancedToolsDescription")}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              { href: "/automations", label: t("settings.automations"), minimumRole: "SALES_MANAGER" },
              { href: "/broadcasts", label: t("settings.broadcasts"), minimumRole: "SALES_REP" },
              { href: "/intelligence", label: t("settings.intelligence"), minimumRole: "SALES_MANAGER" },
              { href: "/audit", label: t("settings.audit"), minimumRole: "SALES_MANAGER" },
              { href: "/data-tools", label: t("settings.dataTools"), minimumRole: "SALES_MANAGER" },
              { href: "/storage", label: t("settings.storage"), minimumRole: "ADMIN" },
            ].map((item) => (
              <Link key={item.href} href={item.href as Route} className={`rounded-2xl border px-4 py-4 text-sm font-medium transition ${can(item.minimumRole as any) ? "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white" : "border-slate-100 bg-slate-50 text-slate-400"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span>{item.label}</span>
                  <span className="text-[11px] uppercase tracking-[0.18em]">{item.minimumRole}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange, short, disabled }: { label: string; value: string; onChange: (value: string) => void; short?: boolean; disabled?: boolean }) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 disabled:bg-slate-50 disabled:text-slate-500 ${short ? "min-h-24" : "min-h-40"}`} />
    </label>
  );
}
