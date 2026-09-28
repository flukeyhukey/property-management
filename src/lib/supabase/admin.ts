import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/domain/database";
import { SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Service-role client. Bypasses RLS. Server only: ingestion, cron jobs,
 * webhooks and anything that runs without a staff session.
 */
export function createAdminClient() {
  // Vercel has it as `supabase_service_role`; the conventional name also works.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.supabase_service_role;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY (or supabase_service_role) is not set");
  }
  return createSupabaseClient<Database>(
    SUPABASE_URL,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type AdminClient = ReturnType<typeof createAdminClient>;
