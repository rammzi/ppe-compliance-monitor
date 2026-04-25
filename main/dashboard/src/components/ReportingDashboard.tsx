import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { apiClient } from '@/services/apiClient';
import { format, subHours } from 'date-fns';
import { Download, RefreshCw, TrendingUp, AlertTriangle, Users, ShieldCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsData {
  totalLogs: number;
  confirmedViolations: number;
  byType: { violation_type: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  timeline: { hour: string; total: number; violations: number }[];
  workerStats: { worker_id: string; total_events: number; violations: number }[];
}

interface LogEntry {
  id: number;
  timestamp: string;
  worker_id: string;
  violation_type: string;
  confidence: number;
  severity: string;
  confirmed: number;
  camera: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high:     '#EF4444',
  medium:   '#F59E0B',
  low:      '#3B82F6',
};

const DATE_RANGES = [
  { label: 'Last Hour',    hours: 1 },
  { label: 'Last 6 Hours', hours: 6 },
  { label: 'Today',        hours: 24 },
  { label: 'This Week',    hours: 168 },
  { label: 'This Month',   hours: 720 },
];

export const ReportingDashboard: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [rangeHours, setRangeHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const from = subHours(new Date(), rangeHours).toISOString();
    const to = new Date().toISOString();
    try {
      const [statsData, logsData] = await Promise.all([
        apiClient.get<StatsData>(`/stats?from=${from}&to=${to}`),
        apiClient.get<LogEntry[]>(`/logs?from=${from}&to=${to}&limit=100`),
      ]);
      setStats(statsData);
      setLogs(logsData);
      setBackendAvailable(true);
    } catch {
      setBackendAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [rangeHours]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const exportCSV = () => {
    const headers = ['ID', 'Timestamp', 'Worker', 'Violation', 'Severity', 'Confidence', 'Confirmed', 'Camera'];
    const rows = logs.map(l => [
      l.id, l.timestamp, l.worker_id, l.violation_type,
      l.severity, `${(l.confidence * 100).toFixed(1)}%`,
      l.confirmed ? 'Yes' : 'No', l.camera,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `ppe_report_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    a.click();
  };

  const complianceRate = stats
    ? Math.max(0, Math.round(((stats.totalLogs - stats.confirmedViolations) / Math.max(stats.totalLogs, 1)) * 100))
    : 0;

  const timelineReversed = stats ? [...stats.timeline].reverse() : [];

  if (!backendAvailable) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-10 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <p className="text-slate-700 text-lg font-semibold">Backend server not running</p>
          <p className="text-slate-400 text-sm mt-2">
            Start it with: <code className="bg-slate-100 px-2 py-1 rounded text-slate-600">npm run server</code>
          </p>
          <button onClick={fetchData} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-slate-900 font-bold text-lg flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-600" />
          Safety Analytics
        </h2>
        <div className="flex items-center gap-3">
          {/* Date Range */}
          <div className="flex gap-1 bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
            {DATE_RANGES.map(r => (
              <button
                key={r.hours}
                onClick={() => setRangeHours(r.hours)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded transition-all',
                  rangeHours === r.hours
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-colors shadow-sm"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        {[
          { label: 'Total Safety Events',  value: stats?.totalLogs ?? 0,          icon: <Clock size={18} className="text-slate-400" />,    bg: 'bg-slate-50',    val: 'text-slate-900' },
          { label: 'Confirmed Violations', value: stats?.confirmedViolations ?? 0, icon: <AlertTriangle size={18} className="text-red-400" />, bg: 'bg-red-50',    val: 'text-red-600' },
          {
            label: 'Compliance Rate', value: `${complianceRate}%`,
            icon: <ShieldCheck size={18} className={complianceRate >= 90 ? 'text-emerald-500' : complianceRate >= 70 ? 'text-amber-500' : 'text-red-500'} />,
            bg: complianceRate >= 90 ? 'bg-emerald-50' : complianceRate >= 70 ? 'bg-amber-50' : 'bg-red-50',
            val: complianceRate >= 90 ? 'text-emerald-600' : complianceRate >= 70 ? 'text-amber-600' : 'text-red-600',
          },
          { label: 'Workers on Record',    value: stats?.workerStats.length ?? 0,  icon: <Users size={18} className="text-blue-400" />,     bg: 'bg-blue-50',     val: 'text-blue-600' },
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

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4 shrink-0" style={{ height: '260px' }}>
        {/* Timeline */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
          <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Violation Trend</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineReversed} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: '#94A3B8', fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(11, 16)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#64748B', fontSize: 10 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#64748B' }} />
                <Line type="monotone" dataKey="violations" stroke="#EF4444" strokeWidth={2} dot={false} name="Violations" />
                <Line type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Total Events" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Type */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
          <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-3">Top Violations</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.byType ?? []} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="violation_type"
                  tick={{ fill: '#64748B', fontSize: 10 }}
                  width={60}
                />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #E2E8F0', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row: Worker Table + Severity */}
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0" style={{ minHeight: '200px' }}>
        {/* Worker Stats */}
        <div className="col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-slate-700 text-sm font-semibold">Worker Compliance Report</h3>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-slate-400 text-xs sticky top-0 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 font-medium">Worker ID</th>
                  <th className="px-4 py-3 font-medium">Total Events</th>
                  <th className="px-4 py-3 font-medium">Violations</th>
                  <th className="px-4 py-3 font-medium">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(stats?.workerStats ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-300 italic text-sm">No worker data yet</td></tr>
                ) : (
                  stats!.workerStats.map(w => {
                    const rate = Math.round(((w.total_events - w.violations) / Math.max(w.total_events, 1)) * 100);
                    return (
                      <tr key={w.worker_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-blue-600 font-semibold">{w.worker_id}</td>
                        <td className="px-4 py-3 text-slate-600">{w.total_events}</td>
                        <td className="px-4 py-3 text-red-500 font-medium">{w.violations}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full transition-all"
                                style={{ width: `${rate}%`, backgroundColor: rate > 80 ? '#10B981' : rate > 50 ? '#F59E0B' : '#EF4444' }}
                              />
                            </div>
                            <span className="text-slate-500 text-xs w-8 text-right">{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Severity Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
          <h3 className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-4">By Severity</h3>
          <div className="flex-1 space-y-4">
            {['critical', 'high', 'medium', 'low'].map(sev => {
              const entry = stats?.bySeverity.find(s => s.severity === sev);
              const count = entry?.count ?? 0;
              const max = Math.max(...(stats?.bySeverity.map(s => s.count) ?? [1]), 1);
              return (
                <div key={sev}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold capitalize text-slate-700">{sev}</span>
                    <span className="font-bold" style={{ color: SEVERITY_COLORS[sev] }}>{count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(count / max) * 100}%`, backgroundColor: SEVERITY_COLORS[sev] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Log */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shrink-0 overflow-hidden" style={{ maxHeight: '220px' }}>
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="text-slate-700 text-sm font-semibold">Recent Events</h3>
        </div>
        <div className="overflow-auto" style={{ maxHeight: '170px' }}>
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-slate-400 text-xs sticky top-0 border-b border-slate-100">
              <tr>
                {['Time', 'Worker', 'Violation', 'Severity', 'Certainty', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-300 italic">No events in this period</td></tr>
              ) : (
                logs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 text-slate-500">{format(new Date(l.timestamp), 'HH:mm:ss')}</td>
                    <td className="px-4 py-2.5 text-blue-600 font-medium">{l.worker_id}</td>
                    <td className="px-4 py-2.5 text-slate-700">{l.violation_type}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                        style={{ color: SEVERITY_COLORS[l.severity] ?? '#64748B', background: `${SEVERITY_COLORS[l.severity] ?? '#64748B'}18` }}
                      >
                        {l.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{(l.confidence * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-semibold',
                        l.confirmed ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                      )}>
                        {l.confirmed ? 'Confirmed' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
