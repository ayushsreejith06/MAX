const Agent = require('../base/Agent');
const { loadAgents, saveAgents, updateAgent } = require('../../utils/agentStorage');
const { loadSectors } = require('../../utils/storage');
const { getSectorById: getSectorByIdStorage, updateSector } = require('../../utils/sectorStorage');
const { MAX_AGENTS_PER_SECTOR, MAX_TOTAL_AGENTS } = require('../../config/agentLimits');
const { generateAgentProfileFromDescription } = require('../../ai/agentProfileBrain');
const { callLLM } = require('../../ai/llmClient');

function getDefaultPersonality(role) {
  const templates = {
    macro: {
      riskTolerance: 'medium',
      decisionStyle: 'deliberate'
    },
    risk: {
      riskTolerance: 'low',
      decisionStyle: 'cautious'
    },
    sentiment: {
      riskTolerance: 'medium',
      decisionStyle: 'rapid'
    },
    technical: {
      riskTolerance: 'medium',
      decisionStyle: 'analytical'
    },
    trader: {
      riskTolerance: 'high',
      decisionStyle: 'rapid'
    },
    analyst: {
      riskTolerance: 'low',
      decisionStyle: 'studious'
    },
    research: {
      riskTolerance: 'low',
      decisionStyle: 'studious'
    },
    manager: {
      riskTolerance: 'medium',
      decisionStyle: 'balanced'
    },
    riskmanager: {
      riskTolerance: 'low',
      decisionStyle: 'cautious'
    },
    advisor: {
      riskTolerance: 'medium',
      decisionStyle: 'deliberate'
    },
    arbitrage: {
      riskTolerance: 'low',
      decisionStyle: 'precise'
    },
    general: {
      riskTolerance: 'medium',
      decisionStyle: 'balanced'
    }
  };

  return templates[role] || templates.general;
}

// Generate preference weights based on role
function getDefaultPreferences(role) {
  const templates = {
    macro: {
      riskWeight: 0.6,
      profitWeight: 0.6,
      speedWeight: 0.4,
      accuracyWeight: 0.8
    },
    risk: {
      riskWeight: 0.85,
      profitWeight: 0.45,
      speedWeight: 0.4,
      accuracyWeight: 0.9
    },
    sentiment: {
      riskWeight: 0.5,
      profitWeight: 0.65,
      speedWeight: 0.8,
      accuracyWeight: 0.55
    },
    technical: {
      riskWeight: 0.55,
      profitWeight: 0.65,
      speedWeight: 0.65,
      accuracyWeight: 0.7
    },
    trader: {
      riskWeight: 0.3,      // Lower risk weight (more aggressive)
      profitWeight: 0.8,    // High profit focus
      speedWeight: 0.9,     // Fast decisions
      accuracyWeight: 0.6   // Moderate accuracy
    },
    analyst: {
      riskWeight: 0.7,      // Higher risk weight (more cautious)
      profitWeight: 0.5,    // Moderate profit focus
      speedWeight: 0.3,     // Slower, more deliberate
      accuracyWeight: 0.9   // High accuracy focus
    },
    research: {
      riskWeight: 0.8,      // Very cautious
      profitWeight: 0.4,    // Lower profit focus
      speedWeight: 0.2,     // Very slow, thorough
      accuracyWeight: 0.95  // Maximum accuracy
    },
    manager: {
      riskWeight: 0.5,      // Balanced
      profitWeight: 0.6,    // Moderate profit focus
      speedWeight: 0.5,     // Balanced speed
      accuracyWeight: 0.7   // Good accuracy
    },
    riskmanager: {
      riskWeight: 0.95,     // Maximum risk focus
      profitWeight: 0.3,    // Lower profit focus
      speedWeight: 0.4,     // Moderate speed
      accuracyWeight: 0.8   // High accuracy
    },
    advisor: {
      riskWeight: 0.6,      // Moderate risk focus
      profitWeight: 0.5,    // Balanced profit
      speedWeight: 0.4,     // Moderate speed
      accuracyWeight: 0.85  // High accuracy
    },
    arbitrage: {
      riskWeight: 0.7,      // Cautious
      profitWeight: 0.7,    // High profit focus
      speedWeight: 0.95,    // Very fast (time-sensitive)
      accuracyWeight: 0.9   // Very high accuracy
    },
    general: {
      riskWeight: 0.5,      // Balanced
      profitWeight: 0.5,    // Balanced
      speedWeight: 0.5,     // Balanced
      accuracyWeight: 0.7   // Moderate accuracy
    }
  };

  return templates[role] || templates.general;
}

