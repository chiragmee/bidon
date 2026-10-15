import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { SessionLostDialog } from '@/components/layout/SessionLostDialog';
import { ToastProvider } from '@/components/ui/Toast';
import { DataProvider } from '@/data';
import { parseSession, SESSION_COOKIE } from '@/lib/session';
import { SessionProvider } from '@/lib/SessionProvider';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'AuctionIT — Industrial surplus auctions', template: '%s · AuctionIT' },
  description: 'B2B marketplace for industrial scrap and surplus auctions, with Lot Assurance.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = parseSession((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <html lang="en-IN" className={inter.variable}>
      <body>
        <DataProvider>
          <SessionProvider initial={session}>
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
