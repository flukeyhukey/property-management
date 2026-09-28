/**
 * Resly-derived signals. Daily snapshots per property, and the four
 * triggers from the brief (occupancy below forecast, low review, high-value
 * cancellation, status change), each deduped through lane_resly_events.
 *
 * Pure decision helpers sit at the top so they can be tested without a
 * database; the two exported jobs at the bottom apply them.
 */
import { createReslyClient } from "@/lib/integrations/resly";
import { addDays, localDate, lastYear, monthName, monthWindow, next30Window, yyyyMm, type LocalDate } from "@/lib/integrations/resly/dates";
import type { ReslyCancellation, ReslyClient, ReslyReview } from "@/lib/integrations/resly/types";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "./database";
import { openLoop } from "./loops";
import { addBusinessMinutes } from "./time";
import type { OutreachSource, PropertySnapshot } from "./types";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Next-30 occupancy this far under forecast earns a call. */
export const OCCUPANCY_GAP = 0.15;
/** Reviews at or under this rating open a loop. */
export const LOW_REVIEW_RATING = 3;
/** Cancelled bookings worth at least this open a loop. */
export const HIGH_VALUE_CANCELLATION = 1500;
/** How long a PM has for an occupancy call: two business days. */
export const OCCUPANCY_TASK_BUSINESS_MINUTES = 2 * 10 * 60;

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

export type SnapshotLike = Pick<PropertySnapshot, "occupancy_next_30" | "forecast_next_30">;

export function occupancyBelowForecast(s: SnapshotLike): boolean {
  if (s.occupancy_next_30 == null || s.forecast_next_30 == null) return false;
  return Number(s.occupancy_next_30) < Number(s.forecast_next_30) - OCCUPANCY_GAP;
}

export function reviewNeedsAttention(rating: number): boolean {
  return rating <= LOW_REVIEW_RATING;
}

export function cancellationNeedsAttention(accommodationValue: number | null): boolean {
  return accommodationValue != null && accommodationValue >= HIGH_VALUE_CANCELLATION;
}

export function statusChanged(previous: string | null | undefined, current: string): boolean {
  return Boolean(previous) && previous !== current;
}

export const dedupeKeys = {
  occupancy: (propertyId: string, month: string) => `occupancy:${propertyId}:${month}`,
  review: (externalId: string) => `review:${externalId}`,
  cancellation: (reservationId: string) => `cancel:${reservationId}`,
  status: (propertyId: string, status: string) => `status:${propertyId}:${status}`,
};

/** The month most of the next 30 days fall in: "October" on 28 September. */
export function next30MonthLabel(today: LocalDate): string {
  return monthName(addDays(today, 15));
}

export function pct(n: number | null | undefined): string {
  return `${Math.round(Number(n ?? 0) * 100)}%`;
}

/** "October is 48% booked against a 70% forecast. Worth a call before they notice." */
export function occupancyTalkingPoint(monthLabel: string, occupancy: number, forecast: number): string {
  return `${monthLabel} is ${pct(occupancy)} booked against a ${pct(forecast)} forecast. Worth a call before they notice.`;
}

const REVIEW_TOPICS: [RegExp, string][] = [
  [/air ?con|a\/c|air conditioning/i, "the aircon"],
  [/clean|dirty|dust|crumb|sticky|stain/i, "cleaning"],
  [/wi-?fi|internet/i, "the wifi"],
  [/hot water|shower/i, "the hot water"],
  [/nois|loud|construction/i, "noise"],
  [/check-?in|lockbox|key|code/i, "check-in"],
  [/park/i, "parking"],
  [/balcony|furniture|broken/i, "broken furniture"],
  [/bed|mattress|pillow|linen/i, "the beds"],
  [/smell|odour|odor|mould|mold/i, "a smell"],
  [/pool|spa/i, "the pool"],
  [/bug|ant|cockroach|pest/i, "pests"],
];

/** What a review is about, in two or three words, or null when it is not obvious. */
export function reviewTopic(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const [re, topic] of REVIEW_TOPICS) if (re.test(text)) return topic;
  return null;
}

