/**
 * LLM result cache — Redis-backed.
 *
 * Cache key strategy:
 *   slanger:llm:{operation}:{sha256(serialized_request)}
 *
 * TTLs are operation-specific (see CACHE_TTLS in types.ts).
 * Cache is invalidated automatically on language version bump.
 */

// Use Web Crypto API (available in Node 20+)
async function sha256(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,16);
}
import type { OperationName, CacheConfig } from "./types.js";
import { CACHE_TTLS } from "./types.js";

// ─── Cache interface (injectable — Redis or in-memory for tests) ──────────────

export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Delete all keys matching a prefix pattern */
  delByPrefix(prefix: string): Promise<number>;
}

// ─── In-memory backend (used in tests / when Redis is unavailable) ───────────

export class MemoryCache implements CacheBackend {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> { this.store.delete(key); }

  async delByPrefix(prefix: string): Promise<number> {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) { this.store.delete(key); count++; }
    }
    return count;
  }

  /** Test helper — peek at cache size */
  get size(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
}

// ─── Redis backend ────────────────────────────────────────────────────────────

export class RedisCache implements CacheBackend {
  constructor(private readonly redis: {
    get(key: string): Promise<string | null>;
    setex(key: string, seconds: number, value: string): Promise<unknown>;
    del(key: string): Promise<unknown>;
    keys(pattern: string): Promise<string[]>;
  }) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.setex(key, ttlSeconds, value);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async delByPrefix(prefix: string): Promise<number> {
    const keys = await this.redis.keys(`${prefix}*`);
    if (keys.length === 0) return 0;
    for (const k of keys) await this.redis.del(k);
    return keys.length;
  }
}

// ─── Cache manager ────────────────────────────────────────────────────────────

export class LLMCache {
  constructor(
    private readonly backend: CacheBackend,
    private readonly keyPrefix = "slanger:llm:"
  ) {}

  buildKeySync(operation: OperationName, request: unknown): string {
    // Simple sync hash: djb2 on JSON string
    const str = JSON.stringify(request);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    const hash = (h >>> 0).toString(16).padStart(8, "0");
    return `${this.keyPrefix}${operation}:${hash}`;
  }

  async get<T>(operation: OperationName, request: unknown): Promise<{ data: T; key: string } | null> {
    const key = this.buildKeySync(operation, request);
    const raw = await this.backend.get(key);
    if (!raw) return null;
    try {
      return { data: JSON.parse(raw) as T, key };
    } catch {
      return null;
    }
  }

  async set<T>(
    operation: OperationName,
    request: unknown,
    data: T,
    config?: Partial<CacheConfig>
  ): Promise<string> {
    const key = this.buildKeySync(operation, request);
    const ttl = config?.ttl ?? CACHE_TTLS[operation];
    await this.backend.set(key, JSON.stringify(data), ttl);
    return key;
  }

  /**
   * Invalidate all cached results for a given language.
   * Called when the language version bumps.
   */
  async invalidateLanguage(languageId: string): Promise<number> {
    return this.backend.delByPrefix(`${this.keyPrefix}${languageId}:`);
  }

  async del(operation: OperationName, request: unknown): Promise<void> {
    const key = this.buildKeySync(operation, request);
    await this.backend.del(key);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _cache: LLMCache | null = null;

export function initCache(backend: CacheBackend): LLMCache {
  _cache = new LLMCache(backend);
  return _cache;
}

export function getCache(): LLMCache {
  if (!_cache) {
    // Fallback to in-memory cache if not initialized (e.g. in tests)
    _cache = new LLMCache(new MemoryCache());
  }
  return _cache;
}
