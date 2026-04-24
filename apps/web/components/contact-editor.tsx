"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PIPELINE_STAGES, createContactSchema, normalizeWhatsappPhone, type PipelineStage } from "@smartcrm/shared";
import { useI18n, useToast } from "@/components/providers";
import { buttonStyles, CheckboxCard, Drawer, FieldShell, Input, Select, Textarea } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/api";
import { fieldError, validateSchema } from "@/lib/forms";

type ContactEditorMode = "create" | "edit";

type EditableContact = {
  id: string;
  fullName?: string;
  firstName: string;
  lastName?: string | null;
  phone: string;
  normalizedPhone?: string | null;
  email?: string | null;
  company?: string | null;
  companyName?: string | null;
  source?: string | null;
  stage: string;
  expectedDealValue?: number;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  isWhatsappOptedIn?: boolean;
  tags?: string[];
  locationText?: string | null;
  area?: string | null;
  mapUrl?: string | null;
  placeLabel?: string | null;
};

type ParsedLocationResponse = {
  source: string;
  mapUrl?: string;
  placeLabel?: string;
  locationText?: string;
  area?: string;
  company?: string;
  firstName?: string;
  warnings?: string[];
};

type ContactEditorProps = {
  open: boolean;
  mode: ContactEditorMode;
  contact?: EditableContact | null;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
};

type ContactFormState = {
  locationSeed: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
  source: string;
  locationText: string;
  area: string;
  mapUrl: string;
  placeLabel: string;
  stage: PipelineStage;
  expectedDealValue: string;
  lastContactedAt: string;
  nextFollowUpAt: string;
  isWhatsappOptedIn: boolean;
  tags: string;
  notes: string;
};

const contactSubmitSchema = createContactSchema;

function localToIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isoToLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function createDefaultState(contact?: EditableContact | null): ContactFormState {
  return {
    locationSeed: contact?.mapUrl || contact?.locationText || contact?.placeLabel || "",
    firstName: contact?.firstName || "",
    lastName: contact?.lastName || "",
    phone: contact?.phone || "",
    email: contact?.email || "",
    company: contact?.companyName || contact?.company || "",
    source: contact?.source || "Google Maps",
    locationText: contact?.locationText || "",
    area: contact?.area || "",
    mapUrl: contact?.mapUrl || "",
    placeLabel: contact?.placeLabel || "",
    stage: (contact?.stage as PipelineStage) || "LEAD",
    expectedDealValue: String(contact?.expectedDealValue || 0),
    lastContactedAt: isoToLocal(contact?.lastContactedAt),
    nextFollowUpAt: isoToLocal(contact?.nextFollowUpAt),
    isWhatsappOptedIn: Boolean(contact?.isWhatsappOptedIn),
    tags: contact?.tags?.join(", ") || "",
    notes: "",
  };
}

function parseTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function buildPayload(form: ContactFormState) {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone,
    email: form.email || undefined,
    company: form.company || undefined,
    source: form.source || undefined,
    locationText: form.locationText || undefined,
    area: form.area || undefined,
    mapUrl: form.mapUrl || undefined,
    placeLabel: form.placeLabel || undefined,
    notes: form.notes || undefined,
    stage: form.stage,
    expectedDealValue: Number(form.expectedDealValue || 0),
    lastContactedAt: localToIso(form.lastContactedAt),
    nextFollowUpAt: localToIso(form.nextFollowUpAt),
    isWhatsappOptedIn: form.isWhatsappOptedIn,
    tags: parseTags(form.tags),
  };
}

function InlineFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-xs font-medium text-rose-600">{message}</p>;
}