async function buildAgentIdentity(userDescription, sectorName) {
  const description = typeof userDescription === 'string' ? userDescription.trim() : '';
  const sector = typeof sectorName === 'string' ? sectorName.trim() : '';

  if (!description) {
    throw new Error('Agent description is required to build identity.');
  }

  const result = await callLLM({
    systemPrompt: `
You are MAX System LLM. You classify agents.
ALWAYS output JSON. Never output text outside JSON.
`,
    userPrompt: `
Given this description: "${description}",
sector: "${sector}".

Return a compact agent definition:

{
  "id": "TECH_ANALYST",
  "purpose": "Analyze Nvidia stock trends and generate buy/sell signals."
}

Rules:
- "id" MUST be 1-3 words, UPPERCASE, NO SPACES, underscores allowed.
- "purpose" MUST be one short sentence.
- Never repeat user text. Rewrite intelligently.
- Never exceed 200 characters.
`,
    jsonMode: true
  });

  // Extract JSON from response (handles markdown code fences and extra text)
  function extractJsonObject(raw) {
    if (typeof raw !== 'string') {
      throw new Error('Response must be a string');
    }

    const trimmed = raw.trim();
    // Try to extract JSON from markdown code fences
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch ? fencedMatch[1] : trimmed;

    // Try direct parse first
    try {
      return JSON.parse(candidate);
    } catch {
      /* fall through */
    }

    // Try to find JSON object boundaries
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('No JSON object found');
    }

    const sliced = candidate.slice(start, end + 1);
    return JSON.parse(sliced);
  }

  let parsed;
  try {
    parsed = extractJsonObject(result);
  } catch (error) {
    console.error('[buildAgentIdentity] JSON extraction failed:', error);
    console.error('[buildAgentIdentity] Raw LLM response:', result);
    throw new Error('LLM did not return valid JSON.');
  }

  const id = typeof parsed?.id === 'string' ? parsed.id.trim() : '';
  const purpose = typeof parsed?.purpose === 'string' ? parsed.purpose.trim() : '';

  if (!id || !purpose) {
    throw new Error('LLM response missing required id or purpose.');
  }

  return { id, purpose };
}

async function resolveSectorMetadata(sectorId) {
  if (!sectorId) {
    return {
      sectorId: null,
      sectorName: 'Unassigned',
      sectorSymbol: 'UNAS'
    };
  }

  const sectors = await loadSectors();
  const sector = sectors.find(s => s.id === sectorId);

  if (!sector) {
    return {
      sectorId: null,
      sectorName: 'Unassigned',
      sectorSymbol: 'UNAS'
    };
  }

  const preferredName = sector.sectorName || sector.name || 'Unknown Sector';
  const preferredSymbol = sector.sectorSymbol || sector.symbol || preferredName.slice(0, 4).toUpperCase();

  return {
    sectorId: sector.id,
    sectorName: preferredName,
    sectorSymbol: preferredSymbol
  };
}

