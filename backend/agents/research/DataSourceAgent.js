class DataSourceAgent {
  /**
   * Fetch data sources (price history, metrics, etc.) for a given ticker or symbol
   * @param {string} tickerOrSymbol - Ticker symbol or identifier
   * @returns {Promise<Object>} Data source metrics and history
   */
  async fetchDataSources(tickerOrSymbol) {
    // Mock financial data
    // In production, this would call external APIs (e.g., Alpha Vantage, Yahoo Finance, Polygon.io)
    const basePrice = 100 + (Math.random() * 200); // Random price between 100-300
    
    // Generate mock price history (last 30 days)
    const priceHistory = [];
    let currentPrice = basePrice;
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      // Add some random variation to price
      currentPrice = currentPrice * (1 + (Math.random() * 0.1 - 0.05)); // ±5% variation
      priceHistory.push({
        date: date.toISOString().split('T')[0],
        price: parseFloat(currentPrice.toFixed(2)),
        volume: Math.floor(Math.random() * 1000000) + 100000
      });
    }

    // Calculate volatility from price history
    const prices = priceHistory.map(p => p.price);
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
    const calculatedVolatility = parseFloat(Math.sqrt(variance / avgPrice).toFixed(3));

    // Mock metrics
    const peRatio = parseFloat((10 + Math.random() * 30).toFixed(2)); // P/E between 10-40
    const volatility = parseFloat((0.1 + Math.random() * 0.3).toFixed(3)); // Volatility between 0.1-0.4
    const currentPriceValue = priceHistory[priceHistory.length - 1].price;
    const priceChange = currentPriceValue - priceHistory[0].price;
    const priceChangePercent = parseFloat(((priceChange / priceHistory[0].price) * 100).toFixed(2));

    return {
      ticker: tickerOrSymbol,
      currentPrice: currentPriceValue,
      priceHistory: priceHistory,
      metrics: {
        peRatio: peRatio,
        volatility: volatility,
        calculatedVolatility: calculatedVolatility,
        priceChange: parseFloat(priceChange.toFixed(2)),
        priceChangePercent: priceChangePercent,
        dataPoints: priceHistory.length
      }
    };
  }

  async run(tickerOrSymbol) {
    const data = await this.fetchDataSources(tickerOrSymbol);
    return {
      type: 'data',
      target: tickerOrSymbol,
      metrics: data.metrics,
      currentPrice: data.currentPrice,
      priceHistory: data.priceHistory
    };
  }
}

module.exports = DataSourceAgent;
