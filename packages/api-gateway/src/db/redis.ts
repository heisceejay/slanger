import Redis from "ioredis";
import { getConfig } from "../config/index.js";

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) throw new Error("Redis not initialized. Call initRedis() first.");
  return _redis;
}

export function initRedis(): Redis {
  const config = getConfig();

  _redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  _redis.on("error", (err) => {
    console.error("[redis] connection error:", err);
  });

  _redis.on("ready", () => {
    console.log("[redis] connected");
  });

  return _redis;
}

export async function closeRedis() {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 7 days

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds = DEFAULT_TTL
): Promise<void> {
  const redis = getRedis();
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(key);
}
