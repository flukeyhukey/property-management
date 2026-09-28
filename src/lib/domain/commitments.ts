/**
 * Follow-up (commitment) lifecycle over the service-role client.
 *
 *   suggested --confirm--> open --evidence/prompt yes/manual/issue resolved--> kept
 *                          open --sweepDue (past due, no evidence)---------> missed
 *                          missed --reopenWithNewDate--> (new) open, reopened_from_id set
 *
 * Pure helpers at the top are unit-tested in commitments.test.ts.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import type { Commitment, CommitmentStatus, Interaction, Issue, Owner } from "@/lib/domain/types";
import { addBusinessDays, extractCommitments } from "@/lib/ai/extract";
import { MATCH_HIGH, MATCH_MEDIUM, matchesCommitment, tokenise } from "@/lib/ai/match";
import { draftHonestUpdate } from "@/lib/ai/draft";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export const DEDUPE_WINDOW_DAYS = 7;
export const MISSED_WINDOW_DAYS = 90;
export const MISSED_THRESHOLD = 2;
export const MIN_SUGGEST_CONFIDENCE = 0.4;
export const AMBER_REASON = "Two follow-ups ran late recently";

const ALLOWED: Record<CommitmentStatus, CommitmentStatus[]> = {
  suggested: ["open", "kept"],
  open: ["kept", "missed"],
  kept: [],
  missed: [],
};

/** Which status changes the lifecycle permits. Reopening creates a new row, so missed has no exits. */
export function canTransition(from: CommitmentStatus, to: CommitmentStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** Two promises are "the same" when most of the shorter one's words appear in the other. */
export function isSimilarText(a: string, b: string): boolean {
  const ta = new Set(tokenise(a));
  const tb = new Set(tokenise(b));
  if (ta.size === 0 || tb.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hits = 0;
  for (const t of small) if (big.has(t)) hits += 1;
  return hits / small.size >= 0.6;
}

/** Returns the existing commitment this text duplicates (same owner, similar text, made within the window), or null. */
export function findDuplicate<T extends Pick<Commitment, "text" | "made_at">>(
  existing: T[],
  text: string,
  madeAt: Date,
  windowDays = DEDUPE_WINDOW_DAYS,
): T | null {
  const windowMs = windowDays * 86_400_000;
  for (const c of existing) {
    const gap = Math.abs(madeAt.getTime() - new Date(c.made_at).getTime());
    if (gap <= windowMs && isSimilarText(c.text, text)) return c;
  }
  return null;
}

/** Two missed follow-ups to the same owner in 90 days turns their health amber. */
export function hitsTwoMissedRule(missedAts: (string | Date)[], now: Date, windowDays = MISSED_WINDOW_DAYS): boolean {
  const since = now.getTime() - windowDays * 86_400_000;
  const recent = missedAts.filter((m) => {
    const t = new Date(m).getTime();
    return t >= since && t <= now.getTime();
  });
  return recent.length >= MISSED_THRESHOLD;
}

/** Health change for the two-missed rule: never downgrade red, never touch green->amber unless the rule hits. */
export function healthAfterMissed(current: Owner["health"], ruleHit: boolean): Owner["health"] {
  if (!ruleHit) return current;
  return current === "red" ? "red" : "amber";
}

/** The date offered in an honest update: two business days out. */
export function nextHonestDue(now: Date): Date {
  return addBusinessDays(now, 2);
}

/** Issue statuses that mean the trade has been through and the owner can be told the outcome. */
export const RESOLVED_ISSUE_STATUSES = ["resolved", "closed", "done", "completed", "complete", "fixed"];

export function isResolvedIssueStatus(status: string | null | undefined): boolean {
  return Boolean(status) && RESOLVED_ISSUE_STATUSES.includes(String(status).toLowerCase());
}

/** Which of the owner's open issues a promise is about, by word overlap with the issue description. */
export function matchIssue<T extends Pick<Issue, "id" | "description" | "category">>(text: string, issues: T[]): T | null {
  const want = new Set(tokenise(text));
  if (want.size === 0) return null;
  let best: { issue: T; score: number } | null = null;
  for (const issue of issues) {
    const have = new Set(tokenise(`${issue.description ?? ""} ${issue.category ?? ""}`));
    if (have.size === 0) continue;
    let hits = 0;
    for (const t of want) if (have.has(t)) hits += 1;
    const score = hits / Math.min(want.size, have.size);
    if (score >= 0.5 && hits >= 1 && (!best || score > best.score)) best = { issue, score };
  }
  return best?.issue ?? null;
}

/** Interactions that can carry a promise: what we sent or said. */
export function carriesPromises(i: Pick<Interaction, "direction" | "channel" | "is_auto_reply" | "body" | "transcript">): boolean {
  if (i.direction !== "outbound" || i.is_auto_reply) return false;
  if (i.channel === "call") return Boolean(i.transcript?.trim());
  if (i.channel === "email" || i.channel === "sms") return Boolean(i.body?.trim());
  return false;
}

// ---------------------------------------------------------------------------
// Lifecycle over the database
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`${where}: ${error?.message ?? "unknown error"}`);
}

