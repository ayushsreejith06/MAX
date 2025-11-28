import AgentGrid from "./_components/AgentGrid";
import { AgentCardData } from "./_components/types";

// TEMPORARY MOCK DATA
// Replace with live data wiring in a later prompt.
const mockAgents: AgentCardData[] = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
];

export default function AgentsPage() {
  return (
    <div className="p-0">
      <AgentGrid agents={mockAgents} />
    </div>
  );
}
