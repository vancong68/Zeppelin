import { z } from "zod";
import { isSnowflake } from "../../utils.js";

export const permanentRemovalRequestSchema = z.object({
  confirmGuildId: z.string(),
  deleteHistoricalData: z.boolean().optional().default(false),
  leaveDiscordServer: z.boolean().optional().default(false),
});

export type PermanentRemovalRequestData = z.infer<typeof permanentRemovalRequestSchema>;

export type PermanentRemovalRequestValidation =
  | { success: true; data: PermanentRemovalRequestData }
  | { success: false; error: string };

export function validatePermanentRemovalRequest(
  guildId: unknown,
  body: unknown,
): PermanentRemovalRequestValidation {
  if (!isSnowflake(guildId)) {
    return { success: false, error: "Invalid guild ID" };
  }

  const parsed = permanentRemovalRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, error: "Invalid request body" };
  }

  if (parsed.data.confirmGuildId !== guildId) {
    return {
      success: false,
      error: "Confirmation failed: the typed server ID does not match this server's ID",
    };
  }

  return { success: true, data: parsed.data };
}
