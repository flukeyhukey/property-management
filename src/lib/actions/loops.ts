"use server";

/**
 * Server actions for loops: the three things a PM does (call, reply, done)
 * plus snooze. Every action checks the staff session first. Mutations that
 * count as evidence go through recordInteraction so the loop closes by the
 * same rules ingestion uses.
 */
import { revalidatePath } from "next/cache";
import { TZDate } from "@date-fns/tz";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminClient } from "@/lib/supabase/admin";
import { integrationsMode } from "@/lib/env";
import { addBusinessMinutes, nextBusinessStart, TZ } from "@/lib/domain/time";
import { closeLoop } from "@/lib/domain/loops";
import { CLOSE_REASONS, SNOOZE_REASONS } from "@/lib/domain/types";
import type { CloseReason, Interaction, InteractionInsert, SnoozeReason } from "@/lib/domain/types";
import { suggestFromInteraction } from "@/lib/domain/commitments";
import { recordInteraction } from "@/lib/ingest/record";
import { gmail } from "@/lib/integrations/gmail";
import { dialpad } from "@/lib/integrations/dialpad";

export type ActionResult = { ok: true } | { ok: false; message: string };

function revalidateLoop(loopId: string) {
  revalidatePath("/queue");
  revalidatePath(`/loops/${loopId}`);
}

/** The staff client satisfies the same interface the domain helpers take. */
async function staffDb(): Promise<AdminClient> {
  return (await createClient()) as unknown as AdminClient;
}

