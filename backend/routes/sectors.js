const express = require('express');
const router = express.Router();
const { createSector, getSectors, getSectorById } = require('../controllers/sectorsController');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

router.get('/', async (req, res) => {
  try {
    log(`GET /sectors - Fetching all sectors`);
    const sectors = await getSectors();
    log(`Found ${sectors.length} sectors`);
    res.status(200).json({
      success: true,
      data: sectors
    });
  } catch (error) {
    log(`Error fetching sectors: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    log(`GET /sectors/${id} - Fetching sector by ID`);
    
    const sector = await getSectorById(id);
    
    if (!sector) {
      log(`Sector with ID ${id} not found`);
      return res.status(404).json({
        success: false,
        error: 'Sector not found'
      });
    }
    
    log(`Found sector - ID: ${sector.id}, Name: ${sector.name}`);
    res.status(200).json({
      success: true,
      data: sector
    });
  } catch (error) {
    log(`Error fetching sector: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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

