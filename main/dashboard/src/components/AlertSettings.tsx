import React, { useState, useEffect } from 'react';
import { apiClient } from '@/services/apiClient';
import { setAlertConfig, playAlarm } from '@/services/alertService';
import { Rule, getSeverityColor } from '@/services/ruleEngine';
import { Bell, Mail, Smartphone, Volume2, Save, TestTube, Shield, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
    <h3 className="text-slate-700 text-sm font-semibold mb-4 flex items-center gap-2">
      <span className="text-blue-600">{icon}</span>
      {title}
    </h3>
    {children}
  </div>
);

const Toggle: React.FC<{ on: boolean; onClick: () => void }> = ({ on, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'relative w-10 h-5 rounded-full transition-colors duration-200',
      on ? 'bg-blue-600' : 'bg-slate-200'
    )}
  >
    <span className={cn(
      'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
      on ? 'translate-x-5' : 'translate-x-0.5'
    )} />
  </button>
);

interface SimpleConfig {
  audio_enabled: boolean;
  cooldown_seconds: number;
  email_enabled: boolean;
  email_recipients: string;
  email_smtp_user: string;
  email_smtp_pass: string;
  ntfy_enabled: boolean;
  ntfy_topic: string;
}

interface AlertSettingsProps {
  rules: Rule[];
  onRulesChange: (rules: Rule[]) => void;
}

