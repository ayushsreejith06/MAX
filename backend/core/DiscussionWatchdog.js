const { loadDiscussions, findDiscussionById, saveDiscussion } = require('../utils/discussionStorage');
const DiscussionRoom = require('../models/DiscussionRoom');
const ManagerEngine = require('./ManagerEngine');
const { transitionStatus, STATUS } = require('../utils/discussionStatusService');

/**
 * DiscussionWatchdog - Monitors discussions and forces resolution if they stall
 * 
 * Features:
 * - Monitors IN_PROGRESS discussions
 * - Detects if no new checklist items have been created after N seconds
 * - Forces resolution/closure of stuck discussions
 */
class DiscussionWatchdog {
  constructor() {
    this.checkIntervalMs = 10000; // Check every 10 seconds
    this.stallTimeoutSeconds = 30; // Force resolve if no new checklist items after 30 seconds
    this.isRunning = false;
    this.intervalId = null;
  }

  /**
   * Start the watchdog monitoring
   */
  start() {
    if (this.isRunning) {
      console.log('[DiscussionWatchdog] Watchdog is already running');
      return;
    }

    this.isRunning = true;
    console.log(`[DiscussionWatchdog] Starting watchdog (check interval: ${this.checkIntervalMs}ms, stall timeout: ${this.stallTimeoutSeconds}s)`);
    
    // Run initial check immediately
    this.checkDiscussions().catch(error => {
      console.error('[DiscussionWatchdog] Error in initial check:', error);
    });

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.checkDiscussions().catch(error => {
        console.error('[DiscussionWatchdog] Error in periodic check:', error);
      });
    }, this.checkIntervalMs);
  }

  /**
   * Stop the watchdog monitoring
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[DiscussionWatchdog] Watchdog stopped');
  }

  /**
   * Check all IN_PROGRESS discussions for stalls
   */
  async checkDiscussions() {
    try {
      const allDiscussions = await loadDiscussions();
      const inProgressDiscussions = allDiscussions.filter(d => {
        const status = (d.status || '').toUpperCase();
        return status === 'IN_PROGRESS' || status === 'IN_PROGRESS';
      });

      if (inProgressDiscussions.length === 0) {
        return; // No discussions to monitor
      }

      console.log(`[DiscussionWatchdog] Checking ${inProgressDiscussions.length} IN_PROGRESS discussions`);

      for (const discussionData of inProgressDiscussions) {
        try {
          await this.checkDiscussion(discussionData);
        } catch (error) {
          console.error(`[DiscussionWatchdog] Error checking discussion ${discussionData.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[DiscussionWatchdog] Error loading discussions:', error);
    }
  }

  /**
   * Check a single discussion for stalls
   * @param {Object} discussionData - Discussion data object
   */
  async checkDiscussion(discussionData) {
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    const discussionId = discussionRoom.id;
    const currentRound = discussionRoom.currentRound || discussionRoom.round || 1;

    // Check if discussion has checklist items
    const checklistItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
    const hasChecklistItems = checklistItems.length > 0;

    // FAILSAFE: Check for stuck checklist items and force-resolve them
    const managerEngine = new ManagerEngine();
    let hasStuckItems = false;
    const now = Date.now();
    const ITEM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const REVISE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    
    for (const item of checklistItems) {
      const status = (item.status || '').toUpperCase();
      const itemCreatedAt = item.createdAt ? new Date(item.createdAt).getTime() : now;
      const itemUpdatedAt = item.updatedAt ? new Date(item.updatedAt).getTime() : itemCreatedAt;
      const revisionRequiredAt = item.revisionRequiredAt ? new Date(item.revisionRequiredAt).getTime() : null;
      const timeSinceUpdate = now - itemUpdatedAt;
      const timeSinceCreation = now - itemCreatedAt;
      const timeSinceRevisionRequired = revisionRequiredAt ? now - revisionRequiredAt : 0;
      
      // Check for stuck PENDING items
      if ((!item.status || status === 'PENDING') && timeSinceCreation > ITEM_TIMEOUT_MS) {
        console.warn(`[DiscussionWatchdog] FAILSAFE: Found stuck PENDING item ${item.id} in discussion ${discussionId} (stuck for ${Math.round(timeSinceCreation / 1000)}s)`);
        hasStuckItems = true;
        item.status = 'REJECTED';
        item.managerReason = `Auto-rejected by watchdog: Item remained PENDING for too long (${Math.round(timeSinceCreation / 1000)}s)`;
        item.evaluatedAt = new Date().toISOString();
        item.updatedAt = item.evaluatedAt;
      }
      
      // Check for stuck REVISE_REQUIRED items
      if (status === 'REVISE_REQUIRED' && timeSinceRevisionRequired > REVISE_TIMEOUT_MS) {
        console.warn(`[DiscussionWatchdog] FAILSAFE: Found stuck REVISE_REQUIRED item ${item.id} in discussion ${discussionId} (stuck for ${Math.round(timeSinceRevisionRequired / 1000)}s)`);
        hasStuckItems = true;
        item.status = 'REJECTED';
        item.requiresRevision = false;
        item.managerReason = (item.managerReason || '') + ` Auto-rejected by watchdog: No revision received within timeout (${Math.round(timeSinceRevisionRequired / 1000)}s)`;
        item.evaluatedAt = new Date().toISOString();
        item.updatedAt = item.evaluatedAt;
      }
    }
    
    // If we found stuck items, save the discussion and try to close it
    if (hasStuckItems) {
      console.log(`[DiscussionWatchdog] Force-resolved stuck items in discussion ${discussionId}, attempting to close...`);
      discussionRoom.checklist = checklistItems;
      discussionRoom.updatedAt = new Date().toISOString();
      await saveDiscussion(discussionRoom);
      
      // Reload and check if discussion can now close
      const updatedData = await findDiscussionById(discussionId);
      if (updatedData) {
        const updatedRoom = DiscussionRoom.fromData(updatedData);
        if (managerEngine.canDiscussionClose(updatedRoom)) {
          console.log(`[DiscussionWatchdog] Discussion ${discussionId} can now close after resolving stuck items`);
          await managerEngine.closeDiscussion(discussionId);
          return;
        }
      }
    }

    // Get last checklist item timestamp
    const lastChecklistItemTimestamp = discussionRoom.lastChecklistItemTimestamp;
    const nowDate = new Date();
    
    // Calculate time since last checklist item (or discussion creation if no items)
    let secondsSinceLastItem = 0;
    if (lastChecklistItemTimestamp) {
      const lastItemTime = new Date(lastChecklistItemTimestamp);
      secondsSinceLastItem = Math.floor((nowDate - lastItemTime) / 1000);
    } else {
      // No checklist items yet - use discussion creation time
      const createdAt = new Date(discussionRoom.createdAt || discussionRoom.updatedAt);
      secondsSinceLastItem = Math.floor((nowDate - createdAt) / 1000);
    }

    // Check if discussion is stalled
    const isStalled = secondsSinceLastItem >= this.stallTimeoutSeconds;

    console.log(`[DiscussionWatchdog] Discussion ${discussionId} (Round ${currentRound}): ${checklistItems.length} items, ${secondsSinceLastItem}s since last item, stalled: ${isStalled}`);

    if (isStalled) {
      // Discussion is stalled - force resolution
      await this.forceResolveStalledDiscussion(discussionRoom, secondsSinceLastItem, hasChecklistItems);
    }
  }

  /**
   * Force resolve a stalled discussion
   * @param {DiscussionRoom} discussionRoom - Discussion room object
   * @param {number} secondsStalled - Number of seconds the discussion has been stalled
   * @param {boolean} hasChecklistItems - Whether the discussion has any checklist items
   */
  async forceResolveStalledDiscussion(discussionRoom, secondsStalled, hasChecklistItems) {
    const discussionId = discussionRoom.id;
    const currentRound = discussionRoom.currentRound || discussionRoom.round || 1;
    const checklistItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];

    console.warn(`[DiscussionWatchdog] Discussion ${discussionId} is stalled (${secondsStalled}s since last checklist item). Force resolving...`, {
      discussionId,
      round: currentRound,
      checklistItemsCount: checklistItems.length,
      hasChecklistItems,
      secondsStalled
    });

    try {
      // Try to close via ManagerEngine first (respects validation)
      const managerEngine = new ManagerEngine();
      
      // Check if discussion can be closed normally
      if (managerEngine.canDiscussionClose(discussionRoom)) {
        console.log(`[DiscussionWatchdog] Discussion ${discussionId} can be closed normally, closing via ManagerEngine`);
        discussionRoom.closeReason = 'watchdog_auto_close_all_items_resolved';
        await managerEngine.closeDiscussion(discussionId);
        return;
      }

      // Discussion cannot be closed normally - force close with watchdog reason
      console.log(`[DiscussionWatchdog] Discussion ${discussionId} cannot be closed normally, forcing closure due to stall`);

      // Set close reason
      const closeReason = hasChecklistItems
        ? `watchdog_force_close_stalled_${secondsStalled}s_no_new_items`
        : `watchdog_force_close_stalled_${secondsStalled}s_no_checklist_items`;

      discussionRoom.closeReason = closeReason;
      const { transitionStatus, STATUS } = require('../utils/discussionStatusService');
      await transitionStatus(discussionId, STATUS.CLOSED, 'Discussion stalled and closed by watchdog');
      discussionRoom.discussionClosedAt = new Date().toISOString();
      discussionRoom.updatedAt = new Date().toISOString();

      // Save final round snapshot if not already saved
      if (!Array.isArray(discussionRoom.roundHistory)) {
        discussionRoom.roundHistory = [];
      }
      
      const finalRoundSnapshot = {
        round: currentRound,
        checklist: JSON.parse(JSON.stringify(discussionRoom.checklist || [])),
        finalizedChecklist: JSON.parse(JSON.stringify(discussionRoom.finalizedChecklist || [])),
        managerDecisions: JSON.parse(JSON.stringify(discussionRoom.managerDecisions || [])),
        messages: JSON.parse(JSON.stringify(discussionRoom.messages || [])),
        timestamp: new Date().toISOString(),
        closedBy: 'watchdog',
        closeReason: closeReason
      };
      
      discussionRoom.roundHistory.push(finalRoundSnapshot);

      await saveDiscussion(discussionRoom);

      console.log(`[DiscussionWatchdog] Discussion ${discussionId} force closed by watchdog. Reason: ${closeReason}`, {
        event: 'DISCUSSION_FORCE_CLOSED_BY_WATCHDOG',
        discussionId,
        sectorId: discussionRoom.sectorId,
        reason: closeReason,
        round: currentRound,
        checklistItemsCount: checklistItems.length,
        secondsStalled
      });
    } catch (error) {
      console.error(`[DiscussionWatchdog] Error force resolving discussion ${discussionId}:`, error);
      // Don't throw - log error and continue monitoring other discussions
    }
  }
}

// Export singleton instance
const watchdog = new DiscussionWatchdog();

module.exports = watchdog;

