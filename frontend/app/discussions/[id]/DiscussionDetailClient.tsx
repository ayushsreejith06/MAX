'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, MessageSquare, Clock, Users, CheckCircle, XCircle, Archive, Lock, Settings, Trash2 } from 'lucide-react';
import type { Discussion, Message } from '@/lib/types';
import { fetchDiscussionById, fetchDiscussionMessages, addDiscussionMessage, sendMessageToManager, deleteDiscussion } from '@/lib/api';
import ChecklistSection from '@/components/discussions/ChecklistSection';

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

  const loadDiscussion = useCallback(async () => {
    if (!discussionId || discussionId === 'placeholder') {
      setError('Invalid discussion ID');
      setLoading(false);
      setMessagesLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchDiscussionById(discussionId);
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[DiscussionDetail] fetch result:', data);
      }
      
      if (data) {
        setDiscussion(data);
        setError(null);
      } else {
        setError('Discussion not found');
        setDiscussion(null);
      }
    } catch (err) {
      console.error('Failed to fetch discussion', err);
      const errorMessage = err instanceof Error ? err.message : 'Unable to load discussion. Please try again later.';
      setError(errorMessage);
      setDiscussion(null);
    } finally {
      setLoading(false);
    }
  }, [discussionId]);

  const loadMessages = useCallback(async () => {
    if (!discussionId || discussionId === 'placeholder') {
      setMessagesLoading(false);
      return;
    }

    try {
      setMessagesLoading(true);
      const messagesData = await fetchDiscussionMessages(discussionId);
      setMessages(messagesData);
    } catch (err) {
      console.error('Failed to fetch messages', err);
      // Don't set error state for messages - just log it
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, [discussionId]);

  useEffect(() => {
    loadDiscussion();
    loadMessages();
  }, [loadDiscussion, loadMessages]);

  // Poll for status updates when discussion is active (to detect when it becomes decided)
  useEffect(() => {
    if (!discussionId || discussionId === 'placeholder') {
      return;
    }

    // Only poll if discussion is in progress (to detect when it becomes decided)
    const shouldPoll = discussion && discussion.status === 'in_progress';

    if (!shouldPoll) {
      return;
    }

    const interval = setInterval(() => {
      loadDiscussion();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [discussionId, discussion?.status, loadDiscussion]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadDiscussion(), loadMessages()]);
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
      // Reload both discussion and messages
      await Promise.all([loadDiscussion(), loadMessages()]);
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
    // Normalize legacy statuses to 'decided' for display
    const normalizedStatus = (status === 'finalized' || status === 'accepted' || status === 'completed') ? 'decided' : status;
    
    switch (normalizedStatus) {
      case 'in_progress':
        return { label: 'In Progress', className: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40', icon: Clock };
      case 'decided':
        return { label: 'Decided', className: 'bg-sage-green/15 text-sage-green border border-sage-green/40', icon: CheckCircle };
      case 'closed':
        return { label: 'Closed', className: 'bg-shadow-grey text-floral-white border border-floral-white/20', icon: Lock };
      case 'archived':
        return { label: 'Archived', className: 'bg-shadow-grey/50 text-floral-white/70 border border-floral-white/10', icon: Archive };
      default:
        return { label: status, className: 'bg-shadow-grey text-floral-white', icon: MessageSquare };
    }
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
                      {message.content}
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

