"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getDiscussions, type Discussion } from "@/lib/api";

export default function DiscussionsPage() {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDiscussions() {
      try {
        setLoading(true);
        setError(null);
        const discussionsData = await getDiscussions();
        setDiscussions(discussionsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load discussions");
      } finally {
        setLoading(false);
      }
    }

    fetchDiscussions();
  }, []);

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
          {discussions.map((discussion) => (
            <Link
              key={discussion.id}
              href={`/discussions/${discussion.id}`}
              className="block bg-gray-800/50 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-xl font-semibold text-white">{discussion.title}</h3>
                    <span className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-300 rounded capitalize">
                      {discussion.status}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <span className="text-sm text-gray-400">Sector ID: </span>
                      <span className="text-sm text-gray-300">
                        {discussion.sectorId || <span className="text-gray-500 italic">None</span>}
                      </span>
                    </div>

                    {discussion.updatedAt && (
                      <div>
                        <span className="text-sm text-gray-400">Updated: </span>
                        <span className="text-sm text-gray-300">
                          {new Date(discussion.updatedAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
