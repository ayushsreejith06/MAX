"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getDebates, type Debate } from "@/lib/api";

export default function DebatesPage() {
  const [debates, setDebates] = useState<Debate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDebates = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getDebates();
        setDebates(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load debates");
        console.error("Error loading debates:", err);
      } finally {
        setLoading(false);
      }
    };

    loadDebates();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created':
        return 'bg-gray-600';
      case 'debating':
        return 'bg-blue-600';
      case 'closed':
        return 'bg-green-600';
      case 'archived':
        return 'bg-gray-500';
      default:
        return 'bg-gray-600';
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Debates</h1>
        <p className="text-gray-400">
          View and manage debate rooms
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-200">Error: {error}</p>
        </div>
      )}

      {/* Debates List */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          All Debates ({debates.length})
        </h2>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-400">Loading debates...</p>
          </div>
        ) : debates.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No debates yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-300 font-semibold">Title</th>
                  <th className="text-left py-3 px-4 text-gray-300 font-semibold">Status</th>
                  <th className="text-left py-3 px-4 text-gray-300 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {debates.map((debate) => (
                  <tr
                    key={debate.id}
                    className="border-b border-gray-700 hover:bg-gray-700 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <Link
                        href={`/debates/${debate.id}`}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        {debate.title}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-semibold text-white ${getStatusColor(debate.status)}`}
                      >
                        {debate.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-sm">
                      {new Date(debate.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

