export interface AgentDetailData {
  id: string;
  code: string;
  name: string;
  sectorCode: string;
  sectorName: string;
  status: "ACTIVE" | "IDLE" | "PROCESSING";
  performance: number;
  trades: number;
  risk: string;
  decision: string;
  createdAt: string;
  updatedAt: string;
}

