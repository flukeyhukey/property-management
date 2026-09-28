import { NextResponse } from "next/server";
import { recordNpsResponse } from "@/lib/domain/nps";
import { NpsWebhookSchema, verifyNpsRequest } from "@/lib/integrations/nps";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Generic NPS response webhook.
 * POST JSON { email, score, comment, respondedAt, surveyId, kind? }
 * Auth: `x-nps-signature` (hex HMAC-SHA256 of the raw body with NPS_WEBHOOK_SECRET)
 * or `Authorization: Bearer <NPS_WEBHOOK_SECRET>`.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyNpsRequest(request.headers, raw)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = NpsWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const result = await recordNpsResponse(createAdminClient(), parsed.data);
  // Unknown owners are acknowledged so the tool does not retry forever.
  return NextResponse.json({ ok: true, ...result });
}
