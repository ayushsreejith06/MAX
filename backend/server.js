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
    try {
      await fastify.register(require('./routes/execution'), { prefix: '/api/execution' });
      fastify.log.info('✅ Routes registered: /api/execution');
    } catch (err) {
      fastify.log.error('Error registering execution route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/executionLogs'), { prefix: '/api' });
      fastify.log.info('✅ Routes registered: /api/executionLogs');
    } catch (err) {
      fastify.log.error('Error registering executionLogs route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/decisionLogs'), { prefix: '/api/decision-logs' });
      fastify.log.info('✅ Routes registered: /api/decision-logs');
    } catch (err) {
      fastify.log.error('Error registering decisionLogs route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/priceHistory'), { prefix: '/api/price-history' });
      fastify.log.info('✅ Routes registered: /api/price-history');
    } catch (err) {
      fastify.log.error('Error registering priceHistory route:', err);
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

    // Run checklist items migration (runs once per discussion)
    try {
      const { migrateChecklistItems } = require('./migrations/migrateChecklistItems');
      await migrateChecklistItems();
      fastify.log.info('Checklist items migration completed successfully');
    } catch (err) {
      fastify.log.error('Error running checklist items migration:', err);
      // Don't throw - allow server to start even if migration fails
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

    // Bootstrap DiscussionWatchdog (monitors and force-resolves stalled discussions)
    try {
      const DiscussionWatchdog = require('./core/DiscussionWatchdog');
      DiscussionWatchdog.start();
      fastify.log.info('DiscussionWatchdog initialized and started (monitoring IN_PROGRESS discussions)');
      // Store reference for graceful shutdown if needed
      fastify.discussionWatchdog = DiscussionWatchdog;
    } catch (err) {
      fastify.log.error('Error initializing DiscussionWatchdog:', err);
      // Don't throw - allow server to start even if watchdog fails
    }

    // Bootstrap SectorPriceSimulator (continuously updates sector prices)
    try {
      const { getSectorPriceSimulator } = require('./simulation/SectorPriceSimulator');
      const priceSimulator = getSectorPriceSimulator();
      const { getAllSectors } = require('./utils/sectorStorage');
      const PriceHistory = require('./models/PriceHistory');
      
      // Start price simulation for all existing sectors
      const allSectors = await getAllSectors();
      for (const sector of allSectors) {
        if (sector.id) {
          // Initialize price to 100 if not set
          if (typeof sector.currentPrice !== 'number' || sector.currentPrice <= 0) {
            const { updateSector } = require('./utils/sectorStorage');
            await updateSector(sector.id, { currentPrice: 100 });
          }
          
          // Start simulation
          priceSimulator.start(sector.id);
          
          // Initialize price history if empty
          const existingHistory = await PriceHistory.getBySectorId(sector.id, 1);
          if (existingHistory.length === 0) {
            const initialPrice = sector.currentPrice || 100;
            const initialPriceHistory = new PriceHistory({
              sectorId: sector.id,
              price: initialPrice,
              timestamp: Date.now()
            });
            await initialPriceHistory.save();
          }
        }
      }
      
      fastify.log.info(`SectorPriceSimulator initialized and started for ${allSectors.length} sector(s)`);
      // Store reference for graceful shutdown if needed
      fastify.priceSimulator = priceSimulator;
    } catch (err) {
      fastify.log.error('Error initializing SectorPriceSimulator:', err);
      // Don't throw - allow server to start even if price simulator fails
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
    console.log(`   - /api/execution`);
    console.log(`   - /api/executionLogs`);
    console.log(`   - /api/decision-logs`);
    console.log(`   - /api/price-history`);
    console.log(`   - /debug`);
    console.log(`📍 Simulation Engine: Initialized`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
