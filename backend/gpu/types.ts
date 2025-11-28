/**
 * Types for GPU-accelerated agent model inference
 */

export interface AgentModelInput {
  // Feature vector based on sectors, prices, agent state
  sectorFeatures: number[];
  priceHistory: number[];
  agentState: {
    riskTolerance: number;
    decisionStyle: number;
    currentPosition: number;
    performance: number;
  };
  marketContext: {
    volatility: number;
    trend: number;
    volume: number;
  };
}

export interface AgentModelOutput {
  // Action logits (probabilities for different actions)
  actionLogits: number[];
  // Risk score (0-1)
  riskScore: number;
  // Confidence level (0-1)
  confidence: number;
  // Recommended action index
  recommendedAction: number;
}

export interface GpuEngineStatus {
  available: boolean;
  provider: 'cuda' | 'directml' | 'cpu' | 'none';
  initialized: boolean;
  error?: string;
}

