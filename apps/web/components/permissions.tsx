"use client";

import { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSession } from "@/components/providers";
import { Card } from "@/components/cards";
import { buttonStyles } from "@/components/ui";
import type { UserRole } from "@/lib/session";

export function PermissionGate({ minimumRole, fallback = null, children }: { minimumRole: UserRole; fallback?: ReactNode; children: ReactNode }) {
  const { can } = useSession();
  return can(minimumRole) ? <>{children}</> : <>{fallback}</>;
}

export function RolePageGuard({ minimumRole, children }: { minimumRole: UserRole; children: ReactNode }) {
  const { can, isReady } = useSession();

  if (!isReady) {
    return <Card title="Checking permissions"><p className="text-sm text-slate-500">Loading your session…</p></Card>;
  }

  if (!can(minimumRole)) {
    return (
      <Card title="Restricted area" description={`This page requires ${minimumRole.replaceAll("_", " ")} access.`}>
        <div className="flex flex-wrap gap-3">
          <Link href={"/today" as Route} className={buttonStyles("secondary")}>Back to Today</Link>
          <Link href={"/settings" as Route} className={buttonStyles("primary")}>Open Settings</Link>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
}
