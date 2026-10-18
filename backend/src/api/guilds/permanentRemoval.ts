import express, { Request, Response } from "express";
import { ApiAuditLog } from "../../data/ApiAuditLog.js";
import { AllowedGuilds } from "../../data/AllowedGuilds.js";
import { GuildRemovalCounts, countGuildRecords, removeGuildPermanently } from "../../data/GuildRemoval.js";
import { AuditLogEventTypes } from "../../data/apiAuditLogTypes.js";
import { env } from "../../env.js";
import { isSnowflake } from "../../utils.js";
import { requireStaff } from "../permissions.js";
import { clientError, serverError } from "../responses.js";
import { validatePermanentRemovalRequest } from "./permanentRemovalRequest.js";

const DISCORD_API_URL = "https://discord.com/api/v10";
const DISCORD_REQUEST_TIMEOUT = 15_000;

const allowedGuilds = new AllowedGuilds();
const auditLog = new ApiAuditLog();

function sumCounts(counts: GuildRemovalCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Makes the bot leave the Discord server. A 404 counts as success: it means the bot
 * is not (or no longer) in the server.
 */
async function leaveDiscordGuild(guildId: string): Promise<{ left: boolean; error: string | null }> {
  try {
    const response = await fetch(`${DISCORD_API_URL}/guilds/${guildId}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${env.BOT_TOKEN}` },
      signal: AbortSignal.timeout(DISCORD_REQUEST_TIMEOUT),
    });

    if (response.ok || response.status === 404) {
      return { left: true, error: null };
    }

    const body = await response.text().catch(() => "");
    const detail = body ? `: ${body.slice(0, 300)}` : "";
    return { left: false, error: `Discord API returned status ${response.status}${detail}` };
  } catch (err) {
    return { left: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function initGuildsPermanentRemovalAPI(router: express.Router) {
  const removalRouter = express.Router();

  /**
   * Returns everything that a permanent server removal would delete, for display in the
   * confirmation UI. Does not modify any data.
   */
  removalRouter.get("/:guildId/removal-preview", requireStaff(), async (req: Request, res: Response) => {
    const guildId = req.params.guildId;
    if (!isSnowflake(guildId)) {
      return clientError(res, "Invalid guild ID");
    }

    try {
      const guild = await allowedGuilds.find(guildId);
      const counts = await countGuildRecords(guildId);

      res.json({
        guild: guild ? { id: guild.id, name: guild.name, icon: guild.icon } : null,
        registryRecord: guild != null,
        always: { total: sumCounts(counts.always), byTable: counts.always },
        historical: { total: sumCounts(counts.historical), byTable: counts.historical },
      });
    } catch (err) {
      console.error(`Error while building removal preview for server ${guildId}:`, err);
      return serverError(res, `Failed to read the server's data: ${errorDetail(err)}`);
    }
  });

  /**
   * Permanently removes the server from Zeppelin. Only callable by global administrators (staff).
   * All database changes happen in a single transaction and the request can safely be retried.
   * Leaving the Discord server is a separate, explicitly requested operation.
   */
  removalRouter.post("/:guildId/permanent-removal", requireStaff(), async (req: Request, res: Response) => {
    const guildId = req.params.guildId;

    const validation = validatePermanentRemovalRequest(guildId, req.body);
    if (!validation.success) {
      return clientError(res, validation.error);
    }
    const { deleteHistoricalData, leaveDiscordServer } = validation.data;

    // Read the guild info before deleting it, for the response and the audit log entry
    const guild = await allowedGuilds.find(guildId).catch(() => null);

    let deleted;
    try {
      deleted = await removeGuildPermanently(guildId, { deleteHistoricalData });
    } catch (err) {
      console.error(`Error while permanently removing server ${guildId}:`, err);
      return serverError(
        res,
        `Failed to remove the server; no changes were committed. You can retry safely. Cause: ${errorDetail(err)}`,
      );
    }

    const discord: { requested: boolean; left: boolean | null; error: string | null } = {
      requested: leaveDiscordServer,
      left: null,
      error: null,
    };

    if (leaveDiscordServer) {
      const result = await leaveDiscordGuild(guildId);
      discord.left = result.left;
      discord.error = result.error;
    }

    const alwaysTotal = sumCounts(deleted.always);
    const historicalTotal = sumCounts(deleted.historical);
    const alreadyRemoved = guild == null && alwaysTotal === 0;

    // The audit log entry is written after the transaction so it survives even when
    // historical records (including the audit log) were deleted.
    auditLog.addEntry(guildId, req.user!.userId, AuditLogEventTypes.PERMANENT_GUILD_REMOVAL, {
      guild_name: guild?.name ?? null,
      delete_historical_data: deleteHistoricalData,
      leave_discord_server: leaveDiscordServer,
      deleted_always_total: alwaysTotal,
      deleted_historical_total: deleteHistoricalData ? historicalTotal : 0,
      discord_left: discord.left,
    });

    res.json({
      result: "ok",
      guildId,
      alreadyRemoved,
      deleteHistoricalData,
      deleted: {
        always: deleted.always,
        historical: deleted.historical,
      },
      discord,
    });
  });

  router.use("/", removalRouter);
}
