import "dotenv/config";
import { initConfig, getConfig } from "./config/index.js";
import { initClient } from "@slanger/llm-orchestrator";
import { buildApp } from "./app.js";

async function start() {
  // 1. Load config — fails fast on missing GEMINI_API_KEY / LLM_API_KEY
  const config = initConfig();

  // 2. Initialize LLM client (defaults to Gemini 2.5 Flash)
  initClient({
    apiKey: config.llmApiKey,
    model: config.llmModel,
  });

  // 3. Start server
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Slanger API running on ${config.host}:${config.port} [${config.env}]`);
  } catch (err) {
    app.log.error(err, "Failed to start server");
    process.exit(1);
  }

  // 4. Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    app.log.info("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    app.log.error({ reason }, "Unhandled promise rejection");
    void shutdown("unhandledRejection");
  });
}

void start();
