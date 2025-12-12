'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAllExecutionLogs, fetchSectors, fetchAgents, fetchDiscussionById, type ExecutionLogsFilters, type ExecutionLog } from '@/lib/api';
import type { Sector, Agent, Discussion } from '@/lib/types';
import { usePolling } from '@/hooks/usePolling';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
  const [discussions, setDiscussions] = useState<Map<string, Discussion>>(new Map());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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

  // Load execution logs and fetch discussions for checklist items
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAllExecutionLogs(filters);
      const logsData = result.logs || [];
      setLogs(logsData);
      setPagination(result.pagination || pagination);
      
      // Fetch discussions for logs that have checklistId
      const discussionIds = logsData
        .filter(log => log.checklistId)
        .map(log => log.checklistId!)
        .filter((id, index, self) => self.indexOf(id) === index); // unique IDs
      
      // Fetch all discussions in parallel
      const discussionPromises = discussionIds.map(async (id) => {
        try {
          const discussion = await fetchDiscussionById(id);
          return { id, discussion };
        } catch (error) {
          console.error(`Error fetching discussion ${id}:`, error);
          return { id, discussion: null };
        }
      });
      
      const discussionResults = await Promise.all(discussionPromises);
      const discussionsMap = new Map<string, Discussion>();
      discussionResults.forEach(({ id, discussion }) => {
        if (discussion) {
          discussionsMap.set(id, discussion);
        }
      });
      setDiscussions(discussionsMap);
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

  // Toggle row expansion
  const toggleRow = (logId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
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
                <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">
                  Checklist
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-floral-white/50 font-mono">
                    No executed decisions found
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const discussion = log.checklistId ? discussions.get(log.checklistId) : null;
                  // Get checklist items from discussion - check both checklist and checklistItems
                  const checklistItems = discussion?.checklist || discussion?.checklistItems || [];
                  const hasChecklistItems = Array.isArray(checklistItems) && checklistItems.length > 0;
                  const isExpanded = expandedRows.has(log.id);
                  
                  // Debug logging
                  if (log.checklistId && !discussion) {
                    console.warn(`[ExecutedDecisionsTab] Discussion ${log.checklistId} not found in discussions map`);
                  }
                  if (discussion && !hasChecklistItems) {
                    console.warn(`[ExecutedDecisionsTab] Discussion ${log.checklistId} has no checklist items`, {
                      hasChecklist: !!discussion.checklist,
                      hasChecklistItems: !!discussion.checklistItems,
                      checklistLength: Array.isArray(discussion.checklist) ? discussion.checklist.length : 0,
                      checklistItemsLength: Array.isArray(discussion.checklistItems) ? discussion.checklistItems.length : 0
                    });
                  }
                  
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className="transition-colors border-b border-ink-500 bg-pure-black/80 hover:bg-ink-600/70"
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
                        <td 
                          className="px-4 py-3 border border-ink-500"
                          onClick={() => {
                            if (log.checklistId) {
                              router.push(`/discussions/${log.checklistId}`);
                            }
                          }}
                        >
                          {log.checklistId ? (
                            <span className="text-sage-green hover:underline font-mono text-xs cursor-pointer">
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
                        <td className="px-4 py-3 border border-ink-500">
                          {hasChecklistItems ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRow(log.id);
                              }}
                              className="flex items-center gap-1 text-sage-green hover:text-sage-green/80 text-xs font-mono"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              {checklistItems.length} item{checklistItems.length !== 1 ? 's' : ''}
                            </button>
                          ) : (
                            <span className="text-floral-white/50 text-xs">No items</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && hasChecklistItems && (
                        <tr>
                          <td colSpan={7} className="px-4 py-3 border border-ink-500 bg-ink-700/30">
                            <div className="space-y-2">
                              <div className="text-xs text-floral-white/70 font-mono mb-2 uppercase tracking-wide">
                                Checklist Items ({checklistItems.length}):
                              </div>
                              {checklistItems.map((item: any, idx: number) => {
                                const actionColor = item.action === 'buy' 
                                  ? 'text-sage-green' 
                                  : item.action === 'sell' 
                                  ? 'text-error-red' 
                                  : 'text-warning-amber';
                                
                                return (
                                  <div key={item.id || idx} className="p-2 bg-pure-black/60 rounded border border-ink-500">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-xs font-semibold uppercase ${actionColor}`}>
                                        {item.action || 'N/A'}
                                      </span>
                                      {item.symbol && (
                                        <span className="text-xs text-floral-white/80 font-mono">
                                          {item.symbol}
                                        </span>
                                      )}
                                      {item.amount !== undefined && item.amount !== null && (
                                        <span className="text-xs text-floral-white/80">
                                          ${item.amount.toFixed(2)}
                                        </span>
                                      )}
                                      {item.agentName && (
                                        <span className="text-xs text-floral-white/60">
                                          by {item.agentName}
                                        </span>
                                      )}
                                    </div>
                                    {item.reason && (
                                      <div className="text-xs text-floral-white/70 mt-1 ml-2">
                                        {item.reason}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
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
