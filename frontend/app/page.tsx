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
    <div className="min-h-screen bg-white">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-light text-gray-900 mb-6">Dashboard</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            Create Sector
          </button>
        </div>

        <div className="mt-12">
          <h2 className="text-2xl font-light text-gray-900 mb-6">Sectors</h2>
          {isLoading && sectors.length === 0 ? (
            <p className="text-gray-400 text-sm">Loading sectors...</p>
          ) : error && sectors.length === 0 ? (
            <p className="text-red-600 text-sm">{error}</p>
          ) : sectors.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">No sectors created yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sectors.map((sector) => (
                <div
                  key={sector.id}
                  className="bg-white p-5 rounded-md border border-gray-100 hover:border-gray-200 transition-colors"
                >
                  <h3 className="font-normal text-gray-900 text-base">{sector.name}</h3>
                  {sector.createdAt && (
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(sector.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 backdrop-blur-sm"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-white rounded-lg p-8 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-light text-gray-900 mb-6">Create Sector</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label htmlFor="sector-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Sector Name
                </label>
                <input
                  id="sector-name"
                  type="text"
                  value={sectorName}
                  onChange={(e) => setSectorName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
                  placeholder="Enter sector name"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              {error && (
                <div className="mb-4 text-red-600 text-sm">{error}</div>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
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
