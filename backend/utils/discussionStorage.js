const { readDataFile, writeDataFile, atomicUpdate } = require('./persistence');

const DISCUSSIONS_FILE = 'discussions.json';

async function loadDiscussions() {
  try {
    const data = await readDataFile(DISCUSSIONS_FILE);
    return Array.isArray(data) ? data : [];
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
  return discussions.find(d => d.id === id) || null;
}

async function saveDiscussion(discussion) {
  const data = discussion.toJSON ? discussion.toJSON() : discussion;

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
 * Check if a sector has an active discussion (IN_PROGRESS or OPEN)
 * Only ONE active discussion per sector is allowed at a time
 * New discussions are allowed ONLY after previous is CLOSED or DECIDED
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
  
  // Active statuses that block new discussions
  // Both OPEN and IN_PROGRESS prevent new discussions
  // Also treat DECIDED discussions without checklist items as invalid/active
  const activeStatuses = ['OPEN', 'IN_PROGRESS', 'open', 'in_progress', 'ACTIVE', 'active', 'CREATED', 'created'];
  
  // Find any discussion with active status OR DECIDED without checklist items
  const activeDiscussion = sectorDiscussions.find(d => {
    const rawStatus = d.status || '';
    const status = rawStatus.toUpperCase();
    const isActiveStatus = activeStatuses.includes(status);
    
    // Also check if DECIDED discussion has no checklist items (invalid state)
    const isDecidedWithoutChecklist = status === 'DECIDED' && 
      (!Array.isArray(d.checklist) || d.checklist.length === 0) &&
      (!Array.isArray(d.checklistDraft) || d.checklistDraft.length === 0);
    
    const isActive = isActiveStatus || isDecidedWithoutChecklist;
    
    if (isActive) {
      if (isDecidedWithoutChecklist) {
        console.log(`[hasActiveDiscussion] ✗ Found invalid DECIDED discussion without checklist items for sector ${sectorId}: ID=${d.id}, status="${rawStatus}"`);
      } else {
        console.log(`[hasActiveDiscussion] ✗ Found active discussion for sector ${sectorId}: ID=${d.id}, status="${rawStatus}"`);
      }
    }
    return isActive;
  });
  
  if (activeDiscussion) {
    return { hasActive: true, activeDiscussion };
  }
  
  // No active discussions found
  const statuses = sectorDiscussions.map(d => d.status).join(', ');
  console.log(`[hasActiveDiscussion] ✓ No active discussions for sector ${sectorId}. All ${sectorDiscussions.length} discussion(s) are closed. Statuses: [${statuses}]`);
  return { hasActive: false, activeDiscussion: null };
}

/**
 * Check if a sector has any non-closed discussions
 * A discussion is considered "closed" if its status is 'DECIDED' or 'CLOSED'
 * (or any legacy closed status variants)
 * New discussions are allowed when ALL previous discussions are DECIDED or CLOSED
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
  
  // Statuses that indicate a discussion is closed/finalized (uppercase for comparison)
  // Both DECIDED and CLOSED allow new discussions to be created
  const closedStatuses = ['DECIDED', 'CLOSED', 'FINALIZED', 'ARCHIVED', 'ACCEPTED', 'COMPLETED'];
  
  // Check if any discussion is NOT in a closed state
  // OPEN and IN_PROGRESS block new discussions
  const hasActive = sectorDiscussions.some(d => {
    // Normalize status - handle both raw status and normalized status
    // First get the raw status from storage
    const rawStatus = d.status || '';
    let status = rawStatus.toUpperCase();
    
    // Debug: log all statuses for this sector
    console.log(`[hasNonClosedDiscussions] Checking discussion ${d.id}: rawStatus="${rawStatus}", normalized="${status}"`);
    
    // Return true if status is NOT in closedStatuses (meaning it's active/open/in_progress)
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

