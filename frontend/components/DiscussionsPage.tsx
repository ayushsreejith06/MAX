'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Discussion, Sector } from '@/lib/types';
import { fetchDiscussions, fetchSectors, isRateLimitError, clearAllDiscussions, fetchRejectedItems, type DiscussionSummary, type PaginatedDiscussionsResponse } from '@/lib/api';
import { useToast, ToastContainer } from '@/components/Toast';
import RejectedItemsModal from '@/components/discussions/RejectedItemsModal';

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

// TerminalView removed - messages are now loaded on detail page only

// TerminalView removed - messages are now loaded on detail page only

export default function DiscussionsPage() {
  type DiscussionWithSector = DiscussionSummary & { sectorSymbol: string; sectorName: string };

  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'decided'>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  // Removed expandedDiscussion state - messages are now loaded on detail page only
  const [sectorsData, setSectorsData] = useState<Sector[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionWithSector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<{ page: number; pageSize: number; total: number; totalPages: number } | null>(null);
  const [statusCounts, setStatusCounts] = useState<{ all: number; in_progress: number; decided: number } | null>(null);
  const [showRejectedModal, setShowRejectedModal] = useState(false);
  const [rejectedItemsCount, setRejectedItemsCount] = useState<number>(0);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const { toasts, showToast, closeToast } = useToast();
  const pageSize = 20;

  useEffect(() => {
    let isMounted = true;

    const loadDiscussions = async () => {
      try {
        setLoading(true);
        const sectorId = sectorFilter !== 'all' ? sectorFilter : undefined;
        const [sectorResponse, discussionResponse, rejectedItemsResponse] = await Promise.all([
          fetchSectors(),
          fetchDiscussions(currentPage, pageSize, sectorId, statusFilter),
          fetchRejectedItems().catch(() => ({ rejected: [] })), // Fetch rejected items count
        ]);

        if (!isMounted) return;

        // If both calls returned empty arrays and we already have data, 
        // don't update state (prevents flicker from skipped calls)
        if (Array.isArray(sectorResponse) && sectorResponse.length === 0 &&
            discussionResponse.discussions.length === 0 &&
            (sectorsData.length > 0 || discussions.length > 0)) {
          // Likely skipped - don't update state, just return
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        const sectorsList = sectorResponse as Sector[];
        const sectorMap = new Map<string, Sector>(sectorsList.map(sector => [sector.id, sector]));

        const discussionsWithSector: DiscussionWithSector[] = discussionResponse.discussions.map(discussion => {
          // Use sector symbol from backend response (already optimized)
          const sectorSymbol = discussion.sector || 'N/A';
          // Still look up sector for name if sectorId is available
          const sector = discussion.sectorId ? sectorMap.get(discussion.sectorId) : undefined;
          return {
            ...discussion,
            sectorSymbol: sectorSymbol,
            sectorName: sector?.name ?? 'Unknown Sector',
          };
        });

        setSectorsData(sectorsList);
        setDiscussions(discussionsWithSector);
        setPagination(discussionResponse.pagination);
        if (discussionResponse.statusCounts) {
          setStatusCounts(discussionResponse.statusCounts);
        }
        // Update rejected items count
        if (rejectedItemsResponse && Array.isArray(rejectedItemsResponse.rejected)) {
          setRejectedItemsCount(rejectedItemsResponse.rejected.length);
        }
        setError(null);
      } catch (err) {
        // Only handle actual server rate limit errors (HTTP 429)
        // Skipped calls from rateLimitedFetch return empty arrays, not errors
        if (isRateLimitError(err)) {
          console.debug('Server rate limited, will retry automatically');
          return;
        }
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
  }, [currentPage, sectorFilter, statusFilter]);

  const toCamelRole = (role: string) => {
    return role
      .toLowerCase()
      .split(' ')
      .map((word, idx) =>
        idx === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('');
  };

  const buildConversationTitle = (discussion: DiscussionSummary) => {
    // For summary view, just use the title
    return discussion.title || 'Untitled Discussion';
  };

  // No need for client-side filtering - backend handles it
  const filteredDiscussions = discussions;

  const statusTabs = [
    { id: 'all', label: 'Total', count: statusCounts?.all ?? 0 },
    { id: 'in_progress', label: 'In Progress', count: statusCounts?.in_progress ?? 0 },
    { id: 'decided', label: 'Decided', count: statusCounts?.decided ?? 0 },
  ];

  const getStatusMeta = (status: Discussion['status']) => {
    // Normalize legacy statuses to 'decided' for display
    const normalizedStatus = (status === 'finalized' || status === 'accepted' || status === 'completed') ? 'decided' : status;
    
    switch (normalizedStatus) {
      case 'in_progress':
        return { label: 'In Progress', className: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40' };
      case 'decided':
        return { label: 'Decided', className: 'bg-sage-green/15 text-sage-green border border-sage-green/40' };
      case 'closed':
        return { label: 'Closed', className: 'bg-shadow-grey text-floral-white border border-floral-white/20' };
      case 'archived':
        return { label: 'Archived', className: 'bg-shadow-grey/50 text-floral-white/70 border border-floral-white/10' };
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

  const handleClearAllDiscussions = async () => {
    if (confirmationText !== 'CLEAR') {
      return;
    }
    
    try {
      setClearing(true);
      const result = await clearAllDiscussions();
      showToast(`All discussions cleared for testing. (${result.deletedCount} deleted)`, 'success');
      setShowClearModal(false);
      setConfirmationText('');
      
      // Refresh the discussions list
      setCurrentPage(1);
      const sectorId = sectorFilter !== 'all' ? sectorFilter : undefined;
      const [sectorResponse, discussionResponse] = await Promise.all([
        fetchSectors(),
        fetchDiscussions(1, pageSize, sectorId, statusFilter),
      ]);
      
      const sectorsList = sectorResponse as Sector[];
      const sectorMap = new Map<string, Sector>(sectorsList.map(sector => [sector.id, sector]));
      
      const discussionsWithSector: DiscussionWithSector[] = discussionResponse.discussions.map(discussion => {
        const sectorSymbol = discussion.sector || 'N/A';
        const sector = discussion.sectorId ? sectorMap.get(discussion.sectorId) : undefined;
        return {
          ...discussion,
          sectorSymbol: sectorSymbol,
          sectorName: sector?.name ?? 'Unknown Sector',
        };
      });
      
      setSectorsData(sectorsList);
      setDiscussions(discussionsWithSector);
      setPagination(discussionResponse.pagination);
      if (discussionResponse.statusCounts) {
        setStatusCounts(discussionResponse.statusCounts);
      }
    } catch (error: any) {
      showToast(error?.message || 'Failed to clear discussions', 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="min-h-screen bg-pure-black p-8">
      <ToastContainer toasts={toasts} onClose={closeToast} />
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-floral-white">Discussions</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRejectedModal(true)}
              className="px-4 py-2 bg-error-red text-floral-white border border-error-red rounded-lg hover:bg-error-red/80 transition-colors text-sm font-mono"
            >
              Rejected Items {rejectedItemsCount > 0 ? `(${rejectedItemsCount})` : ''}
            </button>
            <button
              onClick={() => setShowClearModal(true)}
              className="px-4 py-2 bg-error-red text-floral-white border border-error-red rounded-lg hover:bg-error-red/80 transition-colors text-sm font-mono"
            >
              Clear All Discussions
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatusFilter(tab.id as any);
                  setCurrentPage(1); // Reset to first page when changing filter
                }}
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
            onChange={(e) => {
              setSectorFilter(e.target.value);
              setCurrentPage(1); // Reset to first page when changing filter
            }}
            className="px-4 py-2 rounded-lg bg-ink-600 text-floral-white border border-floral-white/10 focus:border-sage-green focus:outline-none text-sm"
          >
            <option value="all">All Sectors</option>
            {sectorsData.map(sector => (
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
                  const sector = sectorsData.find(s => s.id === discussion.sectorId);
                  const statusMeta = getStatusMeta(discussion.status);
                  
                  return (
                    <tr
                      key={discussion.id}
                      onClick={(e) => {
                        // Navigate to detail page when clicking on the row
                        if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                          router.push(`/discussions/${discussion.id}`);
                        }
                      }}
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
                            {discussion.participants.slice(0, 3).map((agentId) => {
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
                            {discussion.participants.length > 3 && (
                              <span className="text-[0.65rem] px-2 py-1 rounded border border-dashed border-floral-white/20 text-floral-white/60">
                                +{discussion.participants.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-center text-floral-white">
                          {discussion.messagesCount}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/70 text-xs">
                          <div className="flex flex-col">
                            <span>{new Date(discussion.updatedAt).toLocaleDateString()}</span>
                            <span className="text-floral-white/50 text-[0.65rem] mt-0.5">
                              {new Date(discussion.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </td>
                      </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {filteredDiscussions.length === 0 && !loading && (
          <div className="text-center py-12 text-floral-white/50">
            No discussions found matching the selected filters.
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-floral-white/70 font-mono">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, pagination.total)} of {pagination.total} discussions
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1 || loading}
                className="px-4 py-2 bg-ink-600 text-floral-white border border-floral-white/10 rounded-lg hover:bg-ink-500 transition-colors text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-floral-white/70 font-mono text-sm flex items-center">
                Page {currentPage} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                disabled={currentPage >= pagination.totalPages || loading}
                className="px-4 py-2 bg-ink-600 text-floral-white border border-floral-white/10 rounded-lg hover:bg-ink-500 transition-colors text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Rejected Items Modal */}
        <RejectedItemsModal
          isOpen={showRejectedModal}
          onClose={() => setShowRejectedModal(false)}
        />

        {/* Clear All Discussions Confirmation Modal */}
        {showClearModal && (
          <div className="fixed inset-0 bg-pure-black/80 flex items-center justify-center z-50">
            <div className="bg-ink-600 border border-ink-500 rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-floral-white mb-4 font-mono">
                Clear All Discussions
              </h2>
              <p className="text-floral-white/70 mb-4 font-mono">
                Are you sure? This will permanently remove all discussions.
              </p>
              <p className="text-floral-white/50 mb-4 font-mono text-sm">
                Type <span className="text-error-red font-bold">CLEAR</span> to confirm:
              </p>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="Type CLEAR to confirm"
                disabled={clearing}
                className="w-full px-4 py-2 mb-6 bg-ink-500 text-floral-white border border-floral-white/10 rounded-lg focus:border-error-red focus:outline-none font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && confirmationText === 'CLEAR' && !clearing) {
                    handleClearAllDiscussions();
                  }
                }}
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowClearModal(false);
                    setConfirmationText('');
                  }}
                  disabled={clearing}
                  className="px-4 py-2 bg-ink-500 text-floral-white border border-floral-white/10 rounded-lg hover:bg-ink-400 transition-colors text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAllDiscussions}
                  disabled={clearing || confirmationText !== 'CLEAR'}
                  className="px-4 py-2 bg-error-red text-floral-white border border-error-red rounded-lg hover:bg-error-red/80 transition-colors text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clearing ? 'Clearing...' : 'Clear All'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

