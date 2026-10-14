import { NextResponse, type NextRequest } from 'next/server';
import { parseSession, requiredRole, SESSION_COOKIE } from '@/lib/session';

/**
 * Server-side route guard (Next 16 "proxy", formerly middleware). Buyers never reach /seller,
 * sellers never reach /buyer, only Operations reaches /ops. The API guards its own routes too.
 */
export function proxy(req: NextRequest) {
  const need = requiredRole(req.nextUrl.pathname);
  if (!need) return NextResponse.next();
  const session = parseSession(req.cookies.get(SESSION_COOKIE)?.value);
  const allowed = need === 'signed_in' ? session.role !== 'guest' : session.role === need;
  if (allowed) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/access-denied';
  url.search = `?need=${need}&from=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/buyer/:path*', '/seller/:path*', '/ops/:path*', '/transactions/:path*'] };
