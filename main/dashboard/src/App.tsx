/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { CameraFeed, CameraFeedHandle } from '@/components/CameraFeed';
import VideoDetector from '@/components/VideoDetector';
import { ViolationLog } from '@/components/ViolationLog';
import { OverviewTab } from '@/components/OverviewTab';
import { ReportingDashboard } from '@/components/ReportingDashboard';
import { AlertSettings } from '@/components/AlertSettings';
import { Prediction } from '@/services/roboflow';
import { updateWorkerTracking, resetTracker, TrackedWorker } from '@/services/workerTracker';
import { DEFAULT_RULES, Rule } from '@/services/ruleEngine';
import { triggerAlert } from '@/services/alertService';
import { apiClient } from '@/services/apiClient';
import { format } from 'date-fns';
import {
  ShieldCheck, Video, Image as ImageIcon, BarChart2,
  Bell, Users, AlertTriangle, LayoutDashboard, List,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'live' | 'events' | 'reports' | 'settings';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',  label: 'Overview',  icon: <LayoutDashboard size={15} /> },
  { id: 'live',      label: 'Live Feed', icon: <Video size={15} /> },
  { id: 'events',    label: 'Events',    icon: <List size={15} /> },
  { id: 'reports',   label: 'Reports',   icon: <BarChart2 size={15} /> },
  { id: 'settings',  label: 'Settings',  icon: <Bell size={15} /> },
];

