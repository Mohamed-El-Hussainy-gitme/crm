import { FastifyReply, FastifyRequest } from "fastify";

const roleRanks: Record<string, number> = {
  VIEWER: 10,
  SALES_REP: 20,
  SALES_MANAGER: 30,
  ADMIN: 40,
};

export function hasRole(role: string | null | undefined, minimum: string) {
  return (roleRanks[role ?? ""] ?? 0) >= (roleRanks[minimum] ?? 999);
}

export function requireRole(minimum: string) {
  return async function enforce(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as FastifyRequest & { user?: { role?: string } }).user;
    if (!hasRole(user?.role, minimum)) {
      return reply.code(403).send({ message: `Requires ${minimum} role` });
    }
  };
}
