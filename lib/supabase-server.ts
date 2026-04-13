import { createClient } from '@supabase/supabase-js'

// Server-only client — uses service role key, bypasses RLS.
// Never import this in 'use client' files.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
