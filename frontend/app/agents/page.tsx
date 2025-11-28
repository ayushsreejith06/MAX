'use client';

import { useMemo, useState, useEffect } from 'react';
import { Activity, Filter, Search, Target, UsersRound, Zap } from 'lucide-react';
import { fetchAgents, fetchSectors } from '@/lib/api';
import type { Agent, Sector } from '@/lib/types';

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

  useEffect(() => {
    let isMounted = true;

    const loadAgents = async () => {
      try {
        setLoading(true);
        const [sectorData, agentData] = await Promise.all([
          fetchSectors(),
          fetchAgents(),
        ]);

        if (!isMounted) return;

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
        if (isMounted) {
          setError('Unable to load agents. Please try again.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadAgents();

    return () => {
      isMounted = false;
    };
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
                <button className="rounded-2xl bg-sage-green px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-pure-black hover:bg-sage-green/90">
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredAgents.length === 0 && (
                <div className="col-span-full rounded-2xl border border-ink-500 bg-pure-black/60 p-8 text-center text-floral-white/60">
                  No agents match your filters.
                </div>
              )}
              {filteredAgents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`flex h-full flex-col rounded-2xl border px-4 py-4 text-left transition-all ${
                    selectedAgentId === agent.id
                      ? 'border-sage-green bg-pure-black/80 shadow-[0_0_25px_rgba(20,177,22,0.25)]'
                      : 'border-ink-500 bg-pure-black/40 hover:border-sage-green/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-floral-white">{agent.name}</p>
                    <span className={`rounded-full px-3 py-1 text-[0.6rem] uppercase tracking-[0.3em] ${statusPills[agent.status]}`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs uppercase tracking-[0.3em] text-floral-white/50">{agent.role}</p>
                  <div className="mt-4 flex items-center justify-between text-sm text-floral-white/80">
                    <span>{agent.sectorSymbol}</span>
                    <span>{agent.trades} trades</span>
                    <span className={agent.performance >= 0 ? 'text-sage-green' : 'text-error-red'}>
                      {agent.performance >= 0 ? '+' : ''}
                      {agent.performance}%
                    </span>
                  </div>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-ink-500/60 bg-card-bg/60 p-3">
                      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-floral-white/50">Performance</p>
                      <p className={`text-xl font-bold ${selectedAgent.performance >= 0 ? 'text-sage-green' : 'text-error-red'}`}>
                        {selectedAgent.performance >= 0 ? '+' : ''}
                        {selectedAgent.performance}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-ink-500/60 bg-card-bg/60 p-3">
                      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-floral-white/50">Trades</p>
                      <p className="text-xl font-bold text-floral-white">{selectedAgent.trades}</p>
                    </div>
                    <div className="rounded-xl border border-ink-500/60 bg-card-bg/60 p-3">
                      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-floral-white/50">Risk tolerance</p>
                      <p className="text-xl font-bold text-floral-white">{selectedAgent.personality.riskTolerance}</p>
                    </div>
                    <div className="rounded-xl border border-ink-500/60 bg-card-bg/60 p-3">
                      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-floral-white/50">Decision style</p>
                      <p className="text-xl font-bold text-floral-white">{selectedAgent.personality.decisionStyle}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-ink-500 bg-card-bg/70 p-4">
                    <div className="flex items-center gap-2 text-sm text-floral-white/70">
                      <Zap className="h-4 w-4 text-sage-green" />
                      Playbooks attached
                    </div>
                    <ul className="mt-3 space-y-1 text-sm text-floral-white/80">
                      <li>• Liquidity funnel for {selectedAgent.sectorName}</li>
                      <li>• Counter-trend hedge overlay</li>
                      <li>• Auto-escalation to MAX macro desk</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="mt-6 text-sm text-floral-white/60">Select an agent to view its live brief.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

