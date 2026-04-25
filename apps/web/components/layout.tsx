"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/cards";
import { useI18n, useSession } from "@/components/providers";
import { buttonStyles } from "@/components/ui";

type NavItem = {
  href: Route;
  labelKey: string;
  aliases?: string[];
  shortcut?: string;
  minimumRole?: "VIEWER" | "SALES_REP" | "SALES_MANAGER" | "ADMIN";
};

const primaryNav: NavItem[] = [
  { href: "/today", labelKey: "nav.today", aliases: ["/dashboard", "/agenda"], shortcut: "01" },
  { href: "/prospecting", labelKey: "nav.prospecting", aliases: ["/acquisition"], shortcut: "02" },
  { href: "/contacts", labelKey: "nav.contacts", aliases: ["/companies"], shortcut: "03" },
  { href: "/pipeline", labelKey: "nav.pipeline", aliases: ["/deals"], shortcut: "04" },
  { href: "/tasks", labelKey: "nav.tasks", aliases: ["/follow-ups", "/payments"], shortcut: "05" },
  { href: "/messages", labelKey: "nav.messages", aliases: ["/whatsapp", "/broadcasts"], shortcut: "06" },
  { href: "/reports", labelKey: "nav.reports", aliases: ["/notifications"], shortcut: "07" },
];

const secondaryNav: NavItem[] = [
  { href: "/settings", labelKey: "nav.settings", aliases: ["/automations", "/audit", "/intelligence", "/data-tools", "/storage"], shortcut: "A1" },
];

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return (item.aliases || []).some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function navClass(active: boolean) {
  return cx(
    "group flex min-h-11 items-center gap-3 rounded-enterprise border px-3 py-2.5 text-sm font-bold transition",
    active
      ? "border-transparent bg-enterprise-primary text-white shadow-panel"
      : "border-transparent bg-enterprise-secondary text-enterprise-muted shadow-panel hover:text-enterprise-primary",
  );
}

function mobileNavClass(active: boolean) {
  return cx(
    "group flex min-h-11 items-center justify-between rounded-enterprise border px-3 py-2.5 text-sm font-bold transition",
    active
      ? "border-transparent bg-enterprise-primary text-white shadow-panel"
      : "border-transparent bg-enterprise-secondary text-enterprise-text shadow-panel hover:text-enterprise-primary",
  );
}

