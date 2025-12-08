'use client';

import React, { useEffect, useState, useCallback, useRef, memo, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, TrendingUp, Users, Activity, MessageSquare, BarChart3, Play, AlertCircle, DollarSign, Plus, Trash2 } from 'lucide-react';
import LineChart from '@/components/LineChart';
import { CreateAgentModal } from '@/components/CreateAgentModal';
import { fetchSectorById, simulateTick, depositSector, deleteAgent, deleteSector, runConfidenceTick, type SimulateTickResult, type ConfidenceTickResult } from '@/lib/api';
import type { Sector, Agent } from '@/lib/types';
import { PollingManager } from '@/utils/PollingManager';

export default function SectorDetailClient() {
  const params = useParams();
  const router = useRouter();
  const [sector, setSector] = useState<Sector | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulateTickResult | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [deletingSector, setDeletingSector] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmationCode, setDeleteConfirmationCode] = useState('');
  const [performance, setPerformance] = useState<{
    startingCapital: number;
    currentCapital: number;
    pnl: number;
    recentTrades: any[];
  } | null>(null);
  const [runningConfidenceTick, setRunningConfidenceTick] = useState(false);
  const [agentConfidences, setAgentConfidences] = useState<Map<string, number>>(new Map());
  const runningConfidenceTickRef = useRef(false);

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

  // Auto-poll simulation performance using centralized polling
  const loadPerformance = useCallback(async () => {
    if (!sectorId) return;
    
    try {
      const { getApiBaseUrl } = await import('@/lib/desktopEnv');
      const apiBase = typeof window !== 'undefined' 
        ? getApiBaseUrl()
        : '/api';
      const res = await fetch(`${apiBase}/simulation/performance?sectorId=${sectorId}`);
      if (res.ok) {
        const data = await res.json();
        setPerformance(data);
      }
    } catch (err) {
      console.error('Failed to load simulation performance:', err);
    }
  }, [sectorId]);

  // Use global PollingManager for performance polling
  useEffect(() => {
    if (!sectorId) return;
    PollingManager.register(`sector-performance-${sectorId}`, loadPerformance, 2500);
    return () => {
      PollingManager.unregister(`sector-performance-${sectorId}`);
    };
  }, [sectorId, loadPerformance]);

  // Auto-update confidence levels using centralized polling
  // Only update confidence map, not full sector reload to prevent flickering
  const runAutoConfidenceTick = useCallback(async () => {
    if (!sectorId) return;
    
    // Skip if a confidence tick is already running
    if (runningConfidenceTickRef.current) return;

    try {
      runningConfidenceTickRef.current = true;
      setRunningConfidenceTick(true);
      const result = await runConfidenceTick(String(sectorId));
      
      // Update agent confidences map only (don't reload full sector to prevent flicker)
      setAgentConfidences(prev => {
        const newConfidences = new Map(prev);
        let hasChanges = false;
        result.agents.forEach(agent => {
          const oldConfidence = prev.get(agent.id);
          if (oldConfidence !== agent.confidence) {
            newConfidences.set(agent.id, agent.confidence);
            hasChanges = true;
          }
        });
        // Only return new map if there were actual changes
        return hasChanges ? newConfidences : prev;
      });
      
      // Only reload sector if there were significant changes (debounced)
      // This prevents constant re-renders
    } catch (err) {
      console.error('Auto confidence tick error:', err);
      // Don't show error to user for auto-updates, just log it
    } finally {
      runningConfidenceTickRef.current = false;
      setRunningConfidenceTick(false);
    }
  }, [sectorId]);

  // Use global PollingManager for confidence tick polling
  useEffect(() => {
    if (!sectorId) return;
    PollingManager.register(`sector-confidence-${sectorId}`, runAutoConfidenceTick, 2500);
    return () => {
      PollingManager.unregister(`sector-confidence-${sectorId}`);
    };
  }, [sectorId, runAutoConfidenceTick]);

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

  const reloadSector = async () => {
    if (!sector?.id) return;
    try {
      setIsRefreshing(true);
      const fresh = await fetchSectorById(sector.id);
      if (fresh) {
        setSector(fresh);
      }
    } catch (error) {
      console.error('Failed to reload sector', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    // Check if it's a manager agent
    const agent = sector?.agents.find(a => a.id === agentId);
    if (agent && (agent.role === 'manager' || agent.role?.toLowerCase().includes('manager'))) {
      alert('Manager agents cannot be deleted');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${agentName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingAgentId(agentId);
      await deleteAgent(agentId);
      
      // Reload sector to refresh the agents list
      await reloadSector();
    } catch (error: any) {
      console.error('Failed to delete agent', error);
      const errorMessage = error?.message || 'Failed to delete agent';
      if (errorMessage.includes('Manager agents cannot be deleted')) {
        alert('Manager agents cannot be deleted');
      } else {
        alert(`Failed to delete agent: ${errorMessage}`);
      }
    } finally {
      setDeletingAgentId(null);
    }
  };

  const isManagerAgent = (agent: Agent) => {
    return agent.role === 'manager' || agent.role?.toLowerCase().includes('manager');
  };

  const handleDeleteSector = () => {
    if (!sector) return;
    
    // First confirmation
    if (!confirm(`Are you sure you want to delete "${sector.name}"? This action cannot be undone and will withdraw all balance ($${(sector.balance || 0).toFixed(2)}) to your account.`)) {
      return;
    }

    // Show second confirmation with code input
    setShowDeleteConfirm(true);
    setDeleteConfirmationCode('');
  };

  const confirmDeleteSector = async () => {
    if (!sector) return;

    // Verify confirmation code matches sector name
    if (deleteConfirmationCode.trim().toLowerCase() !== sector.name.toLowerCase()) {
      alert('Confirmation code does not match. Please enter the exact sector name.');
      return;
    }

    try {
      setDeletingSector(true);
      const result = await deleteSector(sector.id, deleteConfirmationCode);
      
      // Show success message with withdrawn balance
      const balanceMsg = result.withdrawnBalance && result.withdrawnBalance > 0
        ? ` Balance of $${result.withdrawnBalance.toFixed(2)} has been withdrawn to your account.`
        : '';
      alert(`Sector deleted successfully.${balanceMsg}`);
      
      // Navigate back to sectors page
      router.push('/sectors');
    } catch (error: any) {
      console.error('Failed to delete sector', error);
      const errorMessage = error?.message || 'Failed to delete sector';
      if (errorMessage.includes('Invalid confirmation code')) {
        alert('Invalid confirmation code. Please enter the exact sector name.');
      } else {
        alert(`Failed to delete sector: ${errorMessage}`);
      }
    } finally {
      setDeletingSector(false);
    }
  };

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
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl font-bold text-floral-white font-mono">{sector.name.toUpperCase()}</h1>
                <span className="px-3 py-1 bg-sage-green/20 text-sage-green border border-sage-green/50 rounded text-sm font-mono font-semibold">
                  {sector.symbol || 'N/A'}
                </span>
                <button
                  onClick={handleDeleteSector}
                  disabled={deletingSector}
                  className="px-4 py-1 bg-error-red/20 text-error-red border border-error-red/50 rounded text-sm font-mono font-semibold uppercase tracking-wider hover:bg-error-red/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete sector"
                >
                  DELETE
                </button>
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

        {/* Metrics Grid - 5 cards including balance */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey">
            <div className="flex items-center justify-between mb-2">
              <span className="text-floral-white/70 font-mono text-sm uppercase tracking-wider">BALANCE</span>
              <DollarSign className="w-5 h-5 text-sage-green" />
            </div>
            <div className="text-3xl font-bold text-floral-white font-mono mb-4">
              ${formatPrice(sector.balance || 0)}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Deposit form submitted', { sectorId, depositAmount });
                if (!sectorId || !depositAmount || isNaN(parseFloat(depositAmount)) || parseFloat(depositAmount) <= 0) {
                  console.log('Validation failed');
                  return;
                }
                setDepositing(true);
                setError(null);
                try {
                  console.log('Calling depositSector API...', { sectorId, amount: parseFloat(depositAmount) });
                  const updatedSector = await depositSector(String(sectorId), parseFloat(depositAmount));
                  console.log('Deposit successful', updatedSector);
                  setSector(updatedSector);
                  setDepositAmount('');
                } catch (err: any) {
                  console.error('Deposit error:', err);
                  const errorMessage = err?.message || 'Failed to deposit funds';
                  setError(errorMessage);
                  // Don't navigate on error - just show the error message
                  alert(`Deposit failed: ${errorMessage}`);
                } finally {
                  setDepositing(false);
                }
              }}
              className="space-y-2"
            >
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-pure-black border border-ink-500/30 rounded text-floral-white font-mono text-sm focus:outline-none focus:border-sage-green"
                disabled={depositing}
              />
              <button
                type="submit"
                disabled={depositing || !depositAmount || isNaN(parseFloat(depositAmount)) || parseFloat(depositAmount) <= 0}
                className="w-full px-3 py-2 bg-sage-green hover:bg-sage-green/80 disabled:bg-sage-green/50 disabled:cursor-not-allowed text-pure-black font-mono text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" />
                {depositing ? 'Depositing...' : 'Deposit'}
              </button>
            </form>
          </div>

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
                sector.riskScore >= 70 ? 'text-error-red' : sector.riskScore >= 40 ? 'text-warning-amber' : 'text-sage-green'
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
              sectorSymbol={sector.symbol || 'N/A'}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-floral-white/60 font-mono">
              No chart data available
            </div>
          )}
        </div>

        {/* SECTOR AGENTS Table - Always show */}
        <div className="bg-shadow-grey rounded-lg p-6 border border-shadow-grey mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.35em] text-ink-400">
              SECTOR AGENTS ({sector.agents?.length || 0})
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="rounded-2xl bg-sage-green px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-pure-black hover:bg-sage-green/90"
            >
              Create Agent
            </button>
          </div>
          {sector.agents && sector.agents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-ink-500/30">
                    <th className="px-4 py-3 text-left text-floral-white/70 font-mono text-sm font-semibold">AGENT NAME</th>
                    <th className="px-4 py-3 text-left text-floral-white/70 font-mono text-sm font-semibold">ROLE</th>
                    <th className="px-4 py-3 text-center text-floral-white/70 font-mono text-sm font-semibold">STATUS</th>
                    <th className="px-4 py-3 text-right text-floral-white/70 font-mono text-sm font-semibold">PERFORMANCE</th>
                    <th className="px-4 py-3 text-right text-floral-white/70 font-mono text-sm font-semibold">TRADES</th>
                    <th className="px-4 py-3 text-right text-floral-white/70 font-mono text-sm font-semibold">CONFIDENCE</th>
                    <th className="px-4 py-3 text-left text-floral-white/70 font-mono text-sm font-semibold">RISK</th>
                    <th className="px-4 py-3 text-left text-floral-white/70 font-mono text-sm font-semibold">STYLE</th>
                    <th className="px-4 py-3 text-center text-floral-white/70 font-mono text-sm font-semibold">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {sector.agents.map((agent, index) => {
                    const statusColors = {
                      active: 'bg-sage-green/20 text-sage-green border-sage-green/50',
                      idle: 'bg-warning-amber/20 text-warning-amber border-warning-amber/50',
                      processing: 'bg-sky-blue/20 text-sky-blue border-sky-blue/50',
                    };
                    const statusColor = statusColors[agent.status as keyof typeof statusColors] || statusColors.idle;
                    
                    // Capitalize risk tolerance and decision style
                    const riskTolerance = agent.personality?.riskTolerance 
                      ? agent.personality.riskTolerance.charAt(0).toUpperCase() + agent.personality.riskTolerance.slice(1).toLowerCase()
                      : 'Unknown';
                    const decisionStyle = agent.personality?.decisionStyle
                      ? agent.personality.decisionStyle.charAt(0).toUpperCase() + agent.personality.decisionStyle.slice(1).toLowerCase()
                      : 'Unknown';
                    
                    // Get confidence value (use updated value from confidence tick if available)
                    const agentConfidence = agentConfidences.has(agent.id) 
                      ? agentConfidences.get(agent.id)! 
                      : (typeof agent.confidence === 'number' ? agent.confidence : 0);
                    
                    // Highlight agents with confidence >= 65
                    const isHighConfidence = agentConfidence >= 65;
                    
                    return (
                      <tr
                        key={agent.id}
                        className={`border-b border-ink-500/20 hover:bg-shadow-grey/40 cursor-pointer transition-colors ${
                          isHighConfidence ? 'bg-sage-green/10 border-sage-green/30' : ''
                        }`}
                        onClick={() => router.push(`/agents?agent=${agent.id}`)}
                      >
                        <td className="px-4 py-3 text-floral-white font-mono text-sm">
                          {agent.name || agent.id}
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
                          (() => {
                            const perf = typeof agent.performance === 'number' 
                              ? agent.performance 
                              : (agent.rawPerformance?.pnl ?? 0);
                            return perf >= 0 ? 'text-sage-green' : 'text-error-red';
                          })()
                        }`}>
                          {(() => {
                            const perf = typeof agent.performance === 'number' 
                              ? agent.performance 
                              : (agent.rawPerformance?.pnl ?? 0);
                            return (perf >= 0 ? '+' : '') + perf.toFixed(2) + '%';
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right text-floral-white font-mono text-sm">
                          {Array.isArray(agent.trades) ? agent.trades.length : (agent.trades || 0)}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-sm font-semibold ${
                          agentConfidence >= 65 ? 'text-sage-green' :
                          agentConfidence >= 50 ? 'text-sage-green' : 
                          agentConfidence >= 0 ? 'text-warning-amber' : 'text-error-red'
                        }`}>
                          {agentConfidence.toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-floral-white/80 font-mono text-sm">
                          {riskTolerance}
                        </td>
                        <td className="px-4 py-3 text-floral-white/80 font-mono text-sm">
                          {decisionStyle}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!isManagerAgent(agent) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAgent(agent.id, agent.name || agent.id);
                              }}
                              disabled={deletingAgentId === agent.id}
                              className="p-2 text-error-red hover:bg-error-red/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete agent"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
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
                  in_progress: 'bg-warning-amber/20 text-warning-amber border-warning-amber/50',
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
                    const result = await simulateTick(String(sectorId), []);
                    setSimulationResult(result);
                    // Reload sector data to show updated price
                    const updatedSector = await fetchSectorById(String(sectorId));
                    if (updatedSector) {
                      setSector(updatedSector);
                    }
                  } catch (err: any) {
                    console.error('Simulation tick error:', err);
                    const errorMessage = err?.message || 'Failed to run simulation';
                    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                      setError(`Sector not found. Please ensure the sector ID is correct.`);
                    } else if (errorMessage.includes('400') || errorMessage.includes('bad request')) {
                      setError(`Invalid request. Please check the sector data.`);
                    } else {
                      setError(errorMessage);
                    }
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

          {/* Auto-updating Performance Display */}
          <section className="mt-10 rounded-2xl border border-ink-500/40 p-6 bg-pure-black/40">
            <h2 className="text-xl font-semibold tracking-widest text-floral-white mb-4">
              SIMULATION PERFORMANCE
            </h2>

            {performance ? (
              <div className="space-y-3 text-floral-white/90 text-sm">
                <p>Starting Capital: <span className="text-sage-green">${performance.startingCapital.toFixed(2)}</span></p>
                <p>Current Capital: <span className="text-sage-green">${performance.currentCapital.toFixed(2)}</span></p>
                <p>Total P/L: <span className={performance.pnl >= 0 ? "text-sage-green" : "text-red-500"}>${performance.pnl.toFixed(2)}</span></p>
                <p>Recent Trades: {performance.recentTrades?.length || 0}</p>
              </div>
            ) : (
              <p className="text-ink-500">Simulation not started.</p>
            )}
          </section>

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

        <CreateAgentModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          preselectedSectorId={sector?.id}
          onSuccess={async () => {
            setShowCreateModal(false);
            await reloadSector();
          }}
        />

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && sector && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-shadow-grey rounded-lg p-6 border border-ink-500 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-floral-white mb-4 font-mono uppercase">Confirm Deletion</h2>
              <p className="text-floral-white/70 mb-4 font-mono">
                To confirm deletion of <span className="font-bold text-floral-white">"{sector.name}"</span>, please enter the exact sector name below.
              </p>
              <p className="text-warning-amber text-sm mb-2 font-mono">
                ⚠️ This will delete the sector and all its agents.
              </p>
              <p className="text-sage-green text-sm mb-4 font-mono">
                💰 Balance of ${(sector.balance || 0).toFixed(2)} will be withdrawn to your account.
              </p>
              <input
                type="text"
                value={deleteConfirmationCode}
                onChange={(e) => setDeleteConfirmationCode(e.target.value)}
                placeholder="Enter sector name to confirm"
                className="w-full rounded-lg border border-ink-500 bg-ink-600/70 px-4 py-2 text-floral-white font-mono focus:outline-none focus:border-error-red focus:ring-1 focus:ring-error-red mb-4"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={confirmDeleteSector}
                  disabled={deletingSector || !deleteConfirmationCode.trim()}
                  className="flex-1 rounded-full bg-error-red px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-pure-black hover:bg-error-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deletingSector ? 'Deleting...' : 'Delete Sector'}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmationCode('');
                  }}
                  disabled={deletingSector}
                  className="flex-1 rounded-full border border-ink-500 px-5 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-floral-white hover:border-sage-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

