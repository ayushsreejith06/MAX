// Load environment variables
require('dotenv').config();

const fastify = require('fastify')({ logger: true });

// Support desktop mode via environment variables
const MAX_ENV = process.env.MAX_ENV || 'web';
const PORT = process.env.MAX_PORT || process.env.PORT || (MAX_ENV === 'desktop' ? 4000 : 8000);
const HOST = MAX_ENV === 'desktop' ? '127.0.0.1' : '0.0.0.0';

// Start server
const start = async () => {
  try {
    // Register CORS plugin
    await fastify.register(require('@fastify/cors'), {
      origin: ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    });

    // Health check endpoint (used by Tauri to verify backend is ready)
    fastify.get('/health', async (request, reply) => {
      return { ok: true, status: 'ok' };
    });

    // Register routes under /api prefix - unified routing pattern
    try {
      await fastify.register(require('./routes/sectors'), { prefix: '/api/sectors' });
      fastify.log.info('✅ Routes registered: /api/sectors');
    } catch (err) {
      fastify.log.error('Error registering sectors route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/agents'), { prefix: '/api/agents' });
      fastify.log.info('✅ Routes registered: /api/agents');
    } catch (err) {
      fastify.log.error('Error registering agents route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/discussions'), { prefix: '/api/discussions' });
      fastify.log.info('✅ Routes registered: /api/discussions');
    } catch (err) {
      fastify.log.error('Error registering discussions route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/simulation'), { prefix: '/api/simulation' });
      fastify.log.info('✅ Routes registered: /api/simulation');
    } catch (err) {
      fastify.log.error('Error registering simulation route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/user'), { prefix: '/api/user' });
      fastify.log.info('✅ Routes registered: /api/user');
    } catch (err) {
      fastify.log.error('Error registering user route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/debug'), { prefix: '/debug' });
      fastify.log.info('✅ Routes registered: /debug');
    } catch (err) {
      fastify.log.error('Error registering debug route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/system'), { prefix: '/api/system' });
      fastify.log.info('✅ Routes registered: /api/system');
    } catch (err) {
      fastify.log.error('Error registering system route:', err);
      throw err;
    }

    // Bootstrap SimulationEngine
    try {
      const { getSimulationEngine } = require('./simulation/SimulationEngine');
      const simulationEngine = getSimulationEngine();
      await simulationEngine.initializeAllSectors();
      fastify.log.info('SimulationEngine initialized successfully');
    } catch (err) {
      fastify.log.error('Error initializing SimulationEngine:', err);
      // Don't throw - allow server to start even if simulation engine fails
    }

    // Bootstrap AgentRuntime
    try {
      const { getAgentRuntime } = require('./agents/runtime/agentRuntime');
      const agentRuntime = getAgentRuntime();
      await agentRuntime.initialize();
      await agentRuntime.start(3000); // Start with 3 second intervals
      fastify.log.info('AgentRuntime initialized and started successfully');
    } catch (err) {
      fastify.log.error('Error initializing AgentRuntime:', err);
      // Don't throw - allow server to start even if agent runtime fails
    }

    // Bootstrap Discussion Lifecycle (auto-discussion loop)
    try {
      const { autoDiscussionLoop } = require('./agents/discussion/discussionLifecycle');
      const discussionLoop = autoDiscussionLoop(15000); // Run every 15 seconds
      discussionLoop.start();
      fastify.log.info('Discussion lifecycle auto-loop initialized and started successfully');
      // Store reference for graceful shutdown if needed
      fastify.discussionLoop = discussionLoop;
    } catch (err) {
      fastify.log.error('Error initializing Discussion Lifecycle:', err);
      // Don't throw - allow server to start even if discussion lifecycle fails
    }

    // Bootstrap SystemOrchestrator (automatic ticks every 2 seconds)
    try {
      const SystemOrchestrator = require('./core/engines/SystemOrchestrator');
      const orchestrator = new SystemOrchestrator();
      orchestrator.start();
      fastify.log.info('SystemOrchestrator initialized and started (automatic ticks every 2 seconds)');
      // Store reference for graceful shutdown if needed
      fastify.systemOrchestrator = orchestrator;
    } catch (err) {
      fastify.log.error('Error initializing SystemOrchestrator:', err);
      // Don't throw - allow server to start even if orchestrator fails
    }

    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 MAX Backend Server listening on ${HOST}:${PORT}`);
    console.log(`📍 Environment: ${MAX_ENV}`);
    if (MAX_ENV === 'desktop') {
      console.log(`📍 App Data Directory: ${process.env.MAX_APP_DATA_DIR || 'default'}`);
    }
    console.log(`📍 Health check: http://${HOST}:${PORT}/health`);
    console.log(`📍 API Routes:`);
    console.log(`   - /api/sectors`);
    console.log(`   - /api/agents`);
    console.log(`   - /api/discussions`);
    console.log(`   - /api/simulation`);
    console.log(`   - /api/system`);
    console.log(`   - /api/user`);
    console.log(`   - /debug`);
    console.log(`📍 Simulation Engine: Initialized`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
