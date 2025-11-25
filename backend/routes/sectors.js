const express = require('express');
const router = express.Router();
const { createSector } = require('../controllers/sectorsController');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    log(`POST /sectors - Creating sector with name: ${name}`);

    const sector = await createSector(name);

    log(`Sector created successfully - ID: ${sector.id}, Name: ${sector.name}`);

    res.status(201).json({
      success: true,
      data: sector.toJSON()
    });
  } catch (error) {
    log(`Error creating sector: ${error.message}`);

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

