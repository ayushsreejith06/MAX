import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import { UpdaterModal } from '@/components/UpdaterModal';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Stock Brokerage UI - Redesign',
  description: 'Professional Stock Brokerage Interface',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${plexMono.variable} bg-pure-black text-floral-white`}>
        <Navbar />
        {children}
        <UpdaterModal />
      </body>
    </html>
  );
}

