'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSystemMode, setSystemMode, type SystemMode } from '@/lib/api';

export default function Navbar() {
  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState('');
  const [simulationMode, setSimulationMode] = useState<SystemMode>('simulation');
  const [isToggling, setIsToggling] = useState(false);

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

  // Load system mode on mount
  useEffect(() => {
    const loadMode = async () => {
      try {
        const mode = await getSystemMode();
        setSimulationMode(mode);
      } catch (error) {
        console.error('Failed to load system mode:', error);
      }
    };
    loadMode();
  }, []);

  const handleToggleMode = async () => {
    if (isToggling) return;
    
    setIsToggling(true);
    try {
      const newMode: SystemMode = simulationMode === 'simulation' ? 'realtime' : 'simulation';
      await setSystemMode(newMode);
      setSimulationMode(newMode);
    } catch (error) {
      console.error('Failed to toggle system mode:', error);
    } finally {
      setIsToggling(false);
    }
  };

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
          <div className="flex items-center gap-6 text-floral-white">
            {/* Simulation Mode Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono uppercase tracking-wider text-floral-white/60">
                Simulation Mode:
              </span>
              <button
                onClick={handleToggleMode}
                disabled={isToggling}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sage-green focus:ring-offset-2 focus:ring-offset-pure-black ${
                  simulationMode === 'simulation' ? 'bg-sage-green' : 'bg-ink-500'
                } ${isToggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                aria-label={`Toggle simulation mode (currently ${simulationMode})`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-pure-black transition-transform ${
                    simulationMode === 'simulation' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-xs font-mono font-semibold min-w-[60px]">
                {simulationMode === 'simulation' ? 'ON' : 'OFF'}
              </span>
            </div>
            
            {/* Clock */}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-mono">{currentTime}</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

