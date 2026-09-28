import { NextResponse } from "next/server";
import { recomputeAllHealth } from "@/lib/domain/health";
import { checkCronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Recomputes every active owner's health, reason and cadence. */
export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await recomputeAllHealth(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
