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
    const loadDiscussion = async () => {
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
      loadDiscussion();
    }
  }, [discussionId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-gray-400">Loading discussion...</p>
          </div>
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

  // Sort messages chronologically by createdAt (or timestamp if createdAt is missing)
  const sortedMessages = [...(discussion.messages || [])].sort((a, b) => {
    const timeA = a.createdAt || a.timestamp || "";
    const timeB = b.createdAt || b.timestamp || "";
    return new Date(timeA).getTime() - new Date(timeB).getTime();
  });

  // Generate key for message - use id if available, otherwise generate from timestamp + index
  const getMessageKey = (message: any, index: number) => {
    if (message.id) {
      return message.id;
    }
    const timestamp = message.createdAt || message.timestamp || "";
    return `msg-${timestamp}-${index}`;
  };

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
        <h1 className="text-4xl font-bold text-white mb-2">{discussion.title}</h1>
        <div className="flex flex-wrap gap-4 text-sm text-gray-400 mt-4">
          <div>
            <span className="text-gray-400">Sector ID: </span>
            <span className="text-gray-300">{discussion.sectorId}</span>
          </div>
          <div>
            <span className="text-gray-400">Status: </span>
            <span className={`font-medium capitalize ${
              discussion.status === "active"
                ? "text-green-300"
                : discussion.status === "closed"
                ? "text-gray-300"
                : "text-blue-300"
            }`}>
              {discussion.status}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Created: </span>
            <span className="text-gray-300">
              {new Date(discussion.createdAt).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Updated: </span>
            <span className="text-gray-300">
              {new Date(discussion.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Messages Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Messages ({sortedMessages.length})
        </h2>
        {sortedMessages.length === 0 ? (
          <p className="text-gray-400">No messages in this discussion yet.</p>
        ) : (
          <div className="space-y-4">
            {sortedMessages.map((message, index) => {
              const messageTimestamp = message.createdAt || message.timestamp || "";
              return (
                <div
                  key={getMessageKey(message, index)}
                  className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-sm text-gray-400">Agent ID: </span>
                        <span className="text-sm text-gray-300 font-mono">
                          {message.agentId.slice(0, 8)}...
                        </span>
                      </div>
                      <span className="text-gray-500">•</span>
                      <div>
                        <span className="text-sm text-gray-400">Role: </span>
                        <span className="text-sm text-white font-medium capitalize">
                          {message.role}
                        </span>
                      </div>
                    </div>
                    {messageTimestamp && (
                      <div className="text-xs text-gray-500">
                        {new Date(messageTimestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <p className="text-gray-200 whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

