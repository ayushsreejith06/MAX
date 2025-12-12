export interface LLMTradeAction {
  action: 'buy' | 'sell' | 'hold' | 'rebalance';
  amount: number;
  symbol: string;
  sector?: string;
  stopLoss?: number;
  takeProfit?: number;
  confidence: number;
  reasoning: string;
}

