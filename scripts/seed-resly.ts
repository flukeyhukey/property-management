/**
 * Resly seed: run after `npm run seed`.
 *   npx tsx scripts/seed-resly.ts
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local if present).
 */
import { existsSync } from "node:fs";
import { seedResly } from "@/lib/seed/resly";
import { createAdminClient } from "@/lib/supabase/admin";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const db = createAdminClient();
  const result = await seedResly(db);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
