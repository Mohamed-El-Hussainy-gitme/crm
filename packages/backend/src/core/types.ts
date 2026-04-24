export type UserRole = "VIEWER" | "SALES_REP" | "SALES_MANAGER" | "ADMIN";

export type ContactStage = "LEAD" | "INTERESTED" | "POTENTIAL" | "VISIT" | "FREE_TRIAL" | "CLIENT" | "ON_HOLD" | "LOST";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type TaskType = "FOLLOW_UP" | "CALL" | "WHATSAPP" | "MEETING" | "PAYMENT" | "GENERAL";
export type TaskStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type DealStage = "NEW" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST" | "ON_HOLD";
export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE";
export type BroadcastStatus = "DRAFT" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
export type MessageDirection = "INBOUND" | "OUTBOUND";

export type CompanyRow = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  phone: string;
  normalizedPhone: string | null;
  email: string | null;
  source: string | null;
  company: string | null;
  locationText: string | null;
  area: string | null;
  mapUrl: string | null;
  placeLabel: string | null;
  companyId: string | null;
  stage: ContactStage;
  expectedDealValue: number;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  isWhatsappOptedIn: boolean;
  tags: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteRow = {
  id: string;
  contactId: string;
  body: string;
  createdAt: string;
};

export type TaskRow = {
  id: string;
  contactId: string | null;
  ownerId: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string;
  hasExactTime: boolean;
  durationMins: number | null;
  completionResult: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CallLogRow = {
  id: string;
  contactId: string;
  outcome: string;
  durationMins: number;
  summary: string;
  createdAt: string;
};

export type PaymentRow = {
  id: string;
  contactId: string;
  label: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
};

export type DealRow = {
  id: string;
  contactId: string;
  companyId: string | null;
  ownerId: string | null;
  title: string;
  stage: DealStage;
  amount: number;
  probability: number;
  expectedCloseAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityRow = {
  id: string;
  contactId: string;
  kind: string;
  meta: unknown;
  createdAt: string;
};

export type UserProfileRow = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole | string;
};

export type BroadcastRow = {
  id: string;
  name: string;
  description: string | null;
  templateName: string | null;
  content: string;
  filters: unknown;
  status: BroadcastStatus;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BroadcastAudienceRow = {
  id: string;
  broadcastId: string;
  contactId: string;
  deliveryNote: string | null;
  sentAt: string | null;
  replyAt: string | null;
  failedAt: string | null;
};

export type WhatsappConversationRow = {
  id: string;
  contactId: string;
  createdAt: string;
  updatedAt: string;
};

export type WhatsappMessageRow = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  content: string;
  externalId: string | null;
  createdAt: string;
};

export type AppSettingRow = {
  id: string;
  key: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogRow = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type AutomationRunRow = {
  id: string;
  kind: string;
  status: string;
  summary: string;
  meta: unknown;
  createdAt: string;
};