/** "A 2-star review on Esplanade mentions the aircon" */
export function reviewSummary(propertyName: string, rating: number, topic: string | null): string {
  const stars = `${Math.round(rating)}-star`;
  return topic
    ? `A ${stars} review on ${propertyName} mentions ${topic}`
    : `A ${stars} review on ${propertyName} needs a look`;
}

/** "12 to 15 Oct" */
export function stayLabel(checkIn: string, checkOut: string): string {
  const short = (d: string) => `${Number(d.slice(8, 10))} ${monthName(d).slice(0, 3)}`;
  const a = short(checkIn);
  const b = short(checkOut);
  if (checkIn.slice(5, 7) === checkOut.slice(5, 7)) return `${Number(checkIn.slice(8, 10))} to ${b}`;
  return `${a} to ${b}`;
}

export function money(n: number | null | undefined): string {
  return `$${Math.round(Number(n ?? 0)).toLocaleString("en-AU")}`;
}

/** "A $2,400 booking at Esplanade for 12 to 15 Oct was cancelled" */
export function cancellationSummary(propertyName: string, c: Pick<ReslyCancellation, "accommodationValue" | "checkIn" | "checkOut">): string {
  return `A ${money(c.accommodationValue)} booking at ${propertyName} for ${stayLabel(c.checkIn, c.checkOut)} was cancelled`;
}

