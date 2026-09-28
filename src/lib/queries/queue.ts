/**
 * Reads for the PM home screen and the reply screen. Staff session only
 * (RLS). Everything a page needs arrives in one call so the page stays a
 * plain Server Component.
 */
import { TZDate } from "@date-fns/tz";
import { createClient } from "@/lib/supabase/server";
import { addBusinessMinutes, TZ } from "@/lib/domain/time";
import type {
  Commitment,
  Interaction,
  Issue,
  Loop,
  Owner,
  OutreachTask,
  Property,
} from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type QueueOwner = Pick<
  Owner,
  "id" | "name" | "health" | "health_reason" | "preferred_contact" | "primary_phone" | "primary_email" | "last_contact_at"
>;
export type QueueProperty = Pick<Property, "id" | "name" | "region" | "address" | "suburb" | "bedrooms">;
export type QueueTrigger = Pick<
  Interaction,
  "id" | "channel" | "direction" | "subject" | "body" | "ai_summary" | "churn_flag" | "occurred_at" | "transcript"
>;
export type QueueIssue = Pick<Issue, "id" | "description" | "status" | "category">;

export type QueueLoopItem = Loop & {
  owner: QueueOwner;
  property: QueueProperty | null;
  trigger: QueueTrigger | null;
  issue: QueueIssue | null;
};

export type QueueCommitment = Commitment & {
  owner: Pick<Owner, "id" | "name" | "primary_email" | "primary_phone">;
  /** The call or email that may have covered it, when a prompt is pending. */
  prompt_interaction: Pick<Interaction, "id" | "channel" | "occurred_at" | "subject"> | null;
  /** The email or call the promise was made in. */
  source_interaction: Pick<Interaction, "id" | "channel" | "occurred_at"> | null;
};

export type QueueOutreach = OutreachTask & {
  owner: Pick<Owner, "id" | "name" | "health" | "primary_phone" | "last_contact_at">;
  property: QueueProperty | null;
};

export type QueueStats = {
  /** Loops closed inside their clock, last 30 days. Null when there were none. */
  answeredOnTimePct: number | null;
  /** Follow-ups kept by their due time, last 30 days. Null when there were none. */
  followUpsOnTimePct: number | null;
  /** Consecutive days ending today with nothing waiting past its clock. */
  streakDays: number;
  /** Loops past their clock right now. */
  waitingCount: number;
  /** Loops due inside the next three business hours. */
  nextUpCount: number;
};

export type QueueForStaff = {
  loops: {
    startHere: QueueLoopItem[];
    nextUp: QueueLoopItem[];
    newToday: QueueLoopItem[];
    all: QueueLoopItem[];
  };
  commitments: QueueCommitment[];
  outreach: QueueOutreach[];
  stats: QueueStats;
};

const LOOP_SELECT = `*,
  owner:lane_owners!lane_loops_owner_id_fkey(id, name, health, health_reason, preferred_contact, primary_phone, primary_email, last_contact_at),
  property:lane_properties!lane_loops_property_id_fkey(id, name, region, address, suburb, bedrooms),
  trigger:lane_interactions!lane_loops_trigger_interaction_id_fkey(id, channel, direction, subject, body, ai_summary, churn_flag, occurred_at, transcript),
  issue:lane_issues!lane_loops_issue_id_fkey(id, description, status, category)`;

const COMMITMENT_SELECT = `*,
  owner:lane_owners!lane_commitments_owner_id_fkey(id, name, primary_email, primary_phone),
  prompt_interaction:lane_interactions!lane_commitments_prompt_interaction_id_fkey(id, channel, occurred_at, subject),
  source_interaction:lane_interactions!lane_commitments_source_interaction_id_fkey(id, channel, occurred_at)`;

const OUTREACH_SELECT = `*,
  owner:lane_owners!lane_outreach_tasks_owner_id_fkey(id, name, health, primary_phone, last_contact_at),
  property:lane_properties!lane_outreach_tasks_property_id_fkey(id, name, region, address, suburb, bedrooms)`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Brisbane midnight at the start of the calendar day `d` falls in. */
