"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  clearStoredSession,
  hasMinimumRole,
  readStoredSession,
  storeSession,
  type SessionUser,
  type StoredSession,
  type UserRole,
} from "@/lib/session";
import {
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  formatNumber,
  formatTimeOnly,
  labelForCompletionResult,
  labelForDealStage,
  labelForPipelineStage,
  labelForPriority,
  labelForStatus,
  labelForTaskType,
  localeDir,
  resolveLocale,
  translate,
  type Locale,
} from "@/lib/i18n";

type SessionContextValue = {
  session: StoredSession | null;
  user: SessionUser | null;
  role: UserRole | null;
  isReady: boolean;
  signIn: (input: { user?: Partial<SessionUser> | null }) => void;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  can: (minimum: UserRole) => boolean;
};

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastContextValue = {
  notify: (input: Omit<ToastItem, "id">) => void;
};

type LocaleContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  isRtl: boolean;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, vars?: Record<string, string | number | null | undefined>) => string;
  formatDateTime: (value?: string | number | Date | null, fallback?: string) => string;
  formatDate: (value?: string | number | Date | null, fallback?: string) => string;
  formatTime: (value?: string | number | Date | null, fallback?: string) => string;
  formatNumber: (value?: string | number | null, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value?: string | number | null) => string;
  labelPipelineStage: (value?: string | null) => string;
  labelDealStage: (value?: string | null) => string;
  labelTaskType: (value?: string | null) => string;
  labelPriority: (value?: string | null) => string;
  labelStatus: (value?: string | null) => string;
  labelCompletionResult: (value?: string | null) => string;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const ToastContext = createContext<ToastContextValue | null>(null);
const LocaleContext = createContext<LocaleContextValue | null>(null);
const LOCALE_KEY = "smartcrm_locale";

function toastClasses(tone: ToastTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-slate-200 bg-white text-slate-900";
}

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const rawStored = window.localStorage.getItem(LOCALE_KEY);
  if (rawStored === "ar" || rawStored === "en") return rawStored;
  return resolveLocale(window.navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en");
}

export function Providers({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const dir = localeDir(locale);
    html.lang = locale;
    html.dir = dir;
    document.body.dataset.locale = locale;
    document.body.dataset.dir = dir;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_KEY, locale);
    }
  }, [locale]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const stored = readStoredSession();
      if (!mounted) return;
      setSession(stored);

      try {
        const response = await apiFetch<{ user: SessionUser }>("/auth/me");
        if (!mounted) return;
        const next = storeSession({ user: response.user });
        setSession(next);
      } catch {
        clearStoredSession();
        if (mounted) {
          setSession(null);
        }
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    };

    void bootstrap();

    const syncSession = (event: Event) => {
      const detail = (event as CustomEvent<StoredSession | null>).detail;
      setSession(detail ?? readStoredSession());
    };

    window.addEventListener("smartcrm:session", syncSession as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener("smartcrm:session", syncSession as EventListener);
    };
  }, []);

  const notify = (input: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { ...input, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3200);
  };

  const refreshSession = async () => {
    const response = await apiFetch<{ user: SessionUser }>("/auth/me");
    const next = storeSession({ user: response.user });
    setSession(next);
  };

  const sessionValue = useMemo<SessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      role: session?.user.role ?? null,
      isReady,
      signIn: (input) => {
        const next = storeSession(input);
        setSession(next);
      },
      signOut: async () => {
        try {
          await apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" });
        } catch {
          // Fall through and clear the local session even if the backend cookie was already missing.
        }
        clearStoredSession();
        setSession(null);
      },
      refreshSession,
      can: (minimum) => hasMinimumRole(session?.user.role ?? null, minimum),
    }),
    [isReady, session],
  );

  const localeValue = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: localeDir(locale),
      isRtl: locale === "ar",
      setLocale: (next) => setLocaleState(resolveLocale(next)),
      toggleLocale: () => setLocaleState((current) => (current === "ar" ? "en" : "ar")),
      t: (key, vars) => translate(locale, key, vars),
      formatDateTime: (value, fallback) => formatDateTime(locale, value, fallback),
      formatDate: (value, fallback) => formatDateOnly(locale, value, fallback),
      formatTime: (value, fallback) => formatTimeOnly(locale, value, fallback),
      formatNumber: (value, options) => formatNumber(locale, value, options),
      formatCurrency: (value) => formatCurrency(locale, value),
      labelPipelineStage: (value) => labelForPipelineStage(locale, value),
      labelDealStage: (value) => labelForDealStage(locale, value),
      labelTaskType: (value) => labelForTaskType(locale, value),
      labelPriority: (value) => labelForPriority(locale, value),
      labelStatus: (value) => labelForStatus(locale, value),
      labelCompletionResult: (value) => labelForCompletionResult(locale, value),
    }),
    [locale],
  );

  return (
    <SessionContext.Provider value={sessionValue}>
      <LocaleContext.Provider value={localeValue}>
        <ToastContext.Provider value={{ notify }}>
          {children}
          <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] mx-auto flex max-w-xl flex-col gap-3 px-3">
            {toasts.map((toast) => (
              <div key={toast.id} className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg shadow-slate-900/5 ${toastClasses(toast.tone)}`}>
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description ? <p className="mt-1 text-sm opacity-80">{toast.description}</p> : null}
              </div>
            ))}
          </div>
        </ToastContext.Provider>
      </LocaleContext.Provider>
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within Providers");
  }
  return value;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within Providers");
  }
  return value;
}

export function useI18n() {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useI18n must be used within Providers");
  }
  return value;
}
