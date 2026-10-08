import { Inter, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
