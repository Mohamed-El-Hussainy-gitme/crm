export type TimelineTone = "slate" | "sky" | "emerald" | "amber" | "rose";

export type NoteLike = { id: string; body: string; createdAt: string };
export type CallLike = { id: string; outcome: string; durationMins: number; summary: string; createdAt: string };
export type TaskLike = { id: string; title: string; dueAt: string; status: string; priority: string; type: string; createdAt?: string };
export type PaymentLike = { id: string; label: string; amount: number; dueDate: string; status: string; paidAt?: string | null; createdAt?: string };
export type DealLike = { id: string; title: string; amount: number; stage: string; probability: number; createdAt?: string; updatedAt?: string };
export type ActivityLike = { id: string; kind?: string; type?: string; createdAt: string; meta?: Record<string, unknown> | null; metadata?: Record<string, unknown> | null };

export type TimelineItem = {
  id: string;
  at: string;
  kind: string;
  title: string;
  body?: string;
  tone: TimelineTone;
};

export type TimelinePayload = {
  notes?: NoteLike[];
  calls?: CallLike[];
  tasks?: TaskLike[];
  payments?: PaymentLike[];
  deals?: DealLike[];
  activities?: ActivityLike[];
  createdAt: string;
};

export type TimelineOptions = {
  formatDateTime?: (value?: string | number | Date | null, fallback?: string) => string;
  formatCurrency?: (value?: string | number | null) => string;
  labelTaskType?: (value?: string | null) => string;
  labelPriority?: (value?: string | null) => string;
  labelStatus?: (value?: string | null) => string;
  labelDealStage?: (value?: string | null) => string;
  humanize?: (value?: string | null) => string;
  labels?: Partial<{
    noteAdded: string;
    callSuffix: string;
    duePrefix: string;
    paidPrefix: string;
    probabilitySuffix: string;
  }>;
};

function defaultHumanize(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

function stringifyMetadata(metadata?: Record<string, unknown> | null, humanize = defaultHumanize) {
  if (!metadata) return "";
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${humanize(key)}: ${String(value)}`)
    .join(" · ");
}

export function buildContactTimeline(payload: TimelinePayload, options: TimelineOptions = {}): TimelineItem[] {
  const items: TimelineItem[] = [];
  const now = Date.now();
  const formatDateTime = options.formatDateTime ?? ((value, fallback) => {
    if (!value) return fallback ?? "—";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? fallback ?? "—" : date.toLocaleString();
  });
  const formatCurrency = options.formatCurrency ?? ((value) => Number(value || 0).toLocaleString());
  const humanize = options.humanize ?? defaultHumanize;
  const labelTaskType = options.labelTaskType ?? humanize;
  const labelPriority = options.labelPriority ?? humanize;
  const labelStatus = options.labelStatus ?? humanize;
  const labelDealStage = options.labelDealStage ?? humanize;
  const labels = {
    noteAdded: options.labels?.noteAdded ?? "Note added",
    callSuffix: options.labels?.callSuffix ?? "call",
    duePrefix: options.labels?.duePrefix ?? "due",
    paidPrefix: options.labels?.paidPrefix ?? "Paid",
    probabilitySuffix: options.labels?.probabilitySuffix ?? "probability",
  };

  for (const entry of payload.notes ?? []) {
    items.push({ id: `note-${entry.id}`, at: entry.createdAt, kind: "NOTE", title: labels.noteAdded, body: entry.body, tone: "slate" });
  }

  for (const call of payload.calls ?? []) {
    items.push({
      id: `call-${call.id}`,
      at: call.createdAt,
      kind: "CALL",
      title: `${call.outcome} ${labels.callSuffix}`,
      body: `${call.summary} · ${call.durationMins} min`,
      tone: "sky",
    });
  }

  for (const task of payload.tasks ?? []) {
    const overdue = task.status === "PENDING" && new Date(task.dueAt).getTime() < now;
    items.push({
      id: `task-${task.id}`,
      at: task.createdAt || task.dueAt,
      kind:
        task.status === "COMPLETED"
          ? "TASK_COMPLETED"
          : task.status === "CANCELLED"
            ? "TASK_CANCELLED"
            : "TASK_CREATED",
      title: task.title,
      body: `${labelTaskType(task.type)} · ${labelPriority(task.priority)} · ${labels.duePrefix} ${formatDateTime(task.dueAt)}`,
      tone: task.status === "COMPLETED" ? "emerald" : overdue ? "rose" : "amber",
    });
  }

  for (const payment of payload.payments ?? []) {
    const overdue = payment.status !== "PAID" && new Date(payment.dueDate).getTime() < now;
    items.push({
      id: `payment-${payment.id}`,
      at: payment.paidAt || payment.createdAt || payment.dueDate,
      kind: payment.status === "PAID" ? "PAYMENT_PAID" : "PAYMENT_SCHEDULED",
      title: payment.label,
      body: `${formatCurrency(payment.amount)} · ${labelStatus(payment.status)} · ${labels.duePrefix} ${formatDateTime(payment.dueDate)}`,
      tone: payment.status === "PAID" ? "emerald" : overdue ? "rose" : "amber",
    });
  }

  for (const deal of payload.deals ?? []) {
    const tone: TimelineTone = deal.stage === "WON" ? "emerald" : deal.stage === "LOST" ? "rose" : deal.stage === "ON_HOLD" ? "amber" : "sky";
    items.push({
      id: `deal-${deal.id}`,
      at: deal.updatedAt || deal.createdAt || payload.createdAt,
      kind: "DEAL",
      title: deal.title,
      body: `${labelDealStage(deal.stage)} · ${formatCurrency(deal.amount)} · ${deal.probability}% ${labels.probabilitySuffix}`,
      tone,
    });
  }

  for (const activity of payload.activities ?? []) {
    const kind = activity.kind || activity.type || "ACTIVITY";
    items.push({
      id: `activity-${activity.id}`,
      at: activity.createdAt,
      kind,
      title: humanize(kind),
      body: stringifyMetadata(activity.meta || activity.metadata || null, humanize) || undefined,
      tone: "slate",
    });
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
}
