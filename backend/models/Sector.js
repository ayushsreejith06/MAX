const { v4: uuidv4 } = require('uuid');

class Sector {
  constructor({
    id = uuidv4(),
    name = '',
    description = '',
    agents = [],
    performance = {}
  } = {}) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.agents = agents;
    this.performance = performance;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      agents: this.agents,
      performance: this.performance
    };
  }
}

module.exports = Sector;
