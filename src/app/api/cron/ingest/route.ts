import { NextResponse } from "next/server";
import { checkCronSecret, integrationsMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepPastDue } from "@/lib/domain/loops";
import { ingestMaintenance, recordInteraction } from "@/lib/ingest/record";
import { gmail } from "@/lib/integrations/gmail";
import { dialpad } from "@/lib/integrations/dialpad";
import { syncMasterSheet } from "@/lib/integrations/sheets";
import { enrichPending } from "@/lib/ai/enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type StepResult = Record<string, unknown> & { error?: string };

async function step(name: string, errors: string[], fn: () => Promise<object>): Promise<StepResult> {
  try {
    return { ...(await fn()) } as StepResult;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[ingest] ${name}`, e);
    errors.push(`${name}: ${message}`);
    return { error: message };
  }
}

/**
 * Pulls everything new, records it (which opens and closes loops), then
 * sends one note per loop that has passed its time. Safe to run as often as
 * you like: interactions are unique on channel + external id.
 */
export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const db = createAdminClient();
  const now = new Date();
  const since = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const errors: string[] = [];

  const record = async (events: Parameters<typeof recordInteraction>[1][]) => {
    let recorded = 0;
    let unmatched = 0;
    for (const ev of events) {
      const row = await recordInteraction(db, ev);
      if (row) recorded += 1;
      else unmatched += 1;
    }
    return { pulled: events.length, recorded, unmatched };
  };

  const email = await step("gmail", errors, async () => record(await gmail(db).pull(since)));
  const phone = await step("dialpad", errors, async () => record(await dialpad(db).pull(since)));
  const maintenance = await step("maintenance", errors, () => ingestMaintenance(db, now));

  const sheetsDue = integrationsMode() === "mock" || Boolean(process.env.MASTER_SHEET_ID);
  const sheets = sheetsDue
    ? await step("sheets", errors, async () => {
        const r = await syncMasterSheet(db);
        return { ...r, unmatched: r.unmatched.length, unmatchedRows: r.unmatched.slice(0, 20) };
      })
    : { skipped: "MASTER_SHEET_ID not set" };

  const enrich = await step("enrich", errors, async () => ({ enriched: (await enrichPending(db)).length }));
  const pastDue = await step("sweep", errors, () => sweepPastDue(db, now));

  return NextResponse.json({
    ok: errors.length === 0,
    mode: integrationsMode(),
    ran_at: now.toISOString(),
    gmail: email,
    dialpad: phone,
    maintenance,
    sheets,
    enrich,
    sweep: pastDue,
    errors,
  });
}
