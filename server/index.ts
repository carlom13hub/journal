import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { chatHandler } from './chat.js';
import { initDB } from './db.js';
import {
  getAllEntries, getEntryById, saveEntry, deleteEntry,
  deleteAllData, getStreak, exportData, importData,
} from './entries.js';
import { getProfile, saveProfile } from './profile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Chat (Claude AI proxy)
app.post('/api/chat', chatHandler);

// Entries
app.get('/api/entries', getAllEntries);
app.delete('/api/entries', deleteAllData);
app.get('/api/entries/:id', getEntryById);
app.post('/api/entries', saveEntry);
app.delete('/api/entries/:id', deleteEntry);

// Streak
app.get('/api/streak', getStreak);

// Profile
app.get('/api/profile', getProfile);
app.put('/api/profile', saveProfile);

// Import / Export
app.get('/api/export', exportData);
app.post('/api/import', importData);

// Serve static frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Initialize DB then start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Gratitude API server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
