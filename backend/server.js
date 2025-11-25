const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const { createAgent } = require('./agents/pipeline/createAgent');

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const sectorsRoutes = require('./routes/sectors');
app.use('/sectors', sectorsRoutes);

// Create agent endpoint
app.post('/agents/create', async (req, res) => {
  try {
    const { promptText, sectorId } = req.body;
    
    if (!promptText) {
      return res.status(400).json({ 
        error: 'promptText is required' 
      });
    }
    
    const agent = await createAgent(promptText, sectorId || null);
    
    return res.status(201).json({
      success: true,
      agent: agent.getSummary()
    });
  } catch (error) {
    console.error('Error creating agent:', error);
    return res.status(500).json({ 
      error: 'Failed to create agent',
      message: error.message 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`MAX Backend server running on port ${PORT}`);
});

module.exports = app;
