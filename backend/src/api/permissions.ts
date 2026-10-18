import { ApiPermissions, hasPermission, permissionArrToSet } from "@zeppelinbot/shared/apiPermissions.js";
import { Request, Response } from "express";
import { AllowedGuilds } from "../data/AllowedGuilds.js";
import { ApiPermissionAssignments } from "../data/ApiPermissionAssignments.js";
import { isStaff } from "../staff.js";
import { notFound, unauthorized } from "./responses.js";

const apiPermissionAssignments = new ApiPermissionAssignments();

export const hasGuildPermission = async (userId: string, guildId: string, permission: ApiPermissions) => {
  if (isStaff(userId)) {
    return true;
  }

  const permAssignment = await apiPermissionAssignments.getByGuildAndUserId(guildId, userId);
  if (!permAssignment) {
    return false;
  }

  return hasPermission(permissionArrToSet(permAssignment.permissions), permission);
};

/**
 * Requires `guildId` in req.params
 */
export function requireGuildPermission(permission: ApiPermissions) {
  return async (req: Request, res: Response, next) => {
    if (!(await hasGuildPermission(req.user!.userId, req.params.guildId, permission))) {
      return unauthorized(res);
    }

    next();
  };
}

/**
 * Requires `guildId` in req.params and that the guild is still in the allowed servers registry.
 * Denies access to servers that have been permanently removed.
 */
export function requireAllowedGuild() {
  const allowedGuilds = new AllowedGuilds();

  return async (req: Request, res: Response, next) => {
    if (!(await allowedGuilds.isAllowed(req.params.guildId))) {
      return notFound(res);
    }

    next();
  };
}

/**
 * Requires a logged-in user that is a global administrator (staff).
 */
export function requireStaff() {
  return (req: Request, res: Response, next) => {
    if (!isStaff(req.user!.userId)) {
      return unauthorized(res);
    }

    next();
  };
}
