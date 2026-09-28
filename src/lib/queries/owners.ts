/**
 * Read helpers for the Owners list and the Owner 360 page.
 *
 * Everything here goes through the staff session client (RLS). Joins are
 * done in code rather than with embedded selects because lane_properties,
 * lane_issues and lane_reservations are views over the cleaning app's
 * tables and PostgREST cannot follow foreign keys into them reliably.
 */
import { TZDate } from "@date-fns/tz";
import { createClient } from "@/lib/supabase/server";
import { businessMinutesBetween, TZ } from "@/lib/domain/time";
import type { Json } from "@/lib/domain/database";
import type {
  Channel,
  Commitment,
  Health,
  HealthSnapshot,
  Interaction,
  Issue,
  Loop,
  NpsResponse,
  Owner,
  OwnerContactPoint,
  OutreachTask,
  Property,
  PropertyReview,
  PropertySnapshot,
  Reservation,
  Staff,
} from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OwnerListRow = {
  owner: Owner;
  pm: Pick<Staff, "id" | "name"> | null;
  propertyCount: number;
  regions: string[];
  openLoops: number;
  nextCatchUpAt: string | null;
};

export type ListOwnersInput = {
  q?: string | null;
  health?: Health | null;
  pmId?: string | null;
};

export type PropertyWithStats = {
  property: Property;
  snapshot: PropertySnapshot | null;
  reviewAverage: number | null;
  reviewCount: number;
};

export type IssueWithProperty = {
  issue: Issue;
  property: Property | null;
};

export type Tone = "Frustrated" | "Neutral" | "Warm";

export type HealthInputs = {
  /** Follow-ups that ran late in the last 90 days. */
  lateFollowUps90: number;
  /** Tone of inbound emails in the last 90 days, null when there were none. */
  tone: Tone | null;
  /** Business minutes the oldest open loop has been waiting, null when nothing is open. */
  waitingMinutes: number | null;
  /** Average business minutes to close a loop in the last 90 days. */
  usualReplyMinutes: number | null;
  /** Latest occupancy this month against what the owner expects. */
  occupancy: { actual: number | null; expected: number | null };
  /** Latest survey score, null when there is none. */
  latestSurvey: number | null;
};

export type OccupancySummary = {
  /** e.g. "September" */
  monthLabel: string;
  /** e.g. "September 2025" */
  lastYearLabel: string;
  thisYear: number | null;
  lastYear: number | null;
  source: "snapshot" | "reservations" | "none";
};

export type TimelineItem = {
  id: string;
  channel: Channel;
  direction: "inbound" | "outbound" | "internal";
  occurredAt: string;
  title: string;
  body: string | null;
  tags: string[];
  href: string | null;
};

export type TimelineFilter = {
  channel?: Channel | null;
  q?: string | null;
};

export type Owner360 = {
  owner: Owner;
  pm: Staff | null;
  /** Every active staff member, for names and the reassign control. */
  staff: Staff[];
  contactPoints: OwnerContactPoint[];
  properties: PropertyWithStats[];
  issues: IssueWithProperty[];
  openLoops: Loop[];
  commitments: Commitment[];
  nps: NpsResponse[];
  healthSnapshot: HealthSnapshot | null;
  healthInputs: HealthInputs;
  occupancy: OccupancySummary;
  lastContactFromUs: { at: string; staffName: string | null; channel: Channel } | null;
  nextCatchUpAt: string | null;
  timeline: TimelineItem[];
  /** Interactions in the last 30 days, for the summary card. */
  recentInteractions: Interaction[];
};

// ---------------------------------------------------------------------------
// Small pure helpers (exported for reuse in the page)
// ---------------------------------------------------------------------------

export const HEALTH_ORDER: Record<Health, number> = { red: 0, amber: 1, green: 2 };

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Sentiment is stored as a number from -1 (unhappy) to 1 (happy). */
export function toneFromSentiment(avg: number | null): Tone | null {
  if (avg === null || Number.isNaN(avg)) return null;
  if (avg <= -0.2) return "Frustrated";
  if (avg >= 0.2) return "Warm";
  return "Neutral";
}

function readMetaString(metadata: Json | null | undefined, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, Json | undefined>)[key];
  return typeof v === "string" ? v : null;
}

