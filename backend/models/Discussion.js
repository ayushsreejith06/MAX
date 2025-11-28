class Discussion {
  constructor({
    id,
    sectorId,
    status = 'active',
    timestamp = Date.now(),
    participants = [],
    messages = []
  }) {
    this.id = id;
    this.sectorId = sectorId;
    this.status = status;
    this.timestamp = timestamp;
    this.participants = participants;
    this.messages = messages;
  }
}

module.exports = Discussion;

