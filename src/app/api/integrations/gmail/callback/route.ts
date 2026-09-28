import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { gmailRedirectUri, storeRefreshToken } from "@/lib/integrations/gmail";

export const dynamic = "force-dynamic";

/** Google lands here after consent. Stores the refresh token on the staff row. */
export async function GET(request: NextRequest) {
  const staff = await requireStaff();
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // The state must be the signed-in staff member, so nobody can attach
  // their inbox to someone else's account.
  if (!code || state !== staff.id) {
    return NextResponse.redirect(`${origin}/settings?gmail=error`);
  }
  try {
    await storeRefreshToken(createAdminClient(), staff.id, code, gmailRedirectUri(origin));
  } catch (e) {
    console.error("[gmail callback]", e);
    return NextResponse.redirect(`${origin}/settings?gmail=error`);
  }
  return NextResponse.redirect(`${origin}/settings?gmail=connected`);
}
