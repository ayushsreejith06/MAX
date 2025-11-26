"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getDiscussions, type Discussion } from "@/lib/api";

export default function DiscussionsPage() {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDiscussions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDiscussions();
      setDiscussions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load discussions");
      console.error("Error loading discussions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiscussions();
  }, []);

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

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Discussions</h1>
        <p className="text-gray-400">
          View all agent discussions in the MAX simulation platform
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-200">Error: {error}</p>
        </div>
      )}

      {/* Discussions List */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          All Discussions ({discussions.length})
        </h2>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-400">Loading discussions...</p>
          </div>
        ) : discussions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No discussions yet.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {discussions.map((discussion) => (
              <Link
                key={discussion.id}
                href={`/discussions/${discussion.id}`}
                className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-blue-500 hover:bg-gray-650 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {discussion.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span>Sector ID: {discussion.sectorId.slice(0, 8)}...</span>
                      <span>•</span>
                      <span>{discussion.messages.length} messages</span>
                      <span>•</span>
                      <span>{discussion.agentIds.length} agents</span>
                    </div>
                    {discussion.createdAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        Created: {new Date(discussion.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="ml-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                        discussion.status
                      )}`}
                    >
                      {discussion.status}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

