import { NextResponse } from "next/server";
import { z } from "zod";
import { getStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
});

/** POST { subscription } saves this device for the signed-in staff member. */
export async function POST(request: Request) {
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const parsed = SubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "subscription is malformed" }, { status: 400 });

  const { endpoint, keys } = parsed.data.subscription;
  const db = await createClient();
  const { error } = await db
    .from("lane_push_subscriptions")
    .upsert({ staff_id: staff.id, endpoint, keys }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE { endpoint } forgets this device. */
export async function DELETE(request: Request) {
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const body = z.object({ endpoint: z.string().url() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "endpoint is missing" }, { status: 400 });

  const db = await createClient();
  const { error } = await db
    .from("lane_push_subscriptions")
    .delete()
    .eq("endpoint", body.data.endpoint)
    .eq("staff_id", staff.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
