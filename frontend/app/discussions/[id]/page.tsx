"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getDiscussionById, type Discussion } from "@/lib/api";

export default function DiscussionDetailPage() {
  const params = useParams();
  const discussionId = params.id as string;

  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const discussionData = await getDiscussionById(discussionId);
        setDiscussion(discussionData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load discussion");
        console.error("Error loading discussion:", err);
      } finally {
        setLoading(false);
      }
    };

    if (discussionId) {
      loadData();
    }
  }, [discussionId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "created":
        return "bg-blue-900/50 border-blue-700 text-blue-200";
      case "discussing":
        return "bg-green-900/50 border-green-700 text-green-200";
      case "closed":
        return "bg-gray-700 border-gray-600 text-gray-300";
      case "archived":
        return "bg-gray-800 border-gray-700 text-gray-400";
      default:
        return "bg-gray-800 border-gray-700 text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-8">
          <p className="text-gray-400">Loading discussion...</p>
        </div>
      </div>
    );
  }

  if (error || !discussion) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
          <p className="text-red-200">Error: {error || "Discussion not found"}</p>
          <Link
            href="/discussions"
            className="mt-4 inline-block text-blue-400 hover:text-blue-300"
          >
            ← Back to Discussions
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
          href="/discussions"
          className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
        >
          ← Back to Discussions
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">{discussion.title}</h1>
            <p className="text-gray-400">
              Discussion ID: {discussion.id}
            </p>
            <p className="text-gray-400">
              Sector ID: {discussion.sectorId}
            </p>
            {discussion.createdAt && (
              <p className="text-sm text-gray-500 mt-2">
                Created: {new Date(discussion.createdAt).toLocaleString()}
              </p>
            )}
            {discussion.updatedAt && (
              <p className="text-sm text-gray-500">
                Updated: {new Date(discussion.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div>
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium border ${getStatusColor(
                discussion.status
              )}`}
            >
              {discussion.status}
            </span>
          </div>
        </div>
      </div>

      {/* Agents Section */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Participants ({discussion.agentIds.length})
        </h2>
        {discussion.agentIds.length === 0 ? (
          <p className="text-gray-400">No agents assigned to this discussion.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {discussion.agentIds.map((agentId) => (
              <span
                key={agentId}
                className="px-3 py-1 bg-gray-700 rounded-lg text-sm text-gray-300 border border-gray-600"
              >
                {agentId.slice(0, 8)}...
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Messages Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Messages ({discussion.messages.length})
        </h2>
        {discussion.messages.length === 0 ? (
          <p className="text-gray-400">No messages in this discussion yet.</p>
        ) : (
          <div className="space-y-4">
            {discussion.messages.map((message, index) => (
              <div
                key={index}
                className="bg-gray-700 rounded-lg p-4 border border-gray-600"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-sm font-semibold text-blue-400">
                      {message.role}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      (Agent: {message.agentId.slice(0, 8)}...)
                    </span>
                  </div>
                  {message.createdAt && (
                    <span className="text-xs text-gray-500">
                      {new Date(message.createdAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-gray-300 whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

