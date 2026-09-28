import { NextResponse } from "next/server";
import { generateCadenceTasks } from "@/lib/domain/cadence";
import { checkCronSecret } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Creates catch-up tasks for owners coming due on their 30- or 90-day cadence. */
export async function GET(request: Request) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await generateCadenceTasks(createAdminClient(), new Date());
  return NextResponse.json({ ok: true, ...result });
}
