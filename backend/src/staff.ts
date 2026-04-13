/**
 * Zeppelin staff have full access to the dashboard
 */
import { env } from "./env";

export function isStaff(userId: string) {
  return (env.STAFF ?? []).includes(userId);
}

export function getStaffList(): string[] {
  return env.STAFF ?? [];
}
