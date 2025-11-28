"use client";

import { AgentDetailData } from "./types";

export default function AgentDetailGrid({ agent }: { agent: AgentDetailData }) {
  const item = (label: string, value: string | number) => (
    <div className="flex flex-col">
      <span
        className="text-muted-foreground mb-1"
        style={{ fontFamily: "monospace", fontSize: "10px" }}
      >
        {label}
      </span>
      <span
        className="text-foreground"
        style={{ fontFamily: "monospace", fontSize: "13px" }}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-8 border border-border rounded p-6 bg-card mb-8">
      {item("SECTOR", `${agent.sectorCode} (${agent.sectorName})`)}
      {item("TRADES", agent.trades)}
      {item("PERFORMANCE", `${agent.performance >= 0 ? "+" : ""}${agent.performance}%`)}
      {item("RISK TOLERANCE", agent.risk)}
      {item("DECISION STYLE", agent.decision)}
      {item("CREATED", agent.createdAt)}
      {item("AGENT ID", agent.id)}
    </div>
  );
}

