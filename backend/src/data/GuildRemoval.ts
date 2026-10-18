import { EntityManager, EntityTarget, ObjectLiteral } from "typeorm";
import { dataSource } from "./dataSource.js";
import { AllowedGuild } from "./entities/AllowedGuild.js";
import { AntiraidLevel } from "./entities/AntiraidLevel.js";
import { ApiAuditLogEntry } from "./entities/ApiAuditLogEntry.js";
import { ApiPermissionAssignment } from "./entities/ApiPermissionAssignment.js";
import { ArchiveEntry } from "./entities/ArchiveEntry.js";
import { AutoReaction } from "./entities/AutoReaction.js";
import { ButtonRole } from "./entities/ButtonRole.js";
import { Case } from "./entities/Case.js";
import { Config } from "./entities/Config.js";
import { ContextMenuLink } from "./entities/ContextMenuLink.js";
import { Counter } from "./entities/Counter.js";
import { MemberCacheItem } from "./entities/MemberCacheItem.js";
import { MemberTimezone } from "./entities/MemberTimezone.js";
import { Mute } from "./entities/Mute.js";
import { NicknameHistoryEntry } from "./entities/NicknameHistoryEntry.js";
import { PersistedData } from "./entities/PersistedData.js";
import { PingableRole } from "./entities/PingableRole.js";
import { ReactionRole } from "./entities/ReactionRole.js";
import { Reminder } from "./entities/Reminder.js";
import { RoleButtonsItem } from "./entities/RoleButtonsItem.js";
import { RoleQueueItem } from "./entities/RoleQueueItem.js";
import { SavedMessage } from "./entities/SavedMessage.js";
import { ScheduledPost } from "./entities/ScheduledPost.js";
import { SlowmodeChannel } from "./entities/SlowmodeChannel.js";
import { SlowmodeUser } from "./entities/SlowmodeUser.js";
import { StarboardMessage } from "./entities/StarboardMessage.js";
import { StarboardReaction } from "./entities/StarboardReaction.js";
import { StatValue } from "./entities/StatValue.js";
import { Tag } from "./entities/Tag.js";
import { TagResponse } from "./entities/TagResponse.js";
import { Tempban } from "./entities/Tempban.js";
import { VCAlert } from "./entities/VCAlert.js";
import { Webhook } from "./entities/Webhook.js";

export type GuildRemovalCounts = Record<string, number>;

export interface GuildRemovalResult {
  always: GuildRemovalCounts;
  historical: GuildRemovalCounts;
}

export interface RemovalStep {
  table: string;
  count(entityManager: EntityManager, guildId: string): Promise<number>;
  delete(entityManager: EntityManager, guildId: string): Promise<void>;
}

/**
 * Deletes all records owned by a guild from a table with a `guild_id` column.
 */
function guildColumnStep<T extends ObjectLiteral>(table: string, entity: EntityTarget<T>): RemovalStep {
  return {
    table,
    count: (entityManager, guildId) => entityManager.count(entity, { where: { guild_id: guildId } as any }),
    delete: (entityManager, guildId) =>
      entityManager.delete(entity, { guild_id: guildId } as any).then(() => undefined),
  };
}

/**
 * Deletes all records from a child table that does not have a `guild_id` column,
 * using a static SQL WHERE clause with a `?` placeholder for the guild ID.
 */
function subqueryStep(table: string, whereSql: string): RemovalStep {
  return {
    table,
    async count(entityManager, guildId) {
      const rows = await entityManager.query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE ${whereSql}`, [guildId]);
      return Number(rows[0]?.count ?? 0);
    },
    async delete(entityManager, guildId) {
      await entityManager.query(`DELETE FROM \`${table}\` WHERE ${whereSql}`, [guildId]);
    },
  };
}

const CASE_NOTES_WHERE = "case_id IN (SELECT id FROM cases WHERE guild_id = ?)";
const COUNTER_VALUES_WHERE = "counter_id IN (SELECT id FROM counters WHERE guild_id = ?)";
const COUNTER_TRIGGERS_WHERE = "counter_id IN (SELECT id FROM counters WHERE guild_id = ?)";
const COUNTER_TRIGGER_STATES_WHERE =
  "trigger_id IN (SELECT id FROM counter_triggers WHERE counter_id IN (SELECT id FROM counters WHERE guild_id = ?))";

const configsStep: RemovalStep = {
  table: "configs",
  count: (entityManager, guildId) => entityManager.count(Config, { where: { key: `guild-${guildId}` } }),
  delete: (entityManager, guildId) =>
    entityManager.delete(Config, { key: `guild-${guildId}` }).then(() => undefined),
};

