import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { Download, ShieldCheck, AlertTriangle, Clock, Camera } from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'Violation' | 'Compliance';
  details: string;
  confidence: number;
  screenshot?: string;
}

interface ViolationLogProps {
  logs: LogEntry[];
  fullPage?: boolean;
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

type FilterType = 'all' | 'violations' | 'compliant';

export const ViolationLog: React.FC<ViolationLogProps> = ({ logs, fullPage = false }) => {
  const [filter, setFilter] = useState<FilterType>('all');

  const displayed = filter === 'violations'
    ? logs.filter(l => l.type === 'Violation')
    : filter === 'compliant'
    ? logs.filter(l => l.type === 'Compliance')
    : logs;

  const violationCount = logs.filter(l => l.type === 'Violation').length;
  const compliantCount = logs.filter(l => l.type === 'Compliance').length;

  const downloadCSV = () => {
    const rows = logs.map(l => [
      format(l.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      l.type,
      humanize(l.details),
      `${(l.confidence * 100).toFixed(1)}%`,
    ]);
    const csv = [['Time', 'Status', 'Issue', 'Certainty'], ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `safety_events_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    a.click();
  };

  const FilterBtn: React.FC<{ type: FilterType; label: string; count: number }> = ({ type, label, count }) => (
    <button
      onClick={() => setFilter(type)}
      className={cn(
        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
        filter === type
          ? type === 'violations'
            ? 'bg-red-100 text-red-700'
            : type === 'compliant'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-blue-100 text-blue-700'
          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
      )}
    >
      {label} <span className="ml-1 text-xs opacity-70">({count})</span>
    </button>
  );

  const content = (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-white shrink-0">
        <div className="flex gap-1">
          <FilterBtn type="all"       label="All"       count={logs.length} />
          <FilterBtn type="violations" label="Violations" count={violationCount} />
          <FilterBtn type="compliant"  label="Compliant"  count={compliantCount} />
        </div>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
        >
          <Download size={14} />
          Export
        </button>
      </div>

      {/* Events List */}
      <div className={cn('overflow-auto', fullPage ? 'flex-1 p-4' : 'p-3')}>
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Clock size={24} className="text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm font-medium">No events to show</p>
            <p className="text-slate-300 text-xs">
              {filter === 'violations' ? 'No violations have been recorded.' : 'Start monitoring to see events here.'}
            </p>
          </div>
        ) : (
          <div className={cn('space-y-2', fullPage && 'max-w-3xl mx-auto')}>
            {displayed.map(log => (
              <div
                key={log.id}
                className={cn(
                  'bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow',
                  log.type === 'Violation' ? 'border-red-100' : 'border-slate-100'
                )}
              >
                {/* Top row: icon + content + time */}
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                    log.type === 'Violation' ? 'bg-red-50' : 'bg-emerald-50'
                  )}>
                    {log.type === 'Violation'
                      ? <AlertTriangle size={17} className="text-red-500" />
                      : <ShieldCheck size={17} className="text-emerald-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className={cn(
                        'text-sm font-semibold',
                        log.type === 'Violation' ? 'text-slate-900' : 'text-slate-600'
                      )}>
                        {humanize(log.details)}
                      </p>
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        log.type === 'Violation'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-emerald-50 text-emerald-600'
                      )}>
                        {log.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {format(log.timestamp, 'HH:mm:ss')} &nbsp;·&nbsp; CAM-01 &nbsp;·&nbsp; {(log.confidence * 100).toFixed(0)}% certainty
                    </p>
                  </div>
                  <span className="text-xs text-slate-300 shrink-0 whitespace-nowrap">
                    {formatDistanceToNow(log.timestamp, { addSuffix: true })}
                  </span>
                </div>

                {/* Screenshot */}
                {log.screenshot && (
                  <div className="mt-3 pt-3 border-t border-slate-50 flex items-start gap-3">
                    <img
                      src={log.screenshot}
                      alt="Violation capture"
                      className="w-40 h-24 object-cover rounded-lg border border-slate-200 shrink-0"
                    />
                    <div className="flex flex-col gap-2 justify-center">
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Camera size={11} /> Captured at {format(log.timestamp, 'HH:mm:ss')}
                      </p>
                      <a
                        href={log.screenshot}
                        download={`violation_${format(log.timestamp, 'yyyyMMdd_HHmmss')}.jpg`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors w-fit"
                      >
                        <Download size={11} /> Download Image
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (fullPage) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">Safety Events</h2>
          <p className="text-sm text-slate-500 mt-0.5">All detection events from this session</p>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
        {violationCount > 0 && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
        <h3 className="text-sm font-semibold text-slate-800">Live Events</h3>
      </div>
      {content}
    </div>
  );
};
