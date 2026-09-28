/**
 * Fills in the AI columns on inbound interactions and pre-drafts the reply
 * on the loop they opened, so the draft exists before the PM opens the row.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import type { Interaction } from "@/lib/domain/types";
import { classifyInbound } from "./classify";
import { draftReply } from "./draft";

export type EnrichResult = {
  interactionId: string;
  classified: boolean;
  loopId: string | null;
  drafted: boolean;
};

export async function enrichInteraction(db: AdminClient, interactionId: string): Promise<EnrichResult | null> {
  const { data: interaction } = await db.from("lane_interactions").select("*").eq("id", interactionId).maybeSingle();
  if (!interaction) return null;
  return enrichRow(db, interaction);
}

async function enrichRow(db: AdminClient, interaction: Interaction): Promise<EnrichResult> {
  const result: EnrichResult = { interactionId: interaction.id, classified: false, loopId: null, drafted: false };
  if (interaction.direction !== "inbound") return result;

  const text = interaction.transcript ?? interaction.body ?? "";
  let summary = interaction.ai_summary;

  if (!summary && text.trim()) {
    const c = await classifyInbound(text, interaction.subject);
    const { error } = await db
      .from("lane_interactions")
      .update({ ai_intent: c.intent, ai_urgency: c.urgency, ai_summary: c.summary, ai_sentiment: c.sentiment, churn_flag: c.churnFlag })
      .eq("id", interaction.id);
    if (!error) {
      result.classified = true;
      summary = c.summary;
      interaction = { ...interaction, ai_intent: c.intent, ai_urgency: c.urgency, ai_summary: c.summary, ai_sentiment: c.sentiment, churn_flag: c.churnFlag };
    }
  }

  // The loop this message opened, if it is still waiting on a draft.
  const { data: loop } = await db
    .from("lane_loops")
    .select("id, type, summary, opened_at, ai_draft, assigned_pm_id, property_id, owner_id")
    .eq("trigger_interaction_id", interaction.id)
    .eq("status", "open")
    .maybeSingle();
  if (!loop) return result;
  result.loopId = loop.id;
  if (loop.ai_draft && loop.summary) return result;

  const [{ data: owner }, { data: staff }, { data: property }, thread, { data: openCommitments }] = await Promise.all([
    db.from("lane_owners").select("id, name, assigned_pm_id").eq("id", loop.owner_id).maybeSingle(),
    loop.assigned_pm_id ? db.from("lane_staff").select("name").eq("id", loop.assigned_pm_id).maybeSingle() : Promise.resolve({ data: null }),
    loop.property_id ? db.from("lane_properties").select("name").eq("id", loop.property_id).maybeSingle() : Promise.resolve({ data: null }),
    threadFor(db, interaction),
    db.from("lane_commitments").select("text, due_at").eq("owner_id", loop.owner_id).eq("status", "open").order("due_at", { ascending: true }).limit(5),
  ]);
  if (!owner) return result;

  let pmName = staff?.name ?? null;
  if (!pmName && owner.assigned_pm_id) {
    const { data: pm } = await db.from("lane_staff").select("name").eq("id", owner.assigned_pm_id).maybeSingle();
    pmName = pm?.name ?? null;
  }

  const draft = loop.ai_draft ?? (await draftReply({ owner, loop, thread, pmName: pmName ?? "Lane", property, openCommitments: openCommitments ?? [] }));
  const { error } = await db
    .from("lane_loops")
    .update({ summary: loop.summary ?? summary ?? null, ai_draft: draft })
    .eq("id", loop.id);
  result.drafted = !error && !loop.ai_draft;
  return result;
}

/** The email thread when there is one, otherwise the last few exchanges with the owner. */
async function threadFor(db: AdminClient, interaction: Interaction): Promise<Interaction[]> {
  if (interaction.thread_id) {
    const { data } = await db.from("lane_interactions").select("*").eq("thread_id", interaction.thread_id).order("occurred_at", { ascending: true }).limit(20);
    if (data?.length) return data;
  }
  const { data } = await db
    .from("lane_interactions")
    .select("*")
    .eq("owner_id", interaction.owner_id)
    .in("channel", ["email", "sms", "call"])
    .lte("occurred_at", interaction.occurred_at)
    .order("occurred_at", { ascending: false })
    .limit(6);
  return (data ?? []).reverse();
}

/**
 * Processes a batch of inbound interactions that still lack a summary,
 * newest first. The ingest cron calls this after it writes new rows.
 */
export async function enrichPending(db: AdminClient, limit = 25): Promise<EnrichResult[]> {
  const { data: pending } = await db
    .from("lane_interactions")
    .select("*")
    .eq("direction", "inbound")
    .is("ai_summary", null)
    .in("channel", ["email", "sms", "call"])
    .order("occurred_at", { ascending: false })
    .limit(limit);
  const results: EnrichResult[] = [];
  for (const row of pending ?? []) {
    try {
      results.push(await enrichRow(db, row));
    } catch (error) {
      console.warn(`[enrich] ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // Loops opened by already-classified messages that still have no draft.
  const { data: undrafted } = await db
    .from("lane_loops")
    .select("trigger_interaction_id")
    .eq("status", "open")
    .is("ai_draft", null)
    .not("trigger_interaction_id", "is", null)
    .order("opened_at", { ascending: false })
    .limit(limit);
  const done = new Set(results.map((r) => r.interactionId));
  for (const l of undrafted ?? []) {
    if (!l.trigger_interaction_id || done.has(l.trigger_interaction_id)) continue;
    try {
      const r = await enrichInteraction(db, l.trigger_interaction_id);
      if (r) results.push(r);
    } catch (error) {
      console.warn(`[enrich] loop draft ${l.trigger_interaction_id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return results;
}
