/**
 * NPS: who is due a survey, sending them, and recording responses.
 *
 * Surveys go out on three triggers from the brief: the quarterly pulse
 * (first business day of Jan/Apr/Jul/Oct, everyone), 30 days after
 * onboarding, and when a maintenance issue on their property is resolved.
 * Each send is deduped through lane_sync_state `nps:sent:<ownerId>:<kind>:<period>`.
 *
 * A response of 0–6 opens a detractor loop assigned to a director.
 */
import { createNpsSender, kindFromSurveyId, type NpsSender, type NpsWebhookPayload, type SurveyRequest } from "@/lib/integrations/nps";
import { addDays, localDate } from "@/lib/integrations/resly/dates";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "./database";
import { openLoop } from "./loops";
import type { NpsKind } from "./types";

export const DETRACTOR_MAX = 6;
export const ONBOARDING_SURVEY_DAYS = 30;
/** Grace window so a skipped cron day still sends the onboarding survey. */
const ONBOARDING_GRACE_DAYS = 14;
const QUARTER_MONTHS = [1, 4, 7, 10];
const RESOLVED_STATUSES = ["resolved", "closed", "done", "completed"];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** First Monday–Friday of the month, skipping New Year's Day. */
export function isFirstBusinessDayOfQuarter(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  if (!QUARTER_MONTHS.includes(m)) return false;
  for (let day = 1; day <= 7; day += 1) {
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (m === 1 && day === 1) continue;
    return day === d;
  }
  return false;
}

