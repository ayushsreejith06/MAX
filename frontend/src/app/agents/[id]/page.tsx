/**
 * Agent detail page - displays full agent information including
 * avatar, stats, performance chart, and discussion involvement.
 */

'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAgents } from '@/src/lib/api';
import StatusBadge from '@/src/components/agents/StatusBadge';
import LineChart from '@/src/components/agents/LineChart';

// Generate mock performance data for chart
function generatePerformanceData(basePerformance: number, days: number = 30): number[] {
  const data: number[] = [];
  let current = basePerformance;
  
  for (let i = 0; i < days; i++) {
    // Random walk with slight trend towards base performance
    const change = (Math.random() - 0.5) * 2;
    current = current + change;
    data.push(Math.max(-50, Math.min(50, current))); // Clamp between -50 and 50
  }
  
  return data;
}

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.id as string;

  const { agents, loading, error } = useAgents();
  const agent = agents.find((a) => a.id === agentId);
  
  const performanceData = agent ? generatePerformanceData(agent.performance) : [];

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-gray-400">Loading agent...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-6 max-w-md">
          <h2 className="text-xl font-semibold text-red-400 mb-2">Error</h2>
          <p className="text-gray-300 mb-4">{error || 'Agent not found'}</p>
          <Link
            href="/agents"
            className="text-blue-400 hover:text-blue-300 inline-block"
          >
            ← Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  const performanceColor = agent.performance > 0 ? '#10b981' : agent.performance < 0 ? '#ef4444' : '#6b7280';

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/agents"
          className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
        >
          ← Back to Agents
        </Link>
      </div>

      {/* Agent Header Card */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-8 mb-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white">
              {agent.name.charAt(0).toUpperCase()}
            </div>
          </div>

          {/* Agent Info */}
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              <h1 className="text-3xl font-bold text-white">{agent.name}</h1>
              <StatusBadge status={agent.status} />
            </div>
            <p className="text-lg text-gray-400 capitalize mb-2">{agent.role}</p>
            {agent.sectorName && (
              <p className="text-sm text-gray-500">
                Sector: {agent.sectorName} ({agent.sectorSymbol})
              </p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Created: {new Date(agent.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Performance Stats */}
          <div className="flex-shrink-0 text-right">
            <p className="text-sm text-gray-400 mb-1">Performance</p>
            <p
              className={`text-3xl font-bold ${
                agent.performance > 0
                  ? 'text-green-400'
                  : agent.performance < 0
                  ? 'text-red-400'
                  : 'text-gray-400'
              }`}
            >
              {agent.performance > 0 ? '+' : ''}
              {agent.performance.toFixed(2)}%
            </p>
            <p className="text-sm text-gray-500 mt-2">{agent.trades} trades</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Stats */}
        <div className="lg:col-span-1 space-y-6">
          {/* Skills & Memory Stats */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Skills & Memory</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-2">Personality Traits</p>
                <div className="space-y-2">
                  {agent.personality.riskTolerance && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-300">Risk Tolerance</span>
                      <span className="text-sm font-medium text-white capitalize">
                        {agent.personality.riskTolerance}
                      </span>
                    </div>
                  )}
                  {agent.personality.decisionStyle && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-300">Decision Style</span>
                      <span className="text-sm font-medium text-white capitalize">
                        {agent.personality.decisionStyle}
                      </span>
                    </div>
                  )}
                  {agent.personality.communicationStyle && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-300">Communication</span>
                      <span className="text-sm font-medium text-white capitalize">
                        {agent.personality.communicationStyle}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-700">
                <p className="text-sm text-gray-400 mb-2">Memory Stats</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">Memory Entries</span>
                    <span className="text-sm font-medium text-white">0</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">Last Updated</span>
                    <span className="text-sm font-medium text-white">
                      {new Date(agent.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Discussion Involvement Preview */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Discussion Involvement</h2>
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                This agent has participated in <span className="text-white font-medium">0</span> discussions.
              </p>
              <p className="text-xs text-gray-500 italic">
                Discussion preview coming soon
              </p>
            </div>
          </div>
        </div>

        {/* Right Column - Performance Chart */}
        <div className="lg:col-span-2">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Performance Chart</h2>
            <div className="h-64">
              <LineChart
                data={performanceData}
                width={800}
                height={256}
                color={performanceColor}
                showGrid={true}
                label="Performance Over Time (%)"
              />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Current</p>
                  <p className={`text-lg font-semibold ${performanceColor === '#10b981' ? 'text-green-400' : performanceColor === '#ef4444' ? 'text-red-400' : 'text-gray-400'}`}>
                    {agent.performance > 0 ? '+' : ''}
                    {agent.performance.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Total Trades</p>
                  <p className="text-lg font-semibold text-white">{agent.trades}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Avg. Performance</p>
                  <p className="text-lg font-semibold text-white">
                    {performanceData.length > 0
                      ? (
                          performanceData.reduce((a, b) => a + b, 0) / performanceData.length
                        ).toFixed(2)
                      : '0.00'}
                    %
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

