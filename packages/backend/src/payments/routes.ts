import { createPaymentSchema } from "@smartcrm/shared";
import { HttpError } from "../common/errors.js";
import { jsonResponse } from "../common/http.js";
import { readJsonBody } from "../common/validation.js";
import { assertTrustedOrigin, requireUser } from "../auth/session.js";
import type { BackendEnv, BackendExecutionContext } from "../app.js";
import { CoreRepository } from "../core/repository.js";
import { createActivity, promoteContactToClient, resolvePaymentStatus, serializePayment } from "../core/business.js";
import { createId, nowIso, parseDate, requireMinimumRole } from "../core/utils.js";

export async function handlePaymentsRoute(request: Request, env: BackendEnv, pathSegments: string[], _ctx?: BackendExecutionContext): Promise<Response | null> {
  const isPaymentRoute = pathSegments[0] === "payments";
  const isContactPaymentRoute = pathSegments[0] === "contacts" && pathSegments[2] === "payments";
  if (!isPaymentRoute && !isContactPaymentRoute) return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertTrustedOrigin(request, env);

  const user = await requireUser(request, env);
  const repo = new CoreRepository(env);
  const method = request.method.toUpperCase();

  if (pathSegments[0] === "payments" && pathSegments.length === 1 && method === "GET") {
    const payments = await repo.payments([], [{ column: "status", ascending: true }, { column: "dueDate", ascending: true }], 1000);
    const contacts = await repo.contacts();
    const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
    return jsonResponse(payments.map((payment) => serializePayment(payment, contactsById.get(payment.contactId) ?? null)));
  }

  if (pathSegments[0] === "contacts" && pathSegments.length === 3 && method === "POST") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const contactId = pathSegments[1];
    if (!contactId) throw new HttpError("Contact id is required", 400);
    const contact = await repo.contactById(contactId);
    if (!contact) throw new HttpError("Contact not found", 404);
    const parsed = createPaymentSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throw new HttpError("Invalid payment payload", 400, parsed.error.flatten());
    const dueDate = parseDate(parsed.data.dueDate, "dueDate");
    const timestamp = nowIso();
    const payment = await repo.createPayment({
      id: createId(),
      contactId,
      label: parsed.data.label,
      amount: parsed.data.amount,
      dueDate,
      paidAt: null,
      status: resolvePaymentStatus(dueDate),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await createActivity(repo, contactId, "PAYMENT_SCHEDULED", { paymentId: payment.id, amount: payment.amount, status: payment.status });
    return jsonResponse(serializePayment(payment, contact), { status: 201 });
  }

  if (pathSegments[0] === "payments" && pathSegments.length === 3 && ["mark-paid", "status"].includes(pathSegments[2] ?? "") && method === "PATCH") {
    requireMinimumRole(user, ["SALES_REP", "SALES_MANAGER", "ADMIN"]);
    const id = pathSegments[1];
    if (!id) throw new HttpError("Payment id is required", 400);
    const existing = await repo.paymentById(id);
    if (!existing) throw new HttpError("Payment installment not found", 404);
    let status: string = "PAID";
    if (pathSegments[2] === "status") {
      const body = (await readJsonBody(request)) as { status?: unknown };
      status = typeof body.status === "string" ? body.status : "PAID";
    }
    if (!["PENDING", "PARTIAL", "PAID", "OVERDUE"].includes(status)) throw new HttpError("Invalid payment status", 400);
    const updated = await repo.updatePayment(id, { status, paidAt: status === "PAID" ? nowIso() : null, updatedAt: nowIso() });
    if (!updated) throw new HttpError("Payment installment not found", 404);
    if (updated.status === "PAID") await promoteContactToClient(repo, updated.contactId);
    await createActivity(repo, updated.contactId, updated.status === "PAID" ? "PAYMENT_PAID" : "PAYMENT_STATUS_CHANGED", { paymentId: updated.id, amount: updated.amount, status: updated.status });
    return jsonResponse(serializePayment(updated, await repo.contactById(updated.contactId)));
  }

  return null;
}
