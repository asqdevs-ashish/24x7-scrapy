import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Realtor Leads',
  description: 'Queue Google Maps scraping jobs and work your realtor leads.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#04050a',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans">
        <div className="app-backdrop" aria-hidden />
        {children}
      </body>
    </html>
  );
}
