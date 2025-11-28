'use client';

import Link from 'next/link';
import type { DiscussionSummary } from '@/src/lib/types';

interface DiscussionPreviewProps {
  discussions: DiscussionSummary[];
  sectorId: string;
}

export default function DiscussionPreview({
  discussions,
  sectorId,
}: DiscussionPreviewProps) {
  const statusColors = {
    created: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    archived: 'bg-gray-600/20 text-gray-500 border-gray-600/30',
  };

  if (discussions.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Discussions</h2>
        <p className="text-gray-400">No discussions in this sector yet.</p>
      </div>
    );
  }

  // Show only first 3 discussions as preview
  const previewDiscussions = discussions.slice(0, 3);

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">
          Recent Discussions ({discussions.length})
        </h2>
        <Link
          href={`/discussions?sectorId=${sectorId}`}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          View All →
        </Link>
      </div>
      <div className="space-y-3">
        {previewDiscussions.map((discussion) => {
          const statusColor =
            statusColors[discussion.status] || statusColors.created;
          return (
            <Link
              key={discussion.id}
              href={`/discussions/${discussion.id}`}
              className="block bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-blue-500 hover:bg-gray-650 transition-all duration-200 group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors truncate">
                    {discussion.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Messages:</span>
                      <span className="text-white font-medium">
                        {discussion.messagesCount}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Agents:</span>
                      <span className="text-white font-medium">
                        {discussion.agentIds.length}
                      </span>
                    </div>
                    {discussion.updatedAt && (
                      <div className="text-gray-400">
                        {new Date(discussion.updatedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                <div
                  className={`px-3 py-1 rounded text-xs font-medium border whitespace-nowrap ${statusColor}`}
                >
                  {discussion.status}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

