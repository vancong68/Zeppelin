import test from "ava";

// The imported module transitively loads env.ts, which validates the environment at import time.
// Supply dummy values (without overriding real ones) so this test runs standalone.
process.env.KEY = process.env.KEY ?? "0".repeat(32);
process.env.CLIENT_ID = process.env.CLIENT_ID ?? "0".repeat(16);
process.env.CLIENT_SECRET = process.env.CLIENT_SECRET ?? "0".repeat(32);
process.env.BOT_TOKEN = process.env.BOT_TOKEN ?? "0".repeat(50);
process.env.DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:3000";
process.env.API_URL = process.env.API_URL ?? "http://localhost:3001";

const { validatePermanentRemovalRequest } = await import("./permanentRemovalRequest.js");

const GUILD_ID = "900000000000000001";

test("accepts a valid request and applies defaults", (t) => {
  const result = validatePermanentRemovalRequest(GUILD_ID, { confirmGuildId: GUILD_ID });

  t.true(result.success);
  if (result.success) {
    t.is(result.data.confirmGuildId, GUILD_ID);
    t.false(result.data.deleteHistoricalData);
    t.false(result.data.leaveDiscordServer);
  }
});

test("keeps explicitly requested options", (t) => {
  const result = validatePermanentRemovalRequest(GUILD_ID, {
    confirmGuildId: GUILD_ID,
    deleteHistoricalData: true,
    leaveDiscordServer: true,
  });

  t.true(result.success);
  if (result.success) {
    t.true(result.data.deleteHistoricalData);
    t.true(result.data.leaveDiscordServer);
  }
});

test("rejects a mismatched confirmation id", (t) => {
  const result = validatePermanentRemovalRequest(GUILD_ID, { confirmGuildId: "900000000000000002" });

  t.false(result.success);
  if (!result.success) {
    t.true(result.error.includes("Confirmation failed"));
  }
});

test("rejects invalid guild ids", (t) => {
  for (const guildId of [undefined, null, 12345, "not-a-snowflake", ""]) {
    const result = validatePermanentRemovalRequest(guildId, { confirmGuildId: GUILD_ID });
    t.false(result.success);
    if (!result.success) {
      t.is(result.error, "Invalid guild ID");
    }
  }
});

test("rejects invalid request bodies", (t) => {
  for (const body of [undefined, null, {}, { confirmGuildId: 5 }, { confirmGuildId: GUILD_ID, deleteHistoricalData: "yes" }]) {
    const result = validatePermanentRemovalRequest(GUILD_ID, body);
    t.false(result.success);
    if (!result.success) {
      t.is(result.error, "Invalid request body");
    }
  }
});
