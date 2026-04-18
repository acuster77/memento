import { defineContentScript } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { enumerateForms, buildIdentity, readFields } from '../components/scanner';
import { applySnapshot } from '../components/applier';
import { clearHighlight, highlightForm } from '../components/highlighter';
import { SnapshotStore } from '../utils/storage';
import type {
  Message,
  ApplyResponse,
  PreviewResponse,
  SaveResponse,
  ScanResponse,
} from '../utils/messages';
import type { Snapshot } from '../utils/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // webextension-polyfill handles the response automatically when we return
    // a Promise. Works on both Chrome and Firefox.
    browser.runtime.onMessage.addListener((msg: unknown) => {
      return handle(msg as Message).catch((err) => ({
        ok: false,
        error: String(err),
      }));
    });
  },
});

async function handle(
  msg: Message,
): Promise<ScanResponse | PreviewResponse | SaveResponse | ApplyResponse> {
  if (msg.kind === 'scan') {
    return { forms: enumerateForms() };
  }
  if (msg.kind === 'preview') {
    const form = document.forms[msg.formIndex];
    if (!form) return { ok: false, error: 'Form not found' };
    return {
      ok: true,
      identity: buildIdentity(form),
      fields: readFields(form, true),
      hasPassword: !!form.querySelector('input[type="password"]'),
      hasHidden: !!form.querySelector('input[type="hidden"]'),
      hasReadonly: !!form.querySelector(
        'input[readonly]:not([type="hidden"]), textarea[readonly]',
      ),
    };
  }
  if (msg.kind === 'save') {
    const form = document.forms[msg.formIndex];
    if (!form) return { ok: false, error: 'Form not found' };
    const fields = msg.fields;
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      label: msg.options.label,
      category: msg.options.category,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      form: buildIdentity(form),
      fields,
      flags: {
        containsSecrets: fields.some((f) => f.type === 'password'),
        containsHidden: fields.some((f) => f.type === 'hidden'),
        hasUnrestorableFiles: !!form.querySelector('input[type="file"]'),
      },
    };
    await SnapshotStore.save(snapshot);
    return { ok: true, snapshot };
  }
  if (msg.kind === 'highlight') {
    highlightForm(msg.formIndex, msg.scroll === true);
    return { ok: true } as ApplyResponse;
  }
  if (msg.kind === 'unhighlight') {
    clearHighlight();
    return { ok: true } as ApplyResponse;
  }
  if (msg.kind === 'apply') {
    const form = document.forms[msg.formIndex];
    if (!form) return { ok: false, error: 'Form not found' };
    const all = await SnapshotStore.all();
    const snap = all.find((s) => s.id === msg.snapshotId);
    if (!snap) return { ok: false, error: 'Snapshot not found' };
    const appliedCount = applySnapshot(form, snap);
    return { ok: true, appliedCount };
  }
  return { ok: false, error: 'Unknown message kind' };
}
