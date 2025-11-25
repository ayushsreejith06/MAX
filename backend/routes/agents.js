const express = require('express');
const router = express.Router();
const { getAgents } = require('../controllers/agentsController');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

router.get('/', async (req, res) => {
  try {
    log(`GET /agents - Fetching all agents`);
    const agents = await getAgents();
    log(`Found ${agents.length} agents`);
    res.status(200).json({
      success: true,
      data: agents
    });
  } catch (error) {
    log(`Error fetching agents: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
