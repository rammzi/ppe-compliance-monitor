import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'ppe_safety.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS violation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    worker_id TEXT DEFAULT 'Unknown',
    violation_type TEXT NOT NULL,
    confidence REAL DEFAULT 0,
    severity TEXT DEFAULT 'medium',
    confirmed INTEGER DEFAULT 0,
    camera TEXT DEFAULT 'CAM-01'
  );

  CREATE TABLE IF NOT EXISTS alert_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    audio_enabled INTEGER DEFAULT 1,
    email_enabled INTEGER DEFAULT 0,
    email_recipients TEXT DEFAULT '',
    email_smtp_host TEXT DEFAULT 'smtp.gmail.com',
    email_smtp_port INTEGER DEFAULT 587,
    email_smtp_user TEXT DEFAULT '',
    email_smtp_pass TEXT DEFAULT '',
    sms_enabled INTEGER DEFAULT 0,
    sms_recipients TEXT DEFAULT '',
    twilio_account_sid TEXT DEFAULT '',
    twilio_auth_token TEXT DEFAULT '',
    twilio_from_number TEXT DEFAULT '',
    cooldown_seconds INTEGER DEFAULT 60
  );

  INSERT OR IGNORE INTO alert_config (id) VALUES (1);
`);

export default db;
