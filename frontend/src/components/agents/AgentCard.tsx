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
  active: 'bg-up-trend/20 text-up-trend border-up-trend/50',
  idle: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
  processing: 'bg-accent/20 text-accent border-accent/50',
  offline: 'bg-primary-text/10 text-primary-text/60 border-primary-text/20',
};

const performanceColors = (performance: number) => {
  if (performance > 0) return 'text-up-trend';
  if (performance < 0) return 'text-down-trend';
  return 'text-primary-text/60';
};

export default function AgentCard({ agent }: AgentCardProps) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="block bg-card border border-card rounded-lg p-6 hover:border-accent hover:bg-card/80 transition-all duration-200 shadow-dark-md"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold text-primary-text">{agent.name}</h3>
            <span
              className={`px-2 py-1 text-xs font-medium rounded border ${statusColors[agent.status]}`}
            >
              {agent.status}
            </span>
          </div>
          <p className="text-sm text-primary-text/60 capitalize mb-1">{agent.role}</p>
          {agent.sectorName && (
            <p className="text-xs text-primary-text/40">
              {agent.sectorName} ({agent.sectorSymbol})
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-card">
        <div>
          <p className="text-xs text-primary-text/60 mb-1">Performance</p>
          <p className={`text-lg font-semibold ${performanceColors(agent.performance)}`}>
            {agent.performance > 0 ? '+' : ''}
            {agent.performance.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-primary-text/60 mb-1">Trades</p>
          <p className="text-lg font-semibold text-primary-text">{agent.trades}</p>
        </div>
      </div>
    </Link>
  );
}

