import { NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueDaily5pm, enqueueDirectorDetractors, enqueueWeeklyDigest } from "@/lib/notifications/digests";
import { flushNotifications } from "@/lib/notifications/push";

export const dynamic = "force-dynamic";

const JOBS = ["daily", "detractors", "weekly", "flush"] as const;
type Job = (typeof JOBS)[number];

/**
 * GET /api/cron/notify?job=daily|detractors|weekly|flush (default flush).
 * Every job ends with a flush so what it queued goes out in the same run.
 */
export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const raw = new URL(request.url).searchParams.get("job") ?? "flush";
  const job = (JOBS as readonly string[]).includes(raw) ? (raw as Job) : null;
  if (!job) {
    return NextResponse.json({ error: `job must be one of ${JOBS.join(", ")}` }, { status: 400 });
  }

  const db = createAdminClient();
  try {
    let queued: Record<string, number> = {};
    if (job === "daily") queued = await enqueueDaily5pm(db);
    if (job === "detractors") queued = await enqueueDirectorDetractors(db);
    if (job === "weekly") queued = await enqueueWeeklyDigest(db);
    const flushed = await flushNotifications(db);
    return NextResponse.json({ ok: true, job, ...queued, flushed });
  } catch (err) {
    console.error(`[cron/notify] ${job} failed`, err);
    return NextResponse.json({ ok: false, job, error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
