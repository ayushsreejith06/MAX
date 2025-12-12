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
  hasNonClosedDiscussions
};

