"use client";

import { AgentDetailData } from "./types";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function AgentDetailHeader({ agent }: { agent: AgentDetailData }) {
  const statusColor =
    agent.status === "ACTIVE"
      ? "bg-primary/20 text-primary border-primary/50"
      : agent.status === "IDLE"
      ? "bg-[#CA8A04]/20 text-[#CA8A04] border-[#CA8A04]/50"
      : "bg-[#1E3A8A]/20 text-[#1E3A8A] border-[#1E3A8A]/50";

  const perfColor =
    agent.performance >= 0 ? "text-primary" : "text-destructive";

  return (
    <div className="border border-border rounded p-6 bg-card mb-8">
      <h1
        className="text-foreground mb-1"
        style={{ fontFamily: "monospace", fontSize: "22px" }}
      >
        {agent.code}
      </h1>

      <p
        className="text-muted-foreground mb-4"
        style={{ fontFamily: "monospace", fontSize: "13px" }}
      >
        {agent.name}
      </p>

      <div className="flex flex-wrap gap-4 items-center mb-4">
        <span
          className={`inline-block px-3 py-1 rounded border text-xs ${statusColor}`}
          style={{ fontFamily: "monospace" }}
        >
          {agent.status}
        </span>

        <span
          className="px-3 py-1 rounded border border-border text-xs"
          style={{ fontFamily: "monospace" }}
        >
          {agent.sectorCode} — {agent.sectorName}
        </span>

        <div className="flex items-center gap-1">
          {agent.performance >= 0 ? (
            <TrendingUp className="w-4 h-4 text-primary" />
          ) : (
            <TrendingDown className="w-4 h-4 text-destructive" />
          )}
          <span
            className={perfColor}
            style={{ fontSize: "16px", fontFamily: "monospace" }}
          >
            {agent.performance >= 0 ? "+" : ""}
            {agent.performance}%
          </span>
        </div>
      </div>

      <p
        className="text-muted-foreground"
        style={{ fontFamily: "monospace", fontSize: "11px" }}
      >
        Last Updated: {agent.updatedAt}
      </p>
    </div>
  );
}

