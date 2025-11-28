"use client";

import Link from "next/link";
import { useDiscussions } from "@/src/lib/api";
import { StatusTag } from "@/src/components/discussion/StatusTag";
import { formatDate } from "@/src/components/discussion/utils";

export default function DiscussionsPage() {
  const { discussions, loading, error } = useDiscussions();

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-gray-400">Loading discussions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6 max-w-md">
              <h2 className="text-xl font-semibold text-red-400 mb-2">Error</h2>
              <p className="text-gray-300">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-white">All Discussions</h1>
        <div className="text-sm text-gray-400">
          {discussions.length} {discussions.length === 1 ? "discussion" : "discussions"}
        </div>
      </div>

      {discussions.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-lg">No discussions created yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {discussions.map((discussion) => {
            // Generate summary from first message or use default
            const summary = `${discussion.messagesCount} message${discussion.messagesCount !== 1 ? 's' : ''} • ${discussion.agentIds.length} participant${discussion.agentIds.length !== 1 ? 's' : ''}`;
            
            return (
              <Link
                key={discussion.id}
                href={`/discussions/${discussion.id}`}
                className="block bg-gray-800/50 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-xl font-semibold text-white">{discussion.title}</h3>
                      <StatusTag status={discussion.status} />
                    </div>
                    
                    <p className="text-sm text-gray-400 mb-3">{summary}</p>
                    
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      {discussion.sectorSymbol && (
                        <span className="px-2 py-1 bg-gray-700/50 rounded">
                          {discussion.sectorSymbol}
                        </span>
                      )}
                      {discussion.updatedAt && (
                        <span>Updated {formatDate(discussion.updatedAt)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
