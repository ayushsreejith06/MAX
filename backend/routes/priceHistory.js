const { getPriceHistory, getPriceHistoryByWindow, getAllPriceHistory } = require('../utils/priceHistoryStorage');
const { getSectorById } = require('../utils/sectorStorage');

/**
 * Parse window parameter to hours
 * Supports: '1d', '1w', '1m', '3m', '6m', '1y', 'max', '6h', '12h', '24h', 'all', or number in hours
 */
function parseWindow(windowParam) {
  if (!windowParam || windowParam === 'all' || windowParam === 'max') {
    return null; // Return all history
  }

  if (typeof windowParam === 'string') {
    // Handle common time window formats: '1d', '1w', '1m', '3m', '6m', '1y'
    const timeWindowMap = {
      '1d': 24,        // 1 day = 24 hours
      '1w': 168,       // 1 week = 7 * 24 = 168 hours
      '1m': 720,       // 1 month = 30 * 24 = 720 hours
      '3m': 2160,      // 3 months = 90 * 24 = 2160 hours
      '6m': 4320,      // 6 months = 180 * 24 = 4320 hours
      '1y': 8760,      // 1 year = 365 * 24 = 8760 hours
    };

    const lowerParam = windowParam.toLowerCase();
    if (timeWindowMap[lowerParam]) {
      return { windowHours: timeWindowMap[lowerParam] };
    }

    // Handle '6h', '12h', '24h' format
    const match = windowParam.match(/^(\d+)(h|m)$/i);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit === 'h') {
        return { windowHours: value };
      } else if (unit === 'm') {
        return { windowMinutes: value };
      }
    }
  }

  // Handle numeric value (assumed to be hours)
  const hours = parseInt(windowParam, 10);
  if (!isNaN(hours) && hours > 0) {
    return { windowHours: hours };
  }

  // Default to 6 hours
  return { windowHours: 6 };
}

module.exports = async (fastify) => {
  /**
   * GET /api/price-history/:sectorId
   * Get price history for a sector
   * 
   * Query parameters:
   *   - window: Time window ('1d', '1w', '1m', '3m', '6m', '1y', 'max', '6h', '12h', '24h', 'all', or number in hours) - default: '6h'
   *   - start: Start timestamp (milliseconds) - optional
   *   - end: End timestamp (milliseconds) - optional
   *   - limit: Maximum number of ticks to return - optional
   */
  fastify.get('/:sectorId', async (request, reply) => {
    try {
      const { sectorId } = request.params;
      const { window, start, end, limit } = request.query;

      // Validate sectorId
      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required'
        });
      }

      // Verify sector exists
      const sector = await getSectorById(sectorId);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      let priceHistory = [];

      // If start/end are provided, use time range query
      if (start !== undefined || end !== undefined) {
        const options = {
          startTime: start !== undefined ? parseInt(start, 10) : undefined,
          endTime: end !== undefined ? parseInt(end, 10) : undefined,
          limit: limit !== undefined ? parseInt(limit, 10) : undefined
        };

        if (isNaN(options.startTime) && options.startTime !== undefined) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid start timestamp'
          });
        }

        if (isNaN(options.endTime) && options.endTime !== undefined) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid end timestamp'
          });
        }

        if (options.limit !== undefined && (isNaN(options.limit) || options.limit < 0)) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid limit value'
          });
        }

        priceHistory = await getPriceHistory(sectorId, options);
      } else {
        // Use window-based query
        const windowOptions = parseWindow(window);
        
        if (windowOptions === null) {
          // Return all history
          priceHistory = await getAllPriceHistory(
            sectorId,
            limit !== undefined ? parseInt(limit, 10) : undefined
          );
        } else {
          // Use window-based query
          const options = {
            ...windowOptions,
            limit: limit !== undefined ? parseInt(limit, 10) : undefined
          };

          if (options.limit !== undefined && (isNaN(options.limit) || options.limit < 0)) {
            return reply.status(400).send({
              success: false,
              error: 'Invalid limit value'
            });
          }

          priceHistory = await getPriceHistoryByWindow(sectorId, options);
        }
      }

      return reply.status(200).send({
        success: true,
        sectorId: sectorId,
        count: priceHistory.length,
        data: priceHistory
      });
    } catch (error) {
      console.error(`Error fetching price history: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};

