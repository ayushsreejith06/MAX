export interface CandleData {
  time: string;
  value: number;
}

export interface ValuationHistoryPoint {
  id: string;
  sectorId: string;
  price: number;
  timestamp: number;
  volume?: number;
  change?: number;
  changePercent?: number;
}

export type AgentStatus = 'IDLE' | 'ACTIVE' | string; // Only IDLE and ACTIVE are valid statuses

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
  content: string; // For backward compatibility, this is now proposal.reasoning
  analysis?: string; // Internal analysis (not shown in UI)
  proposal?: { // Structured proposal JSON for checklist creation
    action: 'BUY' | 'SELL' | 'HOLD';
    symbol: string;
    allocationPercent: number;
    confidence: number;
    reasoning: string;
  };
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
  amount?: number; // Required field - must be displayed
  allocationPercent?: number; // 0–100 (primary field)
  symbol?: string;
  reason?: string; // Also called "reasoning" in some places
  reasoning?: string; // Alias for rationale
  rationale?: string; // Primary field (1–2 sentences, concise)
  confidence?: number; // 0–100 - Required field - must be displayed
  // Manager approval status - Required field - must be displayed
  approvalStatus?: 'pending' | 'accepted' | 'rejected' | 'accept_rejection';
  approvalReason?: string | null;
  // Revision metadata
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'REVISE_REQUIRED' | 'ACCEPT_REJECTION' | 'RESUBMITTED' | string;
  requiresRevision?: boolean;
  requiresManagerEvaluation?: boolean;
  managerReason?: string | null;
  revisionCount?: number;
  revisedAt?: string;
  // Refinement tracking
  refinementLog?: Array<{
    round: number;
    action: 'REJECTED' | 'RESUBMITTED' | 'ACCEPT_REJECTION';
    managerReason?: string;
    reason?: string;
    shouldReduceSize?: boolean;
    timestamp: string;
  }>; // Log of each refinement attempt
  // Manager decision metadata - authoritative state
  decisionBy?: string; // Manager ID who made the decision
  decidedAt?: string; // ISO timestamp when decision was made
  rejectionReason?: {
    score?: number;
    approvalThreshold?: number;
    scoreBreakdown?: {
      workerConfidence?: number;
      expectedImpact?: number;
      riskLevel?: number;
      alignmentWithSectorGoal?: number;
      normalizedRiskScore?: number;
      weights?: {
        workerConfidence?: number;
        expectedImpact?: number;
        riskLevel?: number;
        alignmentWithSectorGoal?: number;
      };
    };
    reason?: string;
    confidence?: number;
    effectiveThreshold?: number;
    requiredImprovements?: string[];
  };
  previousVersions?: Array<{
    action?: string;
    amount?: number;
    allocationPercent?: number;
    reason?: string;
    confidence?: number;
    timestamp: string;
  }>;
  // Execution metadata
  executedAt?: string | null; // ISO timestamp when item was executed
  executionLogId?: string | null; // ID of the execution log entry
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

export type DiscussionStatus = 'OPEN' | 'CLOSED' | 'in_progress' | 'IN_PROGRESS' | 'AWAITING_EXECUTION' | 'awaiting_execution' | 'accepted' | 'rejected' | 'closed' | 'archived' | 'decided' | 'DECIDED' | 'finalized' | string;

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
  checklistItems?: ChecklistItem[]; // Primary field - unified array of all checklist items
  checklistDraft?: ChecklistItem[]; // Legacy field
  checklist?: ChecklistItem[]; // Legacy field
  finalizedChecklist?: ChecklistItem[]; // Legacy field
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
  position?: number; // Current position value
  holdings?: {
    position?: number;
    [key: string]: any;
  };
  // Additional fields
  lastSimulatedPrice?: number | null;
  initialPrice?: number;
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

