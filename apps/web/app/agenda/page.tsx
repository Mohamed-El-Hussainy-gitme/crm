"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/layout";
import { useI18n } from "@/components/providers";
import { Card, EmptyState, PageHeader } from "@/components/cards";
import { buttonStyles, Select } from "@/components/ui";
import { type ScheduledItem } from "@/components/scheduler";
import { apiFetch } from "@/lib/api";
import { useApiQuery } from "@/lib/query";

type AgendaResponse = {
  from: string;
  to: string;
  view: "day" | "week";
  total: number;
  events: Array<ScheduledItem & { when: string; source: "TASK" | "CONTACT" | "PAYMENT"; amount?: number }>;
  days: Array<{
    key: string;
    label: string;
    slots: Array<ScheduledItem & { when: string; source: "TASK" | "CONTACT" | "PAYMENT"; amount?: number }>;
  }>;
};

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function buildRange(view: "day" | "week", anchor: string) {
  const anchorDate = startOfDay(new Date(`${anchor}T12:00:00`));
  if (view === "day") {
    return {
      from: startOfDay(anchorDate).toISOString(),
      to: endOfDay(anchorDate).toISOString(),
    };
  }
  const from = startOfWeek(anchorDate);
  const to = endOfDay(addDays(from, 6));
  return { from: from.toISOString(), to: to.toISOString() };
}

function InputDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" />;
}

function DayTimeline({ day }: { day?: AgendaResponse["days"][number] }) {
  const { t, formatTime, labelTaskType } = useI18n();
  if (!day) {
    return <EmptyState title={t("agenda.noDaySelected")} description={t("agenda.noDaySelectedDescription")} />;
  }

  const allDay = day.slots.filter((item) => !item.hasExactTime);
  const timed = day.slots.filter((item) => item.hasExactTime);
  const hours = Array.from({ length: 15 }, (_, index) => index + 8);

  return (
    <Card title={day.label} description={t("agenda.dailyTimelineDescription")}>
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{t("agenda.allDay")}</h3>
          <div className="space-y-3">
            {allDay.length ? allDay.map((item) => <TimelineEvent key={item.id} item={item} compact />) : <p className="text-sm text-slate-500">{t("agenda.noDateItems")}</p>}
          </div>
        </div>

        <div className="space-y-2">
          {hours.map((hour) => {
            const matching = timed.filter((item) => new Date(item.when).getHours() === hour);
            const hourDate = new Date();
            hourDate.setHours(hour, 0, 0, 0);
            return (
              <div key={hour} className="grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-[120px_minmax(0,1fr)]">
                <div className="text-sm font-medium text-slate-500">{formatTime(hourDate)}</div>
                <div className="space-y-3">
                  {matching.length ? matching.map((item) => <TimelineEvent key={item.id} item={item} />) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">{t("agenda.openSlot")}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function WeekPlanner({ days }: { days: AgendaResponse["days"] }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 xl:grid-cols-7">
      {days.map((day) => (
        <Card key={day.key} title={day.label} className="h-full">
          <div className="space-y-3">
            {day.slots.length ? day.slots.map((item) => <TimelineEvent key={item.id} item={item} compact />) : <p className="text-sm text-slate-500">{t("agenda.noScheduledWork")}</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function TimelineEvent({ item, compact = false }: { item: AgendaResponse["events"][number]; compact?: boolean }) {
  const { t, formatTime, formatCurrency, labelTaskType } = useI18n();
  const date = new Date(item.when);
  const eventTime = Number.isNaN(date.getTime()) ? t("common.noDate") : !item.hasExactTime ? t("agenda.allDay") : formatTime(date);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{item.title}</p>
          <p className="mt-1 text-xs text-slate-500">{labelTaskType(item.kind)} · {eventTime}</p>
          <p className="mt-1 text-sm text-slate-600">{item.contactName || t("common.noContact")}</p>
          {!compact && item.amount ? <p className="mt-1 text-sm text-slate-500">{t("agenda.amount", { value: formatCurrency(item.amount) })}</p> : null}
        </div>
        {item.contactId ? <Link href={`/contacts/${item.contactId}` as Route} className={buttonStyles("secondary", "sm")}>{t("common.open")}</Link> : null}
      </div>
    </div>
  );
}

export default function AgendaPage() {
  const { t } = useI18n();
  const [view, setView] = useState<"day" | "week">("week");
  const [anchor, setAnchor] = useState(() => toDateInput(new Date()));
  const range = useMemo(() => buildRange(view, anchor), [anchor, view]);
  const query = useApiQuery<AgendaResponse>(
    () => apiFetch(`/agenda?view=${view}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
    [range.from, range.to, view],
    { cacheKey: `agenda:${view}:${anchor}` },
  );

  const shift = (days: number) => {
    const base = new Date(`${anchor}T12:00:00`);
    base.setDate(base.getDate() + days);
    setAnchor(toDateInput(base));
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("agenda.eyebrow")}
          title={t("agenda.title")}
          description={t("agenda.description")}
          actions={
            <>
              <Link href={"/today" as Route} className={buttonStyles("secondary")}>{t("agenda.todayBoard")}</Link>
              <Link href={"/follow-ups" as Route} className={buttonStyles("primary")}>{t("agenda.followUpCenter")}</Link>
            </>
          }
        />

        <Card title={t("agenda.controls")} action={<span className="text-sm text-slate-500">{t("agenda.itemsCount", { count: query.data?.total ?? 0 })}</span>}>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => shift(view === "day" ? -1 : -7)} className={buttonStyles("secondary", "sm")}>{t("agenda.previous")}</button>
            <InputDate value={anchor} onChange={setAnchor} />
            <button type="button" onClick={() => setAnchor(toDateInput(new Date()))} className={buttonStyles("secondary", "sm")}>{t("agenda.jumpToday")}</button>
            <button type="button" onClick={() => shift(view === "day" ? 1 : 7)} className={buttonStyles("secondary", "sm")}>{t("agenda.next")}</button>
            <Select value={view} onChange={(event) => setView(event.target.value as "day" | "week")} className="min-w-[140px]">
              <option value="day">{t("agenda.dayView")}</option>
              <option value="week">{t("agenda.weekView")}</option>
            </Select>
          </div>
        </Card>

        {query.error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{query.error}</p> : null}

        {!query.data?.events.length ? (
          <EmptyState title={t("agenda.nothingScheduled")} description={t("agenda.nothingScheduledDescription")} />
        ) : view === "day" ? (
          <DayTimeline day={query.data.days[0]} />
        ) : (
          <WeekPlanner days={query.data.days} />
        )}
      </div>
    </AppShell>
  );
}
