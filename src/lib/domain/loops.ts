/**
 * The loop engine. A loop is something an owner is waiting on us for. Loops
 * open from inbound data and close from outbound data; nobody stops a clock
 * by hand except with a reason from CLOSE_REASONS.
 *
 * The decision rules live in pure helpers at the top of this file so they
 * can be tested without a database. The functions further down apply them
 * with an AdminClient.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "./database";
import { businessMinutesBetween, dueAtFor, formatMinutes } from "./time";
import type { CloseReason, Interaction, Loop, LoopInsert, LoopType, StaffRole } from "./types";

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

/** The slice of an interaction the rules look at. */
export type InteractionLike = Pick<
  Interaction,
  "channel" | "direction" | "is_auto_reply" | "call_answered" | "thread_id" | "subject" | "body" | "ai_summary" | "staff_id"
> & { metadata?: Json | null };

/** The slice of a loop the rules look at. */
export type LoopLike = Pick<Loop, "type" | "status" | "thread_id" | "issue_id" | "texted_not_called">;

export type EvidenceContext = {
  /** Role of the staff member who made the outbound interaction. */
  staffRole?: StaffRole | null;
  /** Description of the issue a maintenance loop is about. */
  issueDescription?: string | null;
};

/** Which loop, if any, an inbound interaction opens. */
export function loopTypeForInbound(
  interaction: Pick<Interaction, "channel" | "direction" | "is_auto_reply" | "call_answered">,
): LoopType | null {
  if (interaction.direction !== "inbound") return null;
  switch (interaction.channel) {
    case "email":
      return interaction.is_auto_reply ? null : "email";
    case "call":
      return interaction.call_answered === false ? "missed_call" : null;
    case "sms":
      return "sms";
    default:
      return null;
  }
}

const STOP_WORDS = new Set([
  "the", "and", "with", "that", "this", "from", "have", "has", "been", "were", "was", "are", "for", "not",
  "but", "its", "it's", "there", "their", "they", "them", "then", "than", "when", "what", "which", "will",
  "would", "could", "should", "about", "into", "onto", "over", "under", "also", "just", "very", "some",
  "more", "most", "such", "only", "same", "other", "than", "please", "thanks", "hello", "unit", "apartment",
  "property", "issue", "problem", "needs", "need", "still", "again", "after", "before", "does", "doesn't",
  "reported", "report", "guest", "guests", "owner", "said", "says", "looks", "like", "seems", "does",
]);

/** Meaningful words from an issue description, lower-cased, no stop words. */
export function issueKeywords(description: string | null | undefined): string[] {
  if (!description) return [];
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  return Array.from(new Set(words));
}

function readIssueId(metadata: Json | null | undefined): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, Json | undefined>).issue_id;
  return typeof v === "string" ? v : null;
}

/**
 * Does this interaction tell the owner about the issue? True when its
 * metadata names the issue, or when its subject/body/summary shares enough
 * keywords with the issue description.
 */
export function mentionsIssue(
  interaction: Pick<InteractionLike, "subject" | "body" | "ai_summary" | "metadata">,
  issueId: string | null,
  issueDescription: string | null | undefined,
): boolean {
  if (issueId && readIssueId(interaction.metadata) === issueId) return true;
  const keywords = issueKeywords(issueDescription);
  if (keywords.length === 0) return false;
  const text = [interaction.subject, interaction.body, interaction.ai_summary]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return false;
  const hits = keywords.filter((k) => text.includes(k)).length;
  const needed = Math.min(2, keywords.length);
  return hits >= needed;
}

/** Whether an outbound interaction satisfies an open loop. */
export function closesLoop(loop: LoopLike, interaction: InteractionLike, ctx: EvidenceContext = {}): boolean {
  if (loop.status !== "open") return false;
  if (interaction.direction !== "outbound") return false;
  const { channel } = interaction;

  switch (loop.type) {
    case "email":
      return (
        channel === "email" &&
        !interaction.is_auto_reply &&
        Boolean(loop.thread_id) &&
        interaction.thread_id === loop.thread_id
      );
    case "missed_call":
      // An outbound call, answered or voicemail, closes it. An SMS does not.
      return channel === "call";
    case "sms":
      return channel === "sms" || channel === "call";
    case "maintenance":
      if (!(channel === "email" || channel === "call" || channel === "sms")) return false;
      return mentionsIssue(interaction, loop.issue_id, ctx.issueDescription);
    case "detractor":
      return channel === "call" && ctx.staffRole === "director";
    case "resly":
      return channel === "email" || channel === "call" || channel === "sms";
    default:
      return false;
  }
}

