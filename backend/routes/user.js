const { getBalance } = require('../utils/userAccount');

module.exports = async (fastify) => {
  // GET /api/user/balance - Get user account balance
  fastify.get('/balance', async (request, reply) => {
    try {
      const balance = await getBalance();
      return reply.status(200).send({ balance });
    } catch (error) {
      return reply.status(500).send({
        error: error.message
      });
    }
  });
};

