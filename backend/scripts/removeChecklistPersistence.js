/**
 * Script to remove all checklist persistence from storage files
 * Removes checklist fields from:
 * - discussions.json (checklist, checklistDraft, finalizedChecklist, checklistItems)
 * - sectors.json (checklistDraft in discussion state)
 * - agents.json (any checklist references)
 */

const path = require('path');
const fs = require('fs').promises;
const { readDataFile, writeDataFile } = require('../utils/persistence');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');

/**
 * Remove checklist fields from a discussion object
 */
function cleanDiscussion(discussion) {
  if (!discussion || typeof discussion !== 'object') {
    return discussion;
  }

  const cleaned = { ...discussion };
  
  // Remove all checklist-related fields
  delete cleaned.checklist;
  delete cleaned.checklistDraft;
  delete cleaned.finalizedChecklist;
  delete cleaned.checklistItems;
  delete cleaned.checklistCreationAttempts;
  delete cleaned.lastChecklistItemTimestamp;
  delete cleaned.checklistMigrated;
  
  // Clean messages if they exist (remove proposal objects that might reference checklist)
  if (Array.isArray(cleaned.messages)) {
    cleaned.messages = cleaned.messages.map(msg => {
      const cleanMsg = { ...msg };
      // Keep proposal and analysis for messages, but remove any checklist-specific fields
      // Actually, keep proposal/analysis as they're part of message content, not checklist persistence
      return cleanMsg;
    });
  }
  
  return cleaned;
}

/**
 * Remove checklist fields from a sector object
 */
function cleanSector(sector) {
  if (!sector || typeof sector !== 'object') {
    return sector;
  }

  const cleaned = { ...sector };
  
  // Remove checklistDraft from discussion state
  if (cleaned.discussion && typeof cleaned.discussion === 'object') {
    cleaned.discussion = { ...cleaned.discussion };
    delete cleaned.discussion.checklistDraft;
    delete cleaned.discussion.checklist;
    delete cleaned.discussion.checklistItems;
    delete cleaned.discussion.finalizedChecklist;
  }
  
  return cleaned;
}

/**
 * Remove checklist fields from an agent object
 */
function cleanAgent(agent) {
  if (!agent || typeof agent !== 'object') {
    return agent;
  }

  const cleaned = { ...agent };
  
  // Remove any checklist-related fields from agents
  delete cleaned.checklist;
  delete cleaned.checklistItems;
  delete cleaned.checklistHistory;
  
  return cleaned;
}

/**
 * Main cleanup function
 */
async function removeChecklistPersistence() {
  console.log('[Cleanup] Starting checklist persistence removal...\n');

  try {
    // 1. Clean discussions.json
    console.log('[Cleanup] Processing discussions.json...');
    const discussions = await readDataFile('discussions.json');
    const cleanedDiscussions = Array.isArray(discussions) 
      ? discussions.map(cleanDiscussion)
      : [];
    
    await writeDataFile('discussions.json', cleanedDiscussions);
    console.log(`[Cleanup] ✓ Cleaned ${cleanedDiscussions.length} discussions\n`);

    // 2. Clean sectors.json
    console.log('[Cleanup] Processing sectors.json...');
    const sectors = await readDataFile('sectors.json');
    const cleanedSectors = Array.isArray(sectors)
      ? sectors.map(cleanSector)
      : [];
    
    await writeDataFile('sectors.json', cleanedSectors);
    console.log(`[Cleanup] ✓ Cleaned ${cleanedSectors.length} sectors\n`);

    // 3. Clean agents.json
    console.log('[Cleanup] Processing agents.json...');
    const agents = await readDataFile('agents.json');
    const cleanedAgents = Array.isArray(agents)
      ? agents.map(cleanAgent)
      : [];
    
    await writeDataFile('agents.json', cleanedAgents);
    console.log(`[Cleanup] ✓ Cleaned ${cleanedAgents.length} agents\n`);

    console.log('[Cleanup] ✓ All checklist persistence removed successfully!');
    console.log('\n[Cleanup] Storage files now contain only:');
    console.log('  - agents');
    console.log('  - sectors');
    console.log('  - discussions');
    console.log('  - messages');
    console.log('  - logs');
    console.log('\n[Cleanup] No checklist artifacts remain on disk.');

  } catch (error) {
    console.error('[Cleanup] Error during cleanup:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  removeChecklistPersistence()
    .then(() => {
      console.log('\n[Cleanup] Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n[Cleanup] Script failed:', error);
      process.exit(1);
    });
}

module.exports = { removeChecklistPersistence, cleanDiscussion, cleanSector, cleanAgent };

