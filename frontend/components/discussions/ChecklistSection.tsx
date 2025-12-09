'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle, CheckCircle } from 'lucide-react';
import { fetchChecklist, type ChecklistResponse, type ChecklistItemResponse } from '@/lib/api';

interface ChecklistSectionProps {
  discussionId: string;
  discussionStatus: string;
}

export default function ChecklistSection({ discussionId, discussionStatus }: ChecklistSectionProps) {
  const [checklistData, setChecklistData] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const loadChecklist = async () => {
    if (!discussionId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await fetchChecklist(discussionId);
      setChecklistData(data);
    } catch (err) {
      console.error('Failed to fetch checklist', err);
      setError(err instanceof Error ? err.message : 'Failed to load checklist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChecklist();
  }, [discussionId]);

  // Auto-refresh checklist every 3 seconds during active discussions
  useEffect(() => {
    if (!discussionId) return;

    // Only poll if discussion is in progress or decided
    const shouldPoll = discussionStatus === 'in_progress' || discussionStatus === 'decided' || discussionStatus === 'finalized';

    if (!shouldPoll) {
      return;
    }

    const interval = setInterval(() => {
      loadChecklist();
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [discussionId, discussionStatus]);

  const proposedItems = checklistData?.checklist || [];
  const finalizedItems = checklistData?.finalizedChecklist || [];
  const hasProposedItems = proposedItems.length > 0;
  const hasFinalizedItems = finalizedItems.length > 0;
  const hasAnyItems = hasProposedItems || hasFinalizedItems;

  const getApprovalStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle className="w-4 h-4 text-sage-green" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-error-red" />;
      default:
        return <Clock className="w-4 h-4 text-warning-amber" />;
    }
  };

  const getApprovalStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-sage-green/15 text-sage-green border border-sage-green/40';
      case 'rejected':
        return 'bg-error-red/15 text-error-red border border-error-red/40';
      default:
        return 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40';
    }
  };

  const renderChecklistItem = (item: ChecklistItemResponse) => {
    return (
      <div key={item.id} className="mb-3 p-3 bg-pure-black/60 rounded-lg border border-ink-500">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
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
                {item.action || 'N/A'}
              </span>
              {item.approvalStatus && (
                <span className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 ${getApprovalStatusBadge(item.approvalStatus)}`}>
                  {getApprovalStatusIcon(item.approvalStatus)}
                  {item.approvalStatus}
                </span>
              )}
            </div>
            <p className="text-floral-white text-sm font-mono mb-2">
              {item.description || item.reason || item.reasoning || 'No description'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-floral-white/70 font-mono">
          {item.agentName && (
            <span>
              <span className="text-floral-white/50">Agent:</span> {item.agentName}
            </span>
          )}
          {item.round && (
            <span>
              <span className="text-floral-white/50">Round:</span> {item.round}
            </span>
          )}
          {item.amount !== undefined && item.amount !== null && (
            <span>
              <span className="text-floral-white/50">Amount:</span> {item.amount.toLocaleString()}
            </span>
          )}
          {item.confidence !== undefined && item.confidence !== null && (
            <span>
              <span className="text-floral-white/50">Confidence:</span> {item.confidence.toFixed(1)}%
            </span>
          )}
        </div>
        {item.approvalReason && (
          <div className="mt-2 pt-2 border-t border-ink-500">
            <p className="text-xs text-floral-white/60 font-mono">
              <span className="text-floral-white/50">Manager:</span> {item.approvalReason}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mb-6 bg-ink-600/60 rounded-lg border border-ink-500 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full bg-ink-600/80 px-4 py-3 border-b border-ink-500 flex items-center justify-between hover:bg-ink-600 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-sage-green" />
          <span className="text-sm font-semibold uppercase tracking-wide text-floral-white">
            Checklist
          </span>
          {checklistData && hasAnyItems && (
            <span className="text-xs text-floral-white/50 font-mono">
              ({proposedItems.length} proposed, {finalizedItems.length} finalized)
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

          {!loading && !error && !hasAnyItems && (
            <p className="text-floral-white/50 font-mono text-sm text-center py-4">
              No checklist items yet.
            </p>
          )}

          {!loading && !error && hasAnyItems && (
            <div className="space-y-6">
              {/* Proposed Checklist Items (if discussion is in progress) */}
              {hasProposedItems && (discussionStatus === 'in_progress' || discussionStatus === 'decided' || discussionStatus === 'finalized' || discussionStatus === 'executed') && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-floral-white mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-warning-amber" />
                    Proposed Checklist Items
                  </h3>
                  <div className="space-y-2">
                    {proposedItems.map(renderChecklistItem)}
                  </div>
                </div>
              )}

              {/* Finalized Checklist Items (if discussion is decided/finalized/executed) */}
              {hasFinalizedItems && (discussionStatus === 'decided' || discussionStatus === 'finalized' || discussionStatus === 'executed') && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-floral-white mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-sage-green" />
                    Finalized Checklist Items {discussionStatus === 'executed' && <span className="text-xs text-floral-white/50 font-mono">(Executed)</span>}
                  </h3>
                  <div className="space-y-2">
                    {finalizedItems.map(renderChecklistItem)}
                  </div>
                </div>
              )}
              
              {/* Show message if finalized items exist but no proposed items (historical view) */}
              {!hasProposedItems && hasFinalizedItems && (
                <div className="text-xs text-floral-white/50 font-mono italic">
                  Note: Proposed items are no longer available. Showing finalized items only.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

