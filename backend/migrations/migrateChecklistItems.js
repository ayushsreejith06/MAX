const { loadDiscussions, saveDiscussion } = require('../utils/discussionStorage');
const { getSectorById } = require('../utils/sectorStorage');
const { createChecklistFromLLM } = require('../discussions/workflow/createChecklistFromLLM');

/**
 * Migration: Regenerate checklist items from agent messages for discussions
 * that have messages but empty checklist items.
 * 
 * This migration runs once per discussion and marks it as migrated.
 */
async function migrateChecklistItems() {
  console.log('[Migration] Starting checklist items migration...');
  
  try {
    const discussions = await loadDiscussions();
    console.log(`[Migration] Loaded ${discussions.length} discussions`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const discussion of discussions) {
      try {
        // Skip if already migrated
        if (discussion.checklistMigrated === true) {
          skippedCount++;
          continue;
        }
        
        // Check if discussion has messages
        const messages = Array.isArray(discussion.messages) ? discussion.messages : [];
        if (messages.length === 0) {
          // No messages, mark as migrated to skip in future
          discussion.checklistMigrated = true;
          await saveDiscussion(discussion);
          skippedCount++;
          continue;
        }
        
        // Check if checklist is empty or missing
        const checklist = Array.isArray(discussion.checklist) ? discussion.checklist : [];
        if (checklist.length > 0) {
          // Checklist already has items, mark as migrated
          discussion.checklistMigrated = true;
          await saveDiscussion(discussion);
          skippedCount++;
          continue;
        }
        
        // This discussion needs migration: has messages but no checklist items
        console.log(`[Migration] Migrating discussion ${discussion.id} (${messages.length} messages)`);
        
        // Get sector data
        const sector = await getSectorById(discussion.sectorId);
        if (!sector) {
          console.warn(`[Migration] Sector ${discussion.sectorId} not found for discussion ${discussion.id}, skipping`);
          errorCount++;
          continue;
        }
        
        // Re-parse agent messages and regenerate checklist items
        const newChecklistItems = [];
        
        for (const message of messages) {
          // Only process messages from agents (skip system messages)
          if (!message.agentId || !message.content) {
            continue;
          }
          
          try {
            const checklistItem = await createChecklistFromLLM({
              messageContent: message.content,
              discussionId: discussion.id,
              agentId: message.agentId,
              sector: {
                id: sector.id,
                symbol: sector.symbol || sector.sectorSymbol,
                name: sector.name || sector.sectorName,
                allowedSymbols: sector.allowedSymbols || (sector.symbol ? [sector.symbol] : []),
              },
              sectorData: {
                currentPrice: sector.currentPrice,
                baselinePrice: sector.currentPrice,
                balance: sector.balance,
              },
              availableBalance: typeof sector.balance === 'number' ? sector.balance : 0,
              currentPrice: typeof sector.currentPrice === 'number' ? sector.currentPrice : undefined,
            });
            
            if (checklistItem) {
              newChecklistItems.push(checklistItem);
            }
          } catch (error) {
            // Log error but continue with other messages
            console.warn(`[Migration] Failed to parse message ${message.id} from discussion ${discussion.id}:`, error.message);
          }
        }
        
        // Update discussion with new checklist items and mark as migrated
        discussion.checklist = newChecklistItems;
        discussion.checklistMigrated = true;
        discussion.updatedAt = new Date().toISOString();
        
        await saveDiscussion(discussion);
        
        console.log(`[Migration] ✓ Migrated discussion ${discussion.id}: generated ${newChecklistItems.length} checklist items`);
        migratedCount++;
        
      } catch (error) {
        console.error(`[Migration] Error migrating discussion ${discussion.id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`[Migration] Migration complete:`);
    console.log(`  - Migrated: ${migratedCount} discussions`);
    console.log(`  - Skipped: ${skippedCount} discussions`);
    console.log(`  - Errors: ${errorCount} discussions`);
    
  } catch (error) {
    console.error('[Migration] Fatal error during migration:', error);
    throw error;
  }
}

module.exports = {
  migrateChecklistItems
};