/** Strips characters that would break a PostgREST `or()` filter. */
function safeLike(q: string): string {
  return q.replace(/[(),.%]/g, " ").trim();
}

function daysAgoIso(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

// ---------------------------------------------------------------------------
// Owners list
// ---------------------------------------------------------------------------

export async function listOwners(input: ListOwnersInput = {}): Promise<OwnerListRow[]> {
  const supabase = await createClient();

  let ownersQuery = supabase.from("lane_owners").select("*").eq("is_active", true);
  if (input.health) ownersQuery = ownersQuery.eq("health", input.health);
  if (input.pmId) ownersQuery = ownersQuery.eq("assigned_pm_id", input.pmId);
  if (input.q && safeLike(input.q)) {
    const term = `%${safeLike(input.q)}%`;
    ownersQuery = ownersQuery.or(`name.ilike.${term},primary_email.ilike.${term}`);
  }

  const { data: owners, error } = await ownersQuery.order("name");
  if (error) throw new Error(`listOwners: ${error.message}`);
  if (!owners?.length) return [];

  const ownerIds = owners.map((o) => o.id);

  const [{ data: staff }, { data: ownerProps }, { data: loops }, { data: outreach }] = await Promise.all([
    supabase.from("lane_staff").select("id, name").eq("is_active", true),
    supabase.from("lane_owner_properties").select("owner_id, property_id").in("owner_id", ownerIds),
    supabase.from("lane_loops").select("owner_id").eq("status", "open").in("owner_id", ownerIds),
    supabase
      .from("lane_outreach_tasks")
      .select("owner_id, due_at")
      .eq("status", "open")
      .in("owner_id", ownerIds)
      .order("due_at"),
  ]);

  const propertyIds = uniq((ownerProps ?? []).map((p) => p.property_id));
  const { data: properties } = propertyIds.length
    ? await supabase.from("lane_properties").select("id, region").in("id", propertyIds)
    : { data: [] as Pick<Property, "id" | "region">[] };

  const regionByProperty = new Map<string, string | null>();
  for (const p of properties ?? []) if (p.id) regionByProperty.set(p.id, p.region);

  const staffById = new Map((staff ?? []).map((s) => [s.id, s]));
  const propsByOwner = new Map<string, string[]>();
  for (const op of ownerProps ?? []) {
    propsByOwner.set(op.owner_id, [...(propsByOwner.get(op.owner_id) ?? []), op.property_id]);
  }
  const loopsByOwner = new Map<string, number>();
  for (const l of loops ?? []) loopsByOwner.set(l.owner_id, (loopsByOwner.get(l.owner_id) ?? 0) + 1);
  const nextCatchUp = new Map<string, string>();
  for (const t of outreach ?? []) if (!nextCatchUp.has(t.owner_id)) nextCatchUp.set(t.owner_id, t.due_at);

  const rows: OwnerListRow[] = owners.map((owner) => {
    const pids = propsByOwner.get(owner.id) ?? [];
    const regions = uniq(pids.map((id) => regionByProperty.get(id)).filter((r): r is string => Boolean(r)));
    return {
      owner,
      pm: owner.assigned_pm_id ? (staffById.get(owner.assigned_pm_id) ?? null) : null,
      propertyCount: pids.length,
      regions,
      openLoops: loopsByOwner.get(owner.id) ?? 0,
      nextCatchUpAt: nextCatchUp.get(owner.id) ?? nextCatchUpFromCadence(owner),
    };
  });

  // Red first, then amber, then the owner we have not spoken to for longest.
  rows.sort((a, b) => {
    const h = HEALTH_ORDER[a.owner.health] - HEALTH_ORDER[b.owner.health];
    if (h !== 0) return h;
    const at = a.owner.last_contact_at ? Date.parse(a.owner.last_contact_at) : 0;
    const bt = b.owner.last_contact_at ? Date.parse(b.owner.last_contact_at) : 0;
    return at - bt;
  });
  return rows;
}

/** When no outreach task exists, the next catch-up is the last outbound plus the cadence. */
export function nextCatchUpFromCadence(owner: Pick<Owner, "last_outbound_at" | "cadence_days" | "onboarded_at">): string | null {
  const base = owner.last_outbound_at ?? owner.onboarded_at;
  if (!base) return null;
  return new Date(Date.parse(base) + owner.cadence_days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

function monthBounds(now: Date, yearOffset = 0) {
  const local = new TZDate(now, TZ);
  const start = new TZDate(local.getFullYear() + yearOffset, local.getMonth(), 1, 0, 0, 0, 0, TZ);
  const end = new TZDate(local.getFullYear() + yearOffset, local.getMonth() + 1, 1, 0, 0, 0, 0, TZ);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()), days };
}

/** Nights of `reservations` that fall inside [start, end), ignoring cancellations and owner stays. */
export function bookedNights(reservations: Pick<Reservation, "check_in" | "check_out" | "status" | "is_owner_stay">[], start: Date, end: Date): number {
  let nights = 0;
  for (const r of reservations) {
    if (!r.check_in || !r.check_out) continue;
    if (r.status && /cancel/i.test(r.status)) continue;
    if (r.is_owner_stay) continue;
    const a = Math.max(Date.parse(r.check_in), start.getTime());
    const b = Math.min(Date.parse(r.check_out), end.getTime());
    if (b > a) nights += (b - a) / 86400000;
  }
  return nights;
}

async function occupancyFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propertyIds: string[],
  snapshots: Map<string, PropertySnapshot>,
  now = new Date(),
): Promise<OccupancySummary> {
  const monthLabel = now.toLocaleDateString("en-AU", { month: "long", timeZone: TZ });
  const lastYearLabel = `${monthLabel} ${new TZDate(now, TZ).getFullYear() - 1}`;
  if (!propertyIds.length) return { monthLabel, lastYearLabel, thisYear: null, lastYear: null, source: "none" };

  const fromSnapshots = propertyIds.map((id) => snapshots.get(id)).filter((s): s is PropertySnapshot => Boolean(s));
  const thisYearSnap = average(fromSnapshots.map((s) => s.occupancy_month).filter((n): n is number => n !== null));
  if (thisYearSnap !== null) {
    const lastYearSnap = average(fromSnapshots.map((s) => s.occupancy_month_last_year).filter((n): n is number => n !== null));
    return { monthLabel, lastYearLabel, thisYear: normalisePct(thisYearSnap), lastYear: lastYearSnap === null ? null : normalisePct(lastYearSnap), source: "snapshot" };
  }

  const cur = monthBounds(now);
  const prev = monthBounds(now, -1);
  const { data: reservations } = await supabase
    .from("lane_reservations")
    .select("property_id, check_in, check_out, status, is_owner_stay")
    .in("property_id", propertyIds)
    .gte("check_out", prev.start.toISOString().slice(0, 10))
    .lte("check_in", cur.end.toISOString().slice(0, 10));
  const rows = reservations ?? [];
  if (!rows.length) return { monthLabel, lastYearLabel, thisYear: null, lastYear: null, source: "none" };

  const capacityCur = cur.days * propertyIds.length;
  const capacityPrev = prev.days * propertyIds.length;
  const thisYear = Math.round((bookedNights(rows, cur.start, cur.end) / capacityCur) * 100);
  const lastYear = Math.round((bookedNights(rows, prev.start, prev.end) / capacityPrev) * 100);
  return { monthLabel, lastYearLabel, thisYear, lastYear, source: "reservations" };
}

