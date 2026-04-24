export type UserRole = "VIEWER" | "SALES_REP" | "SALES_MANAGER" | "ADMIN";

export type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
};

export type StoredSession = {
  user: SessionUser;
  authenticatedAt: string;
};

const SESSION_KEY = "smartcrm_session";

const roleRank: Record<UserRole, number> = {
  VIEWER: 10,
  SALES_REP: 20,
  SALES_MANAGER: 30,
  ADMIN: 40,
};

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function normalizeRole(role: unknown): UserRole {
  if (role === "ADMIN" || role === "SALES_MANAGER" || role === "SALES_REP" || role === "VIEWER") return role;
  return "VIEWER";
}

function normalizeUser(user?: Partial<SessionUser> | null): SessionUser | null {
  if (!user?.id || !user?.email) return null;
  return {
    id: String(user.id),
    fullName: String(user.fullName || "CRM User"),
    email: String(user.email),
    role: normalizeRole(user.role),
  };
}

export function hasMinimumRole(role: UserRole | null | undefined, minimum: UserRole) {
  return (roleRank[role ?? "VIEWER"] ?? 0) >= roleRank[minimum];
}

export function storeSession(input: { user?: Partial<SessionUser> | null }) {
  if (typeof window === "undefined") return null;
  const user = normalizeUser(input.user);
  if (!user) return null;
  const session: StoredSession = { user, authenticatedAt: new Date().toISOString() };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("smartcrm:session", { detail: session }));
  return session;
}

export function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const stored = safeParse<StoredSession>(window.localStorage.getItem(SESSION_KEY));
  if (!stored?.user) return null;
  const user = normalizeUser(stored.user);
  return user ? { ...stored, user } : null;
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent("smartcrm:session", { detail: null }));
}
