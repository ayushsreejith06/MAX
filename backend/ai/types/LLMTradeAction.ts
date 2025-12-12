export type LLMTradeSide = 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';

export type LLMTradeSizingBasis = 'fixed_units' | 'fixed_dollars' | 'percent_of_capital';

export type LLMTradeAction = {
  sector: string;
  symbol: string;
  side: LLMTradeSide;
  sizingBasis: LLMTradeSizingBasis;
  size: number;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  reasoning: string;
  confidence: number; // REQUIRED: Must be provided by LLM (0-100)
  allocationPercent?: number; // Optional: Percentage of capital to allocate (0-100)
  riskNotes?: string; // Optional: Risk assessment notes
};

