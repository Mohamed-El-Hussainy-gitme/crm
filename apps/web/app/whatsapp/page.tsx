"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { quickFollowUpSchema } from "@smartcrm/shared";
import { AppShell } from "@/components/layout";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { PaginationControls } from "@/components/pagination";
import { useI18n } from "@/components/providers";
import { CheckboxCard, Input, Select, buttonStyles } from "@/components/ui";
import { isoToLocalInput, localInputToIso, personalizeTemplate } from "@/components/workflows";
import { apiFetch } from "@/lib/api";
import { validateSchema } from "@/lib/forms";

type Conversation = {
  id: string;
  contactId: string;
  updatedAt: string;
  openWhatsappUrl: string;
  contact: { fullName: string; phone: string };
  lastMessage?: { content: string; direction: string; createdAt: string } | null;
};

type Template = { id: string; name: string; content: string };
type Message = { id: string; content: string; direction: string; createdAt: string };

export default function WhatsappPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeContactId, setActiveContactId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [openWhatsappUrl, setOpenWhatsappUrl] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [scheduleFollowUp, setScheduleFollowUp] = useState(true);
  const [followUpDueAt, setFollowUpDueAt] = useState(isoToLocalInput(undefined, 1));
  const [followUpPriority, setFollowUpPriority] = useState("MEDIUM");
  const [page, setPage] = useState(1);
  const { t, formatDateTime, labelPriority, labelStatus } = useI18n();

  const openConversation = async (contactId: string) => {
    const data = await apiFetch<{ messages: Message[]; openWhatsappUrl: string }>(`/whatsapp/conversations/${contactId}`);
    setActiveContactId(contactId);
    setMessages(data.messages);
    setOpenWhatsappUrl(data.openWhatsappUrl);
  };

  const loadConversations = async () => {
    const [conversationData, templateData] = await Promise.all([
      apiFetch<Conversation[]>("/whatsapp/conversations"),
      apiFetch<{ items: Template[] }>("/whatsapp/templates"),
    ]);
    setConversations(conversationData);
    setTemplates(templateData.items);
    if (!activeContactId && conversationData[0]?.contactId) {
      await openConversation(conversationData[0].contactId);
    }
  };

  useEffect(() => { loadConversations().catch((e) => setError(e instanceof Error ? e.message : t("messages.loadFailed"))); }, []);

  const activeConversation = useMemo(() => conversations.find((conversation) => conversation.contactId === activeContactId), [activeContactId, conversations]);
  const visibleConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const needle = search.trim().toLowerCase();
    return conversations.filter((conversation) => [conversation.contact.fullName, conversation.contact.phone, conversation.lastMessage?.content || ""].some((value) => value.toLowerCase().includes(needle)));
  }, [conversations, search]);
  useEffect(() => { setPage(1); }, [search]);
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(visibleConversations.length / pageSize));
  const pagedConversations = useMemo(() => visibleConversations.slice((page - 1) * pageSize, page * pageSize), [page, visibleConversations]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeContactId || !composer.trim() || !activeConversation) return;
    try {
      setSending(true); setError("");
      const messageText = composer.trim();
      const result = await apiFetch<{ openWhatsappUrl: string }>(`/whatsapp/conversations/${activeContactId}/messages`, { method: "POST", body: JSON.stringify({ content: messageText }) });
      if (scheduleFollowUp) {
        const parsed = validateSchema(quickFollowUpSchema, { title: t("messages.replyFollowUpTitle", { name: activeConversation.contact.fullName }), dueAt: localInputToIso(followUpDueAt), description: t("messages.replyContext", { text: messageText }), priority: followUpPriority });
        if (!parsed.success) throw new Error(parsed.error.message);
        await apiFetch(`/contacts/${activeContactId}/follow-ups`, { method: "POST", body: JSON.stringify(parsed.data) });
      }
      setComposer(""); setOpenWhatsappUrl(result.openWhatsappUrl); await openConversation(activeContactId); await loadConversations();
    } catch (e) { setError(e instanceof Error ? e.message : t("messages.sendFailed")); } finally { setSending(false); }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader eyebrow={t("messages.eyebrow")} title={t("messages.title")} description={t("messages.description")} />
        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label={t("messages.conversations")} value={conversations.length} helper={t("messages.conversationsHint")} />
          <StatCard label={t("messages.templates")} value={templates.length} helper={t("messages.templatesHint")} tone="sky" />
          <StatCard label={t("messages.selectedContact")} value={activeConversation?.contact.fullName || "—"} helper={t("messages.openThreadContext")} tone="emerald" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <Card title={t("messages.listTitle")} description={t("messages.listDescription")}>
            <div className="space-y-3">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("messages.searchPlaceholder")} />
              {visibleConversations.length ? <>
                {pagedConversations.map((conversation) => (
                  <button key={conversation.id} type="button" onClick={() => void openConversation(conversation.contactId)} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${activeContactId === conversation.contactId ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50 hover:bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{conversation.contact.fullName}</p>
                        <p className="force-ltr mt-1 text-xs text-slate-500">{conversation.contact.phone}</p>
                        <p className="mt-2 text-sm text-slate-600">{conversation.lastMessage?.content || t("messages.noMessagesYet")}</p>
                      </div>
                      {conversation.lastMessage?.direction ? <Badge>{labelStatus(conversation.lastMessage.direction)}</Badge> : null}
                    </div>
                    <p className="mt-3 text-xs text-slate-500">{t("messages.updatedAt", { value: formatDateTime(conversation.updatedAt) })}</p>
                  </button>
                ))}
                <PaginationControls page={page} totalPages={totalPages} totalItems={visibleConversations.length} pageSize={pageSize} onPageChange={setPage} />
              </> : <EmptyState title={t("messages.noMatchingConversations")} description={t("messages.noMatchingConversationsDescription")} />}
            </div>
          </Card>

          <div className="space-y-6">
            <Card title={t("messages.logTitle")} description={activeConversation ? activeConversation.contact.fullName : t("messages.openConversation")}>
              <div className="space-y-3">
                {messages.length ? messages.map((message) => (
                  <div key={message.id} className={`rounded-2xl border px-4 py-4 ${message.direction === "OUTBOUND" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-6 text-slate-700">{message.content}</p>
                      <Badge tone={message.direction === "OUTBOUND" ? "emerald" : "slate"}>{labelStatus(message.direction)}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{formatDateTime(message.createdAt)}</p>
                  </div>
                )) : <EmptyState title={t("messages.openConversation")} description={t("messages.openConversationDescription")} />}
              </div>
            </Card>

            <Card title={t("messages.composerTitle")} description={t("messages.composerDescription")}>
              <div className="mb-4 flex flex-wrap gap-2">
                {templates.map((template) => <button key={template.id} type="button" onClick={() => setComposer(personalizeTemplate(template.content, activeConversation?.contact.fullName))} className={buttonStyles("secondary", "sm")}>{template.name}</button>)}
              </div>
              <form onSubmit={send} className="space-y-4">
                <textarea value={composer} onChange={(event) => setComposer(event.target.value)} className="min-h-40 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" placeholder={t("messages.composerPlaceholder")} />
                <div className="grid gap-4 md:grid-cols-3">
                  <CheckboxCard checked={scheduleFollowUp} onChange={setScheduleFollowUp} label={t("messages.scheduleFollowUpAfterSend")} hint={t("messages.scheduleHint")} />
                  <Input type="datetime-local" value={followUpDueAt} onChange={(event) => setFollowUpDueAt(event.target.value)} className="force-ltr" dir="ltr" />
                  <Select value={followUpPriority} onChange={(event) => setFollowUpPriority(event.target.value)}>{["LOW","MEDIUM","HIGH"].map((priority) => <option key={priority} value={priority}>{labelPriority(priority)}</option>)}</Select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={sending || !activeContactId || !composer.trim()} className={buttonStyles("primary")}>{sending ? t("messages.sending") : t("messages.send")}</button>
                  {openWhatsappUrl ? <a href={openWhatsappUrl} target="_blank" rel="noreferrer" className={buttonStyles("success")}>{t("messages.openWhatsapp")}</a> : null}
                  {activeConversation?.contactId ? <Link href={`/contacts/view?id=${activeConversation.contactId}` as Route} className={buttonStyles("secondary")}>{t("common.openContact")}</Link> : null}
                </div>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
