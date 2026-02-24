import type { FastifyInstance } from "fastify";
import { getConfig } from "../config/index.js";

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {

  /** GET /health — liveness (always 200 if the process is running) */
  fastify.get("/health", async (_request, reply) => {
    return reply.send({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      ts: new Date().toISOString(),
    });
  });

  /** GET /health/ready — readiness (checks LLM key is configured) */
  fastify.get("/health/ready", async (_request, reply) => {
    const config = getConfig();
    if (!config.llmApiKey) {
      return reply.code(503).send({ status: "error", reason: "GEMINI_API_KEY/LLM_API_KEY not configured" });
    }
    return reply.send({
      status: "ok",
      model: config.llmModel,
      rateLimit: `${config.rateLimitMax} req / ${config.rateLimitWindowMs / 1000}s`,
    });
  });
}
