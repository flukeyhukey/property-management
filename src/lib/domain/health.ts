/**
 * Owner health: green, amber or red, with one reason in plain, kind words.
 *
 * computeHealth is pure and unit-tested. recomputeOwnerHealth gathers the
 * inputs from the database and writes the result back to lane_owners and
 * lane_health_snapshots.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "./database";
import { businessMinutesBetween } from "./time";
import type { Health, Intent } from "./types";

// ---------------------------------------------------------------------------
// Rules, as constants so they are easy to read and tune
// ---------------------------------------------------------------------------

export const HEALTH_RULES = {
  /** An NPS at or under this counts against the owner. */
  npsLow: 6,
  /** Late follow-ups in 90 days that tip an owner to amber. */
  missedCommitments: 2,
  /** A loop waiting this far past its clock (business minutes) tips amber. */
  loopPastDueMinutes: 4 * 60,
  /** A loop open this long (clock minutes) alongside churn language tips red. */
  loopWaitingMinutesRed: 24 * 60,
  /** Average inbound sentiment below this tips amber. */
  sentimentLow: -0.3,
  /** Occupancy this far under what the owner expected tips amber. */
  occupancyGap: -0.15,
  /** Average reply lag (business minutes) above this tips amber: a full business day. */
  responseLagMinutes: 480,
  /** Owners onboarded within this many days sit on the 30-day cadence. */
  newOwnerDays: 90,
  /** Look-back for every input. */
  windowDays: 90,
  cadenceDays: { green: 90, amber: 30, red: 30 } as const satisfies Record<Health, number>,
} as const;

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

export type OpenLoopInput = {
  /** How long the owner has been waiting, in business minutes. */
  ageMinutesBusiness: number;
  /** Clock minutes since the loop opened. Falls back to ageMinutesBusiness. */
  ageMinutesClock?: number;
  /** Business minutes past the loop's due time; 0 or negative when still inside the clock. */
  pastDueMinutesBusiness?: number;
};

export type HealthInputs = {
  /** Latest NPS score inside the 90-day window, or null. */
  latestNps: number | null;
  openLoops: OpenLoopInput[];
  /** Average business minutes from a loop opening to closing, 90 days, or null. */
  avgResponseLagMinutes90d: number | null;
  /** Average ai_sentiment of inbound interactions, -1 to 1, or null. */
  avgSentiment90d: number | null;
  /** occupancy - expected, -1 to 1, or null when there is no snapshot. */
  occupancyGap: number | null;
  missedCommitments90d: number;
  /** Any inbound interaction with churn language in 90 days. */
  churnFlag90d: boolean;
  /** Intent of the most recent unhappy inbound message (sentiment under sentimentLow), for the reason. */
  recentNegativeIntent?: Intent | null;
};

export type HealthResult = { health: Health; reason: string; inputs: HealthInputs };

export function computeHealth(inputs: HealthInputs): HealthResult {
  const R = HEALTH_RULES;
  const npsLow = inputs.latestNps != null && inputs.latestNps <= R.npsLow;
  const missedTwice = inputs.missedCommitments90d >= R.missedCommitments;
  const churn = inputs.churnFlag90d;
  const waitingLong = inputs.openLoops.some((l) => (l.ageMinutesClock ?? l.ageMinutesBusiness) > R.loopWaitingMinutesRed);
  const pastDueLoop = inputs.openLoops.find((l) => (l.pastDueMinutesBusiness ?? 0) > R.loopPastDueMinutes);
  const unhappy = inputs.avgSentiment90d != null && inputs.avgSentiment90d < R.sentimentLow;
  const bookingsShort = inputs.occupancyGap != null && inputs.occupancyGap < R.occupancyGap;
  const slowReplies = inputs.avgResponseLagMinutes90d != null && inputs.avgResponseLagMinutes90d > R.responseLagMinutes;

  let health: Health = "green";
  if ((npsLow && (churn || missedTwice)) || (churn && waitingLong)) health = "red";
  else if (npsLow || missedTwice || churn || pastDueLoop || unhappy || bookingsShort || slowReplies) health = "amber";

  // The strongest input, in words a PM would say out loud.
  let reason = "Everything's on track";
  if (churn) reason = "Mentioned looking elsewhere";
  else if (npsLow) reason = `Gave us a ${inputs.latestNps} in the last survey`;
  else if (missedTwice) reason = "A follow-up ran late twice recently";
  else if (unhappy && inputs.recentNegativeIntent === "maintenance") reason = "Frustrated about a repair";
  else if (unhappy && inputs.recentNegativeIntent === "payout") reason = "Frustrated about a payout";
  else if (pastDueLoop) reason = waitingReason(pastDueLoop);
  else if (unhappy) reason = "Recent emails have been on the unhappy side";
  else if (bookingsShort) reason = "Bookings are below what they were expecting";
  else if (slowReplies) reason = "Replies have been taking more than a day";

  return { health, reason, inputs };
}