/** "Esplanade has gone inactive in Resly" */
export function statusSummary(propertyName: string, status: string): string {
  return status === "active"
    ? `${propertyName} is active again in Resly`
    : `${propertyName} has gone ${status} in Resly`;
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export type SnapshotResult = { snapshotDate: LocalDate; properties: number };

/**
 * One row per owner-linked property for `date`. Inactive properties are
 * included so a status flip shows up in the next snapshot.
 */
export async function snapshotProperties(
  db: AdminClient,
  date: Date = new Date(),
  client: ReslyClient = createReslyClient(db, date),
): Promise<SnapshotResult> {
  const today = localDate(date);
  const month = monthWindow(today);
  const monthLy = { from: lastYear(month.from), to: lastYear(month.to) };
  const next30 = next30Window(today);
  const properties = await client.listProperties();

  const rows: PropertySnapshot[] = [];
  for (const p of properties) {
    const [thisMonth, lastYearMonth, upcoming, forecast, revenue, status] = await Promise.all([
      client.occupancy(p.propertyId, month.from, month.to),
      client.occupancy(p.propertyId, monthLy.from, monthLy.to),
      client.occupancy(p.propertyId, next30.from, next30.to),
      client.forecast(p.propertyId, next30.from, next30.to),
      client.revenueForMonth(p.propertyId, yyyyMm(today)),
      client.propertyStatus(p.propertyId),
    ]);
    rows.push({
      property_id: p.propertyId,
      snapshot_date: today,
      occupancy_month: thisMonth.occupancy,
      // No bookings at all last year usually means no history, not an empty month.
      occupancy_month_last_year: lastYearMonth.bookings > 0 ? lastYearMonth.occupancy : null,
      occupancy_next_30: upcoming.occupancy,
      forecast_next_30: forecast,
      revenue_month: revenue,
      bookings_next_30: upcoming.bookings,
      status: status.status,
    });
  }

  if (rows.length) {
    const { error } = await db.from("lane_property_snapshots").upsert(rows, { onConflict: "property_id,snapshot_date" });
    if (error) throw new Error(`snapshotProperties: ${error.message}`);
  }
  return { snapshotDate: today, properties: rows.length };
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type TriggerResult = {
  occupancyTasks: number;
  reviewLoops: number;
  cancellationLoops: number;
  statusLoops: number;
  reviewsStored: number;
};

type OwnerLink = {
  ownerId: string;
  ownerActive: boolean;
  assignedPmId: string | null;
  propertyId: string;
  propertyName: string;
};

export type DetectOptions = {
  now?: Date;
  /** How far back to pull reviews and cancellations. Default: a day. */
  since?: Date;
  client?: ReslyClient;
};

export async function detectTriggers(db: AdminClient, opts: DetectOptions = {}): Promise<TriggerResult> {
  const now = opts.now ?? new Date();
  const since = opts.since ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const client = opts.client ?? createReslyClient(db, now);
  const today = localDate(now);
  const result: TriggerResult = { occupancyTasks: 0, reviewLoops: 0, cancellationLoops: 0, statusLoops: 0, reviewsStored: 0 };

  const links = await loadOwnerLinks(db);
  if (links.length === 0) return result;
  const byProperty = new Map<string, OwnerLink[]>();
  for (const l of links) byProperty.set(l.propertyId, [...(byProperty.get(l.propertyId) ?? []), l]);
  const propertyIds = Array.from(byProperty.keys());

  // Latest two snapshots per property: today's and the one before.
  const { data: snaps, error: snapError } = await db
    .from("lane_property_snapshots")
    .select("*")
    .in("property_id", propertyIds)
    .lte("snapshot_date", today)
    .order("snapshot_date", { ascending: false });
  if (snapError) throw new Error(`detectTriggers: ${snapError.message}`);
  const latest = new Map<string, PropertySnapshot>();
  const previous = new Map<string, PropertySnapshot>();
  for (const s of snaps ?? []) {
    if (!latest.has(s.property_id)) latest.set(s.property_id, s);
    else if (!previous.has(s.property_id)) previous.set(s.property_id, s);
  }

  // 1. Occupancy below forecast -> outreach task per owner.
  const monthLabel = next30MonthLabel(today);
  for (const [propertyId, snap] of latest) {
    if (!occupancyBelowForecast(snap)) continue;
    const owners = (byProperty.get(propertyId) ?? []).filter((l) => l.ownerActive);
    if (owners.length === 0) continue;
    const key = dedupeKeys.occupancy(propertyId, yyyyMm(addDays(today, 15)));
    const event = await claimEvent(db, key, propertyId, "occupancy", {
      occupancy_next_30: snap.occupancy_next_30,
      forecast_next_30: snap.forecast_next_30,
    });
    if (!event) continue;
    for (const link of owners) {
      const { data: task, error } = await db
        .from("lane_outreach_tasks")
        .insert({
          owner_id: link.ownerId,
          property_id: propertyId,
          assigned_pm_id: link.assignedPmId,
          source: "occupancy",
          talking_point: occupancyTalkingPoint(monthLabel, Number(snap.occupancy_next_30), Number(snap.forecast_next_30)),
          due_at: addBusinessMinutes(now, OCCUPANCY_TASK_BUSINESS_MINUTES).toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(`detectTriggers occupancy: ${error.message}`);
      await db.from("lane_resly_events").update({ outreach_task_id: task.id }).eq("id", event);
      result.occupancyTasks += 1;
    }
  }

  // 2. Reviews: store every one, open a loop for the low ones.
  const reviews = await client.reviewsSince(since);
  for (const review of reviews) {
    const owners = byProperty.get(review.propertyId);
    if (!owners?.length) continue;
    const stored = await storeReview(db, review);
    if (stored) result.reviewsStored += 1;
    if (!reviewNeedsAttention(review.rating)) continue;
    const key = dedupeKeys.review(review.externalId);
    const event = await claimEvent(db, key, review.propertyId, "review", {
      rating: review.rating,
      channel: review.channel,
      reviewed_at: review.reviewedAt.toISOString(),
    });
    if (!event) continue;
    const summary = reviewSummary(owners[0].propertyName, review.rating, reviewTopic(`${review.title ?? ""} ${review.body ?? ""}`));
    for (const link of owners) {
      if (!link.ownerActive) continue;
      const { loop } = await openLoop(db, {
        ownerId: link.ownerId,
        propertyId: review.propertyId,
        assignedPmId: link.assignedPmId,
        type: "resly",
        threadId: key, // one loop per event per owner
        summary,
        openedAt: now,
      });
      await db.from("lane_resly_events").update({ loop_id: loop.id }).eq("id", event);
      await db.from("lane_property_reviews").update({ loop_id: loop.id }).eq("external_id", review.externalId);
      result.reviewLoops += 1;
    }
  }

  // 3. High-value cancellations.
  const cancellations = await client.cancellationsSince(since);
  for (const c of cancellations) {
    if (!cancellationNeedsAttention(c.accommodationValue)) continue;
    const owners = byProperty.get(c.propertyId);
    if (!owners?.length) continue;
    const key = dedupeKeys.cancellation(c.reservationId);
    const event = await claimEvent(db, key, c.propertyId, "cancellation", {
      accommodation_value: c.accommodationValue,
      check_in: c.checkIn,
      check_out: c.checkOut,
      channel: c.channel,
    });
    if (!event) continue;
    const summary = cancellationSummary(owners[0].propertyName, c);
    for (const link of owners) {
      if (!link.ownerActive) continue;
      const { loop } = await openLoop(db, {
        ownerId: link.ownerId,
        propertyId: c.propertyId,
        assignedPmId: link.assignedPmId,
        type: "resly",
        threadId: key,
        summary,
        openedAt: now,
      });
      await db.from("lane_resly_events").update({ loop_id: loop.id }).eq("id", event);
      result.cancellationLoops += 1;
    }
  }

  // 4. Status flips between the last two snapshots.
  for (const [propertyId, snap] of latest) {
    const prev = previous.get(propertyId);
    if (!snap.status || !statusChanged(prev?.status, snap.status)) continue;
    const owners = byProperty.get(propertyId) ?? [];
    const key = dedupeKeys.status(propertyId, snap.status);
    const event = await claimEvent(db, key, propertyId, "status_change", { from: prev?.status ?? null, to: snap.status });
    if (!event) continue;
    for (const link of owners) {
      if (!link.ownerActive) continue;
      const { loop } = await openLoop(db, {
        ownerId: link.ownerId,
        propertyId,
        assignedPmId: link.assignedPmId,
        type: "resly",
        threadId: key,
        summary: statusSummary(link.propertyName, snap.status),
        openedAt: now,
      });
      await db.from("lane_resly_events").update({ loop_id: loop.id }).eq("id", event);
      result.statusLoops += 1;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadOwnerLinks(db: AdminClient): Promise<OwnerLink[]> {
  const { data, error } = await db
    .from("lane_owner_properties")
    .select("property_id, owner:lane_owners!inner(id, is_active, assigned_pm_id)");
  if (error) throw new Error(`loadOwnerLinks: ${error.message}`);
  const rows = data ?? [];
  const ids = Array.from(new Set(rows.map((r) => r.property_id)));
  if (ids.length === 0) return [];
  const { data: props, error: propError } = await db.from("properties").select("id, name").in("id", ids);
  if (propError) throw new Error(`loadOwnerLinks: ${propError.message}`);
  const names = new Map((props ?? []).map((p) => [p.id, p.name]));
  return rows.map((r) => {
    const owner = r.owner as unknown as { id: string; is_active: boolean; assigned_pm_id: string | null };
    return {
      ownerId: owner.id,
      ownerActive: owner.is_active,
      assignedPmId: owner.assigned_pm_id,
      propertyId: r.property_id,
      propertyName: names.get(r.property_id) ?? "the property",
    };
  });
}

/**
 * Records the event once. Returns the new event id, or null when the
 * dedupe key was already there and the trigger has been handled.
 */
async function claimEvent(
  db: AdminClient,
  dedupeKey: string,
  propertyId: string,
  kind: OutreachSource,
  payload: Record<string, Json | undefined>,
): Promise<string | null> {
  const { data, error } = await db
    .from("lane_resly_events")
    .upsert(
      { property_id: propertyId, kind, dedupe_key: dedupeKey, payload: payload as Json },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`claimEvent: ${error.message}`);
  return data?.[0]?.id ?? null;
}

async function storeReview(db: AdminClient, review: ReslyReview): Promise<boolean> {
  const { data, error } = await db
    .from("lane_property_reviews")
    .upsert(
      {
        property_id: review.propertyId,
        external_id: review.externalId,
        rating: review.rating,
        title: review.title,
        body: review.body,
        reviewed_at: review.reviewedAt.toISOString(),
        channel: review.channel,
      },
      { onConflict: "external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`storeReview: ${error.message}`);
  return Boolean(data?.length);
}
