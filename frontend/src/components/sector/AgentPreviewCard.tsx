'use client';

import Link from 'next/link';
import type { AgentWithSectorMeta } from '@/src/lib/types';

interface AgentPreviewCardProps {
  agent: AgentWithSectorMeta;
}

export default function AgentPreviewCard({ agent }: AgentPreviewCardProps) {
  const statusColors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    idle: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    offline: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const statusColor = statusColors[agent.status] || statusColors.offline;

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-blue-500 hover:bg-gray-650 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
            {agent.name}
          </h3>
          <p className="text-sm text-gray-400">{agent.role}</p>
        </div>
        <div
          className={`px-2 py-1 rounded text-xs font-medium border ${statusColor}`}
        >
          {agent.status}
        </div>
      </div>

      <div className="space-y-2 mt-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Performance</span>
          <span className="text-white font-medium">
            {agent.performance.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Trades</span>
          <span className="text-white font-medium">{agent.trades}</span>
        </div>
        {agent.personality && (
          <div className="pt-2 border-t border-gray-600">
            <div className="flex flex-wrap gap-2">
              {agent.personality.riskTolerance && (
                <span className="text-xs px-2 py-1 bg-gray-600 rounded text-gray-300">
                  Risk: {agent.personality.riskTolerance}
                </span>
              )}
              {agent.personality.decisionStyle && (
                <span className="text-xs px-2 py-1 bg-gray-600 rounded text-gray-300">
                  {agent.personality.decisionStyle}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

