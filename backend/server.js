const fastify = require('fastify')({ logger: true });

const PORT = process.env.PORT || 8000;

// Register CORS plugin
fastify.register(require('@fastify/cors'));

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Register routes
fastify.register(require('./routes/sectors'), { prefix: '/sectors' });
fastify.register(require('./routes/agents'), { prefix: '/agents' });

// Start server
const start = async () => {
  try {
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