/** Snapshots may store occupancy as 0..1 or 0..100; show a percentage either way. */
export function normalisePct(n: number): number {
  return Math.round(n <= 1 ? n * 100 : n);
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function callTitle(i: Interaction, ownerFirst: string, staffName: string | null): string {
  const mins = i.call_duration_seconds ? Math.max(1, Math.round(i.call_duration_seconds / 60)) : null;
  const dur = mins ? `, ${mins} min` : "";
  if (i.direction === "inbound") {
    return i.call_answered === false ? `Missed call from ${ownerFirst}` : `Call from ${ownerFirst}${dur}`;
  }
  const who = staffName ? firstName(staffName) : "us";
  if (i.call_answered === false) return `Call to ${ownerFirst} from ${who}, no answer`;
  return `Call from ${who}${dur}`;
}

function interactionToItem(i: Interaction, ownerFirst: string, staffById: Map<string, Staff>): TimelineItem {
  const staffName = i.staff_id ? (staffById.get(i.staff_id)?.name ?? null) : null;
  const who = i.direction === "inbound" ? ownerFirst : staffName ? firstName(staffName) : "us";
  const tags: string[] = [];
  if (i.ai_intent && i.ai_intent !== "general") tags.push(intentLabel(i.ai_intent));
  if (i.ai_urgency === "high") tags.push("Time sensitive");
  if (i.churn_flag) tags.push("Sounds unhappy");
  if (i.is_auto_reply) tags.push("Auto reply");
  if (i.direction === "outbound" && i.channel !== "note") tags.push(`Sent by ${who}`);

  let title: string;
  switch (i.channel) {
    case "email":
      title = i.direction === "inbound" ? `Email from ${ownerFirst}` : `Email to ${ownerFirst}`;
      break;
    case "call":
      title = callTitle(i, ownerFirst, staffName);
      break;
    case "sms":
      title = i.direction === "inbound" ? `Text from ${ownerFirst}` : `Text to ${ownerFirst}`;
      break;
    case "maintenance":
      title = i.subject ? `Maintenance: ${i.subject}` : "Maintenance update";
      break;
    case "nps":
      title = readMetaString(i.metadata, "score") ? `Survey response: ${readMetaString(i.metadata, "score")}` : "Survey response";
      break;
    case "note":
      title = staffName ? `Note by ${firstName(staffName)}` : "Note";
      break;
    case "commitment":
      title = "Follow-up noted";
      break;
    case "resly":
      title = i.subject ?? "Resly update";
      break;
    default:
      title = i.subject ?? "Update";
  }
  const body = i.ai_summary ?? i.body ?? i.subject ?? i.transcript ?? null;
  return {
    id: `interaction:${i.id}`,
    channel: i.channel,
    direction: i.direction,
    occurredAt: i.occurred_at,
    title,
    body: body ? truncate(body, 280) : null,
    tags,
    href: null,
  };
}

function intentLabel(intent: NonNullable<Interaction["ai_intent"]>): string {
  switch (intent) {
    case "payout":
      return "Payout";
    case "maintenance":
      return "Maintenance";
    case "complaint":
      return "Complaint";
    case "churn_risk":
      return "Sounds unhappy";
    case "booking":
      return "Booking";
    default:
      return "General";
  }
}

function commitmentToItems(c: Commitment, staffById: Map<string, Staff>): TimelineItem[] {
  const who = c.made_by ? firstName(staffById.get(c.made_by)?.name ?? "") : "";
  const by = who ? ` by ${who}` : "";
  const items: TimelineItem[] = [
    {
      id: `commitment:${c.id}`,
      channel: "commitment",
      direction: "internal",
      occurredAt: c.made_at,
      title: c.status === "suggested" ? "Follow-up suggested" : `Follow-up noted${by}`,
      body: c.text,
      tags: [c.status === "kept" ? "Kept" : c.status === "missed" ? "Ran late" : c.status === "open" ? "Open" : "Suggested"],
      href: null,
    },
  ];
  if (c.status === "kept" && c.kept_at) {
    items.push({
      id: `commitment-kept:${c.id}`,
      channel: "commitment",
      direction: "internal",
      occurredAt: c.kept_at,
      title: "Follow-up kept",
      body: c.text,
      tags: [c.close_kind === "manual" ? "Closed by hand" : "Kept"],
      href: null,
    });
  }
  if (c.status === "missed" && c.missed_at) {
    items.push({
      id: `commitment-late:${c.id}`,
      channel: "commitment",
      direction: "internal",
      occurredAt: c.missed_at,
      title: "Follow-up ran late",
      body: c.draft_update ? "Draft ready" : c.text,
      tags: ["Ran late"],
      href: null,
    });
  }
  return items;
}

function npsToItem(n: NpsResponse): TimelineItem {
  return {
    id: `nps:${n.id}`,
    channel: "nps",
    direction: "inbound",
    occurredAt: n.responded_at,
    title: `Survey response: ${n.score}`,
    body: n.comment,
    tags: [n.kind === "quarterly" ? "Quarterly" : n.kind === "onboarding" ? "After onboarding" : "After maintenance"],
    href: null,
  };
}

function issueToItem(issue: Issue, property: Property | null): TimelineItem | null {
  if (!issue.id || !issue.created_at) return null;
  const tags: string[] = [];
  if (issue.status) tags.push(issueStatusLabel(issue.status));
  if (issue.severity) tags.push(sentence(issue.severity));
  return {
    id: `issue:${issue.id}`,
    channel: "maintenance",
    direction: "internal",
    occurredAt: issue.created_at,
    title: property?.name ? `Maintenance at ${property.name}` : "Maintenance",
    body: issue.description ? truncate(issue.description, 280) : null,
    tags,
    href: null,
  };
}

export function issueStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "open" || s === "new") return "Open";
  if (s.includes("progress")) return "In progress";
  if (s === "resolved" || s === "closed" || s === "done") return "Sorted";
  if (s.includes("wait")) return "Waiting on a trade";
  return sentence(status.replace(/_/g, " "));
}

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Chips on the timeline: All plus one per channel. */
export const TIMELINE_CHANNELS: { value: Channel | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "email", label: "Email" },
  { value: "call", label: "Calls" },
  { value: "sms", label: "SMS" },
  { value: "maintenance", label: "Maintenance" },
  { value: "commitment", label: "Follow-ups" },
  { value: "nps", label: "Survey" },
  { value: "note", label: "Notes" },
];

