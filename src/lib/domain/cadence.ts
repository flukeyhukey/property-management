/**
 * Proactive cadence. Green owners hear from us every 90 days; amber, red
 * and new owners every 30 (cadence_days is kept current by health.ts).
 * A catch-up task appears a week before contact is due, carrying one
 * talking point from the freshest Resly snapshot.
 *
 * Tasks close themselves: any later outbound email, call or SMS to that
 * owner marks them done (closeOutreachWithEvidence, called by ingest).
 */
import { monthName } from "@/lib/integrations/resly/dates";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Interaction, PropertySnapshot } from "./types";

/** Tasks appear this many days before contact is due. */
export const CADENCE_LEAD_DAYS = 7;
/** Owners onboarded within this many days get the "new owner" talking point. */
export const NEW_OWNER_DAYS = 90;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

export type CadenceOwner = {
  lastOutboundAt: string | null;
  onboardedAt: string | null;
  createdAt: string;
  cadenceDays: number;
  hasOpenTask: boolean;
};

/**
 * When the next catch-up is due, or null when no task should be made yet.
 * Due = last outbound (or onboarding) + cadence_days, clamped to now.
 */
export function cadenceDueAt(owner: CadenceOwner, now: Date): Date | null {
  if (owner.hasOpenTask) return null;
  const anchor = owner.lastOutboundAt ?? owner.onboardedAt ?? owner.createdAt;
  const anchorMs = new Date(anchor).getTime();
  const ageDays = (now.getTime() - anchorMs) / DAY_MS;
  if (ageDays < owner.cadenceDays - CADENCE_LEAD_DAYS) return null;
  const due = anchorMs + owner.cadenceDays * DAY_MS;
  return new Date(Math.max(due, now.getTime()));
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type TalkingPointInput = {
  snapshot: Pick<PropertySnapshot, "snapshot_date" | "occupancy_month" | "occupancy_month_last_year" | "occupancy_next_30"> | null;
  /** Ratings of the owner's guest reviews, oldest first. */
  reviewRatings: number[];
  isNewOwner: boolean;
};

/** One sentence the PM can open the call with. */
export function cadenceTalkingPoint({ snapshot, reviewRatings, isNewOwner }: TalkingPointInput): string {
  if (isNewOwner && reviewRatings.length > 0) {
    const first = reviewRatings.slice(0, 4);
    const avg = first.reduce((a, b) => a + b, 0) / first.length;
    const label = first.length === 1 ? "First guest review" : `First ${countWord(first.length)} guest reviews`;
    const verb = first.length === 1 ? "was" : "average";
    return `${label} ${verb} ${avg.toFixed(1)}. Ask how handover felt.`;
  }
  if (isNewOwner) return "Still early days. Ask how handover felt and whether anything has surprised them.";

  if (snapshot?.occupancy_month != null) {
    const month = monthName(snapshot.snapshot_date);
    const occ = Math.round(Number(snapshot.occupancy_month) * 100);
    if (snapshot.occupancy_month_last_year != null) {
      const diff = occ - Math.round(Number(snapshot.occupancy_month_last_year) * 100);
      if (diff > 0) return `${month} is ${occ}% booked, up ${diff} points on last year.`;
      if (diff < 0) return `${month} is ${occ}% booked, ${-diff} points behind last year. Worth talking through pricing.`;
      return `${month} is ${occ}% booked, level with last year.`;
    }
    return `${month} is ${occ}% booked so far.`;
  }
  if (reviewRatings.length > 0) {
    const recent = reviewRatings.slice(-5);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    return `${capitalise(countWord(recent.length))} recent guest reviews average ${avg.toFixed(1)}.`;
  }
  return "A good time to check in and see how things are going.";
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export async function generateCadenceTasks(db: AdminClient, now: Date = new Date()): Promise<{ created: number }> {
  const { data: owners, error } = await db
    .from("lane_owners")
    .select("id, assigned_pm_id, last_outbound_at, onboarded_at, created_at, cadence_days")
    .eq("is_active", true);
  if (error) throw new Error(`generateCadenceTasks: ${error.message}`);
  if (!owners?.length) return { created: 0 };

  const { data: openTasks } = await db.from("lane_outreach_tasks").select("owner_id").eq("status", "open");
  const withOpen = new Set((openTasks ?? []).map((t) => t.owner_id));

  let created = 0;
  for (const o of owners) {
    const dueAt = cadenceDueAt(
      {
        lastOutboundAt: o.last_outbound_at,
        onboardedAt: o.onboarded_at,
        createdAt: o.created_at,
        cadenceDays: o.cadence_days,
        hasOpenTask: withOpen.has(o.id),
      },
      now,
    );
    if (!dueAt) continue;

    const { propertyId, talkingPoint } = await talkingPointFor(db, o.id, o.onboarded_at, now);
    const { error: insertError } = await db.from("lane_outreach_tasks").insert({
      owner_id: o.id,
      property_id: propertyId,
      assigned_pm_id: o.assigned_pm_id,
      source: "cadence",
      talking_point: talkingPoint,
      due_at: dueAt.toISOString(),
    });
    if (insertError) throw new Error(`generateCadenceTasks: ${insertError.message}`);
    created += 1;
  }
  return { created };
}

async function talkingPointFor(
  db: AdminClient,
  ownerId: string,
  onboardedAt: string | null,
  now: Date,
): Promise<{ propertyId: string | null; talkingPoint: string }> {
  const { data: links } = await db.from("lane_owner_properties").select("property_id").eq("owner_id", ownerId);
  const propertyIds = (links ?? []).map((l) => l.property_id);
  const isNewOwner = Boolean(onboardedAt && (now.getTime() - new Date(onboardedAt).getTime()) / DAY_MS < NEW_OWNER_DAYS);
  if (propertyIds.length === 0) {
    return { propertyId: null, talkingPoint: cadenceTalkingPoint({ snapshot: null, reviewRatings: [], isNewOwner }) };
  }

  const { data: snaps } = await db
    .from("lane_property_snapshots")
    .select("property_id, snapshot_date, occupancy_month, occupancy_month_last_year, occupancy_next_30")
    .in("property_id", propertyIds)
    .order("snapshot_date", { ascending: false })
    .limit(propertyIds.length);
  const snapshot = snaps?.[0] ?? null;

  let reviewsQuery = db
    .from("lane_property_reviews")
    .select("rating, reviewed_at")
    .in("property_id", propertyIds)
    .order("reviewed_at", { ascending: true });
  if (isNewOwner && onboardedAt) reviewsQuery = reviewsQuery.gte("reviewed_at", onboardedAt);
  const { data: reviews } = await reviewsQuery;

  return {
    propertyId: snapshot?.property_id ?? propertyIds[0],
    talkingPoint: cadenceTalkingPoint({
      snapshot,
      reviewRatings: (reviews ?? []).map((r) => Number(r.rating)),
      isNewOwner,
    }),
  };
}

/**
 * Marks the owner's open outreach tasks done when we reach out to them.
 * Any outbound email, call or SMS after the task was created counts.
 */
export async function closeOutreachWithEvidence(
  db: AdminClient,
  interaction: Pick<Interaction, "id" | "owner_id" | "direction" | "channel" | "occurred_at" | "is_auto_reply">,
): Promise<{ closed: number }> {
  if (interaction.direction !== "outbound") return { closed: 0 };
  if (!["email", "call", "sms"].includes(interaction.channel)) return { closed: 0 };
  if (interaction.is_auto_reply) return { closed: 0 };

  const { data, error } = await db
    .from("lane_outreach_tasks")
    .update({ status: "done", done_at: interaction.occurred_at, done_interaction_id: interaction.id })
    .eq("owner_id", interaction.owner_id)
    .eq("status", "open")
    .lte("created_at", interaction.occurred_at)
    .select("id");
  if (error) throw new Error(`closeOutreachWithEvidence: ${error.message}`);
  return { closed: data?.length ?? 0 };
}
