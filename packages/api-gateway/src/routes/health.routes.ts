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

  /** GET /health/ready — readiness (checks OpenRouter key is configured) */
  fastify.get("/health/ready", async (_request, reply) => {
    const config = getConfig();
    if (!config.openRouterApiKey) {
      return reply.code(503).send({ status: "error", reason: "OPENROUTER_API_KEY not configured" });
    }
    return reply.send({
      status: "ready",
      model: config.openRouterModel,
      ts: new Date().toISOString(),
    });
  });
}
