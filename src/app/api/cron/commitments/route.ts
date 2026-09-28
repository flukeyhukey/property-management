import { NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { suggestFromInteraction, sweepDue, tryCloseWithEvidence } from "@/lib/domain/commitments";

export const dynamic = "force-dynamic";

const SYNC_KEY = "commitments:last_run";
const BATCH = 200;

/**
 * Runs the follow-up lifecycle: new outbound emails and calls since the last
 * run become suggested follow-ups and close the ones they cover, then every
 * open follow-up past its date gets an honest update drafted.
 */
export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const db = createAdminClient();
  const now = new Date();

  const { data: state } = await db.from("lane_sync_state").select("value").eq("key", SYNC_KEY).maybeSingle();
  const lastRun = readLastRun(state?.value) ?? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: interactions, error } = await db
    .from("lane_interactions")
    .select("*")
    .eq("direction", "outbound")
    .gt("created_at", lastRun)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let suggested = 0;
  let kept = 0;
  let prompted = 0;
  let latest = lastRun;
  const failures: string[] = [];
  for (const interaction of interactions ?? []) {
    try {
      const rows = await suggestFromInteraction(db, interaction, interaction.staff_id);
      suggested += rows.length;
      const evidence = await tryCloseWithEvidence(db, interaction);
      kept += evidence.kept.length;
      prompted += evidence.prompted.length;
      latest = interaction.created_at;
    } catch (e) {
      failures.push(`${interaction.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const sweep = await sweepDue(db, now);

  await db.from("lane_sync_state").upsert({ key: SYNC_KEY, value: { at: latest, ran_at: now.toISOString() }, updated_at: now.toISOString() });

  return NextResponse.json({
    ok: failures.length === 0,
    processed: interactions?.length ?? 0,
    suggested,
    kept,
    prompted,
    missed: sweep.missed.length,
    ownersTurnedAmber: sweep.ownersTurnedAmber.length,
    since: lastRun,
    until: latest,
    failures,
  });
}

function readLastRun(value: unknown): string | null {
  if (value && typeof value === "object" && "at" in value && typeof (value as { at: unknown }).at === "string") {
    return (value as { at: string }).at;
  }
  return null;
}
