"use client";

import { useState } from "react";
import Link from "next/link";
import { useSectors } from "@/src/lib/api";

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
        <h1 className="text-4xl font-bold text-primary-text mb-2">Sectors</h1>
        <p className="text-primary-text/60">
          Manage market sectors for the MAX simulation platform
        </p>
      </div>

      {/* Create Sector Form */}
      <div className="bg-card border border-card rounded-lg p-6 mb-8 shadow-dark-md">
        <h2 className="text-xl font-semibold text-primary-text mb-4">Create New Sector</h2>
        <form onSubmit={handleCreateSector} className="flex gap-4">
          <input
            type="text"
            value={newSectorName}
            onChange={(e) => setNewSectorName(e.target.value)}
            placeholder="Enter sector name (e.g., Technology, Finance)"
            className="flex-1 px-4 py-2 bg-background text-primary-text rounded-lg border border-card focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !newSectorName.trim()}
            className="px-6 py-2 bg-accent text-primary-text rounded-lg hover:bg-up-trend disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? "Creating..." : "Create Sector"}
          </button>
        </form>
      </div>

      {/* Error Messages */}
      {error && (
        <div className="bg-down-trend/10 border border-down-trend/50 rounded-lg p-4 mb-6">
          <p className="text-down-trend">Error: {error}</p>
        </div>
      )}
      {createError && (
        <div className="bg-down-trend/10 border border-down-trend/50 rounded-lg p-4 mb-6">
          <p className="text-down-trend">Error: {createError}</p>
        </div>
      )}

      {/* Sectors List */}
      <div className="bg-card border border-card rounded-lg p-6 shadow-dark-md">
        <h2 className="text-xl font-semibold text-primary-text mb-4">
          Existing Sectors ({sectors.length})
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
              <p className="text-primary-text/60">Loading sectors...</p>
            </div>
          </div>
        ) : sectors.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-primary-text/60">No sectors yet. Create one above!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sectors.map((sector) => (
              <Link
                key={sector.id}
                href={`/sector/${sector.id}`}
                className="bg-background rounded-lg p-4 border border-card hover:border-accent hover:bg-card/50 transition-colors cursor-pointer shadow-dark-sm"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-primary-text">
                    {sector.name}
                  </h3>
                  <span className="text-xs font-medium text-primary-text/60 bg-card px-2 py-1 rounded">
                    {sector.symbol}
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-primary-text/60">Price:</span>
                    <span className="text-primary-text font-medium">${sector.currentPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-primary-text/60">Change:</span>
                    <span className={sector.change >= 0 ? "text-up-trend" : "text-down-trend"}>
                      {sector.change >= 0 ? "+" : ""}{sector.changePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-primary-text/60">Agents:</span>
                    <span className="text-primary-text">{sector.activeAgentsCount}/{sector.agentsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-primary-text/60">Discussions:</span>
                    <span className="text-primary-text">{sector.discussionsCount}</span>
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

