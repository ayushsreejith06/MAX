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

    // Register routes
    await fastify.register(require('./routes/sectors'), { prefix: '/sectors' });
    await fastify.register(require('./routes/agents'), { prefix: '/agents' });

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 MAX Backend Server listening on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📍 Sectors API: http://localhost:${PORT}/sectors`);
    console.log(`📍 Agents API: http://localhost:${PORT}/agents`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
