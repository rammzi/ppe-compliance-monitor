import axios from 'axios';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import db from './db.js';
import { sendEmailAlert, sendSMSAlert } from './notifications.js';

const app = express();

// --- CONFIGURATION ---
// We pull these from .env to keep the architecture professional and secure
const PORT = process.env.PORT || 3001;
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:5000/predict';

app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json({ limit: '50mb' })); // High limit for Base64 image frames

// ─── VIOLATION LOGS ───────────────────────────────────────────────

app.get('/api/logs', (req, res) => {
  const { limit = 100, offset = 0, from, to } = req.query as Record<string, string>;
  const params: (string | number)[] = [];
  let filter = '';

  if (from) { filter += ' AND timestamp >= ?'; params.push(from); }
  if (to)   { filter += ' AND timestamp <= ?'; params.push(to); }

  params.push(Number(limit), Number(offset));
  const logs = db.prepare(
    `SELECT * FROM violation_logs WHERE 1=1${filter} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  ).all(...params);

  res.json(logs);
});

app.post('/api/logs', (req, res) => {
  const { timestamp, worker_id, violation_type, confidence, severity, confirmed, camera } = req.body;
  const result = db.prepare(
    `INSERT INTO violation_logs (timestamp, worker_id, violation_type, confidence, severity, confirmed, camera)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    timestamp || new Date().toISOString(),
    worker_id || 'Unknown',
    violation_type,
    confidence || 0,
    severity || 'medium',
    confirmed ? 1 : 0,
    camera || 'CAM-01'
  );
  res.json({ id: result.lastInsertRowid });
});

// ─── STATISTICS & ANALYTICS ───────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const params: string[] = [];
  let filter = '';

  if (from) { filter += ' AND timestamp >= ?'; params.push(from); }
  if (to)   { filter += ' AND timestamp <= ?'; params.push(to); }

  const totalLogs = (db.prepare(
    `SELECT COUNT(*) as count FROM violation_logs WHERE 1=1${filter}`
  ).get(...params) as any).count;

  const confirmedViolations = (db.prepare(
    `SELECT COUNT(*) as count FROM violation_logs WHERE confirmed = 1${filter}`
  ).get(...params) as any).count;

  const byType = db.prepare(
    `SELECT violation_type, COUNT(*) as count FROM violation_logs WHERE 1=1${filter} GROUP BY violation_type ORDER BY count DESC LIMIT 10`
  ).all(...params);

  const bySeverity = db.prepare(
    `SELECT severity, COUNT(*) as count FROM violation_logs WHERE 1=1${filter} GROUP BY severity`
  ).all(...params);

  const timeline = db.prepare(
    `SELECT strftime('%Y-%m-%d %H:00', timestamp) as hour,
            COUNT(*) as total,
            SUM(CASE WHEN confirmed=1 THEN 1 ELSE 0 END) as violations
     FROM violation_logs WHERE 1=1${filter}
     GROUP BY hour ORDER BY hour DESC LIMIT 48`
  ).all(...params);

  const workerStats = db.prepare(
    `SELECT worker_id,
            COUNT(*) as total_events,
            SUM(CASE WHEN confirmed=1 THEN 1 ELSE 0 END) as violations
     FROM violation_logs WHERE 1=1${filter}
     GROUP BY worker_id ORDER BY violations DESC LIMIT 20`
  ).all(...params);

  res.json({ totalLogs, confirmedViolations, byType, bySeverity, timeline, workerStats });
});

// ─── ALERT CONFIGURATION ──────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  const config = db.prepare('SELECT * FROM alert_config WHERE id = 1').get() as any;
  const { email_smtp_pass, twilio_auth_token, ...safeConfig } = config;
  res.json(safeConfig);
});

app.put('/api/config', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const fields = Object.keys(body).map(k => `${k} = ?`).join(', ');
  const values = Object.values(body);
  db.prepare(`UPDATE alert_config SET ${fields} WHERE id = 1`).run(...values);
  res.json({ success: true });
});

// ─── NOTIFICATION DISPATCH ────────────────────────────────────────

app.post('/api/alerts/email', async (req, res) => {
  try {
    await sendEmailAlert(req.body);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/alerts/sms', async (req, res) => {
  try {
    await sendSMSAlert(req.body);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── AI INFERENCE PROXY (LOCAL MICROSERVICE) ──────────────────────

app.post('/api/inference', async (req, res) => {
  const { imageBase64, confidence } = req.body;
  
  try {
    // We now point to the local AI Engine URL defined in the .env configuration
    const response = await axios({
      method: "POST",
      url: AI_ENGINE_URL, 
      data: {
        image: imageBase64,
        confidence: confidence / 100 // Convert UI slider (0-100) to AI decimal (0-1)
      },
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 2000 // Prevents the dashboard from hanging if the AI engine is down
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Local AI Proxy Error:", error.message);
    res.status(503).json({ error: "AI Engine is currently unavailable. Please ensure ai_engine.py is running." });
  }
});

// ─── STARTUP ──────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(` PPE Safety Backend online: http://localhost:${PORT}`);
  console.log(` AI Engine targeted at: ${AI_ENGINE_URL}`);
});