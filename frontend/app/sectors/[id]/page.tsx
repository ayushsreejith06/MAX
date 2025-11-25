"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSectorById, getAgents, type Sector, type Agent } from "@/lib/api";

export default function SectorDetailPage() {
  const params = useParams();
  const sectorId = params.id as string;

  const [sector, setSector] = useState<Sector | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [sectorData, agentsData] = await Promise.all([
          getSectorById(sectorId),
          getAgents(sectorId),
        ]);

        setSector(sectorData);
        setAgents(agentsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sector data");
        console.error("Error loading sector:", err);
      } finally {
        setLoading(false);
      }
    };

    if (sectorId) {
      loadData();
    }
  }, [sectorId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">Loading sector...</p>
        </div>
      </div>
    );
  }

  if (error || !sector) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">Error: {error || "Sector not found"}</p>
          <Link
            href="/sectors"
            className="mt-4 inline-block text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            ← Back to Sectors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/sectors"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-4 inline-block"
        >
          ← Back to Sectors
        </Link>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">{sector.name}</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Sector ID: {sector.id}
        </p>
        {sector.createdAt && (
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Created: {new Date(sector.createdAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Agents Section */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Agents ({agents.length})
        </h2>
        {agents.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No agents assigned to this sector yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-300 dark:border-gray-600"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {agent.role}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  ID: {agent.id.slice(0, 8)}...
                </p>
                {agent.personality && (
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    <p>Risk: {agent.personality.riskTolerance || "N/A"}</p>
                    <p>Style: {agent.personality.decisionStyle || "N/A"}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manager Agent Placeholder */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Manager Agent
        </h2>
        <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-300 dark:border-gray-600">
          <p className="text-gray-600 dark:text-gray-400 italic">Manager Agent Coming Soon</p>
        </div>
      </div>
    </div>
  );
}

