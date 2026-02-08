require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDB, getState, setState } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// GET /api/state — return stored state
app.get('/api/state', async (req, res) => {
  try {
    const state = await getState();
    res.json(state);
  } catch (err) {
    console.error('GET /api/state error:', err.message);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

// PUT /api/state — upsert full state
app.put('/api/state', async (req, res) => {
  try {
    await setState(req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/state error:', err.message);
    res.status(500).json({ error: 'Failed to save state' });
  }
});

async function start() {
  try {
    await initDB();
    console.log('Database initialized');
  } catch (err) {
    console.warn('Database not available, running without persistence:', err.message);
  }
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
