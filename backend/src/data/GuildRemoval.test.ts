import test from "ava";
import type { DataSource } from "typeorm";

/**
 * Integration tests for permanent server removal against a real, isolated MySQL database.
 *
 * These tests are destructive (they drop and recreate the schema) and are therefore skipped by
 * default. To run them:
 *
 *   1. Start an isolated MySQL server (e.g. in Docker) and create a database, for example
 *      `zeppelin_removal_test`. Create it with the utf8mb3 charset, because the schema's
 *      composite primary keys exceed utf8mb4's index size limit on MySQL 8:
 *
 *        CREATE DATABASE zeppelin_removal_test CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci;
 *
 *      The tests drop all tables in that database and rebuild the schema by running the real
 *      migrations, so the schema matches production (e.g. tables dropped by migrations such as
 *      button_roles do not exist). Never point this at production data.
 *   2. Run with the tests enabled, optionally overriding the connection env vars:
 *
 *      ZEPPELIN_REMOVAL_INTEGRATION_TEST=1 \
 *      TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=3307 TEST_DB_USER=root TEST_DB_PASSWORD=secret \
 *      pnpm --filter @zeppelinbot/backend run run-tests
 *
 * The database name must contain "removal_test"; the tests refuse to run against any other
 * database to prevent accidental data loss.
 */

const enabled = process.env.ZEPPELIN_REMOVAL_INTEGRATION_TEST === "1";
const integrationTest = enabled ? test.serial : test.serial.skip;

const GUILD_A = "900000000000000001";
const GUILD_B = "900000000000000002";
const GUILD_C = "900000000000000003";
const GUILD_OTHER = "900000000000000099";
const TEST_USER = "800000000000000001";
const NOW = "2026-01-01 00:00:00";

interface SeededGuild {
  counterId: number;
  counterValueId: number;
  caseIds: number[];
}

interface TestContext {
  dataSource: DataSource;
  removeGuildPermanently: typeof import("./GuildRemoval.js").removeGuildPermanently;
}

let context: TestContext | null = null;

async function getContext(): Promise<TestContext> {
  if (context) {
    return context;
  }

  process.env.KEY = "0".repeat(32);
  process.env.CLIENT_ID = "0".repeat(16);
  process.env.CLIENT_SECRET = "0".repeat(32);
  process.env.BOT_TOKEN = "0".repeat(50);
  process.env.DASHBOARD_URL = "http://localhost:3000";
  process.env.API_URL = "http://localhost:3001";
  process.env.DB_HOST = process.env.TEST_DB_HOST ?? "127.0.0.1";
  process.env.DB_PORT = process.env.TEST_DB_PORT ?? "3307";
  process.env.DB_USER = process.env.TEST_DB_USER ?? "root";
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? "test";
  process.env.DB_DATABASE = process.env.TEST_DB_DATABASE ?? "zeppelin_removal_test";

  const { dataSource } = await import("./dataSource.js");
  const { removeGuildPermanently } = await import("./GuildRemoval.js");

  const databaseName = String((dataSource.options as any).database ?? "");
  if (!databaseName.includes("removal_test")) {
    throw new Error(
      `Refusing to run destructive removal integration tests against database "${databaseName}". ` +
        `The database name must contain "removal_test".`,
    );
  }

  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }

  await dataSource.initialize();

  await dataSource.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const row of await dataSource.query("SHOW TABLES")) {
    const tableName = Object.values(row)[0];
    await dataSource.query(`DROP TABLE IF EXISTS \`${tableName}\``);
  }
  await dataSource.query("SET FOREIGN_KEY_CHECKS = 1");

  // Build the schema from the real migrations so it matches production (this is how the
  // button_roles incident was caught: synchronize() recreated a table that migrations drop).
  await dataSource.runMigrations();

  await dataSource.query(
    "INSERT INTO api_user_info (id, data, updated_at) VALUES (?, ?, ?)",
    [TEST_USER, JSON.stringify({ username: "test", discriminator: "0001", avatar: null }), NOW],
  );

  await dataSource.query(
    "INSERT INTO configs (id, `key`, config, is_active, edited_by, edited_at) VALUES (1, 'global', 'plugins: {}', 1, ?, ?)",
    [TEST_USER, NOW],
  );

  context = { dataSource, removeGuildPermanently };
  return context;
}

test.after.always(async () => {
  if (context) {
    await context.dataSource.destroy();
    context = null;
  }
});

