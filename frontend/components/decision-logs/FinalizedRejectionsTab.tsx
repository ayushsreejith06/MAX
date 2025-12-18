'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchFinalizedRejections, fetchSectors, fetchAgents, type FinalizedRejectionsFilters, type FinalizedRejection } from '@/lib/api';
import type { Sector, Agent } from '@/lib/types';
import { usePolling } from '@/hooks/usePolling';

const TIME_WINDOWS = [
  { label: 'All Time', value: null },
  { label: 'Last 24 Hours', value: 24 * 60 * 60 * 1000 },
  { label: 'Last 7 Days', value: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Last 30 Days', value: 30 * 24 * 60 * 60 * 1000 },
];

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const month = date.toLocaleString('default', { month: 'short' });
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `[${month} ${day}, ${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}]`;
}

interface FinalizedRejectionsTabProps {
  refreshTrigger?: number;
}

export default function FinalizedRejectionsTab({ refreshTrigger }: FinalizedRejectionsTabProps = {}) {
  const router = useRouter();
  const [rejections, setRejections] = useState<FinalizedRejection[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0
  });

  // Filters
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [selectedManager, setSelectedManager] = useState<string>('');
  const [selectedDiscussionId, setSelectedDiscussionId] = useState<string>('');
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<number | null>(null);

  // Load sectors and agents
  useEffect(() => {
    const loadData = async () => {
      try {
        const [sectorsData, agentsData] = await Promise.all([
          fetchSectors(),
          fetchAgents()
        ]);
        setSectors(sectorsData);
        setAgents(agentsData);
      } catch (error) {
        console.error('Error loading sectors/agents:', error);
      }
    };
    loadData();
  }, []);

  // Build filters
  const filters = useMemo<FinalizedRejectionsFilters>(() => {
    const filter: FinalizedRejectionsFilters = {
      page: pagination.page,
      pageSize: pagination.pageSize
    };

    if (selectedSector && selectedSector !== 'all') filter.sectorId = selectedSector;
    if (selectedManager) filter.managerId = selectedManager;
    if (selectedDiscussionId) filter.discussionId = selectedDiscussionId;
    if (selectedTimeWindow) {
      filter.endTime = Date.now();
      filter.startTime = Date.now() - selectedTimeWindow;
    }

    return filter;
  }, [selectedSector, selectedManager, selectedDiscussionId, selectedTimeWindow, pagination.page, pagination.pageSize]);

  // Load finalized rejections
  const loadRejections = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFinalizedRejections(filters);
      setRejections(result.rejections || []);
      setPagination(result.pagination || (prev => prev));
    } catch (error) {
      console.error('Error loading finalized rejections:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Initial load
  useEffect(() => {
    loadRejections();
  }, [loadRejections]);

  // Polling for real-time updates
  usePolling({ callback: loadRejections, interval: 5000 });

  // Refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      loadRejections();
    }
  }, [refreshTrigger, loadRejections]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [selectedSector, selectedManager, selectedDiscussionId, selectedTimeWindow]);

  // Get manager agents
  const managerAgents = useMemo(() => {
    return agents.filter(agent => agent.role && agent.role.toLowerCase().includes('manager'));
  }, [agents]);

  // Get manager name
  const getManagerName = (managerId: string | null | undefined) => {
    if (!managerId) return 'N/A';
    const manager = managerAgents.find(a => a.id === managerId);
    return manager?.name || managerId;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pure-black p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-floral-white/70 font-mono">Loading finalized rejections...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2 items-center">
        <select
          value={selectedManager}
          onChange={(e) => {
            setSelectedManager(e.target.value);
            setPagination(prev => ({ ...prev, page: 1 }));
          }}
          className="px-4 py-2 rounded-lg bg-ink-600 text-floral-white border border-floral-white/10 focus:border-sage-green focus:outline-none text-sm"
        >
          <option value="">All Managers</option>
          {managerAgents.map(manager => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={selectedDiscussionId}
          onChange={(e) => {
            setSelectedDiscussionId(e.target.value);
            setPagination(prev => ({ ...prev, page: 1 }));
          }}
          placeholder="Discussion ID"
          className="px-4 py-2 rounded-lg bg-ink-600 text-floral-white border border-floral-white/10 focus:border-sage-green focus:outline-none text-sm placeholder-floral-white/30 font-mono"
        />

        <select
          value={selectedTimeWindow === null ? '' : selectedTimeWindow}
          onChange={(e) => {
            setSelectedTimeWindow(e.target.value ? parseInt(e.target.value) : null);
            setPagination(prev => ({ ...prev, page: 1 }));
          }}
          className="px-4 py-2 rounded-lg bg-ink-600 text-floral-white border border-floral-white/10 focus:border-sage-green focus:outline-none text-sm"
        >
          {TIME_WINDOWS.map(window => (
            <option key={window.label} value={window.value || ''}>
              {window.label}
            </option>
          ))}
        </select>

        <select
          value={selectedSector}
          onChange={(e) => {
            setSelectedSector(e.target.value);
            setPagination(prev => ({ ...prev, page: 1 }));
          }}
          className="px-4 py-2 rounded-lg bg-ink-600 text-floral-white border border-floral-white/10 focus:border-sage-green focus:outline-none text-sm"
        >
          <option value="all">All Sectors</option>
          {sectors.map(sector => (
            <option key={sector.id} value={sector.id}>
              {sector.symbol || 'N/A'} - {sector.name}
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
                  Timestamp
                </th>
                <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                  Sector
                </th>
                <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                  Discussion
                </th>
                <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                  Manager
                </th>
                <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                  Action
                </th>
                <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {rejections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-floral-white/50 font-mono">
                    No finalized rejections found
                  </td>
                </tr>
              ) : (
                rejections.map((rejection) => (
                  <tr
                    key={rejection.id}
                    onClick={() => router.push(`/discussions/${rejection.discussionId}`)}
                    className="cursor-pointer transition-colors border-b border-ink-500 bg-pure-black/80 hover:bg-ink-600/70"
                  >
                    <td className="px-4 py-3 border border-ink-500">
                      <p className="text-floral-white font-semibold tracking-wide">
                        {formatTimestamp(rejection.timestamp)}
                      </p>
                      <p className="text-[0.65rem] text-floral-white/50 mt-1 uppercase tracking-[0.3em]">
                        {new Date(rejection.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                      {rejection.sectorSymbol}
                    </td>
                    <td className="px-4 py-3 border border-ink-500">
                      <p className="text-floral-white font-semibold tracking-wide">
                        <span className="text-sage-green hover:underline font-mono text-xs">
                          {rejection.discussionId.substring(0, 8)}...
                        </span>
                      </p>
                      <p className="text-[0.65rem] text-floral-white/50 mt-1 uppercase tracking-[0.3em]">
                        {rejection.discussionTitle}
                      </p>
                    </td>
                    <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                      {getManagerName(rejection.managerId)}
                    </td>
                    <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                      {rejection.action || 'N/A'}
                      {rejection.amount && ` (${rejection.amount})`}
                      {rejection.confidence !== null && rejection.confidence !== undefined && (
                        <span className="text-xs text-floral-white/50 ml-2">
                          [{rejection.confidence.toFixed(2)}]
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 border border-ink-500">
                      <div className="max-w-md">
                        <div className="text-xs text-error-red mb-1">
                          {rejection.managerReason || 'No reason provided'}
                        </div>
                        {rejection.text && (
                          <div className="text-xs text-floral-white/50 line-clamp-2">
                            {rejection.text}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-floral-white/70 font-mono">
            Showing {((pagination.page - 1) * pagination.pageSize) + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total} rejections
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              disabled={pagination.page === 1 || loading}
              className="px-4 py-2 bg-ink-600 text-floral-white border border-floral-white/10 rounded-lg hover:bg-ink-500 transition-colors text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-floral-white/70 font-mono text-sm flex items-center">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="px-4 py-2 bg-ink-600 text-floral-white border border-floral-white/10 rounded-lg hover:bg-ink-500 transition-colors text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
