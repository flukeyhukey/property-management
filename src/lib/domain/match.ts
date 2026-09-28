/**
 * Matching inbound events to owners and staff. Owners are matched through
 * lane_owner_contact_points (every address or number they have written
 * from); staff through lane_staff.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import type { Owner, Staff } from "./types";

/** Lower-cased address with any display name or angle brackets removed. */
export function normaliseEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.match(/<([^>]+)>/);
  const raw = (m ? m[1] : input).trim().toLowerCase();
  return raw.includes("@") ? raw : null;
}

/**
 * Australian numbers to E.164 (+61...). Accepts 04xx, 61..., +61..., (07) and
 * spaced or dashed forms. Returns null when nothing usable is left.
 */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const hasPlus = input.trim().startsWith("+");
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.startsWith("0011")) return `+${digits.slice(4)}`;
  if (digits.startsWith("61") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+61${digits.slice(1)}`;
  if (digits.length === 9 && /^[2-9]/.test(digits)) return `+61${digits}`;
  return `+${digits}`;
}

export async function matchOwnerByEmail(db: AdminClient, email: string | null | undefined): Promise<Owner | null> {
  const value = normaliseEmail(email);
  if (!value) return null;
  const { data: point } = await db
    .from("lane_owner_contact_points")
    .select("owner_id")
    .eq("kind", "email")
    .eq("value", value)
    .limit(1)
    .maybeSingle();
  let ownerId = point?.owner_id ?? null;
  if (!ownerId) {
    const { data: owner } = await db.from("lane_owners").select("id").ilike("primary_email", value).limit(1).maybeSingle();
    ownerId = owner?.id ?? null;
  }
  if (!ownerId) return null;
  const { data } = await db.from("lane_owners").select("*").eq("id", ownerId).maybeSingle();
  return data ?? null;
}

export async function matchOwnerByPhone(db: AdminClient, phone: string | null | undefined): Promise<Owner | null> {
  const value = normalisePhone(phone);
  if (!value) return null;
  const { data: point } = await db
    .from("lane_owner_contact_points")
    .select("owner_id")
    .in("kind", ["call", "sms"])
    .eq("value", value)
    .limit(1)
    .maybeSingle();
  let ownerId = point?.owner_id ?? null;
  if (!ownerId) {
    const { data: owner } = await db.from("lane_owners").select("id").eq("primary_phone", value).limit(1).maybeSingle();
    ownerId = owner?.id ?? null;
  }
  if (!ownerId) return null;
  const { data } = await db.from("lane_owners").select("*").eq("id", ownerId).maybeSingle();
  return data ?? null;
}

export async function matchStaffByEmail(db: AdminClient, email: string | null | undefined): Promise<Staff | null> {
  const value = normaliseEmail(email);
  if (!value) return null;
  const { data } = await db.from("lane_staff").select("*").ilike("email", value).limit(1).maybeSingle();
  return data ?? null;
}

export async function matchStaffByDialpadUser(db: AdminClient, dialpadUserId: string | null | undefined): Promise<Staff | null> {
  if (!dialpadUserId) return null;
  const { data } = await db.from("lane_staff").select("*").eq("dialpad_user_id", String(dialpadUserId)).limit(1).maybeSingle();
  return data ?? null;
}

/** Any staff address in a list of recipients. */
export async function matchStaffByAnyEmail(db: AdminClient, emails: (string | null | undefined)[]): Promise<Staff | null> {
  for (const e of emails) {
    const s = await matchStaffByEmail(db, e);
    if (s) return s;
  }
  return null;
}

export async function matchOwnerByAnyEmail(db: AdminClient, emails: (string | null | undefined)[]): Promise<Owner | null> {
  for (const e of emails) {
    const o = await matchOwnerByEmail(db, e);
    if (o) return o;
  }
  return null;
}
