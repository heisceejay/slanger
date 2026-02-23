import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { getConfig } from "./config/index.js";
import { healthRoutes } from "./routes/health.routes.js";
import { llmRoutes } from "./routes/llm.routes.js";

export async function buildApp() {
  const config = getConfig();

  const fastify = Fastify({
    logger: config.env === "production" ? { level: "info" } : { level: "debug" },
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024, // 2 MB — full LanguageDefinitions can be large
    connectionTimeout: 120_000,  // LLM can be slow on long generations
    keepAliveTimeout: 5_000,
  });

  // ─── Plugins ────────────────────────────────────────────────────────────────

  // await fastify.register(helmet, {
  //   contentSecurityPolicy: config.env === "production",
  // });

  await fastify.register(cors, {
    origin: (origin, cb) => cb(null, true),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Request-ID", "Origin", "Accept"],
    credentials: true,
  });

  // Rate limiting — Redis if configured, otherwise in-memory
  let redisClient: import("ioredis").Redis | null = null;
  if (config.redisUrl) {
    try {
      const { Redis } = await import("ioredis");
      redisClient = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      await redisClient.connect();
      fastify.log.info("Rate limiting: Redis");
    } catch {
      redisClient = null;
      fastify.log.warn("Redis unavailable — using in-memory rate limiting");
    }
  } else {
    fastify.log.info("Rate limiting: in-memory (REDIS_URL not set)");
  }

  await fastify.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    ...(redisClient ? { redis: redisClient } : {}),
    keyGenerator: (request) => `ip:${request.ip}`,
    errorResponseBuilder: (_request, context) => ({
      data: null,
      errors: [{ code: "RATE_LIMITED", message: `Too many requests. Retry after ${Math.ceil(context.ttl / 1000)}s.` }],
    }),
  });

  // ─── OpenAPI ─────────────────────────────────────────────────────────────────

  await fastify.register(swagger, {
    openapi: {
      info: { title: "Slanger API", description: "AI-Assisted Conlang Generator", version: "1.0.0" },
      servers: [{ url: "https://api.slanger.app" }],
    },
  });

  await fastify.register(swaggerUi, { routePrefix: "/docs", uiConfig: { deepLinking: true } });

  // ─── Routes ─────────────────────────────────────────────────────────────────

  await fastify.register(healthRoutes);
  await fastify.register(llmRoutes);

  // ─── Error handlers ──────────────────────────────────────────────────────────

  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error({ err: error, requestId: request.id }, "Unhandled error");
    const statusCode = error.statusCode ?? 500;
    void reply.code(statusCode).send({
      data: null,
      errors: [{
        code: error.code ?? "INTERNAL_ERROR",
        message: statusCode >= 500 ? "An internal server error occurred." : error.message,
      }],
    });
  });

  fastify.setNotFoundHandler((request, reply) => {
    void reply.code(404).send({
      data: null,
      errors: [{ code: "NOT_FOUND", message: `${request.method} ${request.url} not found.` }],
    });
  });

  return fastify;
}
