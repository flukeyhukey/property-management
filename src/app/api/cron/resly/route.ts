import { NextResponse } from "next/server";
import { detectTriggers, snapshotProperties } from "@/lib/domain/resly-signals";
import { checkCronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily: snapshot every owner property from Resly, then open loops and outreach tasks for the triggers. */
export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const db = createAdminClient();
  const now = new Date();
  const snapshot = await snapshotProperties(db, now);
  const triggers = await detectTriggers(db, { now });
  return NextResponse.json({ ok: true, snapshot, triggers });
}
