/**
 * PriceTick model - Represents a single price point in time for a sector
 */
class PriceTick {
  constructor(data = {}) {
    this.id = data.id || require('uuid').v4();
    this.sectorId = data.sectorId || '';
    this.price = typeof data.price === 'number' ? data.price : 0;
    this.timestamp = data.timestamp || Date.now();
    this.volume = typeof data.volume === 'number' ? data.volume : 0;
    this.change = typeof data.change === 'number' ? data.change : 0;
    this.changePercent = typeof data.changePercent === 'number' ? data.changePercent : 0;
  }

  static fromData(data) {
    return new PriceTick(data);
  }

  toJSON() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      price: this.price,
      timestamp: this.timestamp,
      volume: this.volume,
      change: this.change,
      changePercent: this.changePercent
    };
  }
}

module.exports = PriceTick;