function App() {
  // ─── Core State ───────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isLive, setIsLive] = useState(false);
  const [confidence, setConfidence] = useState(30);
  const [overlap, setOverlap] = useState(25);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [status, setStatus] = useState<'idle' | 'detecting' | 'error'>('idle');
  const [logs, setLogs] = useState<any[]>([]);

  // ─── Upload ───────────────────────────────────────────────────
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [analysisTrigger, setAnalysisTrigger] = useState(0);

  // ─── Worker Tracking ──────────────────────────────────────────
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);
  const [trackedWorkers, setTrackedWorkers] = useState<TrackedWorker[]>([]);
  const confirmedViolationIds = useRef(new Set<string>());
  const cameraRef = useRef<CameraFeedHandle>(null);

  // ─── Clock ────────────────────────────────────────────────────
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ─── Absence-based violation inference ────────────────────────
  const REQUIRED_PPE: { key: string; aliases: string[]; violationClass: string }[] = [
    { key: 'hardhat', aliases: ['hardhat', 'hard hat', 'helmet', 'hard-hat'], violationClass: 'no-hardhat' },
    { key: 'vest',    aliases: ['vest', 'safety vest', 'safetyvest'],          violationClass: 'no-vest'    },
    { key: 'mask',    aliases: ['mask', 'face mask', 'facemask'],              violationClass: 'no-mask'    },
    { key: 'gloves',  aliases: ['gloves', 'glove'],                            violationClass: 'no-gloves'  },
    { key: 'boots',   aliases: ['boots', 'boot', 'safety boots'],              violationClass: 'no-boots'   },
  ];

  function iouSimple(a: Prediction, b: Prediction) {
    const ax1 = a.x - a.width / 2, ay1 = a.y - a.height / 2;
    const ax2 = a.x + a.width / 2, ay2 = a.y + a.height / 2;
    const bx1 = b.x - b.width / 2, by1 = b.y - b.height / 2;
    const bx2 = b.x + b.width / 2, by2 = b.y + b.height / 2;
    const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
    const iy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
    const inter = ix * iy;
    const union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter;
    return union > 0 ? inter / union : 0;
  }

  const enrichedPredictions = React.useMemo(() => {
    const persons = predictions.filter(p =>
      ['person', 'human', '5'].includes(p.class.toLowerCase())
    );

    // 1. Dynamic Frame Height Estimation (Matches your report's Spatial Logic!)
    // We estimate the bottom of the camera view by finding the lowest prediction box
    const estimatedFrameHeight = Math.max(
      ...predictions.map(p => p.y + (p.height / 2)),
      480 // Fallback minimum height
    );

    // 2. Identify Occluded/Cut-Off Workers
    const cutOffPersons = persons.filter(person => {
      const personAspectRatio = person.height / person.width;
      const personBottom = person.y + (person.height / 2);
      
      const isLegsCutOff = personAspectRatio < 1.8; // Geometric check
      const isNearFrameBottom = personBottom > (estimatedFrameHeight * 0.90); // Bottom 10% check

      return isLegsCutOff || isNearFrameBottom;
    });

    // 3. Filter RAW predictions from the AI (Drop 'Ghost' Boot Violations)
    const validRawPredictions = predictions.filter(p => {
      const isNoBoot = p.class.toLowerCase().includes('no') && p.class.toLowerCase().includes('boot');
      if (!isNoBoot) return true;

      // If it IS a no-boot violation, check if it belongs to a cut-off person
      const belongsToCutOff = cutOffPersons.some(cp => 
        iouSimple(cp, p) > 0 || 
        (Math.abs(p.x - cp.x) < (cp.width * 1.5) && Math.abs(p.y - cp.y) < (cp.height * 1.5))
      );

      // If it belongs to an occluded worker, DROP IT entirely
      return !belongsToCutOff; 
    });

    if (persons.length === 0) return validRawPredictions;

    // 4. Generate Synthetic Predictions (Absence-based checks)
    const synthetic: Prediction[] = [];
    persons.forEach(person => {
      const isCutOff = cutOffPersons.includes(person);

      REQUIRED_PPE.forEach(ppe => {
        // The Presumption of Compliance: Ignore boots if worker is cut off
        if (ppe.key === 'boots' && isCutOff) return;

        const hasItem = validRawPredictions.some(p => {
          const lc = p.class.toLowerCase().replace(/[^a-z]/g, '');
          return ppe.aliases.some(a => lc.includes(a.replace(/[^a-z]/g, ''))) &&
            (iouSimple(person, p) > 0.05 || (
              Math.abs(p.x - person.x) < (person.width * 0.8) &&
              Math.abs(p.y - person.y) < (person.height * 0.8)
            ));
        });
        
        if (!hasItem) {
          synthetic.push({
            x: person.x, y: person.y,
            width: person.width, height: person.height,
            class: ppe.violationClass,
            confidence: person.confidence,
          });
        }
      });
    });

    return [...validRawPredictions, ...synthetic];
  }, [predictions]);

  // ─── Derived ──────────────────────────────────────────────────
  const hasViolation = enrichedPredictions.some(p => p.class.toLowerCase().startsWith('no-'));

  // ─── Worker Tracking & Rule Engine ────────────────────────────
  useEffect(() => {
    if (enrichedPredictions.length === 0) return;
    const { trackedWorkers: workers, newConfirmedViolations } = updateWorkerTracking(enrichedPredictions, rules);
    setTrackedWorkers(workers);

    const screenshot = cameraRef.current?.captureFrame() ?? null;

    newConfirmedViolations.forEach(v => {
      const key = `${v.workerId}:${v.violationClass}`;
      if (confirmedViolationIds.current.has(key)) return;
      confirmedViolationIds.current.add(key);

      triggerAlert({ workerId: v.workerId, violationType: v.violationType, severity: v.severity });

      apiClient.post('/logs', {
        timestamp: new Date().toISOString(),
        worker_id: v.workerId,
        violation_type: v.violationType,
        confidence: enrichedPredictions.find(p => p.class.toLowerCase().includes(v.violationClass))?.confidence ?? 0,
        severity: v.severity,
        confirmed: true,
        camera: 'CAM-01',
      }).catch(() => {});
    });
  }, [predictions, rules]);

  // ─── Log raw events ───────────────────────────────────────────
  useEffect(() => {
    if (enrichedPredictions.length === 0) return;
    const entries = enrichedPredictions
      .filter(p => p.class.toLowerCase().startsWith('no-'))
      .map(p => ({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
        type: 'Violation' as const,
        details: p.class,
        confidence: p.confidence,
        screenshot: cameraRef.current?.captureFrame() ?? undefined,
      }));
    if (entries.length > 0) setLogs(prev => [...entries, ...prev].slice(0, 200));
  }, [enrichedPredictions]);

  useEffect(() => {
    resetTracker();
    confirmedViolationIds.current.clear();
  }, [isLive]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
      // It's a video!
      setUploadedVideo(URL.createObjectURL(file));
      setUploadedImage(null);
      setPredictions([]);
      setIsLive(false);
    } else {
      // It's an image!
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        setUploadedVideo(null);
        setPredictions([]);
        setIsLive(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const violationCount = predictions.filter(p => p.class.toLowerCase().startsWith('no-')).length;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 shadow-sm shrink-0 z-20">
        <div className="flex items-center px-6 h-14 gap-6">

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm">
              <ShieldCheck size={17} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight">PPE Safety Monitor</p>
              <p className="text-[10px] text-slate-400 leading-tight">Sector-7G · Mining Operations</p>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-7 bg-slate-200 shrink-0" />

          {/* Tab Nav */}
          <nav className="flex gap-0.5 flex-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all relative',
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                )}
              >
                {tab.icon}
                {tab.label}
                {tab.id === 'events' && violationCount > 0 && (
                  <span className="ml-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {violationCount > 9 ? '9+' : violationCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Right: Status + Clock */}
          <div className="flex items-center gap-4 shrink-0">
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              hasViolation
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            )}>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full animate-pulse',
                hasViolation ? 'bg-red-500' : 'bg-emerald-500'
              )} />
              {hasViolation ? 'Violation Active' : 'Site Clear'}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700 tabular-nums leading-tight">{format(now, 'HH:mm:ss')}</p>
              <p className="text-[10px] text-slate-400 leading-tight">{format(now, 'EEE d MMM yyyy')}</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Tab Content ─────────────────────────────────────────── */}

      {activeTab === 'overview' && (
        <OverviewTab
          predictions={enrichedPredictions}
          trackedWorkers={trackedWorkers}
          logs={logs}
          isLive={isLive}
          status={status}
        />
      )}

      {activeTab === 'live' && (
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left Sidebar */}
          <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">

            {/* Camera Source */}
            <div className="p-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Camera Source</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsLive(true);
                    setUploadedVideo(null);
                    setUploadedImage(null);
                  }}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 border transition-all',
                    isLive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  )}
                >
                  <Video size={13} /> Live
                </button>

                {/* THE NEW UPLOAD BUTTON LOGIC */}
                <label
                  onClick={() => setIsLive(false)}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 border transition-all cursor-pointer',
                    !isLive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  )}
                >
                  <ImageIcon size={13} /> Upload
                  <input 
                    type="file" 
                    accept="image/*,video/mp4,video/webm" 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                </label>
              </div>

              {/* Upload controls - ONLY the Run Analysis button remains here */}
              {!isLive && (
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    onClick={() => setAnalysisTrigger(p => p + 1)}
                    disabled={!uploadedImage || !!uploadedVideo}
                    className={cn(
                      'bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs',
                      (!uploadedImage || !!uploadedVideo) && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    <RefreshCw size={13} />
                    {uploadedVideo ? 'Plays Automatically' : 'Run Analysis'}
                  </button>
                </div>
              )}
            </div>

            {/* Detection Settings */}
            <div className="p-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Detection Settings</p>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-slate-700">Confidence</label>
                    <span className="text-xs font-semibold text-blue-600">{confidence}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" value={confidence}
                    onChange={e => setConfidence(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full cursor-pointer accent-blue-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Min certainty to flag a detection</p>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-medium text-slate-700">Sensitivity</label>
                    <span className="text-xs font-semibold text-blue-600">{overlap}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" value={overlap}
                    onChange={e => setOverlap(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full cursor-pointer accent-blue-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Higher = fewer duplicate boxes</p>
                </div>
              </div>
            </div>

            {/* Workers */}
            <div className="p-4 flex-1 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Workers</p>
                <span className="text-xs text-slate-400">{trackedWorkers.length} detected</span>
              </div>
              {trackedWorkers.length === 0 ? (
                <div className="text-center py-6">
                  <Users size={28} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-xs">No workers in frame</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {trackedWorkers.map(w => {
                    const viols = [...w.confirmedViolations];
                    const isAtRisk = viols.length > 0;
                    return (
                      <div key={w.id} className={cn(
                        'rounded-xl p-3 border',
                        isAtRisk ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'
                      )}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-700">{w.id}</span>
                          <span className={cn(
                            'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                            isAtRisk ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          )}>
                            {isAtRisk ? 'At Risk' : 'Safe'}
                          </span>
                        </div>
                        {viols.map(v => (
                          <p key={v} className="text-[10px] text-red-600 leading-snug">
                            {v.replace(/no-/i, 'Missing ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </p>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2">
              <div className={cn(
                'w-2 h-2 rounded-full',
                status === 'detecting' ? 'bg-blue-500 animate-ping' : status === 'error' ? 'bg-red-400' : 'bg-emerald-400'
              )} />
              <span className="text-xs text-slate-400">
                {status === 'detecting' ? 'Scanning…' : status === 'error' ? 'Detection error' : 'Ready'}
              </span>
              <span className="ml-auto text-[10px] text-slate-300">construction-ppe-detection/1</span>
            </div>
          </aside>

          {/* Camera Viewport */}
          <main className="flex-1 flex flex-col min-w-0 p-4 bg-slate-100 gap-3 overflow-y-auto">
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
              <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 shadow-sm">
                CAM-01 · Main Gate
              </div>
              
              {hasViolation && (
                <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm">
                  <AlertTriangle size={12} />
                  Violation Detected
                </div>
              )}

              {/* Dynamic Video/Camera Overlay */}
              {uploadedVideo ? (
                <VideoDetector 
                  videoUrl={uploadedVideo} 
                  confidenceThreshold={confidence}
                  overlapThreshold={overlap}
                  onPredictions={setPredictions} 
                />
              ) : (
                <CameraFeed
                  ref={cameraRef}
                  isLive={isLive}
                  uploadedImage={uploadedImage}
                  analysisTrigger={analysisTrigger}
                  confidenceThreshold={confidence}
                  overlapThreshold={overlap}
                  onPredictions={setPredictions}
                  onStatusChange={setStatus}
                />
              )}
            </div>
            
            {/* Debug: raw model output */}
            {enrichedPredictions.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shrink-0">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Detections ({enrichedPredictions.length})</p>
                <div className="flex flex-wrap gap-2">
                  {enrichedPredictions.map((p, i) => (
                    <span key={i} className={cn(
                      'text-xs px-2 py-1 rounded-full font-medium',
                      p.class.toLowerCase().startsWith('no-')
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    )}>
                      {p.class} · {(p.confidence * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-100">
          <div className="flex-1 flex flex-col overflow-hidden">
            <ViolationLog logs={logs} fullPage={true} />
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-100">
          <ReportingDashboard />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-100">
          <AlertSettings rules={rules} onRulesChange={setRules} />
        </div>
      )}
    </div>
  );
}

export default App;