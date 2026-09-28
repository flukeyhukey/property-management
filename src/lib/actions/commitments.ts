"use server";

/**
 * Server actions for follow-ups (commitments). Remind me, answer a prompt,
 * add one by hand, close one with a reason, and send the honest update when
 * one has slipped.
 */
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminClient } from "@/lib/supabase/admin";
import { addBusinessMinutes } from "@/lib/domain/time";
import type { Interaction, InteractionInsert } from "@/lib/domain/types";
import { addManual, answerPrompt as answerPromptDomain, closeManual, confirm, reopenWithNewDate } from "@/lib/domain/commitments";
import { recordInteraction } from "@/lib/ingest/record";
import { gmail } from "@/lib/integrations/gmail";

export type ActionResult = { ok: true } | { ok: false; message: string };

async function staffDb(): Promise<AdminClient> {
  return (await createClient()) as unknown as AdminClient;
}

function revalidateFollowUp(ownerId?: string | null, loopId?: string | null) {
  revalidatePath("/queue");
  if (ownerId) revalidatePath(`/owners/${ownerId}`);
  if (loopId) revalidatePath(`/loops/${loopId}`);
}

async function loadCommitment(db: AdminClient, commitmentId: string) {
  const { data, error } = await db
    .from("lane_commitments")
    .select("*, owner:lane_owners!lane_commitments_owner_id_fkey(id, name, primary_email, primary_phone)")
    .eq("id", commitmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That follow-up has gone.");
  return data as typeof data & {
    owner: { id: string; name: string; primary_email: string | null; primary_phone: string | null };
  };
}

function fail(e: unknown, fallback: string): ActionResult {
  return { ok: false, message: e instanceof Error ? e.message : fallback };
}

/** "Remind me": a suggested follow-up becomes an open one. */
export async function remindMe(commitmentId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  const db = await staffDb();
  try {
    const c = await loadCommitment(db, commitmentId);
    await confirm(db, commitmentId, staff.id);
    revalidateFollowUp(c.owner_id, c.loop_id);
  } catch (e) {
    return fail(e, "That didn’t go through.");
  }
  return { ok: true };
}

/** "Did your call cover it?" Yes keeps it, No leaves it open, Not yet asks again later. */
export async function answerPrompt(commitmentId: string, answer: "yes" | "no" | "not_yet"): Promise<ActionResult> {
  const staff = await requireStaff();
  const db = await staffDb();
  try {
    const c = await loadCommitment(db, commitmentId);
    await answerPromptDomain(db, commitmentId, answer, staff.id);
    revalidateFollowUp(c.owner_id, c.loop_id);
  } catch (e) {
    return fail(e, "That didn’t go through.");
  }
  return { ok: true };
}

/** "Add a follow-up": text and a date, nothing more. */
export async function addFollowUp(input: {
  ownerId: string;
  text: string;
  dueAt: string;
  loopId?: string | null;
}): Promise<ActionResult> {
  const staff = await requireStaff();
  const text = input.text.trim();
  if (!text) return { ok: false, message: "Say what you’ll do." };
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) return { ok: false, message: "Pick a date." };
  const db = await staffDb();
  try {
    await addManual(db, {
      ownerId: input.ownerId,
      text,
      dueAt,
      loopId: input.loopId ?? null,
      staffId: staff.id,
    });
    revalidateFollowUp(input.ownerId, input.loopId);
  } catch (e) {
    return fail(e, "That didn’t go through.");
  }
  return { ok: true };
}

/** Close a follow-up by hand with a one-line reason. */
export async function closeFollowUp(commitmentId: string, reason: string): Promise<ActionResult> {
  const staff = await requireStaff();
  const why = reason.trim();
  if (!why) return { ok: false, message: "Add a line on why." };
  const db = await staffDb();
  try {
    const c = await loadCommitment(db, commitmentId);
    await closeManual(db, commitmentId, why, staff.id);
    revalidateFollowUp(c.owner_id, c.loop_id);
  } catch (e) {
    return fail(e, "That didn’t go through.");
  }
  return { ok: true };
}

/** Default new date for an update: two business days out. */
function defaultNewDueAt(now: Date): Date {
  return addBusinessMinutes(now, 2 * 10 * 60);
}

/**
 * Sends the drafted honest update by email, records it, and reopens the
 * follow-up with the new date.
 */
export async function sendUpdate(commitmentId: string, body: string, newDueAt?: string): Promise<ActionResult> {
  const staff = await requireStaff();
  const text = body.trim();
  if (!text) return { ok: false, message: "Write something first." };
  const now = new Date();
  const due = newDueAt ? new Date(newDueAt) : defaultNewDueAt(now);
  if (Number.isNaN(due.getTime())) return { ok: false, message: "Pick a date." };

  const db = await staffDb();
  try {
    const c = await loadCommitment(db, commitmentId);
    const to = c.owner.primary_email;
    if (!to) return { ok: false, message: `We don’t have an email for ${c.owner.name}.` };
    const subject = `A quick update on ${c.text}`;

    let externalId = `manual:email:commitment:${commitmentId}:${now.getTime()}`;
    let threadId: string | null = null;
    // Mock mode returns a made-up message id; live mode sends from the PM's inbox.
    const sent = await gmail(db).sendReply(staff.id, { to, subject, body: text, threadId: null });
    externalId = sent.messageId || externalId;
    threadId = sent.threadId || null;

    const insert: InteractionInsert = {
      owner_id: c.owner_id,
      staff_id: staff.id,
      channel: "email",
      direction: "outbound",
      occurred_at: now.toISOString(),
      subject,
      body: text,
      external_id: externalId,
      thread_id: threadId,
      metadata: { source: "app", commitment_id: commitmentId, ...(c.issue_id ? { issue_id: c.issue_id } : {}) },
    };
    const interaction: Interaction = await recordInteraction(db, insert);
    await reopenWithNewDate(db, commitmentId, due, interaction.id);
    revalidateFollowUp(c.owner_id, c.loop_id);
    revalidatePath(`/loops/new-update/${commitmentId}`);
  } catch (e) {
    return fail(e, "The send didn’t go through.");
  }
  return { ok: true };
}

/** "I called instead": note the call and reopen the follow-up with the new date. */
export async function calledInstead(commitmentId: string, newDueAt?: string): Promise<ActionResult> {
  const staff = await requireStaff();
  const now = new Date();
  const due = newDueAt ? new Date(newDueAt) : defaultNewDueAt(now);
  if (Number.isNaN(due.getTime())) return { ok: false, message: "Pick a date." };

  const db = await staffDb();
  try {
    const c = await loadCommitment(db, commitmentId);
    const minute = now.toISOString().slice(0, 16);
    const insert: InteractionInsert = {
      owner_id: c.owner_id,
      staff_id: staff.id,
      channel: "call",
      direction: "outbound",
      occurred_at: now.toISOString(),
      external_id: `manual:commitment:${commitmentId}:${minute}`,
      call_answered: null,
      ai_summary: `Called ${c.owner.name} with an update on: ${c.text}`,
      metadata: { source: "app", commitment_id: commitmentId, ...(c.issue_id ? { issue_id: c.issue_id } : {}) },
    };
    const interaction: Interaction = await recordInteraction(db, insert);
    await reopenWithNewDate(db, commitmentId, due, interaction.id);
    revalidateFollowUp(c.owner_id, c.loop_id);
    revalidatePath(`/loops/new-update/${commitmentId}`);
  } catch (e) {
    return fail(e, "We couldn’t note the call.");
  }
  return { ok: true };
}
