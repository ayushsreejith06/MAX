'use client';

import { useMemo, useState, useEffect } from 'react';
import { Activity, Filter, Search, Target, UsersRound, Zap } from 'lucide-react';
import { fetchAgents, fetchSectors } from '@/lib/api';
import type { Agent, Sector } from '@/lib/types';
import { CreateAgentModal } from '@/components/CreateAgentModal';

type AgentWithSector = Agent & {
  sectorSymbol: string;
  sectorName: string;
};

const statusFilters: Array<{ id: 'all' | Agent['status']; label: string; accent?: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Live', accent: 'text-sage-green' },
  { id: 'processing', label: 'Processing', accent: 'text-warning-amber' },
  { id: 'idle', label: 'Idle', accent: 'text-floral-white/70' },
];

const statusPills: Record<Agent['status'], string> = {
  active: 'bg-sage-green/15 text-sage-green border border-sage-green/40',
  processing: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40',
  idle: 'bg-muted-text/10 text-floral-white border border-muted-text/20',
};

export default function Agents() {
  const [agents, setAgents] = useState<AgentWithSector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]['id']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const [sectorData, agentData] = await Promise.all([
        fetchSectors(),
        fetchAgents(),
      ]);

      const sectorMap = new Map<string, Sector>(
        (sectorData as Sector[]).map(sector => [sector.id, sector]),
      );

      const enrichedAgents: AgentWithSector[] = (agentData as Agent[]).map(agent => {
        const sector = agent.sectorId ? sectorMap.get(agent.sectorId) : undefined;
        return {
          ...agent,
          sectorSymbol: sector?.symbol ?? '—',
          sectorName: sector?.name ?? 'Unknown',
        };
      });

      setAgents(enrichedAgents);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch agents', err);
      setError('Unable to load agents. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAgents();
  }, []);

  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
      const matchesSearch =
        !searchQuery ||
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.sectorSymbol.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [agents, searchQuery, statusFilter]);

  useEffect(() => {
    if (!filteredAgents.length) {
      setSelectedAgentId(null);
      return;
    }
    if (selectedAgentId && filteredAgents.some(agent => agent.id === selectedAgentId)) {
      return;
    }
    setSelectedAgentId(filteredAgents[0].id);
  }, [filteredAgents, selectedAgentId]);

  const heroStats = useMemo(() => {
    const total = agents.length;
    const live = agents.filter(agent => agent.status === 'active').length;
    const processingAgents = agents.filter(agent => agent.status === 'processing').length;
    const readiness = total ? Math.round((live / total) * 100) : 0;
    const avgPerformance = total
      ? (agents.reduce((sum, agent) => sum + agent.performance, 0) / total).toFixed(2)
      : '0.00';
    return {
      total,
      live,
      processing: processingAgents,
      readiness,
      avgPerformance,
    };
  }, [agents]);

  const missionWaves = [
    { label: 'Intraday Alpha', eta: '04m', delta: '+0.82%' },
    { label: 'Volatility Sweep', eta: '12m', delta: '+0.45%' },
    { label: 'Macro Risk Patch', eta: '27m', delta: '-0.12%' },
  ];

  const selectedAgent = filteredAgents.find(agent => agent.id === selectedAgentId) ?? null;

  if (loading) {
    return (
      <div className="min-h-screen bg-pure-black px-8 py-10">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-8">
          <p className="text-floral-white/70 font-mono">Loading agents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-pure-black px-8 py-10">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-8">
          <p className="text-error-red font-mono">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pure-black px-8 py-10">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="relative overflow-hidden rounded-3xl border border-ink-500 bg-gradient-to-br from-sage-green/10 via-card-bg to-pure-black p-8 shadow-[0_25px_60px_rgba(0,0,0,0.55)] xl:col-span-2">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[0.6rem] font-mono uppercase tracking-[0.5em] text-floral-white/60">Agent Mission Control</p>
                <h1 className="mt-3 text-3xl font-black uppercase tracking-[0.35em] text-floral-white">
                  Hyper-Alignment Desk
                </h1>
                <p className="mt-4 text-base text-floral-white/70">
                  Inspired by the latest MAX brokerage explorations, this command surface arranges every agent by mission state,
                  readiness, and current signal strength so you can task the right swarm instantly.
                </p>
              </div>
              <div className="flex gap-3">
                <button className="rounded-2xl border border-sage-green/40 bg-transparent px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-sage-green transition-colors hover:border-sage-green">
                  Deploy Brief
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="rounded-2xl bg-sage-green px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-pure-black hover:bg-sage-green/90"
                >
                  Spin New Agent
                </button>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-ink-500/80 bg-pure-black/40 p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.4em] text-floral-white/60">Live</p>
                <p className="mt-2 text-3xl font-bold text-floral-white">{heroStats.live}</p>
                <p className="text-xs text-floral-white/60">Operating agents</p>
              </div>
              <div className="rounded-2xl border border-ink-500/80 bg-pure-black/40 p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.4em] text-floral-white/60">Processing</p>
                <p className="mt-2 text-3xl font-bold text-warning-amber">{heroStats.processing}</p>
                <p className="text-xs text-floral-white/60">Active recalibrations</p>
              </div>
              <div className="rounded-2xl border border-ink-500/80 bg-pure-black/40 p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.4em] text-floral-white/60">Readiness</p>
                <p className="mt-2 text-3xl font-bold text-sage-green">{heroStats.readiness}%</p>
                <p className="text-xs text-floral-white/60">Deployable capacity</p>
              </div>
              <div className="rounded-2xl border border-ink-500/80 bg-pure-black/40 p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.4em] text-floral-white/60">P&L Delta</p>
                <p className="mt-2 text-3xl font-bold text-sage-green">{heroStats.avgPerformance}%</p>
                <p className="text-xs text-floral-white/60">Avg session gain</p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {missionWaves.map(mission => (
                <div key={mission.label} className="flex flex-1 min-w-[180px] items-center justify-between rounded-2xl border border-ink-500/60 bg-pure-black/40 px-4 py-3 text-sm text-floral-white/80">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-floral-white/50">{mission.label}</p>
                    <p className="text-base font-semibold text-floral-white">{mission.delta}</p>
                  </div>
                  <span className="text-xs font-mono text-floral-white/60">{mission.eta}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-ink-500 bg-card-bg/80 p-6">
            <p className="text-[0.6rem] uppercase tracking-[0.4em] text-floral-white/60">Swarm Summary</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-floral-white/70">Total agents</p>
                  <p className="text-2xl font-bold text-floral-white">{heroStats.total}</p>
                </div>
                <UsersRound className="h-8 w-8 text-sage-green" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-floral-white/70">Live utilization</p>
                  <p className="text-2xl font-bold text-sage-green">{heroStats.readiness}%</p>
                </div>
                <Activity className="h-8 w-8 text-warning-amber" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-floral-white/70">Mission focus</p>
                  <p className="text-2xl font-bold text-floral-white">Tech • Macro • Risk</p>
                </div>
                <Target className="h-8 w-8 text-sky-blue" />
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-ink-500 bg-pure-black/60 p-4">
              <p className="text-xs uppercase tracking-[0.4em] text-floral-white/50">Next actions</p>
              <ul className="mt-3 space-y-2 text-sm text-floral-white/80">
                <li>• Rebalance ENRG desk coverage</li>
                <li>• Spin macro hedger for HLTH volatility</li>
                <li>• Approve T+1 automation pilot</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-ink-500 bg-card-bg/80 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {statusFilters.map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setStatusFilter(filter.id)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition-colors ${
                    statusFilter === filter.id
                      ? 'border-sage-green bg-sage-green text-pure-black'
                      : 'border-ink-500 bg-transparent text-floral-white/70 hover:border-sage-green/50'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-ink-500 bg-pure-black/50 px-4 py-2">
                <Search className="h-4 w-4 text-floral-white/40" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search agents, roles, sectors"
                  className="bg-transparent text-sm text-floral-white outline-none placeholder:text-floral-white/40"
                />
              </div>
              <button className="flex items-center gap-2 rounded-2xl border border-ink-500 px-4 py-2 text-xs uppercase tracking-[0.3em] text-floral-white/70">
                <Filter className="h-4 w-4" />
                Advanced Filters
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-3">
              {filteredAgents.length === 0 && (
                <div className="rounded-2xl border border-ink-500 bg-pure-black/60 p-8 text-center text-floral-white/60">
                  No agents match your filters.
                </div>
              )}
              {filteredAgents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`flex items-center justify-between rounded-xl border px-5 py-3 text-left transition-all ${
                    selectedAgentId === agent.id
                      ? 'border-sage-green bg-pure-black/80 shadow-[0_0_25px_rgba(20,177,22,0.25)]'
                      : 'border-ink-500 bg-pure-black/40 hover:border-sage-green/40'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <p className="text-base font-semibold text-floral-white">{agent.name}</p>
                    <p className="text-sm uppercase tracking-[0.2em] text-floral-white/50">{agent.role}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] ${statusPills[agent.status]}`}>
                    {agent.status}
                  </span>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-ink-500 bg-pure-black/60 p-5">
              <p className="text-xs uppercase tracking-[0.4em] text-floral-white/50">Agent Brief</p>
              {selectedAgent ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-2xl font-bold text-floral-white">{selectedAgent.name}</p>
                    <p className="text-sm uppercase tracking-[0.3em] text-floral-white/50">
                      {selectedAgent.role} • {selectedAgent.sectorSymbol}
                    </p>
                  </div>
                  
                  {/* Trades Section with Good/Bad Breakdown */}
                  <div className="rounded-xl border border-ink-500/60 bg-card-bg/60 p-3">
                    <p className="text-[0.6rem] uppercase tracking-[0.3em] text-floral-white/50 mb-2"># Trades</p>
                    <p className="text-2xl font-bold text-floral-white mb-2">{selectedAgent.trades}</p>
                    {(() => {
                      const winRate = selectedAgent.rawPerformance?.winRate ?? 0;
                      const totalTrades = selectedAgent.trades;
                      const goodTrades = Math.round(totalTrades * (winRate / 100));
                      const badTrades = totalTrades - goodTrades;
                      return (
                        <div className="flex gap-3 mt-2">
                          <div className="flex-1">
                            <p className="text-xs text-floral-white/60">Good</p>
                            <p className="text-lg font-bold text-sage-green">{goodTrades}</p>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs text-floral-white/60">Bad</p>
                            <p className="text-lg font-bold text-error-red">{badTrades}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Current Performance */}
                  <div className="rounded-xl border border-ink-500/60 bg-card-bg/60 p-3">
                    <p className="text-[0.6rem] uppercase tracking-[0.3em] text-floral-white/50">Current Performance</p>
                    <p className={`text-2xl font-bold ${selectedAgent.performance >= 0 ? 'text-sage-green' : 'text-error-red'}`}>
                      {selectedAgent.performance >= 0 ? '+' : ''}
                      {selectedAgent.performance.toFixed(2)}%
                    </p>
                  </div>

                  {/* Activity Status */}
                  <div className="rounded-xl border border-ink-500/60 bg-card-bg/60 p-3">
                    <p className="text-[0.6rem] uppercase tracking-[0.3em] text-floral-white/50">Activity Status</p>
                    <div className="mt-2">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.2em] ${statusPills[selectedAgent.status]}`}>
                        {selectedAgent.status}
                      </span>
                    </div>
                  </div>

                  {/* Morale Indicator */}
                  <div className="rounded-xl border border-ink-500/60 bg-card-bg/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-floral-white/50">Morale</p>
                      <p className="text-xs font-semibold text-floral-white/70">
                        {Math.round(selectedAgent.morale ?? 50)}/100
                      </p>
                    </div>
                    <div className="w-full bg-ink-500/20 rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          (selectedAgent.morale ?? 50) >= 80
                            ? 'bg-sage-green'
                            : (selectedAgent.morale ?? 50) >= 50
                            ? 'bg-warning-amber'
                            : 'bg-error-red'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, selectedAgent.morale ?? 50))}%` }}
                      />
                    </div>
                    {selectedAgent.rewardPoints !== undefined && selectedAgent.rewardPoints > 0 && (
                      <p className="text-xs text-floral-white/60">Reward Points: {selectedAgent.rewardPoints}</p>
                    )}
                  </div>

                  {/* Confidence Indicator */}
                  <div className="rounded-xl border border-ink-500/60 bg-card-bg/60 p-3">
                    <p className="text-[0.6rem] uppercase tracking-[0.3em] text-floral-white/50 mb-2">Confidence</p>
                    <div className="w-full h-3 bg-neutral-800 rounded mb-2">
                      <div
                        className="h-3 rounded transition-all"
                        style={{
                          width: `${Math.min(100, Math.max(0, ((selectedAgent.confidence ?? 0) + 100) / 2))}%`,
                          backgroundColor: (selectedAgent.confidence ?? 0) > 0 ? '#00ff85' : (selectedAgent.confidence ?? 0) < 0 ? '#ff4b4b' : '#808080'
                        }}
                      />
                    </div>
                    <p className="text-xs mt-1 text-floral-white/70">Confidence: {Math.round(selectedAgent.confidence ?? 0)}%</p>
                  </div>
                </div>
              ) : (
                <div className="mt-6 text-sm text-floral-white/60">Select an agent to view its live brief.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <CreateAgentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          void loadAgents();
        }}
      />
    </div>
  );
}