/** An outbound SMS while a missed call is still open: noted, not closed. */
export function marksTextedNotCalled(loop: LoopLike, interaction: InteractionLike): boolean {
  return (
    loop.status === "open" &&
    loop.type === "missed_call" &&
    !loop.texted_not_called &&
    interaction.direction === "outbound" &&
    interaction.channel === "sms"
  );
}

/** "Sarah Whitfield has been waiting 1h 12m" for the past-due notification. */
export function waitingTitle(ownerName: string, openedAt: Date, now: Date = new Date()): string {
  const mins = Math.max(1, businessMinutesBetween(openedAt, now));
  return `${ownerName} has been waiting ${formatMinutes(mins)}`;
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

export type OpenLoopInput = {
  ownerId: string;
  propertyId?: string | null;
  assignedPmId?: string | null;
  type: LoopType;
  triggerInteractionId?: string | null;
  issueId?: string | null;
  threadId?: string | null;
  summary?: string | null;
  openedAt?: Date;
};

/**
 * Opens a loop unless an equivalent one is already open. Returns the existing
 * loop when it dedupes, so callers always get a row back.
 */
export async function openLoop(db: AdminClient, input: OpenLoopInput): Promise<{ loop: Loop; created: boolean }> {
  const openedAt = input.openedAt ?? new Date();

  // Dedupe: one open loop per (owner, issue) and per (owner, type, thread).
  if (input.issueId) {
    const { data } = await db
      .from("lane_loops")
      .select("*")
      .eq("owner_id", input.ownerId)
      .eq("issue_id", input.issueId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (data) return { loop: data, created: false };
  }
  {
    let q = db.from("lane_loops").select("*").eq("owner_id", input.ownerId).eq("type", input.type).eq("status", "open");
    q = input.threadId ? q.eq("thread_id", input.threadId) : q.is("thread_id", null);
    if (input.type === "maintenance") q = q.is("issue_id", null);
    const { data } = await q.limit(1).maybeSingle();
    if (data) return { loop: data, created: false };
  }

  let assignedPmId = input.assignedPmId ?? null;
  if (!assignedPmId) {
    const { data: owner } = await db.from("lane_owners").select("assigned_pm_id").eq("id", input.ownerId).maybeSingle();
    assignedPmId = owner?.assigned_pm_id ?? null;
  }

  const row: LoopInsert = {
    owner_id: input.ownerId,
    property_id: input.propertyId ?? null,
    assigned_pm_id: assignedPmId,
    type: input.type,
    status: "open",
    opened_at: openedAt.toISOString(),
    due_at: dueAtFor(input.type, openedAt).toISOString(),
    trigger_interaction_id: input.triggerInteractionId ?? null,
    issue_id: input.issueId ?? null,
    thread_id: input.threadId ?? null,
    summary: input.summary ?? null,
  };
  const { data, error } = await db.from("lane_loops").insert(row).select("*").single();
  if (error) throw new Error(`openLoop: ${error.message}`);
  return { loop: data, created: true };
}

export type CloseLoopInput = {
  closingInteractionId?: string | null;
  closedBy?: string | null;
  kind: "evidence" | "manual";
  reason?: CloseReason | null;
  closedAt?: Date;
};

export async function closeLoop(db: AdminClient, loopId: string, input: CloseLoopInput): Promise<Loop> {
  if (input.kind === "manual" && !input.reason) {
    throw new Error("closeLoop: a manual close needs a reason");
  }
  const { data, error } = await db
    .from("lane_loops")
    .update({
      status: "closed",
      closed_at: (input.closedAt ?? new Date()).toISOString(),
      closed_by: input.closedBy ?? null,
      close_kind: input.kind,
      close_reason: input.kind === "manual" ? input.reason ?? null : null,
      closing_interaction_id: input.closingInteractionId ?? null,
      snoozed_until: null,
      snooze_reason: null,
    })
    .eq("id", loopId)
    .eq("status", "open")
    .select("*")
    .single();
  if (error) throw new Error(`closeLoop: ${error.message}`);
  return data;
}

async function touchOwnerContact(db: AdminClient, ownerId: string, occurredAt: string, outbound: boolean) {
  const { data: owner } = await db
    .from("lane_owners")
    .select("last_contact_at, last_outbound_at")
    .eq("id", ownerId)
    .maybeSingle();
  if (!owner) return;
  const patch: { last_contact_at?: string; last_outbound_at?: string } = {};
  if (!owner.last_contact_at || owner.last_contact_at < occurredAt) patch.last_contact_at = occurredAt;
  if (outbound && (!owner.last_outbound_at || owner.last_outbound_at < occurredAt)) patch.last_outbound_at = occurredAt;
  if (Object.keys(patch).length) await db.from("lane_owners").update(patch).eq("id", ownerId);
}

/**
 * After an outbound interaction is recorded: close every open loop for that
 * owner the interaction satisfies, note texted-not-called on missed calls,
 * and stamp the owner's last contact.
 */
export async function applyEvidence(
  db: AdminClient,
  interaction: Interaction,
): Promise<{ closed: Loop[]; textedNotCalled: string[] }> {
  const closed: Loop[] = [];
  const textedNotCalled: string[] = [];
  if (interaction.direction !== "outbound") return { closed, textedNotCalled };

  const { data: loops } = await db
    .from("lane_loops")
    .select("*")
    .eq("owner_id", interaction.owner_id)
    .eq("status", "open");
  const open = loops ?? [];

  let staffRole: StaffRole | null = null;
  if (interaction.staff_id && open.some((l) => l.type === "detractor")) {
    const { data: staff } = await db.from("lane_staff").select("role").eq("id", interaction.staff_id).maybeSingle();
    staffRole = staff?.role ?? null;
  }

  const issueIds = open.map((l) => l.issue_id).filter((id): id is string => Boolean(id));
  const issueDescriptions = new Map<string, string | null>();
  if (issueIds.length) {
    const { data: issues } = await db.from("lane_issues").select("id, description").in("id", issueIds);
    for (const issue of issues ?? []) if (issue.id) issueDescriptions.set(issue.id, issue.description);
  }

  for (const loop of open) {
    const ctx: EvidenceContext = {
      staffRole,
      issueDescription: loop.issue_id ? issueDescriptions.get(loop.issue_id) ?? loop.summary : loop.summary,
    };
    if (closesLoop(loop, interaction, ctx)) {
      closed.push(
        await closeLoop(db, loop.id, {
          kind: "evidence",
          closingInteractionId: interaction.id,
          closedBy: interaction.staff_id,
          closedAt: new Date(interaction.occurred_at),
        }),
      );
    } else if (marksTextedNotCalled(loop, interaction)) {
      await db.from("lane_loops").update({ texted_not_called: true }).eq("id", loop.id);
      textedNotCalled.push(loop.id);
    }
  }

  await touchOwnerContact(db, interaction.owner_id, interaction.occurred_at, true);
  return { closed, textedNotCalled };
}

/** After an inbound interaction is recorded: open the loop it calls for. */
export async function openLoopForInbound(db: AdminClient, interaction: Interaction): Promise<Loop | null> {
  if (interaction.direction !== "inbound") return null;
  await touchOwnerContact(db, interaction.owner_id, interaction.occurred_at, false);
  const type = loopTypeForInbound(interaction);
  if (!type) return null;
  const { loop } = await openLoop(db, {
    ownerId: interaction.owner_id,
    propertyId: interaction.property_id,
    type,
    triggerInteractionId: interaction.id,
    threadId: type === "email" ? interaction.thread_id : null,
    summary: interaction.ai_summary ?? interaction.subject ?? null,
    openedAt: new Date(interaction.occurred_at),
  });
  return loop;
}

/**
 * One notification per loop the first time it passes its due time. Snoozed
 * loops wait until the snooze ends.
 */
export async function sweepPastDue(db: AdminClient, now: Date = new Date()): Promise<{ notified: number }> {
  const nowIso = now.toISOString();
  const { data: loops, error } = await db
    .from("lane_loops")
    .select("id, owner_id, assigned_pm_id, opened_at, snoozed_until, owner:lane_owners!lane_loops_owner_id_fkey(name)")
    .eq("status", "open")
    .lt("due_at", nowIso)
    .is("notified_past_due_at", null);
  if (error) throw new Error(`sweepPastDue: ${error.message}`);

  let notified = 0;
  for (const loop of loops ?? []) {
    if (loop.snoozed_until && loop.snoozed_until > nowIso) continue;
    if (!loop.assigned_pm_id) continue;
    const ownerName = (loop.owner as { name: string } | null)?.name ?? "An owner";
    const { error: insertError } = await db.from("lane_notifications").upsert(
      {
        staff_id: loop.assigned_pm_id,
        kind: "loop_waiting",
        title: waitingTitle(ownerName, new Date(loop.opened_at), now),
        body: "Open the loop to reply or call back.",
        url: `/loops/${loop.id}`,
        dedupe_key: `loop_waiting:${loop.id}`,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    if (insertError) throw new Error(`sweepPastDue: ${insertError.message}`);
    await db.from("lane_loops").update({ notified_past_due_at: nowIso }).eq("id", loop.id);
    notified += 1;
  }
  return { notified };
}
