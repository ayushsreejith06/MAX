"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useSector, useAgents, useDiscussions } from "@/src/lib/api";
import type { SectorSummary } from "@/src/lib/types";

export default function SectorDetailPage() {
  const params = useParams();
  const sectorId = params.id as string;

  const { sector, loading: sectorLoading, error: sectorError } = useSector(sectorId);
  const { agents, loading: agentsLoading } = useAgents({ sectorId });
  const { discussions, loading: discussionsLoading } = useDiscussions({ sectorId });

  const loading = sectorLoading || agentsLoading || discussionsLoading;
  const error = sectorError;

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
            <p className="text-primary-text/60">Loading sector data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !sector) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-down-trend/10 border border-down-trend/50 rounded-lg p-4">
          <p className="text-down-trend">Error: {error || "Sector not found"}</p>
          <Link
            href="/sectors"
            className="mt-4 inline-block text-accent hover:text-up-trend"
          >
            ← Back to Sectors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/sectors"
          className="text-accent hover:text-up-trend mb-4 inline-block"
        >
          ← Back to Sectors
        </Link>
        <h1 className="text-4xl font-bold text-primary-text mb-2">{sector.name}</h1>
        <p className="text-primary-text/60">
          Sector ID: {sector.id}
        </p>
        {sector.createdAt && (
          <p className="text-sm text-primary-text/40 mt-2">
            Created: {new Date(sector.createdAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Agents Section */}
      <div className="bg-card border border-card rounded-lg p-6 mb-6 shadow-dark-md">
        <h2 className="text-xl font-semibold text-primary-text mb-4">
          Agents ({agents.length})
        </h2>
        {agents.length === 0 ? (
          <p className="text-primary-text/60">No agents assigned to this sector yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="bg-background rounded-lg p-4 border border-card hover:border-accent hover:bg-card/50 transition-colors cursor-pointer shadow-dark-sm"
              >
                <h3 className="text-lg font-semibold text-primary-text mb-2">
                  {agent.name}
                </h3>
                <p className="text-sm text-primary-text/60 mb-2 capitalize">
                  {agent.role}
                </p>
                {agent.personality && (
                  <div className="text-xs text-primary-text/40 mt-2">
                    <p>Risk: {agent.personality.riskTolerance || "N/A"}</p>
                    <p>Style: {agent.personality.decisionStyle || "N/A"}</p>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Discussions Section */}
      <div className="bg-card border border-card rounded-lg p-6 mb-6 shadow-dark-md">
        <h2 className="text-xl font-semibold text-primary-text mb-4">
          Discussions ({discussions.length})
        </h2>
        {discussions.length === 0 ? (
          <p className="text-primary-text/60">No discussions in this sector yet.</p>
        ) : (
          <div className="space-y-3">
            {discussions.map((discussion) => (
              <Link
                key={discussion.id}
                href={`/discussions/${discussion.id}`}
                className="block bg-background rounded-lg p-4 border border-card hover:border-accent hover:bg-card/50 transition-colors shadow-dark-sm"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-primary-text mb-2">
                      {discussion.title}
                    </h3>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="text-primary-text/60">Status: </span>
                        <span className="text-primary-text font-medium capitalize">
                          {discussion.status}
                        </span>
                      </div>
                      <div>
                        <span className="text-primary-text/60">Messages: </span>
                        <span className="text-primary-text">{discussion.messagesCount}</span>
                      </div>
                      {discussion.updatedAt && (
                        <div>
                          <span className="text-primary-text/60">Updated: </span>
                          <span className="text-primary-text/80">
                            {new Date(discussion.updatedAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Manager Agent Placeholder */}
      <div className="bg-card border border-card rounded-lg p-6 shadow-dark-md">
        <h2 className="text-xl font-semibold text-primary-text mb-4">
          Manager Agent
        </h2>
        <div className="bg-background rounded-lg p-4 border border-card shadow-dark-sm">
          <p className="text-primary-text/60 italic">Manager Agent Coming Soon</p>
        </div>
      </div>
    </div>
  );
}

