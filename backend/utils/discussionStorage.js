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

module.exports = {
  loadDiscussions,
  saveDiscussions,
  findDiscussionById,
  saveDiscussion,
  deleteDiscussion
};

