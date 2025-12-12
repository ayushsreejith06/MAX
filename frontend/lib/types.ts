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
  displayName?: string;
  role: string;
  style?: 'Aggressive' | 'Balanced' | 'Defensive' | string;
  riskTolerance?: 'low' | 'medium' | 'high' | string;
  shortBio?: string;
  initialConfidence?: number;
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
  text?: string; // For backward compatibility with draft items
  agentId?: string;
  agentName?: string;
  round?: number;
  // Finalized checklist fields
  action?: string; // "buy" | "sell" | "hold" | "rebalance"
  amount?: number;
  reason?: string; // Also called "reasoning" in some places
  reasoning?: string; // Alias for reason
  confidence?: number;
  // Revision metadata
  status?: 'PENDING' | 'REJECTED' | 'REVISE_REQUIRED' | 'APPROVED' | 'ACCEPT_REJECTION' | 'RESUBMITTED' | string;
  requiresRevision?: boolean;
  requiresManagerEvaluation?: boolean;
  managerReason?: string | null;
  revisionCount?: number;
  revisedAt?: string;
  previousVersions?: Array<{
    action?: string;
    amount?: number;
    reason?: string;
    confidence?: number;
    timestamp: string;
  }>;
}

// Round history snapshot for multi-round discussions
export interface RoundSnapshot {
  round: number;
  checklist: ChecklistItem[];
  managerDecisions?: Array<{
    item: ChecklistItem;
    approved: boolean;
    status: string;
    reason?: string;
  }>;
  timestamp: string;
}

export type DiscussionStatus = 'OPEN' | 'CLOSED' | 'in_progress' | 'accepted' | 'rejected' | 'closed' | 'archived' | 'decided' | 'finalized' | string;

export interface Discussion {
  id: string;
  sectorId: string;
  title: string;
  status: DiscussionStatus;
  agentIds: string[];
  messages: Message[];
  messagesCount?: number; // Optional for backward compatibility
  createdAt: string;
  updatedAt: string;
  sectorSymbol?: string;
  sectorName?: string;
  round?: number; // Legacy field, use currentRound for multi-round
  // Multi-round discussion fields
  currentRound?: number; // Current round number (integer)
  roundHistory?: RoundSnapshot[]; // Array of round snapshots
  checklistDraft?: ChecklistItem[];
  checklist?: ChecklistItem[];
  finalizedChecklist?: ChecklistItem[];
  // Manager decision fields
  managerDecisions?: Array<{
    item: ChecklistItem;
    approved: boolean;
    status: string;
    reason?: string;
  }>;
  // Closure fields
  discussionClosedAt?: string;
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

export interface RejectedItem {
  id: string;
  text: string;
  discussionId: string;
  discussionTitle: string;
  sectorId: string;
  sectorSymbol: string;
  timestamp: number;
}

export type ApiPayload<T> = T | { data: T } | { success: boolean; data: T };

