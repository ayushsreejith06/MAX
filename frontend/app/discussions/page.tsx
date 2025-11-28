"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { DiscussionSummary } from "@/src/lib/types";
import { mockDiscussions } from "@/src/lib/mockData";
import { StatusTag } from "@/src/components/discussion/StatusTag";
import { formatDate } from "@/src/components/discussion/utils";

export default function DiscussionsPage() {
  const [discussions, setDiscussions] = useState<DiscussionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => {
      setDiscussions(mockDiscussions);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
            <p className="text-primary-text/60">Loading discussions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-primary-text">All Discussions</h1>
        <div className="text-sm text-primary-text/60">
          {discussions.length} {discussions.length === 1 ? "discussion" : "discussions"}
        </div>
      </div>

      {discussions.length === 0 ? (
        <div className="bg-card border border-card rounded-lg p-12 text-center shadow-dark-md">
          <p className="text-primary-text/60 text-lg">No discussions created yet.</p>
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
                className="block bg-card border border-card rounded-lg p-6 hover:border-accent transition-colors shadow-dark-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-xl font-semibold text-primary-text">{discussion.title}</h3>
                      <StatusTag status={discussion.status} />
                    </div>
                    
                    <p className="text-sm text-primary-text/60 mb-3">{summary}</p>
                    
                    <div className="flex items-center gap-4 text-xs text-primary-text/40">
                      {discussion.sectorSymbol && (
                        <span className="px-2 py-1 bg-background rounded">
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
