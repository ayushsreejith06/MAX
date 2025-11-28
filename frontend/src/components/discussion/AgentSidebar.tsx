"use client";

import type { Agent } from '@/src/lib/types';
import { getInitials, getAgentColor } from './utils';

interface AgentSidebarProps {
  agents: Agent[];
}

export function AgentSidebar({ agents }: AgentSidebarProps) {
  if (agents.length === 0) {
    return (
      <div className="bg-card border border-card rounded-lg p-4 shadow-dark-md">
        <h3 className="text-sm font-semibold text-primary-text/60 mb-2">Participants</h3>
        <p className="text-xs text-primary-text/40">No agents in this discussion</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-card rounded-lg p-4 shadow-dark-md">
      <h3 className="text-sm font-semibold text-primary-text mb-4">Participants ({agents.length})</h3>
      <div className="space-y-3">
        {agents.map((agent) => {
          const initials = getInitials(agent.name);
          const colorClass = getAgentColor(agent.id);
          
          return (
            <div key={agent.id} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-primary-text font-semibold text-xs shadow-dark-md flex-shrink-0`}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-primary-text truncate">{agent.name}</div>
                <div className="text-xs text-primary-text/60 truncate">{agent.role}</div>
              </div>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                agent.status === 'active' ? 'bg-up-trend' :
                agent.status === 'idle' ? 'bg-yellow-500' :
                agent.status === 'processing' ? 'bg-accent' :
                'bg-primary-text/40'
              }`} title={agent.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

