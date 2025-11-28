"use client";

import { useState } from "react";
import Link from "next/link";
import { useSectors, getSectors } from "@/src/lib/api";
import type { SectorSummary } from "@/src/lib/types";

export default function SectorsPage() {
  const { sectors, loading, error, mutate } = useSectors();
  const [newSectorName, setNewSectorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateSector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectorName.trim()) return;

    try {
      setCreating(true);
      setCreateError(null);
      // Note: createSector endpoint may not exist in backend yet
      // For now, just refresh the sectors list
      await mutate();
      setNewSectorName("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create sector");
      console.error("Error creating sector:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Sectors</h1>
        <p className="text-gray-400">
          Manage market sectors for the MAX simulation platform
        </p>
      </div>

      {/* Create Sector Form */}
      <div className="bg-gray-800 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Create New Sector</h2>
        <form onSubmit={handleCreateSector} className="flex gap-4">
          <input
            type="text"
            value={newSectorName}
            onChange={(e) => setNewSectorName(e.target.value)}
            placeholder="Enter sector name (e.g., Technology, Finance)"
            className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !newSectorName.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? "Creating..." : "Create Sector"}
          </button>
        </form>
      </div>

      {/* Error Messages */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-200">Error: {error}</p>
        </div>
      )}
      {createError && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-200">Error: {createError}</p>
        </div>
      )}

      {/* Sectors List */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Existing Sectors ({sectors.length})
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-gray-400">Loading sectors...</p>
            </div>
          </div>
        ) : sectors.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No sectors yet. Create one above!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sectors.map((sector) => (
              <Link
                key={sector.id}
                href={`/sector/${sector.id}`}
                className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-blue-500 hover:bg-gray-650 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-white">
                    {sector.name}
                  </h3>
                  <span className="text-xs font-medium text-gray-400 bg-gray-600 px-2 py-1 rounded">
                    {sector.symbol}
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Price:</span>
                    <span className="text-white font-medium">${sector.currentPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Change:</span>
                    <span className={sector.change >= 0 ? "text-green-400" : "text-red-400"}>
                      {sector.change >= 0 ? "+" : ""}{sector.changePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Agents:</span>
                    <span className="text-white">{sector.activeAgentsCount}/{sector.agentsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Discussions:</span>
                    <span className="text-white">{sector.discussionsCount}</span>
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

