'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, TrendingUp, Users, Activity, MessageSquare, BarChart3, HelpCircle, Play, AlertCircle } from 'lucide-react';
import LineChart from '@/components/LineChart';
import { fetchSectorById, simulateTick, updateSectorPerformance, type SimulateTickResult } from '@/lib/api';
import type { Sector } from '@/lib/types';

export default function SectorDetailClient() {
  const params = useParams();
  const router = useRouter();
  const [sector, setSector] = useState<Sector | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulateTickResult | null>(null);

  // Extract ID from dynamic route
  const sectorId = params?.id as string | undefined;

  useEffect(() => {
    let isMounted = true;
    
    // Debug logging
    console.log('SectorDetailClient mounted, sectorId:', sectorId, 'params:', params);
    
    // Handle placeholder or invalid IDs
    if (!sectorId || sectorId === 'placeholder') {
      console.log('Invalid sector ID, redirecting or showing error');
      if (isMounted) {
        setSector(null);
        setLoading(false);
        setError('Invalid sector ID');
      }
      return;
    }

    const loadSector = async () => {
      try {
        if (isMounted) {
          setLoading(true);
          setError(null);
        }
        
        const data = await fetchSectorById(sectorId);
        
        if (isMounted) {
          if (data) {
            setSector(data);
            setError(null);
          } else {
            setError('Sector not found');
            setSector(null);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch sector', err);
          const errorMessage = err instanceof Error ? err.message : 'Unable to load sector. Please try again later.';
          setError(errorMessage);
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
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toLocaleString();
  };

  const utilizationPercent = sector.agents.length > 0 
    ? Math.round((sector.activeAgents / sector.agents.length) * 100) 
    : 0;

  const createdDate = sector.createdAt ? new Date(sector.createdAt).toLocaleDateString('en-US', { 
    month: 'numeric', 
    day: 'numeric', 
    year: 'numeric' 
  }) : 'N/A';

  return (
    <div className="min-h-screen bg-pure-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.push('/sectors')}
          className="mb-6 flex items-center text-sage-green hover:text-sage-green/80 transition-colors font-mono"
        >
          <ChevronLeft className="w-5 h-5 mr-2" />
          BACK TO SECTORS
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-floral-white font-mono">{sector.name.toUpperCase()}</h1>
                <span className="px-3 py-1 bg-sage-green/20 text-sage-green border border-sage-green/50 rounded text-sm font-mono font-semibold">
                  {sector.symbol}
                </span>
              </div>
              <p className="text-sm text-floral-white/60 font-mono">
                Sector ID: {sector.id.toLowerCase()} • Created: {createdDate}
              </p>
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

        {/* Metrics Grid - 4 cards matching the image */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center justify-between mb-2">
              <span className="text-floral-white/70 font-mono text-sm uppercase tracking-wider">VOLUME</span>
              <TrendingUp className="w-5 h-5 text-sage-green" />
            </div>
            <div className="text-3xl font-bold text-floral-white font-mono">{formatVolume(sector.volume)}</div>
          </div>

          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center justify-between mb-2">
              <span className="text-floral-white/70 font-mono text-sm uppercase tracking-wider">TOTAL AGENTS</span>
              <Users className="w-5 h-5 text-sage-green" />
            </div>
            <div className="text-3xl font-bold text-floral-white font-mono">{sector.agents.length}</div>
          </div>

          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center justify-between mb-2">
              <span className="text-floral-white/70 font-mono text-sm uppercase tracking-wider">ACTIVE AGENTS</span>
              <Activity className="w-5 h-5 text-sage-green" />
            </div>
            <div className="text-3xl font-bold text-floral-white font-mono mb-1">{sector.activeAgents}</div>
            <div className="text-sm text-sage-green font-mono">{utilizationPercent}% utilization</div>
          </div>

          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center justify-between mb-2">
              <span className="text-floral-white/70 font-mono text-sm uppercase tracking-wider">DISCUSSIONS</span>
              <MessageSquare className="w-5 h-5 text-sage-green" />
            </div>
            <div className="text-3xl font-bold text-floral-white font-mono">{sector.discussions?.length || 0}</div>
          </div>
        </div>

        {/* Performance Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center justify-between mb-2">
              <span className="text-floral-white/70 font-mono text-sm uppercase tracking-wider">SIMULATED PRICE</span>
              <BarChart3 className="w-5 h-5 text-sage-green" />
            </div>
            <div className="text-3xl font-bold text-floral-white font-mono">
              {sector.lastSimulatedPrice !== null && sector.lastSimulatedPrice !== undefined
                ? `$${formatPrice(sector.lastSimulatedPrice)}`
                : 'N/A'}
            </div>
            {sector.lastSimulatedPrice !== null && sector.lastSimulatedPrice !== undefined && (
              <div className={`text-sm font-mono mt-1 ${
                sector.lastSimulatedPrice >= sector.currentPrice ? 'text-sage-green' : 'text-error-red'
              }`}>
                {sector.lastSimulatedPrice >= sector.currentPrice ? '+' : ''}
                {((sector.lastSimulatedPrice - sector.currentPrice) / sector.currentPrice * 100).toFixed(2)}% vs current
              </div>
            )}
          </div>

          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center justify-between mb-2">
              <span className="text-floral-white/70 font-mono text-sm uppercase tracking-wider">VOLATILITY</span>
              <TrendingUp className="w-5 h-5 text-sage-green" />
            </div>
            <div className="text-3xl font-bold text-floral-white font-mono">
              {sector.volatility !== undefined
                ? `${(sector.volatility * 100).toFixed(2)}%`
                : 'N/A'}
            </div>
            {sector.volatility !== undefined && (
              <div className="text-sm text-floral-white/60 font-mono mt-1">
                Annualized volatility
              </div>
            )}
          </div>

          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center justify-between mb-2">
              <span className="text-floral-white/70 font-mono text-sm uppercase tracking-wider">RISK SCORE</span>
              <AlertCircle className="w-5 h-5 text-sage-green" />
            </div>
            <div className="text-3xl font-bold text-floral-white font-mono">
              {sector.riskScore !== undefined
                ? sector.riskScore
                : 'N/A'}
            </div>
            {sector.riskScore !== undefined && (
              <div className={`text-sm font-mono mt-1 ${
                sector.riskScore >= 70 ? 'text-error-red' : sector.riskScore >= 40 ? 'text-yellow-400' : 'text-sage-green'
              }`}>
                {sector.riskScore >= 70 ? 'High Risk' : sector.riskScore >= 40 ? 'Moderate Risk' : 'Low Risk'}
              </div>
            )}
          </div>
        </div>

        {/* Chart - Always show, even if no data */}
        <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey mb-8">
          <h2 className="text-xl font-bold text-floral-white mb-4 font-mono uppercase tracking-wider">PRICE CHART - LAST 24 HOURS</h2>
          {sector.candleData && sector.candleData.length > 0 ? (
            <LineChart 
              data={sector.candleData} 
              sectorName={sector.name}
              sectorSymbol={sector.symbol}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-floral-white/60 font-mono">
              No chart data available
            </div>
          )}
        </div>

        {/* SECTOR AGENTS Table - Always show */}
        <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey mb-8">
          <h2 className="text-xl font-bold text-floral-white font-mono mb-4">SECTOR AGENTS ({sector.agents?.length || 0})</h2>
          {sector.agents && sector.agents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-ink-500/30">
                    <th className="px-4 py-3 text-left text-floral-white/70 font-mono text-sm font-semibold">AGENT ID</th>
                    <th className="px-4 py-3 text-left text-floral-white/70 font-mono text-sm font-semibold">ROLE</th>
                    <th className="px-4 py-3 text-center text-floral-white/70 font-mono text-sm font-semibold">STATUS</th>
                    <th className="px-4 py-3 text-right text-floral-white/70 font-mono text-sm font-semibold">PERFORMANCE</th>
                    <th className="px-4 py-3 text-right text-floral-white/70 font-mono text-sm font-semibold">TRADES</th>
                    <th className="px-4 py-3 text-left text-floral-white/70 font-mono text-sm font-semibold">RISK</th>
                    <th className="px-4 py-3 text-left text-floral-white/70 font-mono text-sm font-semibold">STYLE</th>
                  </tr>
                </thead>
                <tbody>
                  {sector.agents.map((agent, index) => {
                    const statusColors = {
                      active: 'bg-sage-green/20 text-sage-green border-sage-green/50',
                      idle: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
                      processing: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
                    };
                    const statusColor = statusColors[agent.status as keyof typeof statusColors] || statusColors.idle;
                    
                    // Capitalize risk tolerance and decision style
                    const riskTolerance = agent.personality?.riskTolerance 
                      ? agent.personality.riskTolerance.charAt(0).toUpperCase() + agent.personality.riskTolerance.slice(1).toLowerCase()
                      : 'Unknown';
                    const decisionStyle = agent.personality?.decisionStyle
                      ? agent.personality.decisionStyle.charAt(0).toUpperCase() + agent.personality.decisionStyle.slice(1).toLowerCase()
                      : 'Unknown';
                    
                    return (
                      <tr
                        key={agent.id}
                        className={`border-b border-ink-500/20 hover:bg-shadow-grey/40 cursor-pointer transition-colors`}
                        onClick={() => router.push(`/agents?agent=${agent.id}`)}
                      >
                        <td className="px-4 py-3 text-floral-white font-mono text-sm">
                          {agent.id}
                        </td>
                        <td className="px-4 py-3 text-floral-white/85 font-mono text-sm">
                          {agent.role}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-mono uppercase tracking-wider ${statusColor}`}>
                            {agent.status}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-sm font-semibold ${
                          agent.performance >= 0 ? 'text-sage-green' : 'text-error-red'
                        }`}>
                          {agent.performance >= 0 ? '+' : ''}{agent.performance.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right text-floral-white font-mono text-sm">
                          {agent.trades}
                        </td>
                        <td className="px-4 py-3 text-floral-white/80 font-mono text-sm">
                          {riskTolerance}
                        </td>
                        <td className="px-4 py-3 text-floral-white/80 font-mono text-sm">
                          {decisionStyle}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-floral-white/60 font-mono">
              No agents in this sector
            </div>
          )}
        </div>

        {/* SECTOR DISCUSSIONS - Always show */}
        <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey mb-8">
          <h2 className="text-xl font-bold text-floral-white font-mono mb-4">SECTOR DISCUSSIONS ({sector.discussions?.length || 0})</h2>
          {sector.discussions && sector.discussions.length > 0 ? (
            <div className="space-y-3">
              {sector.discussions.map((discussion) => {
                const statusColors = {
                  in_progress: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
                  accepted: 'bg-sage-green/20 text-sage-green border-sage-green/50',
                  rejected: 'bg-error-red/20 text-error-red border-error-red/50',
                  archived: 'bg-floral-white/10 text-floral-white/50 border-floral-white/30',
                };
                const statusColor = statusColors[discussion.status as keyof typeof statusColors] || statusColors.in_progress;
                
                // Format updated date
                const updatedDate = new Date(discussion.updatedAt);
                const now = new Date();
                const diffMs = now.getTime() - updatedDate.getTime();
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                let timeAgo = '';
                if (diffDays > 0) {
                  timeAgo = `${diffDays}d ago`;
                } else if (diffHours > 0) {
                  timeAgo = `${diffHours}h ago`;
                } else {
                  timeAgo = 'Just now';
                }
                
                return (
                  <div
                    key={discussion.id}
                    onClick={() => router.push(`/discussions?discussion=${discussion.id}`)}
                    className="flex items-center justify-between p-4 border-b border-ink-500/20 hover:bg-shadow-grey/40 transition-colors cursor-pointer"
                  >
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-floral-white mb-1 font-mono">{discussion.title}</h3>
                      <div className="flex items-center gap-3 text-xs text-floral-white/60 font-mono">
                        <span className={`px-2 py-1 rounded text-xs uppercase tracking-wider ${statusColor}`}>
                          {discussion.status === 'in_progress' ? 'CREATED' : discussion.status.toUpperCase()}
                        </span>
                        <span>Updated {timeAgo}</span>
                        <span>{discussion.agentIds?.length || 0} participants</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-floral-white/60 font-mono">
              No discussions in this sector
            </div>
          )}
        </div>

        {/* SIMULATION Section */}
        <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-floral-white font-mono">SIMULATION</h2>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!sectorId || simulating) return;
                  setSimulating(true);
                  setError(null);
                  try {
                    // Update performance metrics
                    const updatedSector = await updateSectorPerformance(sectorId);
                    setSector(updatedSector);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to update performance');
                  } finally {
                    setSimulating(false);
                  }
                }}
                disabled={simulating || !sectorId}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-floral-white font-mono font-semibold rounded transition-colors flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                {simulating ? 'Updating...' : 'Update Performance'}
              </button>
              <button
                onClick={async () => {
                  if (!sectorId || simulating) return;
                  setSimulating(true);
                  setError(null);
                  try {
                    const result = await simulateTick(sectorId, []);
                    setSimulationResult(result);
                    // Reload sector data to show updated price
                    const updatedSector = await fetchSectorById(sectorId);
                    if (updatedSector) {
                      setSector(updatedSector);
                    }
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to run simulation');
                  } finally {
                    setSimulating(false);
                  }
                }}
                disabled={simulating || !sectorId}
                className="px-4 py-2 bg-sage-green hover:bg-sage-green/80 disabled:bg-sage-green/50 disabled:cursor-not-allowed text-pure-black font-mono font-semibold rounded transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                {simulating ? 'Running...' : 'Run Simulation Tick'}
              </button>
            </div>
          </div>

          {simulationResult && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-pure-black/50 rounded p-4 border border-ink-500/30">
                  <div className="text-floral-white/70 font-mono text-xs uppercase tracking-wider mb-1">Last Price</div>
                  <div className="text-2xl font-bold text-floral-white font-mono">
                    ${simulationResult.newPrice.toFixed(2)}
                  </div>
                  <div className={`text-sm font-mono mt-1 ${
                    simulationResult.priceChange >= 0 ? 'text-sage-green' : 'text-error-red'
                  }`}>
                    {simulationResult.priceChange >= 0 ? '+' : ''}
                    {simulationResult.priceChange.toFixed(2)} ({simulationResult.priceChangePercent >= 0 ? '+' : ''}
                    {simulationResult.priceChangePercent.toFixed(2)}%)
                  </div>
                </div>

                <div className="bg-pure-black/50 rounded p-4 border border-ink-500/30">
                  <div className="text-floral-white/70 font-mono text-xs uppercase tracking-wider mb-1">Risk Score</div>
                  <div className="text-2xl font-bold text-floral-white font-mono">
                    {simulationResult.riskScore}
                  </div>
                  <div className="text-xs text-floral-white/60 font-mono mt-1">0-100 scale</div>
                </div>

                <div className="bg-pure-black/50 rounded p-4 border border-ink-500/30">
                  <div className="text-floral-white/70 font-mono text-xs uppercase tracking-wider mb-1">Trades Executed</div>
                  <div className="text-2xl font-bold text-floral-white font-mono">
                    {simulationResult.executedTrades.length}
                  </div>
                  {simulationResult.rejectedTrades.length > 0 && (
                    <div className="text-xs text-error-red font-mono mt-1">
                      {simulationResult.rejectedTrades.length} rejected
                    </div>
                  )}
                </div>
              </div>

              {simulationResult.lastTrade && (
                <div className="bg-pure-black/50 rounded p-4 border border-ink-500/30">
                  <div className="text-floral-white/70 font-mono text-xs uppercase tracking-wider mb-2">Last Simulated Trade</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-floral-white font-mono text-sm">
                        Price: <span className="text-sage-green">${simulationResult.lastTrade.price.toFixed(2)}</span>
                      </div>
                      <div className="text-floral-white/80 font-mono text-sm mt-1">
                        Quantity: {simulationResult.lastTrade.quantity}
                      </div>
                    </div>
                    <div className="text-floral-white/60 font-mono text-xs">
                      {new Date(simulationResult.lastTrade.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              )}

              {simulationResult.rejectedTrades.length > 0 && (
                <div className="bg-error-red/10 border border-error-red/30 rounded p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-error-red" />
                    <div className="text-error-red font-mono text-sm font-semibold">Rejected Trades</div>
                  </div>
                  <div className="space-y-1">
                    {simulationResult.rejectedTrades.slice(0, 3).map((rejected, idx) => (
                      <div key={idx} className="text-floral-white/70 font-mono text-xs">
                        {rejected.error || 'Validation failed'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!simulationResult && (
            <p className="text-sm text-floral-white/60 font-mono">
              Click "Run Simulation Tick" to simulate one time step of price movement and trade execution.
            </p>
          )}
        </div>

        {/* MANAGER AGENT Section */}
        <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-floral-white font-mono mb-2">MANAGER AGENT</h2>
              <p className="text-sm text-floral-white/60 font-mono">Manager Agent functionality coming soon...</p>
            </div>
            <HelpCircle className="w-6 h-6 text-floral-white/40" />
          </div>
        </div>
      </div>
    </div>
  );
}