function startOfLocalDay(d: Date): Date {
  const l = new TZDate(d, TZ);
  return new Date(new TZDate(l.getFullYear(), l.getMonth(), l.getDate(), 0, 0, 0, 0, TZ).getTime());
}

function endOfLocalDay(d: Date): Date {
  return new Date(startOfLocalDay(d).getTime() + 24 * 60 * 60 * 1000 - 1);
}

type PastDueLoop = Pick<Loop, "due_at" | "closed_at" | "status">;

/**
 * Consecutive days, ending today, on which no loop of this PM's sat past its
 * clock. A loop counts against a day when any part of [due_at, closed_at or
 * now] falls inside that day, and only if it was still open when its clock
 * ran out.
 */
export function computeStreakDays(loops: PastDueLoop[], now: Date = new Date()): number {
  const intervals = loops
    .map((l) => {
      const due = new Date(l.due_at).getTime();
      const end = l.closed_at ? new Date(l.closed_at).getTime() : now.getTime();
      return end > due ? { from: due, to: end } : null;
    })
    .filter((x): x is { from: number; to: number } => x !== null);

  let streak = 0;
  let dayStart = startOfLocalDay(now).getTime();
  for (let i = 0; i < 365; i += 1) {
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const dirty = intervals.some((iv) => iv.from < dayEnd && iv.to > dayStart);
    if (dirty) break;
    streak += 1;
    dayStart -= 24 * 60 * 60 * 1000;
  }
  return streak;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export async function getQueueForStaff(staffId: string, now: Date = new Date()): Promise<QueueForStaff> {
  const db = await createClient();
  const nowIso = now.toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const endOfToday = endOfLocalDay(now).toISOString();
  const soon = addBusinessMinutes(now, 3 * 60).getTime();

  const [loopsRes, commitmentsRes, outreachRes, statsRes, keptRes, streakRes] = await Promise.all([
    db
      .from("lane_loops")
      .select(LOOP_SELECT)
      .eq("assigned_pm_id", staffId)
      .eq("status", "open")
      .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`),
    db
      .from("lane_commitments")
      .select(COMMITMENT_SELECT)
      .eq("made_by", staffId)
      .or(
        [
          `and(status.eq.open,due_at.lte.${endOfToday})`,
          `and(status.eq.open,prompt_interaction_id.not.is.null,prompt_answered_at.is.null)`,
          `and(status.eq.missed,draft_update.not.is.null)`,
        ].join(","),
      )
      .order("due_at", { ascending: true }),
    db
      .from("lane_outreach_tasks")
      .select(OUTREACH_SELECT)
      .eq("assigned_pm_id", staffId)
      .eq("status", "open")
      .lte("due_at", sevenDaysOut)
      .order("due_at", { ascending: true }),
    db
      .from("lane_v_loop_stats")
      .select("within_sla, status")
      .eq("assigned_pm_id", staffId)
      .eq("status", "closed")
      .gte("opened_at", thirtyDaysAgo),
    db
      .from("lane_commitments")
      .select("status, kept_at, due_at")
      .eq("made_by", staffId)
      .in("status", ["kept", "missed"])
      .gte("due_at", thirtyDaysAgo),
    db
      .from("lane_loops")
      .select("due_at, closed_at, status")
      .eq("assigned_pm_id", staffId)
      .or(`status.eq.open,closed_at.gte.${sixtyDaysAgo}`),
  ]);

  for (const r of [loopsRes, commitmentsRes, outreachRes, statsRes, keptRes, streakRes]) {
    if (r.error) throw new Error(`getQueueForStaff: ${r.error.message}`);
  }

  const all = (loopsRes.data ?? []) as unknown as QueueLoopItem[];
  const startHere: QueueLoopItem[] = [];
  const nextUp: QueueLoopItem[] = [];
  const newToday: QueueLoopItem[] = [];
  for (const loop of all) {
    const due = new Date(loop.due_at).getTime();
    if (due < now.getTime()) startHere.push(loop);
    else if (due <= soon) nextUp.push(loop);
    else newToday.push(loop);
  }
  // Longest waiting first, then due soonest, then newest.
  startHere.sort((a, b) => a.due_at.localeCompare(b.due_at));
  nextUp.sort((a, b) => a.due_at.localeCompare(b.due_at));
  newToday.sort((a, b) => b.opened_at.localeCompare(a.opened_at));

  const closed = statsRes.data ?? [];
  const answeredOnTimePct = pct(closed.filter((l) => l.within_sla).length, closed.length);

  const finished = keptRes.data ?? [];
  const keptOnTime = finished.filter((c) => c.status === "kept" && c.kept_at && c.kept_at <= c.due_at).length;
  const followUpsOnTimePct = pct(keptOnTime, finished.length);

  const streakDays = startHere.length > 0 ? 0 : computeStreakDays(streakRes.data ?? [], now);

  return {
    loops: { startHere, nextUp, newToday, all: [...startHere, ...nextUp, ...newToday] },
    commitments: (commitmentsRes.data ?? []) as unknown as QueueCommitment[],
    outreach: (outreachRes.data ?? []) as unknown as QueueOutreach[],
    stats: {
      answeredOnTimePct,
      followUpsOnTimePct,
      streakDays,
      waitingCount: startHere.length,
      nextUpCount: nextUp.length,
    },
  };
}

// ---------------------------------------------------------------------------
// One loop, with the thread behind it
// ---------------------------------------------------------------------------

export type LoopWithThread = {
  loop: QueueLoopItem;
  owner: Owner;
  property: QueueProperty | null;
  issue: QueueIssue | null;
  trigger: QueueTrigger | null;
  /** Oldest first. The email thread, or the last five touchpoints for calls and texts. */
  thread: Interaction[];
  /** The owner's suggested and open follow-ups, due soonest first. */
  commitments: Commitment[];
};

export async function getLoopWithThread(loopId: string): Promise<LoopWithThread | null> {
  const db = await createClient();
  const { data, error } = await db.from("lane_loops").select(LOOP_SELECT).eq("id", loopId).maybeSingle();
  if (error) throw new Error(`getLoopWithThread: ${error.message}`);
  if (!data) return null;
  const loop = data as unknown as QueueLoopItem;

  const threadQuery =
    loop.type === "email" && loop.thread_id
      ? db
          .from("lane_interactions")
          .select("*")
          .eq("owner_id", loop.owner_id)
          .eq("thread_id", loop.thread_id)
          .order("occurred_at", { ascending: true })
          .limit(20)
      : db
          .from("lane_interactions")
          .select("*")
          .eq("owner_id", loop.owner_id)
          .order("occurred_at", { ascending: false })
          .limit(5);

  const [ownerRes, threadRes, commitmentsRes] = await Promise.all([
    db.from("lane_owners").select("*").eq("id", loop.owner_id).single(),
    threadQuery,
    db
      .from("lane_commitments")
      .select("*")
      .eq("owner_id", loop.owner_id)
      .in("status", ["suggested", "open"])
      .order("due_at", { ascending: true }),
  ]);
  if (ownerRes.error) throw new Error(`getLoopWithThread: ${ownerRes.error.message}`);
  if (threadRes.error) throw new Error(`getLoopWithThread: ${threadRes.error.message}`);
  if (commitmentsRes.error) throw new Error(`getLoopWithThread: ${commitmentsRes.error.message}`);

  const thread = [...(threadRes.data ?? [])].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  return {
    loop,
    owner: ownerRes.data,
    property: loop.property,
    issue: loop.issue,
    trigger: loop.trigger,
    thread,
    commitments: commitmentsRes.data ?? [],
  };
}

/** One commitment with its owner, for the honest-update screen. */
export async function getCommitmentForUpdate(commitmentId: string): Promise<QueueCommitment | null> {
  const db = await createClient();
  const { data, error } = await db.from("lane_commitments").select(COMMITMENT_SELECT).eq("id", commitmentId).maybeSingle();
  if (error) throw new Error(`getCommitmentForUpdate: ${error.message}`);
  return (data as unknown as QueueCommitment | null) ?? null;
}
