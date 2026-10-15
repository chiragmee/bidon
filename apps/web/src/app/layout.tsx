import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { SessionLostDialog } from '@/components/layout/SessionLostDialog';
import { ToastProvider } from '@/components/ui/Toast';
import { DataProvider } from '@/data';
import { AUTH_CONFIGURED, AUTH_ENABLED } from '@/lib/flags';
import { GUEST, parseSession, SESSION_COOKIE } from '@/lib/session';
import { SessionProvider } from '@/lib/SessionProvider';
import { authStateFromClaims, SIGNED_OUT, type AuthState } from '@/lib/supabase/claims';
import { supabaseServer } from '@/lib/supabase/server';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Bid ON — Industrial surplus auctions', template: '%s · Bid ON' },
  description: 'B2B marketplace for industrial scrap and surplus auctions, with Lot Assurance.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Live site: who is signed in comes from the verified Supabase session; otherwise the sample-account cookie.
  let auth: AuthState | null = null;
  if (AUTH_ENABLED) {
    auth = SIGNED_OUT;
    if (AUTH_CONFIGURED) {
      const { data } = await (await supabaseServer()).auth.getClaims();
      auth = authStateFromClaims(data?.claims as Record<string, unknown> | undefined);
    }
  }
  const session = auth ? auth.session : AUTH_ENABLED ? GUEST : parseSession((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <html lang="en-IN" className={inter.variable}>
      <body>
        <DataProvider>
          <SessionProvider initial={session} initialAuth={auth}>
            <ToastProvider>
              {children}
              <SessionLostDialog />
            </ToastProvider>
          </SessionProvider>
        </DataProvider>
      </body>
    </html>
  );
}
