'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUTH_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/flags';

let client: SupabaseClient | null = null;

/** The browser's Supabase Auth client (session kept in cookies so the server sees it too). Null when not configured. */
export function supabaseBrowser(): SupabaseClient | null {
  if (!AUTH_CONFIGURED || typeof window === 'undefined') return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

/** The current access token for API calls (refreshed by the client as needed). */
export async function accessToken(): Promise<string | null> {
  const sb = supabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
