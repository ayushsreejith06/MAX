"use client";

import { AgentCardData } from "./types";
import AgentCard from "./AgentCard";

export default function AgentGrid({ agents }: { agents: AgentCardData[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {agents.map((a) => (
        <AgentCard key={a.id} agent={a} />
      ))}
    </div>
  );
}

