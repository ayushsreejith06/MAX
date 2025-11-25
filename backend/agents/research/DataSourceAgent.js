class DataSourceAgent {
  async run(tickerOrSymbol) {
    // Mock financial data
    const basePrice = 100 + (Math.random() * 200); // Random price between 100-300
    
    // Generate mock price history (last 30 days)
    const mockPriceHistory = [];
    let currentPrice = basePrice;
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      // Add some random variation to price
      currentPrice = currentPrice * (1 + (Math.random() * 0.1 - 0.05)); // ±5% variation
      mockPriceHistory.push({
        date: date.toISOString().split('T')[0],
        price: parseFloat(currentPrice.toFixed(2)),
        volume: Math.floor(Math.random() * 1000000) + 100000
      });
    }

    // Mock metrics
    const peRatio = parseFloat((10 + Math.random() * 30).toFixed(2)); // P/E between 10-40
    const volatility = parseFloat((0.1 + Math.random() * 0.3).toFixed(3)); // Volatility between 0.1-0.4

    return {
      type: 'data',
      target: tickerOrSymbol,
      metrics: {
        peRatio: peRatio,
        volatility: volatility,
        mockPriceHistory: mockPriceHistory
      }
    };
  }
}

module.exports = DataSourceAgent;
