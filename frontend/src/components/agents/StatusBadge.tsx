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
    bg: 'bg-green-500/20',
    text: 'text-green-300',
    border: 'border-green-500/50',
    label: 'Active',
  },
  idle: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-300',
    border: 'border-yellow-500/50',
    label: 'Idle',
  },
  processing: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-300',
    border: 'border-blue-500/50',
    label: 'Processing',
  },
  offline: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-300',
    border: 'border-gray-500/50',
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