export function ContactEditorDrawer({ open, mode, contact, onClose, onSaved }: ContactEditorProps) {
  const { notify } = useToast();
  const { t, labelPipelineStage } = useI18n();
  const [form, setForm] = useState<ContactFormState>(createDefaultState(contact));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [parsingLocation, setParsingLocation] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(createDefaultState(contact));
    setErrors({});
    setSubmitError("");
  }, [contact, mode, open]);

  const whatsappPhone = useMemo(() => normalizeWhatsappPhone(form.phone), [form.phone]);
  const isEditMode = mode === "edit";

  const setField = <K extends keyof ContactFormState>(key: K, value: ContactFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
    setSubmitError("");
  };

  const handleAutofill = async () => {
    if (!form.locationSeed.trim()) {
      setErrors((current) => ({ ...current, locationSeed: t("contactEditor.parseRequired") }));
      return;
    }

    try {
      setParsingLocation(true);
      setSubmitError("");
      const parsed = await apiFetch<ParsedLocationResponse>("/contacts/intake/parse-location", {
        method: "POST",
        body: JSON.stringify({ input: form.locationSeed.trim() }),
      });

      setForm((current) => ({
        ...current,
        source: current.source || parsed.source || "Google Maps",
        mapUrl: parsed.mapUrl || current.mapUrl,
        placeLabel: parsed.placeLabel || current.placeLabel,
        locationText: parsed.locationText || current.locationText,
        area: parsed.area || current.area,
        company: current.company || parsed.company || current.placeLabel,
        firstName: current.firstName || parsed.firstName || current.placeLabel,
      }));

      notify({
        tone: "success",
        title: t("contactEditor.parsedTitle"),
        description: parsed.warnings?.length ? parsed.warnings[0] : t("contactEditor.parsedDescription"),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("contactEditor.parseFailedDescription");
      setSubmitError(message);
      notify({ tone: "error", title: t("contactEditor.parseFailedTitle"), description: message });
    } finally {
      setParsingLocation(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = validateSchema(contactSubmitSchema, buildPayload(form));

    if (!parsed.success) {
      setErrors(parsed.error.fieldErrors);
      setSubmitError(parsed.error.message);
      return;
    }

    try {
      setSaving(true);
      setSubmitError("");
      setErrors({});
      const endpoint = isEditMode && contact ? `/contacts/${contact.id}` : "/contacts";
      const method = isEditMode ? "PATCH" : "POST";
      await apiFetch(endpoint, { method, body: JSON.stringify(parsed.data) });
      notify({
        tone: "success",
        title: isEditMode ? t("contactEditor.contactUpdated") : t("contactEditor.contactCreated"),
        description: isEditMode ? t("contactEditor.contactUpdatedDescription") : t("contactEditor.contactCreatedDescription"),
      });
      onClose();
      await onSaved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : isEditMode ? t("contactEditor.updateFailed") : t("contactEditor.createFailed");
      setSubmitError(message);

      if (error instanceof ApiError && error.status === 409) {
        const nextErrors: Record<string, string> = {};
        if (message.toLowerCase().includes("phone")) nextErrors.phone = message;
        if (message.toLowerCase().includes("email")) nextErrors.email = message;
        if (Object.keys(nextErrors).length) {
          setErrors((current) => ({ ...current, ...nextErrors }));
        }
      }

      notify({ tone: "error", title: isEditMode ? t("contactEditor.updateFailed") : t("contactEditor.createFailed"), description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={isEditMode ? t("contactEditor.editEyebrow") : t("contactEditor.createEyebrow")}
      widthClass="max-w-2xl"
      title={isEditMode ? t("contactEditor.editTitle", { name: contact?.fullName || t("common.fallbackContactName") }) : t("contactEditor.createTitle")}
      description={isEditMode ? t("contactEditor.editDescription") : t("contactEditor.createDescription")}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <FieldShell label={t("contactEditor.locationSeedLabel")} hint={t("contactEditor.locationSeedHint")}>
              <Textarea value={form.locationSeed} onChange={(event) => setField("locationSeed", event.target.value)} placeholder={t("contactEditor.locationSeedPlaceholder")} className="min-h-24" />
            </FieldShell>
            <button type="button" onClick={() => void handleAutofill()} disabled={parsingLocation} className={buttonStyles("secondary")}>
              {parsingLocation ? t("contactEditor.parsing") : t("contactEditor.parseButton")}
            </button>
          </div>
          <InlineFieldError message={fieldError(errors, "locationSeed")} />
        </div>

        {submitError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</p> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <FieldShell label={t("contactEditor.namePrimary")} hint={t("contactEditor.namePrimaryHint")}>
            <div>
              <Input value={form.firstName} onChange={(event) => setField("firstName", event.target.value)} placeholder={t("contactEditor.namePrimaryPlaceholder")} required />
              <InlineFieldError message={fieldError(errors, "firstName")} />
            </div>
          </FieldShell>
          <FieldShell label={t("contactEditor.nameSecondary")}>
            <div>
              <Input value={form.lastName} onChange={(event) => setField("lastName", event.target.value)} placeholder={t("contactEditor.nameSecondaryPlaceholder")} />
              <InlineFieldError message={fieldError(errors, "lastName")} />
            </div>
          </FieldShell>
          <FieldShell label={t("common.phone")} hint={t("contactEditor.phoneHint")}>
            <div>
              <Input value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder={t("contactEditor.phonePlaceholder")} required className="force-ltr" dir="ltr" />
              <InlineFieldError message={fieldError(errors, "phone")} />
              <p className="force-ltr mt-2 text-xs text-slate-500">{whatsappPhone ? t("contactEditor.phoneReady", { value: whatsappPhone }) : t("contactEditor.phoneInvalid")}</p>
            </div>
          </FieldShell>
          <FieldShell label={t("common.email")}>
            <div>
              <Input value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder={t("contactEditor.emailPlaceholder")} type="email" className="force-ltr" dir="ltr" />
              <InlineFieldError message={fieldError(errors, "email")} />
            </div>
          </FieldShell>
          <FieldShell label={t("contactEditor.companyLabel")}>
            <div>
              <Input value={form.company} onChange={(event) => setField("company", event.target.value)} placeholder={t("contactEditor.companyPlaceholder")} />
              <InlineFieldError message={fieldError(errors, "company")} />
            </div>
          </FieldShell>
          <FieldShell label={t("common.source")}>
            <div>
              <Input value={form.source} onChange={(event) => setField("source", event.target.value)} placeholder={t("contactEditor.sourcePlaceholder")} />
              <InlineFieldError message={fieldError(errors, "source")} />
            </div>
          </FieldShell>
          <FieldShell label={t("common.placeLabel")}>
            <div>
              <Input value={form.placeLabel} onChange={(event) => setField("placeLabel", event.target.value)} placeholder={t("contactEditor.placeLabelPlaceholder")} />
              <InlineFieldError message={fieldError(errors, "placeLabel")} />
            </div>
          </FieldShell>
          <FieldShell label={t("common.area")}>
            <div>
              <Input value={form.area} onChange={(event) => setField("area", event.target.value)} placeholder={t("contactEditor.areaPlaceholder")} />
              <InlineFieldError message={fieldError(errors, "area")} />
            </div>
          </FieldShell>
          <div className="md:col-span-2">
            <FieldShell label={t("common.locationText")}>
              <div>
                <Input value={form.locationText} onChange={(event) => setField("locationText", event.target.value)} placeholder={t("contactEditor.locationTextPlaceholder")} />
                <InlineFieldError message={fieldError(errors, "locationText")} />
              </div>
            </FieldShell>
          </div>
          <div className="md:col-span-2">
            <FieldShell label={t("common.mapUrl")}>
              <div>
                <Input value={form.mapUrl} onChange={(event) => setField("mapUrl", event.target.value)} placeholder={t("contactEditor.mapUrlPlaceholder")} className="force-ltr" dir="ltr" />
                <InlineFieldError message={fieldError(errors, "mapUrl")} />
              </div>
            </FieldShell>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldShell label={t("common.stage")}>
            <Select value={form.stage} onChange={(event) => setField("stage", event.target.value as PipelineStage)}>
              {PIPELINE_STAGES.map((value) => <option key={value} value={value}>{labelPipelineStage(value)}</option>)}
            </Select>
          </FieldShell>
          <FieldShell label={t("common.expectedValue")}>
            <div>
              <Input type="number" min="0" step="0.01" value={form.expectedDealValue} onChange={(event) => setField("expectedDealValue", event.target.value)} className="force-ltr" dir="ltr" />
              <InlineFieldError message={fieldError(errors, "expectedDealValue")} />
            </div>
          </FieldShell>
          <FieldShell label={t("common.lastContacted")}>
            <div>
              <Input type="datetime-local" value={form.lastContactedAt} onChange={(event) => setField("lastContactedAt", event.target.value)} className="force-ltr" dir="ltr" />
              <InlineFieldError message={fieldError(errors, "lastContactedAt")} />
            </div>
          </FieldShell>
          <FieldShell label={t("common.nextFollowUp")}>
            <div>
              <Input type="datetime-local" value={form.nextFollowUpAt} onChange={(event) => setField("nextFollowUpAt", event.target.value)} className="force-ltr" dir="ltr" />
              <InlineFieldError message={fieldError(errors, "nextFollowUpAt")} />
            </div>
          </FieldShell>
          <div className="md:col-span-2">
            <FieldShell label={t("common.tags")} hint={t("contactEditor.tagsHint")}>
              <div>
                <Input value={form.tags} onChange={(event) => setField("tags", event.target.value)} placeholder={t("contactEditor.tagsPlaceholder")} className="force-ltr" dir="ltr" />
                <InlineFieldError message={fieldError(errors, "tags")} />
              </div>
            </FieldShell>
          </div>
        </div>

        <CheckboxCard checked={form.isWhatsappOptedIn} onChange={(checked) => setField("isWhatsappOptedIn", checked)} label={t("contactEditor.whatsappOptInLabel")} hint={t("contactEditor.whatsappOptInHint")} />

        <FieldShell label={isEditMode ? t("contactEditor.updateNote") : t("contactEditor.initialNote")} hint={t("contactEditor.noteHint")}>
          <div>
            <Textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder={isEditMode ? t("contactEditor.updateNotePlaceholder") : t("contactEditor.initialNotePlaceholder")} />
            <InlineFieldError message={fieldError(errors, "notes")} />
          </div>
        </FieldShell>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className={buttonStyles("primary")}>
            {saving ? t(isEditMode ? "common.saving" : "contactEditor.submitCreating") : isEditMode ? t("contactEditor.submitSaveChanges") : t("contactEditor.submitSaveContact")}
          </button>
          <button type="button" onClick={onClose} className={buttonStyles("secondary")}>{t("common.cancel")}</button>
        </div>
      </form>
    </Drawer>
  );
}
