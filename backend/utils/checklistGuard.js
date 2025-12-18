/**
 * Checklist Guard Utilities
 * 
 * Defensive assertions to prevent checklist system from being reintroduced.
 * These guards are temporary but mandatory.
 * 
 * Checklist system intentionally removed — do not reintroduce without v2 design
 */

/**
 * Recursively checks if an object contains any field with "checklist" in its name
 * @param {any} obj - Object to check
 * @param {string} path - Current path in object (for error messages)
 * @returns {boolean} True if checklist field found
 */
function hasChecklistField(obj, path = '') {
  if (obj === null || obj === undefined) {
    return false;
  }

  // Check if obj is an object or array
  if (typeof obj !== 'object') {
    return false;
  }

  // Check all keys in the object
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if key contains "checklist" (case-insensitive)
      if (typeof key === 'string' && key.toLowerCase().includes('checklist')) {
        return true;
      }

      // Recursively check nested objects and arrays
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (hasChecklistField(obj[key], currentPath)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Throws an error if any object contains "checklist" fields
 * @param {any} obj - Object to validate
 * @param {string} context - Context for error message (e.g., "Discussion creation")
 * @throws {Error} If checklist fields are found
 */
function assertNoChecklist(obj, context = 'Object validation') {
  if (hasChecklistField(obj)) {
    const error = new Error(
      `CHECKLIST GUARD VIOLATION: ${context} - Object contains "checklist" field. ` +
      `Checklist system intentionally removed — do not reintroduce without v2 design.`
    );
    error.name = 'ChecklistGuardViolation';
    throw error;
  }
}

/**
 * Logs a critical error if a discussion includes checklist fields
 * @param {any} discussion - Discussion object to check
 * @param {string} context - Context for error message (e.g., "Loading discussion")
 */
function logChecklistInDiscussion(discussion, context = 'Discussion validation') {
  if (hasChecklistField(discussion)) {
    const errorMessage = `CRITICAL ERROR: ${context} - Discussion includes checklist fields. ` +
      `Discussion ID: ${discussion?.id || 'unknown'}. ` +
      `Checklist system intentionally removed — do not reintroduce without v2 design.`;
    
    console.error(`[CHECKLIST GUARD] ${errorMessage}`);
    console.error(`[CHECKLIST GUARD] Discussion data:`, JSON.stringify(discussion, null, 2));
    
    // Also log to stderr for critical errors
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[CHECKLIST GUARD CRITICAL] ${errorMessage}\n`);
    }
  }
}

/**
 * Validates an object and throws if checklist fields are found
 * Also logs critical error for discussions
 * @param {any} obj - Object to validate
 * @param {string} context - Context for error message
 * @param {boolean} isDiscussion - Whether this is a discussion object (triggers critical log)
 */
function validateNoChecklist(obj, context = 'Object validation', isDiscussion = false) {
  if (isDiscussion) {
    logChecklistInDiscussion(obj, context);
  }
  assertNoChecklist(obj, context);
}

module.exports = {
  hasChecklistField,
  assertNoChecklist,
  logChecklistInDiscussion,
  validateNoChecklist
};

