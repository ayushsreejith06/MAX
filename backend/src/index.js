import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'max-backend' });
});

// API routes placeholder
app.get('/api', (req, res) => {
  res.json({ message: 'MAX Backend API' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

