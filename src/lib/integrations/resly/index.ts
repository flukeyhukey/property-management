/**
 * Resly adapter entry point. Picks live or mock from INTEGRATIONS_MODE;
 * falls back to mock when live is asked for but RESLY_API_KEY is missing,
 * so a half-configured environment still snapshots something.
 */
import { integrationsMode } from "@/lib/env";
import type { AdminClient } from "@/lib/supabase/admin";
import { LiveReslyClient } from "./live";
import { MockReslyClient } from "./mock";
import type { ReslyClient } from "./types";

export type { ReslyCancellation, ReslyClient, ReslyOccupancy, ReslyProperty, ReslyPropertyStatus, ReslyReview, ReslyStatus } from "./types";
export { RESLY_ENDPOINTS } from "./live";
export { MockReslyClient, generateReviews, occupancyFromReservations } from "./mock";

export function createReslyClient(db: AdminClient, now: Date = new Date()): ReslyClient {
  if (integrationsMode() === "live" && process.env.RESLY_API_KEY) {
    return new LiveReslyClient(db);
  }
  return new MockReslyClient(db, now);
}