const allowedGuildsStep: RemovalStep = {
  table: "allowed_guilds",
  count: (entityManager, guildId) => entityManager.count(AllowedGuild, { where: { id: guildId } }),
  delete: (entityManager, guildId) => entityManager.delete(AllowedGuild, { id: guildId }).then(() => undefined),
};

/**
 * Records that are always removed when a server is permanently removed. These are either required for
 * the server to function and be managed (registry entry, config, dashboard permissions) or disposable,
 * server-owned data (plugin configuration and state, queues and caches).
 * Order matters: child records are removed before their parents.
 */
export const ALWAYS_REMOVAL_STEPS: RemovalStep[] = [
  subqueryStep("counter_trigger_states", COUNTER_TRIGGER_STATES_WHERE),
  subqueryStep("counter_values", COUNTER_VALUES_WHERE),
  subqueryStep("counter_triggers", COUNTER_TRIGGERS_WHERE),
  guildColumnStep("counters", Counter),
  guildColumnStep("antiraid_levels", AntiraidLevel),
  guildColumnStep("auto_reactions", AutoReaction),
  guildColumnStep("button_roles", ButtonRole),
  guildColumnStep("context_menus", ContextMenuLink),
  guildColumnStep("member_cache", MemberCacheItem),
  guildColumnStep("member_timezones", MemberTimezone),
  guildColumnStep("persisted_data", PersistedData),
  guildColumnStep("pingable_roles", PingableRole),
  guildColumnStep("reaction_roles", ReactionRole),
  guildColumnStep("reminders", Reminder),
  guildColumnStep("role_buttons", RoleButtonsItem),
  guildColumnStep("role_queue", RoleQueueItem),
  guildColumnStep("scheduled_posts", ScheduledPost),
  guildColumnStep("slowmode_channels", SlowmodeChannel),
  guildColumnStep("slowmode_users", SlowmodeUser),
  guildColumnStep("stats", StatValue),
  guildColumnStep("tags", Tag),
  guildColumnStep("tag_responses", TagResponse),
  guildColumnStep("vc_alerts", VCAlert),
  guildColumnStep("webhooks", Webhook),
  configsStep,
  guildColumnStep("api_permissions", ApiPermissionAssignment),
  allowedGuildsStep,
];

/**
 * Moderation and history records. These are only removed when the person removing the server
 * explicitly opts in to deleting them.
 * Order matters: child records are removed before their parents.
 */
export const HISTORICAL_REMOVAL_STEPS: RemovalStep[] = [
  subqueryStep("case_notes", CASE_NOTES_WHERE),
  guildColumnStep("mutes", Mute),
  guildColumnStep("cases", Case),
  guildColumnStep("tempbans", Tempban),
  guildColumnStep("archives", ArchiveEntry),
  guildColumnStep("messages", SavedMessage),
  guildColumnStep("nickname_history", NicknameHistoryEntry),
  guildColumnStep("starboard_reactions", StarboardReaction),
  guildColumnStep("starboard_messages", StarboardMessage),
  guildColumnStep("api_audit_log", ApiAuditLogEntry),
];

export const ALWAYS_REMOVAL_TABLES = ALWAYS_REMOVAL_STEPS.map((step) => step.table);
export const HISTORICAL_REMOVAL_TABLES = HISTORICAL_REMOVAL_STEPS.map((step) => step.table);

async function countSteps(
  entityManager: EntityManager,
  steps: RemovalStep[],
  guildId: string,
): Promise<GuildRemovalCounts> {
  const counts: GuildRemovalCounts = {};
  for (const step of steps) {
    const count = await step.count(entityManager, guildId);
    if (count > 0) {
      counts[step.table] = count;
    }
  }
  return counts;
}

/**
 * Counts all records owned by a guild, split into always-removed and historical records.
 */
export async function countGuildRecords(
  guildId: string,
  entityManager: EntityManager = dataSource.manager,
): Promise<GuildRemovalResult> {
  return {
    always: await countSteps(entityManager, ALWAYS_REMOVAL_STEPS, guildId),
    historical: await countSteps(entityManager, HISTORICAL_REMOVAL_STEPS, guildId),
  };
}

/**
 * Permanently removes a guild's data. Runs in a single transaction: either everything is deleted,
 * or nothing is. Safe to retry: a repeated call on an already-removed guild simply deletes nothing.
 */
export async function removeGuildPermanently(
  guildId: string,
  options: { deleteHistoricalData: boolean },
): Promise<GuildRemovalResult> {
  return dataSource.transaction(async (entityManager) => {
    const counts = await countGuildRecords(guildId, entityManager);

    if (options.deleteHistoricalData) {
      for (const step of HISTORICAL_REMOVAL_STEPS) {
        await step.delete(entityManager, guildId);
      }
    }

    for (const step of ALWAYS_REMOVAL_STEPS) {
      await step.delete(entityManager, guildId);
    }

    return counts;
  });
}
