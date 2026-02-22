import type { FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";

/**
 * Assigns a correlation ID to every request.
 * ID comes from X-Request-ID header or is generated as a UUID.
 * The ID is echoed back in the response header and API envelope.
 */
export function requestIdMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: () => void
): void {
  const incoming = request.headers["x-request-id"];
  request.id = typeof incoming === "string" ? incoming : randomUUID();
  done();
}
