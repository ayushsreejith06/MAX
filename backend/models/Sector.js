const { v4: uuidv4 } = require('uuid');

class Sector {
  constructor(name) {
    this.id = uuidv4();
    this.name = name;
    this.createdAt = new Date().toISOString();
  }

  static fromData(data) {
    const sector = new Sector(data.name);
    sector.id = data.id;
    sector.createdAt = data.createdAt;
    return sector;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt
    };
  }
}

module.exports = Sector;

