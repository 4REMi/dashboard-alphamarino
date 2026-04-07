import { createClient } from "@supabase/supabase-js"

/**
 * Admin client using the Service Role key.
 * ONLY use server-side — never expose this client to the browser.
 * Required for auth.admin.* methods (invite, delete user, etc.)
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
