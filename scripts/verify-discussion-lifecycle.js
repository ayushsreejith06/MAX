/**
 * Verification script for Discussion Lifecycle
 * 
 * Tests the complete discussion lifecycle:
 * 1. Create - Create a new discussion
 * 2. Discuss - Collect agent arguments
 * 3. Decide - Produce a decision
 * 4. Close - Close the discussion
 * 5. Archive - Archive the discussion
 */

const fetch = require('node-fetch');

const API_BASE = process.env.API_BASE || 'http://localhost:8000/api';
const API_PORT = process.env.API_PORT || 8000;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to backend at ${API_BASE}. Make sure the backend server is running.`);
    }
    throw error;
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyLifecycle() {
  log('\n═══════════════════════════════════════════════════════════', 'blue');
  log('  Discussion Lifecycle Verification', 'blue');
  log('═══════════════════════════════════════════════════════════\n', 'blue');

  try {
    // Step 1: Get sectors and agents
    logStep('SETUP', 'Fetching sectors and agents...');
    const sectors = await request('/sectors');
    const agents = await request('/agents');

    if (!Array.isArray(sectors) || sectors.length === 0) {
      throw new Error('No sectors found. Please create at least one sector first.');
    }

    if (!Array.isArray(agents) || agents.length === 0) {
      throw new Error('No agents found. Please create at least one agent first.');
    }

    const sector = sectors[0];
    const sectorAgents = agents.filter(a => a.sectorId === sector.id && a.role !== 'manager');

    if (sectorAgents.length === 0) {
      throw new Error(`No agents found in sector ${sector.symbol}. Please create agents for this sector.`);
    }

    logSuccess(`Found sector: ${sector.symbol} (${sector.name})`);
    logSuccess(`Found ${sectorAgents.length} agents in sector`);

    // Step 2: Create Discussion
    logStep('1. CREATE', 'Creating a new discussion...');
    const createResponse = await request('/discussions', {
      method: 'POST',
      body: JSON.stringify({
        sectorId: sector.id,
        title: `Test Discussion: ${sector.symbol} - Lifecycle Verification`,
        agentIds: sectorAgents.slice(0, Math.min(3, sectorAgents.length)).map(a => a.id)
      })
    });

    const discussion = createResponse;
    if (!discussion || !discussion.id) {
      throw new Error('Failed to create discussion');
    }

    logSuccess(`Discussion created: ${discussion.id}`);
    logSuccess(`Status: ${discussion.status}`);
    logSuccess(`Participants: ${discussion.agentIds.length}`);

    // Step 3: Collect Arguments
    logStep('2. DISCUSS', 'Collecting agent arguments...');
    await wait(1000); // Wait a bit for discussion to be ready

    const collectResponse = await request(`/discussions/${discussion.id}/collect-arguments`, {
      method: 'POST'
    });

    if (!collectResponse.success) {
      throw new Error(`Failed to collect arguments: ${collectResponse.error}`);
    }

    const arguments = collectResponse.arguments || [];
    logSuccess(`Collected ${arguments.length} arguments from agents`);

    if (arguments.length > 0) {
      arguments.forEach((arg, idx) => {
        log(`  ${idx + 1}. ${arg.action} (confidence: ${(arg.confidence * 100).toFixed(0)}%)`, 'yellow');
      });
    }

    // Verify discussion was updated
    const updatedDiscussion = await request(`/discussions/${discussion.id}`);
    logSuccess(`Messages in discussion: ${updatedDiscussion.messages.length}`);
    logSuccess(`Status: ${updatedDiscussion.status}`);

    if (updatedDiscussion.status !== 'in_progress') {
      logWarning(`Expected status 'in_progress', got '${updatedDiscussion.status}'`);
    }

    // Step 4: Produce Decision
    logStep('3. DECIDE', 'Producing decision from arguments...');
    await wait(1000); // Wait a bit

    const decideResponse = await request(`/discussions/${discussion.id}/produce-decision`, {
      method: 'POST'
    });

    if (!decideResponse.success) {
      throw new Error(`Failed to produce decision: ${decideResponse.error}`);
    }

    const decision = decideResponse.decision;
    logSuccess(`Decision produced: ${decision.action}`);
    logSuccess(`Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
    logSuccess(`Rationale: ${decision.rationale}`);

    if (decision.voteBreakdown) {
      log(`  Vote breakdown:`, 'yellow');
      Object.entries(decision.voteBreakdown).forEach(([action, count]) => {
        log(`    ${action}: ${count}`, 'yellow');
      });
    }

    // Verify decision was saved
    const decidedDiscussion = await request(`/discussions/${discussion.id}`);
    if (!decidedDiscussion.finalDecision) {
      throw new Error('Decision was not saved to discussion');
    }
    logSuccess(`Decision saved: ${decidedDiscussion.finalDecision}`);

    // Step 5: Close Discussion
    logStep('4. CLOSE', 'Closing the discussion...');
    const closeResponse = await request(`/discussions/${discussion.id}/close`, {
      method: 'POST'
    });

    if (!closeResponse || !closeResponse.id) {
      throw new Error('Failed to close discussion');
    }

    logSuccess(`Discussion closed: ${closeResponse.id}`);
    logSuccess(`Status: ${closeResponse.status}`);

    if (closeResponse.status !== 'closed') {
      logWarning(`Expected status 'closed', got '${closeResponse.status}'`);
    }

    // Step 6: Archive Discussion
    logStep('5. ARCHIVE', 'Archiving the discussion...');
    await wait(2000); // Wait a bit before archiving

    const archiveResponse = await request(`/discussions/${discussion.id}/archive`, {
      method: 'POST'
    });

    if (!archiveResponse || !archiveResponse.id) {
      throw new Error('Failed to archive discussion');
    }

    logSuccess(`Discussion archived: ${archiveResponse.id}`);
    logSuccess(`Status: ${archiveResponse.status}`);

    if (archiveResponse.status !== 'archived') {
      logWarning(`Expected status 'archived', got '${archiveResponse.status}'`);
    }

    // Final verification
    logStep('VERIFICATION', 'Verifying final state...');
    const finalDiscussion = await request(`/discussions/${discussion.id}`);

    const checks = [
      { name: 'Has final decision', value: !!finalDiscussion.finalDecision },
      { name: 'Has rationale', value: !!finalDiscussion.rationale },
      { name: 'Has confidence', value: typeof finalDiscussion.confidence === 'number' },
      { name: 'Has messages', value: finalDiscussion.messages.length > 0 },
      { name: 'Status is archived', value: finalDiscussion.status === 'archived' }
    ];

    checks.forEach(check => {
      if (check.value) {
        logSuccess(check.name);
      } else {
        logError(`${check.name} - FAILED`);
      }
    });

    const allPassed = checks.every(check => check.value);

    log('\n═══════════════════════════════════════════════════════════', 'blue');
    if (allPassed) {
      log('  ✓ All lifecycle stages completed successfully!', 'green');
    } else {
      log('  ✗ Some verification checks failed', 'red');
    }
    log('═══════════════════════════════════════════════════════════\n', 'blue');

    return allPassed;

  } catch (error) {
    logError(`\nVerification failed: ${error.message}`);
    if (error.stack) {
      log(`\nStack trace:\n${error.stack}`, 'red');
    }
    return false;
  }
}

// Run verification
if (require.main === module) {
  verifyLifecycle()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      logError(`Unexpected error: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { verifyLifecycle };

