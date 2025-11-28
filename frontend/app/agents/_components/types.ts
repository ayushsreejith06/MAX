export interface AgentCardData {
  id: string;
  code: string; // e.g. FIN-001
  name: string;
  sectorCode: string; // FINC, ENRG, etc.
  sectorName: string; // Financial, Energy, ...
  status: "ACTIVE" | "IDLE" | "PROCESSING";
  performance: number; // + or -
  trades: number;
  risk: string;
  decision: string;
  createdAt: string;
}