async function loadLoop(db: AdminClient, loopId: string) {
  const { data, error } = await db
    .from("lane_loops")
    .select(
      `*,
      owner:lane_owners!lane_loops_owner_id_fkey(id, name, primary_email, primary_phone),
      trigger:lane_interactions!lane_loops_trigger_interaction_id_fkey(id, subject, thread_id, external_id, metadata)`,
    )
    .eq("id", loopId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That one has gone.");
  return data as typeof data & {
    owner: { id: string; name: string; primary_email: string | null; primary_phone: string | null };
    trigger: { id: string; subject: string | null; thread_id: string | null; external_id: string | null; metadata: unknown } | null;
  };
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

export async function markDone(loopId: string, reason: CloseReason): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!CLOSE_REASONS.some((r) => r.value === reason)) return { ok: false, message: "Pick one of the four reasons." };
  const db = await staffDb();
  try {
    await closeLoop(db, loopId, { kind: "manual", reason, closedBy: staff.id });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "That didn’t go through." };
  }
  revalidateLoop(loopId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Snooze
// ---------------------------------------------------------------------------

/** 8am on the next business day after `now`. */
function firstThingTomorrow(now: Date): Date {
  const l = new TZDate(now, TZ);
  const midnight = new TZDate(l.getFullYear(), l.getMonth(), l.getDate() + 1, 0, 0, 0, 0, TZ);
  return nextBusinessStart(new Date(midnight.getTime()));
}

export async function snoozeLoop(loopId: string, reason: SnoozeReason): Promise<ActionResult> {
  await requireStaff();
  if (!SNOOZE_REASONS.some((r) => r.value === reason)) return { ok: false, message: "Pick one of the four reasons." };
  const now = new Date();
  const until = reason === "after_hours" ? firstThingTomorrow(now) : addBusinessMinutes(now, 4 * 60);
  const db = await staffDb();
  const { error } = await db
    .from("lane_loops")
    .update({ snoozed_until: until.toISOString(), snooze_reason: reason })
    .eq("id", loopId)
    .eq("status", "open");
  if (error) return { ok: false, message: error.message };
  revalidateLoop(loopId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reply (email or SMS)
// ---------------------------------------------------------------------------

function readString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function readIssueId(metadata: unknown): string | null {
  return readString(metadata, "issue_id");
}

/**
 * Sends the reply and records it as an outbound interaction, which closes
 * the loop by evidence and lets the AI pick out any follow-ups promised.
 * `channel` defaults to the loop's own channel; a missed call can be
 * answered with a text, which is noted but does not close the loop.
 */
export async function sendReply(
  loopId: string,
  body: string,
  channel?: "email" | "sms",
): Promise<ActionResult & { interactionId?: string }> {
  const staff = await requireStaff();
  const text = body.trim();
  if (!text) return { ok: false, message: "Write something first." };

  const db = await staffDb();
  let loop: Awaited<ReturnType<typeof loadLoop>>;
  try {
    loop = await loadLoop(db, loopId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "That one has gone." };
  }

  const via: "email" | "sms" = channel ?? (loop.type === "sms" || loop.type === "missed_call" ? "sms" : "email");
  const now = new Date();
  const subjectBase = loop.trigger?.subject ?? loop.summary ?? "Your property";
  const subject = via === "email" ? (subjectBase.toLowerCase().startsWith("re:") ? subjectBase : `Re: ${subjectBase}`) : null;

  let externalId = `manual:${via}:${loopId}:${now.getTime()}`;
  let threadId: string | null = loop.thread_id;

  try {
    if (via === "sms") {
      const phone = loop.owner.primary_phone;
      if (!phone) return { ok: false, message: `We don’t have a number for ${loop.owner.name}.` };
      if (integrationsMode() === "live") {
        // The Dialpad adapter doesn't send texts yet; use it once it does.
        const adapter = dialpad(db) as ReturnType<typeof dialpad> & {
          sendSms?: (staffId: string, phone: string, body: string) => Promise<{ externalId?: string | null; threadId?: string | null }>;
        };
        if (!adapter.sendSms) return { ok: false, message: "Texting from here isn’t switched on yet. Try Dialpad for now." };
        const sent = await adapter.sendSms(staff.id, phone, text);
        externalId = sent.externalId ?? externalId;
        threadId = sent.threadId ?? threadId;
      }
    } else {
      const to = loop.owner.primary_email;
      if (!to) return { ok: false, message: `We don’t have an email for ${loop.owner.name}.` };
      // Mock mode returns a made-up message id; live mode sends from the PM's inbox.
      const sent = await gmail(db).sendReply(staff.id, {
        to,
        subject: subject ?? "Your property",
        body: text,
        threadId: loop.thread_id,
        inReplyToMessageId: readString(loop.trigger?.metadata, "message_id_header"),
      });
      externalId = sent.messageId || externalId;
      threadId = sent.threadId || threadId;
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The send didn’t go through." };
  }

  const issueId = loop.issue_id ?? readIssueId(loop.trigger?.metadata);
  const insert: InteractionInsert = {
    owner_id: loop.owner_id,
    property_id: loop.property_id,
    staff_id: staff.id,
    channel: via,
    direction: "outbound",
    occurred_at: now.toISOString(),
    subject,
    body: text,
    external_id: externalId,
    thread_id: threadId,
    metadata: { source: "app", loop_id: loopId, ...(issueId ? { issue_id: issueId } : {}) },
  };

  let interaction: Interaction;
  try {
    interaction = await recordInteraction(db, insert);
    await suggestFromInteraction(db, interaction, staff.id);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Sent, but we couldn’t note it." };
  }

  revalidateLoop(loopId);
  revalidatePath(`/owners/${loop.owner_id}`);
  return { ok: true, interactionId: interaction.id };
}

// ---------------------------------------------------------------------------
// Call
// ---------------------------------------------------------------------------

/**
 * The PM tapped Call. Dialpad opens on the device; here we note the attempt
 * so the loop closes straight away. Dialpad's webhook records the real
 * outcome later and dedupes on the same minute.
 */
export async function logCall(loopId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  const db = await staffDb();
  let loop: Awaited<ReturnType<typeof loadLoop>>;
  try {
    loop = await loadLoop(db, loopId);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "That one has gone." };
  }

  const now = new Date();
  const minute = now.toISOString().slice(0, 16);
  const externalId = `manual:${loopId}:${minute}`;

  const { data: existing } = await db
    .from("lane_interactions")
    .select("id")
    .eq("channel", "call")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) return { ok: true };

  const issueId = loop.issue_id ?? readIssueId(loop.trigger?.metadata);
  const insert: InteractionInsert = {
    owner_id: loop.owner_id,
    property_id: loop.property_id,
    staff_id: staff.id,
    channel: "call",
    direction: "outbound",
    occurred_at: now.toISOString(),
    external_id: externalId,
    call_answered: null,
    ai_summary: `Called ${loop.owner.name} back from the queue.`,
    metadata: { source: "app", loop_id: loopId, ...(issueId ? { issue_id: issueId } : {}) },
  };
  try {
    await recordInteraction(db, insert);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "We couldn’t note the call." };
  }
  revalidateLoop(loopId);
  revalidatePath(`/owners/${loop.owner_id}`);
  return { ok: true };
}
