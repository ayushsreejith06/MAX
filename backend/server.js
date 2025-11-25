const express = require('express');
const cors = require('cors');
const sectorsRoutes = require('./routes/sectors');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/sectors', sectorsRoutes);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MAX Backend Server listening on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Sectors API: http://localhost:${PORT}/sectors`);
});