async function createAgent(promptText = '', sectorId = null, roleOverride = null) {
  const sectorMeta = await resolveSectorMetadata(sectorId);
  const normalizedDescription = typeof promptText === 'string' ? promptText.trim() : '';

  const { id: llmId, purpose } = await buildAgentIdentity(normalizedDescription, sectorMeta.sectorName);

  const profile = await generateAgentProfileFromDescription({
    sectorName: sectorMeta.sectorName,
    userDescription: promptText,
    userProvidedName: llmId
  });

  let role =
    roleOverride && typeof roleOverride === 'string' && roleOverride.trim()
      ? roleOverride.trim().toLowerCase()
      : llmId.toLowerCase();

  if (!role || typeof role !== 'string' || role.trim().length === 0) {
    throw new Error('Invalid role: role must be a non-empty string');
  }

  const personalityBase = getDefaultPersonality(role);
  const preferences = getDefaultPreferences(role);
  const decisionStyleMap = {
    Aggressive: 'rapid',
    Balanced: 'balanced',
    Defensive: 'cautious'
  };
  const personality = {
    ...personalityBase,
    riskTolerance: profile.riskTolerance || personalityBase.riskTolerance,
    decisionStyle: decisionStyleMap[profile.style] || personalityBase.decisionStyle
  };
  
  // Load existing agents to check limits and generate unique ID
  const allAgents = await loadAgents();
  
  // Check global agent limit
  if (allAgents.length >= MAX_TOTAL_AGENTS) {
    const errorMessage = `Global agent limit reached. Maximum ${MAX_TOTAL_AGENTS} agents allowed.`;
    console.warn('[Limit] Agent creation blocked due to capacity limit.', {
      reason: 'global_limit',
      currentCount: allAgents.length,
      maxAllowed: MAX_TOTAL_AGENTS
    });
    throw new Error(errorMessage);
  }
  
  // Check per-sector limit
  if (sectorMeta.sectorId) {
    const sectorAgents = allAgents.filter(a => a.sectorId === sectorMeta.sectorId);
    if (sectorAgents.length >= MAX_AGENTS_PER_SECTOR) {
      const errorMessage = `This sector already has ${MAX_AGENTS_PER_SECTOR} agents. Maximum ${MAX_AGENTS_PER_SECTOR} agents per sector allowed.`;
      console.warn('[Limit] Agent creation blocked due to capacity limit.', {
        reason: 'sector_limit',
        sectorId: sectorMeta.sectorId,
        sectorName: sectorMeta.sectorName,
        currentCount: sectorAgents.length,
        maxAllowed: MAX_AGENTS_PER_SECTOR
      });
      throw new Error(errorMessage);
    }
  }
  
  // Generate unique ID and name using existing agents
  const agentId = llmId;
  const agentName = llmId;

  // Initialize memory array with initial reasoning log
  const initialMemory = [{
    timestamp: Date.now(),
    type: 'creation',
    reasoning: `Agent created via LLM identity ${llmId}.`,
    data: {
      role,
      purpose,
      personality,
      preferences
    }
  }];

  // Create agent with all required fields
  const agent = new Agent({
    id: agentId,
    name: agentName,
    displayName: agentName,
    role,
    style: profile.style,
    riskTolerance: profile.riskTolerance,
    shortBio: purpose || profile.shortBio,
    initialConfidence: profile.initialConfidence,
    prompt: promptText,
    sectorId: sectorMeta.sectorId,
    sectorSymbol: sectorMeta.sectorSymbol,
    sectorName: sectorMeta.sectorName,
    status: 'idle', // Required: default status
    performance: { pnl: 0, winRate: 0 },
    trades: [],
    personality,
    preferences,
    memory: initialMemory,
    lastDecision: null,
    lastDecisionAt: null,
    morale: 50, // Required: default morale
    confidence: profile.initialConfidence, // Required: default confidence
    rewardPoints: 0,
    lastRewardTimestamp: null,
    createdAt: new Date().toISOString() // Required: creation timestamp
  });

  agent.purpose = purpose;

  // Validate agent was created successfully
  if (!agent || typeof agent.toJSON !== 'function') {
    throw new Error('Failed to create agent: Agent constructor returned invalid object');
  }

  const agentData = { ...agent.toJSON(), purpose };

  // Validate all required fields are present
  const requiredFields = ['id', 'name', 'role', 'sectorId', 'confidence', 'morale', 'status', 'createdAt', 'purpose'];
  const missingFields = requiredFields.filter(field => agentData[field] === undefined || agentData[field] === null);
  
  if (missingFields.length > 0) {
    throw new Error(`Created agent is missing required fields: ${missingFields.join(', ')}`);
  }

  // Ensure defaults are set correctly
  if (!agentData.displayName) {
    agentData.displayName = agentData.name;
  }
  if (!agentData.name) {
    agentData.name = agentData.displayName;
  }
  if (typeof agentData.confidence !== 'number') {
    agentData.confidence = profile.initialConfidence ?? 0;
  }
  if (typeof agentData.morale !== 'number') {
    agentData.morale = 50;
  }
  if (agentData.status !== 'idle' && agentData.status !== 'active' && agentData.status !== 'processing') {
    agentData.status = 'idle';
  }
  if (!agentData.createdAt) {
    agentData.createdAt = new Date().toISOString();
  }

  // Save agent to storage
  // Check if agent already exists, if so update it, otherwise add it
  // Note: We reload agents here to ensure we have the latest state after limit checks
  const currentAgents = await loadAgents();
  const existingAgentIndex = currentAgents.findIndex(a => a.id === agentData.id);
  
  if (existingAgentIndex >= 0) {
    // Agent exists, update it
    await updateAgent(agentData.id, agentData);
  } else {
    // New agent, add to array and save (saveAgents handles deduplication)
    // Final safety check: ensure we haven't exceeded limits between check and save
    const finalAgents = await loadAgents();
    if (finalAgents.length >= MAX_TOTAL_AGENTS) {
      const errorMessage = `Global agent limit reached. Maximum ${MAX_TOTAL_AGENTS} agents allowed.`;
      console.warn('[Limit] Agent creation blocked due to capacity limit (race condition protection).', {
        reason: 'global_limit_race',
        currentCount: finalAgents.length,
        maxAllowed: MAX_TOTAL_AGENTS
      });
      throw new Error(errorMessage);
    }
    
    if (sectorMeta.sectorId) {
      const finalSectorAgents = finalAgents.filter(a => a.sectorId === sectorMeta.sectorId);
      if (finalSectorAgents.length >= MAX_AGENTS_PER_SECTOR) {
        const errorMessage = `This sector already has ${MAX_AGENTS_PER_SECTOR} agents. Maximum ${MAX_AGENTS_PER_SECTOR} agents per sector allowed.`;
        console.warn('[Limit] Agent creation blocked due to capacity limit (race condition protection).', {
          reason: 'sector_limit_race',
          sectorId: sectorMeta.sectorId,
          sectorName: sectorMeta.sectorName,
          currentCount: finalSectorAgents.length,
          maxAllowed: MAX_AGENTS_PER_SECTOR
        });
        throw new Error(errorMessage);
      }
    }
    
    finalAgents.push(agentData);
    await saveAgents(finalAgents);
  }

  // Update sector: add agent to sector's agents array and update activeAgents count
  if (agentData.sectorId) {
    try {
      const sector = await getSectorByIdStorage(agentData.sectorId);

      if (!sector) {
        console.warn(
          '[createAgent] Agent created with sectorId that does not exist',
          { sectorId: agentData.sectorId, agentId: agentData.id }
        );
      } else {
        // Add agent to sector's agents array if not already present
        const existingSectorAgents = Array.isArray(sector.agents) ? sector.agents : [];
        const agentExists = existingSectorAgents.some(a => a && a.id === agentData.id);
        
        const updates = {};
        
        if (!agentExists) {
          // Add agent to sector's agents array (avoid duplicates)
          updates.agents = [...existingSectorAgents, agentData];

          console.log('[createAgent] Added agent to sector agents array', {
            sectorId: sector.id,
            agentId: agentData.id,
            agentName: agentData.name,
            totalAgents: updates.agents.length
          });
        }

        // Update activeAgents count if agent is active
        if (agentData.status === 'active') {
          const currentCount =
            typeof sector.activeAgents === 'number' ? sector.activeAgents : 0;
          updates.activeAgents = currentCount + 1;
        }

        // Update sector with all changes in one operation
        if (Object.keys(updates).length > 0) {
          const updatedSector = await updateSector(sector.id, updates);
          
          if (updatedSector && updates.activeAgents) {
            console.log('[createAgent] Incremented activeAgents for sector', {
              sectorId: sector.id,
              activeAgents: updatedSector.activeAgents,
            });
          }
        }
      }
    } catch (err) {
      console.warn(
        '[createAgent] Failed to update sector with new agent',
        err
      );
      // deliberately do not throw; agent creation already succeeded
    }
  }

  // Return the agent object (not just the data)
  return agent;
}

module.exports = {
  createAgent,
  getDefaultPersonality,
  getDefaultPreferences
};

