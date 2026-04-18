'use client';
import { ConnectButton } from '@mysten/dapp-kit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, KeyRound, Home } from 'lucide-react';
import { clsx } from 'clsx';

const NAV = [
  { href: '/',      label: 'Home',     icon: Home },
  { href: '/vault', label: 'My Vault', icon: KeyRound },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="px-6 py-4 flex justify-between items-center border-b border-white/10 sticky top-0 bg-[#0A0A0B]/80 backdrop-blur z-50">
      <Link href="/" className="flex items-center gap-2 mr-8">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
          <ShieldCheck size={15} />
        </div>
        <span className="font-black text-lg tracking-tight bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          SealVault
        </span>
      </Link>

      <nav className="flex items-center gap-1 flex-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link key={href} href={href}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-violet-600/20 text-violet-300' : 'text-gray-400 hover:text-white hover:bg-white/5',
              )}
            >
              <Icon size={14} />{label}
            </Link>
          );
        })}
      </nav>

      <ConnectButton />
    </header>
  );
}
