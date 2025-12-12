'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, MessageSquare, Clock, Users, CheckCircle, XCircle, Archive, Lock, Settings, Trash2 } from 'lucide-react';
import type { Discussion, Message } from '@/lib/types';
import { fetchDiscussionById, fetchDiscussionMessages, addDiscussionMessage, sendMessageToManager, deleteDiscussion, isSkippedResult, isRateLimitError } from '@/lib/api';
import ChecklistSection from '@/components/discussions/ChecklistSection';
import { usePolling } from '@/hooks/usePolling';
import { getStatusColor, getStatusLabel } from '@/lib/statusColors';
import { formatMessageContent } from '@/utils/formatMessage';

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

export default function DiscussionDetailClient() {
  const params = useParams();
  const router = useRouter();
  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState('');
  const [sendingOverride, setSendingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideSuccess, setOverrideSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const discussionId = params?.id as string | undefined;

  // Refs to track previous data and prevent unnecessary updates
  const previousDiscussionRef = useRef<string>('');
  const previousMessagesRef = useRef<string>('');
  const isFetchingDiscussionRef = useRef(false);
  const isFetchingMessagesRef = useRef(false);
  const currentDiscussionRef = useRef<Discussion | null>(null);
  const currentMessagesRef = useRef<Message[]>([]);

  // Helper function to check if discussion data changed
  const hasDiscussionChanged = useCallback((newDiscussion: Discussion | null): boolean => {
    if (!newDiscussion) return false;
    
    const discussionKey = JSON.stringify({
      id: newDiscussion.id,
      status: newDiscussion.status,
      title: newDiscussion.title,
      updatedAt: newDiscussion.updatedAt,
      agentIds: newDiscussion.agentIds?.length || 0,
      sectorId: newDiscussion.sectorId,
      sectorSymbol: newDiscussion.sectorSymbol,
    });

    if (previousDiscussionRef.current !== discussionKey) {
      previousDiscussionRef.current = discussionKey;
      return true;
    }
    return false;
  }, []);

  // Helper function to check if messages data changed
  const hasMessagesChanged = useCallback((newMessages: Message[]): boolean => {
    const messagesKey = JSON.stringify(newMessages.map(m => ({
      id: m.id,
      content: m.content,
      timestamp: m.timestamp,
      agentName: m.agentName,
    })));

    if (previousMessagesRef.current !== messagesKey) {
      previousMessagesRef.current = messagesKey;
      return true;
    }
    return false;
  }, []);

  const loadDiscussion = useCallback(async (showLoading = false) => {
    if (!discussionId || discussionId === 'placeholder') {
      if (showLoading) {
        setError('Invalid discussion ID');
        setLoading(false);
      }
      return;
    }

    // Race condition guard
    if (isFetchingDiscussionRef.current) {
      return;
    }

    try {
      if (showLoading) {
        setLoading(true);
      }
      isFetchingDiscussionRef.current = true;
      setError(null);
      
      const data = await fetchDiscussionById(discussionId);
      
      // Handle skipped requests
      if (isSkippedResult(data) || data === null) {
        if (showLoading) {
          setError('Discussion not found');
          setDiscussion(null);
        }
        return;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[DiscussionDetail] fetch result:', data);
      }
      
      // Only update if data actually changed (prevents flickering)
      if (hasDiscussionChanged(data)) {
        setDiscussion(data);
        currentDiscussionRef.current = data; // Update ref immediately
        setError(null);
      }
    } catch (err) {
      // Only handle actual server rate limit errors (HTTP 429)
      if (isRateLimitError(err)) {
        if (!showLoading) {
          // During polling, silently skip - will retry on next poll
          console.debug('Server rate limited during polling, will retry automatically');
          isFetchingDiscussionRef.current = false;
          return;
        } else {
          // During initial load, wait a bit and retry once
          console.debug('Server rate limited on initial load, retrying after delay...');
          isFetchingDiscussionRef.current = false;
          setTimeout(() => {
            void loadDiscussion(showLoading);
          }, 1000);
          return;
        }
      }
      console.error('Failed to fetch discussion', err);
      if (showLoading) {
        const errorMessage = err instanceof Error ? err.message : 'Unable to load discussion. Please try again later.';
        setError(errorMessage);
        setDiscussion(null);
      }
    } finally {
      if (showLoading && isFetchingDiscussionRef.current) {
        setLoading(false);
      }
      isFetchingDiscussionRef.current = false;
    }
  }, [discussionId, hasDiscussionChanged]);

  const loadMessages = useCallback(async (showLoading = false) => {
    if (!discussionId || discussionId === 'placeholder') {
      if (showLoading) {
        setMessagesLoading(false);
      }
      return;
    }

    // Race condition guard
    if (isFetchingMessagesRef.current) {
      return;
    }

    try {
      if (showLoading) {
        setMessagesLoading(true);
      }
      isFetchingMessagesRef.current = true;
      
      const messagesData = await fetchDiscussionMessages(discussionId);
      
      // Handle skipped requests - if we get empty array when we had messages, likely skipped
      // But also check if messages actually changed to prevent unnecessary updates
      if (Array.isArray(messagesData) && messagesData.length === 0 && currentMessagesRef.current.length > 0) {
        // Likely skipped - don't update state, just return
        return;
      }

      // Only update if messages actually changed (prevents flickering)
      // This handles both new messages and skipped requests (same data = no update)
      if (hasMessagesChanged(messagesData)) {
        setMessages(messagesData);
        currentMessagesRef.current = messagesData; // Update ref immediately
      }
    } catch (err) {
      // Only handle actual server rate limit errors (HTTP 429)
      if (isRateLimitError(err)) {
        if (!showLoading) {
          // During polling, silently skip - will retry on next poll
          console.debug('Server rate limited during polling, will retry automatically');
          isFetchingMessagesRef.current = false;
          return;
        }
      }
      console.error('Failed to fetch messages', err);
      // Don't set error state for messages - just log it
      if (showLoading) {
        setMessages([]);
      }
    } finally {
      if (showLoading && isFetchingMessagesRef.current) {
        setMessagesLoading(false);
      }
      isFetchingMessagesRef.current = false;
    }
  }, [discussionId, hasMessagesChanged]);

  // Update refs when state changes
  useEffect(() => {
    currentDiscussionRef.current = discussion;
  }, [discussion]);

  useEffect(() => {
    currentMessagesRef.current = messages;
  }, [messages]);

  // Initial load with loading state
  useEffect(() => {
    void loadDiscussion(true);
    void loadMessages(true);
  }, [discussionId]); // Only reload when discussionId changes

  // Auto-start rounds if discussion is OPEN and has no messages
  useEffect(() => {
    if (discussion && discussion.status === 'OPEN' && discussion.messages.length === 0) {
      // Automatically trigger rounds - this will happen in the background
      // The polling will pick up the messages once they're generated
      console.log('[DiscussionDetail] Discussion is OPEN with no messages - rounds should start automatically on backend');
    }
  }, [discussion]);

  // Polling callbacks for auto-refresh (without loading state)
  const pollDiscussion = useCallback(async () => {
    // Poll if discussion is in progress or OPEN (to detect when it becomes decided or when messages appear)
    const status = currentDiscussionRef.current?.status;
    if (status === 'in_progress' || status === 'OPEN' || status === 'open') {
      await loadDiscussion(false);
    }
  }, [loadDiscussion]);

  const pollMessages = useCallback(async () => {
    // Poll if discussion is in progress or OPEN (messages are still being added)
    const status = currentDiscussionRef.current?.status;
    if (status === 'in_progress' || status === 'OPEN' || status === 'open') {
      await loadMessages(false);
    }
  }, [loadMessages]);

  // Use centralized polling utility with 1500ms interval for live updates
  usePolling({
    callback: pollDiscussion,
    interval: 1500,
    enabled: !!discussionId && discussionId !== 'placeholder',
    pauseWhenHidden: true,
    immediate: false, // Don't call immediately since we already loaded above
    allowLowerInterval: true, // Allow 1500ms interval
  });

  usePolling({
    callback: pollMessages,
    interval: 1500,
    enabled: !!discussionId && discussionId !== 'placeholder',
    pauseWhenHidden: true,
    immediate: false, // Don't call immediately since we already loaded above
    allowLowerInterval: true, // Allow 1500ms interval
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadDiscussion(true), loadMessages(true)]);
    setIsRefreshing(false);
  };

  const handleSendMessage = async () => {
    if (!discussion || !newMessage.trim() || sendingMessage) return;

    try {
      setSendingMessage(true);
      // For now, we'll need agentId - in a real implementation, this would come from context
      // For testing, we'll use the first agentId from the discussion
      const agentId = discussion.agentIds[0];
      if (!agentId) {
        throw new Error('No agents in this discussion');
      }

      await addDiscussionMessage(discussion.id, {
        agentId,
        content: newMessage.trim(),
        role: 'agent'
      });

      setNewMessage('');
      // Reload both discussion and messages (with loading state since user action)
      await Promise.all([loadDiscussion(true), loadMessages(true)]);
    } catch (err) {
      console.error('Failed to send message', err);
      alert(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleManualOverride = async () => {
    if (!discussion || !overrideMessage.trim() || sendingOverride) return;

    const sectorId = discussion.sectorId;
    if (!sectorId) {
      setOverrideError('Discussion does not have a sector ID');
      return;
    }

    try {
      setSendingOverride(true);
      setOverrideError(null);
      setOverrideSuccess(null);

      // Include discussion context in the message
      const messageWithContext = `Regarding discussion "${discussion.title}" (ID: ${discussion.id}):\n\n${overrideMessage.trim()}`;
      
      await sendMessageToManager(sectorId, messageWithContext);
      setOverrideSuccess('Message sent successfully to manager agent.');
      setOverrideMessage('');
      
      // Close modal after a short delay
      setTimeout(() => {
        setShowManualOverride(false);
        setOverrideSuccess(null);
      }, 1500);
    } catch (err) {
      console.error('Failed to send message to manager', err);
      setOverrideError(err instanceof Error ? err.message : 'Failed to send message to manager. Please try again.');
    } finally {
      setSendingOverride(false);
    }
  };


  const handleDelete = async () => {
    if (!discussion || isDeleting) return;

    const confirmed = window.confirm(`Are you sure you want to delete this discussion?\n\n"${discussion.title}"\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      await deleteDiscussion(discussion.id);
      // Navigate back to discussions list after successful deletion
      router.push('/discussions');
    } catch (err) {
      console.error('Failed to delete discussion', err);
      alert(err instanceof Error ? err.message : 'Failed to delete discussion. Please try again.');
      setIsDeleting(false);
    }
  };

  const getStatusMeta = (status: Discussion['status']) => {
    // Use centralized status color utility - DECIDED is green, IN PROGRESS is orange
    const label = getStatusLabel(status);
    const className = getStatusColor(status);
    
    // Determine icon based on normalized status
    const statusLower = (status || '').toLowerCase();
    let icon = MessageSquare;
    if (statusLower === 'in_progress' || statusLower === 'open' || statusLower === 'active' || statusLower === 'created' || 
        statusLower === 'OPEN' || statusLower === 'ACTIVE' || statusLower === 'CREATED') {
      icon = Clock;
    } else if (statusLower === 'decided' || statusLower === 'closed' || statusLower === 'finalized' || 
               statusLower === 'accepted' || statusLower === 'completed' ||
               statusLower === 'DECIDED' || statusLower === 'CLOSED' || statusLower === 'FINALIZED' || 
               statusLower === 'ACCEPTED' || statusLower === 'COMPLETED') {
      icon = CheckCircle;
    }
    
    return { label, className, icon };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pure-black p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-floral-white/70 font-mono">Loading discussion...</p>
        </div>
      </div>
    );
  }

  if (error || !discussion) {
    return (
      <div className="min-h-screen bg-pure-black p-8">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.push('/discussions')}
            className="mb-4 flex items-center gap-2 text-sage-green hover:text-sage-green/80 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Discussions
          </button>
          <p className="text-error-red font-mono">{error || 'Discussion not found'}</p>
        </div>
      </div>
    );
  }

  const statusMeta = getStatusMeta(discussion.status);
  const StatusIcon = statusMeta.icon;

  return (
    <div className="min-h-screen bg-pure-black p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/discussions')}
            className="mb-4 flex items-center gap-2 text-sage-green hover:text-sage-green/80 transition-colors font-mono text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Discussions
          </button>

          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-floral-white mb-2">{discussion.title}</h1>
              <div className="flex items-center gap-4 text-sm text-floral-white/70">
                <span className="font-mono">ID: {discussion.id}</span>
                <span className="font-mono">Sector: {discussion.sectorSymbol || discussion.sectorId}</span>
                <span className="font-mono">
                  Created: {new Date(discussion.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide border flex items-center gap-2 ${statusMeta.className}`}>
                <StatusIcon className="w-4 h-4" />
                {statusMeta.label}
              </span>
              <button
                onClick={() => setShowManualOverride(true)}
                className="px-4 py-2 bg-warning-amber/20 text-warning-amber border border-warning-amber/40 rounded-lg hover:bg-warning-amber/30 transition-colors text-sm font-mono flex items-center gap-2"
                title="Send a message to the manager agent about this discussion"
              >
                <Settings className="w-4 h-4" />
                Manual Override
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-error-red/20 text-error-red border border-error-red/40 rounded-lg hover:bg-error-red/30 transition-colors text-sm font-mono flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete this discussion"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 bg-ink-600 text-floral-white border border-floral-white/10 rounded-lg hover:bg-ink-500 transition-colors text-sm font-mono disabled:opacity-50 mb-4"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Participants */}
        <div className="mb-6 bg-ink-600/60 rounded-lg border border-ink-500 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-sage-green" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-floral-white">Participants</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {discussion.agentIds.map((agentId) => {
              // In a real implementation, we'd fetch agent names
              const theme = getAgentTheme(agentId);
              return (
                <span
                  key={agentId}
                  className={`text-xs px-2 py-1 rounded border ${theme.text} ${theme.border} ${theme.bg} font-mono`}
                >
                  {agentId}
                </span>
              );
            })}
          </div>
        </div>

        {/* Messages */}
        <div className="bg-ink-600/60 rounded-lg border border-ink-500 overflow-hidden">
          <div className="bg-ink-600/80 px-4 py-3 border-b border-ink-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-sage-green" />
                <span className="text-sm font-semibold uppercase tracking-wide text-floral-white">
                  Messages ({messages.length})
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 max-h-96 overflow-y-auto bg-pure-black/60 font-mono text-sm">
            {messagesLoading ? (
              <p className="text-floral-white/50 text-center py-8">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-floral-white/50 text-center py-8">No messages yet</p>
            ) : (
              messages.map((message, index) => {
                const theme = getAgentTheme(message.agentName);
                return (
                  <div key={message.id || index} className="mb-4 last:mb-0">
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
                      {formatMessageContent(message.content)}
                    </div>
                    {index < messages.length - 1 && (
                      <div className="mt-3 border-t border-floral-white/10"></div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Add Message (only if in progress) */}
          {discussion.status === 'in_progress' && (
            <div className="p-4 border-t border-ink-500 bg-ink-600/40">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-pure-black border border-floral-white/10 rounded-lg text-floral-white placeholder-floral-white/50 focus:border-sage-green focus:outline-none font-mono text-sm"
                  disabled={sendingMessage}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendingMessage}
                  className="px-4 py-2 bg-sage-green text-pure-black rounded-lg hover:bg-sage-green/80 transition-colors font-mono text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingMessage ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Checklist Section */}
        <ChecklistSection
          discussionId={discussion.id}
          discussionStatus={discussion.status}
        />
      </div>

      {/* Manual Override Modal */}
      {showManualOverride && (
        <div className="fixed inset-0 bg-pure-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-ink-600 rounded-lg border border-ink-500 p-6 max-w-2xl w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-floral-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-warning-amber" />
                Manual Override
              </h2>
              <button
                onClick={() => {
                  setShowManualOverride(false);
                  setOverrideMessage('');
                  setOverrideError(null);
                  setOverrideSuccess(null);
                }}
                className="text-floral-white/70 hover:text-floral-white transition-colors"
              >
                ✕
              </button>
            </div>
            
            <p className="text-sm text-floral-white/70 mb-4 font-mono">
              Send a message to the manager agent about this discussion. The manager will review your input and make decisions accordingly.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-floral-white mb-2 font-mono">
                Message to Manager:
              </label>
              <textarea
                value={overrideMessage}
                onChange={(e) => setOverrideMessage(e.target.value)}
                placeholder="Enter your message or instructions for the manager agent regarding this discussion..."
                className="w-full px-4 py-3 bg-pure-black border border-floral-white/10 rounded-lg text-floral-white placeholder-floral-white/50 focus:border-warning-amber focus:outline-none font-mono text-sm min-h-[120px] resize-y"
                disabled={sendingOverride}
              />
            </div>

            {overrideError && (
              <div className="mb-4 p-3 bg-error-red/20 border border-error-red/40 rounded-lg">
                <p className="text-error-red text-sm font-mono">{overrideError}</p>
              </div>
            )}

            {overrideSuccess && (
              <div className="mb-4 p-3 bg-sage-green/20 border border-sage-green/40 rounded-lg">
                <p className="text-sage-green text-sm font-mono">{overrideSuccess}</p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowManualOverride(false);
                  setOverrideMessage('');
                  setOverrideError(null);
                  setOverrideSuccess(null);
                }}
                className="px-4 py-2 bg-shadow-grey/50 text-floral-white border border-floral-white/20 rounded-lg hover:bg-shadow-grey transition-colors text-sm font-mono"
                disabled={sendingOverride}
              >
                Cancel
              </button>
              <button
                onClick={handleManualOverride}
                disabled={!overrideMessage.trim() || sendingOverride}
                className="px-4 py-2 bg-warning-amber text-pure-black rounded-lg hover:bg-warning-amber/80 transition-colors text-sm font-mono font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingOverride ? 'Sending...' : 'Send to Manager'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