function waitingReason(loop: OpenLoopInput): string {
  const clock = loop.ageMinutesClock ?? loop.ageMinutesBusiness;
  if (clock >= 2 * 24 * 60) return `Has been waiting on a reply for ${Math.floor(clock / (24 * 60))} days`;
  if (clock >= 16 * 60) return "Has been waiting on a reply since yesterday";
  return "Has been waiting on a reply since this morning";
}

/** 30 days for amber, red and owners in their first 90 days; else 90. */
export function cadenceDaysFor(health: Health, onboardedAt: string | null, now: Date = new Date()): number {
  if (health !== "green") return HEALTH_RULES.cadenceDays[health];
  if (onboardedAt) {
    const days = (now.getTime() - new Date(onboardedAt).getTime()) / 86_400_000;
    if (days < HEALTH_RULES.newOwnerDays) return HEALTH_RULES.cadenceDays.amber;
  }
  return HEALTH_RULES.cadenceDays.green;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export async function gatherHealthInputs(db: AdminClient, ownerId: string, now: Date = new Date()): Promise<HealthInputs> {
  const since = new Date(now.getTime() - HEALTH_RULES.windowDays * 86_400_000).toISOString();

  const [nps, loops, closedLoops, inbound, missed, links, owner] = await Promise.all([
    db
      .from("lane_nps_responses")
      .select("score, responded_at")
      .eq("owner_id", ownerId)
      .gte("responded_at", since)
      .order("responded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("lane_loops").select("opened_at, due_at, snoozed_until").eq("owner_id", ownerId).eq("status", "open"),
    db
      .from("lane_loops")
      .select("opened_at, closed_at")
      .eq("owner_id", ownerId)
      .eq("status", "closed")
      .gte("closed_at", since),
    db
      .from("lane_interactions")
      .select("ai_sentiment, churn_flag, ai_intent, occurred_at")
      .eq("owner_id", ownerId)
      .eq("direction", "inbound")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false }),
    db
      .from("lane_commitments")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .not("missed_at", "is", null)
      .gte("missed_at", since),
    db.from("lane_owner_properties").select("property_id").eq("owner_id", ownerId),
    db.from("lane_owners").select("expected_occupancy").eq("id", ownerId).maybeSingle(),
  ]);

  const openLoops: OpenLoopInput[] = (loops.data ?? [])
    .filter((l) => !l.snoozed_until || l.snoozed_until <= now.toISOString())
    .map((l) => ({
      ageMinutesBusiness: businessMinutesBetween(new Date(l.opened_at), now),
      ageMinutesClock: Math.max(0, Math.round((now.getTime() - new Date(l.opened_at).getTime()) / 60_000)),
      pastDueMinutesBusiness: businessMinutesBetween(new Date(l.due_at), now),
    }));

  const lags = (closedLoops.data ?? [])
    .filter((l) => l.closed_at)
    .map((l) => businessMinutesBetween(new Date(l.opened_at), new Date(l.closed_at as string)));
  const avgResponseLagMinutes90d = lags.length ? Math.round(lags.reduce((a, b) => a + b, 0) / lags.length) : null;

  const sentiments = (inbound.data ?? []).map((i) => i.ai_sentiment).filter((s): s is number => s != null);
  const avgSentiment90d = sentiments.length
    ? Math.round((sentiments.reduce((a, b) => a + Number(b), 0) / sentiments.length) * 100) / 100
    : null;
  const churnFlag90d = (inbound.data ?? []).some((i) => i.churn_flag);
  const recentNegative = (inbound.data ?? []).find((i) => i.ai_sentiment != null && Number(i.ai_sentiment) < HEALTH_RULES.sentimentLow);

  let occupancyGap: number | null = null;
  const propertyIds = (links.data ?? []).map((l) => l.property_id);
  if (propertyIds.length) {
    const { data: snaps } = await db
      .from("lane_property_snapshots")
      .select("property_id, snapshot_date, occupancy_next_30, forecast_next_30")
      .in("property_id", propertyIds)
      .order("snapshot_date", { ascending: false });
    const latest = new Map<string, { occ: number | null; forecast: number | null }>();
    for (const s of snaps ?? []) {
      if (!latest.has(s.property_id)) latest.set(s.property_id, { occ: s.occupancy_next_30, forecast: s.forecast_next_30 });
    }
    const gaps: number[] = [];
    const expected = owner.data?.expected_occupancy;
    for (const s of latest.values()) {
      const target = expected != null ? Number(expected) : s.forecast != null ? Number(s.forecast) : null;
      if (s.occ != null && target != null) gaps.push(Number(s.occ) - target);
    }
    if (gaps.length) occupancyGap = Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 1000) / 1000;
  }

  return {
    latestNps: nps.data?.score ?? null,
    openLoops,
    avgResponseLagMinutes90d,
    avgSentiment90d,
    occupancyGap,
    missedCommitments90d: missed.count ?? 0,
    churnFlag90d,
    recentNegativeIntent: recentNegative?.ai_intent ?? null,
  };
}

