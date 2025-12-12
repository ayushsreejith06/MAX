/**
 * Execution Logs routes - Handle execution log queries
 */

const ExecutionLog = require('../models/ExecutionLog');

function log(message) {
  console.log(`[ExecutionLogs] ${message}`);
}

module.exports = async (fastify) => {
  /**
   * GET /api/executionLogs?sectorId=xxx
   * 
   * Get execution logs for a sector, sorted by timestamp DESC.
   * 
   * Query params:
   *   sectorId: string (required)
   * 
   * Output:
   *   {
   *     success: boolean,
   *     logs: Array<ExecutionLog>
   *   }
   */
  fastify.get('/executionLogs', async (request, reply) => {
    try {
      const { sectorId } = request.query;

      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId query parameter is required'
        });
      }

      log(`Fetching execution logs for sector ${sectorId}`);

      const logs = await ExecutionLog.getBySectorId(sectorId);

      return reply.status(200).send({
        success: true,
        logs: logs.map(log => log.toJSON())
      });
    } catch (error) {
      log(`Error fetching execution logs: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/executionLogs/all
   * 
   * Get all execution logs with filters and pagination.
   * 
   * Query params:
   *   sectorId?: string - Filter by sector ID
   *   managerId?: string - Filter by manager ID
   *   discussionId?: string - Filter by discussion ID
   *   startTime?: number - Start timestamp (inclusive)
   *   endTime?: number - End timestamp (inclusive)
   *   page?: number - Page number (default: 1)
   *   pageSize?: number - Items per page (default: 20)
   * 
   * Output:
   *   {
   *     success: boolean,
   *     logs: Array<ExecutionLog>,
   *     pagination: {
   *       page: number,
   *       pageSize: number,
   *       total: number,
   *       totalPages: number
   *     }
   *   }
   */
  fastify.get('/executionLogs/all', async (request, reply) => {
    try {
      const { sectorId, managerId, discussionId, startTime, endTime, page, pageSize } = request.query;

      const filters = {};
      if (sectorId) filters.sectorId = sectorId;
      if (managerId) filters.managerId = managerId;
      if (discussionId) filters.discussionId = discussionId;
      if (startTime) filters.startTime = parseInt(startTime, 10);
      if (endTime) filters.endTime = parseInt(endTime, 10);
      if (page) filters.page = parseInt(page, 10);
      if (pageSize) filters.pageSize = parseInt(pageSize, 10);

      log(`Fetching all execution logs with filters:`, filters);

      const result = await ExecutionLog.getAll(filters);

      return reply.status(200).send({
        success: true,
        ...result
      });
    } catch (error) {
      log(`Error fetching all execution logs: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};



