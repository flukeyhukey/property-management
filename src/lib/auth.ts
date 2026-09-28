import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Staff, StaffRole } from "@/lib/domain/types";

/** The signed-in staff member, or null when signed out / not staff. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("lane_staff")
    .select("*")
    .eq("id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return data ?? null;
});

/**
 * Use at the top of every page, action and route that needs a staff
 * session. Redirects to /login when signed out and to /no-access when the
 * Google account is not a staff member.
 */
export async function requireStaff(roles?: StaffRole[]): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/no-access" : "/login");
  }
  if (roles && !roles.includes(staff.role)) {
    redirect("/");
  }
  return staff;
}

export function isDirector(staff: Staff) {
  return staff.role === "director";
}

export function canReassign(staff: Staff) {
  return staff.role === "gm" || staff.role === "director";
}
