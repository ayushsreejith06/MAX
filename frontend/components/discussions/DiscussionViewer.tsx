'use client';

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { MessageSquare, Clock, CheckCircle2, Circle } from 'lucide-react';
import type { Discussion, Message, ChecklistItem } from '@/lib/types';
import { fetchDiscussionById } from '@/lib/api';

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

interface MessageGroup {
  round: number;
  messages: Message[];
}

interface DiscussionViewerProps {
  discussionId: string;
  initialDiscussion?: Discussion | null;
  onDiscussionUpdate?: (discussion: Discussion) => void;
}

// Memoized message item component to prevent unnecessary re-renders
const MessageItem = memo(function MessageItem({ message }: { message: Message }) {
  const theme = getAgentTheme(message.agentName);
  
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-start gap-2 mb-1 flex-wrap">
        <span className="text-sage-green font-mono text-xs">
          {formatTimestamp(message.timestamp)}
        </span>
        <span
          className={`font-semibold px-2 py-0.5 rounded-full border text-xs tracking-wide ${theme.text} ${theme.border} ${theme.bg}`}
        >
          {message.agentName}
          {message.role && (
            <span className="ml-1 text-[0.7rem] opacity-75">
              ({message.role})
            </span>
          )}
        </span>
      </div>
      <div className="ml-4 pl-3 border-l-2 border-sage-green/30 text-floral-white">
        {message.content}
      </div>
    </div>
  );
});

// Memoized round header component
const RoundHeader = memo(function RoundHeader({ round }: { round: number }) {
  return (
    <div className="sticky top-0 bg-ink-600/95 backdrop-blur-sm z-10 py-3 mb-4 border-b border-sage-green/30">
      <div className="flex items-center gap-2">
        <Circle className="w-4 h-4 text-sage-green" />
        <span className="text-sm font-semibold uppercase tracking-wide text-sage-green font-mono">
          Round {round}
        </span>
      </div>
    </div>
  );
});

