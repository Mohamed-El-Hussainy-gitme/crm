"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { Badge } from "@/components/cards";
import { useI18n, useSession } from "@/components/providers";
import { buttonStyles } from "@/components/ui";

type NavItem = {
  href: Route;
  labelKey: string;
  aliases?: string[];
  minimumRole?: "VIEWER" | "SALES_REP" | "SALES_MANAGER" | "ADMIN";
};

const primaryNav: NavItem[] = [
  { href: "/today", labelKey: "nav.today", aliases: ["/dashboard", "/agenda"] },
  { href: "/contacts", labelKey: "nav.contacts", aliases: ["/companies"] },
  { href: "/pipeline", labelKey: "nav.pipeline", aliases: ["/deals"] },
  { href: "/tasks", labelKey: "nav.tasks", aliases: ["/follow-ups", "/payments"] },
  { href: "/messages", labelKey: "nav.messages", aliases: ["/whatsapp", "/broadcasts"] },
  { href: "/reports", labelKey: "nav.reports", aliases: ["/notifications"] },
];

const secondaryNav: NavItem[] = [
  { href: "/settings", labelKey: "nav.settings", aliases: ["/automations", "/audit", "/intelligence", "/data-tools", "/storage"] },
];

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return (item.aliases || []).some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
}

function navClass(active: boolean) {
  return [
    "group flex items-center justify-between rounded-2xl px-3 py-3 text-sm font-medium transition",
    active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, can, signOut } = useSession();
  const { t, locale, setLocale, isRtl } = useI18n();
  const navArrow = isRtl ? "←" : "→";

  const pageTitle = useMemo(() => {
    const allItems = [...primaryNav, ...secondaryNav];
    const direct = allItems.find((item) => isActive(pathname, item));
    if (direct) return t(direct.labelKey);
    const segment = pathname.split("/").filter(Boolean)[0] || "CRM";
    return segment.replace(/-/g, " ");
  }, [pathname, t]);

  const visiblePrimary = primaryNav.filter((item) => !item.minimumRole || can(item.minimumRole));
  const visibleSecondary = secondaryNav.filter((item) => !item.minimumRole || can(item.minimumRole));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1680px]">
        <aside className="shell-sidebar hidden w-80 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-slate-100 px-6 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Hybrid CRM</p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{t("layout.brandTitle")}</h1>
                <p className="mt-3 text-sm leading-6 text-slate-500">{t("layout.brandDescription")}</p>
              </div>
              <Badge tone="sky">{t("layout.phaseBadge")}</Badge>
            </div>
          </div>

          <nav className="flex-1 space-y-8 px-4 py-6">
            <section>
              <p className="px-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("common.dailyWorkflow")}</p>
              <div className="mt-3 space-y-1">
                {visiblePrimary.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <Link key={item.href} href={item.href} className={navClass(active)}>
                      <span>{t(item.labelKey)}</span>
                      <span className="text-xs text-slate-400 group-hover:text-slate-500">{navArrow}</span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section>
              <p className="px-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("common.administration")}</p>
              <div className="mt-3 space-y-1">
                {visibleSecondary.map((item) => (
                  <Link key={item.href} href={item.href} className={navClass(isActive(pathname, item))}>
                    <span>{t(item.labelKey)}</span>
                    <span className="text-xs text-slate-400">{navArrow}</span>
                  </Link>
                ))}
              </div>
            </section>
          </nav>

          <div className="border-t border-slate-100 px-6 py-5">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="text-sm font-medium text-slate-900">{t("common.signedIn")}</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{user?.fullName ?? "CRM User"}</p>
              <p className="force-ltr mt-1 text-xs text-slate-500">{user?.email ?? "—"}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Badge tone={user?.role === "ADMIN" ? "emerald" : user?.role === "SALES_MANAGER" ? "sky" : "slate"}>{user?.role ?? "VIEWER"}</Badge>
                <button
                  type="button"
                  onClick={() => {
                    void signOut().finally(() => {
                      router.push("/login");
                    });
                  }}
                  className={buttonStyles("ghost", "sm")}
                >
                  {t("common.signOut")}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className={buttonStyles("secondary", "sm")}>{locale === "ar" ? t("common.english") : t("common.arabic")}</button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col pb-24 lg:pb-0">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen((current) => !current)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg text-slate-700 lg:hidden"
                  aria-label={t("layout.toggleNavigation")}
                >
                  ☰
                </button>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{t("common.workspace")}</p>
                  <p className="text-sm font-semibold text-slate-900">{pageTitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {user?.role ? <Badge>{user.role}</Badge> : null}
                <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className={buttonStyles("secondary", "sm")}>{locale === "ar" ? t("common.english") : t("common.arabic")}</button>
                <Link href={"/contacts" as Route} className={buttonStyles("primary", "sm")}>
                  {t("common.openContacts")}
                </Link>
              </div>
            </div>
          </header>

          {mobileOpen ? (
            <div className="border-b border-slate-200 bg-white px-4 py-4 lg:hidden">
              <div className="grid gap-2">
                {[...visiblePrimary, ...visibleSecondary].map((item) => (
                  <Link key={item.href} href={item.href} className={navClass(isActive(pathname, item))} onClick={() => setMobileOpen(false)}>
                    <span>{t(item.labelKey)}</span>
                    <span className="text-xs text-slate-400">{navArrow}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
