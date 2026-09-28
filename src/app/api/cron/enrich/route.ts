import { NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichPending } from "@/lib/ai/enrich";

export const dynamic = "force-dynamic";

/** Classifies inbound messages that have no summary yet and pre-drafts the reply on their loop. */
export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const db = createAdminClient();
  const results = await enrichPending(db, limit);
  return NextResponse.json({
    ok: true,
    processed: results.length,
    classified: results.filter((r) => r.classified).length,
    drafted: results.filter((r) => r.drafted).length,
  });
}
