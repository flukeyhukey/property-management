/**
 * Seeds the owner system for mock mode.
 *
 *   npm run seed                         # replace previously seeded owners
 *   SEED_RESET=true npm run seed         # empty every lane_ data table first
 *   SEED_STAFF_AS_USERS=true npm run seed  # also create auth users for staff
 *
 * Reads .env.local. Never writes to properties, issues or reservations:
 * owners are linked to real active properties.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/domain/database";
import { buildSeedDataset, SEED_OWNER_PREFIX, SEED_STAFF } from "../src/lib/seed/data";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.supabase_service_role;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function check<T>(label: string, res: { error: { message: string } | null; data?: T }) {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res.data as T;
}

async function insertChunked<T extends object>(table: keyof Database["public"]["Tables"], rows: T[], size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    // The table name is dynamic, so the row type is checked where rows are built.
    check(`insert ${table}`, await db.from(table).insert(chunk as never));
  }
}

async function ensureStaff() {
  check(
    "staff invites",
    await db.from("lane_staff_invites").upsert(
      SEED_STAFF.map((s) => ({ email: s.email, name: s.name, role: s.role, dialpad_user_id: s.dialpadUserId })),
      { onConflict: "email" },
    ),
  );

  if (process.env.SEED_STAFF_AS_USERS === "true") {
    const existing = new Set<string>();
    for (let page = 1; page < 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`list users: ${error.message}`);
      for (const u of data.users) if (u.email) existing.add(u.email.toLowerCase());
      if (data.users.length < 200) break;
    }
    for (const s of SEED_STAFF) {
      if (existing.has(s.email)) continue;
      const { error } = await db.auth.admin.createUser({
        email: s.email,
        password: randomBytes(24).toString("base64url"),
        email_confirm: true,
        user_metadata: { full_name: s.name },
      });
      if (error) throw new Error(`create user ${s.email}: ${error.message}`);
      console.log(`  created user ${s.email}`);
    }
  }

  // Staff rows that already exist (signed in, or created above) get their Dialpad id if missing.
  for (const s of SEED_STAFF) {
    await db.from("lane_staff").update({ dialpad_user_id: s.dialpadUserId }).eq("email", s.email).is("dialpad_user_id", null);
  }

  const staff = check("staff", await db.from("lane_staff").select("id, email")) as { id: string; email: string }[];
  return new Map(staff.map((s) => [s.email.toLowerCase(), s.id]));
}

async function reset() {
  if (process.env.SEED_RESET === "true") {
    console.log("SEED_RESET=true: emptying lane_ data tables");
    const tables = [
      "lane_notifications",
      "lane_health_snapshots",
      "lane_resly_events",
      "lane_property_reviews",
      "lane_property_snapshots",
      "lane_nps_responses",
      "lane_outreach_tasks",
      "lane_commitments",
      "lane_loops",
      "lane_interactions",
      "lane_owner_properties",
      "lane_owner_contact_points",
      "lane_owners",
      "lane_sync_state",
    ] as const;
    for (const t of tables) {
      // PostgREST needs a filter on delete; every row matches this one.
      const col = t === "lane_owner_properties" ? "owner_id" : t === "lane_property_snapshots" ? "property_id" : t === "lane_sync_state" ? "key" : "id";
      check(`clear ${t}`, await db.from(t).delete().not(col, "is", null));
    }
    return;
  }

  const owners = check(
    "seeded owners",
    await db.from("lane_owners").select("id").like("hubspot_contact_id", `${SEED_OWNER_PREFIX}%`),
  ) as { id: string }[];
  if (!owners.length) return;
  const ids = owners.map((o) => o.id);
  const loops = check("seeded loops", await db.from("lane_loops").select("id").in("owner_id", ids)) as { id: string }[];
  const keys = loops.map((l) => `loop_waiting:${l.id}`);
  for (let i = 0; i < keys.length; i += 200) {
    check("old notifications", await db.from("lane_notifications").delete().in("dedupe_key", keys.slice(i, i + 200)));
  }
  // Everything else hangs off the owner and cascades.
  check("old owners", await db.from("lane_owners").delete().in("id", ids));
  console.log(`  removed ${ids.length} previously seeded owners`);
}

async function main() {
  console.log("Seeding Lane owner data");
  const staffIds = await ensureStaff();
  console.log(`  ${staffIds.size} staff rows (${SEED_STAFF.length} invites)`);
  if (![...staffIds.keys()].some((e) => SEED_STAFF.some((s) => s.email === e && s.role === "pm"))) {
    console.log("  No PM has signed in yet, so owners are unassigned. Run with SEED_STAFF_AS_USERS=true to create them.");
  }

  await reset();

  const properties = check(
    "properties",
    await db.from("properties").select("id, name").eq("is_active", true).order("name").limit(30),
  ) as { id: string; name: string }[];
  console.log(`  ${properties.length} active properties to link`);

  const data = buildSeedDataset({ properties, staffIds });

  await insertChunked("lane_owners", data.owners);
  await insertChunked("lane_owner_contact_points", data.contactPoints);
  await insertChunked("lane_owner_properties", data.ownerProperties);
  await insertChunked("lane_interactions", data.interactions);
  await insertChunked("lane_loops", data.loops);
  await insertChunked("lane_commitments", data.commitments);
  await insertChunked("lane_outreach_tasks", data.outreach);
  await insertChunked("lane_nps_responses", data.nps);
  check("sync state", await db.from("lane_sync_state").upsert(data.syncState.map((s) => ({ ...s, updated_at: new Date().toISOString() }))));

  const open = data.loops.filter((l) => l.status === "open").length;
  console.log(
    [
      `  owners ${data.owners.length}`,
      `interactions ${data.interactions.length}`,
      `loops ${data.loops.length} (${open} open)`,
      `follow-ups ${data.commitments.length}`,
      `outreach ${data.outreach.length}`,
      `survey responses ${data.nps.length}`,
    ].join(", "),
  );
  console.log("Done.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
