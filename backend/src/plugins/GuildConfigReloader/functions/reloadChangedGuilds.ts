import { Snowflake } from "discord.js";
import { GlobalPluginData } from "vety";
import { SECONDS } from "../../../utils.js";
import { GuildConfigReloaderPluginType } from "../types.js";

const CHECK_INTERVAL = 1 * SECONDS;

export async function reloadChangedGuilds(pluginData: GlobalPluginData<GuildConfigReloaderPluginType>) {
  if (pluginData.state.unloaded) return;

  const changedConfigs = await pluginData.state.guildConfigs.getActiveLargerThanId(pluginData.state.highestConfigId);
  for (const item of changedConfigs) {
    if (!item.key.startsWith("guild-")) continue;

    const guildId = item.key.slice("guild-".length) as Snowflake;
    // tslint:disable-next-line:no-console
    console.log(`Config changed, reloading guild ${guildId}`);
    await pluginData.getVetyInstance().reloadGuild(guildId);

    if (item.id > pluginData.state.highestConfigId) {
      pluginData.state.highestConfigId = item.id;
    }
  }

  // Notice servers that were removed from (or added to) the allowed servers registry, so
  // permanently removed servers are unloaded from memory and re-added servers are loaded again
  const currentGuildIds = await pluginData.state.allowedGuilds.getAllIds();

  for (const guildId of pluginData.state.knownGuildIds) {
    if (!currentGuildIds.has(guildId)) {
      // tslint:disable-next-line:no-console
      console.log(`Server ${guildId} is no longer an allowed server, unloading`);
      pluginData.state.knownGuildIds.delete(guildId);
      await pluginData.getVetyInstance().unloadGuild(guildId);
    }
  }

  for (const guildId of currentGuildIds) {
    if (!pluginData.state.knownGuildIds.has(guildId)) {
      // tslint:disable-next-line:no-console
      console.log(`Server ${guildId} was added to the allowed servers, loading`);
      pluginData.state.knownGuildIds.add(guildId);
      await pluginData.getVetyInstance().reloadGuild(guildId);
    }
  }

  pluginData.state.nextCheckTimeout = setTimeout(() => reloadChangedGuilds(pluginData), CHECK_INTERVAL);
}
