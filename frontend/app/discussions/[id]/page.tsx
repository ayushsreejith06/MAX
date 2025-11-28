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
    async function loadDiscussion() {
      if (!discussionId) return;

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
    }

    loadDiscussion();
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
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6 max-w-md">
              <h2 className="text-xl font-semibold text-red-400 mb-2">Error</h2>
              <p className="text-gray-300 mb-4">{error || "Discussion not found"}</p>
              <Link
                href="/discussions"
                className="text-blue-400 hover:text-blue-300 inline-block"
              >
                ← Back to Discussions
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sort messages chronologically by timestamp (fallback to createdAt if timestamp not available)
  const sortedMessages = [...discussion.messages].sort((a, b) => {
    const timeA = new Date((a as any).timestamp || (a as any).createdAt || 0).getTime();
    const timeB = new Date((b as any).timestamp || (b as any).createdAt || 0).getTime();
    return timeA - timeB;
  });

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
        <h1 className="text-4xl font-bold text-white mb-4">{discussion.title}</h1>
        
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-gray-400">Status: </span>
            <span className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-300 rounded capitalize">
              {discussion.status}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Sector ID: </span>
            <span className="text-gray-300">
              {discussion.sectorId || <span className="text-gray-500 italic">None</span>}
            </span>
          </div>
          {discussion.createdAt && (
            <div>
              <span className="text-gray-400">Created: </span>
              <span className="text-gray-300">
                {new Date(discussion.createdAt).toLocaleString()}
              </span>
            </div>
          )}
          {discussion.updatedAt && (
            <div>
              <span className="text-gray-400">Updated: </span>
              <span className="text-gray-300">
                {new Date(discussion.updatedAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Messages Section */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Messages ({sortedMessages.length})
        </h2>
        {sortedMessages.length === 0 ? (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 text-center">
            <p className="text-gray-400">No messages in this discussion yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedMessages.map((message, index) => {
              const messageTimestamp = (message as any).timestamp || (message as any).createdAt;
              return (
                <div
                  key={message.id || `message-${index}`}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-sm font-medium text-white">
                          {message.agentId}
                        </span>
                        <span className="text-sm text-gray-400 ml-2">
                          ({message.role})
                        </span>
                      </div>
                    </div>
                    {messageTimestamp && (
                      <div className="text-xs text-gray-500">
                        {new Date(messageTimestamp).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="text-gray-300 whitespace-pre-wrap">
                    {message.content}
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

