/** Owners as the mock adapters see them: name, contact points and their PM. */
import type { AdminClient } from "@/lib/supabase/admin";
import type { MockOwner } from "@/lib/seed/data";

export async function loadMockOwners(db: AdminClient, limit = 40): Promise<MockOwner[]> {
  const { data: owners } = await db
    .from("lane_owners")
    .select("id, name, primary_email, primary_phone, assigned_pm_id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (!owners?.length) return [];
  const pmIds = Array.from(new Set(owners.map((o) => o.assigned_pm_id).filter((x): x is string => Boolean(x))));
  const { data: staff } = pmIds.length
    ? await db.from("lane_staff").select("id, email, dialpad_user_id").in("id", pmIds)
    : { data: [] as { id: string; email: string; dialpad_user_id: string | null }[] };
  const byId = new Map((staff ?? []).map((s) => [s.id, s]));
  return owners.map((o) => {
    const pm = o.assigned_pm_id ? byId.get(o.assigned_pm_id) : undefined;
    return {
      id: o.id,
      name: o.name,
      email: o.primary_email,
      phone: o.primary_phone,
      pmEmail: pm?.email ?? null,
      pmDialpadUserId: pm?.dialpad_user_id ?? null,
      pmStaffId: pm?.id ?? null,
    };
  });
}
