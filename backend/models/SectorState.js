const { v4: uuidv4 } = require('uuid');

/**
 * SectorState model for tracking discussion state within a sector
 */
class SectorState {
  constructor(data = {}) {
    // If data is null or explicitly set to null, create inactive state
    if (data === null) {
      this.id = null;
      this.round = 0;
      this.messages = [];
      this.status = 'inactive';
      this.checklistDraft = [];
      return;
    }

    // Initialize with provided data or defaults
    this.id = data.id || uuidv4();
    this.round = typeof data.round === 'number' ? data.round : 0;
    this.messages = Array.isArray(data.messages) ? data.messages : [];
    this.status = data.status || 'inactive';
    this.checklistDraft = Array.isArray(data.checklistDraft) ? data.checklistDraft : [];
  }

  /**
   * Create SectorState from data (for normalization)
   * @param {Object|null} data - Discussion state data or null
   * @returns {Object|null} Discussion state object or null if inactive
   */
  static fromData(data = null) {
    // If data is null, undefined, or explicitly inactive, return null
    if (data === null || data === undefined) {
      return null;
    }

    // If data is an object but status is inactive, return null
    if (data && typeof data === 'object' && data.status === 'inactive') {
      return null;
    }

    // Create and return the discussion state object
    const state = new SectorState(data);
    return {
      id: state.id,
      round: state.round,
      messages: state.messages,
      status: state.status,
      checklistDraft: state.checklistDraft
    };
  }

  /**
   * Create an inactive discussion state (returns null)
   * @returns {null}
   */
  static createInactive() {
    return null;
  }

  /**
   * Check if discussion state is active
   * @param {Object|null} discussion - Discussion state object or null
   * @returns {boolean}
   */
  static isActive(discussion) {
    return discussion !== null && 
           typeof discussion === 'object' && 
           discussion.status !== 'inactive';
  }

  /**
   * Convert to JSON representation
   * @returns {Object|null} Discussion state object or null if inactive
   */
  toJSON() {
    // If status is inactive, return null
    if (this.status === 'inactive') {
      return null;
    }

    return {
      id: this.id,
      round: this.round,
      messages: this.messages,
      status: this.status,
      checklistDraft: this.checklistDraft
    };
  }
}

module.exports = SectorState;

