import { buildWhatsappLink } from "../../lib/whatsapp.js";

export function parseContactTags(tags: string | null | undefined) {
  return (tags ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

type ContactLike = {
  fullName: string;
  phone: string;
  normalizedPhone?: string | null;
  company?: string | null;
  companyRecord?: { name: string } | null;
  tags?: string | null;
};

export function serializeContact<T extends ContactLike>(contact: T) {
  const whatsappPhone = contact.normalizedPhone || contact.phone;

  return {
    ...contact,
    companyName: contact.companyRecord?.name ?? contact.company ?? null,
    tags: parseContactTags(contact.tags),
    whatsappUrl: buildWhatsappLink(whatsappPhone, `Hello ${contact.fullName}`),
  };
}
