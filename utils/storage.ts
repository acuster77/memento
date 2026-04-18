import { storage } from 'wxt/storage';
import type { Snapshot } from './types';

const SCHEMA_VERSION = 1;

const snapshotsItem = storage.defineItem<Snapshot[]>('local:snapshots', {
  fallback: [],
  version: SCHEMA_VERSION,
});

export const SnapshotStore = {
  async all(): Promise<Snapshot[]> {
    return snapshotsItem.getValue();
  },
  async save(s: Snapshot): Promise<void> {
    const list = await snapshotsItem.getValue();
    list.push(s);
    await snapshotsItem.setValue(list);
  },
  async update(id: string, patch: Partial<Snapshot>): Promise<void> {
    const list = await snapshotsItem.getValue();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx]!, ...patch, updatedAt: Date.now() };
    await snapshotsItem.setValue(list);
  },
  async remove(id: string): Promise<void> {
    const list = await snapshotsItem.getValue();
    await snapshotsItem.setValue(list.filter((s) => s.id !== id));
  },
  async clearAll(): Promise<void> {
    await snapshotsItem.setValue([]);
  },
};
