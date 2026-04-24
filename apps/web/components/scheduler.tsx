"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { FOLLOW_UP_COMPLETION_RESULTS } from "@smartcrm/shared";
import { Badge } from "@/components/cards";
import { useI18n } from "@/components/providers";
import { buttonStyles, CheckboxCard, Drawer, FieldShell, InfoTile, Input, ListRow, Select, Textarea } from "@/components/ui";
import { isoToLocalSchedule, nextLocalDate, nextLocalTime, schedulePartsToIso } from "@/components/workflows";

export type ScheduledItem = {
  id: string;
  source: "TASK" | "CONTACT";
  entityId: string;
  kind: string;
  title: string;
  dueAt: string | null;
  hasExactTime: boolean;
  durationMins?: number | null;
  priority?: string | null;
  status: string;
  ownerId?: string | null;
  ownerName?: string | null;
  note?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  company?: string | null;
  stage?: string | null;
  lastContactedAt?: string | null;
  reasons?: { missingSchedule?: boolean; stale?: boolean };
};

export function schedulePriorityTone(priority?: string | null) {
  if (priority === "HIGH") return "rose" as const;
  if (priority === "MEDIUM") return "amber" as const;
  if (priority === "LOW") return "sky" as const;
  return "slate" as const;
}

export function ScheduledItemRow({
  item,
  extraActions,
}: {
  item: ScheduledItem;
  actionLabel?: string;
  extraActions?: ReactNode;
}) {
  const { t, formatDateTime, labelPriority, labelTaskType } = useI18n();
  const badges = [] as Array<{ label: string; tone: "amber" | "slate" }>;
  if (item.reasons?.missingSchedule) badges.push({ label: t("scheduler.missingNextAction"), tone: "amber" });
  if (item.reasons?.stale) badges.push({ label: t("scheduler.staleLead"), tone: "slate" });

  return (
    <ListRow
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span>{item.title}</span>
          {item.priority ? <Badge tone={schedulePriorityTone(item.priority)}>{labelPriority(item.priority)}</Badge> : null}
          <Badge>{labelTaskType(item.kind)}</Badge>
          {badges.map((badge) => <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>)}
        </div>
      }
      subtitle={
        <div>
          <div>{item.contactName || t("common.noContact")}{item.company ? ` · ${item.company}` : ""}</div>
          <div className="mt-1 text-xs text-slate-500">
            {item.dueAt ? t(item.hasExactTime ? "scheduler.due" : "scheduler.planned", { value: formatDateTime(item.dueAt) }) : t("scheduler.notScheduled")}
            {item.durationMins ? ` · ${t("scheduler.minutesShort", { value: item.durationMins })}` : ""}
            {item.ownerName ? ` · ${item.ownerName}` : ""}
          </div>
          {item.note ? <div className="mt-2 text-sm text-slate-600">{item.note}</div> : null}
        </div>
      }
      actions={extraActions}
      highlighted={item.priority === "HIGH"}
    />
  );
}

export function RescheduleDrawer({
  open,
  onClose,
  item,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  item: ScheduledItem | null;
  busy?: boolean;
  onSubmit: (payload: { dueAt: string; hasExactTime: boolean }) => Promise<void> | void;
}) {
  const { t, formatDateTime } = useI18n();
  const defaults = useMemo(() => isoToLocalSchedule(item?.dueAt), [item?.dueAt]);
  const [dueDate, setDueDate] = useState(defaults.dueDate);
  const [dueTime, setDueTime] = useState(defaults.dueTime);
  const [hasExactTime, setHasExactTime] = useState(defaults.hasExactTime);

  useEffect(() => {
    if (!open) return;
    const next = isoToLocalSchedule(item?.dueAt);
    setDueDate(next.dueDate);
    setDueTime(next.dueTime);
    setHasExactTime(next.hasExactTime);
  }, [item?.dueAt, open]);

  const presets = useMemo(
    () => [
      { label: t("scheduler.after1Hour"), apply: () => {
        const date = new Date(Date.now() + 60 * 60 * 1000);
        setDueDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
        setDueTime(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
        setHasExactTime(true);
      } },
      { label: t("scheduler.today6pm"), apply: () => { setDueDate(nextLocalDate(0)); setDueTime("18:00"); setHasExactTime(true); } },
      { label: t("scheduler.tomorrow10am"), apply: () => { setDueDate(nextLocalDate(1)); setDueTime(nextLocalTime(10, 0)); setHasExactTime(true); } },
      { label: t("scheduler.nextWeek"), apply: () => { setDueDate(nextLocalDate(7)); setDueTime(nextLocalTime(10, 0)); setHasExactTime(true); } },
    ],
    [t],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({ dueAt: schedulePartsToIso({ dueDate, dueTime, hasExactTime }), hasExactTime });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={t("scheduler.plannerEyebrow")}
      title={t("scheduler.rescheduleTitle")}
      description={item ? t("scheduler.rescheduleDescription", { title: item.title }) : t("scheduler.rescheduleFallback")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {item ? (
          <div className="grid gap-3 md:grid-cols-2">
            <InfoTile label={t("common.contact")} value={item.contactName || t("common.noContact")} />
            <InfoTile label={t("common.currentSlot")} value={formatDateTime(item.dueAt)} />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button key={preset.label} type="button" onClick={preset.apply} className={buttonStyles("secondary", "sm")}>{preset.label}</button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldShell label={t("common.date")}>
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
          </FieldShell>
          <FieldShell label={t("common.time")}>
            <Input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} disabled={!hasExactTime} />
          </FieldShell>
        </div>

        <CheckboxCard checked={hasExactTime} onChange={setHasExactTime} label={t("scheduler.useExactTime")} hint={t("scheduler.useExactTimeHint")} />

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !dueDate} className={buttonStyles("primary")}>{busy ? t("common.saving") : t("scheduler.save")}</button>
          <button type="button" onClick={onClose} className={buttonStyles("secondary")}>{t("common.cancel")}</button>
        </div>
      </form>
    </Drawer>
  );
}

export function CompletionDrawer({
  open,
  onClose,
  item,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  item: ScheduledItem | null;
  busy?: boolean;
  onSubmit: (payload: { result?: string }) => Promise<void> | void;
}) {
  const { t, labelCompletionResult } = useI18n();
  const completionOptions = useMemo(() => FOLLOW_UP_COMPLETION_RESULTS.map((value) => ({ value, label: labelCompletionResult(value) })), [labelCompletionResult]);
  const [result, setResult] = useState("DONE");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setResult("DONE");
    setNotes("");
  }, [open, item?.id]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const finalResult = [labelCompletionResult(result), notes.trim()].filter(Boolean).join(" · ");
    await onSubmit({ result: finalResult || undefined });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={t("scheduler.completionEyebrow")}
      title={t("scheduler.completionTitle")}
      description={item ? t("scheduler.completionDescription", { name: item.contactName || item.title }) : t("scheduler.completionFallback")}
      widthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldShell label={t("common.result")}>
          <Select value={result} onChange={(event) => setResult(event.target.value)}>
            {completionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </FieldShell>

        <FieldShell label={t("scheduler.completionNote")} hint={t("scheduler.completionNoteHint")}>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("scheduler.completionPlaceholder")} />
        </FieldShell>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy} className={buttonStyles("primary")}>{busy ? t("common.saving") : t("scheduler.complete")}</button>
          <button type="button" onClick={onClose} className={buttonStyles("secondary")}>{t("common.cancel")}</button>
        </div>
      </form>
    </Drawer>
  );
}