async function countRows(table: string, where: string, params: unknown[]): Promise<number> {
  const rows = await context!.dataSource.query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE ${where}`, params);
  return Number(rows[0].count);
}

async function countCaseNotes(guildId: string): Promise<number> {
  return countRows("case_notes", "case_id IN (SELECT id FROM cases WHERE guild_id = ?)", [guildId]);
}

/**
 * Seeds a representative set of records for a guild: registry entry, config revisions, dashboard
 * permissions, moderation history (cases, notes, mutes, tempbans, audit log) and disposable
 * plugin data (counters and their children, tags).
 */
async function seedGuild(guildId: string, options: { configId: number }): Promise<SeededGuild> {
  const ds = context!.dataSource;

  await ds.query(
    "INSERT INTO allowed_guilds (id, name, icon, owner_id, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)",
    [guildId, `Test Server ${guildId}`, TEST_USER, NOW, NOW],
  );

  for (const [offset, isActive] of [
    [0, 1],
    [1, 0],
  ] as const) {
    await ds.query(
      "INSERT INTO configs (id, `key`, config, is_active, edited_by, edited_at) VALUES (?, ?, 'plugins: {}', ?, ?, ?)",
      [options.configId + offset, `guild-${guildId}`, isActive, TEST_USER, NOW],
    );
  }

  await ds.query(
    "INSERT INTO api_permissions (guild_id, type, target_id, permissions, expires_at) VALUES (?, 'USER', ?, 'EDIT_CONFIG', NULL)",
    [guildId, TEST_USER],
  );

  const caseIds: number[] = [];
  for (let i = 0; i < 2; i++) {
    const result = await ds.query(
      "INSERT INTO cases (guild_id, case_number, user_id, user_name, type, created_at, is_hidden) VALUES (?, ?, ?, ?, 0, ?, 0)",
      [guildId, i + 1, "700000000000000001", "Test User", NOW],
    );
    caseIds.push(result.insertId);
  }

  await ds.query("INSERT INTO case_notes (case_id, mod_id, mod_name, body, created_at) VALUES (?, ?, ?, ?, ?)", [
    caseIds[0],
    TEST_USER,
    "Test Mod",
    "A note",
    NOW,
  ]);

  await ds.query(
    "INSERT INTO mutes (guild_id, user_id, type, created_at, expires_at, case_id, roles_to_restore, mute_role, timeout_expires_at) VALUES (?, ?, 0, ?, NULL, ?, '111', NULL, NULL)",
    [guildId, "700000000000000001", NOW, caseIds[0]],
  );

  await ds.query("INSERT INTO tempbans (guild_id, user_id, mod_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", [
    guildId,
    "700000000000000002",
    TEST_USER,
    NOW,
    NOW,
  ]);

  await ds.query(
    "INSERT INTO api_audit_log (id, guild_id, author_id, event_type, event_data, created_at) VALUES (?, ?, ?, 'EDIT_CONFIG', '{}', ?)",
    [options.configId + 5, guildId, TEST_USER, NOW],
  );

  const counterResult = await ds.query(
    "INSERT INTO counters (guild_id, name, per_channel, per_user, last_decay_at, delete_at) VALUES (?, 'test', 0, 0, ?, NULL)",
    [guildId, NOW],
  );
  const counterId = counterResult.insertId;

  const triggerResult = await ds.query(
    "INSERT INTO counter_triggers (counter_id, name, comparison_op, comparison_value, reverse_comparison_op, reverse_comparison_value, delete_at) VALUES (?, 'trigger', '=', 1, '!=', 1, NULL)",
    [counterId],
  );

  const counterValueResult = await ds.query(
    "INSERT INTO counter_values (counter_id, channel_id, user_id, value) VALUES (?, ?, ?, 1)",
    [counterId, "600000000000000001", "700000000000000001"],
  );

  await ds.query("INSERT INTO counter_trigger_states (trigger_id, channel_id, user_id) VALUES (?, ?, ?)", [
    triggerResult.insertId,
    "600000000000000001",
    "700000000000000001",
  ]);

  await ds.query("INSERT INTO tags (guild_id, tag, user_id, body, created_at) VALUES (?, 'testtag', ?, 'body', ?)", [
    guildId,
    TEST_USER,
    NOW,
  ]);

  return { counterId, counterValueId: counterValueResult.insertId, caseIds };
}

integrationTest("removes configuration and registry records, keeps historical records by default", async (t) => {
  const { dataSource, removeGuildPermanently } = await getContext();
  await seedGuild(GUILD_OTHER, { configId: 6 });
  const seeded = await seedGuild(GUILD_A, { configId: 10 });

  const result = await removeGuildPermanently(GUILD_A, { deleteHistoricalData: false });

  // Counts reported for the removed records
  t.is(result.always.allowed_guilds, 1);
  t.is(result.always.configs, 2);
  t.is(result.always.api_permissions, 1);
  t.is(result.always.counters, 1);
  t.is(result.always.counter_triggers, 1);
  t.is(result.always.counter_values, 1);
  t.is(result.always.counter_trigger_states, 1);
  t.is(result.always.tags, 1);

  // Always-removed records are gone
  t.is(await countRows("allowed_guilds", "id = ?", [GUILD_A]), 0);
  t.is(await countRows("configs", "`key` = ?", [`guild-${GUILD_A}`]), 0);
  t.is(await countRows("api_permissions", "guild_id = ?", [GUILD_A]), 0);
  t.is(await countRows("counters", "guild_id = ?", [GUILD_A]), 0);
  t.is(await countRows("counter_values", "id = ?", [seeded.counterValueId]), 0);
  t.is(await countRows("counter_triggers", "counter_id = ?", [seeded.counterId]), 0);
  t.is(await countRows("tags", "guild_id = ?", [GUILD_A]), 0);

  // Historical records are kept by default
  t.is(await countRows("cases", "guild_id = ?", [GUILD_A]), 2);
  t.is(await countCaseNotes(GUILD_A), 1);
  t.is(await countRows("mutes", "guild_id = ?", [GUILD_A]), 1);
  t.is(await countRows("tempbans", "guild_id = ?", [GUILD_A]), 1);
  t.is(await countRows("api_audit_log", "guild_id = ?", [GUILD_A]), 1);

  // Other guilds and global records are untouched
  t.is(await countRows("configs", "`key` = 'global'", []), 1);
  t.is(await countRows("allowed_guilds", "id = ?", [GUILD_OTHER]), 1);
  t.is(await countRows("cases", "guild_id = ?", [GUILD_OTHER]), 2);
  t.is(await countRows("tags", "guild_id = ?", [GUILD_OTHER]), 1);

  // Sanity check: the schema (and its data) is still intact
  t.truthy(await dataSource.query("SELECT 1 FROM configs WHERE `key` = 'global'"));
});

integrationTest("deletes historical records when requested", async (t) => {
  const { removeGuildPermanently } = await getContext();
  await seedGuild(GUILD_B, { configId: 20 });

  const result = await removeGuildPermanently(GUILD_B, { deleteHistoricalData: true });

  t.is(result.historical.cases, 2);
  t.is(result.historical.case_notes, 1);
  t.is(result.historical.mutes, 1);
  t.is(result.historical.tempbans, 1);
  t.is(result.historical.api_audit_log, 1);

  t.is(await countRows("cases", "guild_id = ?", [GUILD_B]), 0);
  t.is(await countCaseNotes(GUILD_B), 0);
  t.is(await countRows("mutes", "guild_id = ?", [GUILD_B]), 0);
  t.is(await countRows("tempbans", "guild_id = ?", [GUILD_B]), 0);
  t.is(await countRows("api_audit_log", "guild_id = ?", [GUILD_B]), 0);
  t.is(await countRows("allowed_guilds", "id = ?", [GUILD_B]), 0);

  // Historical records that were kept for another guild in an earlier run are still there
  t.is(await countRows("cases", "guild_id = ?", [GUILD_A]), 2);
});

integrationTest("rolls back completely when a deletion step fails, and can be retried", async (t) => {
  const { dataSource, removeGuildPermanently } = await getContext();
  await seedGuild(GUILD_C, { configId: 30 });

  // Force a failure mid-removal: the case_notes table is needed for counting historical records
  const [createTable] = await dataSource.query("SHOW CREATE TABLE case_notes");
  await dataSource.query("DROP TABLE case_notes");
  await t.throwsAsync(() => removeGuildPermanently(GUILD_C, { deleteHistoricalData: true }));

  // Nothing was committed
  t.is(await countRows("allowed_guilds", "id = ?", [GUILD_C]), 1);
  t.is(await countRows("configs", "`key` = ?", [`guild-${GUILD_C}`]), 2);
  t.is(await countRows("cases", "guild_id = ?", [GUILD_C]), 2);
  t.is(await countRows("tags", "guild_id = ?", [GUILD_C]), 1);

  // Restore the exact table and retry safely
  await dataSource.query(createTable["Create Table"]);

  const result = await removeGuildPermanently(GUILD_C, { deleteHistoricalData: true });
  t.is(result.always.allowed_guilds, 1);
  t.is(await countRows("allowed_guilds", "id = ?", [GUILD_C]), 0);
  t.is(await countRows("tags", "guild_id = ?", [GUILD_C]), 0);
});

integrationTest("is idempotent when the server was already removed", async (t) => {
  const { removeGuildPermanently } = await getContext();

  const result = await removeGuildPermanently(GUILD_A, { deleteHistoricalData: false });

  t.deepEqual(result.always, {});
  t.is(await countRows("allowed_guilds", "id = ?", [GUILD_A]), 0);
  t.is(await countRows("configs", "`key` = ?", [`guild-${GUILD_A}`]), 0);
});
