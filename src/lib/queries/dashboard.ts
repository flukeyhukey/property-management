/**
 * Team dashboard reads. One shared view for the whole team: the five headline
 * numbers, one row per PM, the owners who need some care and where a hand
 * would help today.
 *
 * Works with either client (staff session or service role) so the weekly
 * digest can reuse the headline maths. Medians are computed here, not in SQL.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TZDate } from "@date-fns/tz";
import { getISOWeek, getISOWeekYear } from "date-fns";
import type { Database } from "@/lib/domain/database";
import { TZ, formatMinutes } from "@/lib/domain/time";
import type { Health, LoopType, Staff } from "@/lib/domain/types";
import { CHANNEL_LABEL } from "@/lib/domain/types";

export type Db = SupabaseClient<Database>;

export type Period = "week" | "30d" | "quarter";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "30d", label: "30 days" },
  { value: "quarter", label: "Quarter" },
];

export function parsePeriod(raw: string | string[] | undefined): Period {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "30d" || v === "quarter" ? v : "week";
}

export type PeriodRange = {
  period: Period;
  /** Start of the current period (inclusive). */
  start: Date;
  /** End of the current period (exclusive, usually now). */
  end: Date;
  /** The same length of time immediately before `start`. */
  prevStart: Date;
  prevEnd: Date;
  /** "week of 28 September", "last 30 days", "last 90 days" */
  label: string;
  /** "last week", "the 30 days before", "the quarter before" */
  compareLabel: string;
};

function mondayOf(d: Date): Date {
  const local = new TZDate(d, TZ);
  const day = local.getDay(); // 0 Sunday
  const back = day === 0 ? 6 : day - 1;
  return new Date(new TZDate(local.getFullYear(), local.getMonth(), local.getDate() - back, 0, 0, 0, 0, TZ).getTime());
}

const DAY = 24 * 60 * 60 * 1000;

export function periodRange(period: Period, now: Date = new Date()): PeriodRange {
  if (period === "week") {
    const start = mondayOf(now);
    const date = new TZDate(start, TZ).toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: TZ });
    return {
      period,
      start,
      end: now,
      prevStart: new Date(start.getTime() - 7 * DAY),
      prevEnd: start,
      label: `week of ${date}`,
      compareLabel: "last week",
    };
  }
  const days = period === "30d" ? 30 : 90;
  const start = new Date(now.getTime() - days * DAY);
  return {
    period,
    start,
    end: now,
    prevStart: new Date(start.getTime() - days * DAY),
    prevEnd: start,
    label: `last ${days} days`,
    compareLabel: period === "30d" ? "the 30 days before" : "the quarter before",
  };
}

/** A completed ISO week: last Monday to this Monday. Used by the Monday digest. */
export function lastCompletedWeek(now: Date = new Date()): PeriodRange {
  const end = mondayOf(now);
  const start = new Date(end.getTime() - 7 * DAY);
  const date = new TZDate(start, TZ).toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: TZ });
  return {
    period: "week",
    start,
    end,
    prevStart: new Date(start.getTime() - 7 * DAY),
    prevEnd: start,
    label: `week of ${date}`,
    compareLabel: "the week before",
  };
}

