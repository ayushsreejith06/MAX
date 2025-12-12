const SectorEngine = require('../../SectorEngine');
const ManagerEngine = require('../../ManagerEngine');
const DiscussionEngine = require('../../DiscussionEngine');
const ExecutionEngine = require('../../ExecutionEngine');
const { getSectorById, updateSector } = require('../../../utils/sectorStorage');
const { getAllSectors } = require('../../../utils/sectorStorage');
const { loadAgents } = require('../../../utils/agentStorage');
const { loadDiscussions, findDiscussionById, saveDiscussion } = require('../../../utils/discussionStorage');
const DiscussionRoom = require('../../../models/DiscussionRoom');
const { getSystemMode } = require('../../SystemMode');
const { executeSimulationTick } = require('../../../controllers/simulationController');
const { extractConfidence } = require('../../../utils/confidenceUtils');

// Maximum number of rounds for a discussion
const MAX_ROUNDS = 5;

// Tick interval in milliseconds (2 seconds)
const TICK_INTERVAL_MS = 2000;

/**
 * SystemOrchestrator - Coordinates system-level operations across sectors
 */
class SystemOrchestrator {
  constructor() {
    this.sectorEngine = new SectorEngine();
    this.managerEngine = new ManagerEngine();
    this.discussionEngine = new DiscussionEngine();
    this.executionEngine = new ExecutionEngine();
    this.tickCounter = 0;
    this.tickInterval = null;
    this.isTicking = false; // Prevent concurrent ticks
    // Discussion lock to prevent spam: sectorId -> boolean
    this.discussionLock = new Map();
  }

