import type { DetectedForm, FormIdentity, SaveOptions, Snapshot, SnapshotField } from './types';

export type Message =
  | { kind: 'scan' }
  | { kind: 'preview'; formIndex: number }
  | { kind: 'save'; formIndex: number; options: SaveOptions; fields: SnapshotField[] }
  | { kind: 'apply'; formIndex: number; snapshotId: string }
  | { kind: 'highlight'; formIndex: number; scroll?: boolean }
  | { kind: 'unhighlight' };

export type ScanResponse = { forms: DetectedForm[] };
export type PreviewResponse =
  | {
      ok: true;
      identity: FormIdentity;
      fields: SnapshotField[];
      hasPassword: boolean;
      hasHidden: boolean;
      hasReadonly: boolean;
    }
  | { ok: false; error: string };
export type SaveResponse = { ok: true; snapshot: Snapshot } | { ok: false; error: string };
export type ApplyResponse = { ok: true; appliedCount: number } | { ok: false; error: string };
