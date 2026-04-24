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
  const [email, setEmail] = useState("admin@smartcrm.local");
  const [password, setPassword] = useState("Admin123!");
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <div className="absolute start-6 top-6">
        <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
          {locale === "ar" ? t("common.english") : t("common.arabic")}
        </button>
      </div>
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-xl shadow-slate-200/60 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="bg-slate-900 px-8 py-10 text-white md:px-10 md:py-12">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-300">{t("login.eyebrow")}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">{t("login.description")}</p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <Feature title={t("login.featureLocaleTitle")} description={t("login.featureLocaleDescription")} />
            <Feature title={t("login.featureFormatTitle")} description={t("login.featureFormatDescription")} />
            <Feature title={t("login.featureMixedTitle")} description={t("login.featureMixedDescription")} />
          </div>
        </div>

        <div className="px-8 py-10 md:px-10 md:py-12">
          <div className="max-w-md">
            <p className="text-sm font-medium text-sky-700">{t("login.formEyebrow")}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{t("login.formTitle")}</h2>
            <p className="mt-3 text-sm text-slate-500">{t("login.formDescription")}</p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">{t("login.email")}</span>
              <input className="force-ltr w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("login.email")} autoComplete="email" dir="ltr" />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">{t("login.password")}</span>
              <input className="force-ltr w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("login.password")} autoComplete="current-password" dir="ltr" />
            </label>

            {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

            <button type="submit" disabled={loading} className="w-full rounded-2xl bg-sky-600 px-4 py-3 font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? t("login.submitting") : t("login.submit")}
            </button>
          </form>
          <p className={`mt-6 text-xs text-slate-400 ${isRtl ? "text-right" : "text-left"}`}>{t("common.localePreview")}</p>
        </div>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white px-8 py-10 text-center shadow-xl shadow-slate-200/60">
        <p className="text-sm font-medium text-slate-500">Loading…</p>
      </div>
    </div>
  );
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}
