"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { quickFollowUpSchema } from "@smartcrm/shared";
import { useI18n } from "@/components/providers";
import {
  buttonStyles,
  CheckboxCard,
  Drawer,
  FieldShell,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { validateSchema } from "@/lib/forms";

export type FollowUpPriority = "LOW" | "MEDIUM" | "HIGH";
export type FollowUpType = "FOLLOW_UP" | "CALL" | "WHATSAPP" | "MEETING" | "PAYMENT" | "GENERAL";

export type FollowUpInput = {
  title: string;
  dueAt: string;
  description?: string;
  priority: FollowUpPriority;
  type: FollowUpType;
  hasExactTime: boolean;
  durationMins?: number;
};

const priorities: FollowUpPriority[] = ["LOW", "MEDIUM", "HIGH"];
const followUpTypes: FollowUpType[] = ["FOLLOW_UP", "CALL", "WHATSAPP", "MEETING", "PAYMENT", "GENERAL"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function nextLocalDatetime(offsetDays = 1) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function localInputToIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function isoToLocalInput(value?: string | null, fallbackDays = 1) {
  if (!value) return nextLocalDatetime(fallbackDays);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return nextLocalDatetime(fallbackDays);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function nextLocalDate(offsetDays = 0) {
  return toDateValue(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

export function nextLocalTime(hours = 10, minutes = 0) {
  return `${pad(hours)}:${pad(minutes)}`;
}

export function isoToLocalSchedule(value?: string | null) {
  if (!value) {
    return { dueDate: nextLocalDate(1), dueTime: nextLocalTime(10, 0), hasExactTime: true };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { dueDate: nextLocalDate(1), dueTime: nextLocalTime(10, 0), hasExactTime: true };
  }

  return {
    dueDate: toDateValue(date),
    dueTime: toTimeValue(date),
    hasExactTime: !(date.getHours() === 12 && date.getMinutes() === 0),
  };
}

export function schedulePartsToIso(input: { dueDate: string; dueTime?: string; hasExactTime: boolean }) {
  const time = input.hasExactTime ? input.dueTime || "10:00" : "12:00";
  const date = new Date(`${input.dueDate}T${time}`);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function nextWeekStartDate() {
  const now = new Date();
  const candidate = new Date(now);
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  candidate.setDate(now.getDate() + daysUntilMonday);
  candidate.setHours(10, 0, 0, 0);
  return candidate;
}

export function personalizeTemplate(template: string, contactName?: string | null) {
  return template.replaceAll("{{name}}", contactName || "there");
}

export function FollowUpDrawer({
  open,
  onClose,
  contactLabel,
  defaultTitle,
  defaultDescription,
  defaultDueAt,
  defaultPriority = "HIGH",
  defaultType = "FOLLOW_UP",
  defaultDurationMins,
  busy = false,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  contactLabel?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultDueAt?: string;
  defaultPriority?: FollowUpPriority;
  defaultType?: FollowUpType;
  defaultDurationMins?: number;
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (payload: FollowUpInput) => Promise<void> | void;
}) {
  const { t, labelTaskType, labelPriority } = useI18n();
  const defaultSchedule = useMemo(() => isoToLocalSchedule(defaultDueAt), [defaultDueAt]);
  const [title, setTitle] = useState(defaultTitle || "");
  const [dueDate, setDueDate] = useState(defaultSchedule.dueDate);
  const [dueTime, setDueTime] = useState(defaultSchedule.dueTime);
  const [hasExactTime, setHasExactTime] = useState(defaultSchedule.hasExactTime);
  const [priority, setPriority] = useState<FollowUpPriority>(defaultPriority);
  const [type, setType] = useState<FollowUpType>(defaultType);
  const [durationMins, setDurationMins] = useState(String(defaultDurationMins ?? 15));
  const [description, setDescription] = useState(defaultDescription || "");
  const [validationError, setValidationError] = useState("");

  const presets = useMemo(
    () => [
      {
        label: t("scheduler.after1Hour"),
        apply: () => {
          const date = new Date(Date.now() + 60 * 60 * 1000);
          setDueDate(toDateValue(date));
          setDueTime(toTimeValue(date));
          setHasExactTime(true);
        },
      },
      {
        label: t("scheduler.today6pm"),
        apply: () => {
          const date = new Date();
          date.setHours(18, 0, 0, 0);
          setDueDate(toDateValue(date));
          setDueTime("18:00");
          setHasExactTime(true);
        },
      },
      {
        label: t("scheduler.tomorrow10am"),
        apply: () => {
          const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
          date.setHours(10, 0, 0, 0);
          setDueDate(toDateValue(date));
          setDueTime("10:00");
          setHasExactTime(true);
        },
      },
      {
        label: t("scheduler.nextWeekStart"),
        apply: () => {
          const date = nextWeekStartDate();
          setDueDate(toDateValue(date));
          setDueTime("10:00");
          setHasExactTime(true);
        },
      },
    ],
    [t],
  );

  useEffect(() => {
    if (!open) return;
    const schedule = isoToLocalSchedule(defaultDueAt);
    setTitle(defaultTitle || "");
    setDueDate(schedule.dueDate);
    setDueTime(schedule.dueTime);
    setHasExactTime(schedule.hasExactTime);
    setPriority(defaultPriority);
    setType(defaultType);
    setDurationMins(String(defaultDurationMins ?? 15));
    setDescription(defaultDescription || "");
    setValidationError("");
  }, [defaultDescription, defaultDueAt, defaultDurationMins, defaultPriority, defaultTitle, defaultType, open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const dueAt = schedulePartsToIso({ dueDate, dueTime, hasExactTime });
    const parsed = validateSchema(quickFollowUpSchema, {
      title: title.trim(),
      dueAt,
      description: description.trim() || undefined,
      priority,
      type,
      hasExactTime,
      durationMins: durationMins ? Number(durationMins) : undefined,
    });
    if (!parsed.success) {
      setValidationError(parsed.error.message);
      return;
    }
    setValidationError("");
    await onSubmit({
      ...parsed.data,
      priority: parsed.data.priority ?? "MEDIUM",
      type: parsed.data.type ?? "FOLLOW_UP",
      hasExactTime: parsed.data.hasExactTime ?? false,
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("workflows.scheduleFollowUp")}
      description={contactLabel ? t("workflows.scheduleDescription", { name: contactLabel }) : t("workflows.scheduleFallback")}
      eyebrow={t("workflows.schedulerEyebrow")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FieldShell label={t("common.title")}>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Follow up on proposal" required />
        </FieldShell>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldShell label={t("workflows.followUpType")}>
            <Select value={type} onChange={(event) => setType(event.target.value as FollowUpType)}>
              {followUpTypes.map((option) => (
                <option key={option} value={option}>{labelTaskType(option)}</option>
              ))}
            </Select>
          </FieldShell>
          <FieldShell label={t("common.priority")}>
            <Select value={priority} onChange={(event) => setPriority(event.target.value as FollowUpPriority)}>
              {priorities.map((value) => (
                <option key={value} value={value}>{labelPriority(value)}</option>
              ))}
            </Select>
          </FieldShell>
        </div>

        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button key={preset.label} type="button" onClick={preset.apply} className={buttonStyles("secondary", "sm")}>{preset.label}</button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FieldShell label={t("workflows.dueDate")}>
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
          </FieldShell>
          <FieldShell label={t("workflows.durationMins")} hint={t("workflows.durationHint")}>
            <Input type="number" min={5} max={480} step={5} value={durationMins} onChange={(event) => setDurationMins(event.target.value)} />
          </FieldShell>
          <FieldShell label={t("common.time")}>
            <Input type="time" value={dueTime} disabled={!hasExactTime} onChange={(event) => setDueTime(event.target.value)} />
          </FieldShell>
        </div>

        <CheckboxCard checked={hasExactTime} onChange={setHasExactTime} label={t("scheduler.useExactTime")} hint={t("scheduler.useExactTimeHint")} />

        <FieldShell label={t("workflows.context")} hint={t("workflows.contextHint")}>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("workflows.contextPlaceholder")} />
        </FieldShell>

        {validationError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{validationError}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !title.trim() || !dueDate} className={buttonStyles("primary")}>{busy ? t("common.saving") : submitLabel || t("workflows.scheduleFollowUp")}</button>
          <button type="button" onClick={onClose} className={buttonStyles("secondary")}>{t("common.cancel")}</button>
        </div>
      </form>
    </Drawer>
  );
}
