import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "../env";

/**
 * Thin wrapper around ioredis with an in-memory fallback for dev/test when
 * REDIS_URL is not set. The fallback is only sufficient for single-process
 * use cases (rate limiting and refresh-token rotation in a single dev API).
 * Production must run with REDIS_URL configured.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private memory = new Map<string, { value: string; expiresAt: number | null }>();

  async onModuleInit(): Promise<void> {
    const url = loadEnv().REDIS_URL;
    if (!url) {
      this.logger.warn(
        "REDIS_URL not set — using in-memory fallback (single-process only).",
      );
      return;
    }
    this.client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
    try {
      await this.client.connect();
      this.logger.log("Connected to Redis");
    } catch (err) {
      this.logger.error("Redis connection failed; falling back to in-memory", err);
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    if (this.client) return this.client.get(key);
    this.purgeExpired();
    return this.memory.get(key)?.value ?? null;
  }

  async setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.client) {
      const res = await this.client.set(key, value, "EX", ttlSeconds, "NX");
      return res === "OK";
    }
    this.purgeExpired();
    if (this.memory.has(key)) return false;
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.client) {
      await this.client.set(key, value, "EX", ttlSeconds);
      return;
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    if (this.client) {
      await this.client.del(key);
      return;
    }
    this.memory.delete(key);
  }

  async delByPattern(pattern: string): Promise<number> {
    if (this.client) {
      // SCAN-based cleanup; bounded ops for our use case.
      const stream = this.client.scanStream({ match: pattern, count: 100 });
      const keys: string[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: string[]) => keys.push(...chunk));
        stream.on("end", () => resolve());
        stream.on("error", reject);
      });
      if (keys.length === 0) return 0;
      return this.client.del(...keys);
    }
    this.purgeExpired();
    let removed = 0;
    // Convert glob-ish pattern (* only) to regex
    const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    for (const key of [...this.memory.keys()]) {
      if (re.test(key)) {
        this.memory.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Sliding-window counter: count entries in [now-windowMs, now] for `key`.
   * Returns the post-increment count.
   */
  async slidingWindowIncr(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    if (this.client) {
      const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      const pipe = this.client.multi();
      pipe.zremrangebyscore(key, 0, now - windowMs);
      pipe.zadd(key, now, member);
      pipe.zcard(key);
      pipe.pexpire(key, windowMs + 1000);
      const res = await pipe.exec();
      const card = res?.[2]?.[1];
      return typeof card === "number" ? card : 0;
    }
    // Memory fallback: use a comma-separated list of timestamps
    const entry = this.memory.get(key);
    const cutoff = now - windowMs;
    const arr = entry
      ? entry.value.split(",").map(Number).filter((n) => n > cutoff)
      : [];
    arr.push(now);
    this.memory.set(key, { value: arr.join(","), expiresAt: now + windowMs + 1000 });
    return arr.length;
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.memory) {
      if (v.expiresAt !== null && v.expiresAt < now) this.memory.delete(k);
    }
  }
}