function initials(name?: string | null) {
  if (!name) return "U";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, can, signOut, isReady } = useSession();
  const { t, locale, setLocale, isRtl } = useI18n();
  const navArrow = isRtl ? "←" : "→";

  const pageTitle = useMemo(() => {
    const allItems = [...primaryNav, ...secondaryNav];
    const direct = allItems.find((item) => isActive(pathname, item));
    if (direct) return t(direct.labelKey);
    const segment = pathname.split("/").filter(Boolean)[0] || "CRM";
    return segment.replace(/-/g, " ");
  }, [pathname, t]);

  useEffect(() => {
    if (!isReady || user) return;
    const next = pathname && pathname !== "/login" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}` as Route);
  }, [isReady, pathname, router, user]);

  const visiblePrimary = primaryNav.filter((item) => !item.minimumRole || can(item.minimumRole));
  const visibleSecondary = secondaryNav.filter((item) => !item.minimumRole || can(item.minimumRole));

  return (
    <div className="min-h-screen crm-shell-grid text-enterprise-text">
      <div className="flex min-h-screen">
        <aside className="shell-sidebar hidden w-[17.5rem] shrink-0 border-r border-enterprise-border text-enterprise-text md:flex md:flex-col">
          <div className="px-5 py-5">
            <div className="rounded-enterprise border border-transparent bg-enterprise-secondary p-4 shadow-panel">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-enterprise-primary text-base font-black text-white shadow-panel">
                  CRM
                </div>
                <div>
                  <p className="text-[0.67rem] font-bold uppercase tracking-[0.24em] text-enterprise-muted">Neumorphism</p>
                  <h1 className="font-display text-xl font-semibold tracking-tight text-enterprise-text">{t("layout.brandTitle")}</h1>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-enterprise-muted">{t("layout.brandDescription")}</p>
            </div>
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-5">
            <section>
              <p className="px-3 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-enterprise-muted">{t("common.dailyWorkflow")}</p>
              <div className="mt-2 space-y-1">
                {visiblePrimary.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <Link key={item.href} href={item.href} className={navClass(active)}>
                      <span className={cx("flex h-7 w-8 shrink-0 items-center justify-center rounded-md border text-[0.68rem] font-bold", active ? "border-white/25 bg-white/15 text-white" : "border-transparent bg-enterprise-surface text-enterprise-muted shadow-insetSoft")}>
                        {item.shortcut}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                      <span className="text-xs text-current/58 opacity-0 transition group-hover:opacity-100">{navArrow}</span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section>
              <p className="px-3 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-enterprise-muted">{t("common.administration")}</p>
              <div className="mt-2 space-y-1">
                {visibleSecondary.map((item) => (
                  <Link key={item.href} href={item.href} className={navClass(isActive(pathname, item))}>
                    <span className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-enterprise-surface text-[0.68rem] font-bold text-enterprise-muted shadow-insetSoft">{item.shortcut}</span>
                    <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                    <span className="text-xs text-current/58">{navArrow}</span>
                  </Link>
                ))}
              </div>
            </section>
          </nav>

          <div className="border-t border-enterprise-border p-4">
            <div className="rounded-enterprise border border-transparent bg-enterprise-secondary p-3 shadow-panel">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-enterprise bg-enterprise-surface text-sm font-black text-enterprise-primary shadow-insetSoft">
                  {initials(user?.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-enterprise-text">{user?.fullName ?? "CRM User"}</p>
                  <p className="force-ltr truncate text-xs text-enterprise-muted">{user?.email ?? "—"}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Badge tone={user?.role === "ADMIN" ? "emerald" : user?.role === "SALES_MANAGER" ? "sky" : "slate"}>{user?.role ?? "VIEWER"}</Badge>
                <button
                  type="button"
                  onClick={() => {
                    void signOut().finally(() => {
                      router.push("/login");
                    });
                  }}
                  className="rounded-enterprise border border-transparent bg-enterprise-surface px-3 py-2 text-xs font-bold text-enterprise-muted shadow-insetSoft hover:text-enterprise-primary"
                >
                  {t("common.signOut")}
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <header className="sticky top-0 z-30 border-b border-enterprise-border bg-enterprise-surface/92 backdrop-blur-xl">
            <div className="flex min-h-[4.5rem] items-center justify-between gap-4 px-4 md:px-6 xl:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen((current) => !current)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-enterprise border border-transparent bg-enterprise-secondary text-lg text-enterprise-primary shadow-panel md:hidden"
                  aria-label={t("layout.toggleNavigation")}
                >
                  ☰
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-enterprise-muted">
                    <span>{t("common.workspace")}</span>
                    <span className="h-1 w-1 rounded-full bg-enterprise-primary" />
                    <span className="hidden sm:inline">Cloudflare</span>
                  </div>
                  <p className="font-display truncate text-2xl font-semibold tracking-tight text-enterprise-text">{pageTitle}</p>
                </div>
              </div>

              <div className="hidden min-w-[17rem] max-w-sm flex-1 items-center rounded-enterprise border border-transparent bg-enterprise-surface px-3 py-2 shadow-insetSoft text-sm text-enterprise-muted lg:flex">
                <span className="me-2 text-enterprise-primary">⌘</span>
                <span className="truncate">{t("common.search")}</span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {user?.role ? <Badge tone={user.role === "ADMIN" ? "emerald" : "slate"}>{user.role}</Badge> : null}
                <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className={buttonStyles("secondary", "sm")}>{locale === "ar" ? t("common.english") : t("common.arabic")}</button>
                <Link href={"/contacts" as Route} className={buttonStyles("primary", "sm")}>
                  {t("common.openContacts")}
                </Link>
              </div>
            </div>
          </header>

          {mobileOpen ? (
            <div className="border-b border-enterprise-border bg-enterprise-surface px-4 py-4 md:hidden">
              <div className="grid gap-2">
                {[...visiblePrimary, ...visibleSecondary].map((item) => (
                  <Link key={item.href} href={item.href} className={mobileNavClass(isActive(pathname, item))} onClick={() => setMobileOpen(false)}>
                    <span>{t(item.labelKey)}</span>
                    <span className="text-xs text-current/70">{navArrow}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <main className="flex-1 px-4 py-6 md:px-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
