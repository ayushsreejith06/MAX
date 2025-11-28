'use client';

import { useEffect, useState } from 'react';
// TODO: Replace with typed API client from src/lib/api.ts
// import { getAgents } from '@/src/lib/api';
// import type { AgentWithSectorMeta } from '@/src/lib/types';
import { getAgents, type Agent } from '@/lib/api';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAgents() {
      try {
        setLoading(true);
        setError(null);
        // TODO: Replace mock data with real API call getAgents() from src/lib/api.ts
        // TODO: Update type to use AgentWithSectorMeta[] from src/lib/types.ts
        const agentsData = await getAgents();
        setAgents(agentsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agents');
      } finally {
        setLoading(false);
      }
    }

    fetchAgents();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-gray-400">Loading agents...</p>
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
              <h2 className="text-xl font-semibold text-red-400 mb-2">Error</h2>
              <p className="text-gray-300">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-white">Agents</h1>
        <div className="text-sm text-gray-400">
          {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-lg">No agents created yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-xl font-semibold text-white capitalize">{agent.role}</h3>
                    <span className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-300 rounded">
                      {agent.id.slice(0, 8)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm text-gray-400">Sector ID: </span>
                      <span className="text-sm text-gray-300">
                        {agent.sectorId || <span className="text-gray-500 italic">None</span>}
                      </span>
                    </div>
                    
                    {agent.personality && Object.keys(agent.personality).length > 0 && (
                      <div>
                        <span className="text-sm text-gray-400">Personality: </span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {Object.entries(agent.personality).map(([key, value]) => (
                            <span
                              key={key}
                              className="px-2 py-1 text-xs bg-gray-700/50 text-gray-300 rounded"
                            >
                              {key}: {String(value)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <span className="text-sm text-gray-400">Created: </span>
                      <span className="text-sm text-gray-300">
                        {new Date(agent.createdAt).toLocaleString()}
                      </span>
                    </div>
                    
                    {agent.memory && agent.memory.length > 0 && (
                      <div>
                        <span className="text-sm text-gray-400">Memory entries: </span>
                        <span className="text-sm text-gray-300">{agent.memory.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
