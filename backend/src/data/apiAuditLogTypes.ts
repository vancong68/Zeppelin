import { ApiPermissionTypes } from "./ApiPermissionAssignments.js";

export const AuditLogEventTypes = {
  ADD_API_PERMISSION: "ADD_API_PERMISSION" as const,
  EDIT_API_PERMISSION: "EDIT_API_PERMISSION" as const,
  REMOVE_API_PERMISSION: "REMOVE_API_PERMISSION" as const,
  EDIT_CONFIG: "EDIT_CONFIG" as const,
  PERMANENT_GUILD_REMOVAL: "PERMANENT_GUILD_REMOVAL" as const,
};

export type AuditLogEventType = keyof typeof AuditLogEventTypes;

export type AddApiPermissionEventData = {
  target_id: string;
  permissions: string[];
  expires_at: string | null;
};

export type RemoveApiPermissionEventData = {
  target_id: string;
};

export interface AuditLogEventData extends Record<AuditLogEventType, unknown> {
  ADD_API_PERMISSION: {
    type: ApiPermissionTypes;
    target_id: string;
    permissions: string[];
    expires_at: string | null;
  };

  EDIT_API_PERMISSION: {
    type: ApiPermissionTypes;
    target_id: string;
    permissions: string[];
    expires_at: string | null;
  };

  REMOVE_API_PERMISSION: {
    type: ApiPermissionTypes;
    target_id: string;
  };

  EDIT_CONFIG: Record<string, never>;

  PERMANENT_GUILD_REMOVAL: {
    guild_name: string | null;
    delete_historical_data: boolean;
    leave_discord_server: boolean;
    deleted_always_total: number;
    deleted_historical_total: number;
    discord_left: boolean | null;
    discord_already_gone: boolean;
  };
}

export type AnyAuditLogEventData = AuditLogEventData[AuditLogEventType];
