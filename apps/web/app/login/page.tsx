"use client";

import { FormEvent, Suspense, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema } from "@smartcrm/shared";
import { useI18n, useSession, useToast } from "@/components/providers";
import { apiFetch } from "@/lib/api";
import { clearStoredSession } from "@/lib/session";
import { validateSchema } from "@/lib/forms";

type LoginResponse = {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: "VIEWER" | "SALES_REP" | "SALES_MANAGER" | "ADMIN";
  };
  session: {
    cookieName: string;
    maxAgeSeconds: number;
  };
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useSession();
  const { notify } = useToast();
  const { t, locale, setLocale, isRtl } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const parsed = validateSchema(loginSchema, { email, password });
    if (!parsed.success) {
      const message = parsed.error.message;
      setError(message);
      notify({ tone: "error", title: t("login.signInFailed"), description: message });
      setLoading(false);
      return;
    }

    try {
      await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });

      const verifiedSession = await apiFetch<LoginResponse>("/auth/me");
      signIn({ user: verifiedSession.user });
      notify({ tone: "success", title: t("login.signedIn"), description: t("login.welcomeBack", { name: verifiedSession.user.fullName }) });
      const nextPath = (searchParams.get("next") || "/today") as Route;
      router.push(nextPath);
    } catch (error) {
      clearStoredSession();
      const message = error instanceof Error ? error.message : t("login.defaultError");
      setError(message);
      notify({ tone: "error", title: t("login.signInFailed"), description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="enterprise-grid-bg min-h-screen px-5 py-6 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col overflow-hidden rounded-2xl border border-enterprise-border bg-white shadow-enterprise lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden bg-enterprise-primary px-7 py-8 text-white md:px-10 lg:px-12 lg:py-12">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-enterprise-secondary/20 blur-3xl" />
          <div className="absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-enterprise-secondary text-sm font-black text-white shadow-sm">CRM</div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/48">Enterprise</p>
                <p className="font-display text-2xl font-semibold text-white">Smart CRM</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
              className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              {locale === "ar" ? t("common.english") : t("common.arabic")}
            </button>
          </div>

          <div className="relative mt-16 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-enterprise-secondary">{t("login.eyebrow")}</p>
            <h1 className="font-display mt-4 text-5xl font-semibold leading-[0.98] tracking-tight text-white md:text-6xl">
              {t("login.title")}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/72">{t("login.description")}</p>
          </div>

          <div className="relative mt-12 grid gap-3 md:grid-cols-3">
            <Feature index="01" title={t("login.featureLocaleTitle")} description={t("login.featureLocaleDescription")} />
            <Feature index="02" title={t("login.featureFormatTitle")} description={t("login.featureFormatDescription")} />
            <Feature index="03" title={t("login.featureMixedTitle")} description={t("login.featureMixedDescription")} />
          </div>
        </section>

        <section className="flex items-center px-7 py-8 md:px-10 lg:px-12">
          <div className="w-full">
            <div className="mb-8 border-b border-enterprise-border pb-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-enterprise-secondary">{t("login.formEyebrow")}</p>
              <h2 className="font-display mt-2 text-4xl font-semibold tracking-tight text-enterprise-text">{t("login.formTitle")}</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-enterprise-muted">{t("login.formDescription")}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-enterprise-text">{t("login.email")}</span>
                <input
                  className="force-ltr w-full rounded-lg border border-enterprise-border bg-white px-4 py-3 text-enterprise-text shadow-sm focus:border-enterprise-secondary focus:ring-2 focus:ring-enterprise-secondary/30"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("login.email")}
                  autoComplete="email"
                  dir="ltr"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-enterprise-text">{t("login.password")}</span>
                <input
                  className="force-ltr w-full rounded-lg border border-enterprise-border bg-white px-4 py-3 text-enterprise-text shadow-sm focus:border-enterprise-secondary focus:ring-2 focus:ring-enterprise-secondary/30"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("login.password")}
                  autoComplete="current-password"
                  dir="ltr"
                />
              </label>

              {error ? <p className="rounded-lg border border-enterprise-danger/30 bg-enterprise-danger/10 px-4 py-3 text-sm font-medium text-enterprise-danger">{error}</p> : null}

              <button type="submit" disabled={loading} className="w-full rounded-lg border border-enterprise-primary bg-enterprise-primary px-4 py-3 font-semibold text-white transition hover:bg-enterprise-primaryMuted disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? t("login.submitting") : t("login.submit")}
              </button>
            </form>
            <p className={`mt-6 text-xs text-enterprise-muted ${isRtl ? "text-right" : "text-left"}`}>{t("common.localePreview")}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function LoginPageFallback() {
  return (
    <div className="enterprise-grid-bg flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-xl border border-enterprise-border bg-white px-8 py-10 text-center shadow-enterprise">
        <p className="text-sm font-semibold text-enterprise-muted">Loading…</p>
      </div>
    </div>
  );
}

function Feature({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur">
      <p className="font-mono text-xs font-bold text-enterprise-secondary">{index}</p>
      <p className="mt-3 text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/64">{description}</p>
    </div>
  );
}
