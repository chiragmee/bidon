import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { ToastProvider } from '@/components/ui/Toast';
import { DataProvider } from '@/data';
import { parseSession, SESSION_COOKIE } from '@/lib/session';
import { SessionProvider } from '@/lib/SessionProvider';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'AuctionIT — Industrial surplus auctions (demo)', template: '%s · AuctionIT' },
  description: 'Demo of a B2B marketplace for industrial scrap and surplus auctions, with Lot Assurance.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = parseSession((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <html lang="en-IN" className={inter.variable}>
      <body>
        <DataProvider>
          <SessionProvider initial={session}>
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </DataProvider>
      </body>
    </html>
  );
}
