/**
 * Price model utility shared by simulation and execution flows.
 * Applies the required price update formula:
 * newPrice = oldPrice * (1 + (managerImpact * 0.001) + noise + trendFactor)
 *
 * - noise is uniform random between [-0.003, 0.003]
 * - managerImpact: +1 for BUY, -1 for SELL, 0 for HOLD/other
 * - trendFactor: provided by sector (trendCurveValue/trendCurve), default 0
 */

function mapActionToImpact(action) {
  if (!action || typeof action !== 'string') {
    return 0;
  }
  const normalized = action.trim().toUpperCase();
  if (normalized === 'BUY') return 1;
  if (normalized === 'SELL') return -1;
  return 0; // HOLD or unknown defaults to neutral
}

function calculateNewPrice(oldPrice, options = {}) {
  const {
    managerImpact: rawImpact,
    action,
    trendFactor = 0,
    noiseRange = 0.003
  } = options;

  const basePrice = typeof oldPrice === 'number' && isFinite(oldPrice) && oldPrice > 0
    ? oldPrice
    : 0.01;

  const managerImpact = typeof rawImpact === 'number'
    ? rawImpact
    : mapActionToImpact(action);

  const noise = (Math.random() * 2 - 1) * noiseRange;
  const adjustment = (managerImpact * 0.001) + noise + (typeof trendFactor === 'number' ? trendFactor : 0);
  const nextPrice = basePrice * (1 + adjustment);

  // Clamp to minimum tick size to avoid zero/negative prices
  return Math.max(0.01, Number(nextPrice.toFixed(6)));
}

module.exports = {
  calculateNewPrice,
  mapActionToImpact
};

