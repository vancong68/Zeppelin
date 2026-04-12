import { Snowflake } from "discord.js";
import humanizeDuration from "humanize-duration";
import { GuildPluginData } from "knub";
import { ERRORS, RecoverablePluginError } from "../../../RecoverablePluginError";
import { CaseTypes } from "../../../data/CaseTypes";
import { AddMuteParams } from "../../../data/GuildMutes";
import { MuteTypes } from "../../../data/MuteTypes";
import { Case } from "../../../data/entities/Case";
import { Mute } from "../../../data/entities/Mute";
import { registerExpiringMute } from "../../../data/loops/expiringMutesLoop";

const TIMEOUT_MAX = 27 * 24 * 60 * 60 * 1000;

import { LogsPlugin } from "../../../plugins/Logs/LogsPlugin";
import { TemplateParseError, TemplateSafeValueContainer, renderTemplate } from "../../../templateFormatter";
import {
  UserNotificationMethod,
  UserNotificationResult,
  noop,
  notifyUser,
  resolveMember,
  resolveUser,
  ucfirst,
} from "../../../utils";
import { muteLock } from "../../../utils/lockNameHelpers";
import { userToTemplateSafeUser } from "../../../utils/templateSafeObjects";
import { CasesPlugin } from "../../Cases/CasesPlugin";
import { RoleManagerPlugin } from "../../RoleManager/RoleManagerPlugin";
import { MuteOptions, MutesPluginType } from "../types";
import { getDefaultMuteType } from "./getDefaultMuteType";
import { getTimeoutExpiryTime } from "./getTimeoutExpiryTime";

/**
 * TODO: Clean up this function
 */
