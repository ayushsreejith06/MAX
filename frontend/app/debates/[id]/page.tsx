"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getDebateById, type Debate } from "@/lib/api";

// Helper function to get status color classes
function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower === "created") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/50";
  if (statusLower === "debating") return "bg-blue-500/20 text-blue-300 border-blue-500/50";
  if (statusLower === "closed") return "bg-red-500/20 text-red-300 border-red-500/50";
  if (statusLower === "archived") return "bg-gray-500/20 text-gray-300 border-gray-500/50";
  return "bg-gray-700 text-gray-300 border-gray-600";
}

// Helper function to format timestamps
function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // For older dates, show formatted date
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DebateDetailPage() {
  const params = useParams();
  const debateId = params.id as string;

  const [debate, setDebate] = useState<Debate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDebate = async () => {
      try {
        setLoading(true);
        setError(null);

        const debateData = await getDebateById(debateId);
        setDebate(debateData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load debate");
        console.error("Error loading debate:", err);
      } finally {
        setLoading(false);
      }
    };

    if (debateId) {
      loadDebate();
    }
  }, [debateId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-8">
          <p className="text-gray-400">Loading debate...</p>
        </div>
      </div>
    );
  }

  if (error || !debate) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
          <p className="text-red-200">Error: {error || "Debate not found"}</p>
          <Link
            href="/sectors"
            className="mt-4 inline-block text-blue-400 hover:text-blue-300"
          >
            ← Back to Sectors
          </Link>
        </div>
      </div>
    );
  }

  // Sort messages chronologically by createdAt
  const sortedMessages = [...debate.messages].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/sectors/${debate.sectorId}`}
          className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
        >
          ← Back to Sector
        </Link>
        <h1 className="text-4xl font-bold text-white mb-2">{debate.title}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span className={`px-3 py-1 rounded-full border ${getStatusColor(debate.status)}`}>
            {debate.status}
          </span>
          <span>
            Created: {formatTimestamp(debate.createdAt)}
          </span>
          <span>
            Updated: {formatTimestamp(debate.updatedAt)}
          </span>
        </div>
      </div>

      {/* Messages Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Messages ({sortedMessages.length})
        </h2>
        {sortedMessages.length === 0 ? (
          <p className="text-gray-400">No messages in this debate yet.</p>
      ) : (
          <div className="space-y-0">
            {sortedMessages.map((message, index) => (
              <div key={index}>
                <div className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-white">
                        {message.role}
                      </span>
                      <span className="text-xs text-gray-400">
                        Agent: {message.agentId.slice(0, 8)}...
                      </span>
                    </div>
                    <span className="text-xs text-gray-400" title={new Date(message.createdAt).toLocaleString()}>
                      {formatTimestamp(message.createdAt)}
                    </span>
                  </div>
                  <p className="text-gray-300 whitespace-pre-wrap">
                    {message.content}
                  </p>
              </div>
                {index < sortedMessages.length - 1 && (
                  <div className="h-px bg-gray-600 my-4 mx-4"></div>
                )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
