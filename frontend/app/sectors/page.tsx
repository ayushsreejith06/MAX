"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getSectors, createSector, type Sector } from "@/lib/api";
import Modal from "@/app/components/Modal";

export default function SectorsPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newSectorName, setNewSectorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      setIsModalOpen(false);
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
        <h1 className="text-4xl font-bold text-black dark:text-white mb-2">Sectors</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage market sectors for the MAX simulation platform
        </p>
      </div>

      {/* Create Sector Button */}
      <div className="mb-8">
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create Sector
        </button>
      </div>

      {/* Create Sector Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Sector"
      >
        <form onSubmit={handleCreateSector} className="space-y-4">
          <div>
            <input
              type="text"
              value={newSectorName}
              onChange={(e) => setNewSectorName(e.target.value)}
              placeholder="Enter sector name (e.g., Technology, Finance)"
              className="w-full px-4 py-2 bg-white dark:bg-gray-700 text-black dark:text-white rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={creating}
            />
          </div>
          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={creating}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-black dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !newSectorName.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Creating..." : "Create Sector"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-800 dark:text-red-200">Error: {error}</p>
        </div>
      )}

      {/* Sectors List */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-black dark:text-white mb-4">
          Existing Sectors ({sectors.length})
        </h2>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-600 dark:text-gray-400">Loading sectors...</p>
          </div>
        ) : sectors.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 dark:text-gray-400">No sectors yet. Create one above!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sectors.map((sector) => (
              <Link
                key={sector.id}
                href={`/sectors/${sector.id}`}
                className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:bg-gray-650 transition-colors cursor-pointer"
              >
                <h3 className="text-lg font-semibold text-black dark:text-white mb-2">
                  {sector.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  ID: {sector.id.slice(0, 8)}...
                </p>
                {sector.createdAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    Created: {new Date(sector.createdAt).toLocaleDateString()}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

