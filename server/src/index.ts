import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { pool } from './db/index.js';
import { ingestSachetFeed } from './services/sachet.js';
import { ingestSentinelProducts } from './services/sentinel.js';
import { ingestWrisCsv } from './services/wris.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', database: 'connected', time: result.rows[0].now });
  } catch (err: any) {
    console.error('Database connection error:', err);
    res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
  }
});

app.get('/api/villages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM villages ORDER BY village_name ASC');
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM active_alert_villages');
    res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ingest/sachet', async (req, res) => {
  const result = await ingestSachetFeed();
  res.status(result.success ? 200 : 500).json(result);
});

app.post('/api/ingest/sentinel', async (req, res) => {
  const result = await ingestSentinelProducts();
  res.status(result.success ? 200 : 500).json(result);
});

app.post('/api/ingest/wris', async (req, res) => {
  const result = await ingestWrisCsv();
  res.status(result.success ? 200 : 500).json(result);
});

// Run SACHET feed ingestion automatically every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('[CRON] Running scheduled SACHET ingestion...');
  await ingestSachetFeed();
});

// Run Sentinel-1 metadata ingestion automatically every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('[CRON] Running scheduled Sentinel-1 ingestion...');
  await ingestSentinelProducts();
});

app.listen(PORT, () => {
  console.log(`CascadeGuard backend running on port ${PORT}`);
});