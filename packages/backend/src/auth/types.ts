export const USER_ROLES = ["VIEWER", "SALES_REP", "SALES_MANAGER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type AuthUser = {
  id: string;
  authUserId?: string;
  fullName: string;
  email: string;
  role: UserRole;
};

const ROLE_SET = new Set<string>(USER_ROLES);

export function normalizeUserRole(value: unknown): UserRole {
  return typeof value === "string" && ROLE_SET.has(value) ? (value as UserRole) : "VIEWER";
}

export function toAuthUser(input: {
  id?: unknown;
  authUserId?: unknown;
  fullName?: unknown;
  email?: unknown;
  role?: unknown;
}): AuthUser | null {
  if (!input.id || !input.email) return null;

  const user: AuthUser = {
    id: String(input.id),
    fullName: String(input.fullName || "CRM User"),
    email: String(input.email),
    role: normalizeUserRole(input.role),
  };

  if (input.authUserId) {
    user.authUserId = String(input.authUserId);
  }

  return user;
}
