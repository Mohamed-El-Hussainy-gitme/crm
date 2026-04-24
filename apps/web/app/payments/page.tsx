"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout";
import { Card } from "@/components/cards";
import { apiFetch } from "@/lib/api";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    apiFetch<any[]>("/payments").then(setPayments).catch(console.error);
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Payments</h1>
          <p className="mt-2 text-slate-400">Schedule installments, track overdue accounts, and mark collections.</p>
        </div>
        <Card title="Installments">
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{payment.contact.fullName} — {payment.label}</p>
                    <p className="mt-1 text-sm text-slate-400">Due {new Date(payment.dueDate).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{payment.amount}</p>
                    <span className="text-xs text-slate-400">{payment.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
