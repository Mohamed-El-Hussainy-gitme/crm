import { prisma } from "./prisma.js";

export type ScheduledTaskRecord = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  dueAt: Date;
  hasExactTime: boolean;
  durationMins: number | null;
  ownerId: string | null;
  owner?: { fullName: string } | null;
  contactId: string | null;
  contact?: {
    id: string;
    fullName: string;
    company: string | null;
    stage: string;
  } | null;
};

export type ScheduledContactRecord = {
  id: string;
  fullName: string;
  company: string | null;
  stage: string;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  ownerId: string | null;
  owner?: { fullName: string } | null;
};

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

export function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
}

export function endOfWeek(date: Date) {
  return endOfDay(addDays(startOfWeek(date), 6));
}

export function isOverdueAt(dueAt: Date, now = new Date()) {
  return dueAt.getTime() < startOfDay(now).getTime();
}

export function serializeScheduledTask(task: ScheduledTaskRecord) {
  return {
    id: task.id,
    source: "TASK" as const,
    entityId: task.id,
    kind: task.type,
    title: task.title,
    dueAt: task.dueAt.toISOString(),
    hasExactTime: task.hasExactTime,
    durationMins: task.durationMins,
    priority: task.priority,
    status: task.status,
    ownerId: task.ownerId,
    ownerName: task.owner?.fullName ?? null,
    note: task.description,
    contactId: task.contactId,
    contactName: task.contact?.fullName ?? null,
    company: task.contact?.company ?? null,
    stage: task.contact?.stage ?? null,
  };
}

export function serializeScheduledContact(contact: ScheduledContactRecord, reason: { missingSchedule?: boolean; stale?: boolean } = {}) {
  return {
    id: `contact_${contact.id}`,
    source: "CONTACT" as const,
    entityId: contact.id,
    kind: "FOLLOW_UP" as const,
    title: `Follow up with ${contact.fullName}`,
    dueAt: contact.nextFollowUpAt?.toISOString() ?? null,
    hasExactTime: false,
    durationMins: null,
    priority: "MEDIUM" as const,
    status: "PENDING" as const,
    ownerId: contact.ownerId,
    ownerName: contact.owner?.fullName ?? null,
    note: null,
    contactId: contact.id,
    contactName: contact.fullName,
    company: contact.company,
    stage: contact.stage,
    lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
    reasons: {
      missingSchedule: Boolean(reason.missingSchedule),
      stale: Boolean(reason.stale),
    },
  };
}


export type ScheduledTaskItem = ReturnType<typeof serializeScheduledTask>;
export type ScheduledContactItem = ReturnType<typeof serializeScheduledContact>;
export type ScheduledPlannerItem = ScheduledTaskItem | ScheduledContactItem;

export async function loadOrphanScheduledContacts(from: Date, to: Date) {
  return prisma.contact.findMany({
    where: {
      nextFollowUpAt: { gte: from, lte: to },
      tasks: {
        none: {
          status: "PENDING",
          dueAt: { gte: from, lte: to },
          type: { in: ["FOLLOW_UP", "CALL", "WHATSAPP", "MEETING", "GENERAL"] },
        },
      },
    },
    include: { owner: { select: { fullName: true } } },
    orderBy: { nextFollowUpAt: "asc" },
  });
}

export async function loadScheduleWindow(from: Date, to: Date) {
  const [tasks, payments, contacts] = await Promise.all([
    prisma.task.findMany({
      where: { dueAt: { gte: from, lte: to } },
      include: {
        contact: { select: { id: true, fullName: true, company: true, stage: true } },
        owner: { select: { fullName: true } },
      },
      orderBy: { dueAt: "asc" },
    }),
    prisma.paymentInstallment.findMany({
      where: { dueDate: { gte: from, lte: to } },
      include: { contact: true },
      orderBy: { dueDate: "asc" },
    }),
    loadOrphanScheduledContacts(from, to),
  ]);

  return { tasks, payments, contacts };
}

