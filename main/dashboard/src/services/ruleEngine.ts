export interface Rule {
  id: string;
  name: string;
  violationClass: string; // lowercase prefix to match against prediction class
  confirmFrames: number;  // consecutive frames before violation is confirmed
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

export const DEFAULT_RULES: Rule[] = [
  { id: 'r1', name: 'No Hard Hat',       violationClass: 'no-hardhat',  confirmFrames: 1,  severity: 'critical', enabled: true },
  { id: 'r2', name: 'No Safety Vest',    violationClass: 'no-vest',     confirmFrames: 1,  severity: 'high',     enabled: true },
  { id: 'r3', name: 'No Mask',           violationClass: 'no-mask',     confirmFrames: 1,  severity: 'medium',   enabled: true },
  { id: 'r4', name: 'No Gloves',         violationClass: 'no-gloves',   confirmFrames: 1,  severity: 'medium',   enabled: true },
  { id: 'r5', name: 'No Safety Glasses', violationClass: 'no-glasses',  confirmFrames: 1,  severity: 'high',     enabled: true },
  { id: 'r6', name: 'No Boots',          violationClass: 'no-boots',    confirmFrames: 1,  severity: 'low',      enabled: true },
  { id: 'r7', name: 'No Ear Protection', violationClass: 'no-ear',      confirmFrames: 1,  severity: 'medium',   enabled: true },
];

export const SEVERITY_COLORS: Record<Rule['severity'], string> = {
  critical: '#FF1744',
  high:     '#FF5252',
  medium:   '#FFB300',
  low:      '#64B5F6',
};

export function getSeverityColor(severity: Rule['severity']): string {
  return SEVERITY_COLORS[severity] ?? '#FFB300';
}
