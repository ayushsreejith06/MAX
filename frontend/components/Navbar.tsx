'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      setCurrentTime(
        `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${ampm}`
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { href: '/', label: 'DASHBOARD' },
    { href: '/sectors', label: 'SECTORS' },
    { href: '/agents', label: 'AGENTS' },
    { href: '/discussions', label: 'DISCUSSIONS' },
    { href: '/contract-activity', label: 'ON-CHAIN' },
  ];

  return (
    <nav className="bg-pure-black border-b border-shadow-grey">
      <div className="max-w-[1920px] mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="group flex items-center gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-ink-500 px-4 py-2 transition-colors group-hover:border-floral-white">
                <div className="flex flex-col gap-1">
                  <span className="block h-[2px] w-6 bg-floral-white"></span>
                  <span className="block h-[2px] w-6 bg-floral-white/70"></span>
                  <span className="block h-[2px] w-6 bg-floral-white/40"></span>
                </div>
                <div className="text-sm font-mono tracking-[0.6em] text-floral-white">
                  MAX
                </div>
              </div>
              <span className="text-xs font-mono uppercase tracking-[0.4em] text-floral-white/60">
                SIGNAL
              </span>
            </Link>
            <div className="flex gap-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-semibold uppercase tracking-wide transition-colors font-mono ${
                    pathname === item.href || 
                    (item.href === '/sectors' && pathname?.startsWith('/sectors')) ||
                    (item.href === '/contract-activity' && pathname?.startsWith('/contract-activity'))
                      ? 'text-sage-green border-b-2 border-sage-green pb-1'
                      : 'text-floral-white hover:text-sage-green/80'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-floral-white">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-mono">{currentTime}</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

