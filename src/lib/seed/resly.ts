/**
 * Resly layer of the seed. Run after the main seed (scripts/seed.ts) has
 * created owners and linked them to properties: snapshots every owner
 * property from the mock Resly client (i.e. from public.reservations),
 * stores the generated guest reviews, fires the Resly triggers over a
 * generous look-back so the Owner 360 and dashboard have signals, then
 * recomputes health and cadence tasks.
 *
 * Idempotent: snapshots upsert, reviews and triggers dedupe.
 */
import { generateCadenceTasks } from "@/lib/domain/cadence";
import { recomputeAllHealth } from "@/lib/domain/health";
import { detectTriggers, snapshotProperties, type SnapshotResult, type TriggerResult } from "@/lib/domain/resly-signals";
import { MockReslyClient } from "@/lib/integrations/resly";
import type { AdminClient } from "@/lib/supabase/admin";

/** How far back the seed looks for reviews and cancellations. */
const SEED_LOOKBACK_DAYS = 60;

export type SeedReslyResult = {
  snapshots: SnapshotResult[];
  triggers: TriggerResult;
  health: Awaited<ReturnType<typeof recomputeAllHealth>>;
  cadenceTasks: number;
};

export async function seedResly(db: AdminClient, now: Date = new Date()): Promise<SeedReslyResult> {
  // Always the mock client: the seed tells the mock-mode story.
  const client = new MockReslyClient(db, now);

  // Yesterday and today, so trends and status comparisons have two points.
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const snapshots = [
    await snapshotProperties(db, yesterday, new MockReslyClient(db, yesterday)),
    await snapshotProperties(db, now, client),
  ];

  const triggers = await detectTriggers(db, {
    now,
    since: new Date(now.getTime() - SEED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
    client,
  });

  const health = await recomputeAllHealth(db, now);
  const { created } = await generateCadenceTasks(db, now);
  return { snapshots, triggers, health, cadenceTasks: created };
}
