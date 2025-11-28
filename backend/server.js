const fastify = require('fastify')({ logger: true });
const PORT = process.env.PORT || 8000;

// Start server
const start = async () => {
  try {
    // Register CORS plugin
    await fastify.register(require('@fastify/cors'), {
      origin: true
    });

    // Health check endpoint
    fastify.get('/health', async (request, reply) => {
      return { status: 'ok' };
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

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 MAX Backend Server listening on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📍 Sectors API: http://localhost:${PORT}/api/sectors`);
    console.log(`📍 Agents API: http://localhost:${PORT}/api/agents`);
    console.log(`📍 Research API: http://localhost:${PORT}/api/research`);
    console.log(`📍 Debates API: http://localhost:${PORT}/api/debates`);
    console.log(`📍 Discussions API: http://localhost:${PORT}/api/discussions`);
    console.log(`📍 MNEE API: http://localhost:${PORT}/api/mnee`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