  /**
   * Tick a sector: update agent confidence, manage discussions, and run rounds
   * @param {string} sectorId - Sector ID to tick
   * @returns {Promise<{sector: Object, discussionReady: boolean}>} Updated sector and discussion ready flag
   */
  async tickSector(sectorId) {
    if (!sectorId) {
      throw new Error('sectorId is required');
    }

    try {
      // 1. Load sector + agents
      const sector = await getSectorById(sectorId);
      
      if (!sector) {
        throw new Error(`Sector ${sectorId} not found`);
      }

      // Enrich sector with agents from agents.json (source of truth)
      try {
        const allAgents = await loadAgents();
        const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
        
        // Merge agents from agents.json with sector's stored agents array
        // Use a Map to deduplicate by agent ID, preferring agents.json data
        const agentMap = new Map();
        
        // First, add agents from sector.agents (stored in sector)
        if (Array.isArray(sector.agents)) {
          sector.agents.forEach(agent => {
            if (agent && agent.id) {
              agentMap.set(agent.id, agent);
            }
          });
        }
        
        // Then, add/update with agents from agents.json (source of truth)
        sectorAgents
          .filter(agent => agent && agent.id) // Filter out null/undefined agents
          .forEach(agent => {
            agentMap.set(agent.id, agent);
          });
        
        // Update sector with merged agents array
        sector.agents = Array.from(agentMap.values());
      } catch (agentError) {
        console.warn(`[SystemOrchestrator] Failed to enrich sector with agents:`, agentError.message);
        // Continue with sector.agents as-is if enrichment fails
      }

      // Increment tick counter
      this.tickCounter++;
      const tickNumber = this.tickCounter;

      const systemMode = getSystemMode();
      const isSimulationMode = systemMode?.isSimulationMode ? systemMode.isSimulationMode() : false;

      // DEBUG: Start tick log
      console.log(`\n=== TICK # ${tickNumber} ===`);

      // Count agents and non-manager agents for limit-aware checks
      const agents = Array.isArray(sector.agents) ? sector.agents.filter(a => a && a.id) : [];
      const nonManagerAgents = agents.filter(agent => {
        const role = (agent.role || '').toLowerCase();
        return role !== 'manager' && !role.includes('manager');
      });
      const agentCount = agents.length;
      const nonManagerCount = nonManagerAgents.length;

      // Limit-aware checks: Skip operations when insufficient agents
      let updatedSector = sector;
      let discussionReady = false;
      let hasActiveDiscussion = false;

      // If sector has 0 agents → skip confidence updates and discussion readiness checks
      if (agentCount === 0) {
        console.log(`[Limit-aware tick] Sector ${sectorId} has 0 agents, skipping confidence updates and discussion evaluation.`);
        updatedSector.readyForDiscussion = false;
        // Continue to save sector state and return early
      } else {
        // STEP 2: Perform confidence updates with correct flow order:
        // 1. Agent LLM reasoning (confidence extracted from llmAction.confidence if available)
        // 2. Confidence extracted (via extractConfidence - prefers LLM, falls back to stored)
        // 3. Confidence updated (monotonic rule via stabilizeConfidence - prevents decay below 65)
        // 4. Discussion eligibility check (happens below, AFTER confidence update)
        updatedSector = await this.sectorEngine.performConfidenceUpdates(sector);

        // STEP 3: Check if sectorEngine.readyForDiscussion === true
        // IMPORTANT: Discussion eligibility check happens AFTER confidence update
        // This ensures we read agent.confidence AFTER the monotonic rule has been applied
        // If sector has only 1 agent (manager only) → skip discussion readiness
        if (agentCount === 1 && nonManagerCount === 0) {
          console.log(`[Limit-aware tick] Sector ${sectorId} has only 1 agent (manager), skipping discussion evaluation.`);
          discussionReady = false;
          updatedSector.readyForDiscussion = false;
        } else if (nonManagerCount < 1) {
          // Safeguard: Need at least 1 non-manager agent for discussion
          console.log(`[Limit-aware tick] Sector ${sectorId} has insufficient non-manager agents (${nonManagerCount}), skipping discussion evaluation.`);
          discussionReady = false;
          updatedSector.readyForDiscussion = false;
        } else if (!isSimulationMode) {
          console.log(`[SystemOrchestrator] Discussion creation paused: system not in simulation mode.`);
          discussionReady = false;
          updatedSector.readyForDiscussion = false;
        } else {
          // STRICT discussion trigger logic:
          // 1. Check for active/in-progress discussions (block if any exist)
          // 2. Check discussion lock (prevent spam)
          // 3. ALL active worker agents (non-managers) must have confidence >= 65
          // 4. Sector balance must be > 0
          
          // Step 1: Check if there are any non-closed discussions for this sector
          // A new discussion is allowed only when ALL previous discussions are DECIDED or CLOSED
          const { hasNonClosedDiscussions } = require('../../../utils/discussionStorage');
          const hasActive = await hasNonClosedDiscussions(sectorId);

          if (hasActive) {
            console.log(`[DISCUSSION BLOCKED] ✗ Non-closed discussion exists for sector ${sectorId} - cannot create new discussion`);
            discussionReady = false;
            updatedSector.readyForDiscussion = false;
          } else {
            console.log(`[DISCUSSION CHECK] ✓ No non-closed discussions for sector ${sectorId} - new discussion allowed`);
          }
          
          if (!hasActive && this.discussionLock.get(sectorId)) {
            // Step 2: Check discussion lock
            console.log(`[DISCUSSION BLOCKED] Discussion lock is active for sector ${sectorId}`);
            discussionReady = false;
            updatedSector.readyForDiscussion = false;
          } else {
            // Step 3: Get all agents for the sector (manager + generals)
            // GUARD: Reload agents from storage to prevent stale confidence values
            // This ensures we read confidence AFTER it was updated in performConfidenceUpdates
            const allAgents = await loadAgents();
            const sectorAgents = allAgents.filter(agent => 
              agent && agent.id && agent.sectorId === sectorId
            );
            const workerAgents = sectorAgents.filter(agent => {
              if (!agent) return false;
              const role = (agent.role || '').toLowerCase();
              const isManager = role === 'manager' || role.includes('manager');
              const isActive = agent.status !== 'inactive';
              return !isManager && isActive;
            });

            if (workerAgents.length === 0) {
              console.log(`[DISCUSSION BLOCKED] No active worker agents found in sector ${sectorId}`);
              discussionReady = false;
              updatedSector.readyForDiscussion = false;
            } else {
              // STEP 4: Discussion eligibility check - reads confidence AFTER update
              // extractConfidence reads from agent.llmAction.confidence (if LLM reasoning happened)
              // or agent.confidence (which was updated with monotonic rule in performConfidenceUpdates)
              const allAboveThreshold = workerAgents.every(agent => extractConfidence(agent) >= 65);

              if (!allAboveThreshold) {
                const agentConfidences = workerAgents.map(agent => {
                  const confidence = extractConfidence(agent);
                  const meetsThreshold = confidence >= 65 ? '✓' : '✗';
                  return `${agent.name || agent.id}: ${confidence.toFixed(2)} ${meetsThreshold}`;
                }).join(', ');

                console.log(`[DISCUSSION BLOCKED] Not all active workers meet threshold (>= 65)`);
                console.log(`[DISCUSSION CHECK]`, {
                  sectorId,
                  agentConfidences: workerAgents.map(a => `${a.name || a.id}: ${a.confidence || 0}`),
                  allAboveThreshold: false
                });

                discussionReady = false;
                updatedSector.readyForDiscussion = false;
              } else {
                const sectorBalance = typeof updatedSector.balance === 'number' ? updatedSector.balance : 0;
                if (sectorBalance <= 0) {
                  console.log(`[DISCUSSION BLOCKED] Sector balance (${sectorBalance}) must be greater than 0`);
                  discussionReady = false;
                  updatedSector.readyForDiscussion = false;
                } else {
                  console.log(`[DISCUSSION CHECK]`, {
                    sectorId,
                    agentConfidences: workerAgents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`),
                    allAboveThreshold: true,
                    managerConfidence: null
                  });
                  console.log(`[SystemOrchestrator] ✓ Discussion READY for sector ${sectorId} - All active workers meet threshold and balance > 0`);

                  discussionReady = true;
                  updatedSector.readyForDiscussion = true;
                }
              }
            }
          }
        }
      }

      // IF discussionReady === true: managerEngine.startDiscussion()
      if (discussionReady) {
        console.log(`[SystemOrchestrator] Sector ${sectorId} ready for discussion, starting...`);
        const lockStatus = this.discussionLock.get(sectorId);
        console.log(`[SystemOrchestrator] Discussion lock status before creation: ${lockStatus || 'unlocked'}`);
        
        // Only proceed if lock is not active (or unlock if it's been stuck)
        if (lockStatus === true) {
          console.log(`[SystemOrchestrator] WARNING: Discussion lock is active for sector ${sectorId}, unlocking to allow creation...`);
          this.discussionLock.set(sectorId, false);
        }
        
        // Set discussion lock to prevent spam
        this.discussionLock.set(sectorId, true);
        
        try {
          // Start discussion using managerEngine.startDiscussion()
          console.log(`[SystemOrchestrator] Calling managerEngine.startDiscussion(${sectorId})...`);
          const startResult = await this.managerEngine.startDiscussion(sectorId);
          console.log(`[SystemOrchestrator] startResult:`, { 
            created: startResult.created, 
            hasDiscussion: !!startResult.discussion,
            discussionId: startResult.discussion?.id 
          });
          
          if (startResult.created && startResult.discussion) {
            const newDiscussion = startResult.discussion;
            console.log(`[SystemOrchestrator] ✓ Started discussion: ID = ${newDiscussion.id}`);
            console.log(`[SystemOrchestrator] AUTO_DISCUSSION_OPEN`, {
              event: 'AUTO_DISCUSSION_OPEN',
              sectorId: sectorId,
              discussionId: newDiscussion.id,
              reason: 'all_workers_confident_and_balance_positive'
            });
            
            // Unlock after discussion is created
            this.discussionLock.set(sectorId, false);
            
            // Reload sector to get updated discussion reference
            updatedSector = await getSectorById(sectorId);
            const allAgents = await loadAgents();
            const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
            updatedSector.agents = sectorAgents;
            
            // Step 2: Immediately start all rounds (runs automatically)
            console.log(`[SystemOrchestrator] Starting rounds for discussion ${newDiscussion.id}`);
            await this.discussionEngine.startRounds(newDiscussion.id, MAX_ROUNDS);
            
            // Step 3: Finalize checklist after rounds complete
            console.log(`[SystemOrchestrator] Finalizing checklist for discussion ${newDiscussion.id}`);
            await this.discussionEngine.finalizeChecklist(newDiscussion.id);
            
            // Step 4: Handle checklist (approve and mark as finalized)
            console.log(`[SystemOrchestrator] Handling checklist for discussion ${newDiscussion.id}`);
            await this.managerEngine.handleChecklist(newDiscussion);
            
            // Reload sector after full cycle
            updatedSector = await getSectorById(sectorId);
            const reloadedAgents = await loadAgents();
            const reloadedSectorAgents = reloadedAgents.filter(agent => agent.sectorId === sectorId);
            updatedSector.agents = reloadedSectorAgents;
            
            // Update hasActiveDiscussion flag - discussion is now finalized
            hasActiveDiscussion = false;
          } else if (startResult.discussion) {
            // Discussion already exists (shouldn't happen due to check, but handle gracefully)
            console.log(`[SystemOrchestrator] Discussion already exists: ID = ${startResult.discussion.id}`);
            // Unlock if discussion already exists
            this.discussionLock.set(sectorId, false);
            hasActiveDiscussion = true;
          } else {
            // Failed to create discussion - unlock
            console.log(`[SystemOrchestrator] ⚠ Failed to create discussion - startResult.created=${startResult.created}, hasDiscussion=${!!startResult.discussion}`);
            this.discussionLock.set(sectorId, false);
          }
        } catch (error) {
          // Unlock on error
          this.discussionLock.set(sectorId, false);
          console.error(`[SystemOrchestrator] Error starting discussion for sector ${sectorId}:`, error);
        }
      }

      // 4. Check for decided discussions with manager-approved checklists and execute them
      // IF a manager-approved checklist exists AND discussion.status === "decided": ExecutionEngine.executeChecklist()
      const finalizedDiscussion = await this._getFinalizedDiscussion(sectorId);
      if (finalizedDiscussion) {
        const discussionRoom = DiscussionRoom.fromData(finalizedDiscussion);
        
        // Check if there are manager-approved checklist items
        const approvedChecklist = this._getApprovedChecklist(discussionRoom);
        
        if (approvedChecklist && approvedChecklist.length > 0) {
          console.log(`[SystemOrchestrator] Found decided discussion ${discussionRoom.id} with ${approvedChecklist.length} approved checklist items, executing...`);
          
          try {
            // Execute the checklist
            const executionResult = await this.executionEngine.executeChecklist(approvedChecklist, sectorId, discussionRoom.id);
            console.log(`[SystemOrchestrator] Executed checklist: ${executionResult.success ? 'success' : 'failed'}`);
            
            // After execution: mark as decided but keep checklist items for historical reference
            // Don't clear checklist or finalizedChecklist - users should see what was proposed and finalized
            discussionRoom.status = 'decided';
            discussionRoom.updatedAt = new Date().toISOString();
            await saveDiscussion(discussionRoom);
            
            // Allow new discussions later (by clearing the discussion from active state)
            // The discussion is now executed, so it won't block new discussions
            
            // Update sector performance (ExecutionEngine already updates sector, but we track execution stats)
            await this._updateSectorPerformance(sectorId, {
              success: executionResult.success,
              results: approvedChecklist.map(item => ({
                itemId: item.id,
                success: executionResult.success,
                action: item.action
              }))
            });
            
            // Reload sector after execution
            updatedSector = await getSectorById(sectorId);
            const allAgents = await loadAgents();
            const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
            updatedSector.agents = sectorAgents;
            
            // Mark discussion as ended to start cooldown period
            this.sectorEngine.markDiscussionEnded(sectorId);
          } catch (execError) {
            console.error(`[SystemOrchestrator] Error executing checklist for discussion ${discussionRoom.id}:`, execError);
            // Continue even if execution fails
          }
        } else {
          // Discussion is finalized but has no approved checklist items
          // Mark as ended to allow new discussions
          this.sectorEngine.markDiscussionEnded(sectorId);
        }
      }

      // 5. Check for discussions that are in progress/active but not yet finalized
      // (This handles edge cases where a discussion was created but the cycle didn't complete)
      const activeDiscussion = await this._getActiveDiscussion(sectorId);
      if (activeDiscussion) {
        const discussionRoom = DiscussionRoom.fromData(activeDiscussion);
        
        // Handle legacy 'active' status discussions - transition them to 'in_progress'
        if (discussionRoom.status === 'active') {
          console.log(`[SystemOrchestrator] Found legacy active discussion ${discussionRoom.id}, transitioning to in_progress...`);
          discussionRoom.status = 'in_progress';
          discussionRoom.updatedAt = new Date().toISOString();
          await saveDiscussion(discussionRoom);
          
          // If discussion has checklistDraft, finalize and handle it
          if (Array.isArray(discussionRoom.checklistDraft) && discussionRoom.checklistDraft.length > 0) {
            console.log(`[SystemOrchestrator] Active discussion has checklistDraft, finalizing and handling...`);
            // First finalize the checklist
            await this.discussionEngine.finalizeChecklist(discussionRoom.id);
            // Then handle it
            const updatedDiscussion = await findDiscussionById(discussionRoom.id);
            if (updatedDiscussion) {
              await this.managerEngine.handleChecklist(DiscussionRoom.fromData(updatedDiscussion));
            }
          } else if (Array.isArray(discussionRoom.checklist) && discussionRoom.checklist.length > 0) {
            // Discussion has checklist, handle it directly
            console.log(`[SystemOrchestrator] Active discussion has checklist, handling...`);
            const handledDiscussion = await this.managerEngine.handleChecklist(discussionRoom);
            // Check if discussion can be closed after handling
            if (handledDiscussion && this.managerEngine.canDiscussionClose(handledDiscussion)) {
              console.log(`[SystemOrchestrator] Active discussion ${discussionRoom.id} can be closed, auto-closing...`);
              await this.managerEngine.closeDiscussion(discussionRoom.id);
            }
          } else {
            // Active discussion with no checklist - check if it's stale (older than 1 minute)
            const createdAt = new Date(discussionRoom.createdAt).getTime();
            const now = Date.now();
            const ageMs = now - createdAt;
            
            if (ageMs > 60000) { // Older than 1 minute
              console.log(`[SystemOrchestrator] Active discussion ${discussionRoom.id} is stale (${Math.round(ageMs / 1000)}s old) with no checklist, marking as decided...`);
              // Discussions can only be 'in_progress' or 'decided'
              discussionRoom.status = 'decided';
              discussionRoom.updatedAt = new Date().toISOString();
              await saveDiscussion(discussionRoom);
              // Mark discussion as ended to allow new discussions
              this.sectorEngine.markDiscussionEnded(sectorId);
            } else {
              // Try to start rounds if discussion has no messages
              if (!Array.isArray(discussionRoom.messages) || discussionRoom.messages.length === 0) {
                console.log(`[SystemOrchestrator] Active discussion has no messages, starting rounds...`);
                await this.discussionEngine.startRounds(discussionRoom.id, MAX_ROUNDS);
                await this.discussionEngine.finalizeChecklist(discussionRoom.id);
              }
            }
          }
          
          // Reload sector after processing
          updatedSector = await getSectorById(sectorId);
          const allAgents = await loadAgents();
          const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
          updatedSector.agents = sectorAgents;
        } else if (discussionRoom.status === 'in_progress' && 
            Array.isArray(discussionRoom.checklistDraft) && 
            discussionRoom.checklistDraft.length > 0) {
          // If discussion is in_progress with checklistDraft, handle it
          console.log(`[SystemOrchestrator] Found in-progress discussion with checklistDraft, handling...`);
          const handledDiscussion = await this.managerEngine.handleChecklist(discussionRoom);
          // Check if discussion can be closed after handling
          if (handledDiscussion && this.managerEngine.canDiscussionClose(handledDiscussion)) {
            console.log(`[SystemOrchestrator] In-progress discussion ${discussionRoom.id} can be closed, auto-closing...`);
            await this.managerEngine.closeDiscussion(discussionRoom.id);
          }
          
          // Reload sector
          updatedSector = await getSectorById(sectorId);
          const allAgents = await loadAgents();
          const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
          updatedSector.agents = sectorAgents;
        } else if (discussionRoom.status === 'in_progress' && 
            Array.isArray(discussionRoom.checklist) && 
            discussionRoom.checklist.length > 0) {
          // Periodic check: if discussion is in_progress with checklist, check if it can be closed
          if (this.managerEngine.canDiscussionClose(discussionRoom)) {
            console.log(`[SystemOrchestrator] Found in-progress discussion ${discussionRoom.id} that can be closed, auto-closing...`);
            await this.managerEngine.closeDiscussion(discussionRoom.id);
          }
        } else if (discussionRoom.status === 'in_progress' &&
            (!Array.isArray(discussionRoom.checklistDraft) || discussionRoom.checklistDraft.length === 0) &&
            (!Array.isArray(discussionRoom.checklist) || discussionRoom.checklist.length === 0)) {
          console.log(`[SystemOrchestrator] In-progress discussion ${discussionRoom.id} has no pending items or drafts, closing...`, {
            event: 'DISCUSSION_CLOSED',
            sectorId: sectorId,
            discussionId: discussionRoom.id,
            reason: 'no_more_proposals'
          });
          await this.managerEngine.closeDiscussion(discussionRoom.id);
        }
      }

      // 5. Save updated sector state
      await updateSector(sectorId, {
        agents: updatedSector.agents,
        discussions: updatedSector.discussions
      });

      // 6. Return updated sector + discussionReady boolean
      return {
        sector: updatedSector,
        discussionReady
      };
    } catch (error) {
      console.error(`[SystemOrchestrator] Error in tickSector for sector ${sectorId}:`, error);
      // Re-throw to allow caller to handle, but log the error
      throw error;
    }
  }

  /**
   * Check if there's an active discussion for a sector
   * @private
   */
  async _hasActiveDiscussion(sectorId) {
    try {
      const discussions = await loadDiscussions();
      return discussions.some(d => 
        d.sectorId === sectorId && 
        (d.status === 'in_progress' || d.status === 'active') // Include legacy 'active' for backward compatibility
      );
    } catch (error) {
      console.error(`[SystemOrchestrator] Error checking active discussion:`, error);
      return false;
    }
  }

  /**
   * Get the active discussion for a sector
   * @private
   */
  async _getActiveDiscussion(sectorId) {
    try {
      const discussions = await loadDiscussions();
      return discussions.find(d => 
        d.sectorId === sectorId && 
        (d.status === 'in_progress' || d.status === 'active') // Include legacy 'active' for backward compatibility
      ) || null;
    } catch (error) {
      console.error(`[SystemOrchestrator] Error getting active discussion:`, error);
      return null;
    }
  }

  /**
   * Get finalized discussion for a sector
   * @private
   */
  async _getFinalizedDiscussion(sectorId) {
    try {
      const discussions = await loadDiscussions();
      return discussions.find(d => 
        d.sectorId === sectorId && 
        (d.status === 'decided' || d.status === 'finalized') // Include legacy 'finalized' for backward compatibility
      ) || null;
    } catch (error) {
      console.error(`[SystemOrchestrator] Error getting finalized discussion:`, error);
      return null;
    }
  }

  /**
   * Get approved checklist items from a discussion
   * Formats items for ExecutionEngine (requires action and amount)
   * @private
   */
  _getApprovedChecklist(discussionRoom) {
    if (!discussionRoom) {
      return null;
    }

    const approvedItems = [];

    // Check managerDecisions for approved items
    if (Array.isArray(discussionRoom.managerDecisions) && discussionRoom.managerDecisions.length > 0) {
      const managerApproved = discussionRoom.managerDecisions
        .filter(decision => decision.approved === true && decision.item)
        .map(decision => {
          const item = decision.item;
          // Extract action from item - check type first, then action, then text
          let action = item.type || item.action;
          if (action) {
            action = action.toLowerCase();
          }
          
          // Try to extract from text if not found
          if (!action && item.text) {
            const upperText = item.text.toUpperCase();
            if (upperText.includes('BUY') || upperText.includes('DEPLOY CAPITAL') || upperText.includes('DEPLOY')) {
              action = 'buy';
            } else if (upperText.includes('SELL') || upperText.includes('WITHDRAW')) {
              action = 'sell';
            } else if (upperText.includes('HOLD')) {
              action = 'hold';
            } else if (upperText.includes('REBALANCE') || upperText.includes('ALLOCATE')) {
              action = 'rebalance';
            }
          }
          
          // Try to extract from reasoning if still not found
          if (!action && item.reasoning) {
            const upperReasoning = item.reasoning.toUpperCase();
            if (upperReasoning.includes('BUY') || upperReasoning.includes('DEPLOY')) {
              action = 'buy';
            } else if (upperReasoning.includes('SELL') || upperReasoning.includes('WITHDRAW')) {
              action = 'sell';
            } else if (upperReasoning.includes('HOLD')) {
              action = 'hold';
            } else if (upperReasoning.includes('REBALANCE')) {
              action = 'rebalance';
            }
          }
          
          // If still no action found, skip this item (don't default to 'buy')
          if (!action) {
            console.warn(`[SystemOrchestrator] Skipping checklist item ${item.id || 'unknown'}: No action could be determined from type, action, text, or reasoning`);
            return null;
          }
          
          // Extract or default amount
          let amount = item.amount;
          if (!amount || amount <= 0) {
            // Default amount based on confidence or use a percentage of balance
            // For now, use a default amount - this can be enhanced
            amount = 100; // Default amount
          }

          return {
            id: item.id || `item-${Date.now()}`,
            action: action.toLowerCase(),
            amount: amount,
            text: item.text || item.reasoning || '',
            agentId: item.agentId,
            agentName: item.agentName,
            confidence: item.confidence || 0.7
          };
        })
        .filter(item => item !== null); // Remove null items
      
      approvedItems.push(...managerApproved);
    }

    // Fallback: check checklist array for approved items
    if (approvedItems.length === 0 && Array.isArray(discussionRoom.checklist) && discussionRoom.checklist.length > 0) {
      const checklistApproved = discussionRoom.checklist
        .filter(item => item.status === 'approved' || (!item.status && item.completed === false))
        .map(item => {
          // Extract action - check type first, then action, then text
          let action = item.type || item.action;
          if (action) {
            action = action.toLowerCase();
          }
          
          // Try to extract from text if not found
          if (!action && item.text) {
            const upperText = item.text.toUpperCase();
            if (upperText.includes('BUY') || upperText.includes('DEPLOY CAPITAL') || upperText.includes('DEPLOY')) {
              action = 'buy';
            } else if (upperText.includes('SELL') || upperText.includes('WITHDRAW')) {
              action = 'sell';
            } else if (upperText.includes('HOLD')) {
              action = 'hold';
            } else if (upperText.includes('REBALANCE') || upperText.includes('ALLOCATE')) {
              action = 'rebalance';
            }
          }
          
          // Try to extract from reasoning if still not found
          if (!action && (item.reasoning || item.reason)) {
            const reasoningText = (item.reasoning || item.reason || '').toUpperCase();
            if (reasoningText.includes('BUY') || reasoningText.includes('DEPLOY')) {
              action = 'buy';
            } else if (reasoningText.includes('SELL') || reasoningText.includes('WITHDRAW')) {
              action = 'sell';
            } else if (reasoningText.includes('HOLD')) {
              action = 'hold';
            } else if (reasoningText.includes('REBALANCE')) {
              action = 'rebalance';
            }
          }
          
          // If still no action found, skip this item (don't default to 'buy')
          if (!action) {
            console.warn(`[SystemOrchestrator] Skipping checklist item ${item.id || 'unknown'}: No action could be determined from type, action, text, or reasoning`);
            return null;
          }

          return {
            id: item.id || `item-${Date.now()}`,
            action: action.toLowerCase(),
            amount: item.amount || 100,
            text: item.text || '',
            agentId: item.agentId,
            agentName: item.agentName
          };
        })
        .filter(item => item !== null); // Remove null items
      
      approvedItems.push(...checklistApproved);
    }

    return approvedItems.length > 0 ? approvedItems : null;
  }

  /**
   * Update sector performance after checklist execution
   * Note: ExecutionEngine already updates sector balance, position, and performance
   * This method tracks execution statistics
   * @private
   */
  async _updateSectorPerformance(sectorId, executionResult) {
    try {
      const sector = await getSectorById(sectorId);
      if (!sector) {
        return;
      }

      // Ensure performance object exists
      if (!sector.performance) {
        sector.performance = {};
      }

      // Update execution statistics
      if (!sector.performance.executions) {
        sector.performance.executions = {
          total: 0,
          successful: 0,
          failed: 0
        };
      }

      // Count successful vs failed executions
      const results = executionResult.results || [];
      const successfulExecutions = results.filter(r => r.success).length;
      const totalExecutions = results.length || (executionResult.success ? 1 : 0);
      
      sector.performance.executions.total += totalExecutions;
      sector.performance.executions.successful += successfulExecutions;
      sector.performance.executions.failed += (totalExecutions - successfulExecutions);
      sector.performance.lastExecutionAt = new Date().toISOString();

      // Save updated sector (only execution stats, ExecutionEngine already updated balance/position)
      await updateSector(sectorId, {
        performance: sector.performance
      });

      console.log(`[SystemOrchestrator] Updated sector performance for ${sectorId}: ${successfulExecutions}/${totalExecutions} successful executions`);
    } catch (error) {
      console.error(`[SystemOrchestrator] Error updating sector performance:`, error);
      // Don't throw - performance update failure shouldn't block execution
    }
  }

  /**
   * Tick all sectors automatically
   * This is called every 2 seconds and handles:
   * - Confidence updates (always)
   * - Discussion management (always)
   * - Price simulation (only in simulation mode)
   * @private
   */
  async _tickAllSectors() {
    // Prevent concurrent ticks
    if (this.isTicking) {
      console.log('[SystemOrchestrator] Tick already in progress, skipping...');
      return;
    }

    this.isTicking = true;

    try {
      // Get all sectors
      const sectors = await getAllSectors();
      
      if (sectors.length === 0) {
        // No sectors to tick, skip silently
        return;
      }

      const systemMode = getSystemMode();
      const isSimulationMode = systemMode.isSimulationMode();

      // Tick each sector
      for (const sector of sectors) {
        if (!sector || !sector.id) {
          continue;
        }

        try {
          // Always run orchestrator tick (confidence + discussions)
          await this.tickSector(sector.id);

          // Only run simulation tick (price updates) if in simulation mode
          if (isSimulationMode) {
            try {
              await executeSimulationTick(sector.id);
            } catch (simError) {
              // Log but don't throw - allow orchestrator tick to succeed even if simulation fails
              console.error(`[SystemOrchestrator] Simulation tick failed for sector ${sector.id}:`, simError.message);
            }
          }
        } catch (error) {
          // Log error but continue with other sectors
          console.error(`[SystemOrchestrator] Error ticking sector ${sector.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('[SystemOrchestrator] Error in _tickAllSectors:', error);
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Start automatic ticking (every 2 seconds)
   */
  start() {
    if (this.tickInterval) {
      console.log('[SystemOrchestrator] Already started');
      return;
    }

    console.log('[SystemOrchestrator] Starting automatic ticks (every 2 seconds)');
    
    // Run first tick immediately
    this._tickAllSectors().catch(err => {
      console.error('[SystemOrchestrator] Error in initial tick:', err);
    });

    // Then run every 2 seconds
    this.tickInterval = setInterval(() => {
      this._tickAllSectors().catch(err => {
        console.error('[SystemOrchestrator] Error in scheduled tick:', err);
      });
    }, TICK_INTERVAL_MS);
  }

  /**
   * Stop automatic ticking
   */
  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      console.log('[SystemOrchestrator] Stopped automatic ticks');
    }
  }
}

module.exports = SystemOrchestrator;

