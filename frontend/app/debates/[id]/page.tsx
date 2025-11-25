"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getDebateById, type Debate } from "@/lib/api";

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
          <span className="px-3 py-1 bg-gray-700 rounded-full">
            Status: {debate.status}
          </span>
          <span>
            Created: {new Date(debate.createdAt).toLocaleString()}
          </span>
          <span>
            Updated: {new Date(debate.updatedAt).toLocaleString()}
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
          <div className="space-y-4">
            {sortedMessages.map((message, index) => (
              <div
                key={index}
                className="bg-gray-700 rounded-lg p-4 border border-gray-600"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">
                      {message.role}
                    </span>
                    <span className="text-xs text-gray-400">
                      Agent: {message.agentId.slice(0, 8)}...
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(message.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-300 whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

