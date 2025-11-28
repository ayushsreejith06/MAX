/**
 * AgentCard component for displaying agent information in list view.
 */

'use client';

import Link from 'next/link';
import type { AgentWithSectorMeta } from '@/src/lib/types';

interface AgentCardProps {
  agent: AgentWithSectorMeta;
}

const statusColors = {
  active: 'bg-green-500/20 text-green-300 border-green-500/50',
  idle: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  processing: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
  offline: 'bg-gray-500/20 text-gray-300 border-gray-500/50',
};

const performanceColors = (performance: number) => {
  if (performance > 0) return 'text-green-400';
  if (performance < 0) return 'text-red-400';
  return 'text-gray-400';
};

export default function AgentCard({ agent }: AgentCardProps) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="block bg-gray-800/50 border border-gray-700 rounded-lg p-6 hover:border-gray-600 hover:bg-gray-800/70 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold text-white">{agent.name}</h3>
            <span
              className={`px-2 py-1 text-xs font-medium rounded border ${statusColors[agent.status]}`}
            >
              {agent.status}
            </span>
          </div>
          <p className="text-sm text-gray-400 capitalize mb-1">{agent.role}</p>
          {agent.sectorName && (
            <p className="text-xs text-gray-500">
              {agent.sectorName} ({agent.sectorSymbol})
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-700">
        <div>
          <p className="text-xs text-gray-400 mb-1">Performance</p>
          <p className={`text-lg font-semibold ${performanceColors(agent.performance)}`}>
            {agent.performance > 0 ? '+' : ''}
            {agent.performance.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Trades</p>
          <p className="text-lg font-semibold text-white">{agent.trades}</p>
        </div>
      </div>
    </Link>
  );
}

