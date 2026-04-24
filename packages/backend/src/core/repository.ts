import type { BackendEnv } from "../app.js";
import { createPostgrestClient, type PostgrestFilter, type PostgrestOrder } from "../db/postgrest.js";
import type {
  ActivityRow,
  AppSettingRow,
  AuditLogRow,
  AutomationRunRow,
  BroadcastAudienceRow,
  BroadcastRow,
  CallLogRow,
  CompanyRow,
  ContactRow,
  DealRow,
  NoteRow,
  PaymentRow,
  TaskRow,
  UserProfileRow,
  WhatsappConversationRow,
  WhatsappMessageRow,
} from "./types.js";

export class CoreRepository {
  private readonly db;

  constructor(env: BackendEnv) {
    this.db = createPostgrestClient(env);
  }

  contacts(filters: PostgrestFilter[] = [], order: PostgrestOrder[] = [{ column: "createdAt", ascending: false }], limit = 1000) {
    return this.db.select<ContactRow>("Contact", { filters, order, limit });
  }

  contactById(id: string) {
    return this.db.maybeSingle<ContactRow>("Contact", { filters: [{ column: "id", value: id }], limit: 1 });
  }

  createContact(value: Record<string, unknown>) {
    return this.db.insert<ContactRow>("Contact", value);
  }

  updateContact(id: string, value: Record<string, unknown>) {
    return this.db.updateSingle<ContactRow>("Contact", [{ column: "id", value: id }], value);
  }

  companies(filters: PostgrestFilter[] = [], order: PostgrestOrder[] = [{ column: "updatedAt", ascending: false }], limit = 1000) {
    return this.db.select<CompanyRow>("Company", { filters, order, limit });
  }

  companyById(id: string) {
    return this.db.maybeSingle<CompanyRow>("Company", { filters: [{ column: "id", value: id }], limit: 1 });
  }

  companyByName(name: string) {
    return this.db.maybeSingle<CompanyRow>("Company", { filters: [{ column: "name", value: name }], limit: 1 });
  }

  createCompany(value: Record<string, unknown>) {
    return this.db.insert<CompanyRow>("Company", value);
  }

  updateCompany(id: string, value: Record<string, unknown>) {
    return this.db.updateSingle<CompanyRow>("Company", [{ column: "id", value: id }], value);
  }

  tasks(filters: PostgrestFilter[] = [], order: PostgrestOrder[] = [{ column: "status", ascending: true }, { column: "dueAt", ascending: true }], limit = 1000) {
    return this.db.select<TaskRow>("Task", { filters, order, limit });
  }

  taskById(id: string) {
    return this.db.maybeSingle<TaskRow>("Task", { filters: [{ column: "id", value: id }], limit: 1 });
  }

  createTask(value: Record<string, unknown>) {
    return this.db.insert<TaskRow>("Task", value);
  }

  updateTask(id: string, value: Record<string, unknown>) {
    return this.db.updateSingle<TaskRow>("Task", [{ column: "id", value: id }], value);
  }

  updateTasks(filters: PostgrestFilter[], value: Record<string, unknown>) {
    return this.db.update<TaskRow>("Task", filters, value);
  }

  notesByContact(contactId: string) {
    return this.db.select<NoteRow>("Note", { filters: [{ column: "contactId", value: contactId }], order: [{ column: "createdAt", ascending: false }], limit: 500 });
  }

  createNote(value: Record<string, unknown>) {
    return this.db.insert<NoteRow>("Note", value);
  }

  callsByContact(contactId: string) {
    return this.db.select<CallLogRow>("CallLog", { filters: [{ column: "contactId", value: contactId }], order: [{ column: "createdAt", ascending: false }], limit: 500 });
  }

  createCall(value: Record<string, unknown>) {
    return this.db.insert<CallLogRow>("CallLog", value);
  }

  paymentsByContact(contactId: string) {
    return this.db.select<PaymentRow>("PaymentInstallment", { filters: [{ column: "contactId", value: contactId }], order: [{ column: "dueDate", ascending: true }], limit: 500 });
  }

  payments(filters: PostgrestFilter[] = [], order: PostgrestOrder[] = [{ column: "dueDate", ascending: true }], limit = 1000) {
    return this.db.select<PaymentRow>("PaymentInstallment", { filters, order, limit });
  }

  paymentById(id: string) {
    return this.db.maybeSingle<PaymentRow>("PaymentInstallment", { filters: [{ column: "id", value: id }], limit: 1 });
  }

  createPayment(value: Record<string, unknown>) {
    return this.db.insert<PaymentRow>("PaymentInstallment", value);
  }

  updatePayment(id: string, value: Record<string, unknown>) {
    return this.db.updateSingle<PaymentRow>("PaymentInstallment", [{ column: "id", value: id }], value);
  }

  deals(filters: PostgrestFilter[] = [], order: PostgrestOrder[] = [{ column: "stage", ascending: true }, { column: "updatedAt", ascending: false }], limit = 1000) {
    return this.db.select<DealRow>("Deal", { filters, order, limit });
  }

  dealById(id: string) {
    return this.db.maybeSingle<DealRow>("Deal", { filters: [{ column: "id", value: id }], limit: 1 });
  }

