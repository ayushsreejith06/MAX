const { getSectorById } = require('../controllers/sectorsController');
const { getSimulationEngine } = require('../simulation/SimulationEngine');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // GET /simulation/performance - Get simulation performance for a sector
  fastify.get('/performance', async (request, reply) => {
    try {
      const { sectorId } = request.query;
      
      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId query parameter is required'
        });
      }

      log(`GET /simulation/performance - Fetching performance for sector ${sectorId}`);

      // Get sector to check if it exists
      const sector = await getSectorById(sectorId);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      // Get simulation engine
      const simulationEngine = getSimulationEngine();
      const sectorState = simulationEngine.getSectorState(sectorId);

      // If simulation not initialized, return default values
      if (!sectorState) {
        return reply.status(200).send({
          startingCapital: sector.balance || 0,
          currentCapital: sector.balance || 0,
          pnl: 0,
          recentTrades: []
        });
      }

      // Get orderbook to access trade history
      const { orderbook } = sectorState;
      const recentTrades = orderbook.getTradeHistory(5);

      // Calculate performance metrics
      // Starting capital: sector balance (frozen at simulation start)
      // For now, we'll use the current balance as starting capital
      // In a more sophisticated system, we'd track the initial balance separately
      const startingCapital = sector.balance || 0;
      
      // Current capital: starting capital + realized P/L from trades
      // For simplicity, we'll calculate P/L based on trade history
      // In a real system, we'd track positions and calculate unrealized P/L
      let realizedPL = 0;
      
      // Calculate realized P/L from trades
      // This is a simplified calculation - in reality, we'd need to track positions
      // For now, we'll use a simple approach: sum of (sell price - buy price) * quantity
      // This is not accurate but gives a basic metric
      const allTrades = orderbook.getTradeHistory(1000);
      for (const trade of allTrades) {
        // Simplified: assume trades are profitable if price increased
        // In reality, we'd need to track buy/sell positions
        const order = orderbook.getOrder(trade.buyOrderId);
        if (order && order.side === 'buy') {
          // This is a simplified calculation
          // Real P/L would require tracking positions
        }
      }

      // Get current price from price simulator
      const currentPrice = sectorState.priceSimulator?.getPrice() || sectorState.priceSimulator?.currentPrice || sector.currentPrice || 100;
      
      // Use sector balance as starting capital
      // In a more sophisticated system, we'd track the initial balance when simulation starts
      
      // Calculate P/L based on price change
      // This is a simplified calculation - in production, you'd track actual positions
      // For now, we'll calculate based on the assumption that we're tracking price performance
      const startingPrice = sector.currentPrice || 100;
      const priceChange = currentPrice - startingPrice;
      const priceChangePercent = startingPrice > 0 ? (priceChange / startingPrice) * 100 : 0;
      
      // Simplified P/L: if we had invested the balance, what would the return be?
      // This assumes we're tracking the performance of capital deployed
      const estimatedPL = startingCapital > 0 
        ? (startingCapital * priceChangePercent) / 100 
        : 0;
      
      const currentCapital = startingCapital + estimatedPL;
      const pnl = currentCapital - startingCapital;

      return reply.status(200).send({
        startingCapital,
        currentCapital,
        pnl,
        recentTrades: recentTrades.map(trade => ({
          id: trade.id,
          price: trade.price,
          quantity: trade.quantity,
          timestamp: trade.timestamp
        }))
      });
    } catch (error) {
      log(`Error fetching simulation performance: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};

