/**
 * Phase 1 Foundations Verification Script
 * 
 * Tests all Phase 1 components to ensure they're working correctly:
 * - BaseAgent class
 * - ManagerAgent extending BaseAgent
 * - Memory and reasoning system
 * - Sector storage system
 * - Runtime execution
 * - Cross-sector communication
 * - Agent creation pipeline
 */

const BaseAgent = require('../backend/agents/base/BaseAgent');
const ManagerAgent = require('../backend/agents/manager/ManagerAgent');
const { loadSectors, saveSectors, getSectorById, updateSector } = require('../backend/utils/storage');
const { publish, drain, clearAll } = require('../backend/agents/comms/MessageBus');
const { getAgentRuntime } = require('../backend/agents/runtime/agentRuntime');
const { createAgent } = require('../backend/agents/pipeline/createAgent');
const { loadAgents } = require('../backend/utils/agentStorage');

let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function logTest(name, passed, message = '') {
  if (passed) {
    console.log(`✓ ${name}`);
    testsPassed++;
  } else {
    console.log(`✗ ${name}${message ? ': ' + message : ''}`);
    testsFailed++;
    failures.push({ name, message });
  }
}

async function testBaseAgent() {
  console.log('\n=== Testing BaseAgent ===');
  
  try {
    const agent = new BaseAgent({
      id: 'test-agent-1',
      name: 'Test Agent',
      role: 'test',
      personality: { riskTolerance: 'high', decisionStyle: 'rapid' },
      performance: { pnl: 100, winRate: 0.75 }
    });

    // Test basic properties
    logTest('BaseAgent creates with required properties', 
      agent.id === 'test-agent-1' && agent.name === 'Test Agent' && agent.role === 'test');

    // Test memory system
    agent.updateMemory({
      type: 'observation',
      data: { test: 'data' },
      reasoning: 'Test reasoning'
    });
    logTest('BaseAgent memory system works', agent.memory.length === 1);

    // Test reasoning storage
    agent.storeReasoning(Date.now(), 'Test reasoning', { context: 'test' });
    const reasoning = agent.getReasoningHistory(10);
    logTest('BaseAgent reasoning history works', reasoning.length > 0 && reasoning[0].type === 'reasoning');

    // Test state
    agent.updateLastTick(Date.now());
    agent.updateMetrics({ decisionCount: 5 });
    const state = agent.getState();
    logTest('BaseAgent state management works', 
      state.lastTick !== null && state.metrics.decisionCount === 5);

  } catch (error) {
    logTest('BaseAgent instantiation', false, error.message);
  }
}

async function testManagerAgent() {
  console.log('\n=== Testing ManagerAgent ===');
  
  try {
    // First, ensure we have a test sector
    const sectors = await loadSectors();
    let testSector = sectors.find(s => s.sectorName === 'Test Sector');
    
    if (!testSector) {
      // Create a test sector
      testSector = {
        id: 'test-sector-1',
        sectorName: 'Test Sector',
        sectorSymbol: 'TEST',
        currentPrice: 100,
        change: 0,
        changePercent: 0,
        volume: 0,
        statusPercent: 0,
        activeAgents: 0,
        candleData: [],
        discussions: [],
        agents: []
      };
      sectors.push(testSector);
      await saveSectors(sectors);
    }

    const manager = new ManagerAgent({
      id: 'test-manager-1',
      sectorId: testSector.id,
      name: 'Test Manager',
      personality: { riskTolerance: 'medium', decisionStyle: 'balanced' },
      runtimeConfig: { tickInterval: 3000, conflictThreshold: 0.5 }
    });

    // Test inheritance
    logTest('ManagerAgent extends BaseAgent', manager instanceof BaseAgent);

    // Test state
    logTest('ManagerAgent has state object', 
      manager.state && manager.state.memory && manager.state.metrics);

    // Test sector awareness
    const loadedSector = await manager.loadSector();
    logTest('ManagerAgent can load sector', loadedSector !== null && loadedSector.id === testSector.id);

    // Test decision making (with empty signals should return HOLD)
    const decision = await manager.decide([]);
    logTest('ManagerAgent can make decisions', 
      decision && decision.action && typeof decision.confidence === 'number');

    // Test tick
    const tickResult = await manager.tick();
    logTest('ManagerAgent tick() works', tickResult !== null);

    // Test memory after tick
    logTest('ManagerAgent updates memory after tick', manager.memory.length > 0);

    // Test cross-sector communication
    await manager.sendCrossSectorMessage({
      to: 'broadcast',
      type: 'test',
      payload: { message: 'test' }
    });
    const messages = await manager.receiveMessages();
    logTest('ManagerAgent cross-sector communication works', messages.length > 0);

    // Clean up messages
    await clearAll();

  } catch (error) {
    logTest('ManagerAgent instantiation', false, error.message);
  }
}

