const { getSystemMode } = require('../core/SystemMode');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // GET /system/mode - Get current system mode
  fastify.get('/mode', async (request, reply) => {
    try {
      const systemMode = getSystemMode();
      const mode = systemMode.getMode();
      
      return reply.status(200).send({
        success: true,
        mode: mode
      });
    } catch (error) {
      log(`Error getting system mode: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /system/mode - Set system mode
  fastify.post('/mode', async (request, reply) => {
    try {
      const { mode } = request.body;
      
      if (!mode) {
        return reply.status(400).send({
          success: false,
          error: 'mode is required in request body'
        });
      }

      if (mode !== 'simulation' && mode !== 'realtime') {
        return reply.status(400).send({
          success: false,
          error: 'mode must be "simulation" or "realtime"'
        });
      }

      log(`POST /system/mode - Setting mode to ${mode}`);

      const systemMode = getSystemMode();
      systemMode.setMode(mode);
      
      return reply.status(200).send({
        success: true,
        mode: systemMode.getMode()
      });
    } catch (error) {
      log(`Error setting system mode: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};


