'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getSectorById, getAgents, getDiscussions } from '@/src/lib/api';
import type { Sector, AgentWithSectorMeta, DiscussionSummary } from '@/src/lib/types';
import LineChart from '@/src/components/sector/LineChart';
import SectorSummaryHeader from '@/src/components/sector/SectorSummaryHeader';
import AgentPreviewList from '@/src/components/sector/AgentPreviewList';
import DiscussionPreview from '@/src/components/sector/DiscussionPreview';

export default function SectorDetailPage() {
  const params = useParams();
  const sectorId = params.id as string;

  const [sector, setSector] = useState<Sector | null>(null);
  const [agents, setAgents] = useState<AgentWithSectorMeta[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [sectorData, agentsData, discussionsData] = await Promise.all([
          getSectorById(sectorId),
          getAgents({ sectorId }),
          getDiscussions({ sectorId }),
        ]);

        setSector(sectorData);
        setAgents(agentsData);
        setDiscussions(discussionsData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load sector data'
        );
        console.error('Error loading sector:', err);
      } finally {
        setLoading(false);
      }
    };

    if (sectorId) {
      loadData();
    }
  }, [sectorId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-gray-400">Loading sector data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !sector) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-red-400 mb-2">Error</h2>
          <p className="text-red-200 mb-4">
            {error || 'Sector not found'}
          </p>
          <Link
            href="/sectors"
            className="inline-block text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Back to Sectors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Navigation */}
      <div className="mb-6">
        <Link
          href="/sectors"
          className="text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-2"
        >
          <span>←</span>
          <span>Back to Sectors</span>
        </Link>
      </div>

      {/* Sector Summary Header */}
      <SectorSummaryHeader sector={sector} />

      {/* Price Chart */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Price Chart
        </h2>
        <LineChart
          data={sector.candleData || []}
          height={400}
          color="#3b82f6"
          showGrid={true}
        />
      </div>

      {/* Agents Preview */}
      <div className="mb-6">
        <AgentPreviewList agents={agents} />
      </div>

      {/* Discussions Preview */}
      <div>
        <DiscussionPreview discussions={discussions} sectorId={sector.id} />
      </div>
    </div>
  );
}