// Memoized checklist item component
const ChecklistItemComponent = memo(function ChecklistItemComponent({ 
  item, 
  isDraft 
}: { 
  item: ChecklistItem; 
  isDraft: boolean;
}) {
  const theme = item.agentName ? getAgentTheme(item.agentName) : null;
  
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-ink-500 bg-ink-600/40">
      {isDraft ? (
        <Circle className="w-4 h-4 text-warning-amber mt-0.5 flex-shrink-0" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-sage-green mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-floral-white text-sm">{item.text}</p>
        {(item.agentName || item.round) && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {item.agentName && theme && (
              <span
                className={`text-xs px-2 py-0.5 rounded border ${theme.text} ${theme.border} ${theme.bg}`}
              >
                {item.agentName}
              </span>
            )}
            {item.round && (
              <span className="text-xs text-floral-white/50 font-mono">
                Round {item.round}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default function DiscussionViewer({ 
  discussionId, 
  initialDiscussion = null,
  onDiscussionUpdate 
}: DiscussionViewerProps) {
  const [discussion, setDiscussion] = useState<Discussion | null>(initialDiscussion);
  const [loading, setLoading] = useState(!initialDiscussion);
  const [error, setError] = useState<string | null>(null);

  // Group messages by round
  const messagesByRound = useMemo(() => {
    if (!discussion?.messages || discussion.messages.length === 0) {
      return [];
    }

    // Sort messages chronologically
    const sortedMessages = [...discussion.messages].sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    // Group messages by round
    // Each round typically has one message per agent (based on DiscussionEngine.runRound)
    const agentCount = Math.max(discussion.agentIds?.length || 1, 1);
    const groups: MessageGroup[] = [];
    
    // Create a map from checklistDraft to help identify rounds
    const draftRoundMap = new Map<string, number>();
    if (discussion.checklistDraft) {
      discussion.checklistDraft.forEach((item) => {
        if (item.agentId && item.round) {
          // Store the round for this agent's message
          draftRoundMap.set(item.agentId, item.round);
        }
      });
    }

    // Group messages: each round has approximately agentCount messages
    for (let i = 0; i < sortedMessages.length; i += agentCount) {
      const roundMessages = sortedMessages.slice(i, i + agentCount);
      if (roundMessages.length > 0) {
        // Determine round number: use checklistDraft info if available, otherwise infer from position
        let roundNumber = Math.floor(i / agentCount) + 1;
        
        // Try to get round from checklistDraft for messages in this group
        for (const msg of roundMessages) {
          if (msg.agentId && draftRoundMap.has(msg.agentId)) {
            roundNumber = draftRoundMap.get(msg.agentId)!;
            break;
          }
        }
        
        groups.push({
          round: roundNumber,
          messages: roundMessages,
        });
      }
    }

    return groups;
  }, [discussion?.messages, discussion?.agentIds, discussion?.checklistDraft]);

  // Load discussion function
  const loadDiscussion = useCallback(async () => {
    if (!discussionId) {
      setError('Invalid discussion ID');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await fetchDiscussionById(discussionId);
      
      if (data) {
        setDiscussion(data);
        if (onDiscussionUpdate) {
          onDiscussionUpdate(data);
        }
      } else {
        setError('Discussion not found');
        setDiscussion(null);
      }
    } catch (err) {
      console.error('Failed to fetch discussion', err);
      const errorMessage = err instanceof Error ? err.message : 'Unable to load discussion.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [discussionId, onDiscussionUpdate]);

  // Initial load
  useEffect(() => {
    if (!initialDiscussion) {
      loadDiscussion();
    }
  }, [initialDiscussion, loadDiscussion]);

  // Poll for updates every 1-2 seconds (only for active discussions)
  useEffect(() => {
    if (!discussionId || !isActive) {
      return;
    }

    const interval = setInterval(() => {
      loadDiscussion();
    }, 1500); // Poll every 1.5 seconds

    return () => clearInterval(interval);
  }, [discussionId, isActive, loadDiscussion]);

  // Determine if discussion is active (still in progress)
  const isActive = discussion?.status === 'in_progress';
  const isCompleted = discussion?.status === 'decided' || 
                      discussion?.status === 'finalized' || // Legacy status
                      discussion?.status === 'accepted' || // Legacy status
                      discussion?.status === 'completed' || // Legacy status
                      discussion?.status === 'closed' || 
                      discussion?.status === 'archived';
  
  const showChecklistDraft = isActive && discussion?.checklistDraft && discussion.checklistDraft.length > 0;
  const showFinalizedChecklist = isCompleted && discussion?.checklist && discussion.checklist.length > 0;

  if (loading) {
    return (
      <div className="p-4 bg-ink-600/60 rounded-lg border border-ink-500">
        <p className="text-floral-white/70 font-mono text-sm">Loading discussion...</p>
      </div>
    );
  }

  if (error || !discussion) {
    return (
      <div className="p-4 bg-ink-600/60 rounded-lg border border-ink-500">
        <p className="text-error-red font-mono text-sm">{error || 'Discussion not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Messages Section */}
      <div className="bg-ink-600/60 rounded-lg border border-ink-500 overflow-hidden">
        <div className="bg-ink-600/80 px-4 py-3 border-b border-ink-500">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sage-green" />
            <span className="text-sm font-semibold uppercase tracking-wide text-floral-white">
              Messages ({discussion.messages.length})
            </span>
            {discussion.round && (
              <span className="text-xs text-floral-white/50 font-mono ml-auto">
                Current Round: {discussion.round}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 max-h-96 overflow-y-auto bg-pure-black/60 font-mono text-sm">
          {messagesByRound.length === 0 ? (
            <p className="text-floral-white/50 text-center py-8">No messages yet</p>
          ) : (
            messagesByRound.map((group) => (
              <div key={`round-${group.round}`} className="mb-6 last:mb-0">
                <RoundHeader round={group.round} />
                {group.messages.map((message) => (
                  <MessageItem key={message.id} message={message} />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Checklist Draft (Active Discussions) */}
      {showChecklistDraft && (
        <div className="bg-ink-600/60 rounded-lg border border-ink-500 overflow-hidden">
          <div className="bg-ink-600/80 px-4 py-3 border-b border-ink-500">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning-amber" />
              <span className="text-sm font-semibold uppercase tracking-wide text-floral-white">
                Checklist Draft ({discussion.checklistDraft?.length || 0})
              </span>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {discussion.checklistDraft?.map((item) => (
              <ChecklistItemComponent key={item.id} item={item} isDraft={true} />
            ))}
          </div>
        </div>
      )}

      {/* Finalized Checklist (Completed Discussions) */}
      {showFinalizedChecklist && (
        <div className="bg-ink-600/60 rounded-lg border border-ink-500 overflow-hidden">
          <div className="bg-ink-600/80 px-4 py-3 border-b border-ink-500">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sage-green" />
              <span className="text-sm font-semibold uppercase tracking-wide text-floral-white">
                Finalized Checklist ({discussion.checklist?.length || 0})
              </span>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {discussion.checklist?.map((item) => (
              <ChecklistItemComponent key={item.id} item={item} isDraft={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

