import { createClient, SetOptions } from "redis";
import { env } from "../env.js";

// Silly type inference issue... https://github.com/redis/node-redis/issues/1732#issuecomment-979977316
type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let redisErrorWarned = false;

/**
 * Returns the shared Redis client without blocking: the connection is
 * established in the background. Redis is only used as an optional cache,
 * so a missing or unreachable Redis instance must never take the bot/API
 * down. Callers should check `isReady` and fall back to no caching when
 * it's false.
 */
export function getRedis(): RedisClient | null {
  if (client) return client;

  client = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: 5000,
    },
  });

  // Prevent unhandled 'error' events from crashing the process. node-redis
  // keeps retrying in the background, and caching resumes automatically
  // once the connection is established.
  client.on("error", (err) => {
    if (!redisErrorWarned) {
      redisErrorWarned = true;
      console.warn(`[redis] Connection failed (${err.message}); continuing without Redis cache`);
    }
  });

  client.connect().catch(() => {
    // Errors are handled by the 'error' listener above; no-op here.
  });

  return client;
}

export async function redisGet(key: string): Promise<string | null> {
  const redisClient = getRedis();
  if (!redisClient?.isReady) return null;
  try {
    return await redisClient.get(key);
  } catch (err) {
    console.warn(`[redis] get failed: ${err.message}`);
    return null;
  }
}

export async function redisSet(key: string, value: string, options: SetOptions): Promise<void> {
  const redisClient = getRedis();
  if (!redisClient?.isReady) return;
  try {
    await redisClient.set(key, value, options);
  } catch (err) {
    console.warn(`[redis] set failed: ${err.message}`);
  }
}
