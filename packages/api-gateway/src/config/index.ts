function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optionalEnv(key: string, defaultValue = ""): string {
  return process.env[key] ?? defaultValue;
}

export interface Config {
  readonly env: "development" | "staging" | "production";
  readonly port: number;
  readonly host: string;

  // OpenRouter / LLM
  readonly openRouterApiKey: string;
  readonly openRouterModel: string;

  // Optional persistence (rate limiting uses Redis if available, falls back to memory)
  readonly redisUrl: string;

  // Rate limiting
  readonly rateLimitMax: number;
  readonly rateLimitWindowMs: number;
}

export function loadConfig(): Config {
  const env = optionalEnv("NODE_ENV", "development") as Config["env"];

  return {
    env,
    port: parseInt(optionalEnv("PORT", "3001"), 10),
    host: optionalEnv("HOST", "0.0.0.0"),

    openRouterApiKey: requireEnv("OPENROUTER_API_KEY"),
    openRouterModel: optionalEnv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct:free"),

    redisUrl: optionalEnv("REDIS_URL", ""),   // optional — in-memory fallback

    rateLimitMax: parseInt(optionalEnv("RATE_LIMIT_MAX", "100"), 10),
    rateLimitWindowMs: parseInt(optionalEnv("RATE_LIMIT_WINDOW_MS", "60000"), 10),
  };
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) throw new Error("Config not initialized. Call initConfig() first.");
  return _config;
}

export function initConfig(): Config {
  _config = loadConfig();
  return _config;
}
