'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, TrendingUp, Users, Activity, MessageSquare } from 'lucide-react';
import LineChart from '@/components/LineChart';
import { fetchSectorById } from '@/lib/api';
import type { Sector } from '@/lib/types';

export default function SectorDetailClient() {
  const params = useParams();
  const router = useRouter();
  const [sector, setSector] = useState<Sector | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract ID from dynamic route
  const sectorId = params.id as string | undefined;

  useEffect(() => {
    let isMounted = true;
    if (!sectorId || sectorId === 'placeholder') {
      setSector(null);
      setLoading(false);
      return;
    }

    const loadSector = async () => {
      try {
        setLoading(true);
        const data = await fetchSectorById(sectorId);
        if (isMounted) {
          setSector(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch sector', err);
          setError('Unable to load sector. Please try again later.');
          setSector(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadSector();
    return () => {
      isMounted = false;
    };
  }, [sectorId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-pure-black p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-floral-white/70 font-mono">Loading sector...</p>
        </div>
      </div>
    );
  }

  if (error || !sector) {
    return (
      <div className="min-h-screen bg-pure-black p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-error-red font-mono">{error ?? 'Sector not found'}</p>
        </div>
      </div>
    );
  }

  const formatPrice = (price: number) => price.toFixed(2);

  return (
    <div className="min-h-screen bg-pure-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.push('/sectors')}
          className="mb-6 flex items-center text-floral-white/70 hover:text-floral-white transition-colors font-mono"
        >
          <ChevronLeft className="w-5 h-5 mr-2" />
          Back to Sectors
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-floral-white font-mono mb-2">{sector.name}</h1>
              <p className="text-xl text-floral-white/70 font-mono">{sector.symbol}</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-floral-white mb-1 font-mono">${formatPrice(sector.currentPrice)}</div>
              <div className={`text-lg font-medium font-mono ${
                sector.change >= 0 ? 'text-sage-green' : 'text-error-red'
              }`}>
                {sector.change >= 0 ? '+' : ''}{formatPrice(sector.change)} ({sector.changePercent >= 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center mb-2">
              <Users className="w-5 h-5 text-sage-green mr-2" />
              <span className="text-floral-white/70 font-mono text-sm">Active Agents</span>
            </div>
            <div className="text-3xl font-bold text-floral-white font-mono">{sector.activeAgents}</div>
          </div>

          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center mb-2">
              <TrendingUp className="w-5 h-5 text-sage-green mr-2" />
              <span className="text-floral-white/70 font-mono text-sm">Buy Agents</span>
            </div>
            <div className="text-3xl font-bold text-sage-green font-mono">{sector.buyAgents}</div>
          </div>

          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center mb-2">
              <Activity className="w-5 h-5 text-error-red mr-2" />
              <span className="text-floral-white/70 font-mono text-sm">Sell Agents</span>
            </div>
            <div className="text-3xl font-bold text-error-red font-mono">{sector.sellAgents}</div>
          </div>
        </div>

        {/* Chart */}
        {sector.candleData && sector.candleData.length > 0 && (
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey mb-8">
            <h2 className="text-2xl font-bold text-floral-white mb-4 font-mono">Price Chart</h2>
            <LineChart 
              data={sector.candleData} 
              sectorName={sector.name}
              sectorSymbol={sector.symbol}
            />
          </div>
        )}

        {/* Discussions */}
        {sector.discussions && sector.discussions.length > 0 && (
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center mb-4">
              <MessageSquare className="w-5 h-5 text-sage-green mr-2" />
              <h2 className="text-2xl font-bold text-floral-white font-mono">Discussions</h2>
            </div>
            <div className="space-y-4">
              {sector.discussions.map((discussion) => (
                <div
                  key={discussion.id}
                  onClick={() => router.push(`/discussions?discussion=${discussion.id}`)}
                  className="bg-pure-black rounded-lg p-4 border border-shadow-grey hover:border-sage-green/50 transition-colors cursor-pointer"
                >
                  <h3 className="text-lg font-semibold text-floral-white mb-2 font-mono">{discussion.title}</h3>
                  <p className="text-sm text-floral-white/70 font-mono">
                    {discussion.messages.length} message{discussion.messages.length !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