export async function recomputeOwnerHealth(db: AdminClient, ownerId: string, now: Date = new Date()): Promise<HealthResult & { cadenceDays: number }> {
  const inputs = await gatherHealthInputs(db, ownerId, now);
  const result = computeHealth(inputs);
  const { data: owner } = await db.from("lane_owners").select("onboarded_at").eq("id", ownerId).maybeSingle();
  const cadenceDays = cadenceDaysFor(result.health, owner?.onboarded_at ?? null, now);

  const { error } = await db
    .from("lane_owners")
    .update({
      health: result.health,
      health_reason: result.reason,
      health_updated_at: now.toISOString(),
      cadence_days: cadenceDays,
    })
    .eq("id", ownerId);
  if (error) throw new Error(`recomputeOwnerHealth: ${error.message}`);

  const { error: snapError } = await db.from("lane_health_snapshots").insert({
    owner_id: ownerId,
    computed_at: now.toISOString(),
    health: result.health,
    reason: result.reason,
    inputs: inputs as unknown as Json,
  });
  if (snapError) throw new Error(`recomputeOwnerHealth: ${snapError.message}`);

  return { ...result, cadenceDays };
}

export async function recomputeAllHealth(db: AdminClient, now: Date = new Date()): Promise<{ owners: number; byHealth: Record<Health, number> }> {
  const { data: owners, error } = await db.from("lane_owners").select("id").eq("is_active", true);
  if (error) throw new Error(`recomputeAllHealth: ${error.message}`);
  const byHealth: Record<Health, number> = { green: 0, amber: 0, red: 0 };
  for (const o of owners ?? []) {
    const r = await recomputeOwnerHealth(db, o.id, now);
    byHealth[r.health] += 1;
  }
  return { owners: owners?.length ?? 0, byHealth };
}
