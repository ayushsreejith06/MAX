"use client";

import type { DiscussionStatus } from '@/src/lib/types';

interface StatusTagProps {
  status: DiscussionStatus;
}

export function StatusTag({ status }: StatusTagProps) {
  const statusConfig = {
    active: {
      label: 'Active',
      className: 'bg-up-trend/20 text-up-trend border-up-trend/30',
    },
    closed: {
      label: 'Closed',
      className: 'bg-down-trend/20 text-down-trend border-down-trend/30',
    },
    created: {
      label: 'Created',
      className: 'bg-accent/20 text-accent border-accent/30',
    },
    archived: {
      label: 'Archived',
      className: 'bg-primary-text/10 text-primary-text/60 border-primary-text/20',
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

