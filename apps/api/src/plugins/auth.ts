import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { assertTrustedOrigin, clearSessionCookie, readSessionToken } from "../lib/session.js";

type SessionUser = {
  sub: string;
  email: string;
  role: string;
};

export default fp(async (fastify) => {
  await fastify.register(cookie);
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.SESSION_JWT_EXPIRES_IN,
    },
  });

  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = readSessionToken(request);
    if (!token) {
      clearSessionCookie(reply, request);
      throw fastify.httpErrors.unauthorized("Authentication required");
    }

    try {
      const session = await fastify.jwt.verify<SessionUser>(token);
      request.user = session;
    } catch {
      clearSessionCookie(reply, request);
      throw fastify.httpErrors.unauthorized("Invalid or expired session");
    }
  };

  fastify.decorate("authenticate", authenticate as FastifyInstance["authenticate"]);

  fastify.addHook("onRequest", async (request) => {
    assertTrustedOrigin(request);
  });
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
