'use client';

import AgentPreviewCard from './AgentPreviewCard';
import type { AgentWithSectorMeta } from '@/src/lib/types';

interface AgentPreviewListProps {
  agents: AgentWithSectorMeta[];
}

export default function AgentPreviewList({ agents }: AgentPreviewListProps) {
  if (agents.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Agents</h2>
        <p className="text-gray-400">No agents assigned to this sector yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">
          Agents ({agents.length})
        </h2>
        <a
          href={`/agents?sectorId=${agents[0]?.sectorId || ''}`}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          View All →
        </a>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <AgentPreviewCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

