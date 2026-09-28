import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { GMAIL_SCOPES, gmailRedirectUri, oauthClient } from "@/lib/integrations/gmail";

export const dynamic = "force-dynamic";

/** Sends the signed-in staff member to Google to connect their inbox. */
export async function GET(request: NextRequest) {
  const staff = await requireStaff();
  const origin = request.nextUrl.origin;
  let url: string;
  try {
    url = oauthClient(gmailRedirectUri(origin)).generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GMAIL_SCOPES,
      login_hint: staff.email,
      state: staff.id,
    });
  } catch {
    return NextResponse.redirect(`${origin}/settings?gmail=not_configured`);
  }
  return NextResponse.redirect(url);
}
