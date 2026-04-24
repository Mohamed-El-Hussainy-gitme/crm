import test from "node:test";
import assert from "node:assert/strict";
import { loginSchema, quickFollowUpSchema } from "@smartcrm/shared";
import { validateSchema } from "../lib/forms.ts";
import { buildContactTimeline } from "../lib/timeline.ts";

test("validateSchema returns structured errors for invalid login", () => {
  const result = validateSchema(loginSchema, { email: "bad", password: "123" });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.ok(result.error.message.length > 0);
  assert.ok(result.error.fieldErrors.email || result.error.fieldErrors.password);
});

test("quickFollowUpSchema accepts normalized payload", () => {
  const result = validateSchema(quickFollowUpSchema, {
    title: "Follow up on proposal",
    dueAt: new Date().toISOString(),
    priority: "HIGH",
  });
  assert.equal(result.success, true);
});

test("buildContactTimeline merges heterogeneous activity into descending order", () => {
  const timeline = buildContactTimeline({
    createdAt: "2026-04-01T10:00:00.000Z",
    notes: [{ id: "n1", body: "Client asked for revised quote", createdAt: "2026-04-03T10:00:00.000Z" }],
    calls: [{ id: "c1", outcome: "Reached", durationMins: 8, summary: "Discussed scope", createdAt: "2026-04-04T10:00:00.000Z" }],
    tasks: [{ id: "t1", title: "Send proposal", dueAt: "2026-04-05T10:00:00.000Z", status: "PENDING", priority: "HIGH", type: "FOLLOW_UP" }],
    payments: [{ id: "p1", label: "Deposit", amount: 500, dueDate: "2026-04-06T10:00:00.000Z", status: "PENDING" }],
    deals: [{ id: "d1", title: "Website rebuild", amount: 2500, probability: 70, stage: "PROPOSAL", updatedAt: "2026-04-07T10:00:00.000Z" }],
    activities: [{ id: "a1", kind: "WHATSAPP_OUTBOUND", createdAt: "2026-04-08T10:00:00.000Z", meta: { message: "Sent proposal" } }],
  });

  assert.equal(timeline.length, 6);
  assert.equal(timeline[0]?.kind, "WHATSAPP_OUTBOUND");
  assert.equal(timeline[timeline.length - 1]?.kind, "NOTE");
});
