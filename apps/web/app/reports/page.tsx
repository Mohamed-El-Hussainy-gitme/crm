"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { useI18n, useToast } from "@/components/providers";
import { buttonStyles } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { useApiQuery } from "@/lib/query";


type Report = {
  contactsByStage: Array<{ stage: string; _count: { stage: number } }>;
  contactsBySource: Array<{ source: string | null; _count: { source: number } }>;
  dealsByStage: Array<{ stage: string; _count: { stage: number }; _sum: { amount: number | null } }>;
  stagePerformance: Array<{ stage: string; count: number; share: number }>;
  attentionBoard: Array<{ label: string; value: number; tone: string }>;
  insights: string[];
  metrics: {
    openPipelineValue: number;
    wonValue: number;
    followUpCompletionRate: number;
    overduePaymentsCount: number;
    dealWinRate: number;
    activeContactsCount: number;
    contactsCreatedInRange: number;
    dueTasksNext7Days: number;
    upcomingPaymentsCount: number;
    upcomingPaymentsValue: number;
    averageWonDealSize: number;
    overduePressureScore: number;
    overduePaymentsValue: number;
    staleContactsCount: number;
    noNextActionCount: number;
  };
};

function toneClass(tone: string) {
  if (tone === "rose") return "bg-rose-500";
  if (tone === "amber") return "bg-amber-500";
  if (tone === "emerald") return "bg-emerald-500";
  if (tone === "sky") return "bg-sky-500";
  return "bg-slate-400";
}

