"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Discussion } from "@/src/lib/types";
import { getMockDiscussion, getMockAgentsByIds } from "@/src/lib/mockData";
import { MessageList } from "@/src/components/discussion/MessageList";
import { AgentSidebar } from "@/src/components/discussion/AgentSidebar";
import { StatusTag } from "@/src/components/discussion/StatusTag";

export default function DiscussionDetailPage() {
  const params = useParams();
  const discussionId = params.id as string;

  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => {
      if (!discussionId) {
        setError("Discussion ID is required");
        setLoading(false);
        return;
      }

      const discussionData = getMockDiscussion(discussionId);
      if (!discussionData) {
        setError("Discussion not found");
      } else {
        setDiscussion(discussionData);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
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

  // Get agents for sidebar
  const agents = discussion ? getMockAgentsByIds(discussion.agentIds) : [];

  // Sort messages chronologically by timestamp
  const sortedMessages = discussion
    ? [...discussion.messages].sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      })
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/discussions"
          className="text-blue-400 hover:text-blue-300 mb-4 inline-block text-sm"
        >
          ← Back to Discussions
        </Link>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-white mb-3">{discussion.title}</h1>
            <div className="flex items-center gap-3 flex-wrap">
              <StatusTag status={discussion.status} />
              {discussion.sectorSymbol && (
                <span className="px-2 py-1 text-xs font-medium bg-gray-700/50 text-gray-300 rounded">
                  {discussion.sectorSymbol}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content with Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Messages Section */}
        <div className="lg:col-span-3">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">
                Messages ({sortedMessages.length})
              </h2>
            </div>
            
            {/* Scrollable message area */}
            <div className="max-h-[calc(100vh-20rem)] overflow-y-auto pr-2">
              <MessageList messages={sortedMessages} />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-8">
            <AgentSidebar agents={agents} />
          </div>
        </div>
      </div>
    </div>
  );
}
