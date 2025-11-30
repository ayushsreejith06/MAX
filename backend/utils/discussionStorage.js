const { readDataFile, writeDataFile } = require('./persistence');

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
  const discussions = await loadDiscussions();
  const idx = discussions.findIndex(d => d.id === discussion.id);

  const data = discussion.toJSON ? discussion.toJSON() : discussion;

  if (idx >= 0) {
    discussions[idx] = data;
  } else {
    discussions.push(data);
  }

  await saveDiscussions(discussions);
}

module.exports = {
  loadDiscussions,
  saveDiscussions,
  findDiscussionById,
  saveDiscussion
};

