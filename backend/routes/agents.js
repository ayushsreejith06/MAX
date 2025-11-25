const express = require('express');
const router = express.Router();
const { getAgents } = require('../controllers/agentsController');
const { createAgent } = require('../agents/pipeline/createAgent');

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

router.post('/create', async (req, res) => {
  try {
    const { prompt, sectorId } = req.body;
    
    if (!prompt) {
      log(`POST /agents/create - Missing required field: prompt`);
      return res.status(400).json({
        success: false,
        error: 'Missing required field: prompt'
      });
    }
    
    log(`POST /agents/create - Creating agent with prompt: ${prompt.substring(0, 50)}...`);
    const agent = await createAgent(prompt, sectorId || null);
    log(`Agent created successfully with ID: ${agent.id}`);
    
    res.status(201).json({
      success: true,
      data: agent.toJSON()
    });
  } catch (error) {
    log(`Error creating agent: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
