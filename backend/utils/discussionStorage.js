const fs = require('fs').promises;
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const DISCUSSIONS_FILE = path.join(STORAGE_DIR, 'discussions.json');

async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists or other error
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function loadDiscussions() {
  try {
    await ensureStorageDir();
    const data = await fs.readFile(DISCUSSIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty array
      await ensureStorageDir();
      await fs.writeFile(DISCUSSIONS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    throw error;
  }
}

async function saveDiscussions(discussions) {
  await ensureStorageDir();
  await fs.writeFile(DISCUSSIONS_FILE, JSON.stringify(discussions, null, 2), 'utf8');
}

async function findDiscussionById(id) {
  const discussions = await loadDiscussions();
  return discussions.find(d => d.id === id) || null;
}

async function saveDiscussion(discussion) {
  const discussions = await loadDiscussions();
  const discussionData = discussion.toJSON ? discussion.toJSON() : discussion;
  
  // Find if discussion already exists
  const existingIndex = discussions.findIndex(d => d.id === discussionData.id);
  
  if (existingIndex >= 0) {
    // Update existing discussion
    discussions[existingIndex] = discussionData;
  } else {
    // Add new discussion
    discussions.push(discussionData);
  }
  
  await saveDiscussions(discussions);
}

module.exports = {
  loadDiscussions,
  saveDiscussions,
  findDiscussionById,
  saveDiscussion
};

