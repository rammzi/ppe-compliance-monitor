import { Prediction } from './roboflow';
import { Rule } from './ruleEngine';

export interface TrackedWorker {
  id: string;
  bbox: { x: number; y: number; width: number; height: number };
  violations: Map<string, number>;       // violationClass -> consecutive frame count
  confirmedViolations: Set<string>;      // violation classes currently confirmed
  framesTracked: number;
  lastSeen: number;
}

export interface ConfirmedViolationEvent {
  workerId: string;
  violationType: string;
  severity: Rule['severity'];
  violationClass: string;
}

const IOU_THRESHOLD = 0.2;
const MAX_MISSING_FRAMES = 30;

let workers = new Map<string, TrackedWorker>();
let nextId = 1;
let frameCounter = 0;

function iou(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const ax1 = a.x - a.width / 2,  ay1 = a.y - a.height / 2;
  const ax2 = a.x + a.width / 2,  ay2 = a.y + a.height / 2;
  const bx1 = b.x - b.width / 2,  by1 = b.y - b.height / 2;
  const bx2 = b.x + b.width / 2,  by2 = b.y + b.height / 2;

  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);

  if (ix2 <= ix1 || iy2 <= iy1) return 0;

  const inter = (ix2 - ix1) * (iy2 - iy1);
  const aArea = (ax2 - ax1) * (ay2 - ay1);
  const bArea = (bx2 - bx1) * (by2 - by1);
  return inter / (aArea + bArea - inter);
}

export interface TrackerUpdateResult {
  trackedWorkers: TrackedWorker[];
  newConfirmedViolations: ConfirmedViolationEvent[];
}

export function updateWorkerTracking(
  predictions: Prediction[],
  rules: Rule[]
): TrackerUpdateResult {
  frameCounter++;

  const enabledRules = rules.filter(r => r.enabled);

  // Separate persons from violations
  const persons = predictions.filter(p =>
    p.class.toLowerCase() === 'person' || p.class === '5'
  );

  // If model doesn't emit 'person' class, cluster all detections spatially.
  // Detections that overlap or are near each other belong to the same worker.
  // We pick the largest bbox per cluster as the anchor.
  function clusterToAnchors(preds: Prediction[]): Prediction[] {
    if (preds.length === 0) return [];
    const sorted = [...preds].sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const selected: Prediction[] = [];
    for (const p of sorted) {
      const overlaps = selected.some(s => iou(p, s) > 0.05 ||
        (Math.abs(p.x - s.x) < (p.width + s.width) / 2 &&
         Math.abs(p.y - s.y) < (p.height + s.height) / 2));
      if (!overlaps) selected.push(p);
    }
    return selected;
  }

  const anchors: Prediction[] = persons.length > 0
    ? persons
    : clusterToAnchors(predictions);

  const violations = predictions.filter(p =>
    p.class.toLowerCase().startsWith('no-')
  );

  const newConfirmedViolations: ConfirmedViolationEvent[] = [];
  const matchedWorkerIds = new Set<string>();
  const matchedAnchorIndices = new Set<number>();

  // Greedy IoU matching: each anchor to best unmatched worker
  const scored: { anchorIdx: number; workerId: string; score: number }[] = [];

  anchors.forEach((anchor, ai) => {
    workers.forEach((worker, wid) => {
      const score = iou(anchor, worker.bbox);
      if (score >= IOU_THRESHOLD) {
        scored.push({ anchorIdx: ai, workerId: wid, score });
      }
    });
  });

  scored.sort((a, b) => b.score - a.score);

  scored.forEach(({ anchorIdx, workerId }) => {
    if (matchedAnchorIndices.has(anchorIdx) || matchedWorkerIds.has(workerId)) return;

    matchedAnchorIndices.add(anchorIdx);
    matchedWorkerIds.add(workerId);

    const anchor = anchors[anchorIdx];
    const worker = workers.get(workerId)!;

    worker.bbox = { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height };
    worker.lastSeen = frameCounter;
    worker.framesTracked++;

    // Which violations overlap this worker?
    const activeViolClasses = new Set(
      violations
        .filter(v => iou(anchor, v) > 0.05)
        .map(v => v.class.toLowerCase())
    );

    // Normalize a class name for fuzzy matching:
    // strip the "no-" / "no " prefix, remove spaces/hyphens → "safetyvest", "hardhat", "mask"
    const normalize = (s: string) =>
      s.replace(/^no[-\s]*/i, '').replace(/[-\s]/g, '').toLowerCase();

    // Update consecutive frame counts
    enabledRules.forEach(rule => {
      const vc = rule.violationClass.toLowerCase();
      const vcNorm = normalize(vc);
      const active = [...activeViolClasses].some(c => {
        const cNorm = normalize(c);
        return c.includes(vc) || vc.includes(c) || cNorm.includes(vcNorm) || vcNorm.includes(cNorm);
      });
      if (active) {
        worker.violations.set(vc, (worker.violations.get(vc) ?? 0) + 1);
      } else {
        worker.violations.set(vc, 0);
        worker.confirmedViolations.delete(vc); // cleared
      }

      const count = worker.violations.get(vc) ?? 0;
      if (count >= rule.confirmFrames && !worker.confirmedViolations.has(vc)) {
        worker.confirmedViolations.add(vc);
        newConfirmedViolations.push({
          workerId: worker.id,
          violationType: rule.name,
          severity: rule.severity,
          violationClass: vc,
        });
      }
    });
  });

  // Spawn new workers for unmatched anchors
  anchors.forEach((_anchor, ai) => {
    if (matchedAnchorIndices.has(ai)) return;
    const anchor = anchors[ai];
    const id = `W${String(nextId++).padStart(3, '0')}`;
    workers.set(id, {
      id,
      bbox: { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height },
      violations: new Map(),
      confirmedViolations: new Set(),
      framesTracked: 1,
      lastSeen: frameCounter,
    });
  });

  // Evict stale workers
  workers.forEach((w, id) => {
    if (frameCounter - w.lastSeen > MAX_MISSING_FRAMES) workers.delete(id);
  });

  return { trackedWorkers: Array.from(workers.values()), newConfirmedViolations };
}

export function resetTracker(): void {
  workers = new Map();
  nextId = 1;
  frameCounter = 0;
}
