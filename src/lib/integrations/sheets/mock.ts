/**
 * Sheets, mock. The Master Sheet as it would look for the seeded owners, so
 * a sync in mock mode runs the whole upsert path and changes nothing.
 */
import type { AdminClient } from "@/lib/supabase/admin";
import type { MaintenanceSheetRow, MasterSheetRow } from "../types";

export async function readMasterRows(db: AdminClient): Promise<MasterSheetRow[]> {
  const { data: owners } = await db
    .from("lane_owners")
    .select("id, name, primary_email, primary_phone, onboarded_at, assigned_pm_id")
    .eq("is_active", true)
    .like("hubspot_contact_id", "seed-owner-%");
  if (!owners?.length) return [];
  const { data: links } = await db
    .from("lane_owner_properties")
    .select("owner_id, property_id")
    .in("owner_id", owners.map((o) => o.id));
  const propIds = (links ?? []).map((l) => l.property_id);
  const { data: props } = propIds.length
    ? await db.from("properties").select("id, name, address, region, key_number").in("id", propIds)
    : { data: [] };
  const { data: staff } = await db.from("lane_staff").select("id, email");
  const staffEmail = new Map((staff ?? []).map((s) => [s.id, s.email]));
  const propById = new Map((props ?? []).map((p) => [p.id, p]));

  const rows: MasterSheetRow[] = [];
  for (const link of links ?? []) {
    const owner = owners.find((o) => o.id === link.owner_id);
    const p = propById.get(link.property_id);
    if (!owner || !p) continue;
    rows.push({
      propertyName: p.name,
      address: p.address ?? p.name,
      ownerName: owner.name,
      ownerEmail: owner.primary_email,
      ownerPhone: owner.primary_phone,
      keyNumber: p.key_number !== null && p.key_number !== undefined ? String(p.key_number) : null,
      buildingManager: null,
      cleaner: null,
      region: p.region,
      onboardDate: owner.onboarded_at,
      assignedPmEmail: owner.assigned_pm_id ? staffEmail.get(owner.assigned_pm_id) ?? null : null,
    });
  }
  return rows;
}

export async function readMaintenanceRows(): Promise<MaintenanceSheetRow[]> {
  return [];
}
