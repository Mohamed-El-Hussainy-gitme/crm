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
    <div className="enterprise-grid-bg flex min-h-screen items-center justify-center px-6 py-10">
      <div className="absolute start-6 top-6">
        <button
          type="button"
          onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
          className="rounded-enterprise border border-enterprise-border bg-white px-4 py-2 text-sm font-semibold text-enterprise-text shadow-sm hover:bg-enterprise-surface"
        >
          {locale === "ar" ? t("common.english") : t("common.arabic")}
        </button>
      </div>
      <div className="grid w-full max-w-5xl overflow-hidden rounded-enterprise border border-enterprise-border bg-white shadow-enterprise lg:grid-cols-[1.05fr_0.95fr]">
        <div className="bg-enterprise-primary px-8 py-10 text-white md:px-10 md:py-12">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-enterprise-secondary">{t("login.eyebrow")}</p>
          <h1 className="font-display mt-4 text-5xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">{t("login.description")}</p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Feature title={t("login.featureLocaleTitle")} description={t("login.featureLocaleDescription")} />
            <Feature title={t("login.featureFormatTitle")} description={t("login.featureFormatDescription")} />
            <Feature title={t("login.featureMixedTitle")} description={t("login.featureMixedDescription")} />
          </div>
        </div>

        <div className="px-8 py-10 md:px-10 md:py-12">
          <div className="max-w-md">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-enterprise-secondary">{t("login.formEyebrow")}</p>
            <h2 className="font-display mt-2 text-4xl font-semibold tracking-tight text-enterprise-text">{t("login.formTitle")}</h2>
            <p className="mt-3 text-sm leading-6 text-enterprise-muted">{t("login.formDescription")}</p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-enterprise-text">{t("login.email")}</span>
              <input
                className="force-ltr w-full rounded-enterprise border border-enterprise-border bg-white px-4 py-3 text-enterprise-text shadow-sm focus:border-enterprise-secondary focus:ring-2 focus:ring-enterprise-secondary/30"
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
                className="force-ltr w-full rounded-enterprise border border-enterprise-border bg-white px-4 py-3 text-enterprise-text shadow-sm focus:border-enterprise-secondary focus:ring-2 focus:ring-enterprise-secondary/30"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("login.password")}
                autoComplete="current-password"
                dir="ltr"
              />
            </label>

            {error ? <p className="rounded-enterprise border border-enterprise-danger/30 bg-enterprise-danger/10 px-4 py-3 text-sm text-enterprise-danger">{error}</p> : null}

            <button type="submit" disabled={loading} className="w-full rounded-enterprise border border-enterprise-primary bg-enterprise-primary px-4 py-3 font-semibold text-white transition hover:bg-enterprise-primaryMuted disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? t("login.submitting") : t("login.submit")}
            </button>
          </form>
          <p className={`mt-6 text-xs text-enterprise-muted ${isRtl ? "text-right" : "text-left"}`}>{t("common.localePreview")}</p>
        </div>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="enterprise-grid-bg flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-enterprise border border-enterprise-border bg-white px-8 py-10 text-center shadow-enterprise">
        <p className="text-sm font-semibold text-enterprise-muted">Loading…</p>
      </div>
    </div>
  );
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-enterprise border border-white/20 bg-white/10 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/70">{description}</p>
    </div>
  );
}
