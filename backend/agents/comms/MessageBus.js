/**
 * MessageBus - Cross-sector communication system for Manager Agents
 * 
 * Provides a lightweight JSON-backed message system for managers to communicate
 * across sectors. Messages are stored in backend/storage/comms.json.
 */

const { readDataFile, writeDataFile } = require('../../utils/persistence');

const COMMS_FILE = 'comms.json';

/**
 * Publish a message to the message bus
 * @param {Object} message - Message object
 * @param {string} message.from - Source manager ID
 * @param {string} message.to - Target manager ID (or 'broadcast' for all)
 * @param {string} message.type - Message type (e.g., 'signal', 'alert', 'coordinate')
 * @param {Object} message.payload - Message payload data
 * @returns {Promise<void>}
 */
async function publish(message) {
  if (!message.from || !message.type) {
    throw new Error('Message must have from and type fields');
  }

  const messageEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    from: message.from,
    to: message.to || 'broadcast',
    type: message.type,
    payload: message.payload || {},
    timestamp: Date.now()
  };

  let messages = [];
  try {
    messages = await readDataFile(COMMS_FILE);
    if (!Array.isArray(messages)) {
      messages = [];
    }
  } catch (error) {
    // File doesn't exist, start with empty array
    messages = [];
  }

  messages.push(messageEntry);
  await writeDataFile(COMMS_FILE, messages);
}

/**
 * Subscribe to messages for a specific manager
 * Returns all messages addressed to this manager (including broadcasts)
 * @param {string} managerId - Manager ID to subscribe for
 * @returns {Promise<Array>} Array of messages
 */
async function subscribe(managerId) {
  if (!managerId) {
    throw new Error('Manager ID is required');
  }

  let messages = [];
  try {
    messages = await readDataFile(COMMS_FILE);
    if (!Array.isArray(messages)) {
      return [];
    }
  } catch (error) {
    return [];
  }

  // Filter messages for this manager (direct or broadcast)
  return messages.filter(msg => 
    msg.to === managerId || msg.to === 'broadcast'
  );
}

/**
 * Drain messages for a specific manager (returns and clears)
 * @param {string} managerId - Manager ID
 * @returns {Promise<Array>} Array of messages that were drained
 */
async function drain(managerId) {
  if (!managerId) {
    throw new Error('Manager ID is required');
  }

  let messages = [];
  try {
    messages = await readDataFile(COMMS_FILE);
    if (!Array.isArray(messages)) {
      return [];
    }
  } catch (error) {
    return [];
  }

  // Find messages for this manager
  const managerMessages = messages.filter(msg => 
    msg.to === managerId || msg.to === 'broadcast'
  );

  // Remove drained messages from storage
  const remainingMessages = messages.filter(msg => 
    msg.to !== managerId && msg.to !== 'broadcast'
  );

  await writeDataFile(COMMS_FILE, remainingMessages);

  return managerMessages;
}

/**
 * Clear all messages (useful for cleanup)
 * @returns {Promise<void>}
 */
async function clearAll() {
  await writeDataFile(COMMS_FILE, []);
}

/**
 * Get message count for a manager
 * @param {string} managerId - Manager ID
 * @returns {Promise<number>} Number of pending messages
 */
async function getMessageCount(managerId) {
  const messages = await subscribe(managerId);
  return messages.length;
}

module.exports = {
  publish,
  subscribe,
  drain,
  clearAll,
  getMessageCount
};

