"use server";

/**
 * Server actions for the Owner 360 page. Every action checks the staff
 * session first and revalidates the owner's pages when it is done.
 */
import { revalidatePath } from "next/cache";
import { canReassign, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ContactMethod, InteractionInsert } from "@/lib/domain/types";

const CONTACT_METHODS: ContactMethod[] = ["call", "email", "sms"];

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function revalidateOwner(ownerId: string) {
  revalidatePath("/owners");
  revalidatePath(`/owners/${ownerId}`);
}

export type ActionResult = { ok: true } | { ok: false; message: string };

/** Replaces the free-text notes on an owner. */
export async function saveNotes(ownerId: string, notes: string): Promise<ActionResult> {
  await requireStaff();
  if (!isUuid(ownerId)) return { ok: false, message: "That owner could not be found." };
  const supabase = await createClient();
  const trimmed = notes.trim().slice(0, 4000);
  const { error } = await supabase
    .from("lane_owners")
    .update({ notes: trimmed.length ? trimmed : null })
    .eq("id", ownerId);
  if (error) return { ok: false, message: "The notes did not save. Try again in a moment." };
  revalidateOwner(ownerId);
  return { ok: true };
}

/** Sets how the owner likes to be contacted. */
export async function setPreferredContact(ownerId: string, method: ContactMethod): Promise<ActionResult> {
  await requireStaff();
  if (!isUuid(ownerId)) return { ok: false, message: "That owner could not be found." };
  if (!CONTACT_METHODS.includes(method)) return { ok: false, message: "Pick call, email or SMS." };
  const supabase = await createClient();
  const { error } = await supabase.from("lane_owners").update({ preferred_contact: method }).eq("id", ownerId);
  if (error) return { ok: false, message: "That did not save. Try again in a moment." };
  revalidateOwner(ownerId);
  return { ok: true };
}

/**
 * Moves an owner to another property manager, along with everything that
 * is still open for them: loops, follow-ups and catch-ups. GM and director only.
 */
export async function reassignOwner(ownerId: string, pmId: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!canReassign(staff)) return { ok: false, message: "Only a general manager or director can reassign owners." };
  if (!isUuid(ownerId) || !isUuid(pmId)) return { ok: false, message: "That owner or manager could not be found." };
  const supabase = await createClient();

  const { data: pm } = await supabase.from("lane_staff").select("id").eq("id", pmId).eq("is_active", true).maybeSingle();
  if (!pm) return { ok: false, message: "That manager is not active." };

  const { error: ownerError } = await supabase.from("lane_owners").update({ assigned_pm_id: pmId }).eq("id", ownerId);
  if (ownerError) return { ok: false, message: "The owner did not move. Try again in a moment." };

  const [loops, commitments, outreach] = await Promise.all([
    supabase.from("lane_loops").update({ assigned_pm_id: pmId }).eq("owner_id", ownerId).eq("status", "open"),
    supabase.from("lane_commitments").update({ made_by: pmId }).eq("owner_id", ownerId).in("status", ["open", "suggested"]),
    supabase.from("lane_outreach_tasks").update({ assigned_pm_id: pmId }).eq("owner_id", ownerId).eq("status", "open"),
  ]);
  const failed = [loops.error, commitments.error, outreach.error].filter(Boolean);
  revalidateOwner(ownerId);
  revalidatePath("/queue");
  if (failed.length) return { ok: false, message: "The owner moved, but some open items stayed with the previous manager." };
  return { ok: true };
}

/** Adds an internal note to the owner's timeline. */
export async function addNote(ownerId: string, text: string): Promise<ActionResult> {
  const staff = await requireStaff();
  if (!isUuid(ownerId)) return { ok: false, message: "That owner could not be found." };
  const body = text.trim().slice(0, 4000);
  if (!body) return { ok: false, message: "Write a note first." };
  const supabase = await createClient();
  const row: InteractionInsert = {
    owner_id: ownerId,
    channel: "note",
    direction: "internal",
    staff_id: staff.id,
    body,
    occurred_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("lane_interactions").insert(row);
  if (error) return { ok: false, message: "The note did not save. Try again in a moment." };
  revalidateOwner(ownerId);
  return { ok: true };
}
