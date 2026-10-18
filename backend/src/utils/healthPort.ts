/**
 * Resolves the port for the bot's health check HTTP server.
 *
 * - `BOT_HEALTH_PORT` (if set and non-empty) takes precedence. `0` disables
 *   the health server even if Render's `PORT` is present.
 * - Otherwise the server binds to Render's injected `PORT` in production.
 * - In development it's disabled unless `BOT_HEALTH_PORT` is set.
 *
 * Invalid values resolve to `0` (disabled).
 */
export function resolveHealthPort(env: {
  BOT_HEALTH_PORT?: string;
  NODE_ENV?: string;
  PORT?: string;
}): number {
  const override = env.BOT_HEALTH_PORT?.trim();
  if (override) {
    return parsePort(override);
  }

  if (env.NODE_ENV === "production" && env.PORT) {
    return parsePort(env.PORT);
  }

  return 0;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return 0;
  }

  return port;
}