async function getCommitment(db: AdminClient, id: string): Promise<Commitment> {
  const { data, error } = await db.from("lane_commitments").select("*").eq("id", id).single();
  if (error || !data) fail("commitments.get", error);
  return data;
}

async function pmNameFor(db: AdminClient, commitment: Pick<Commitment, "made_by">, owner: Pick<Owner, "assigned_pm_id">): Promise<{ id: string | null; name: string }> {
  const staffId = commitment.made_by ?? owner.assigned_pm_id;
  if (!staffId) return { id: null, name: "Lane" };
  const { data } = await db.from("lane_staff").select("id, name").eq("id", staffId).maybeSingle();
  return { id: data?.id ?? staffId, name: data?.name ?? "Lane" };
}

/**
 * Extracts promises from an outbound email body or call transcript and
 * inserts them as `suggested`. Dedupes against the owner's recent
 * commitments, links the loop this interaction closed and any open
 * maintenance issue the promise is about.
 */
export async function suggestFromInteraction(db: AdminClient, interaction: Interaction, staffId: string | null): Promise<Commitment[]> {
  if (!carriesPromises(interaction)) return [];
  const text = interaction.channel === "call" ? interaction.transcript! : interaction.body!;
  const sentAt = new Date(interaction.occurred_at);

  const { data: owner } = await db.from("lane_owners").select("id, name, assigned_pm_id").eq("id", interaction.owner_id).maybeSingle();
  if (!owner) return [];

  const extracted = (await extractCommitments({ text, sentAt, ownerName: owner.name })).filter((c) => c.confidence >= MIN_SUGGEST_CONFIDENCE);
  if (extracted.length === 0) return [];

  const since = new Date(sentAt.getTime() - DEDUPE_WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: existing }, { data: closedLoop }, issues] = await Promise.all([
    db.from("lane_commitments").select("id, text, made_at").eq("owner_id", owner.id).gte("made_at", since),
    db.from("lane_loops").select("id").eq("closing_interaction_id", interaction.id).maybeSingle(),
    openIssuesForOwner(db, owner.id),
  ]);

  const rows: Commitment[] = [];
  const pool = [...(existing ?? [])];
  for (const c of extracted) {
    if (findDuplicate(pool, c.text, sentAt)) continue;
    const issue = matchIssue(c.text, issues);
    const { data, error } = await db
      .from("lane_commitments")
      .insert({
        owner_id: owner.id,
        text: c.text,
        due_at: c.dueAt.toISOString(),
        status: "suggested",
        made_at: sentAt.toISOString(),
        made_by: staffId ?? interaction.staff_id ?? owner.assigned_pm_id ?? null,
        source_interaction_id: interaction.id,
        loop_id: closedLoop?.id ?? null,
        issue_id: issue?.id ?? null,
      })
      .select("*")
      .single();
    if (error || !data) fail("commitments.suggest", error);
    rows.push(data);
    pool.push({ id: data.id, text: data.text, made_at: data.made_at });
  }
  return rows;
}

async function openIssuesForOwner(db: AdminClient, ownerId: string): Promise<Pick<Issue, "id" | "description" | "category" | "status">[]> {
  const { data: links } = await db.from("lane_owner_properties").select("property_id").eq("owner_id", ownerId);
  const propertyIds = (links ?? []).map((l) => l.property_id);
  if (propertyIds.length === 0) return [];
  const { data } = await db
    .from("lane_issues")
    .select("id, description, category, status")
    .in("property_id", propertyIds)
    .in("category", ["maintenance", "damage"]);
  return (data ?? []).filter((i) => i.id && !isResolvedIssueStatus(i.status));
}