/**
 * The merged, newest-first list of everything that happened with an owner:
 * interactions, follow-ups, survey responses and maintenance issues.
 */
export async function getTimeline(ownerId: string, filter: TimelineFilter = {}): Promise<TimelineItem[]> {
  const supabase = await createClient();
  const { data: owner } = await supabase.from("lane_owners").select("*").eq("id", ownerId).maybeSingle();
  if (!owner) return [];
  const { data: staff } = await supabase.from("lane_staff").select("*");
  const { data: ownerProps } = await supabase.from("lane_owner_properties").select("property_id").eq("owner_id", ownerId);
  const propertyIds = (ownerProps ?? []).map((p) => p.property_id);
  const { data: properties } = propertyIds.length
    ? await supabase.from("lane_properties").select("*").in("id", propertyIds)
    : { data: [] as Property[] };
  const { data: issues } = propertyIds.length
    ? await supabase.from("lane_issues").select("*").in("property_id", propertyIds)
    : { data: [] as Issue[] };
  return buildTimeline({
    owner,
    staff: staff ?? [],
    interactions: await fetchInteractions(supabase, ownerId, filter),
    commitments: (await supabase.from("lane_commitments").select("*").eq("owner_id", ownerId)).data ?? [],
    nps: (await supabase.from("lane_nps_responses").select("*").eq("owner_id", ownerId)).data ?? [],
    issues: issues ?? [],
    properties: properties ?? [],
    filter,
  });
}

