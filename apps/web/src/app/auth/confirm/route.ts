import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * Where Supabase's emails land (sign-up verification, password reset). Supports both link styles: `?code=` (PKCE,
 * the default template — open the link on the device that asked for it) and `?token_hash=&type=` (recommended
 * template, works on any device). Sets the session cookies, then continues to `next`.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const raw = url.searchParams.get('next') ?? '/';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  const supabase = await supabaseServer();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('missing code') };
  const to = new URL(error ? `/sign-in?link=expired` : next, url.origin);
  return NextResponse.redirect(to);
}
