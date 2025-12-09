/**
 * Agent Creation Limits Configuration
 * 
 * These constants define the maximum number of agents that can be created
 * to prevent system overload and ensure optimal performance.
 */

// Maximum number of agents allowed per sector
const MAX_AGENTS_PER_SECTOR = 12;

// Maximum total number of agents allowed across all sectors
const MAX_TOTAL_AGENTS = 100;

module.exports = {
  MAX_AGENTS_PER_SECTOR,
  MAX_TOTAL_AGENTS
};