export async function muteUser(
  pluginData: GuildPluginData<MutesPluginType>,
  userId: string,
  muteTime?: number,
  reason?: string,
  muteOptions: MuteOptions = {},
  removeRolesOnMuteOverride: boolean | string[] | null = null,
  restoreRolesOnMuteOverride: boolean | string[] | null = null,
) {
  const lock = await pluginData.locks.acquire(muteLock({ id: userId }));

  const muteRole = pluginData.config.get().mute_role;
  const muteType = getDefaultMuteType(pluginData);

  const muteExpiresAt = muteTime ? Date.now() + muteTime : null;
  const timeoutUntil = getTimeoutExpiryTime(muteExpiresAt);

  // APPLY PATCH: limit timeout duration
  if (muteType === MuteTypes.Timeout) {
    if (muteTime && muteTime > TIMEOUT_MAX) muteTime = TIMEOUT_MAX;
    if (!muteTime) muteTime = TIMEOUT_MAX;
  }

  // No mod specified -> mark Zeppelin as the mod
  if (!muteOptions.caseArgs?.modId) {
    muteOptions.caseArgs = muteOptions.caseArgs ?? {};
    muteOptions.caseArgs.modId = pluginData.client.user!.id;
  }

  const user = await resolveUser(pluginData.client, userId);
  if (!user.id) {
    lock.unlock();
    throw new RecoverablePluginError(ERRORS.INVALID_USER);
  }

  const member = await resolveMember(pluginData.client, pluginData.guild, user.id, true);
  const config = await pluginData.config.getMatchingConfig({ member, userId });

  const logs = pluginData.getPlugin(LogsPlugin);

  let rolesToRestore: string[] = [];

  if (member) {
    const currentUserRoles = [...member.roles.cache.keys()];
    let newRoles: string[] = currentUserRoles;

    const removeRoles = removeRolesOnMuteOverride ?? config.remove_roles_on_mute;
    const restoreRoles = restoreRolesOnMuteOverride ?? config.restore_roles_on_mute;

    if (!Array.isArray(removeRoles)) {
      if (removeRoles) {
        const managedRoles = pluginData.guild.roles.cache.filter((x) => x.managed).map((y) => y.id);
        newRoles = currentUserRoles.filter((r) => managedRoles.includes(r));
        await member.roles.set(newRoles as Snowflake[]);
      }
    } else {
      newRoles = currentUserRoles.filter((x) => !(<string[]>removeRoles).includes(x));
      await member.roles.set(newRoles as Snowflake[]);
    }

    if (!Array.isArray(restoreRoles)) {
      if (restoreRoles) rolesToRestore = currentUserRoles;
    } else {
      rolesToRestore = currentUserRoles.filter((x) => (<string[]>restoreRoles).includes(x));
    }

    if (muteType === MuteTypes.Role) {
      const actualMuteRole = pluginData.guild.roles.cache.get(muteRole!);
      if (!actualMuteRole) {
        lock.unlock();
        logs.logBotAlert({ body: `Cannot mute users, specified mute role Id is invalid` });
        throw new RecoverablePluginError(ERRORS.INVALID_MUTE_ROLE_ID);
      }

      const zep = await pluginData.guild.members.fetchMe();
      const zepRoles = pluginData.guild.roles.cache.filter((x) => zep.roles.cache.has(x.id));

      if (zepRoles.size === 0 || !zepRoles.some((r) => r.position > actualMuteRole.position)) {
        lock.unlock();
        logs.logBotAlert({
          body: `Cannot mute user, specified mute role is above Zeppelin in the role hierarchy`,
        });
        throw new RecoverablePluginError(ERRORS.MUTE_ROLE_ABOVE_ZEP, pluginData.guild);
      }

      if (!currentUserRoles.includes(muteRole!)) {
        pluginData.getPlugin(RoleManagerPlugin).addPriorityRole(member.id, muteRole!);
      }
    } else {
      if (!member.manageable) {
        lock.unlock();
        logs.logBotAlert({
          body: `Cannot mute user, specified user is above Zeppelin in the role hierarchy`,
        });
        throw new RecoverablePluginError(ERRORS.USER_ABOVE_ZEP, pluginData.guild);
      }

      if (!member.moderatable) {
        lock.unlock();
        logs.logBotAlert({
          body: `Cannot mute user, specified user is not moderatable`,
        });
        throw new RecoverablePluginError(ERRORS.USER_NOT_MODERATABLE, pluginData.guild);
      }

      await member.disableCommunicationUntil(timeoutUntil).catch(noop);
    }

    const cfg = pluginData.config.get();
    const moveToVoiceChannel = cfg.kick_from_voice_channel ? null : cfg.move_to_voice_channel;

    if (moveToVoiceChannel || cfg.kick_from_voice_channel) {
      try {
        await member.edit({ channel: moveToVoiceChannel as Snowflake });
      } catch {}
    }
  }

  const existingMute = await pluginData.state.mutes.findExistingMuteForUserId(user.id);
  let finalMute: Mute;
  let notifyResult: UserNotificationResult = { method: null, success: true };

  if (existingMute) {
    if (existingMute.roles_to_restore?.length || rolesToRestore?.length) {
      rolesToRestore = Array.from(new Set([...existingMute.roles_to_restore, ...rolesToRestore]));
    }

    await pluginData.state.mutes.updateExpiryTime(user.id, muteTime, rolesToRestore);

    if (muteType === MuteTypes.Timeout) {
      await pluginData.state.mutes.updateTimeoutExpiresAt(user.id, timeoutUntil);
    }

    finalMute = (await pluginData.state.mutes.findExistingMuteForUserId(user.id))!;
  } else {
    const muteParams: AddMuteParams = {
      userId: user.id,
      type: muteType,
      expiresAt: muteExpiresAt,
      rolesToRestore,
    };

    if (muteType === MuteTypes.Role) {
      muteParams.muteRole = muteRole;
    } else {
      muteParams.timeoutExpiresAt = timeoutUntil;
    }

    finalMute = await pluginData.state.mutes.addMute(muteParams);
  }

  registerExpiringMute(finalMute);

  const timeUntilUnmuteStr = muteTime ? humanizeDuration(muteTime) : "indefinite";

  const template = existingMute
    ? config.update_mute_message
    : muteTime
    ? config.timed_mute_message
    : config.mute_message;

  let muteMessage: string | null = null;

  try {
    muteMessage =
      template &&
      (await renderTemplate(
        template,
        new TemplateSafeValueContainer({
          guildName: pluginData.guild.name,
          reason: reason || "None",
          time: timeUntilUnmuteStr,
          moderator: muteOptions.caseArgs?.modId
            ? userToTemplateSafeUser(await resolveUser(pluginData.client, muteOptions.caseArgs.modId))
            : null,
        }),
      ));
  } catch (err) {
    if (err instanceof TemplateParseError) {
      logs.logBotAlert({
        body: `Invalid mute message format. The mute was still applied: ${err.message}`,
      });
    } else {
      lock.unlock();
      throw err;
    }
  }

  if (muteMessage && member) {
    const contactMethods: UserNotificationMethod[] = [];

    const useDm = existingMute ? config.dm_on_update : config.dm_on_mute;
    if (useDm) contactMethods.push({ type: "dm" });

    const useChannel = existingMute ? config.message_on_update : config.message_on_mute;
    const channel = config.message_channel
      ? pluginData.guild.channels.cache.get(config.message_channel as Snowflake)
      : null;

    if (useChannel && channel?.isTextBased()) {
      contactMethods.push({ type: "channel", channel });
    }

    notifyResult = await notifyUser(member.user, muteMessage, contactMethods);
  }

  const casesPlugin = pluginData.getPlugin(CasesPlugin);

  let theCase: Case | null =
    existingMute && existingMute.case_id
      ? await pluginData.state.cases.find(existingMute.case_id)
      : null;

  if (theCase) {
    const noteDetails = [`Mute updated to ${muteTime ? timeUntilUnmuteStr : "indefinite"}`];
    const reasons = reason ? [reason] : [];

    for (const noteReason of reasons) {
      await casesPlugin.createCaseNote({
        caseId: existingMute!.case_id,
        modId: muteOptions.caseArgs?.modId,
        body: noteReason,
        noteDetails,
      });
    }
  } else {
    const noteDetails = [`Muted ${muteTime ? `for ${timeUntilUnmuteStr}` : "indefinitely"}`];

    if (notifyResult.text) noteDetails.push(ucfirst(notifyResult.text));

    theCase = await casesPlugin.createCase({
      ...(muteOptions.caseArgs || {}),
      userId,
      modId: muteOptions.caseArgs?.modId,
      type: CaseTypes.Mute,
      reason,
      noteDetails,
    });

    await pluginData.state.mutes.setCaseId(user.id, theCase.id);
  }

  lock.unlock();

  pluginData.state.events.emit("mute", user.id, reason, muteOptions.isAutomodAction);

  return {
    case: theCase,
    notifyResult,
    updatedExistingMute: !!existingMute,
  };
}