export default function ReportsPage() {
  const [rangeDays, setRangeDays] = useState("30");
  const { notify } = useToast();
  const { t, formatNumber, labelPipelineStage, labelDealStage } = useI18n();
  const { data: report, error, loading } = useApiQuery<Report>(() => apiFetch(`/reports/overview?rangeDays=${rangeDays}`), [rangeDays], { cacheKey: `reports:${rangeDays}` });

  const stageCards = useMemo(() => report?.contactsByStage ?? [], [report]);
  const dealCards = useMemo(() => report?.dealsByStage ?? [], [report]);

  const exportContacts = async () => {
    try {
      const response = await fetch("/api/reports/contacts-export", { credentials: "include" });
      const csv = await response.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `contacts-export-${rangeDays}d.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify({ tone: "success", title: t("reports.exportReady"), description: t("reports.exportReadyDescription") });
    } catch (error) {
      notify({ tone: "error", title: t("reports.exportFailed"), description: error instanceof Error ? error.message : t("reports.exportFailedDescription") });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("reports.eyebrow")}
          title={t("reports.title")}
          description={t("reports.description")}
          actions={
            <div className="flex flex-wrap gap-3">
              <select value={rangeDays} onChange={(event) => setRangeDays(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700">
                <option value="7">{t("reports.last7Days")}</option>
                <option value="30">{t("reports.last30Days")}</option>
                <option value="90">{t("reports.last90Days")}</option>
              </select>
              <button onClick={() => void exportContacts()} className={buttonStyles("secondary")}>{t("reports.exportContacts")}</button>
            </div>
          }
        />

        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
        {loading && !report ? <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{t("reports.loading")}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("reports.openPipelineValue")} value={formatNumber(report?.metrics?.openPipelineValue ?? 0)} tone="sky" />
          <StatCard label={t("reports.wonValue")} value={formatNumber(report?.metrics?.wonValue ?? 0)} tone="emerald" />
          <StatCard label={t("reports.followUpRate")} value={report?.metrics?.followUpCompletionRate ?? 0} tone="amber" />
          <StatCard label={t("reports.overduePressure")} value={report?.metrics?.overduePressureScore ?? 0} helper={t("reports.overduePressureHint")} tone="rose" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card title={t("reports.executiveSummary")} description={t("reports.executiveSummaryDescription")}>
            <div className="grid gap-3 md:grid-cols-2">
              <MetricRow label={t("reports.activeContacts")} value={report?.metrics?.activeContactsCount ?? 0} />
              <MetricRow label={t("reports.newContactsDays", { days: rangeDays })} value={report?.metrics?.contactsCreatedInRange ?? 0} />
              <MetricRow label={t("reports.dealWinRate")} value={`${report?.metrics?.dealWinRate ?? 0}%`} />
              <MetricRow label={t("reports.averageWonDeal")} value={formatNumber(report?.metrics?.averageWonDealSize ?? 0)} />
              <MetricRow label={t("reports.tasksDueNext7d")} value={report?.metrics?.dueTasksNext7Days ?? 0} />
              <MetricRow label={t("reports.upcomingPaymentsValue")} value={formatNumber(report?.metrics?.upcomingPaymentsValue ?? 0)} />
            </div>
          </Card>

          <Card title={t("reports.attentionBoard")} description={t("reports.attentionBoardDescription")}>
            <div className="space-y-3">
              {(report?.attentionBoard ?? []).length ? (
                report?.attentionBoard.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className="text-lg font-semibold text-slate-900">{item.value}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full rounded-full ${toneClass(item.tone)}`} style={{ width: `${Math.max(8, Math.min(100, item.value * 8))}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title={t("reports.noAttentionData")} description={t("reports.noAttentionDataDescription")} />
              )}
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title={t("reports.stageCoverage")} description={t("reports.stageCoverageDescription")}>
            <div className="space-y-3">
              {(report?.stagePerformance ?? []).length ? (
                report?.stagePerformance.map((item) => (
                  <div key={item.stage} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium text-slate-700">{labelPipelineStage(item.stage)}</span>
                      <span className="font-semibold text-slate-900">{formatNumber(item.count)} · {item.share}%</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(item.share, 4)}%` }} />
                    </div>
                  </div>
                ))
              ) : <EmptyState title={t("reports.noContactStageData")} description={t("reports.noContactStageDataDescription")} />}
            </div>
          </Card>

          <Card title={t("reports.dealsByStage")} description={t("reports.dealsByStageDescription")}>
            <div className="space-y-3">
              {dealCards.length ? dealCards.map((item) => <MetricRow key={item.stage} label={labelDealStage(item.stage)} value={`${formatNumber(item._count.stage)} · ${formatNumber(item._sum.amount ?? 0)}`} />) : <EmptyState title={t("reports.noDealsYet")} description={t("reports.noDealsYetDescription")} />}
            </div>
          </Card>

          <Card title={t("reports.contactsBySource")} description={t("reports.contactsBySourceDescription")}>
            <div className="space-y-3">
              {(report?.contactsBySource ?? []).length ? (report?.contactsBySource ?? []).map((item) => <MetricRow key={item.source ?? "unknown"} label={item.source ?? t("reports.unknown")} value={formatNumber(item._count.source)} />) : <EmptyState title={t("reports.noSourceData")} description={t("reports.noSourceDataDescription")} />}
            </div>
          </Card>

          <Card title={t("reports.collectionsRisk")} description={t("reports.collectionsRiskDescription")}>
            <div className="space-y-3">
              <MetricRow label={t("reports.overduePaymentsCount")} value={report?.metrics?.overduePaymentsCount ?? 0} />
              <MetricRow label={t("reports.overduePaymentsValue")} value={formatNumber(report?.metrics?.overduePaymentsValue ?? 0)} />
              <MetricRow label={t("reports.staleContacts")} value={report?.metrics?.staleContactsCount ?? 0} />
              <MetricRow label={t("reports.noNextAction")} value={report?.metrics?.noNextActionCount ?? 0} />
            </div>
          </Card>
        </div>

        <Card title={t("reports.operationalInsights")} description={t("reports.operationalInsightsDescription")}>
          <div className="space-y-3">
            {(report?.insights ?? []).length ? (report?.insights ?? []).map((item, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">{item}</div>) : <EmptyState title={t("reports.noInsights")} description={t("reports.noInsightsDescription")} />}
          </div>
        </Card>

        <Card title={t("reports.rawDistributions")} description={t("reports.rawDistributionsDescription")}>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-3">
              {stageCards.length ? stageCards.map((item) => <MetricRow key={item.stage} label={labelPipelineStage(item.stage)} value={formatNumber(item._count.stage)} />) : <EmptyState title={t("reports.noContactStageData")} description={t("reports.noContactStageDataDescription")} />}
            </div>
            <div className="space-y-3">
              {dealCards.length ? dealCards.map((item) => <MetricRow key={item.stage} label={labelDealStage(item.stage)} value={`${formatNumber(item._count.stage)} · ${formatNumber(item._sum.amount ?? 0)}`} />) : <EmptyState title={t("reports.noDealsYet")} description={t("reports.noDealsYetDescription")} />}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}
