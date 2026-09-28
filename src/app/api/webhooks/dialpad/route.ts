import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordInteraction } from "@/lib/ingest/record";
import { isSmsPayload, normaliseCall, normaliseSms, verifyWebhook } from "@/lib/integrations/dialpad";

export const dynamic = "force-dynamic";

/**
 * Dialpad call and SMS event subscriptions. Payloads arrive as an HS256 JWT
 * signed with DIALPAD_WEBHOOK_SECRET (or JSON with an HMAC header). Calls
 * are recorded once they reach a final state; ringing/connected events are
 * acknowledged and ignored.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const payload = verifyWebhook(raw, request.headers);
  if (!payload) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = isSmsPayload(payload) ? normaliseSms(payload) : normaliseCall(payload);
  if (!event) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const db = createAdminClient();
    const row = await recordInteraction(db, event);
    return NextResponse.json({ ok: true, recorded: Boolean(row), interaction_id: row?.id ?? null });
  } catch (e) {
    console.error("[dialpad webhook]", e);
    return NextResponse.json({ error: "could not record" }, { status: 500 });
  }
}