async function fetchInteractions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  filter: TimelineFilter,
): Promise<Interaction[]> {
  let q = supabase.from("lane_interactions").select("*").eq("owner_id", ownerId).order("occurred_at", { ascending: false }).limit(400);
  if (filter.channel) q = q.eq("channel", filter.channel);
  if (filter.q && safeLike(filter.q)) {
    const term = `%${safeLike(filter.q)}%`;
    q = q.or(`subject.ilike.${term},body.ilike.${term},ai_summary.ilike.${term},transcript.ilike.${term}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`timeline: ${error.message}`);
  return data ?? [];
}

export function buildTimeline(input: {
  owner: Owner;
  staff: Staff[];
  interactions: Interaction[];
  commitments: Commitment[];
  nps: NpsResponse[];
  issues: Issue[];
  properties: Property[];
  filter?: TimelineFilter;
}): TimelineItem[] {
  const filter = input.filter ?? {};
  const staffById = new Map(input.staff.map((s) => [s.id, s]));
  const propertyById = new Map(input.properties.filter((p) => p.id).map((p) => [p.id as string, p]));
  const ownerFirst = firstName(input.owner.name);

  const items: TimelineItem[] = input.interactions.map((i) => interactionToItem(i, ownerFirst, staffById));

  // Survey responses that already exist as an interaction are not repeated.
  const npsInteractionIds = new Set(input.nps.map((n) => n.interaction_id).filter(Boolean));
  const interactionIds = new Set(input.interactions.map((i) => i.id));
  for (const n of input.nps) {
    if (n.interaction_id && interactionIds.has(n.interaction_id)) continue;
    if (n.interaction_id && npsInteractionIds.has(n.interaction_id) && filter.channel && filter.channel !== "nps") continue;
    items.push(npsToItem(n));
  }

  // Issues already told through a maintenance interaction are not repeated.
  const issueIdsInInteractions = new Set(
    input.interactions.map((i) => readMetaString(i.metadata, "issue_id")).filter((id): id is string => Boolean(id)),
  );
  for (const issue of input.issues) {
    if (issue.id && issueIdsInInteractions.has(issue.id)) continue;
    const item = issueToItem(issue, issue.property_id ? (propertyById.get(issue.property_id) ?? null) : null);
    if (item) items.push(item);
  }

  for (const c of input.commitments) items.push(...commitmentToItems(c, staffById));

  let out = items;
  if (filter.channel) out = out.filter((i) => i.channel === filter.channel);
  if (filter.q && filter.q.trim()) {
    const needle = filter.q.trim().toLowerCase();
    out = out.filter((i) => `${i.title} ${i.body ?? ""} ${i.tags.join(" ")}`.toLowerCase().includes(needle));
  }
  out.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return out;
}

// ---------------------------------------------------------------------------
// Owner 360
// ---------------------------------------------------------------------------

export async function getOwner360(ownerId: string, timelineFilter: TimelineFilter = {}): Promise<Owner360 | null> {
  const supabase = await createClient();
  const now = new Date();
  const since90 = daysAgoIso(90, now);
  const since30 = daysAgoIso(30, now);

  const { data: owner, error } = await supabase.from("lane_owners").select("*").eq("id", ownerId).maybeSingle();
  if (error) throw new Error(`getOwner360: ${error.message}`);
  if (!owner) return null;

  const [
    { data: staff },
    { data: contactPoints },
    { data: ownerProps },
    { data: loops },
    { data: commitments },
    { data: nps },
    { data: healthSnapshot },
    { data: outreach },
    { data: lastOutbound },
    { data: recentInbound },
    filteredInteractions,
    { data: recentInteractions },
  ] = await Promise.all([
    supabase.from("lane_staff").select("*").eq("is_active", true).order("name"),
    supabase.from("lane_owner_contact_points").select("*").eq("owner_id", ownerId).order("is_primary", { ascending: false }),
    supabase.from("lane_owner_properties").select("property_id").eq("owner_id", ownerId),
    supabase.from("lane_loops").select("*").eq("owner_id", ownerId).order("opened_at", { ascending: false }).limit(200),
    supabase.from("lane_commitments").select("*").eq("owner_id", ownerId).order("due_at", { ascending: false }).limit(200),
    supabase.from("lane_nps_responses").select("*").eq("owner_id", ownerId).order("responded_at", { ascending: false }),
    supabase
      .from("lane_health_snapshots")
      .select("*")
      .eq("owner_id", ownerId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("lane_outreach_tasks").select("*").eq("owner_id", ownerId).eq("status", "open").order("due_at").limit(1),
    supabase
      .from("lane_interactions")
      .select("occurred_at, staff_id, channel")
      .eq("owner_id", ownerId)
      .eq("direction", "outbound")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("lane_interactions")
      .select("ai_sentiment")
      .eq("owner_id", ownerId)
      .eq("direction", "inbound")
      .eq("channel", "email")
      .gte("occurred_at", since90)
      .not("ai_sentiment", "is", null),
    fetchInteractions(supabase, ownerId, timelineFilter),
    supabase.from("lane_interactions").select("*").eq("owner_id", ownerId).gte("occurred_at", since30).order("occurred_at", { ascending: false }),
  ]);

  const propertyIds = uniq((ownerProps ?? []).map((p) => p.property_id));

  const [{ data: properties }, { data: snapshots }, { data: reviews }, { data: issues }] = await Promise.all([
    propertyIds.length
      ? supabase.from("lane_properties").select("*").in("id", propertyIds).order("name")
      : Promise.resolve({ data: [] as Property[] }),
    propertyIds.length
      ? supabase.from("lane_property_snapshots").select("*").in("property_id", propertyIds).order("snapshot_date", { ascending: false })
      : Promise.resolve({ data: [] as PropertySnapshot[] }),
    propertyIds.length
      ? supabase.from("lane_property_reviews").select("*").in("property_id", propertyIds)
      : Promise.resolve({ data: [] as PropertyReview[] }),
    propertyIds.length
      ? supabase.from("lane_issues").select("*").in("property_id", propertyIds).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as Issue[] }),
  ]);

  const latestSnapshot = new Map<string, PropertySnapshot>();
  for (const s of snapshots ?? []) if (!latestSnapshot.has(s.property_id)) latestSnapshot.set(s.property_id, s);

  const reviewsByProperty = new Map<string, number[]>();
  for (const r of reviews ?? []) reviewsByProperty.set(r.property_id, [...(reviewsByProperty.get(r.property_id) ?? []), r.rating]);

  const propertyList: PropertyWithStats[] = (properties ?? []).map((property) => {
    const id = property.id ?? "";
    const ratings = reviewsByProperty.get(id) ?? [];
    const avg = average(ratings);
    return {
      property,
      snapshot: latestSnapshot.get(id) ?? null,
      reviewAverage: avg === null ? null : Math.round(avg * 10) / 10,
      reviewCount: ratings.length,
    };
  });
  const propertyById = new Map(propertyList.map((p) => [p.property.id ?? "", p.property]));

  const allLoops = loops ?? [];
  const openLoops = allLoops.filter((l) => l.status === "open");
  const closedRecently = allLoops.filter((l) => l.status === "closed" && l.closed_at && l.closed_at >= since90);
  const allCommitments = commitments ?? [];
  const staffList = staff ?? [];
  const staffById = new Map(staffList.map((s) => [s.id, s]));

  const occupancy = await occupancyFor(supabase, propertyIds, latestSnapshot, now);
  const expected = owner.expected_occupancy === null ? null : normalisePct(owner.expected_occupancy);

  const oldestOpen = openLoops.reduce<Loop | null>((acc, l) => (!acc || l.opened_at < acc.opened_at ? l : acc), null);

  const healthInputs: HealthInputs = {
    lateFollowUps90: allCommitments.filter((c) => c.missed_at && c.missed_at >= since90).length,
    tone: toneFromSentiment(average((recentInbound ?? []).map((i) => i.ai_sentiment).filter((n): n is number => n !== null))),
    waitingMinutes: oldestOpen ? Math.max(1, businessMinutesBetween(new Date(oldestOpen.opened_at), now)) : null,
    usualReplyMinutes: average(
      closedRecently.map((l) => businessMinutesBetween(new Date(l.opened_at), new Date(l.closed_at as string))),
    ),
    occupancy: { actual: occupancy.thisYear, expected },
    latestSurvey: nps?.[0]?.score ?? null,
  };

  const lastContactFromUs = lastOutbound
    ? {
        at: lastOutbound.occurred_at,
        staffName: lastOutbound.staff_id ? (staffById.get(lastOutbound.staff_id)?.name ?? null) : null,
        channel: lastOutbound.channel,
      }
    : owner.last_outbound_at
      ? { at: owner.last_outbound_at, staffName: null, channel: "note" as Channel }
      : null;

  const nextOutreach: OutreachTask | undefined = outreach?.[0];

  const timeline = buildTimeline({
    owner,
    staff: staffList,
    interactions: filteredInteractions,
    commitments: allCommitments,
    nps: nps ?? [],
    issues: issues ?? [],
    properties: properties ?? [],
    filter: timelineFilter,
  });

  return {
    owner,
    pm: owner.assigned_pm_id ? (staffById.get(owner.assigned_pm_id) ?? null) : null,
    staff: staffList,
    contactPoints: contactPoints ?? [],
    properties: propertyList,
    issues: (issues ?? []).map((issue) => ({ issue, property: issue.property_id ? (propertyById.get(issue.property_id) ?? null) : null })),
    openLoops,
    commitments: allCommitments,
    nps: nps ?? [],
    healthSnapshot: healthSnapshot ?? null,
    healthInputs,
    occupancy,
    lastContactFromUs,
    nextCatchUpAt: nextOutreach?.due_at ?? nextCatchUpFromCadence(owner),
    timeline,
    recentInteractions: recentInteractions ?? [],
  };
}
