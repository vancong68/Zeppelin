export interface LeaveDiscordResult {
  left: boolean;
  alreadyGone: boolean;
  retryable: boolean;
  error: string | null;
}

const DISCORD_API_URL = "https://discord.com/api/v10";
const DISCORD_REQUEST_TIMEOUT = 15_000;

function errorCode(body: string): unknown {
  try {
    return (JSON.parse(body) as { code?: unknown } | null)?.code ?? null;
  } catch {
    return null;
  }
}

/**
 * Classifies the response to DELETE /guilds/{id}. A 404 (the server no longer exists) and a
 * 403 with 50001 Missing Access (the bot is not a member) both mean there is nothing left to
 * leave. Only genuinely transient failures are marked as retryable.
 */
export function classifyLeaveResponse(status: number, body: string): LeaveDiscordResult {
  if (status >= 200 && status < 300) {
    return { left: true, alreadyGone: false, retryable: false, error: null };
  }

  if (status === 404 || (status === 403 && errorCode(body) === 50001)) {
    return { left: true, alreadyGone: true, retryable: false, error: null };
  }

  const detail = body ? `: ${body.slice(0, 300)}` : "";
  return {
    left: false,
    alreadyGone: false,
    retryable: status >= 500 || status === 429,
    error: `Discord API returned status ${status}${detail}`,
  };
}

/**
 * Makes the bot leave the Discord server. A 404 and a 403 with 50001 Missing Access both count
 * as success: in both cases the bot is not (or no longer) in the server.
 */
export async function leaveDiscordGuild(guildId: string, botToken: string): Promise<LeaveDiscordResult> {
  try {
    const response = await fetch(`${DISCORD_API_URL}/guilds/${guildId}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT),
    });

    const body = await response.text().catch(() => "");
    return classifyLeaveResponse(response.status, body);
  } catch (err) {
    return {
      left: false,
      alreadyGone: false,
      retryable: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
