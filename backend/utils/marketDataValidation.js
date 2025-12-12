/**
 * Market Data Validation and Auto-Generation
 * 
 * Validates and auto-generates market data before discussions start:
 * - Validates sector.marketContext exists
 * - Validates at least one symbol has price + volatility
 * - Auto-generates missing data if needed
 */

const { updateSector } = require('./sectorStorage');

/**
 * Generate marketContext from sector data
 * @param {Object} sector - Sector object
 * @returns {Object} marketContext with volatility, trend, and volume
 */
function generateMarketContext(sector) {
  // Extract or calculate volatility (0-1 range)
  const volatility = typeof sector.volatility === 'number' 
    ? Math.max(0, Math.min(1, sector.volatility))
    : 0.02; // Default 2%

  // Calculate trend from changePercent (-1 to 1 range, normalized)
  const changePercent = typeof sector.changePercent === 'number' ? sector.changePercent : 0;
  // Normalize changePercent to -1 to 1 range (assuming max change is ±100%)
  const trend = Math.max(-1, Math.min(1, changePercent / 100));

  // Normalize volume (0-1 range, based on relative volume)
  const currentPrice = typeof sector.currentPrice === 'number' && sector.currentPrice > 0 
    ? sector.currentPrice 
    : 100;
  const volume = typeof sector.volume === 'number' ? sector.volume : 0;
  // Normalize volume: volume / (price * 1000) gives a reasonable 0-1 range
  const normalizedVolume = Math.max(0, Math.min(1, volume / (currentPrice * 1000)));

  return {
    volatility,
    trend,
    volume: normalizedVolume
  };
}

/**
 * Validate that sector has marketContext
 * @param {Object} sector - Sector object
 * @returns {boolean} True if marketContext exists and has required fields
 */
function hasValidMarketContext(sector) {
  if (!sector || typeof sector !== 'object') {
    return false;
  }

  const marketContext = sector.marketContext;
  if (!marketContext || typeof marketContext !== 'object') {
    return false;
  }

  // Check required fields exist and are numbers
  return (
    typeof marketContext.volatility === 'number' &&
    typeof marketContext.trend === 'number' &&
    typeof marketContext.volume === 'number'
  );
}

/**
 * Validate that at least one symbol has price + volatility
 * Since symbols use sector-level data, we check:
 * - If allowedSymbols exist, sector must have currentPrice and volatility
 * @param {Object} sector - Sector object
 * @returns {boolean} True if validation passes
 */
function hasValidSymbolData(sector) {
  if (!sector || typeof sector !== 'object') {
    return false;
  }

  // Get allowedSymbols (could be array or empty)
  const allowedSymbols = Array.isArray(sector.allowedSymbols) 
    ? sector.allowedSymbols 
    : [];

  // If no symbols configured, validation passes (no symbols to check)
  if (allowedSymbols.length === 0) {
    return true;
  }

  // If symbols exist, sector must have price and volatility
  const hasPrice = typeof sector.currentPrice === 'number' && sector.currentPrice > 0;
  const hasVolatility = typeof sector.volatility === 'number' && sector.volatility >= 0;

  return hasPrice && hasVolatility;
}

/**
 * Validate and auto-fill market data for a sector
 * @param {Object} sector - Sector object
 * @returns {Promise<Object>} Updated sector with validated/auto-filled data
 */
async function validateAndAutoFillMarketData(sector) {
  if (!sector || !sector.id) {
    throw new Error('Invalid sector: sector and sector.id are required');
  }

  let needsUpdate = false;
  const updates = {};

  // Check and generate marketContext
  if (!hasValidMarketContext(sector)) {
    const marketContext = generateMarketContext(sector);
    updates.marketContext = marketContext;
    needsUpdate = true;
    console.log(`[MarketDataValidation] Auto-generated marketContext for sector ${sector.id}:`, marketContext);
  }

  // Check and ensure price/volatility exist if symbols are configured
  if (!hasValidSymbolData(sector)) {
    const allowedSymbols = Array.isArray(sector.allowedSymbols) ? sector.allowedSymbols : [];
    
    // Auto-generate price if missing
    if (typeof sector.currentPrice !== 'number' || sector.currentPrice <= 0) {
      updates.currentPrice = 100; // Default price
      needsUpdate = true;
      console.log(`[MarketDataValidation] Auto-generated currentPrice for sector ${sector.id}: 100`);
    }

    // Auto-generate volatility if missing
    if (typeof sector.volatility !== 'number' || sector.volatility < 0) {
      updates.volatility = 0.02; // Default 2% volatility
      needsUpdate = true;
      console.log(`[MarketDataValidation] Auto-generated volatility for sector ${sector.id}: 0.02`);
    }

    // If we updated price/volatility, regenerate marketContext
    if (needsUpdate && !updates.marketContext) {
      const updatedSector = { ...sector, ...updates };
      updates.marketContext = generateMarketContext(updatedSector);
      console.log(`[MarketDataValidation] Regenerated marketContext after price/volatility update`);
    }
  }

  // Apply updates if needed
  if (needsUpdate) {
    console.log(`[MarketDataValidation] AUTO-FILLED MARKET DATA for sector ${sector.id}`);
    const updatedSector = await updateSector(sector.id, updates);
    return updatedSector || { ...sector, ...updates };
  }

  return sector;
}

/**
 * Validate market data before starting a discussion
 * Throws error if validation fails (after attempting auto-fill)
 * @param {Object} sector - Sector object
 * @returns {Promise<Object>} Validated sector (may be updated with auto-filled data)
 */
async function validateMarketDataForDiscussion(sector) {
  if (!sector || !sector.id) {
    throw new Error('Invalid sector: sector and sector.id are required');
  }

  // First, try to auto-fill any missing data
  const validatedSector = await validateAndAutoFillMarketData(sector);

  // Re-validate after auto-fill
  if (!hasValidMarketContext(validatedSector)) {
    throw new Error(`Cannot start discussion: sector ${sector.id} is missing marketContext (volatility, trend, volume)`);
  }

  if (!hasValidSymbolData(validatedSector)) {
    const allowedSymbols = Array.isArray(validatedSector.allowedSymbols) 
      ? validatedSector.allowedSymbols 
      : [];
    if (allowedSymbols.length > 0) {
      throw new Error(`Cannot start discussion: sector ${sector.id} has symbols but is missing price or volatility data`);
    }
  }

  return validatedSector;
}

module.exports = {
  validateMarketDataForDiscussion,
  validateAndAutoFillMarketData,
  hasValidMarketContext,
  hasValidSymbolData,
  generateMarketContext
};

