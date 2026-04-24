import { buildWhatsappUrl, normalizeWhatsappPhone } from "@smartcrm/shared";
import { env } from "../config/env.js";

export function buildWhatsappLink(phone: string, text?: string) {
  return buildWhatsappUrl(phone, text);
}

export async function sendWhatsappTemplate(params: {
  phone: string;
  templateName: string;
  bodyText?: string;
}) {
  if (env.WHATSAPP_PROVIDER !== "CLOUD_API") {
    return {
      provider: "DEEP_LINK",
      url: buildWhatsappLink(params.phone, params.bodyText),
      status: "LINK_ONLY",
    };
  }

  const normalizedPhone = normalizeWhatsappPhone(params.phone);
  if (!normalizedPhone) {
    throw new Error("Phone number is not valid for WhatsApp delivery.");
  }

  const endpoint = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "template",
      template: {
        name: params.templateName,
        language: { code: "en" },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data?.error?.message || "WhatsApp Cloud API request failed",
    );
  }

  return {
    provider: "CLOUD_API",
    status: "SENT",
    data,
  };
}
