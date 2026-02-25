import express from 'express';
import cors from 'cors';
import { chatHandler } from './chat.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/chat', chatHandler);

app.listen(PORT, () => {
  console.log(`Gratitude API server running on http://localhost:${PORT}`);
});
