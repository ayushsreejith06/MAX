const { loadSectors } = require('../utils/storage');

async function collectDiscussions() {
  const sectors = await loadSectors();
  const discussions = [];

  sectors.forEach((sector) => {
    if (Array.isArray(sector.discussions)) {
      discussions.push(...sector.discussions);
    }
  });

  return discussions;
}

module.exports = function (fastify, opts, done) {
  const handler = async (req, reply) => {
    try {
      const discussions = await collectDiscussions();
      reply.send(discussions);
    } catch (error) {
      fastify.log.error('Failed to load discussions', error);
      reply.status(500).send({ error: 'Failed to load discussions' });
    }
  };

  // GET /api/discussions - Fetch all discussions
  fastify.get('/', handler);

  done();
};

