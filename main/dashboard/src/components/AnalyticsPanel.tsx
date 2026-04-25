import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Prediction } from '@/services/roboflow';
import { TrackedWorker } from '@/services/workerTracker';
import { Upload, RefreshCw, AlertTriangle, Users, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

// Human-readable labels for managers
const VIOLATION_LABELS: Record<string, string> = {
  'no-hardhat': 'Missing Hard Hat',
  'no-helmet':  'Missing Hard Hat',
  'no-vest':    'Missing Safety Vest',
  'no-mask':    'Missing Face Mask',
  'no-gloves':  'Missing Gloves',
  'no-boots':   'Missing Safety Boots',
  'no-glasses': 'Missing Safety Glasses',
  'no-ear':     'Missing Ear Protection',
};

function humanizeViolation(cls: string): string {
  const lower = cls.toLowerCase();
  for (const [key, label] of Object.entries(VIOLATION_LABELS)) {
    if (lower.includes(key)) return label;
  }
  return cls.replace(/no-/i, 'Missing ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function complianceColor(pct: number): string {
  if (pct >= 90) return '#00E676';
  if (pct >= 70) return '#FFB300';
  if (pct >= 50) return '#FF8C00';
  return '#FF5252';
}

function complianceGrade(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

interface AnalyticsPanelProps {
  predictions: Prediction[];
  trackedWorkers: TrackedWorker[];
  history: { timestamp: string; violationCount: number }[];
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRunAnalysis: () => void;
  isLive: boolean;
  uploadedImage: string | null;
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({
  predictions,
  trackedWorkers,
  onFileUpload,
  onRunAnalysis,
  isLive,
  uploadedImage,
}) => {
  const violations = predictions.filter(p => p.class.toLowerCase().startsWith('no-'));
  const violationCount = violations.length;
  const workerCount = trackedWorkers.length ||
    predictions.filter(p => p.class.toLowerCase() === 'person' || p.class === '5').length;
  const safeCount = predictions.length - violationCount;
  const compliancePct = predictions.length > 0
    ? Math.round((safeCount / predictions.length) * 100)
    : 100;

  // Group active violations by type for the alert list
  const activeAlerts: Record<string, { label: string; count: number }> = {};
  violations.forEach(p => {
    const label = humanizeViolation(p.class);
    if (!activeAlerts[label]) activeAlerts[label] = { label, count: 0 };
    activeAlerts[label].count++;
  });
  const alertList = Object.values(activeAlerts).sort((a, b) => b.count - a.count);

  // Workers with confirmed violations
  const workersInViolation = trackedWorkers.filter(w => w.confirmedViolations.size > 0);

  interface PieSlice { name: string; value: number; color: string; }
  const pieData: PieSlice[] = [
    { name: 'Safe',      value: Math.max(safeCount, 0),      color: '#00E676' },
    { name: 'Violation', value: Math.max(violationCount, 0), color: '#FF5252' },
  ];
  const color = complianceColor(compliancePct);

  return (
    <div className="h-full flex flex-col gap-3">

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <div className="bg-[#232529] p-3 rounded-xl border border-white/5 flex flex-col">
          <div className="flex items-center gap-1.5 mb-2">
            <Users size={12} className="text-[#64B5F6]" />
            <p className="text-white/50 text-[11px] uppercase tracking-wider font-medium">On Site</p>
          </div>
          <p className="text-3xl font-bold text-white leading-none">{workerCount}</p>
          <p className="text-[10px] text-white/30 mt-1">workers detected</p>
        </div>

        <div className="bg-[#232529] p-3 rounded-xl border border-white/5 flex flex-col">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={12} className="text-[#FF5252]" />
            <p className="text-white/50 text-[11px] uppercase tracking-wider font-medium">Violations</p>
          </div>
          <p className={cn('text-3xl font-bold leading-none', violationCount > 0 ? 'text-[#FF5252]' : 'text-white/30')}>
            {violationCount}
          </p>
          <p className="text-[10px] text-white/30 mt-1">active right now</p>
        </div>

        <div className="bg-[#232529] p-3 rounded-xl border border-white/5 flex flex-col">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldCheck size={12} style={{ color }} />
            <p className="text-white/50 text-[11px] uppercase tracking-wider font-medium">Compliance</p>
          </div>
          <p className="text-3xl font-bold leading-none" style={{ color }}>{compliancePct}%</p>
          <p className="text-[10px] mt-1" style={{ color: color + '99' }}>Grade: {complianceGrade(compliancePct)}</p>
        </div>
      </div>

      {/* Compliance Ring */}
      <div className="bg-[#232529] rounded-xl border border-white/5 p-4 shrink-0" style={{ height: '180px' }}>
        <h3 className="text-white/60 text-[11px] font-semibold mb-2 uppercase tracking-wider">Site Safety Score</h3>
        <div className="flex items-center gap-4 h-[calc(100%-28px)]">
          <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={56} startAngle={90} endAngle={-270} paddingAngle={2} dataKey="value">
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1A1C1E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold leading-none" style={{ color }}>{compliancePct}%</span>
              <span className="text-[10px] text-white/40 mt-0.5">safe</span>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            {[
              { label: 'Safe detections',  value: safeCount,      color: '#00E676' },
              { label: 'PPE violations',   value: violationCount, color: '#FF5252' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/60">{row.label}</span>
                  <span className="font-bold font-mono" style={{ color: row.color }}>{row.value}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full">
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${predictions.length > 0 ? (row.value / predictions.length) * 100 : 0}%`, backgroundColor: row.color }}
                  />
                </div>
              </div>
            ))}

            {predictions.length === 0 && (
              <p className="text-white/20 text-xs italic">Awaiting detection data…</p>
            )}
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      <div className="bg-[#232529] rounded-xl border border-white/5 flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between shrink-0">
          <h3 className="text-white/60 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-2">
            {violationCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
            Current Alerts
          </h3>
          {workersInViolation.length > 0 && (
            <span className="text-[10px] text-red-400 font-mono">{workersInViolation.length} worker{workersInViolation.length > 1 ? 's' : ''} at risk</span>
          )}
        </div>
        <div className="overflow-auto flex-1 p-2 space-y-1">
          {alertList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-4">
              <ShieldCheck size={28} className="text-[#00E676]/40 mb-2" />
              <p className="text-white/30 text-xs text-center">No active violations</p>
              <p className="text-white/20 text-[10px] text-center mt-1">All workers are compliant</p>
            </div>
          ) : (
            alertList.map(alert => (
              <div key={alert.label} className="flex items-center gap-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertTriangle size={13} className="text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90 font-medium truncate">{alert.label}</p>
                </div>
                {alert.count > 1 && (
                  <span className="text-[10px] font-bold text-red-400 bg-red-500/20 px-1.5 py-0.5 rounded font-mono">{alert.count}×</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Image Analysis Controls */}
      <div className={cn('shrink-0 flex gap-2', isLive && 'opacity-40 pointer-events-none')}>
        <label className="flex-1 cursor-pointer bg-[#2E3136] hover:bg-[#3A3E46] text-white/80 px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 border border-white/10 transition-colors text-xs font-medium">
          <Upload size={14} />
          Upload Image
          <input type="file" accept="image/*" onChange={onFileUpload} className="hidden" />
        </label>
        <button
          onClick={onRunAnalysis}
          disabled={!uploadedImage}
          className={cn(
            'flex-1 bg-[#FFB300] hover:bg-[#FFCA28] text-black font-bold px-3 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs',
            !uploadedImage && 'opacity-50 cursor-not-allowed'
          )}
        >
          <RefreshCw size={14} />
          Analyze
        </button>
      </div>

    </div>
  );
};
