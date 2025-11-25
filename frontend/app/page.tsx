"use client";

import { useState, useEffect } from "react";
import { createSector, getSectors, Sector } from "../lib/api";

export default function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sectorName, setSectorName] = useState("");
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSectors = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getSectors();
      setSectors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sectors");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSectors();
  }, []);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSectorName("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectorName.trim()) return;

    try {
      setIsLoading(true);
      setError(null);
      await createSector(sectorName.trim());
      handleCloseModal();
      await loadSectors();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sector");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <main className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Dashboard</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Sector
          </button>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Sectors</h2>
          {isLoading && sectors.length === 0 ? (
            <p className="text-gray-500">Loading sectors...</p>
          ) : error && sectors.length === 0 ? (
            <p className="text-red-500">{error}</p>
          ) : sectors.length === 0 ? (
            <p className="text-gray-500">No sectors created yet.</p>
          ) : (
            <div className="space-y-2">
              {sectors.map((sector) => (
                <div
                  key={sector.id}
                  className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm"
                >
                  <h3 className="font-medium text-gray-900">{sector.name}</h3>
                  {sector.createdAt && (
                    <p className="text-sm text-gray-500 mt-1">
                      Created: {new Date(sector.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Sector</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label htmlFor="sector-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Sector Name
                </label>
                <input
                  id="sector-name"
                  type="text"
                  value={sectorName}
                  onChange={(e) => setSectorName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter sector name"
                  disabled={isLoading}
                />
              </div>
              {error && (
                <div className="mb-4 text-red-500 text-sm">{error}</div>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading || !sectorName.trim()}
                >
                  {isLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
