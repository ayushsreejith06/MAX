'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { fetchRejectedItems } from '@/lib/api';
import type { RejectedItem } from '@/lib/types';

interface RejectedItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RejectedItemsModal({ isOpen, onClose }: RejectedItemsModalProps) {
  const router = useRouter();
  const [rejectedItems, setRejectedItems] = useState<RejectedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRejectedItems();
    }
  }, [isOpen]);

  const loadRejectedItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchRejectedItems();
      setRejectedItems(data.rejected || []);
    } catch (err) {
      console.error('Failed to fetch rejected items', err);
      setError(err instanceof Error ? err.message : 'Failed to load rejected items');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handleDiscussionClick = (discussionId: string) => {
    router.push(`/discussions/${discussionId}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-pure-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-ink-600 border border-ink-500 rounded-lg w-[60%] h-[70%] flex flex-col shadow-[0_0_35px_rgba(0,0,0,0.55)]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-ink-500">
          <h2 className="text-2xl font-bold text-floral-white font-mono">
            Rejected Items
          </h2>
          <button
            onClick={onClose}
            className="text-floral-white/70 hover:text-floral-white transition-colors p-2 hover:bg-ink-500 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <p className="text-floral-white/70 font-mono">Loading rejected items...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-error-red font-mono">{error}</p>
            </div>
          )}

          {!loading && !error && rejectedItems.length === 0 && (
            <div className="text-center py-12">
              <p className="text-floral-white/50 font-mono">No rejected items found.</p>
            </div>
          )}

          {!loading && !error && rejectedItems.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border border-ink-500 bg-pure-black font-mono text-sm">
                <thead>
                  <tr className="bg-ink-600 text-left text-xs uppercase tracking-[0.2em] text-floral-white/70">
                    <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">Item</th>
                    <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">Discussion Title</th>
                    <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">Discussion ID</th>
                    <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">Sector</th>
                    <th className="px-4 py-3 border border-ink-500 text-[0.6rem]">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectedItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-ink-500 bg-pure-black/80 hover:bg-ink-600/70 transition-colors"
                    >
                      <td className="px-4 py-3 border border-ink-500 text-floral-white">
                        <div className="max-w-md truncate" title={item.text}>
                          {item.text}
                        </div>
                      </td>
                      <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                        {item.discussionTitle}
                      </td>
                      <td className="px-4 py-3 border border-ink-500">
                        <button
                          onClick={() => handleDiscussionClick(item.discussionId)}
                          className="text-sage-green hover:text-sage-green/80 hover:underline font-mono text-xs"
                        >
                          {item.discussionId}
                        </button>
                      </td>
                      <td className="px-4 py-3 border border-ink-500 text-floral-white/80">
                        {item.sectorSymbol}
                      </td>
                      <td className="px-4 py-3 border border-ink-500 text-floral-white/70 text-xs">
                        {formatTimestamp(item.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ink-500 flex items-center justify-between">
          <p className="text-floral-white/50 font-mono text-sm">
            Total: {rejectedItems.length} rejected item{rejectedItems.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-ink-500 text-floral-white border border-floral-white/10 rounded-lg hover:bg-ink-400 transition-colors text-sm font-mono"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

