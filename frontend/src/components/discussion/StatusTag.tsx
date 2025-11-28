"use client";

import type { DiscussionStatus } from '@/src/lib/types';

interface StatusTagProps {
  status: DiscussionStatus;
}

export function StatusTag({ status }: StatusTagProps) {
  const statusConfig = {
    active: {
      label: 'Active',
      className: 'bg-green-500/20 text-green-300 border-green-500/30',
    },
    closed: {
      label: 'Closed',
      className: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    },
    created: {
      label: 'Created',
      className: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
    archived: {
      label: 'Archived',
      className: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    },
  };

  const config = statusConfig[status] || statusConfig.created;

  return (
    <span
      className={`px-3 py-1 text-xs font-medium rounded-full border ${config.className}`}
    >
      {config.label}
    </span>
  );
}

