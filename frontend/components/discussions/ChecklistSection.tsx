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
  const [showRejected, setShowRejected] = useState(true); // Show rejected items by default

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

    // Only poll if discussion is OPEN or in progress, decided, finalized, or accepted
    // Multi-round: OPEN means active discussion
    const shouldPoll = discussionStatus === 'OPEN' || 
                      discussionStatus === 'in_progress' || 
                      discussionStatus === 'decided' || 
                      discussionStatus === 'finalized' || 
                      discussionStatus === 'accepted';

    if (!shouldPoll) {
      return;
    }

    const interval = setInterval(() => {
      loadChecklist();
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [discussionId, discussionStatus]);

  // Read from checklistItems[] - single source of truth
  const allItems = checklistData?.checklistItems || [];
  
  // Separate items by approval status
  const acceptedItems = allItems.filter(item => item.approvalStatus === 'accepted');
  const rejectedItems = allItems.filter(item => item.approvalStatus === 'rejected');
  const pendingItems = allItems.filter(item => item.approvalStatus === 'pending' || !item.approvalStatus);
  
  // Filter items based on showRejected toggle
  const filteredItems = showRejected 
    ? allItems 
    : allItems.filter(item => item.approvalStatus !== 'rejected');
  
  const hasAnyItems = allItems.length > 0;

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
    // Extract rationale from structured data only - handle both string and array
    let rationaleText = 'No rationale provided';
    if (item.rationale) {
      if (Array.isArray(item.rationale)) {
        rationaleText = item.rationale.length > 0 
          ? item.rationale.join(' ') 
          : 'No rationale provided';
      } else if (typeof item.rationale === 'string' && item.rationale.trim()) {
        rationaleText = item.rationale;
      }
    }
    
    return (
      <div key={item.id} className="mb-3 p-3 bg-pure-black/60 rounded-lg border border-ink-500">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
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
              
              {/* Symbol */}
              {item.symbol && (
                <span className="px-2 py-1 rounded text-xs font-semibold bg-ink-500/50 text-floral-white border border-ink-400">
                  {item.symbol}
                </span>
              )}
              
              {/* Amount - REQUIRED */}
              {item.amount !== undefined && item.amount !== null && (
                <span className="px-2 py-1 rounded text-xs font-semibold bg-ink-500/50 text-floral-white border border-ink-400">
                  ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              
              {/* Allocation % */}
              {item.allocationPercent !== undefined && item.allocationPercent !== null && (
                <span className="px-2 py-1 rounded text-xs font-semibold bg-ink-500/50 text-floral-white border border-ink-400">
                  {item.allocationPercent.toFixed(1)}%
                </span>
              )}
              
              {/* Confidence % - REQUIRED */}
              {item.confidence !== undefined && item.confidence !== null && (
                <span className="px-2 py-1 rounded text-xs font-semibold bg-ink-500/50 text-floral-white border border-ink-400">
                  {item.confidence.toFixed(1)}% confidence
                </span>
              )}
              
              {/* Manager Approval Status - REQUIRED */}
              {item.approvalStatus && (
                <span className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 ${getApprovalStatusBadge(item.approvalStatus)}`}>
                  {getApprovalStatusIcon(item.approvalStatus)}
                  {item.approvalStatus}
                </span>
              )}
            </div>
            
            {/* Rationale Text - from structured data only */}
            <div className="text-floral-white text-sm font-mono mb-2">
              {rationaleText}
            </div>
          </div>
        </div>
        
        {/* Additional Metadata */}
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
        </div>
        
        {/* Manager Approval Reason */}
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
                ({acceptedItems.length} accepted, {rejectedItems.length} rejected, {pendingItems.length} pending)
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
              {/* Filter Toggle for Rejected Items */}
              {hasAnyItems && rejectedItems.length > 0 && (
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-ink-500">
                  <span className="text-xs text-floral-white/70 font-mono">
                    Show rejected items ({rejectedItems.length})
                  </span>
                  <button
                    onClick={() => setShowRejected(!showRejected)}
                    className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                      showRejected
                        ? 'bg-sage-green/20 text-sage-green border border-sage-green/40'
                        : 'bg-ink-500 text-floral-white/70 border border-ink-400'
                    }`}
                  >
                    {showRejected ? 'Hide' : 'Show'}
                  </button>
                </div>
              )}

              {/* Checklist Items - unified display from checklistItems[] */}
              {hasAnyItems && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-floral-white mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sage-green" />
                    Checklist Items ({allItems.length})
                  </h3>
                  <div className="space-y-2">
                    {filteredItems.map(renderChecklistItem)}
                  </div>
                  {!showRejected && rejectedItems.length > 0 && (
                    <div className="mt-3 text-xs text-floral-white/50 font-mono italic">
                      {rejectedItems.length} rejected item{rejectedItems.length !== 1 ? 's' : ''} hidden. Click "Show" to view.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

