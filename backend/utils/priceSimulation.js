module.exports.generateCandles = function generateCandles(price = 100) {
  const output = [];
  let currentPrice = typeof price === 'number' && !Number.isNaN(price) ? price : 100;

  for (let i = 0; i < 30; i += 1) {
    const open = currentPrice + (Math.random() - 0.5) * 2;
    const close = open + (Math.random() - 0.5) * 4;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;

    output.push({
      open,
      close,
      high,
      low
    });

    currentPrice = close;
  }

  return output;
};
