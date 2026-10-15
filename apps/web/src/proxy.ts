import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/flags';
import { authStateFromClaims, SIGNED_OUT, type AuthState } from '@/lib/supabase/claims';
import { HOME, parseSession, requiredRole, SESSION_COOKIE, type Session } from '@/lib/session';

/**
 * Server-side route guard (Next 16 "proxy", formerly middleware). Buyers never reach /seller, sellers never reach
 * /buyer, only Operations reaches /ops. Live site: the session comes from the verified Supabase JWT, refreshed here
 * on every request. The API guards its own routes too and decides from the profile row.
 */
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  let auth: AuthState | null = null;
  if (AUTH_ENABLED) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      auth = SIGNED_OUT;
    } else {
      const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (list) => {
            for (const { name, value } of list) req.cookies.set(name, value);
            res = NextResponse.next({ request: req });
            for (const { name, value, options } of list) res.cookies.set(name, value, options);
          },
        },
      });
      const { data } = await supabase.auth.getClaims();
      auth = authStateFromClaims(data?.claims as Record<string, unknown> | undefined);
    }
  }

  const path = req.nextUrl.pathname;
  const session: Session = auth ? auth.session : parseSession(req.cookies.get(SESSION_COOKIE)?.value);

  // Signed in with an account: the marketing home and the sign-in/sign-up pages give way to their own workspace.
  if (auth && session.role !== 'guest' && (path === '/' || path === '/sign-in' || path === '/sign-up' || path === '/staff/sign-in')) {
    return redirect(req, res, HOME[session.role]);
  }
  // Signed in but no Bid ON account yet: finish onboarding before anything that needs an account.
  if (auth?.signedIn && session.role === 'guest' && requiredRole(path)) {
    return redirect(req, res, auth.intendedRole === 'seller' ? '/onboarding/seller' : '/onboarding/buyer');
  }
  const need = requiredRole(path);
  if (!need) return res;
  const allowed =
    need === 'signed_in' ? session.role !== 'guest' : need === 'account' ? session.role === 'buyer' || session.role === 'seller' : session.role === need;
  if (allowed) return res;
  if (auth && session.role === 'guest') return redirect(req, res, `/sign-in?next=${encodeURIComponent(path + req.nextUrl.search)}`);
  return redirect(req, res, `/access-denied?need=${need === 'account' ? 'signed_in' : need}&from=${encodeURIComponent(path + req.nextUrl.search)}`);
}

/** Redirect, keeping any refreshed session cookies. */
function redirect(req: NextRequest, res: NextResponse, to: string) {
  const out = NextResponse.redirect(new URL(to, req.url));
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}

export const config = {
  // Every page (the session cookie is refreshed here), but not static files, images or the auth callback.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|demo-images|auth/confirm|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)'],
};
