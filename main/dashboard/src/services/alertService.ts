import { apiClient } from './apiClient';

export interface AlertConfig {
  audioEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  cooldownSeconds: number;
}

let config: AlertConfig = {
  audioEnabled: true,
  emailEnabled: false,
  smsEnabled: false,
  cooldownSeconds: 60,
};

let audioCtx: AudioContext | null = null;
let lastAlertTime = 0;

export function setAlertConfig(cfg: Partial<AlertConfig>): void {
  config = { ...config, ...cfg };
}

export function getAlertConfig(): AlertConfig {
  return { ...config };
}

function getAudio(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export function playAlarm(): void {
  if (!config.audioEnabled) return;

  const ctx = getAudio();
  const now = ctx.currentTime;

  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now + i * 0.35);
    osc.frequency.setValueAtTime(660, now + i * 0.35 + 0.15);

    gain.gain.setValueAtTime(0.25, now + i * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.35 + 0.3);

    osc.start(now + i * 0.35);
    osc.stop(now + i * 0.35 + 0.3);
  }
}

export async function triggerAlert(violation: {
  workerId: string;
  violationType: string;
  severity: string;
}): Promise<void> {
  const now = Date.now();
  if (now - lastAlertTime < config.cooldownSeconds * 1000) return;
  lastAlertTime = now;

  playAlarm();

  if (config.emailEnabled) {
    apiClient.post('/alerts/email', violation).catch(e =>
      console.warn('Email alert failed:', e.message)
    );
  }

  if (config.smsEnabled) {
    // Send push notification via ntfy.sh
    const stored = localStorage.getItem('ppe_alert_config');
    const ntfyTopic = stored ? JSON.parse(stored).ntfy_topic : null;
    if (ntfyTopic) {
      fetch(`https://ntfy.sh/${ntfyTopic}`, {
        method: 'POST',
        body: `⚠️ PPE Violation: ${violation.violationType} — Worker ${violation.workerId}`,
        headers: {
          Title: 'Safety Violation Detected',
          Priority: violation.severity === 'critical' ? 'urgent' : 'high',
          Tags: 'warning,construction_worker',
        },
      }).catch(() => {});
    }
  }
}
