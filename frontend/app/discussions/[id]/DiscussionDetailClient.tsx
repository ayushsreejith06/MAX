'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, MessageSquare, Clock, Users, CheckCircle, XCircle, Archive, Lock } from 'lucide-react';
import type { Discussion } from '@/lib/types';
import { fetchDiscussionById, addDiscussionMessage, closeDiscussion, archiveDiscussion, acceptDiscussion, rejectDiscussion } from '@/lib/api';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const discussionId = params?.id as string | undefined;

  const loadDiscussion = async () => {
    if (!discussionId || discussionId === 'placeholder') {
      setError('Invalid discussion ID');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchDiscussionById(discussionId);
      
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
  };

  useEffect(() => {
    loadDiscussion();
  }, [discussionId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDiscussion();
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
      await loadDiscussion();
    } catch (err) {
      console.error('Failed to send message', err);
      alert(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleStatusChange = async (action: 'close' | 'archive' | 'accept' | 'reject') => {
    if (!discussion) return;

    try {
      switch (action) {
        case 'close':
          await closeDiscussion(discussion.id);
          break;
        case 'archive':
          await archiveDiscussion(discussion.id);
          break;
        case 'accept':
          await acceptDiscussion(discussion.id);
          break;
        case 'reject':
          await rejectDiscussion(discussion.id);
          break;
      }
      await loadDiscussion();
    } catch (err) {
      console.error(`Failed to ${action} discussion`, err);
      alert(`Failed to ${action} discussion`);
    }
  };

  const getStatusMeta = (status: Discussion['status']) => {
    switch (status) {
      case 'in_progress':
        return { label: 'In Progress', className: 'bg-warning-amber/15 text-warning-amber border border-warning-amber/40', icon: Clock };
      case 'accepted':
        return { label: 'Accepted', className: 'bg-sage-green/15 text-sage-green border border-sage-green/40', icon: CheckCircle };
      case 'rejected':
        return { label: 'Rejected', className: 'bg-error-red/10 text-error-red border border-error-red/30', icon: XCircle };
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
            </div>
          </div>

          {/* Action Buttons */}
          {discussion.status === 'in_progress' && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => handleStatusChange('accept')}
                className="px-4 py-2 bg-sage-green/20 text-sage-green border border-sage-green/40 rounded-lg hover:bg-sage-green/30 transition-colors text-sm font-mono"
              >
                Accept
              </button>
              <button
                onClick={() => handleStatusChange('reject')}
                className="px-4 py-2 bg-error-red/20 text-error-red border border-error-red/40 rounded-lg hover:bg-error-red/30 transition-colors text-sm font-mono"
              >
                Reject
              </button>
              <button
                onClick={() => handleStatusChange('close')}
                className="px-4 py-2 bg-shadow-grey/50 text-floral-white border border-floral-white/20 rounded-lg hover:bg-shadow-grey transition-colors text-sm font-mono"
              >
                Close
              </button>
            </div>
          )}
          {(discussion.status === 'closed' || discussion.status === 'accepted' || discussion.status === 'rejected') && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => handleStatusChange('archive')}
                className="px-4 py-2 bg-shadow-grey/50 text-floral-white border border-floral-white/20 rounded-lg hover:bg-shadow-grey transition-colors text-sm font-mono"
              >
                Archive
              </button>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 bg-ink-600 text-floral-white border border-floral-white/10 rounded-lg hover:bg-ink-500 transition-colors text-sm font-mono disabled:opacity-50"
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
                  Messages ({discussion.messages.length})
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 max-h-96 overflow-y-auto bg-pure-black/60 font-mono text-sm">
            {discussion.messages.length === 0 ? (
              <p className="text-floral-white/50 text-center py-8">No messages yet</p>
            ) : (
              discussion.messages.map((message, index) => {
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
                    {index < discussion.messages.length - 1 && (
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
      </div>
    </div>
  );
}

