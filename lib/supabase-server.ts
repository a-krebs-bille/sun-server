import { createClient } from '@supabase/supabase-js'

// Server-only client — uses service role key, bypasses RLS.
// Never import this in 'use client' files.
// Lazy singleton so it doesn't crash at build time when env vars aren't set.
let _admin: ReturnType<typeof createClient> | null = null

export function getSupabaseAdmin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _admin
}

// Convenience alias for backwards compatibility
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) {
    return (getSupabaseAdmin() as any)[prop]
  },
})