export async function loadPlannerOverview(staleDays = 3) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const tomorrowEnd = endOfDay(addDays(now, 1));
  const weekEnd = endOfWeek(now);
  const staleBefore = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);

  const [tasks, paymentAlerts, noNextAction, staleContacts, orphanToday, orphanTomorrow, orphanWeek] = await Promise.all([
    prisma.task.findMany({
      where: { status: "PENDING", dueAt: { lte: weekEnd } },
      include: {
        contact: { select: { id: true, fullName: true, company: true, stage: true } },
        owner: { select: { fullName: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 300,
    }),
    prisma.paymentInstallment.findMany({
      where: { OR: [{ status: "OVERDUE" }, { status: "PENDING", dueDate: { lt: now } }] },
      include: { contact: true },
      orderBy: { dueDate: "asc" },
      take: 100,
    }),
    prisma.contact.findMany({
      where: {
        stage: { notIn: ["CLIENT", "LOST"] },
        OR: [{ nextFollowUpAt: null }, { tasks: { none: { status: "PENDING" } } }],
      },
      include: { owner: { select: { fullName: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.contact.findMany({
      where: {
        stage: { notIn: ["CLIENT", "LOST"] },
        OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: staleBefore } }],
      },
      include: { owner: { select: { fullName: true } } },
      orderBy: { lastContactedAt: "asc" },
      take: 100,
    }),
    loadOrphanScheduledContacts(todayStart, todayEnd),
    loadOrphanScheduledContacts(tomorrowStart, tomorrowEnd),
    loadOrphanScheduledContacts(addDays(tomorrowEnd, 1), weekEnd),
  ]);

  const overdue: ScheduledPlannerItem[] = tasks.filter((task) => task.dueAt < todayStart).map(serializeScheduledTask);
  const today: ScheduledPlannerItem[] = [
    ...tasks
      .filter((task) => task.dueAt >= todayStart && task.dueAt <= todayEnd)
      .map(serializeScheduledTask),
    ...orphanToday.map((contact) => serializeScheduledContact(contact)),
  ];
  const tomorrow: ScheduledPlannerItem[] = [
    ...tasks
      .filter((task) => task.dueAt >= tomorrowStart && task.dueAt <= tomorrowEnd)
      .map(serializeScheduledTask),
    ...orphanTomorrow.map((contact) => serializeScheduledContact(contact)),
  ];
  const thisWeek: ScheduledPlannerItem[] = [
    ...tasks
      .filter((task) => task.dueAt > tomorrowEnd && task.dueAt <= weekEnd)
      .map(serializeScheduledTask),
    ...orphanWeek.map((contact) => serializeScheduledContact(contact)),
  ];

  const unscheduledMap = new Map<string, ReturnType<typeof serializeScheduledContact>>();
  for (const contact of noNextAction) {
    unscheduledMap.set(contact.id, serializeScheduledContact(contact, { missingSchedule: true }));
  }
  for (const contact of staleContacts) {
    const existing = unscheduledMap.get(contact.id);
    if (existing) {
      existing.reasons.stale = true;
      existing.lastContactedAt = contact.lastContactedAt?.toISOString() ?? null;
      continue;
    }
    unscheduledMap.set(contact.id, serializeScheduledContact(contact, { stale: true }));
  }

  return {
    generatedAt: now.toISOString(),
    counts: {
      overdue: overdue.length,
      today: today.length,
      tomorrow: tomorrow.length,
      thisWeek: thisWeek.length,
      unscheduled: unscheduledMap.size,
      paymentAlerts: paymentAlerts.length,
      dueToday: today.filter((item) => item.source === "TASK").length,
      overdueTasks: overdue.length,
      noNextAction: noNextAction.length,
      staleContacts: staleContacts.length,
    },
    overdue,
    today,
    tomorrow,
    thisWeek,
    unscheduled: Array.from(unscheduledMap.values()),
    paymentAlerts,
    dueToday: today.filter((item) => item.source === "TASK"),
    overdueTasks: overdue,
    noNextAction: noNextAction.map((contact) => serializeScheduledContact(contact, { missingSchedule: true })),
    staleContacts: staleContacts.map((contact) => serializeScheduledContact(contact, { stale: true })),
  };
}

export { endOfDay, startOfDay };
