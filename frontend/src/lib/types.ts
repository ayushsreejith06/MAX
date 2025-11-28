/**
 * TypeScript type definitions for MAX backend API.
 * These types match the backend Pydantic schemas and ensure type safety
 * between frontend and backend.
 */

// ============================================================================
// Enums
// ============================================================================

export type AgentStatus = "active" | "idle" | "processing" | "offline";

export type DiscussionStatus = "created" | "active" | "closed" | "archived";

// ============================================================================
// Base Types
// ============================================================================

/**
 * Agent personality traits.
 * Matches backend AgentPersonality schema.
 */
export interface AgentPersonality {
  riskTolerance?: string;
  decisionStyle?: string;
  communicationStyle?: string;
  [key: string]: any; // Allow additional personality traits
}

/**
 * Candle data point for sector price charts.
 * Matches backend CandlePoint schema.
 */
export interface CandlePoint {
  time: string; // Format: "HH:MM" (e.g., "14:30")
  value: number; // Price/index value
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent with full details including sector metadata.
 * Matches backend AgentRead schema.
 */
export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  performance: number;
  trades: number;
  sectorId: string;
  personality: AgentPersonality;
  createdAt: string; // ISO 8601 datetime string
  sectorName?: string; // Included in AgentRead
  sectorSymbol?: string; // Included in AgentRead
}

/**
 * Agent with sector metadata for list views.
 * Used when fetching agents with sector information.
 */
export interface AgentWithSectorMeta extends Agent {
  sectorName: string;
  sectorSymbol: string;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Message in a discussion.
 * Matches backend MessageRead schema.
 */
export interface Message {
  id: string;
  discussionId: string;
  agentId: string | null;
  agentName: string;
  content: string;
  timestamp: string; // ISO 8601 datetime string
}

// ============================================================================
// Discussion Types
// ============================================================================

/**
 * Discussion summary for list views.
 * Matches backend DiscussionSummary schema.
 */
export interface DiscussionSummary {
  id: string;
  sectorId: string;
  sectorSymbol?: string;
  title: string;
  status: DiscussionStatus;
  agentIds: string[];
  messagesCount: number;
  updatedAt: string; // ISO 8601 datetime string
}

/**
 * Full discussion with messages.
 * Matches backend DiscussionRead schema.
 */
export interface Discussion {
  id: string;
  sectorId: string;
  title: string;
  status: DiscussionStatus;
  agentIds: string[];
  messages: Message[];
  createdAt: string; // ISO 8601 datetime string
  updatedAt: string; // ISO 8601 datetime string
}

// ============================================================================
// Sector Types
// ============================================================================

/**
 * Sector summary for list views.
 * Matches backend SectorSummary schema.
 */
export interface SectorSummary {
  id: string;
  name: string;
  symbol: string;
  createdAt: string; // ISO 8601 datetime string
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  agentsCount: number;
  activeAgentsCount: number;
  discussionsCount: number;
}

/**
 * Full sector with nested agents, discussions, and candle data.
 * Matches backend SectorRead schema.
 */
export interface Sector {
  id: string;
  name: string;
  symbol: string;
  createdAt: string; // ISO 8601 datetime string
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  agents: Agent[];
  discussions: DiscussionSummary[]; // Simplified discussions in sector view
  candleData: CandlePoint[];
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Generic API response wrapper.
 * Matches backend ApiResponse schema.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

