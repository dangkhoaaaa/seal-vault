import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from './Providers';
import { Header } from '@/components/Header';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SealVault — Web3 Password Manager',
  description:
    'Manage your passwords securely on-chain. Encrypted with Seal Protocol, stored on Walrus, secured by your Sui wallet.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} bg-[#0A0A0B] text-white min-h-screen border-t-[3px] border-t-violet-500`}
      >
        <Providers>
          <Header />
          <main className="max-w-5xl mx-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
