/**
 * Orderbook.js - Internal bid/ask book with limit/market order matching
 * Tracks trade history for the sector
 */

const { v4: uuidv4 } = require('uuid');

class Order {
  constructor({ id, type, side, price, quantity, timestamp, agentId }) {
    this.id = id || uuidv4();
    this.type = type; // 'limit' or 'market'
    this.side = side; // 'buy' or 'sell'
    this.price = price; // For limit orders, null for market orders
    this.quantity = quantity;
    this.remainingQuantity = quantity;
    this.timestamp = timestamp || Date.now();
    this.agentId = agentId;
    this.status = 'pending'; // 'pending', 'filled', 'partially_filled', 'cancelled'
  }
}

class Trade {
  constructor({ id, buyOrderId, sellOrderId, price, quantity, timestamp, sectorId }) {
    this.id = id || uuidv4();
    this.buyOrderId = buyOrderId;
    this.sellOrderId = sellOrderId;
    this.price = price;
    this.quantity = quantity;
    this.timestamp = timestamp || Date.now();
    this.sectorId = sectorId;
  }
}

class Orderbook {
  constructor(sectorId) {
    this.sectorId = sectorId;
    this.bids = []; // Buy orders sorted by price (highest first)
    this.asks = []; // Sell orders sorted by price (lowest first)
    this.orders = new Map(); // All orders by ID
    this.tradeHistory = []; // All executed trades
    this.lastPrice = null; // Last trade price
  }

  /**
   * Add a new order to the orderbook
   */
  addOrder(orderData) {
    const order = new Order(orderData);
    this.orders.set(order.id, order);

    if (order.side === 'buy') {
      this.bids.push(order);
      // Sort bids by price descending (highest first), then by timestamp
      this.bids.sort((a, b) => {
        if (a.price !== b.price) {
          return (b.price || Infinity) - (a.price || Infinity);
        }
        return a.timestamp - b.timestamp;
      });
    } else {
      this.asks.push(order);
      // Sort asks by price ascending (lowest first), then by timestamp
      this.asks.sort((a, b) => {
        if (a.price !== b.price) {
          return (a.price || 0) - (b.price || 0);
        }
        return a.timestamp - b.timestamp;
      });
    }

    // Try to match immediately
    this.matchOrders();

    return order;
  }

  /**
   * Match orders in the orderbook
   */
  matchOrders() {
    while (this.bids.length > 0 && this.asks.length > 0) {
      const bestBid = this.bids[0];
      const bestAsk = this.asks[0];

      // Check if they can match
      // For market orders, use the opposite side's price or last trade price
      let matchPrice = null;
      let canMatch = false;

      if (bestBid.type === 'market' && bestAsk.type === 'market') {
        // Both market orders - use last price or default
        matchPrice = this.lastPrice || 100;
        canMatch = true;
      } else if (bestBid.type === 'market') {
        // Market buy - match at ask price
        matchPrice = bestAsk.price;
        canMatch = true;
      } else if (bestAsk.type === 'market') {
        // Market sell - match at bid price
        matchPrice = bestBid.price;
        canMatch = true;
      } else {
        // Both limit orders - check if bid >= ask
        if (bestBid.price >= bestAsk.price) {
          matchPrice = bestAsk.price; // Price-time priority: match at ask price
          canMatch = true;
        }
      }

      if (!canMatch) {
        break;
      }

      // Execute trade
      const tradeQuantity = Math.min(bestBid.remainingQuantity, bestAsk.remainingQuantity);
      const trade = new Trade({
        buyOrderId: bestBid.id,
        sellOrderId: bestAsk.id,
        price: matchPrice,
        quantity: tradeQuantity,
        sectorId: this.sectorId
      });

      this.tradeHistory.push(trade);
      this.lastPrice = matchPrice;

      // Update order quantities
      bestBid.remainingQuantity -= tradeQuantity;
      bestAsk.remainingQuantity -= tradeQuantity;

      // Update order status
      if (bestBid.remainingQuantity === 0) {
        bestBid.status = 'filled';
        this.bids.shift();
      } else {
        bestBid.status = 'partially_filled';
      }

      if (bestAsk.remainingQuantity === 0) {
        bestAsk.status = 'filled';
        this.asks.shift();
      } else {
        bestAsk.status = 'partially_filled';
      }
    }
  }

  /**
   * Get best bid price
   */
  getBestBid() {
    return this.bids.length > 0 ? this.bids[0].price : null;
  }

  /**
   * Get best ask price
   */
  getBestAsk() {
    return this.asks.length > 0 ? this.asks[0].price : null;
  }

  /**
   * Get mid price (average of best bid and ask)
   */
  getMidPrice() {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (bid && ask) {
      return (bid + ask) / 2;
    }
    return this.lastPrice || 100;
  }

  /**
   * Get spread
   */
  getSpread() {
    const bid = this.getBestBid();
    const ask = this.getBestAsk();
    if (bid && ask) {
      return ask - bid;
    }
    return null;
  }

  /**
   * Get order by ID
   */
  getOrder(orderId) {
    return this.orders.get(orderId);
  }

  /**
   * Cancel an order
   */
  cancelOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }

    order.status = 'cancelled';

    if (order.side === 'buy') {
      const index = this.bids.findIndex(o => o.id === orderId);
      if (index !== -1) {
        this.bids.splice(index, 1);
      }
    } else {
      const index = this.asks.findIndex(o => o.id === orderId);
      if (index !== -1) {
        this.asks.splice(index, 1);
      }
    }

    return true;
  }

  /**
   * Get recent trade history
   */
  getTradeHistory(limit = 100) {
    return this.tradeHistory.slice(-limit);
  }

  /**
   * Get orderbook depth (top N levels)
   */
  getDepth(levels = 10) {
    return {
      bids: this.bids.slice(0, levels).map(o => ({
        price: o.price,
        quantity: o.remainingQuantity,
        orderId: o.id
      })),
      asks: this.asks.slice(0, levels).map(o => ({
        price: o.price,
        quantity: o.remainingQuantity,
        orderId: o.id
      }))
    };
  }

  /**
   * Get orderbook summary
   */
  getSummary() {
    return {
      sectorId: this.sectorId,
      bestBid: this.getBestBid(),
      bestAsk: this.getBestAsk(),
      midPrice: this.getMidPrice(),
      spread: this.getSpread(),
      lastPrice: this.lastPrice,
      bidCount: this.bids.length,
      askCount: this.asks.length,
      totalTrades: this.tradeHistory.length,
      recentTrades: this.getTradeHistory(10)
    };
  }
}

module.exports = { Orderbook, Order, Trade };

