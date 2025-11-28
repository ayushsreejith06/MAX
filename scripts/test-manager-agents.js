/**
 * Test script to verify Manager Agent system is working
 */

const http = require('http');

const BASE_URL = process.env.MAX_BACKEND_URL || 'http://localhost:4000';
const PORT = process.env.MAX_PORT || 4000;

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

async function testManagerAgents() {
  console.log('='.repeat(60));
  console.log('Manager Agent System Verification');
  console.log('='.repeat(60));
  console.log(`Testing against: ${BASE_URL}\n`);

  let allTestsPassed = true;

  try {
    // Test 1: Check if server is running
    console.log('1. Checking if server is running...');
    try {
      const health = await makeRequest('/health');
      if (health.status === 200) {
        console.log('   ✅ Server is running\n');
      } else {
        console.log('   ❌ Server returned non-200 status:', health.status);
        allTestsPassed = false;
      }
    } catch (error) {
      console.log('   ❌ Cannot connect to server:', error.message);
      console.log('   💡 Make sure the backend server is running on', BASE_URL);
      return;
    }

    // Test 2: Check runtime status
    console.log('2. Checking AgentRuntime status...');
    try {
      const status = await makeRequest('/api/manager/status');
      if (status.status === 200 && status.data.success) {
        const runtime = status.data.data;
        console.log('   ✅ Runtime is running:', runtime.isRunning ? 'YES' : 'NO');
        console.log('   📊 Managers loaded:', runtime.managerCount);
        console.log('   ⏱️  Tick interval:', runtime.tickIntervalMs + 'ms');
        console.log('   📝 Decisions logged:', runtime.decisionLogSize);
        
        if (runtime.managerCount === 0) {
          console.log('   ⚠️  WARNING: No manager agents found!');
          console.log('   💡 Create a sector to automatically create a manager agent');
        }
        console.log('');
      } else {
        console.log('   ❌ Failed to get runtime status');
        allTestsPassed = false;
      }
    } catch (error) {
      console.log('   ❌ Error checking runtime status:', error.message);
      allTestsPassed = false;
    }

    // Test 3: Wait and check for decisions
    console.log('3. Waiting 5 seconds for managers to make decisions...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const status2 = await makeRequest('/api/manager/status');
      if (status2.status === 200 && status2.data.success) {
        const runtime = status2.data.data;
        console.log('   📝 Decisions logged after wait:', runtime.decisionLogSize);
        
        if (runtime.decisionLogSize > 0) {
          console.log('   ✅ Managers are making decisions!\n');
        } else {
          console.log('   ⚠️  No decisions yet (this is OK if no sector agents exist)\n');
        }
      }
    } catch (error) {
      console.log('   ⚠️  Could not check decision log:', error.message);
    }

    // Test 4: Test manual decision endpoint
    console.log('4. Testing manual decision endpoint...');
    try {
      // First, get a sector ID
      const sectorsRes = await makeRequest('/api/sectors');
      if (sectorsRes.status === 200 && sectorsRes.data.success && sectorsRes.data.data.length > 0) {
        const sectorId = sectorsRes.data.data[0].id;
        console.log('   Using sector:', sectorId);
        
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
          console.log('   ✅ Decision made:', decision.action);
          console.log('   📊 Confidence:', decision.confidence.toFixed(2));
          console.log('   💬 Reason:', decision.reason);
          console.log('');
        } else {
          console.log('   ❌ Failed to make decision');
          allTestsPassed = false;
        }
      } else {
        console.log('   ⚠️  No sectors found, skipping decision test');
        console.log('   💡 Create a sector first to test decision making\n');
      }
    } catch (error) {
      console.log('   ❌ Error testing decision endpoint:', error.message);
      allTestsPassed = false;
    }

    // Test 5: Check for manager agents
    console.log('5. Checking for manager agents in system...');
    try {
      const agentsRes = await makeRequest('/api/agents');
      if (agentsRes.status === 200 && agentsRes.data.success) {
        const managers = agentsRes.data.data.filter(a => 
          a.role === 'manager' || a.role?.toLowerCase().includes('manager')
        );
        console.log('   📊 Manager agents found:', managers.length);
        if (managers.length > 0) {
          managers.forEach(m => {
            console.log(`      - ${m.name} (${m.id}) - Sector: ${m.sectorId || 'N/A'}`);
          });
        } else {
          console.log('   ⚠️  No manager agents found');
          console.log('   💡 Create a sector to automatically create a manager agent');
        }
        console.log('');
      }
    } catch (error) {
      console.log('   ⚠️  Could not check agents:', error.message);
    }

    // Summary
    console.log('='.repeat(60));
    if (allTestsPassed) {
      console.log('✅ All tests passed! Manager Agent system is working.');
    } else {
      console.log('⚠️  Some tests failed. Check the output above for details.');
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run tests
testManagerAgents().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

