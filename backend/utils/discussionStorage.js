const { readDataFile, writeDataFile, atomicUpdate } = require('./persistence');
const { validateNoChecklist } = require('./checklistGuard');

const DISCUSSIONS_FILE = 'discussions.json';

async function loadDiscussions() {
  try {
    const data = await readDataFile(DISCUSSIONS_FILE);
    const discussions = Array.isArray(data) ? data : [];
    
    // CHECKLIST GUARD: Validate all discussions when loading
    discussions.forEach((discussion, index) => {
      if (discussion) {
        validateNoChecklist(discussion, `loadDiscussions (discussion[${index}])`, true);
      }
    });
    
    return discussions;
  } catch (error) {
    // If file doesn't exist, return empty array and create it
    if (error.code === 'ENOENT') {
      await writeDataFile(DISCUSSIONS_FILE, []);
      return [];
    }
    throw error;
  }
}

async function saveDiscussions(discussions) {
  await writeDataFile(DISCUSSIONS_FILE, discussions);
}

async function findDiscussionById(id) {
  const discussions = await loadDiscussions();
  const discussion = discussions.find(d => d.id === id) || null;
  
  // CHECKLIST GUARD: Validate when finding by ID
  if (discussion) {
    validateNoChecklist(discussion, `findDiscussionById (${id})`, true);
  }
  
  return discussion;
}

async function saveDiscussion(discussion) {
  const data = discussion.toJSON ? discussion.toJSON() : discussion;
  
  // CHECKLIST GUARD: Validate before saving
  validateNoChecklist(data, 'saveDiscussion', true);

  await atomicUpdate(DISCUSSIONS_FILE, (discussions) => {
    const idx = discussions.findIndex(d => d.id === discussion.id);

    if (idx >= 0) {
      discussions[idx] = data;
    } else {
      discussions.push(data);
    }

    return discussions;
  });
}

async function deleteDiscussion(discussionId) {
  await atomicUpdate(DISCUSSIONS_FILE, (discussions) => {
    return discussions.filter(d => d.id !== discussionId);
  });
}

/**
 * Check if a sector has an active discussion
 * Only ONE active discussion per sector is allowed at a time
 * New discussions are allowed ONLY after previous is CLOSED
 * DECIDED discussions still block new discussions until they are CLOSED
 * @param {string} sectorId - Sector ID
 * @returns {Promise<{hasActive: boolean, activeDiscussion: Object|null}>} 
 *   Object with hasActive flag and the active discussion if found
 */
async function hasActiveDiscussion(sectorId) {
  const discussions = await loadDiscussions();
  const sectorDiscussions = discussions.filter(d => d.sectorId === sectorId);
  
  // If no discussions exist for this sector, allow new discussion
  if (sectorDiscussions.length === 0) {
    console.log(`[hasActiveDiscussion] No discussions found for sector ${sectorId}, allowing new discussion`);
    return { hasActive: false, activeDiscussion: null };
  }
  
  // Only CLOSED status allows new discussions
  // All other statuses (IN_PROGRESS, DECIDED, CREATED, etc.) block new discussions
  // This ensures only one discussion per sector at a time
  const closedStatuses = ['CLOSED', 'closed', 'FINALIZED', 'finalized', 'ARCHIVED', 'archived'];
  
  // Find any discussion that is NOT CLOSED (blocks new discussions)
  const activeDiscussion = sectorDiscussions.find(d => {
    const rawStatus = d.status || '';
    const status = rawStatus.toUpperCase();
    const isClosed = closedStatuses.includes(status);
    
    if (!isClosed) {
      console.log(`[hasActiveDiscussion] ✗ Found non-closed discussion for sector ${sectorId}: ID=${d.id}, status="${rawStatus}"`);
    }
    return !isClosed;
  });
  
  if (activeDiscussion) {
    return { hasActive: true, activeDiscussion };
  }
  
  // No active discussions found - all are CLOSED
  const statuses = sectorDiscussions.map(d => d.status).join(', ');
  console.log(`[hasActiveDiscussion] ✓ No active discussions for sector ${sectorId}. All ${sectorDiscussions.length} discussion(s) are closed. Statuses: [${statuses}]`);
  return { hasActive: false, activeDiscussion: null };
}

/**
 * Check if a sector has any non-closed discussions
 * A discussion is considered "closed" ONLY if its status is 'CLOSED'
 * (or legacy closed status variants like FINALIZED, ARCHIVED)
 * DECIDED discussions are NOT considered closed - they still block new discussions
 * New discussions are allowed ONLY when ALL previous discussions are CLOSED
 * @param {string} sectorId - Sector ID
 * @returns {Promise<boolean>} True if there are any non-closed discussions, false otherwise
 */
async function hasNonClosedDiscussions(sectorId) {
  const discussions = await loadDiscussions();
  const sectorDiscussions = discussions.filter(d => d.sectorId === sectorId);
  
  // If no discussions exist for this sector, allow new discussion
  if (sectorDiscussions.length === 0) {
    console.log(`[hasNonClosedDiscussions] No discussions found for sector ${sectorId}, allowing new discussion`);
    return false;
  }
  
  // Only CLOSED status allows new discussions
  // DECIDED, IN_PROGRESS, CREATED, etc. all block new discussions
  const closedStatuses = ['CLOSED', 'closed', 'FINALIZED', 'finalized', 'ARCHIVED', 'archived'];
  
  // Check if any discussion is NOT in a closed state
  const hasActive = sectorDiscussions.some(d => {
    // Normalize status - handle both raw status and normalized status
    const rawStatus = d.status || '';
    let status = rawStatus.toUpperCase();
    
    // Debug: log all statuses for this sector
    console.log(`[hasNonClosedDiscussions] Checking discussion ${d.id}: rawStatus="${rawStatus}", normalized="${status}"`);
    
    // Return true if status is NOT in closedStatuses (meaning it blocks new discussions)
    const isClosed = closedStatuses.includes(status);
    if (!isClosed) {
      console.log(`[hasNonClosedDiscussions] ✗ Found non-closed discussion for sector ${sectorId}: ID=${d.id}, status="${rawStatus}" (normalized: ${status})`);
    } else {
      console.log(`[hasNonClosedDiscussions] ✓ Discussion ${d.id} is closed (status: ${status})`);
    }
    return !isClosed;
  });
  
  if (!hasActive) {
    const statuses = sectorDiscussions.map(d => d.status).join(', ');
    console.log(`[hasNonClosedDiscussions] ✓ All ${sectorDiscussions.length} discussion(s) for sector ${sectorId} are closed. Statuses: [${statuses}]`);
  }
  
  return hasActive;
}

module.exports = {
  loadDiscussions,
  saveDiscussions,
  findDiscussionById,
  saveDiscussion,
  deleteDiscussion,
  hasNonClosedDiscussions,
  hasActiveDiscussion
};

