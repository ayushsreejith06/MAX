"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getDebateById, postDebateMessage, closeDebate, getAgents, type Debate, type Agent } from "@/lib/api";

export default function DebateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const debateId = params.id as string;

  const [debate, setDebate] = useState<Debate | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [posting, setPosting] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const debateData = await getDebateById(debateId);
        setDebate(debateData);

        // Load agents to get their roles for posting messages
        const allAgents = await getAgents();
        setAgents(allAgents);

        // Set default selected agent if available
        if (debateData.agentIds.length > 0 && !selectedAgentId) {
          setSelectedAgentId(debateData.agentIds[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load debate");
        console.error("Error loading debate:", err);
      } finally {
        setLoading(false);
      }
    };

    if (debateId) {
      loadData();
    }
  }, [debateId]);

  const handlePostMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() || !selectedAgentId || !debate) return;

    const selectedAgent = agents.find(a => a.id === selectedAgentId);
    if (!selectedAgent) {
      setError("Selected agent not found");
      return;
    }

    try {
      setPosting(true);
      setError(null);
      await postDebateMessage(debateId, selectedAgentId, messageContent.trim(), selectedAgent.role);
      setMessageContent("");
      
      // Refresh debate data
      const updatedDebate = await getDebateById(debateId);
      setDebate(updatedDebate);
      
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post message");
      console.error("Error posting message:", err);
    } finally {
      setPosting(false);
    }
  };

  const handleCloseDebate = async () => {
    if (!debate) return;

    try {
      setClosing(true);
      setError(null);
      await closeDebate(debateId);
      
      // Refresh debate data
      const updatedDebate = await getDebateById(debateId);
      setDebate(updatedDebate);
      
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close debate");
      console.error("Error closing debate:", err);
    } finally {
      setClosing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created':
        return 'bg-gray-600';
      case 'debating':
        return 'bg-blue-600';
      case 'closed':
        return 'bg-green-600';
      case 'archived':
        return 'bg-gray-500';
      default:
        return 'bg-gray-600';
    }
  };

  const isOpen = debate && (debate.status === 'created' || debate.status === 'debating');
  const debateAgents = agents.filter(a => debate?.agentIds.includes(a.id));

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-8">
          <p className="text-gray-400">Loading debate...</p>
        </div>
      </div>
    );
  }

  if (error && !debate) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
          <p className="text-red-200">Error: {error}</p>
          <Link
            href="/debates"
            className="mt-4 inline-block text-blue-400 hover:text-blue-300"
          >
            ← Back to Debates
          </Link>
        </div>
      </div>
    );
  }

  if (!debate) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
          <p className="text-red-200">Debate not found</p>
          <Link
            href="/debates"
            className="mt-4 inline-block text-blue-400 hover:text-blue-300"
          >
            ← Back to Debates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/debates"
          className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
        >
          ← Back to Debates
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">{debate.title}</h1>
            <div className="flex items-center gap-4">
              <span
                className={`inline-block px-3 py-1 rounded text-sm font-semibold text-white ${getStatusColor(debate.status)}`}
              >
                {debate.status}
              </span>
              <p className="text-gray-400 text-sm">
                Sector ID: {debate.sectorId.slice(0, 8)}...
              </p>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              <p>Created: {new Date(debate.createdAt).toLocaleString()}</p>
              <p>Updated: {new Date(debate.updatedAt).toLocaleString()}</p>
            </div>
          </div>
          {isOpen && (
            <button
              onClick={handleCloseDebate}
              disabled={closing}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {closing ? "Closing..." : "Close Debate"}
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-200">Error: {error}</p>
        </div>
      )}

      {/* Messages Section */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Messages ({debate.messages.length})
        </h2>
        {debate.messages.length === 0 ? (
          <p className="text-gray-400">No messages yet.</p>
        ) : (
          <div className="space-y-4">
            {debate.messages.map((message, index) => {
              const agent = agents.find(a => a.id === message.agentId);
              return (
                <div
                  key={index}
                  className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">
                        {agent?.role || message.role}
                      </span>
                      <span className="text-gray-400 text-sm">
                        ({message.agentId.slice(0, 8)}...)
                      </span>
                    </div>
                    <span className="text-gray-500 text-xs">
                      {new Date(message.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-300 whitespace-pre-wrap">{message.content}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Message Input (only if debate is open) */}
      {isOpen && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Post Message</h2>
          <form onSubmit={handlePostMessage} className="space-y-4">
            <div>
              <label className="block text-gray-300 mb-2">Agent</label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select an agent</option>
                {debateAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.role} ({agent.id.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-300 mb-2">Message</label>
              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Enter your message..."
                rows={4}
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={posting || !messageContent.trim() || !selectedAgentId}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {posting ? "Posting..." : "Post Message"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