export function isoWeekKey(d: Date): string {
  const local = new TZDate(d, TZ);
  return `${getISOWeekYear(local)}-W${String(getISOWeek(local)).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Types the page renders
// ---------------------------------------------------------------------------

export type HeadlineStat = {
  key: "answered" | "calls" | "followups" | "manual" | "catchup";
  label: string;
  /** "92%", "3" */
  value: string;
  /** Numeric value used for trends (percentage points or a count). */
  numeric: number | null;
  /** Numeric value in the previous period, when it can be known. */
  previous: number | null;
  /** "Goal 95% · up 3 on last week" */
  detail: string;
};

export type PmRow = {
  staffId: string;
  name: string;
  role: Staff["role"];
  isYou: boolean;
  /** Median business minutes to first reply, by loop type. Null when there were none. */
  firstReplyCall: number | null;
  firstReplySms: number | null;
  firstReplyEmail: number | null;
  answeredOnTimePct: number | null;
  callsToReturn: number;
  waitingTwoDays: number;
  followUpsKept: number;
  followUpsMade: number;
  followUpsPct: number | null;
  closedByHand: number;
  closedByHandPct: number | null;
  dueCatchUp: number;
};

export type CareOwner = {
  id: string;
  name: string;
  health: Health;
  reason: string;
  latest: string;
  pmName: string;
};

export type HelpItem = {
  kind: "Waiting over a day" | "Follow-up running late" | "Unhappy survey response";
  sentence: string;
  href: string;
  /** For sorting: older first. */
  since: string;
};

export type DashboardData = {
  range: PeriodRange;
  headline: HeadlineStat[];
  rows: PmRow[];
  care: CareOwner[];
  help: HelpItem[];
  ownersTotal: number;
};

// ---------------------------------------------------------------------------
// Maths
// ---------------------------------------------------------------------------

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function pct(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 100);
}

type StatRow = Database["public"]["Views"]["lane_v_loop_stats"]["Row"];

function inRange(iso: string | null, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

/**
 * On time = closed by its due time. Not on time = closed late, or still open
 * and past due. Open loops that are not yet due are left out of the count.
 */
function onTimeCounts(loops: StatRow[], now: Date): { onTime: number; counted: number } {
  let onTime = 0;
  let counted = 0;
  for (const l of loops) {
    if (l.status === "closed") {
      counted += 1;
      if (l.within_sla) onTime += 1;
    } else if (l.due_at && new Date(l.due_at).getTime() < now.getTime()) {
      counted += 1;
    }
  }
  return { onTime, counted };
}

type CommitmentRow = Pick<
  Database["public"]["Tables"]["lane_commitments"]["Row"],
  "id" | "owner_id" | "made_by" | "status" | "due_at" | "kept_at" | "text" | "draft_update"
>;

/** Done on time = kept by the due date. Late = missed, kept late, or open and past due. */
function followUpCounts(items: CommitmentRow[], now: Date): { kept: number; counted: number } {
  let kept = 0;
  let counted = 0;
  for (const c of items) {
    if (c.status === "kept") {
      counted += 1;
      if (!c.kept_at || new Date(c.kept_at).getTime() <= new Date(c.due_at).getTime()) kept += 1;
    } else if (c.status === "missed") {
      counted += 1;
    } else if (c.status === "open" && new Date(c.due_at).getTime() < now.getTime()) {
      counted += 1;
    }
  }
  return { kept, counted };
}

type OwnerRow = Pick<
  Database["public"]["Tables"]["lane_owners"]["Row"],
  "id" | "name" | "health" | "health_reason" | "assigned_pm_id" | "last_contact_at" | "cadence_days" | "onboarded_at" | "created_at"
>;

/** Past cadence: no contact within `cadence_days`, counting from onboarding when we have never spoken. */
export function isDueCatchUp(owner: OwnerRow, now: Date): boolean {
  const since = owner.last_contact_at ?? owner.onboarded_at ?? owner.created_at;
  return new Date(since).getTime() + owner.cadence_days * DAY < now.getTime();
}

export function trendWords(current: number | null, previous: number | null, compareLabel: string): string {
  if (current == null || previous == null) return "";
  const diff = current - previous;
  if (diff === 0) return `level with ${compareLabel}`;
  return `${diff > 0 ? "up" : "down"} ${Math.abs(diff)} on ${compareLabel}`;
}

// ---------------------------------------------------------------------------
// Headline stats (shared with the weekly digest)
// ---------------------------------------------------------------------------

export type HeadlineInput = {
  loops: StatRow[];
  commitments: CommitmentRow[];
  owners: OwnerRow[];
  range: PeriodRange;
  now: Date;
};

export function computeHeadline({ loops, commitments, owners, range, now }: HeadlineInput): HeadlineStat[] {
  const cur = loops.filter((l) => inRange(l.opened_at, range.start, range.end));
  const prev = loops.filter((l) => inRange(l.opened_at, range.prevStart, range.prevEnd));
  const curDue = commitments.filter((c) => inRange(c.due_at, range.start, range.end));
  const prevDue = commitments.filter((c) => inRange(c.due_at, range.prevStart, range.prevEnd));

  const a = onTimeCounts(cur, now);
  const aPrev = onTimeCounts(prev, now);
  const answered = pct(a.onTime, a.counted);
  const answeredPrev = pct(aPrev.onTime, aPrev.counted);

  const c = onTimeCounts(cur.filter((l) => l.type === "missed_call"), now);
  const cPrev = onTimeCounts(prev.filter((l) => l.type === "missed_call"), now);
  const calls = pct(c.onTime, c.counted);
  const callsPrev = pct(cPrev.onTime, cPrev.counted);

  const f = followUpCounts(curDue, now);
  const fPrev = followUpCounts(prevDue, now);
  const followups = pct(f.kept, f.counted);
  const followupsPrev = pct(fPrev.kept, fPrev.counted);

  const closedCur = loops.filter((l) => l.status === "closed" && inRange(l.closed_at, range.start, range.end));
  const closedPrev = loops.filter((l) => l.status === "closed" && inRange(l.closed_at, range.prevStart, range.prevEnd));
  const manual = pct(closedCur.filter((l) => l.close_kind === "manual").length, closedCur.length);
  const manualPrev = pct(closedPrev.filter((l) => l.close_kind === "manual").length, closedPrev.length);

  const dueCatchUp = owners.filter((o) => isDueCatchUp(o, now)).length;

  const show = (v: number | null) => (v == null ? "—" : `${v}%`);
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

  return [
    {
      key: "answered",
      label: "Owners answered on time",
      value: show(answered),
      numeric: answered,
      previous: answeredPrev,
      detail: join("Goal 95%", trendWords(answered, answeredPrev, range.compareLabel)),
    },
    {
      key: "calls",
      label: "Missed calls returned within the hour",
      value: show(calls),
      numeric: calls,
      previous: callsPrev,
      detail: join(`${c.onTime} of ${c.counted}`, trendWords(calls, callsPrev, range.compareLabel)),
    },
    {
      key: "followups",
      label: "Follow-ups done on time",
      value: show(followups),
      numeric: followups,
      previous: followupsPrev,
      detail: join(`${f.kept} of ${f.counted}`, "goal 95%", trendWords(followups, followupsPrev, range.compareLabel)),
    },
    {
      key: "manual",
      label: "Closed by hand",
      value: show(manual),
      numeric: manual,
      previous: manualPrev,
      detail: join("Goal under 5%", trendWords(manual, manualPrev, range.compareLabel)),
    },
    {
      key: "catchup",
      label: "Owners due a catch-up",
      value: String(dueCatchUp),
      numeric: dueCatchUp,
      previous: null,
      detail: `Of ${owners.length} owners · tasks are in each queue`,
    },
  ];
}

/** Fetches the rows the headline maths needs, for either client. */
export async function loadHeadlineInput(db: Db, range: PeriodRange, now: Date = new Date()): Promise<HeadlineInput> {
  const sinceIso = range.prevStart.toISOString();
  const [loopsRes, commitmentsRes, ownersRes] = await Promise.all([
    db.from("lane_v_loop_stats").select("*").or(`opened_at.gte.${sinceIso},closed_at.gte.${sinceIso},status.eq.open`),
    db
      .from("lane_commitments")
      .select("id, owner_id, made_by, status, due_at, kept_at, text, draft_update")
      .gte("due_at", sinceIso)
      .in("status", ["open", "kept", "missed"]),
    db
      .from("lane_owners")
      .select("id, name, health, health_reason, assigned_pm_id, last_contact_at, cadence_days, onboarded_at, created_at")
      .eq("is_active", true),
  ]);
  return {
    loops: loopsRes.data ?? [],
    commitments: commitmentsRes.data ?? [],
    owners: ownersRes.data ?? [],
    range,
    now,
  };
}

export async function getHeadlineStats(db: Db, range: PeriodRange, now: Date = new Date()): Promise<HeadlineStat[]> {
  return computeHeadline(await loadHeadlineInput(db, range, now));
}

// ---------------------------------------------------------------------------
// The whole dashboard
// ---------------------------------------------------------------------------

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

function possessive(name: string): string {
  const first = firstName(name);
  return first.endsWith("s") ? `${first}'` : `${first}'s`;
}

/** "today", "yesterday", "on Tuesday", "3 weeks ago" in Brisbane time. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const then = new TZDate(new Date(iso), TZ);
  const today = new TZDate(now, TZ);
  const startOf = (d: TZDate) => new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0, TZ).getTime();
  const days = Math.round((startOf(today) - startOf(then)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `on ${then.toLocaleDateString("en-AU", { weekday: "long", timeZone: TZ })}`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return then.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: TZ });
}

const LOOP_NOUN: Record<LoopType, string> = {
  email: "an email",
  missed_call: "a call back",
  sms: "a text",
  maintenance: "news about a repair",
  detractor: "a call about their survey",
  resly: "a word about their bookings",
};

export async function getDashboard(
  db: Db,
  { period, staffId, now = new Date() }: { period: Period; staffId: string; now?: Date },
): Promise<DashboardData> {
  const range = periodRange(period, now);
  const nowIso = now.toISOString();
  const weekAgoIso = new Date(now.getTime() - 7 * DAY).toISOString();
  const dayAgoIso = new Date(now.getTime() - DAY).toISOString();

  const [input, staffRes, openLoopsRes, lateRes, npsRes] = await Promise.all([
    loadHeadlineInput(db, range, now),
    db.from("lane_staff").select("*").eq("is_active", true).order("name"),
    db
      .from("lane_loops")
      .select("id, type, owner_id, assigned_pm_id, opened_at, ai_draft, summary, owner:lane_owners!lane_loops_owner_id_fkey(name)")
      .eq("status", "open")
      .lt("opened_at", dayAgoIso)
      .order("opened_at", { ascending: true })
      .limit(30),
    db
      .from("lane_commitments")
      .select("id, owner_id, made_by, status, due_at, kept_at, text, draft_update, owner:lane_owners!lane_commitments_owner_id_fkey(name)")
      .or(`status.eq.missed,and(status.eq.open,due_at.lt.${nowIso})`)
      .order("due_at", { ascending: true })
      .limit(30),
    db
      .from("lane_nps_responses")
      .select("id, owner_id, score, responded_at, loop_id, owner:lane_owners!lane_nps_responses_owner_id_fkey(name)")
      .lte("score", 6)
      .gte("responded_at", weekAgoIso)
      .order("responded_at", { ascending: false })
      .limit(20),
  ]);

  const staff = staffRes.data ?? [];
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const { loops, commitments, owners } = input;
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  // Headline -----------------------------------------------------------------
  const headline = computeHeadline(input);

  // Per PM rows --------------------------------------------------------------
  const curLoops = loops.filter((l) => inRange(l.opened_at, range.start, range.end));
  const openLoops = loops.filter((l) => l.status === "open");
  const curDue = commitments.filter((c) => inRange(c.due_at, range.start, range.end));
  const closedCur = loops.filter((l) => l.status === "closed" && inRange(l.closed_at, range.start, range.end));

  const pmFor = (c: CommitmentRow) => c.made_by ?? ownerById.get(c.owner_id)?.assigned_pm_id ?? null;

  const rowsFor = staff.filter(
    (s) => s.role === "pm" || (s.role === "gm" && loops.some((l) => l.assigned_pm_id === s.id)),
  );

  const rows: PmRow[] = rowsFor.map((s) => {
    const mine = curLoops.filter((l) => l.assigned_pm_id === s.id);
    const replies = (type: LoopType) =>
      median(
        mine
          .filter((l) => l.type === type && l.status === "closed" && l.close_kind === "evidence" && l.response_minutes != null)
          .map((l) => l.response_minutes as number),
      );
    const onTime = onTimeCounts(mine, now);
    const myOpen = openLoops.filter((l) => l.assigned_pm_id === s.id);
    const f = followUpCounts(curDue.filter((c) => pmFor(c) === s.id), now);
    const myClosed = closedCur.filter((l) => l.assigned_pm_id === s.id);
    const manual = myClosed.filter((l) => l.close_kind === "manual").length;
    return {
      staffId: s.id,
      name: s.name,
      role: s.role,
      isYou: s.id === staffId,
      firstReplyCall: replies("missed_call"),
      firstReplySms: replies("sms"),
      firstReplyEmail: replies("email"),
      answeredOnTimePct: pct(onTime.onTime, onTime.counted),
      callsToReturn: myOpen.filter((l) => l.type === "missed_call").length,
      waitingTwoDays: myOpen.filter((l) => l.open_over_48h).length,
      followUpsKept: f.kept,
      followUpsMade: f.counted,
      followUpsPct: pct(f.kept, f.counted),
      closedByHand: manual,
      closedByHandPct: pct(manual, myClosed.length),
      dueCatchUp: owners.filter((o) => o.assigned_pm_id === s.id && isDueCatchUp(o, now)).length,
    };
  });

  // Owners who need some care -----------------------------------------------
  const rank: Record<Health, number> = { red: 0, amber: 1, green: 2 };
  const careOwners = owners
    .filter((o) => o.health !== "green")
    .sort((a, b) => rank[a.health] - rank[b.health] || a.name.localeCompare(b.name))
    .slice(0, 8);

  const latestByOwner = new Map<string, string>();
  if (careOwners.length) {
    const { data: interactions } = await db
      .from("lane_interactions")
      .select("owner_id, channel, direction, occurred_at, subject, ai_summary")
      .in(
        "owner_id",
        careOwners.map((o) => o.id),
      )
      .in("direction", ["inbound", "outbound"])
      .order("occurred_at", { ascending: false })
      .limit(120);
    for (const i of interactions ?? []) {
      if (latestByOwner.has(i.owner_id)) continue;
      const who = i.direction === "inbound" ? "from them" : "from us";
      const what = i.ai_summary ?? i.subject ?? "";
      latestByOwner.set(
        i.owner_id,
        `${CHANNEL_LABEL[i.channel]} ${who} ${relativeDay(i.occurred_at, now)}${what ? `: ${what}` : ""}`,
      );
    }
  }

  const care: CareOwner[] = careOwners.map((o) => ({
    id: o.id,
    name: o.name,
    health: o.health,
    reason: o.health_reason ?? (o.health === "red" ? "Needs attention" : "Needs some care"),
    latest: latestByOwner.get(o.id) ?? "Nothing on file yet",
    pmName: o.assigned_pm_id ? firstName(staffById.get(o.assigned_pm_id)?.name ?? "") || "Unassigned" : "Unassigned",
  }));

  // Where a hand would help today -------------------------------------------
  const help: HelpItem[] = [];

  for (const l of openLoopsRes.data ?? []) {
    const ownerName = (l.owner as { name: string } | null)?.name ?? "An owner";
    const pm = l.assigned_pm_id ? staffById.get(l.assigned_pm_id) : null;
    const queue = pm ? `${possessive(pm.name)} queue` : "the queue";
    const tail = l.ai_draft ? `A reply is drafted in ${queue}.` : `It is in ${queue}.`;
    help.push({
      kind: "Waiting over a day",
      sentence: `${ownerName} has been waiting on ${LOOP_NOUN[l.type]} since ${relativeDay(l.opened_at, now)}. ${tail}`,
      href: `/loops/${l.id}`,
      since: l.opened_at,
    });
  }

  for (const c of lateRes.data ?? []) {
    const ownerName = (c.owner as { name: string } | null)?.name ?? "an owner";
    const pmId = c.made_by ?? ownerById.get(c.owner_id)?.assigned_pm_id ?? null;
    const pm = pmId ? staffById.get(pmId) : null;
    const queue = pm ? `${possessive(pm.name)} queue` : "the queue";
    const tail = c.draft_update ? `An honest update is drafted in ${queue}.` : `A new date is waiting in ${queue}.`;
    help.push({
      kind: "Follow-up running late",
      sentence: `A follow-up to ${ownerName}, ${lowerFirst(c.text)}, was due ${relativeDay(c.due_at, now)}. ${tail}`,
      href: `/owners/${c.owner_id}`,
      since: c.due_at,
    });
  }

  for (const n of npsRes.data ?? []) {
    const ownerName = (n.owner as { name: string } | null)?.name ?? "An owner";
    help.push({
      kind: "Unhappy survey response",
      sentence: `${ownerName} gave us a ${n.score} ${relativeDay(n.responded_at, now)}. A call from a director will close it.`,
      href: n.loop_id ? `/loops/${n.loop_id}` : `/owners/${n.owner_id}`,
      since: n.responded_at,
    });
  }

  help.sort((a, b) => a.since.localeCompare(b.since));

  return { range, headline, rows, care, help: help.slice(0, 8), ownersTotal: owners.length };
}

function lowerFirst(s: string): string {
  const t = s.trim().replace(/\.$/, "");
  return t ? t[0].toLowerCase() + t.slice(1) : t;
}

/** "1h 12m", "45m", or a dash. */
export function minutesLabel(mins: number | null): string {
  return mins == null ? "—" : formatMinutes(mins);
}