export const AlertSettings: React.FC<AlertSettingsProps> = ({ rules, onRulesChange }) => {
  const [cfg, setCfg] = useState<SimpleConfig>({
    audio_enabled: true,
    cooldown_seconds: 60,
    email_enabled: false,
    email_recipients: '',
    email_smtp_user: '',
    email_smtp_pass: '',
    ntfy_enabled: false,
    ntfy_topic: '',
  });
  const [saved, setSaved] = useState(false);
  const [ntfyTested, setNtfyTested] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('ppe_alert_config');
    if (stored) {
      try { setCfg(JSON.parse(stored)); } catch {}
    }
  }, []);

  useEffect(() => {
    setAlertConfig({
      audioEnabled: cfg.audio_enabled,
      emailEnabled: cfg.email_enabled,
      smsEnabled: cfg.ntfy_enabled,
      cooldownSeconds: cfg.cooldown_seconds,
    });
  }, [cfg]);

  const handleSave = async () => {
    localStorage.setItem('ppe_alert_config', JSON.stringify(cfg));

    // Also try saving to backend
    try {
      await apiClient.put('/config', {
        audio_enabled: cfg.audio_enabled ? 1 : 0,
        email_enabled: cfg.email_enabled ? 1 : 0,
        email_recipients: cfg.email_recipients,
        email_smtp_host: 'smtp.gmail.com',
        email_smtp_port: 587,
        email_smtp_user: cfg.email_smtp_user,
        email_smtp_pass: cfg.email_smtp_pass,
        sms_enabled: cfg.ntfy_enabled ? 1 : 0,
        cooldown_seconds: cfg.cooldown_seconds,
      });
    } catch {}

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testNtfy = async () => {
    if (!cfg.ntfy_topic) return;
    try {
      await fetch(`https://ntfy.sh/${cfg.ntfy_topic}`, {
        method: 'POST',
        body: 'PPE Safety Monitor — test notification ✅',
        headers: { Title: 'Test Alert', Priority: 'default', Tags: 'white_check_mark' },
      });
      setNtfyTested(true);
      setTimeout(() => setNtfyTested(false), 3000);
    } catch {}
  };

  const set = <K extends keyof SimpleConfig>(key: K, value: SimpleConfig[K]) =>
    setCfg(prev => ({ ...prev, [key]: value }));

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <Bell size={20} className="text-blue-600" />
          <h2 className="text-slate-900 font-bold text-lg">Alert Configuration</h2>
        </div>

        {/* Audio */}
        <SectionCard title="Audio Alarm" icon={<Volume2 size={16} />}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-700 text-sm">Play alarm sound on confirmed violations</p>
              <p className="text-slate-400 text-xs mt-1">Works instantly — no setup needed</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={playAlarm}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs text-slate-600 font-medium transition-colors"
              >
                <TestTube size={12} /> Test
              </button>
              <Toggle on={cfg.audio_enabled} onClick={() => set('audio_enabled', !cfg.audio_enabled)} />
            </div>
          </div>
          <div className="mt-5">
            <label className="text-slate-500 text-xs font-medium mb-2 block">
              Cooldown between alerts — <span className="text-blue-600 font-semibold">{cfg.cooldown_seconds}s</span>
            </label>
            <input
              type="range" min="10" max="300" step="10"
              value={cfg.cooldown_seconds}
              onChange={e => set('cooldown_seconds', Number(e.target.value))}
              className="w-full h-1.5 accent-blue-600"
            />
            <div className="flex justify-between text-xs text-slate-300 mt-1">
              <span>10s</span><span>300s</span>
            </div>
          </div>
        </SectionCard>

        {/* Email — simplified to just Gmail */}
        <SectionCard title="Email Alerts" icon={<Mail size={16} />}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-700 text-sm">Send violation alerts to email via Gmail</p>
            <Toggle on={cfg.email_enabled} onClick={() => set('email_enabled', !cfg.email_enabled)} />
          </div>
          <div className={cn('space-y-3 transition-opacity', !cfg.email_enabled && 'opacity-40 pointer-events-none')}>
            <div>
              <label className="text-slate-500 text-xs font-medium mb-1.5 block">Send alerts to (email addresses, comma-separated)</label>
              <input
                type="text"
                value={cfg.email_recipients}
                onChange={e => set('email_recipients', e.target.value)}
                placeholder="manager@company.com, safety@company.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-slate-500 text-xs font-medium mb-1.5 block">Your Gmail address (used to send)</label>
              <input
                type="text"
                value={cfg.email_smtp_user}
                onChange={e => set('email_smtp_user', e.target.value)}
                placeholder="youremail@gmail.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>
            <div>
              <label className="text-slate-500 text-xs font-medium mb-1.5 block">Gmail App Password</label>
              <input
                type="password"
                value={cfg.email_smtp_pass}
                onChange={e => set('email_smtp_pass', e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-600">How to get a Gmail App Password:</p>
              <p>1. Go to your Google Account → Security</p>
              <p>2. Turn on 2-Step Verification</p>
              <p>3. Search for "App Passwords" → create one for "Mail"</p>
              <p>4. Copy the 16-character code and paste it above</p>
            </div>
          </div>
        </SectionCard>

        {/* Phone Notifications via ntfy.sh */}
        <SectionCard title="Phone Notifications" icon={<Smartphone size={16} />}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-700 text-sm">Push notifications to your phone — free, no account needed</p>
            </div>
            <Toggle on={cfg.ntfy_enabled} onClick={() => set('ntfy_enabled', !cfg.ntfy_enabled)} />
          </div>
          <div className={cn('space-y-3 transition-opacity', !cfg.ntfy_enabled && 'opacity-40 pointer-events-none')}>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700">Setup (takes 2 minutes):</p>
              <p>1. Install the <strong>ntfy</strong> app on your phone (Android / iPhone)</p>
              <p>2. Open the app → tap <strong>Subscribe to topic</strong></p>
              <p>3. Enter any topic name you like (e.g. <code className="bg-white px-1 rounded">my-site-alerts</code>)</p>
              <p>4. Type that same topic name below and hit Save</p>
            </div>
            <div>
              <label className="text-slate-500 text-xs font-medium mb-1.5 block">Your ntfy topic name</label>
              <input
                type="text"
                value={cfg.ntfy_topic}
                onChange={e => set('ntfy_topic', e.target.value.replace(/\s/g, '-').toLowerCase())}
                placeholder="my-site-safety-alerts"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
              <p className="text-slate-300 text-xs mt-1">Use something unique so only you receive it</p>
            </div>
            <button
              onClick={testNtfy}
              disabled={!cfg.ntfy_topic}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                ntfyTested
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600',
                !cfg.ntfy_topic && 'opacity-40 cursor-not-allowed'
              )}
            >
              <TestTube size={13} />
              {ntfyTested ? 'Notification sent! Check your phone' : 'Send test notification'}
            </button>
            <a
              href="https://ntfy.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink size={11} /> Learn more about ntfy.sh
            </a>
          </div>
        </SectionCard>

        {/* Violation Rules */}
        <SectionCard title="Violation Rules" icon={<Shield size={16} />}>
          <p className="text-slate-400 text-xs mb-4">Toggle which PPE items trigger alerts</p>
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <Toggle
                  on={rule.enabled}
                  onClick={() => onRulesChange(rules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))}
                />
                <div className="flex-1">
                  <span className="text-slate-800 text-sm font-medium">{rule.name}</span>
                  <span
                    className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                    style={{ color: getSeverityColor(rule.severity), background: `${getSeverityColor(rule.severity)}18` }}
                  >
                    {rule.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Save */}
        <button
          onClick={handleSave}
          className={cn(
            'w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm',
            saved ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
          )}
        >
          <Save size={16} />
          {saved ? 'Saved!' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
};
