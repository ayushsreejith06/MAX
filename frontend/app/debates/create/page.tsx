"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { startDebate, getAgents, getSectors, type Agent, type Sector } from "@/lib/api";

export default function CreateDebatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectorIdParam = searchParams.get("sectorId");

  const [title, setTitle] = useState("");
  const [selectedSectorId, setSelectedSectorId] = useState(sectorIdParam || "");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [sectorsData, agentsData] = await Promise.all([
          getSectors(),
          getAgents(),
        ]);

        setSectors(sectorsData);
        setAgents(agentsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    // Update agents when sector changes
    if (selectedSectorId) {
      const sectorAgents = agents.filter(a => a.sectorId === selectedSectorId);
      // Clear selected agents if they're not in the new sector
      setSelectedAgentIds(prev => prev.filter(id => 
        sectorAgents.some(a => a.id === id)
      ));
    } else {
      setSelectedAgentIds([]);
    }
  }, [selectedSectorId, agents]);

  const handleAgentToggle = (agentId: string) => {
    setSelectedAgentIds(prev => 
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedSectorId) {
      setError("Title and sector are required");
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const debate = await startDebate(selectedSectorId, title.trim(), selectedAgentIds);
      router.push(`/debates/${debate.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create debate");
      console.error("Error creating debate:", err);
    } finally {
      setCreating(false);
    }
  };

  const sectorAgents = selectedSectorId 
    ? agents.filter(a => a.sectorId === selectedSectorId)
    : [];

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-8">
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/debates"
          className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
        >
          ← Back to Debates
        </Link>
        <h1 className="text-4xl font-bold text-white mb-2">Create New Debate</h1>
        <p className="text-gray-400">
          Start a new debate room for agents to discuss
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-200">Error: {error}</p>
        </div>
      )}

      {/* Create Debate Form */}
      <div className="bg-gray-800 rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-gray-300 mb-2 font-semibold">
              Debate Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter debate title"
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Sector Selection */}
          <div>
            <label className="block text-gray-300 mb-2 font-semibold">
              Sector
            </label>
            <select
              value={selectedSectorId}
              onChange={(e) => setSelectedSectorId(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a sector</option>
              {sectors.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.name}
                </option>
              ))}
            </select>
          </div>

          {/* Agent Selection */}
          {selectedSectorId && (
            <div>
              <label className="block text-gray-300 mb-2 font-semibold">
                Select Agents (optional)
              </label>
              {sectorAgents.length === 0 ? (
                <p className="text-gray-400 text-sm">
                  No agents available in this sector.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto bg-gray-700 rounded-lg p-4 border border-gray-600">
                  {sectorAgents.map((agent) => (
                    <label
                      key={agent.id}
                      className="flex items-center space-x-3 cursor-pointer hover:bg-gray-600 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAgentIds.includes(agent.id)}
                        onChange={() => handleAgentToggle(agent.id)}
                        className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <span className="text-white font-medium">{agent.role}</span>
                        <span className="text-gray-400 text-sm ml-2">
                          ({agent.id.slice(0, 8)}...)
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {selectedAgentIds.length > 0 && (
                <p className="text-gray-400 text-sm mt-2">
                  {selectedAgentIds.length} agent(s) selected
                </p>
              )}
            </div>
          )}

          {/* Submit Button */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={creating || !title.trim() || !selectedSectorId}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Creating..." : "Create Debate"}
            </button>
            <Link
              href="/debates"
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

