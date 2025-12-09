export interface CandleData {
  time: string;
  value: number;
}

export type AgentStatus = 'active' | 'idle' | 'processing' | string;

export interface AgentPersonality {
  riskTolerance: string;
  decisionStyle: string;
}

export interface AgentPreferences {
  riskWeight?: number;
  profitWeight?: number;
  speedWeight?: number;
  accuracyWeight?: number;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  performance: number;
  trades: number;
  status: AgentStatus;
  sectorId?: string | null;
  sectorSymbol?: string;
  sectorName?: string;
  personality: AgentPersonality;
  prompt?: string; // Agent prompt/instructions
  preferences?: AgentPreferences; // Agent preferences for decision-making
  morale?: number; // Morale value (0-100)
  rewardPoints?: number; // Reward points accumulated
  confidence?: number; // Confidence value (-100 to +100)
  createdAt?: string;
  rawTrades?: any[]; // Raw trades array for detailed analysis
  rawPerformance?: { pnl?: number; winRate?: number }; // Raw performance object
}

export interface Message {
  id: string;
  agentId?: string;
  agentName: string;
  content: string;
  timestamp: string;
  role?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  agentId?: string;
  agentName?: string;
  round?: number;
}

export type DiscussionStatus = 'in_progress' | 'accepted' | 'rejected' | 'closed' | 'archived' | 'decided' | string;

export interface Discussion {
  id: string;
  sectorId: string;
  title: string;
  status: DiscussionStatus;
  agentIds: string[];
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  sectorSymbol?: string;
  sectorName?: string;
  round?: number;
  checklistDraft?: ChecklistItem[];
  checklist?: ChecklistItem[];
}

export interface Sector {
  id: string;
  // Primary standardized fields
  name: string;
  symbol: string;
  // Backward compatibility fields (may be present from backend)
  sectorName?: string;
  sectorSymbol?: string;
  // Core market data fields
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  // Risk and volatility
  volatility?: number;
  riskScore?: number;
  // Agent and activity fields
  agents: Agent[];
  activeAgents: number;
  buyAgents?: number;
  sellAgents?: number;
  statusPercent: number;
  // Performance and balance
  performance?: Record<string, any>;
  balance?: number;
  // Additional fields
  lastSimulatedPrice?: number | null;
  discussions: Discussion[];
  candleData: CandleData[];
  description?: string;
  createdAt: string;
}

export type ApiPayload<T> = T | { data: T } | { success: boolean; data: T };

