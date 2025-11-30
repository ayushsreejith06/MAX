/**
 * execution.js - Accepts manager decisions, checks rules, executes trades
 * Emits "simulated trade" events
 */

const EventEmitter = require('events');
const { validateTrade, checkRiskAppetite } = require('./rules');
const { Orderbook } = require('./orderbook');

class ExecutionEngine extends EventEmitter {
  constructor(sectorId, orderbook) {
    super();
    this.sectorId = sectorId;
    this.orderbook = orderbook;
  }

  /**
   * Execute a trade decision from a manager agent
   * @param {Object} decision - Trade decision from manager
   * @param {string} decision.action - 'BUY' or 'SELL'
   * @param {number} decision.quantity - Quantity to trade
   * @param {number} decision.price - Price (for limit orders, null for market)
   * @param {string} decision.agentId - ID of the agent making the decision
   * @param {string} decision.type - 'limit' or 'market' (default: 'market')
   * @param {number} decision.confidence - Confidence level (0-1)
   * @param {number} decision.riskScore - Risk score (0-100)
   */
  async executeDecision(decision) {
    try {
      // Validate decision structure
      if (!decision.action || !['BUY', 'SELL'].includes(decision.action.toUpperCase())) {
        throw new Error('Invalid action: must be BUY or SELL');
      }

      if (!decision.quantity || decision.quantity <= 0) {
        throw new Error('Invalid quantity: must be positive');
      }

      if (!decision.agentId) {
        throw new Error('Missing agentId');
      }

      // Check rules
      const validation = await validateTrade(this.sectorId, {
        quantity: decision.quantity,
        assetId: this.sectorId,
        sectorId: this.sectorId,
        leverage: decision.leverage || 1.0
      });

      if (!validation.valid) {
        const error = new Error(`Trade validation failed: ${validation.errors.join(', ')}`);
        this.emit('trade_rejected', {
          decision,
          reason: 'validation_failed',
          errors: validation.errors
        });
        throw error;
      }

      // Check risk appetite if risk score provided
      if (decision.riskScore !== undefined) {
        const riskAllowed = await checkRiskAppetite(this.sectorId, decision.riskScore);
        if (!riskAllowed) {
          const error = new Error(`Trade rejected: risk score ${decision.riskScore} exceeds risk appetite`);
          this.emit('trade_rejected', {
            decision,
            reason: 'risk_exceeded',
            riskScore: decision.riskScore
          });
          throw error;
        }
      }

      // Determine order type
      const orderType = decision.type || 'market';
      const orderPrice = orderType === 'limit' ? decision.price : null;

      if (orderType === 'limit' && !orderPrice) {
        throw new Error('Limit order requires a price');
      }

      // Create order
      const side = decision.action.toUpperCase() === 'BUY' ? 'buy' : 'sell';
      const order = this.orderbook.addOrder({
        type: orderType,
        side,
        price: orderPrice,
        quantity: decision.quantity,
        agentId: decision.agentId
      });

      // Get executed trades from orderbook
      const recentTrades = this.orderbook.getTradeHistory(10);
      const newTrades = recentTrades.filter(t => 
        t.buyOrderId === order.id || t.sellOrderId === order.id
      );

      // Emit simulated trade events
      for (const trade of newTrades) {
        this.emit('simulated_trade', {
          trade,
          decision,
          orderbook: this.orderbook.getSummary()
        });
      }

      return {
        success: true,
        order,
        trades: newTrades,
        orderbook: this.orderbook.getSummary()
      };
    } catch (error) {
      this.emit('execution_error', {
        decision,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get execution engine status
   */
  getStatus() {
    return {
      sectorId: this.sectorId,
      orderbook: this.orderbook.getSummary()
    };
  }
}

module.exports = ExecutionEngine;

