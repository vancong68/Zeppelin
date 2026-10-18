import { BasePluginType } from "vety";
import { z } from "zod";
import { AllowedGuilds } from "../../data/AllowedGuilds.js";
import { Configs } from "../../data/Configs.js";
import Timeout = NodeJS.Timeout;

export const zGuildConfigReloaderPluginConfig = z.strictObject({});

export interface GuildConfigReloaderPluginType extends BasePluginType {
  configSchema: typeof zGuildConfigReloaderPluginConfig;
  state: {
    guildConfigs: Configs;
    allowedGuilds: AllowedGuilds;
    knownGuildIds: Set<string>;
    unloaded: boolean;
    highestConfigId: number;
    nextCheckTimeout: Timeout;
  };
}
