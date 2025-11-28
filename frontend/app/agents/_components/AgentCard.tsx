"use client";

import { AgentCardData } from "./types";
import Link from "next/link";
import { TrendingUp, TrendingDown, User } from "lucide-react";

export default function AgentCard({ agent }: { agent: AgentCardData }) {
  const statusColor =
    agent.status === "ACTIVE"
      ? "bg-primary/20 text-primary border-primary/50"
      : agent.status === "IDLE"
      ? "bg-[#CA8A04]/20 text-[#CA8A04] border-[#CA8A04]/50"
      : "bg-[#1E3A8A]/20 text-[#1E3A8A] border-[#1E3A8A]/50";

  const perfColor =
    agent.performance >= 0 ? "text-primary" : "text-destructive";

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="bg-card border border-border rounded p-5 hover:border-primary/50 transition-colors block"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-primary/10 rounded">
              <User className="w-5 h-5 text-primary" />
            </div>

            <div>
              <h3
                className="text-foreground"
                style={{ fontFamily: "monospace", fontSize: "16px" }}
              >
                {agent.code}
              </h3>
              <p
                className="text-muted-foreground"
                style={{ fontFamily: "monospace", fontSize: "11px" }}
              >
                {agent.name}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div>
              <p
                className="text-muted-foreground mb-1"
                style={{ fontSize: "10px", fontFamily: "monospace" }}
              >
                SECTOR
              </p>
              <p
                className="text-foreground"
                style={{ fontSize: "12px", fontFamily: "monospace" }}
              >
                {agent.sectorCode}
              </p>
              <p
                className="text-muted-foreground"
                style={{ fontSize: "10px", fontFamily: "monospace" }}
              >
                {agent.sectorName}
              </p>
            </div>

            <div>
              <p
                className="text-muted-foreground mb-1"
                style={{ fontSize: "10px", fontFamily: "monospace" }}
              >
                STATUS
              </p>
              <span
                className={`inline-block px-2 py-1 rounded border text-xs ${statusColor}`}
                style={{ fontFamily: "monospace" }}
              >
                {agent.status}
              </span>
            </div>

            <div>
              <p
                className="text-muted-foreground mb-1"
                style={{ fontSize: "10px", fontFamily: "monospace" }}
              >
                PERFORMANCE
              </p>

              <div className="flex items-center gap-1">
                {agent.performance >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-primary" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-destructive" />
                )}

                <p
                  className={perfColor}
                  style={{ fontSize: "14px", fontFamily: "monospace" }}
                >
                  {agent.performance >= 0 ? "+" : ""}
                  {agent.performance}%
                </p>
              </div>
            </div>

            <div>
              <p
                className="text-muted-foreground mb-1"
                style={{ fontSize: "10px", fontFamily: "monospace" }}
              >
                TRADES
              </p>
              <p
                className="text-foreground"
                style={{ fontSize: "14px", fontFamily: "monospace" }}
              >
                {agent.trades}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-3 border-t border-border">
            <div>
              <p
                className="text-muted-foreground mb-1"
                style={{ fontSize: "10px", fontFamily: "monospace" }}
              >
                RISK TOLERANCE
              </p>
              <p
                className="text-foreground"
                style={{ fontSize: "11px", fontFamily: "monospace" }}
              >
                {agent.risk}
              </p>
            </div>

            <div>
              <p
                className="text-muted-foreground mb-1"
                style={{ fontSize: "10px", fontFamily: "monospace" }}
              >
                DECISION STYLE
              </p>
              <p
                className="text-foreground"
                style={{ fontSize: "11px", fontFamily: "monospace" }}
              >
                {agent.decision}
              </p>
            </div>

            <div>
              <p
                className="text-muted-foreground mb-1"
                style={{ fontSize: "10px", fontFamily: "monospace" }}
              >
                AGENT ID
              </p>
              <p
                className="text-muted-foreground"
                style={{ fontSize: "11px", fontFamily: "monospace" }}
              >
                {agent.id}
              </p>
            </div>

            <div>
              <p
                className="text-muted-foreground mb-1"
                style={{ fontSize: "10px", fontFamily: "monospace" }}
              >
                CREATED
              </p>
              <p
                className="text-muted-foreground"
                style={{ fontSize: "11px", fontFamily: "monospace" }}
              >
                {agent.createdAt}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

