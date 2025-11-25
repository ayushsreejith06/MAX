"use client";

import { useState, useEffect } from "react";
import { getSectors, createSector, type Sector } from "@/lib/api";

export default function SectorsPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newSectorName, setNewSectorName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadSectors = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSectors();
      setSectors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sectors");
      console.error("Error loading sectors:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSectors();
  }, []);

  const handleCreateSector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectorName.trim()) return;

    try {
      setCreating(true);
      setError(null);
      const newSector = await createSector(newSectorName.trim());
      setSectors([...sectors, newSector]);
      setNewSectorName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sector");
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

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-200">Error: {error}</p>
        </div>
      )}

      {/* Sectors List */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Existing Sectors ({sectors.length})
        </h2>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-400">Loading sectors...</p>
          </div>
        ) : sectors.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No sectors yet. Create one above!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sectors.map((sector) => (
              <div
                key={sector.id}
                className="bg-gray-700 rounded-lg p-4 border border-gray-600"
              >
                <h3 className="text-lg font-semibold text-white mb-2">
                  {sector.name}
                </h3>
                <p className="text-sm text-gray-400">
                  ID: {sector.id.slice(0, 8)}...
                </p>
                {sector.createdAt && (
                  <p className="text-xs text-gray-500 mt-2">
                    Created: {new Date(sector.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