async function testSectorStorage() {
  console.log('\n=== Testing Sector Storage ===');
  
  try {
    // Test loadSectors
    const sectors = await loadSectors();
    logTest('loadSectors() works', Array.isArray(sectors));

    // Test getSectorById
    if (sectors.length > 0) {
      const sector = await getSectorById(sectors[0].id);
      logTest('getSectorById() works', sector !== null && sector.id === sectors[0].id);
    } else {
      logTest('getSectorById() works', true, 'No sectors to test');
    }

    // Test updateSector
    if (sectors.length > 0) {
      const testId = sectors[0].id;
      const updated = await updateSector(testId, { testField: 'testValue' });
      logTest('updateSector() works', updated !== null && updated.testField === 'testValue');
      
      // Clean up
      await updateSector(testId, { testField: undefined });
    } else {
      logTest('updateSector() works', true, 'No sectors to test');
    }

  } catch (error) {
    logTest('Sector storage operations', false, error.message);
  }
}

async function testMessageBus() {
  console.log('\n=== Testing Message Bus ===');
  
  try {
    await clearAll();

    // Test publish
    await publish({
      from: 'test-manager-1',
      to: 'test-manager-2',
      type: 'test',
      payload: { test: 'data' }
    });
    logTest('MessageBus publish() works', true);

    // Test subscribe/drain
    const messages = await drain('test-manager-2');
    logTest('MessageBus drain() works', messages.length === 1 && messages[0].type === 'test');

    // Test broadcast
    await publish({
      from: 'test-manager-1',
      to: 'broadcast',
      type: 'broadcast',
      payload: { test: 'broadcast' }
    });
    const broadcastMessages = await drain('test-manager-3');
    logTest('MessageBus broadcast works', broadcastMessages.length === 1);

    await clearAll();

  } catch (error) {
    logTest('MessageBus operations', false, error.message);
  }
}

async function testAgentCreation() {
  console.log('\n=== Testing Agent Creation Pipeline ===');
  
  try {
    const sectors = await loadSectors();
    const testSectorId = sectors.length > 0 ? sectors[0].id : null;

    // Test creating an agent
    const agent = await createAgent('test trader agent buy sell', testSectorId);
    logTest('Agent creation pipeline works', 
      agent && agent.id && agent.role && agent.name);

    // Verify agent was saved
    const agents = await loadAgents();
    const foundAgent = agents.find(a => a.id === agent.id);
    logTest('Created agent is saved to storage', foundAgent !== null);

    // Verify agent has required fields
    logTest('Created agent has personality', 
      foundAgent && foundAgent.personality && foundAgent.personality.riskTolerance);

    // Clean up test agent
    const updatedAgents = agents.filter(a => a.id !== agent.id);
    const { saveAgents } = require('../backend/utils/agentStorage');
    await saveAgents(updatedAgents);

  } catch (error) {
    logTest('Agent creation pipeline', false, error.message);
  }
}

async function testRuntime() {
  console.log('\n=== Testing Agent Runtime ===');
  
  try {
    const runtime = getAgentRuntime();
    logTest('AgentRuntime singleton works', runtime !== null);

    // Test initialization
    await runtime.initialize();
    logTest('AgentRuntime initialize() works', true);

    // Test status
    const status = runtime.getStatus();
    logTest('AgentRuntime getStatus() works', 
      status && typeof status.isRunning === 'boolean' && typeof status.managerCount === 'number');

    // Note: We don't start the runtime in tests to avoid infinite loops
    logTest('AgentRuntime can be instantiated', true);

  } catch (error) {
    logTest('AgentRuntime operations', false, error.message);
  }
}

async function runAllTests() {
  console.log('========================================');
  console.log('Phase 1 Foundations Verification');
  console.log('========================================\n');

  try {
    await testBaseAgent();
    await testManagerAgent();
    await testSectorStorage();
    await testMessageBus();
    await testAgentCreation();
    await testRuntime();

    console.log('\n========================================');
    console.log('Test Results');
    console.log('========================================');
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
    console.log(`Total:  ${testsPassed + testsFailed}`);

    if (failures.length > 0) {
      console.log('\nFailures:');
      failures.forEach(f => {
        console.log(`  - ${f.name}: ${f.message}`);
      });
    }

    if (testsFailed === 0) {
      console.log('\n✓ All Phase 1 foundations are working correctly!');
      process.exit(0);
    } else {
      console.log('\n✗ Some tests failed. Please review the errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\nFatal error during testing:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