/** "2026-Q4" */
export function quarterLabel(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export function surveyKey(ownerId: string, kind: NpsKind, period: string): string {
  return `nps:sent:${ownerId}:${kind}:${period}`;
}

/** 0 -> -1, 5 -> 0, 10 -> 1 */
export function sentimentFromScore(score: number): number {
  return Math.max(-1, Math.min(1, Math.round(((score - 5) / 5) * 100) / 100));
}

export function detractorSummary(score: number, comment: string | null | undefined): string {
  const c = comment?.trim();
  return c ? `Scored ${score}: “${c.length > 140 ? `${c.slice(0, 137)}...` : c}”` : `Scored ${score} with no comment`;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export type DueSurvey = SurveyRequest & { period: string };

export async function scheduleSurveys(db: AdminClient, now: Date = new Date()): Promise<DueSurvey[]> {
  const today = localDate(now);
  const { data: owners, error } = await db
    .from("lane_owners")
    .select("id, name, primary_email, onboarded_at")
    .eq("is_active", true);
  if (error) throw new Error(`scheduleSurveys: ${error.message}`);
  const reachable = (owners ?? []).filter((o) => o.primary_email);
  const byId = new Map(reachable.map((o) => [o.id, o]));
  const candidates: DueSurvey[] = [];
  const push = (ownerId: string, kind: NpsKind, period: string) => {
    const o = byId.get(ownerId);
    if (!o?.primary_email) return;
    const surveyId = surveyKey(ownerId, kind, period);
    if (candidates.some((c) => c.surveyId === surveyId)) return;
    candidates.push({ surveyId, ownerId, email: o.primary_email, name: o.name, kind, period });
  };

  // Quarterly pulse.
  if (isFirstBusinessDayOfQuarter(today)) {
    for (const o of reachable) push(o.id, "quarterly", quarterLabel(today));
  }

  // 30 days after onboarding.
  const earliest = addDays(today, -(ONBOARDING_SURVEY_DAYS + ONBOARDING_GRACE_DAYS));
  const latest = addDays(today, -ONBOARDING_SURVEY_DAYS);
  for (const o of reachable) {
    if (o.onboarded_at && o.onboarded_at.slice(0, 10) >= earliest && o.onboarded_at.slice(0, 10) <= latest) {
      push(o.id, "onboarding", "first-30");
    }
  }

  // A repair on their property resolved in the last day.
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: issues } = await db
    .from("lane_issues")
    .select("id, property_id, status, updated_at")
    .in("status", RESOLVED_STATUSES)
    .gte("updated_at", since);
  const propertyIds = Array.from(new Set((issues ?? []).map((i) => i.property_id).filter((p): p is string => Boolean(p))));
  if (propertyIds.length) {
    const { data: links } = await db.from("lane_owner_properties").select("owner_id, property_id").in("property_id", propertyIds);
    for (const issue of issues ?? []) {
      if (!issue.id || !issue.property_id) continue;
      for (const l of links ?? []) if (l.property_id === issue.property_id) push(l.owner_id, "maintenance_closed", issue.id);
    }
  }

  if (candidates.length === 0) return [];
  const { data: sent } = await db
    .from("lane_sync_state")
    .select("key")
    .in("key", candidates.map((c) => c.surveyId));
  const already = new Set((sent ?? []).map((s) => s.key));
  return candidates.filter((c) => !already.has(c.surveyId));
}

export async function sendSurveys(
  db: AdminClient,
  surveys: DueSurvey[],
  now: Date = new Date(),
  sender: NpsSender = createNpsSender(),
): Promise<{ sent: number; failed: number; mode: "mock" | "live" }> {
  let sent = 0;
  let failed = 0;
  for (const s of surveys) {
    const { surveyId, ownerId, email, name, kind } = s;
    const res = await sender.send({ surveyId, ownerId, email, name, kind });
    if (!res.ok) {
      failed += 1;
      console.warn(`[nps] send failed for ${surveyId}: ${res.detail}`);
      continue;
    }
    const { error } = await db.from("lane_sync_state").upsert({
      key: surveyId,
      value: { sent_at: now.toISOString(), kind, period: s.period, mode: sender.mode, detail: res.detail } as Json,
      updated_at: now.toISOString(),
    });
    if (error) throw new Error(`sendSurveys: ${error.message}`);
    sent += 1;
  }
  return { sent, failed, mode: sender.mode };
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export type RecordResult =
  | { status: "recorded"; responseId: string; interactionId: string; loopId: string | null }
  | { status: "duplicate" }
  | { status: "unknown_owner" };

async function findOwnerByEmail(db: AdminClient, email: string): Promise<string | null> {
  const lower = email.trim().toLowerCase();
  for (const value of Array.from(new Set([lower, email.trim()]))) {
    const { data } = await db
      .from("lane_owner_contact_points")
      .select("owner_id")
      .eq("kind", "email")
      .eq("value", value)
      .limit(1)
      .maybeSingle();
    if (data) return data.owner_id;
  }
  const { data } = await db.from("lane_owners").select("id").eq("primary_email", lower).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function recordNpsResponse(db: AdminClient, payload: NpsWebhookPayload): Promise<RecordResult> {
  const ownerId = await findOwnerByEmail(db, payload.email);
  if (!ownerId) return { status: "unknown_owner" };

  const { data: existing } = await db.from("lane_nps_responses").select("id").eq("external_id", payload.surveyId).maybeSingle();
  if (existing) return { status: "duplicate" };

  const kind: NpsKind = payload.kind ?? kindFromSurveyId(payload.surveyId) ?? "quarterly";
  const respondedAt = payload.respondedAt ? new Date(payload.respondedAt) : new Date();
  const at = Number.isNaN(respondedAt.getTime()) ? new Date() : respondedAt;
  const comment = payload.comment?.trim() || null;
  const detractor = payload.score <= DETRACTOR_MAX;

  const { data: interaction, error: iError } = await db
    .from("lane_interactions")
    .upsert(
      {
        owner_id: ownerId,
        channel: "nps",
        direction: "inbound",
        occurred_at: at.toISOString(),
        subject: `Survey: ${payload.score} out of 10`,
        body: comment,
        external_id: payload.surveyId,
        ai_sentiment: sentimentFromScore(payload.score),
        ai_summary: detractor ? detractorSummary(payload.score, comment) : `Scored ${payload.score} out of 10`,
        metadata: { nps_kind: kind, score: payload.score } as Json,
      },
      { onConflict: "channel,external_id" },
    )
    .select("id")
    .single();
  if (iError) throw new Error(`recordNpsResponse: ${iError.message}`);

  let loopId: string | null = null;
  if (detractor) {
    const { data: director } = await db
      .from("lane_staff")
      .select("id")
      .eq("role", "director")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { loop } = await openLoop(db, {
      ownerId,
      type: "detractor",
      assignedPmId: director?.id ?? null,
      triggerInteractionId: interaction.id,
      summary: detractorSummary(payload.score, comment),
      openedAt: at,
    });
    loopId = loop.id;
  }

  const { data: response, error: rError } = await db
    .from("lane_nps_responses")
    .insert({
      owner_id: ownerId,
      kind,
      score: payload.score,
      comment,
      responded_at: at.toISOString(),
      external_id: payload.surveyId,
      loop_id: loopId,
      interaction_id: interaction.id,
    })
    .select("id")
    .single();
  if (rError) {
    if (rError.code === "23505") return { status: "duplicate" };
    throw new Error(`recordNpsResponse: ${rError.message}`);
  }

  return { status: "recorded", responseId: response.id, interactionId: interaction.id, loopId };
}

