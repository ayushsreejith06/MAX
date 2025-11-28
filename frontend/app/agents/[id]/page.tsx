import AgentDetailHeader from "./_components/AgentDetailHeader";
import AgentDetailGrid from "./_components/AgentDetailGrid";
import { AgentDetailData } from "./_components/types";

// TEMPORARY MOCK — real data wiring in a later prompt
function getMockAgent(id: string): AgentDetailData {
  const mockAgents: Record<string, AgentDetailData> = {
    "financial-agent-1": {
      id: "financial-agent-1",
      code: "FIN-001",
      name: "Financial Trader 1",
      sectorCode: "FINC",
      sectorName: "Financial",
      status: "ACTIVE",
      performance: 5.23,
      trades: 312,
      risk: "Medium",
      decision: "Balanced",
      createdAt: "Nov 12, 2025, 2:14 PM",
      updatedAt: "Nov 28, 2025, 6:45 PM",
    },
    "energy-agent-1": {
      id: "energy-agent-1",
      code: "ENRG-001",
      name: "Energy Analyst 1",
      sectorCode: "ENRG",
      sectorName: "Energy",
      status: "IDLE",
      performance: -2.15,
      trades: 189,
      risk: "High",
      decision: "Aggressive",
      createdAt: "Nov 10, 2025, 10:30 AM",
      updatedAt: "Nov 28, 2025, 5:30 PM",
    },
    "tech-agent-1": {
      id: "tech-agent-1",
      code: "TECH-001",
      name: "Tech Strategist 1",
      sectorCode: "TECH",
      sectorName: "Technology",
      status: "PROCESSING",
      performance: 8.47,
      trades: 456,
      risk: "Low",
      decision: "Conservative",
      createdAt: "Nov 8, 2025, 4:22 PM",
      updatedAt: "Nov 28, 2025, 7:15 PM",
    },
    "healthcare-agent-1": {
      id: "healthcare-agent-1",
      code: "HLTH-001",
      name: "Healthcare Trader 1",
      sectorCode: "HLTH",
      sectorName: "Healthcare",
      status: "ACTIVE",
      performance: 3.89,
      trades: 278,
      risk: "Medium",
      decision: "Balanced",
      createdAt: "Nov 5, 2025, 9:15 AM",
      updatedAt: "Nov 28, 2025, 6:20 PM",
    },
    "financial-agent-2": {
      id: "financial-agent-2",
      code: "FIN-002",
      name: "Financial Trader 2",
      sectorCode: "FINC",
      sectorName: "Financial",
      status: "ACTIVE",
      performance: 12.34,
      trades: 523,
      risk: "High",
      decision: "Aggressive",
      createdAt: "Nov 3, 2025, 1:45 PM",
      updatedAt: "Nov 28, 2025, 7:00 PM",
    },
    "energy-agent-2": {
      id: "energy-agent-2",
      code: "ENRG-002",
      name: "Energy Analyst 2",
      sectorCode: "ENRG",
      sectorName: "Energy",
      status: "IDLE",
      performance: -0.56,
      trades: 145,
      risk: "Low",
      decision: "Conservative",
      createdAt: "Nov 1, 2025, 11:20 AM",
      updatedAt: "Nov 28, 2025, 4:45 PM",
    },
  };

  // Return matching agent or default to first one
  return (
    mockAgents[id] || {
      id,
      code: "FIN-001",
      name: "Financial Trader 1",
      sectorCode: "FINC",
      sectorName: "Financial",
      status: "ACTIVE",
      performance: 5.23,
      trades: 312,
      risk: "Medium",
      decision: "Balanced",
      createdAt: "Nov 12, 2025, 2:14 PM",
      updatedAt: "Nov 28, 2025, 6:45 PM",
    }
  );
}

export default function AgentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const agent = getMockAgent(params.id);

  return (
    <div className="p-0">
      <AgentDetailHeader agent={agent} />
      <AgentDetailGrid agent={agent} />

      {/* READ-ONLY DISCUSSION PLACEHOLDER */}
      <div className="border border-border rounded p-6 bg-card">
        <h2
          className="text-foreground mb-2"
          style={{ fontFamily: "monospace", fontSize: "16px" }}
        >
          Agent Discussions
        </h2>

        <p
          className="text-muted-foreground"
          style={{ fontFamily: "monospace", fontSize: "11px" }}
        >
          Discussions for this agent appear here.  
          These threads are opened and closed **only** by manager agents.  
          Users may view them, but cannot create or manage threads.
        </p>
      </div>
    </div>
  );
}

