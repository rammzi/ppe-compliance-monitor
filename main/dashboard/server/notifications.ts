import nodemailer from 'nodemailer';
import twilio from 'twilio';
import db from './db.js';

interface ViolationAlert {
  workerId: string;
  violationType: string;
  severity: string;
}

function getConfig(): any {
  return db.prepare('SELECT * FROM alert_config WHERE id = 1').get();
}

export async function sendEmailAlert(violation: ViolationAlert): Promise<void> {
  const cfg = getConfig();
  if (!cfg.email_enabled || !cfg.email_recipients || !cfg.email_smtp_host) {
    throw new Error('Email not configured');
  }

  const transporter = nodemailer.createTransport({
    host: cfg.email_smtp_host,
    port: cfg.email_smtp_port,
    secure: cfg.email_smtp_port === 465,
    auth: {
      user: cfg.email_smtp_user,
      pass: cfg.email_smtp_pass,
    },
  });

  const recipients = cfg.email_recipients.split(',').map((r: string) => r.trim()).filter(Boolean);
  const severityColor = violation.severity === 'critical' ? '#FF1744' : violation.severity === 'high' ? '#FF5252' : '#FFB300';

  await transporter.sendMail({
    from: `"PPE Safety System" <${cfg.email_smtp_user}>`,
    to: recipients.join(', '),
    subject: `[PPE ALERT] ${violation.severity.toUpperCase()} - ${violation.violationType}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1A1C1E; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: ${severityColor}; margin: 0;">⚠️ PPE Safety Violation Detected</h2>
        </div>
        <div style="background: #232529; padding: 20px; border-radius: 0 0 8px 8px; color: #fff;">
          <table style="width:100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; color: #aaa;">Worker ID</td><td style="padding: 8px;">${violation.workerId}</td></tr>
            <tr><td style="padding: 8px; color: #aaa;">Violation</td><td style="padding: 8px; color: ${severityColor};">${violation.violationType}</td></tr>
            <tr><td style="padding: 8px; color: #aaa;">Severity</td><td style="padding: 8px;">${violation.severity.toUpperCase()}</td></tr>
            <tr><td style="padding: 8px; color: #aaa;">Time</td><td style="padding: 8px;">${new Date().toLocaleString()}</td></tr>
            <tr><td style="padding: 8px; color: #aaa;">Camera</td><td style="padding: 8px;">CAM-01 • MAIN GATE</td></tr>
          </table>
          <p style="color: #888; font-size: 12px; margin-top: 20px;">PPE Command Center — Automated Safety Alert</p>
        </div>
      </div>
    `,
  });
}

export async function sendSMSAlert(violation: ViolationAlert): Promise<void> {
  const cfg = getConfig();
  if (!cfg.sms_enabled || !cfg.sms_recipients || !cfg.twilio_account_sid) {
    throw new Error('SMS not configured');
  }

  const client = twilio(cfg.twilio_account_sid, cfg.twilio_auth_token);
  const recipients = cfg.sms_recipients.split(',').map((r: string) => r.trim()).filter(Boolean);
  const message = `[PPE ALERT] ${violation.severity.toUpperCase()}: ${violation.violationType} detected for Worker ${violation.workerId} at ${new Date().toLocaleTimeString()}. Camera: CAM-01`;

  for (const recipient of recipients) {
    await client.messages.create({
      body: message,
      from: cfg.twilio_from_number,
      to: recipient,
    });
  }
}
