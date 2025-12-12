'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { fetchChecklist, type ChecklistResponse } from '@/lib/api';

interface FinalChecklistProps {
  discussionId: string;
  isFinalized: boolean;
}

export default function FinalChecklist({ discussionId, isFinalized }: FinalChecklistProps) {
  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (!isFinalized || !discussionId) {
      setChecklist(null);
      return;
    }

    const loadChecklist = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchChecklist(discussionId);
        setChecklist(data);
      } catch (err) {
        console.error('Failed to fetch checklist', err);
        setError(err instanceof Error ? err.message : 'Failed to load checklist');
      } finally {
        setLoading(false);
      }
    };

    loadChecklist();
  }, [discussionId, isFinalized]);

  // Auto-update when discussion becomes finalized
  useEffect(() => {
    if (!isFinalized || !discussionId) return;

    // Poll for checklist updates when discussion is finalized
    const interval = setInterval(async () => {
      try {
        const data = await fetchChecklist(discussionId);
        if (data) {
          setChecklist(data);
        }
      } catch (err) {
        // Silently fail on polling errors
        console.debug('Checklist poll error:', err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [discussionId, isFinalized]);

  if (!isFinalized) {
    return null;
  }

  // Read from checklistItems[] - single source of truth
  const items = checklist?.checklistItems || [];
  const hasItems = items.length > 0;

  return (
    <div className="bg-ink-600/60 rounded-lg border border-ink-500 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full bg-ink-600/80 px-4 py-3 border-b border-ink-500 flex items-center justify-between hover:bg-ink-600 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-sage-green" />
          <span className="text-sm font-semibold uppercase tracking-wide text-floral-white">
            Final Checklist
          </span>
          {checklist && hasItems && (
            <span className="text-xs text-floral-white/50 font-mono">
              ({items.length} {items.length === 1 ? 'item' : 'items'})
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-floral-white/70" />
        ) : (
          <ChevronDown className="w-4 h-4 text-floral-white/70" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4">
          {loading && (
            <p className="text-floral-white/70 font-mono text-sm text-center py-4">
              Loading checklist...
            </p>
          )}

          {error && (
            <p className="text-error-red font-mono text-sm text-center py-4">
              {error}
            </p>
          )}

          {!loading && !error && !hasItems && (
            <p className="text-floral-white/50 font-mono text-sm text-center py-4">
              No checklist items generated.
            </p>
          )}

          {!loading && !error && hasItems && (
            <div className="overflow-x-auto">
              <table className="w-full border border-ink-500 bg-pure-black/60 font-mono text-sm">
                <thead>
                  <tr className="bg-ink-600/80 text-left text-xs uppercase tracking-wide text-floral-white/70">
                    <th className="px-4 py-2 border border-ink-500">Action</th>
                    <th className="px-4 py-2 border border-ink-500">Symbol</th>
                    <th className="px-4 py-2 border border-ink-500">Amount</th>
                    <th className="px-4 py-2 border border-ink-500">Confidence</th>
                    <th className="px-4 py-2 border border-ink-500">Rationale</th>
                    <th className="px-4 py-2 border border-ink-500">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const rationale = item.rationale || item.reasoning || item.reason || 'N/A';
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-ink-500 hover:bg-ink-600/40 transition-colors"
                      >
                        <td className="px-4 py-3 border border-ink-500 text-floral-white">
                          {/* Action Badge - REQUIRED */}
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                              item.action === 'buy'
                                ? 'bg-sage-green/20 text-sage-green border border-sage-green/40'
                                : item.action === 'sell'
                                ? 'bg-error-red/20 text-error-red border border-error-red/40'
                                : item.action === 'hold'
                                ? 'bg-warning-amber/20 text-warning-amber border border-warning-amber/40'
                                : 'bg-shadow-grey/50 text-floral-white border border-floral-white/20'
                            }`}
                          >
                            {item.action?.toUpperCase() || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white font-semibold">
                          {item.symbol || 'N/A'}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white">
                          {/* Amount - REQUIRED */}
                          {item.amount !== undefined && item.amount !== null
                            ? `$${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : item.allocationPercent !== undefined && item.allocationPercent !== null
                            ? `${item.allocationPercent.toFixed(1)}%`
                            : 'N/A'}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white">
                          {/* Confidence - REQUIRED */}
                          {item.confidence !== undefined && item.confidence !== null ? (
                            <div className="flex items-center gap-2">
                              <span>{item.confidence.toFixed(1)}%</span>
                              <div className="flex-1 max-w-20 h-2 bg-ink-500 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-sage-green transition-all"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, item.confidence))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white/80 max-w-md">
                          <div className="truncate" title={rationale}>
                            {rationale}
                          </div>
                        </td>
                        <td className="px-4 py-3 border border-ink-500 text-floral-white">
                          {/* Manager Approval Status - REQUIRED */}
                          {item.approvalStatus ? (
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold ${
                                item.approvalStatus === 'accepted'
                                  ? 'bg-sage-green/15 text-sage-green border border-sage-green/40'
                                  : item.approvalStatus === 'rejected'
                                  ? 'bg-error-red/15 text-error-red border border-error-red/40'
                                  : 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40'
                              }`}
                            >
                              {item.approvalStatus}
                            </span>
                          ) : (
                            'N/A'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

