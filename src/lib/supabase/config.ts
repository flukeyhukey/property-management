/**
 * Public Supabase settings. Neither value is a secret (both ship to the
 * browser), so they default to the shared Lane project and can be
 * overridden with NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yvohdlsbjjzsvrxblwoc.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_x_Ed-u_qI5he95oaxFOM0g_3s90hfx4";
