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
      origin: true
    });

    // Health check endpoint (used by Tauri to verify backend is ready)
    fastify.get('/health', async (request, reply) => {
      return { ok: true, status: 'ok' };
    });

    // Register routes under /api prefix
    await fastify.register(require('./routes/sectors'), { prefix: '/api/sectors' });
    try {
      await fastify.register(require('./routes/agents'), { prefix: '/api/agents' });
      fastify.log.info('Agents route registered successfully');
    } catch (err) {
      fastify.log.error('Error registering agents route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/research'), { prefix: '/api/research' });
      fastify.log.info('Research route registered successfully');
    } catch (err) {
      fastify.log.error('Error registering research route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/debates'), { prefix: '/api/debates' });
      fastify.log.info('Debates route registered successfully');
    } catch (err) {
      fastify.log.error('Error registering debates route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/discussions'), { prefix: '/api/discussions' });
      fastify.log.info('Discussions route registered successfully');
    } catch (err) {
      fastify.log.error('Error registering discussions route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/mnee'), { prefix: '/api/mnee' });
      fastify.log.info('MNEE route registered successfully');
    } catch (err) {
      fastify.log.error('Error registering MNEE route:', err);
      throw err;
    }
    try {
      await fastify.register(require('./routes/manager'), { prefix: '/api/manager' });
      fastify.log.info('Manager route registered successfully');
    } catch (err) {
      fastify.log.error('Error registering manager route:', err);
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

    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 MAX Backend Server listening on ${HOST}:${PORT}`);
    console.log(`📍 Environment: ${MAX_ENV}`);
    if (MAX_ENV === 'desktop') {
      console.log(`📍 App Data Directory: ${process.env.MAX_APP_DATA_DIR || 'default'}`);
    }
    console.log(`📍 Health check: http://${HOST}:${PORT}/health`);
    console.log(`📍 Sectors API: http://${HOST}:${PORT}/api/sectors`);
    console.log(`📍 Agents API: http://${HOST}:${PORT}/api/agents`);
    console.log(`📍 Research API: http://${HOST}:${PORT}/api/research`);
    console.log(`📍 Debates API: http://${HOST}:${PORT}/api/debates`);
    console.log(`📍 Discussions API: http://${HOST}:${PORT}/api/discussions`);
    console.log(`📍 MNEE API: http://${HOST}:${PORT}/api/mnee`);
    console.log(`📍 Manager API: http://${HOST}:${PORT}/api/manager`);
    console.log(`📍 Simulation Engine: Initialized`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
