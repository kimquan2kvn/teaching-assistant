import { Inter, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SearchBox } from '@/components/layout/search-box';
import { UserMenu } from '@/components/layout/user-menu';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-heading',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata = {
  title: 'Sổ Chủ Nhiệm',
  description: 'Sổ chủ nhiệm điện tử cho giáo viên và học sinh THPT',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className={`${inter.variable} ${plexSans.variable} ${plexMono.variable}`}>
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar className="hidden md:flex md:w-64 md:shrink-0" />
            <div className="flex flex-1 flex-col">
              <header className="flex items-center gap-4 border-b border-border p-4">
                <MobileNav />
                <div className="max-w-sm flex-1">
                  <SearchBox />
                </div>
                <UserMenu />
              </header>
              <main className="flex-1">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
