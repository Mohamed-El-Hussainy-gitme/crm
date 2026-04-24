import { FastifyInstance } from "fastify";
import { z } from "zod";
import { loginSchema } from "@smartcrm/shared";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../lib/security.js";
import { clearSessionCookie, setSessionCookie } from "../../lib/session.js";

const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

function sessionMeta() {
  return {
    cookieName: env.SESSION_COOKIE_NAME,
    maxAgeSeconds: env.SESSION_MAX_AGE_SECONDS,
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const session = request.user;
    const user = await prisma.user.findUnique({ where: { id: session.sub } });
    if (!user) {
      clearSessionCookie(reply, request);
      return reply.unauthorized("Session user not found");
    }

    return {
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      session: sessionMeta(),
    };
  });

  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.conflict("Email already exists");
    }

    const user = await prisma.user.create({
      data: {
        fullName: body.fullName,
        email: body.email,
        passwordHash: await hashPassword(body.password),
      },
    });

    return reply.code(201).send({ id: user.id, email: user.email, fullName: user.fullName });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      return reply.unauthorized("Invalid credentials");
    }

    const token = await reply.jwtSign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: env.SESSION_JWT_EXPIRES_IN },
    );

    setSessionCookie(reply, request, token);

    return {
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      session: sessionMeta(),
    };
  });

  app.post("/auth/logout", async (request, reply) => {
    clearSessionCookie(reply, request);
    return { ok: true };
  });
}
