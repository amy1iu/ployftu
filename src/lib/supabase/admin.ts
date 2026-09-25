import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the secret key (bypasses RLS). There's no auth in
// this demo, so one shared client is fine. Never import this from client code.
let client: SupabaseClient | undefined;

export function db() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
