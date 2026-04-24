"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/layout";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/cards";
import { InfoTile, ListRow, buttonStyles } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type CompanyContact = { id: string; fullName: string; stage: string; phone?: string | null };
type CompanyDeal = { id: string; title: string; stage: string; amount: number; contactId: string; contact?: { fullName: string } | null };
type CompanyDetails = {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
  contacts: CompanyContact[];
  deals: CompanyDeal[];
};

function stageTone(stage: string) {
  if (stage === "CLIENT" || stage === "WON") return "emerald" as const;
  if (stage === "LOST") return "rose" as const;
  if (stage === "ON_HOLD") return "amber" as const;
  return "sky" as const;
}

export default function CompanyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const [company, setCompany] = useState<CompanyDetails | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void params.then(async ({ id }) => {
      try {
        setCompany(await apiFetch<CompanyDetails>(`/companies/${id}`));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load company");
      }
    });
  }, [params]);

  if (!company) {
    return (
      <AppShell>
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{error || "Loading company..."}</p>
      </AppShell>
    );
  }

  const openPipelineValue = company.deals.filter((deal) => !["WON", "LOST"].includes(deal.stage)).reduce((sum, deal) => sum + Number(deal.amount || 0), 0);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Account view"
          title={company.name}
          description={company.industry || "No industry set"}
          actions={<Link href={"/companies" as Route} className={buttonStyles("secondary")}>Back to companies</Link>}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Contacts" value={company.contacts.length} helper="People linked to this account" />
          <StatCard label="Deals" value={company.deals.length} helper="Commercial records on the account" tone="sky" />
          <StatCard label="Open value" value={openPipelineValue.toLocaleString()} helper="Open pipeline rollup" tone="emerald" />
        </div>

        <Card title="Account summary" description="Keep the company context lean and useful.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Company" value={company.name} />
            <InfoTile label="Industry" value={company.industry || "—"} />
            <InfoTile label="Website" value={company.website || "—"} />
            <InfoTile label="Linked contacts" value={company.contacts.length} />
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Contacts" description="Jump from the account into the actual client records.">
            <div className="space-y-3">
              {company.contacts.length ? (
                company.contacts.map((contact) => (
                  <ListRow
                    key={contact.id}
                    title={contact.fullName}
                    subtitle={contact.phone || "No phone"}
                    meta={contact.stage.replaceAll("_", " ")}
                    actions={<Link href={`/contacts/${contact.id}` as Route} className={buttonStyles("secondary", "sm")}>Open contact</Link>}
                    highlighted={stageTone(contact.stage) === "sky"}
                  />
                ))
              ) : (
                <EmptyState title="No contacts linked" description="Link contacts to the company when account-level reporting becomes useful." />
              )}
            </div>
          </Card>

          <Card title="Deals" description="Commercial context grouped under the account.">
            <div className="space-y-3">
              {company.deals.length ? (
                company.deals.map((deal) => (
                  <ListRow
                    key={deal.id}
                    title={deal.title}
                    subtitle={`${deal.stage.replaceAll("_", " ")} · ${Number(deal.amount || 0).toLocaleString()}`}
                    meta={deal.contact?.fullName ? `Contact ${deal.contact.fullName}` : undefined}
                    actions={deal.contactId ? <Link href={`/contacts/${deal.contactId}` as Route} className={buttonStyles("secondary", "sm")}>Open contact</Link> : null}
                  />
                ))
              ) : (
                <EmptyState title="No deals linked" description="Deals remain optional until you need explicit commercial tracking at the account level." />
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
