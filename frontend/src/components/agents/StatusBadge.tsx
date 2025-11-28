/**
 * StatusBadge component for displaying agent status.
 */

'use client';

import type { AgentStatus } from '@/src/lib/types';

interface StatusBadgeProps {
  status: AgentStatus;
  className?: string;
}

const statusConfig = {
  active: {
    bg: 'bg-up-trend/20',
    text: 'text-up-trend',
    border: 'border-up-trend/50',
    label: 'Active',
  },
  idle: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-300',
    border: 'border-yellow-500/50',
    label: 'Idle',
  },
  processing: {
    bg: 'bg-accent/20',
    text: 'text-accent',
    border: 'border-accent/50',
    label: 'Processing',
  },
  offline: {
    bg: 'bg-primary-text/10',
    text: 'text-primary-text/60',
    border: 'border-primary-text/20',
    label: 'Offline',
  },
};

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded border ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      {config.label}
    </span>
  );
}

