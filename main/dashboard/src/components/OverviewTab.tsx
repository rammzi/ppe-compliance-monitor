import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ShieldCheck, AlertTriangle, Users, Activity, Clock } from 'lucide-react';
import { Prediction } from '@/services/roboflow';
import { TrackedWorker } from '@/services/workerTracker';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'Violation' | 'Compliance';
  details: string;
  confidence: number;
}

interface OverviewTabProps {
  predictions: Prediction[];
  trackedWorkers: TrackedWorker[];
  logs: LogEntry[];
  isLive: boolean;
  status: 'idle' | 'detecting' | 'error';
}

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

function humanize(cls: string): string {
  const lower = cls.toLowerCase();
  for (const [k, v] of Object.entries(VIOLATION_LABELS)) if (lower.includes(k)) return v;
  return cls.replace(/no-/i, 'Missing ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  predictions, trackedWorkers, logs, isLive, status,
}) => {
  const violations = predictions.filter(p => p.class.toLowerCase().startsWith('no-'));
  const hasViolation = violations.length > 0;
  const workersAtRisk = trackedWorkers.filter(w => w.confirmedViolations.size > 0);
  const workerCount = trackedWorkers.length ||
    predictions.filter(p => p.class.toLowerCase() === 'person').length;

  const safeCount = predictions.length - violations.length;
  const compliancePct = predictions.length > 0
    ? Math.round((safeCount / predictions.length) * 100)
    : 100;

  const todayViolations = logs.filter(l => l.type === 'Violation').length;
  const recentLogs = logs.slice(0, 8);

  const complianceColor = compliancePct >= 90 ? 'text-emerald-600' : compliancePct >= 70 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Status Hero */}
        <div className={cn(
          'rounded-2xl p-5 border flex items-center gap-5 transition-colors',
          hasViolation
            ? 'bg-red-50 border-red-200'
            : 'bg-emerald-50 border-emerald-200'
        )}>
          <div className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0',
            hasViolation ? 'bg-red-100' : 'bg-emerald-100'
          )}>
            {hasViolation
              ? <AlertTriangle size={28} className="text-red-600" />
              : <ShieldCheck size={28} className="text-emerald-600" />
            }
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className={cn('text-xl font-bold', hasViolation ? 'text-red-800' : 'text-emerald-800')}>
                {hasViolation ? 'Violation Detected' : 'Site Clear'}
              </h2>
              <span className={cn(
                'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                status === 'detecting'
                  ? 'bg-blue-100 text-blue-700'
                  : hasViolation ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
              )}>
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  status === 'detecting' ? 'bg-blue-500 animate-ping' : hasViolation ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
                )} />
                {status === 'detecting' ? 'Scanning…' : isLive ? 'Live' : 'Image Mode'}
              </span>
            </div>
            <p className={cn('text-sm', hasViolation ? 'text-red-700' : 'text-emerald-700')}>
              {hasViolation
                ? `${workersAtRisk.length} worker${workersAtRisk.length !== 1 ? 's' : ''} require${workersAtRisk.length === 1 ? 's' : ''} immediate attention — ${violations.map(v => humanize(v.class)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(', ')}`
                : `${workerCount || 'No'} worker${workerCount !== 1 ? 's' : ''} monitored${workerCount > 0 ? ', all compliant' : ''}`
              }
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: 'Workers on Site',
              value: workerCount,
              icon: <Users size={20} className="text-blue-500" />,
              bg: 'bg-blue-50',
              val: 'text-slate-900',
            },
            {
              label: 'Active Violations',
              value: violations.length,
              icon: <AlertTriangle size={20} className={violations.length > 0 ? 'text-red-500' : 'text-slate-400'} />,
              bg: violations.length > 0 ? 'bg-red-50' : 'bg-slate-50',
              val: violations.length > 0 ? 'text-red-600' : 'text-slate-400',
            },
            {
              label: 'Compliance Rate',
              value: `${compliancePct}%`,
              icon: <ShieldCheck size={20} className={compliancePct >= 90 ? 'text-emerald-500' : 'text-amber-500'} />,
              bg: compliancePct >= 90 ? 'bg-emerald-50' : 'bg-amber-50',
              val: complianceColor,
            },
            {
              label: 'Events This Session',
              value: todayViolations,
              icon: <Activity size={20} className="text-slate-400" />,
              bg: 'bg-slate-50',
              val: 'text-slate-700',
            },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', kpi.bg)}>
                {kpi.icon}
              </div>
              <p className="text-slate-500 text-xs font-medium mb-1">{kpi.label}</p>
              <p className={cn('text-3xl font-bold', kpi.val)}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-2 gap-4">

          {/* Workers */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Users size={16} className="text-slate-400" />
                Workers on Site
                <span className="ml-auto text-xs text-slate-400 font-normal">{trackedWorkers.length} tracked</span>
              </h3>
            </div>
            <div className="p-3 space-y-2 max-h-64 overflow-auto">
              {trackedWorkers.length === 0 ? (
                <div className="py-8 text-center">
                  <Users size={32} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No workers detected yet</p>
                  <p className="text-slate-300 text-xs mt-1">Start the live feed or upload an image</p>
                </div>
              ) : trackedWorkers.map(w => {
                const viols = [...w.confirmedViolations];
                const isAtRisk = viols.length > 0;
                return (
                  <div key={w.id} className={cn(
                    'flex items-start gap-3 p-3 rounded-xl border',
                    isAtRisk ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'
                  )}>
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs',
                      isAtRisk ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                    )}>
                      {w.id.slice(-3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-800">{w.id}</span>
                        <span className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          isAtRisk ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        )}>
                          {isAtRisk ? 'At Risk' : 'Safe'}
                        </span>
                      </div>
                      {viols.length > 0 && (
                        <p className="text-xs text-red-600 mt-0.5 truncate">
                          {viols.map(v => humanize(v)).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Events */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                Recent Events
                <span className="ml-auto text-xs text-slate-400 font-normal">{logs.length} total</span>
              </h3>
            </div>
            <div className="divide-y divide-slate-50 max-h-64 overflow-auto">
              {recentLogs.length === 0 ? (
                <div className="py-8 text-center">
                  <Clock size={32} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No events recorded yet</p>
                </div>
              ) : recentLogs.map(log => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                    log.type === 'Violation' ? 'bg-red-50' : 'bg-emerald-50'
                  )}>
                    {log.type === 'Violation'
                      ? <AlertTriangle size={13} className="text-red-500" />
                      : <ShieldCheck size={13} className="text-emerald-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 font-medium truncate">{humanize(log.details)}</p>
                    <p className="text-xs text-slate-400">{format(log.timestamp, 'HH:mm:ss')}</p>
                  </div>
                  <span className="text-xs text-slate-300 shrink-0">
                    {formatDistanceToNow(log.timestamp, { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