/** PM tapped "Remind me": suggested -> open. */
export async function confirm(db: AdminClient, id: string, staffId: string): Promise<Commitment> {
  const current = await getCommitment(db, id);
  if (!canTransition(current.status, "open")) return current;
  const { data, error } = await db
    .from("lane_commitments")
    .update({ status: "open", made_by: current.made_by ?? staffId })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) fail("commitments.confirm", error);
  return data;
}

/** Who made the promise: pass `madeBy` (preferred) or `staffId` (alias). */
export type AddManualInput = {
  ownerId: string;
  text: string;
  dueAt: Date;
  loopId?: string | null;
  sourceInteractionId?: string | null;
  issueId?: string | null;
} & ({ madeBy: string; staffId?: string } | { staffId: string; madeBy?: string });

/** "Add a follow-up" from a reply or call: straight to open. */
export async function addManual(db: AdminClient, input: AddManualInput): Promise<Commitment> {
  const { data, error } = await db
    .from("lane_commitments")
    .insert({
      owner_id: input.ownerId,
      text: input.text.trim(),
      due_at: input.dueAt.toISOString(),
      status: "open",
      made_by: input.madeBy ?? input.staffId ?? null,
      made_at: nowIso(),
      loop_id: input.loopId ?? null,
      source_interaction_id: input.sourceInteractionId ?? null,
      issue_id: input.issueId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) fail("commitments.addManual", error);
  return data;
}

export type EvidenceResult = {
  kept: Commitment[];
  prompted: Commitment[];
};

/**
 * A later outbound email or call to the owner: closes the promises it
 * clearly covers, and sets a one-tap prompt on the ones it might cover.
 */
export async function tryCloseWithEvidence(db: AdminClient, interaction: Interaction): Promise<EvidenceResult> {
  const result: EvidenceResult = { kept: [], prompted: [] };
  if (interaction.direction !== "outbound" || interaction.is_auto_reply) return result;
  const { data: open } = await db
    .from("lane_commitments")
    .select("*")
    .eq("owner_id", interaction.owner_id)
    .eq("status", "open")
    .lt("made_at", interaction.occurred_at);
  for (const c of open ?? []) {
    const { confidence } = await matchesCommitment({ commitment: c, interaction });
    if (confidence >= MATCH_HIGH) {
      const { data } = await db
        .from("lane_commitments")
        .update({ status: "kept", close_kind: "evidence", kept_interaction_id: interaction.id, kept_at: interaction.occurred_at, prompt_interaction_id: null })
        .eq("id", c.id)
        .select("*")
        .single();
      if (data) result.kept.push(data);
    } else if (confidence >= MATCH_MEDIUM && !c.prompt_interaction_id) {
      const { data } = await db
        .from("lane_commitments")
        .update({ prompt_interaction_id: interaction.id, prompt_answered_at: null })
        .eq("id", c.id)
        .select("*")
        .single();
      if (data) result.prompted.push(data);
    }
  }
  return result;
}

export type PromptAnswer = "yes" | "no" | "not_yet";

/** "Did your call to Sarah cover the plumber quote?" Yes closes it as confirmed; no or not yet clears the prompt. */
export async function answerPrompt(db: AdminClient, id: string, answer: PromptAnswer, staffId: string): Promise<Commitment> {
  const current = await getCommitment(db, id);
  const answeredAt = nowIso();
  if (answer === "yes") {
    if (!canTransition(current.status, "kept")) return current;
    const { data, error } = await db
      .from("lane_commitments")
      .update({
        status: "kept",
        close_kind: "confirmed",
        kept_interaction_id: current.prompt_interaction_id,
        kept_at: answeredAt,
        prompt_answered_at: answeredAt,
        made_by: current.made_by ?? staffId,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) fail("commitments.answerPrompt", error);
    return data;
  }
  const { data, error } = await db
    .from("lane_commitments")
    .update({ prompt_interaction_id: null, prompt_answered_at: answeredAt })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) fail("commitments.answerPrompt", error);
  return data;
}

/** Closed by hand with a one-line reason. Shown on the dashboard as manual. */
export async function closeManual(db: AdminClient, id: string, reason: string, staffId: string): Promise<Commitment> {
  const current = await getCommitment(db, id);
  if (!canTransition(current.status, "kept")) return current;
  const { data, error } = await db
    .from("lane_commitments")
    .update({
      status: "kept",
      close_kind: "manual",
      close_reason: reason.trim(),
      kept_at: nowIso(),
      prompt_interaction_id: null,
      made_by: current.made_by ?? staffId,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) fail("commitments.closeManual", error);
  return data;
}

/** Maintenance-linked promises close when the issue is resolved. */
export async function closeFromIssueStatus(db: AdminClient, issueId: string, newStatus: string): Promise<Commitment[]> {
  if (!isResolvedIssueStatus(newStatus)) return [];
  const { data, error } = await db
    .from("lane_commitments")
    .update({ status: "kept", close_kind: "evidence", kept_at: nowIso(), prompt_interaction_id: null })
    .eq("issue_id", issueId)
    .in("status", ["open", "suggested"])
    .select("*");
  if (error) fail("commitments.closeFromIssueStatus", error);
  return data ?? [];
}

export type SweepResult = {
  missed: Commitment[];
  ownersTurnedAmber: string[];
};

/**
 * Open promises past their date with no evidence become missed, get an
 * honest update drafted, and the PM gets one notification. Then the
 * two-missed rule turns the owner amber.
 */
export async function sweepDue(db: AdminClient, now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = { missed: [], ownersTurnedAmber: [] };
  const { data: due, error } = await db
    .from("lane_commitments")
    .select("*")
    .eq("status", "open")
    .is("kept_interaction_id", null)
    .lt("due_at", now.toISOString());
  if (error) fail("commitments.sweepDue", error);
  if (!due?.length) return result;

  const ownerIds = Array.from(new Set(due.map((c) => c.owner_id)));
  const { data: owners } = await db.from("lane_owners").select("id, name, health, assigned_pm_id").in("id", ownerIds);
  const ownerById = new Map((owners ?? []).map((o) => [o.id, o]));
  const newDueAt = nextHonestDue(now);

  for (const c of due) {
    const owner = ownerById.get(c.owner_id);
    if (!owner) continue;
    const pm = await pmNameFor(db, c, owner);
    const draft = await draftHonestUpdate({ owner, commitment: c, pmName: pm.name, newDueAt });
    const { data: updated } = await db
      .from("lane_commitments")
      .update({ status: "missed", missed_at: now.toISOString(), draft_update: draft })
      .eq("id", c.id)
      .eq("status", "open")
      .select("*")
      .single();
    if (!updated) continue;
    result.missed.push(updated);

    if (pm.id) {
      const first = owner.name.trim().split(/\s+/)[0] || owner.name;
      await db.from("lane_notifications").upsert(
        {
          staff_id: pm.id,
          kind: "commitment_prompt",
          title: `A short update for ${first} is drafted`,
          body: `You said you would ${lowerFirst(c.text)}. A note with a new date is ready to send.`,
          url: "/queue",
          dedupe_key: `commitment_prompt:${c.id}`,
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
    }
  }

  // Two-missed rule.
  const since = new Date(now.getTime() - MISSED_WINDOW_DAYS * 86_400_000).toISOString();
  for (const ownerId of ownerIds) {
    const owner = ownerById.get(ownerId);
    if (!owner) continue;
    const { data: missed } = await db.from("lane_commitments").select("missed_at").eq("owner_id", ownerId).eq("status", "missed").gte("missed_at", since);
    const missedAts = (missed ?? []).map((m) => m.missed_at).filter((m): m is string => Boolean(m));
    const hit = hitsTwoMissedRule(missedAts, now);
    const next = healthAfterMissed(owner.health, hit);
    if (next !== owner.health) {
      await db
        .from("lane_owners")
        .update({ health: "amber", health_reason: AMBER_REASON, health_updated_at: now.toISOString() })
        .eq("id", ownerId)
        .neq("health", "red");
      result.ownersTurnedAmber.push(ownerId);
    }
  }
  return result;
}

/**
 * The honest update went out (or a call was logged): the old promise stays
 * missed and a new open one carries the new date.
 */
export async function reopenWithNewDate(db: AdminClient, id: string, newDueAt: Date, evidenceInteractionId: string | null): Promise<Commitment> {
  const old = await getCommitment(db, id);
  const { data, error } = await db
    .from("lane_commitments")
    .insert({
      owner_id: old.owner_id,
      text: old.text,
      due_at: newDueAt.toISOString(),
      status: "open",
      made_by: old.made_by,
      made_at: nowIso(),
      loop_id: old.loop_id,
      issue_id: old.issue_id,
      source_interaction_id: evidenceInteractionId ?? old.source_interaction_id,
      reopened_from_id: old.id,
    })
    .select("*")
    .single();
  if (error || !data) fail("commitments.reopenWithNewDate", error);
  return data;
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
