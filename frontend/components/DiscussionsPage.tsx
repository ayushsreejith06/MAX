'use client';

import React, { useState, useMemo, useEffect } from 'react';
import type { Discussion, Sector } from '@/lib/types';
import { fetchDiscussions, fetchSectors } from '@/lib/api';

const agentThemes = [
  { text: 'text-[#9AE6FF]', border: 'border-[#9AE6FF]/40', bg: 'bg-[#9AE6FF]/10' },
  { text: 'text-[#C7A8FF]', border: 'border-[#C7A8FF]/40', bg: 'bg-[#C7A8FF]/10' },
  { text: 'text-[#FF9AC4]', border: 'border-[#FF9AC4]/40', bg: 'bg-[#FF9AC4]/10' },
  { text: 'text-[#A3FFD6]', border: 'border-[#A3FFD6]/40', bg: 'bg-[#A3FFD6]/10' },
];

function getAgentTheme(agentName: string) {
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    hash = agentName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return agentThemes[Math.abs(hash) % agentThemes.length];
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const month = date.toLocaleString('default', { month: 'short' });
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `[${month} ${day}, ${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}]`;
}

interface TerminalViewProps {
  discussion: Discussion;
  sectorSymbol: string;
}

function TerminalView({ discussion, sectorSymbol }: TerminalViewProps) {
  return (
    <div className="mt-4 border border-sage-green/30 rounded-lg overflow-hidden bg-pure-black">
      <div className="bg-pure-black/60 px-4 py-2 border-b border-sage-green/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-sage-green">
            CONVERSATION_LOG.{sectorSymbol}
          </span>
          <span className="text-xs font-mono text-floral-white/70">
            {discussion.messages.length} messages
          </span>
        </div>
      </div>
      <div className="p-4 bg-pure-black/60 font-mono text-sm max-h-96 overflow-y-auto">
        {discussion.messages.map((message, index) => {
          const theme = getAgentTheme(message.agentName);
          return (
            <div key={message.id} className="mb-4 last:mb-0">
              <div className="flex items-start gap-2 mb-1">
                <span className="text-sage-green font-mono text-xs">
                  {formatTimestamp(message.timestamp)}
                </span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded-full border text-xs tracking-wide ${theme.text} ${theme.border} ${theme.bg}`}
                >
                  {message.agentName}:
                </span>
              </div>
              <div className="ml-4 pl-3 border-l-2 border-sage-green/30 text-floral-white">
                {message.content}
              </div>
              {index < discussion.messages.length - 1 && (
                <div className="mt-3 border-t border-floral-white/10"></div>
              )}
            </div>
          );
        })}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sage-green">&gt;</span>
          <span className="terminal-cursor bg-sage-green w-2 h-4 inline-block"></span>
        </div>
      </div>
    </div>
  );
}

export default function DiscussionsPage() {
  type DiscussionWithSector = Discussion & { sectorSymbol: string; sectorName: string };

  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'accepted' | 'rejected'>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [expandedDiscussion, setExpandedDiscussion] = useState<string | null>(null);
  const [sectorsData, setSectorsData] = useState<Sector[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionWithSector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDiscussions = async () => {
      try {
        setLoading(true);
        const [sectorResponse, discussionResponse] = await Promise.all([
          fetchSectors(),
          fetchDiscussions(),
        ]);

        if (!isMounted) return;

        const sectorsList = sectorResponse as Sector[];
        const sectorMap = new Map<string, Sector>(sectorsList.map(sector => [sector.id, sector]));

        const discussionsWithSector: DiscussionWithSector[] = (discussionResponse as Discussion[]).map(discussion => {
          const sector = discussion.sectorId ? sectorMap.get(discussion.sectorId) : undefined;
          const fallbackSymbol = (discussion.sectorSymbol ?? discussion.sectorId ?? '—').toString().toUpperCase();
          return {
            ...discussion,
            sectorSymbol: sector?.symbol ?? fallbackSymbol,
            sectorName: sector?.name ?? discussion.sectorName ?? 'Unknown Sector',
          };
        });

        setSectorsData(sectorsList);
        setDiscussions(discussionsWithSector);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch discussions', err);
        if (isMounted) {
          setError('Unable to load discussions. Please try again later.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDiscussions();

    return () => {
      isMounted = false;
    };
  }, []);

  const toCamelRole = (role: string) => {
    return role
      .toLowerCase()
      .split(' ')
      .map((word, idx) =>
        idx === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('');
  };

  const buildConversationTitle = (discussion: Discussion) => {
    const history = discussion.messages
      .slice(-4)
      .map(msg => msg.content)
      .join(' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = history ? history.split(' ') : discussion.title.split(' ');
    const snippet = words.slice(0, 5).join(' ');
    const formatted = snippet.charAt(0).toUpperCase() + snippet.slice(1);
    return formatted || discussion.title;
  };

  const filteredDiscussions = useMemo(() => {
    return discussions.filter(disc => {
      const statusMatch = statusFilter === 'all' || disc.status === statusFilter;
      const sectorMatch = sectorFilter === 'all' || disc.sectorId === sectorFilter;
      return statusMatch && sectorMatch;
    });
  }, [discussions, statusFilter, sectorFilter]);

  const statusTabs = [
    { id: 'all', label: 'Total', count: discussions.length },
    { id: 'in_progress', label: 'In progress', count: discussions.filter(d => d.status === 'in_progress').length },
    { id: 'accepted', label: 'Accepted', count: discussions.filter(d => d.status === 'accepted').length },
    { id: 'rejected', label: 'Rejected', count: discussions.filter(d => d.status === 'rejected').length },
  ];

  const getStatusMeta = (status: Discussion['status']) => {
    switch (status) {
      case 'in_progress':
        return { label: 'In progress', className: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40' };
      case 'accepted':
        return { label: 'Accepted', className: 'bg-sage-green/15 text-sage-green border border-sage-green/40' };
      case 'rejected':
        return { label: 'Rejected', className: 'bg-error-red/10 text-error-red border border-error-red/30' };
      default:
        return { label: status, className: 'bg-shadow-grey text-floral-white' };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pure-black p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-floral-white/70 font-mono">Loading discussions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-pure-black p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-error-red font-mono">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pure-black p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-floral-white mb-8">Discussions</h1>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border rounded-lg transition-all ${
                  statusFilter === tab.id
                    ? 'bg-sage-green text-pure-black border-sage-green shadow-[0_0_20px_rgba(20,177,22,0.35)]'
                    : 'bg-ink-600 text-floral-white/70 border-floral-white/10 hover:text-floral-white'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="px-4 py-2 rounded-lg bg-ink-600 text-floral-white border border-floral-white/10 focus:border-sage-green focus:outline-none text-sm"
          >
            <option value="all">All Sectors</option>
            {sectorsData.map(sector => (
              <option key={sector.id} value={sector.id}>
                {sector.symbol} - {sector.name}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-ink-600/60 rounded-2xl border border-ink-500 shadow-[0_0_35px_rgba(0,0,0,0.55)]">
          <div className="overflow-x-auto">
            <table className="w-full border border-ink-500 bg-pure-black font-mono text-[0.85rem]">
              <thead>
                <tr className="bg-ink-600 text-left text-xs uppercase tracking-[0.2em] text-floral-white/70">
                  <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                    Title
                  </th>
                  <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                    Sector
                  </th>
                  <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                    Status
                  </th>
                  <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                    Participants
                  </th>
                  <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                    Messages
                  </th>
                  <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredDiscussions.map((discussion, index) => {
                  const isExpanded = expandedDiscussion === discussion.id;
                  const sector = sectorsData.find(s => s.id === discussion.sectorId);
                  const statusMeta = getStatusMeta(discussion.status);
                  
                  return (
                    <React.Fragment key={discussion.id}>
                      <tr
                        onClick={() => setExpandedDiscussion(isExpanded ? null : discussion.id)}
                        className="cursor-pointer transition-colors border-b border-ink-500 bg-pure-black/80 hover:bg-ink-600/70"
                      >
                        <td className="px-4 py-3 border border-ink-500">
                          <p className="text-floral-white font-semibold tracking-wide">
                            {buildConversationTitle(discussion)}
                          </p>
                          <p className="text-[0.65rem] text-floral-white/50 mt-1 uppercase tracking-[0.3em]">
                            Last touch{' '}
                            {new Date(discussion.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                          {discussion.sectorSymbol}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-center">
                          <span className={`px-3 py-1.5 rounded-full text-[0.6rem] font-semibold uppercase tracking-[0.2em] inline-flex items-center justify-center ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 border border-ink-500">
                          <div className="flex flex-wrap gap-1.5">
                            {discussion.agentIds.slice(0, 3).map((agentId) => {
                              const agent = sector?.agents.find(a => a.id === agentId);
                              if (!agent) return null;
                              const theme = getAgentTheme(agent.name);
                              return (
                                <span
                                  key={agentId}
                                  className={`text-[0.65rem] px-2 py-1 rounded border ${theme.text} ${theme.border} ${theme.bg}`}
                                >
                                  {discussion.sectorSymbol}_{toCamelRole(agent.role)}
                                </span>
                              );
                            })}
                            {discussion.agentIds.length > 3 && (
                              <span className="text-[0.65rem] px-2 py-1 rounded border border-dashed border-floral-white/20 text-floral-white/60">
                                +{discussion.agentIds.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-center text-floral-white">
                          {discussion.messages.length}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/70 text-xs">
                          {new Date(discussion.updatedAt).toLocaleDateString()}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 bg-ink-600/50 border border-ink-500">
                            <TerminalView discussion={discussion} sectorSymbol={discussion.sectorSymbol} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {filteredDiscussions.length === 0 && (
          <div className="text-center py-12 text-floral-white/50">
            No discussions found matching the selected filters.
          </div>
        )}
      </div>
    </div>
  );
}

