/**
 * Verification Script for Manager Decision Logic
 * 
 * Tests:
 * 1. Signal collection from agents
 * 2. Voting logic
 * 3. Confidence aggregation
 * 4. Conflict resolution
 * 5. Decision persistence
 */

const http = require('http');

const PORT = process.env.MAX_PORT || process.env.PORT || 4000;
const HOST = process.env.MAX_HOST || 'localhost';
const BASE_URL = `http://${HOST}:${PORT}`;

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || PORT,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

function log(message, type = 'info') {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: '📊',
    test: '🧪'
  };
  console.log(`${icons[type] || ''} ${message}`);
}

async function verifyManagerDecisionLogic() {
  console.log('='.repeat(70));
  console.log('Manager Decision Logic Verification');
  console.log('='.repeat(70));
  console.log(`Testing against: ${BASE_URL}\n`);

  let allTestsPassed = true;
  let sectorId = null;

  try {
    // Step 1: Check server
    log('Step 1: Checking server status...', 'test');
    try {
      const health = await makeRequest('/health');
      if (health.status === 200) {
        log('Server is running', 'success');
      } else {
        log(`Server returned status ${health.status}`, 'error');
        allTestsPassed = false;
        return;
      }
    } catch (error) {
      log(`Cannot connect to server: ${error.message}`, 'error');
      log('Make sure the backend server is running', 'warning');
      return;
    }

    // Step 2: Get or create a sector
    log('\nStep 2: Setting up test sector...', 'test');
    try {
      const sectorsRes = await makeRequest('/api/sectors');
      if (sectorsRes.status === 200 && sectorsRes.data.success && sectorsRes.data.data.length > 0) {
        sectorId = sectorsRes.data.data[0].id;
        log(`Using existing sector: ${sectorId}`, 'info');
      } else {
        log('No sectors found. Creating test sector...', 'warning');
        const createRes = await makeRequest('/api/sectors', 'POST', {
          sectorName: 'Test Sector',
          sectorSymbol: 'TEST'
        });
        if (createRes.status === 200 && createRes.data.success) {
          sectorId = createRes.data.data.id;
          log(`Created test sector: ${sectorId}`, 'success');
        } else {
          log('Failed to create sector', 'error');
          allTestsPassed = false;
          return;
        }
      }
    } catch (error) {
      log(`Error setting up sector: ${error.message}`, 'error');
      allTestsPassed = false;
      return;
    }

    // Step 3: Test Voting Logic
    log('\nStep 3: Testing voting logic...', 'test');
    try {
      const decisionRes = await makeRequest('/api/manager/decide', 'POST', {
        sectorId: sectorId,
        signals: [
          { action: 'BUY', confidence: 0.8, agentId: 'test-agent-1' },
          { action: 'BUY', confidence: 0.7, agentId: 'test-agent-2' },
          { action: 'SELL', confidence: 0.6, agentId: 'test-agent-3' }
        ]
      });

      if (decisionRes.status === 200 && decisionRes.data.success) {
        const decision = decisionRes.data.data;
        
        // Verify voting
        if (decision.action === 'BUY' && decision.voteBreakdown.BUY === 2) {
          log('Voting logic works: BUY wins with 2 votes', 'success');
        } else {
          log(`Voting issue: Expected BUY with 2 votes, got ${decision.action}`, 'error');
          allTestsPassed = false;
        }

        // Verify confidence aggregation
        if (typeof decision.confidence === 'number' && decision.confidence >= 0 && decision.confidence <= 1) {
          log(`Confidence aggregation works: ${decision.confidence.toFixed(2)}`, 'success');
        } else {
          log('Confidence aggregation issue: Invalid confidence value', 'error');
          allTestsPassed = false;
        }

        // Verify vote breakdown
        if (decision.voteBreakdown && 
            decision.voteBreakdown.BUY === 2 && 
            decision.voteBreakdown.SELL === 1) {
          log('Vote breakdown correct: BUY=2, SELL=1', 'success');
        } else {
          log('Vote breakdown issue', 'error');
          allTestsPassed = false;
        }

        // Verify conflict detection
        if (typeof decision.conflictScore === 'number' && decision.conflictScore > 0) {
          log(`Conflict detection works: score ${decision.conflictScore.toFixed(2)}`, 'success');
        } else {
          log('Conflict detection issue: No conflict score', 'warning');
        }

        // Verify reason
        if (decision.reason && decision.reason.includes('Majority vote')) {
          log('Decision reason provided', 'success');
        } else {
          log('Decision reason missing or incorrect', 'warning');
        }
      } else {
        log('Failed to make decision', 'error');
        allTestsPassed = false;
      }
    } catch (error) {
      log(`Error testing voting: ${error.message}`, 'error');
      allTestsPassed = false;
    }

    // Step 4: Test Conflict Resolution
    log('\nStep 4: Testing conflict resolution...', 'test');
    try {
      const conflictRes = await makeRequest('/api/manager/decide', 'POST', {
        sectorId: sectorId,
        signals: [
          { action: 'BUY', confidence: 0.9, agentId: 'test-agent-1' },
          { action: 'SELL', confidence: 0.8, agentId: 'test-agent-2' },
          { action: 'HOLD', confidence: 0.7, agentId: 'test-agent-3' }
        ]
      });

      if (conflictRes.status === 200 && conflictRes.data.success) {
        const decision = conflictRes.data.data;
        
        if (decision.conflictScore > 0.5) {
          log(`High conflict detected: ${decision.conflictScore.toFixed(2)}`, 'success');
        } else {
          log(`Low conflict score: ${decision.conflictScore.toFixed(2)}`, 'warning');
        }

        if (decision.action && ['BUY', 'SELL', 'HOLD'].includes(decision.action)) {
          log(`Conflict resolved: ${decision.action}`, 'success');
        } else {
          log('Conflict resolution issue: Invalid action', 'error');
          allTestsPassed = false;
        }
      } else {
        log('Failed to test conflict resolution', 'error');
        allTestsPassed = false;
      }
    } catch (error) {
      log(`Error testing conflict resolution: ${error.message}`, 'error');
      allTestsPassed = false;
    }

    // Step 5: Check Runtime Status
    log('\nStep 5: Checking runtime status...', 'test');
    try {
      const statusRes = await makeRequest('/api/manager/status');
      if (statusRes.status === 200 && statusRes.data.success) {
        const runtime = statusRes.data.data;
        
        if (runtime.isRunning) {
          log('Runtime is running', 'success');
        } else {
          log('Runtime is not running', 'error');
          allTestsPassed = false;
        }

        log(`Managers loaded: ${runtime.managerCount}`, 'info');
        log(`Decisions logged: ${runtime.decisionLogSize}`, 'info');

        if (runtime.managerCount > 0) {
          const manager = runtime.managers[0];
          if (manager.lastDecision) {
            log('Manager has made decisions', 'success');
            log(`Last decision: ${manager.lastDecision.action} (confidence: ${manager.lastDecision.confidence.toFixed(2)})`, 'info');
          } else {
            log('Manager has not made decisions yet', 'warning');
          }
        } else {
          log('No managers found - create a sector to create a manager', 'warning');
        }
      } else {
        log('Failed to get runtime status', 'error');
        allTestsPassed = false;
      }
    } catch (error) {
      log(`Error checking runtime: ${error.message}`, 'error');
      allTestsPassed = false;
    }

    // Step 6: Check Decision Persistence
    log('\nStep 6: Checking decision persistence...', 'test');
    try {
      const agentsRes = await makeRequest('/api/agents');
      if (agentsRes.status === 200 && agentsRes.data.success) {
        const managers = agentsRes.data.data.filter(a => 
          (a.role === 'manager' || a.role?.toLowerCase().includes('manager')) &&
          a.sectorId === sectorId
        );

        if (managers.length > 0) {
          const manager = managers[0];
          
          if (manager.memory && Array.isArray(manager.memory) && manager.memory.length > 0) {
            log(`Memory persistence works: ${manager.memory.length} entries`, 'success');
          } else {
            log('Memory persistence issue: No memory entries', 'warning');
          }

          if (manager.lastDecision) {
            log('Last decision persisted', 'success');
          } else {
            log('Last decision not persisted yet', 'warning');
          }
        } else {
          log('No manager agent found for persistence check', 'warning');
        }
      }
    } catch (error) {
      log(`Error checking persistence: ${error.message}`, 'warning');
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    if (allTestsPassed) {
      log('All core tests passed! Manager Decision Logic is working.', 'success');
      log('\nVerification Checklist:', 'info');
      log('  ✅ Voting logic across agents', 'success');
      log('  ✅ Confidence aggregation', 'success');
      log('  ✅ Conflict resolution', 'success');
      log('  ✅ Final manager decision emitted', 'success');
      log('\nNote: Some optional checks (persistence, runtime decisions) may need', 'info');
      log('      time to populate. Wait 10-15 seconds and check again.', 'info');
    } else {
      log('Some tests failed. Check the output above for details.', 'error');
    }
    console.log('='.repeat(70));

  } catch (error) {
    log(`\nFatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run verification
verifyManagerDecisionLogic().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