  dealsByContact(contactId: string) {
    return this.db.select<DealRow>("Deal", { filters: [{ column: "contactId", value: contactId }], order: [{ column: "updatedAt", ascending: false }], limit: 500 });
  }

  dealsByCompany(companyId: string) {
    return this.db.select<DealRow>("Deal", { filters: [{ column: "companyId", value: companyId }], order: [{ column: "updatedAt", ascending: false }], limit: 500 });
  }

  createDeal(value: Record<string, unknown>) {
    return this.db.insert<DealRow>("Deal", value);
  }

  updateDeal(id: string, value: Record<string, unknown>) {
    return this.db.updateSingle<DealRow>("Deal", [{ column: "id", value: id }], value);
  }

  deleteDeal(id: string) {
    return this.db.delete("Deal", [{ column: "id", value: id }]);
  }

  activitiesByContact(contactId: string) {
    return this.db.select<ActivityRow>("Activity", { filters: [{ column: "contactId", value: contactId }], order: [{ column: "createdAt", ascending: false }], limit: 500 });
  }

  createActivity(value: Record<string, unknown>) {
    return this.db.insert<ActivityRow>("Activity", value);
  }

  users(filters: PostgrestFilter[] = [], limit = 1000) {
    return this.db.select<UserProfileRow>("User", { filters, limit });
  }

  broadcasts(filters: PostgrestFilter[] = [], order: PostgrestOrder[] = [{ column: "createdAt", ascending: false }], limit = 500) {
    return this.db.select<BroadcastRow>("Broadcast", { filters, order, limit });
  }

  broadcastById(id: string) {
    return this.db.maybeSingle<BroadcastRow>("Broadcast", { filters: [{ column: "id", value: id }], limit: 1 });
  }

  createBroadcast(value: Record<string, unknown>) {
    return this.db.insert<BroadcastRow>("Broadcast", value);
  }

  updateBroadcast(id: string, value: Record<string, unknown>) {
    return this.db.updateSingle<BroadcastRow>("Broadcast", [{ column: "id", value: id }], value);
  }

  broadcastAudience(broadcastId: string) {
    return this.db.select<BroadcastAudienceRow>("BroadcastAudience", { filters: [{ column: "broadcastId", value: broadcastId }], order: [{ column: "sentAt", ascending: false, nullsFirst: false }], limit: 1000 });
  }

  createBroadcastAudience(value: Record<string, unknown>) {
    return this.db.insert<BroadcastAudienceRow>("BroadcastAudience", value);
  }

  updateBroadcastAudience(id: string, value: Record<string, unknown>) {
    return this.db.updateSingle<BroadcastAudienceRow>("BroadcastAudience", [{ column: "id", value: id }], value);
  }

  conversations(order: PostgrestOrder[] = [{ column: "updatedAt", ascending: false }], limit = 1000) {
    return this.db.select<WhatsappConversationRow>("WhatsappConversation", { order, limit });
  }

  conversationByContact(contactId: string) {
    return this.db.maybeSingle<WhatsappConversationRow>("WhatsappConversation", { filters: [{ column: "contactId", value: contactId }], limit: 1 });
  }

  conversationById(id: string) {
    return this.db.maybeSingle<WhatsappConversationRow>("WhatsappConversation", { filters: [{ column: "id", value: id }], limit: 1 });
  }

  createConversation(value: Record<string, unknown>) {
    return this.db.insert<WhatsappConversationRow>("WhatsappConversation", value);
  }

  updateConversation(id: string, value: Record<string, unknown>) {
    return this.db.updateSingle<WhatsappConversationRow>("WhatsappConversation", [{ column: "id", value: id }], value);
  }

  messagesByConversation(conversationId: string, ascending = true, limit = 500) {
    return this.db.select<WhatsappMessageRow>("WhatsappMessage", { filters: [{ column: "conversationId", value: conversationId }], order: [{ column: "createdAt", ascending }], limit });
  }

  messageByExternalId(externalId: string) {
    return this.db.maybeSingle<WhatsappMessageRow>("WhatsappMessage", { filters: [{ column: "externalId", value: externalId }], limit: 1 });
  }

  createMessage(value: Record<string, unknown>) {
    return this.db.insert<WhatsappMessageRow>("WhatsappMessage", value);
  }

  appSettingByKey(key: string) {
    return this.db.maybeSingle<AppSettingRow>("AppSetting", { filters: [{ column: "key", value: key }], limit: 1 });
  }

  createAppSetting(value: Record<string, unknown>) {
    return this.db.insert<AppSettingRow>("AppSetting", value);
  }

  updateAppSetting(id: string, value: Record<string, unknown>) {
    return this.db.updateSingle<AppSettingRow>("AppSetting", [{ column: "id", value: id }], value);
  }

  auditLogs(limit = 100) {
    return this.db.select<AuditLogRow>("AuditLog", { order: [{ column: "createdAt", ascending: false }], limit });
  }

  createAuditLog(value: Record<string, unknown>) {
    return this.db.insert<AuditLogRow>("AuditLog", value);
  }

  automationRuns(limit = 20) {
    return this.db.select<AutomationRunRow>("AutomationRun", { order: [{ column: "createdAt", ascending: false }], limit });
  }

  createAutomationRun(value: Record<string, unknown>) {
    return this.db.insert<AutomationRunRow>("AutomationRun", value);
  }
}
