/**
 * Master Sheet sync: owners, their contact points and their properties.
 * Properties are never created here; each sheet row is matched to an
 * existing public.properties row by normalised address or name, and rows
 * that do not match are reported back.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import { integrationsMode } from "@/lib/env";
import { normaliseEmail, normalisePhone } from "@/lib/domain/match";
import type { MasterSheetRow } from "../types";
import * as live from "./live";
import * as mock from "./mock";

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bstreet\b/g, "st"],
  [/\broad\b/g, "rd"],
  [/\bavenue\b/g, "ave"],
  [/\bterrace\b/g, "tce"],
  [/\bparade\b/g, "pde"],
  [/\bboulevard\b/g, "blvd"],
  [/\bdrive\b/g, "dr"],
  [/\bplace\b/g, "pl"],
  [/\bcourt\b/g, "ct"],
  [/\bcrescent\b/g, "cres"],
  [/\bhighway\b/g, "hwy"],
  [/\besplanade\b/g, "esp"],
  [/\bapartment\b|\bunit\b|\bapt\b/g, ""],
  [/\bqueensland\b|\bqld\b|\baustralia\b/g, ""],
];

/** Lower case, punctuation out, common street words shortened, no postcode. */
export function normaliseText(input: string | null | undefined): string {
  let s = (input ?? "").toLowerCase().replace(/[.,#/\\'"()-]/g, " ");
  for (const [re, rep] of ABBREVIATIONS) s = s.replace(re, rep);
  return s
    .replace(/\b\d{4}\b$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "14/03/2024", "2024-03-14" or "14 Mar 2024" → "2024-03-14". Australian day-first. */
export function parseSheetDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const au = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (au) {
    const year = au[3].length === 2 ? `20${au[3]}` : au[3];
    return `${year}-${au[2].padStart(2, "0")}-${au[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

type PropertyIndexRow = { id: string; name: string; address: string | null; suburb: string | null };

export function matchProperty(row: Pick<MasterSheetRow, "propertyName" | "address">, props: PropertyIndexRow[]): string | null {
  const candidates = [normaliseText(row.address), normaliseText(row.propertyName)].filter(Boolean);
  for (const p of props) {
    const keys = [normaliseText(p.name), normaliseText(p.address), normaliseText([p.address, p.suburb].filter(Boolean).join(" "))];
    if (candidates.some((c) => keys.includes(c))) return p.id;
  }
  // Looser: one contains the other (e.g. sheet has suburb appended).
  for (const p of props) {
    const keys = [normaliseText(p.name), normaliseText(p.address)].filter((k) => k.length >= 6);
    if (candidates.some((c) => c.length >= 6 && keys.some((k) => c.includes(k) || k.includes(c)))) return p.id;
  }
  return null;
}

export type SheetSyncResult = {
  rows: number;
  ownersCreated: number;
  ownersUpdated: number;
  propertiesLinked: number;
  unmatched: { propertyName: string; address: string; ownerName: string }[];
};

export async function syncMasterSheet(db: AdminClient, mode: "mock" | "live" = integrationsMode()): Promise<SheetSyncResult> {
  const rows = mode === "live" ? await live.readMasterRows() : await mock.readMasterRows(db);
  const result: SheetSyncResult = { rows: rows.length, ownersCreated: 0, ownersUpdated: 0, propertiesLinked: 0, unmatched: [] };
  if (!rows.length) return result;

  const { data: props } = await db.from("properties").select("id, name, address, suburb").eq("is_active", true);
  const { data: staff } = await db.from("lane_staff").select("id, email");
  const staffByEmail = new Map((staff ?? []).map((s) => [s.email.toLowerCase(), s.id]));

  for (const row of rows) {
    const email = normaliseEmail(row.ownerEmail);
    const phone = normalisePhone(row.ownerPhone);
    const pmId = row.assignedPmEmail ? staffByEmail.get(row.assignedPmEmail.trim().toLowerCase()) ?? null : null;

    // Find the owner: by email, then phone, then exact name.
    let ownerId: string | null = null;
    if (email) {
      const { data } = await db.from("lane_owner_contact_points").select("owner_id").eq("kind", "email").eq("value", email).maybeSingle();
      ownerId = data?.owner_id ?? null;
    }
    if (!ownerId && phone) {
      const { data } = await db.from("lane_owner_contact_points").select("owner_id").eq("kind", "call").eq("value", phone).maybeSingle();
      ownerId = data?.owner_id ?? null;
    }
    if (!ownerId) {
      const { data } = await db.from("lane_owners").select("id").eq("name", row.ownerName.trim()).limit(1).maybeSingle();
      ownerId = data?.id ?? null;
    }

    const patch = {
      name: row.ownerName.trim(),
      primary_email: email,
      primary_phone: phone,
      onboarded_at: parseSheetDate(row.onboardDate),
      ...(pmId ? { assigned_pm_id: pmId } : {}),
    };
    if (ownerId) {
      const { data: existing } = await db.from("lane_owners").select("name, primary_email, primary_phone, onboarded_at, assigned_pm_id").eq("id", ownerId).single();
      const changed =
        existing &&
        (existing.name !== patch.name ||
          (patch.primary_email && existing.primary_email !== patch.primary_email) ||
          (patch.primary_phone && existing.primary_phone !== patch.primary_phone) ||
          (patch.onboarded_at && existing.onboarded_at !== patch.onboarded_at) ||
          (pmId && existing.assigned_pm_id !== pmId));
      if (changed) {
        await db
          .from("lane_owners")
          .update({
            name: patch.name,
            ...(patch.primary_email ? { primary_email: patch.primary_email } : {}),
            ...(patch.primary_phone ? { primary_phone: patch.primary_phone } : {}),
            ...(patch.onboarded_at ? { onboarded_at: patch.onboarded_at } : {}),
            ...(pmId ? { assigned_pm_id: pmId } : {}),
          })
          .eq("id", ownerId);
        result.ownersUpdated += 1;
      }
    } else {
      const { data, error } = await db.from("lane_owners").insert(patch).select("id").single();
      if (error) throw new Error(`syncMasterSheet: ${error.message}`);
      ownerId = data.id;
      result.ownersCreated += 1;
    }

    const points = [
      ...(email ? [{ owner_id: ownerId, kind: "email" as const, value: email, is_primary: true }] : []),
      ...(phone ? [{ owner_id: ownerId, kind: "call" as const, value: phone, is_primary: true }] : []),
    ];
    if (points.length) {
      await db.from("lane_owner_contact_points").upsert(points, { onConflict: "kind,value", ignoreDuplicates: true });
    }

    const propertyId = matchProperty(row, props ?? []);
    if (!propertyId) {
      result.unmatched.push({ propertyName: row.propertyName, address: row.address, ownerName: row.ownerName });
      continue;
    }
    const { data: link } = await db
      .from("lane_owner_properties")
      .select("owner_id")
      .eq("owner_id", ownerId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (!link) {
      await db.from("lane_owner_properties").insert({ owner_id: ownerId, property_id: propertyId });
      result.propertiesLinked += 1;
    }
  }

  await db.from("lane_sync_state").upsert({
    key: "sheets:master",
    value: { last_sync: new Date().toISOString(), rows: result.rows, unmatched: result.unmatched.length },
    updated_at: new Date().toISOString(),
  });
  return result;
}

export { MASTER_HEADER_DEFAULTS, MAINTENANCE_HEADER_DEFAULTS, rowsToObjects, hasMaintenanceSheet } from "./live";
