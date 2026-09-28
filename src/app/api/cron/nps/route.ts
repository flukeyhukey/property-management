import { NextResponse } from "next/server";
import { scheduleSurveys, sendSurveys } from "@/lib/domain/nps";
import { checkCronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Daily: works out who is due a survey (quarterly, 30 days in, repair resolved) and sends it once. */
export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const db = createAdminClient();
  const now = new Date();
  const due = await scheduleSurveys(db, now);
  const result = await sendSurveys(db, due, now);
  return NextResponse.json({
    ok: true,
    due: due.length,
    byKind: due.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] ?? 0) + 1 }), {}),
    ...result,
  });
}
