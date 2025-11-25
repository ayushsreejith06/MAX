'use client';

import { useEffect, useState } from 'react';
import { getSectors, getAgents, type Sector, type Agent } from '@/lib/api';

export default function Dashboard() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
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
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6 max-w-md">
              <h2 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-2">Error</h2>
              <p className="text-gray-700 dark:text-gray-300">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const recentAgents = agents
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">Dashboard</h1>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Sectors</h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{sectors.length}</p>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Agents</h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{agents.length}</p>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Active Sectors</h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {new Set(agents.filter(a => a.sectorId).map(a => a.sectorId)).size}
          </p>
        </div>
      </div>

      {/* Sectors List */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Sectors</h2>
        {sectors.length === 0 ? (
          <div className="bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg p-6">
            <p className="text-gray-600 dark:text-gray-400">No sectors created yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sectors.map((sector) => (
              <div
                key={sector.id}
                className="bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg p-4 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
              >
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{sector.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {agents.filter(a => a.sectorId === sector.id).length} agents
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Agents */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Recent Agents</h2>
        {recentAgents.length === 0 ? (
          <div className="bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg p-6">
            <p className="text-gray-600 dark:text-gray-400">No agents created yet.</p>
          </div>
        ) : (
          <div className="bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="divide-y divide-gray-300 dark:divide-gray-700">
              {recentAgents.map((agent) => (
                <div key={agent.id} className="p-4 hover:bg-gray-200 dark:hover:bg-gray-800/70 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">{agent.role}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {agent.sectorId ? `Sector: ${agent.sectorId}` : 'No sector assigned'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(agent.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
