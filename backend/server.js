const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const sectorsRoutes = require('./routes/sectors');
app.use('/sectors', sectorsRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`MAX Backend server running on port ${PORT}`);
});

module.exports = app;
