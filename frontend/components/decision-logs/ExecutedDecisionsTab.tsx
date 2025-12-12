'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAllExecutionLogs, fetchSectors, fetchAgents, type ExecutionLogsFilters, type ExecutionLog } from '@/lib/api';
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

interface ExecutedDecisionsTabProps {
  refreshTrigger?: number;
}

export default function ExecutedDecisionsTab({ refreshTrigger }: ExecutedDecisionsTabProps = {}) {
  const router = useRouter();
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
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
  const filters = useMemo<ExecutionLogsFilters>(() => {
    const filter: ExecutionLogsFilters = {
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

  // Load execution logs
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAllExecutionLogs(filters);
      setLogs(result.logs || []);
      setPagination(result.pagination || pagination);
    } catch (error) {
      console.error('Error loading execution logs:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Initial load
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Polling for real-time updates
  usePolling(loadLogs, 5000);

  // Refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      loadLogs();
    }
  }, [refreshTrigger, loadLogs]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [selectedSector, selectedManager, selectedDiscussionId, selectedTimeWindow]);

  // Get manager agents
  const managerAgents = useMemo(() => {
    return agents.filter(agent => agent.role && agent.role.toLowerCase().includes('manager'));
  }, [agents]);

  // Get sector symbol
  const getSectorSymbol = (sectorId: string) => {
    const sector = sectors.find(s => s.id === sectorId);
    return sector?.symbol || sector?.sectorSymbol || sectorId;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pure-black p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-floral-white/70 font-mono">Loading execution logs...</p>
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
                  Discussion ID
                </th>
                <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                  Action
                </th>
                <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                  Impact
                </th>
                <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                  Results
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-floral-white/50 font-mono">
                    No executed decisions found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => {
                      if (log.checklistId) {
                        router.push(`/discussions/${log.checklistId}`);
                      }
                    }}
                    className="cursor-pointer transition-colors border-b border-ink-500 bg-pure-black/80 hover:bg-ink-600/70"
                  >
                    <td className="px-4 py-3 border border-ink-500">
                      <p className="text-floral-white font-semibold tracking-wide">
                        {formatTimestamp(log.timestamp)}
                      </p>
                      <p className="text-[0.65rem] text-floral-white/50 mt-1 uppercase tracking-[0.3em]">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                      {getSectorSymbol(log.sectorId)}
                    </td>
                    <td className="px-4 py-3 border border-ink-500">
                      {log.checklistId ? (
                        <span className="text-sage-green hover:underline font-mono text-xs">
                          {log.checklistId.substring(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-floral-white/50">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                      {log.action || 'N/A'}
                    </td>
                    <td className="px-4 py-3 border border-ink-500 text-center text-floral-white">
                      {log.impact !== undefined ? log.impact.toFixed(2) : 'N/A'}
                    </td>
                    <td className="px-4 py-3 border border-ink-500">
                      {log.results && log.results.length > 0 ? (
                        <div className="space-y-1">
                          {log.results.map((result, idx) => (
                            <div key={idx} className="text-xs">
                              <span className={result.success ? 'text-sage-green' : 'text-error-red'}>
                                {result.actionType || result.action} {result.amount ? `(${result.amount})` : ''}
                              </span>
                              {!result.success && result.reason && (
                                <span className="text-error-red/70 ml-1">- {result.reason}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-floral-white/50">N/A</span>
                      )}
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
            {pagination.total} decisions
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
