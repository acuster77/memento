import { browser } from 'wxt/browser';
import { generate as fakerGenerate, rankedFakerOptions } from '../../components/faker';
import { SnapshotStore } from '../../utils/storage';
import type {
  ApplyResponse,
  Message,
  PreviewResponse,
  SaveResponse,
  ScanResponse,
} from '../../utils/messages';
import type {
  DetectedForm,
  FormIdentity,
  Snapshot,
  SnapshotField,
} from '../../utils/types';

const root = document.getElementById('root') as HTMLElement;
const screen = document.getElementById('screen') as HTMLElement;
document.getElementById('rescan')!.addEventListener('click', () => renderCurrentTab());

// ---------- action menu (kebab overflow) ----------

type MenuItem = { label: string; action: () => void; danger?: boolean };

let openMenuEl: HTMLElement | null = null;
let openMenuCleanup: (() => void) | null = null;

function closeActionMenu(): void {
  if (!openMenuEl) return;
  openMenuCleanup?.();
  openMenuEl.remove();
  openMenuEl = null;
  openMenuCleanup = null;
}

function openActionMenu(anchor: HTMLElement, items: MenuItem[]): void {
  // If this exact anchor already has an open menu, close it (toggle behaviour).
  if (
    openMenuEl &&
    anchor.dataset.menuId &&
    openMenuEl.dataset.anchorId === anchor.dataset.menuId
  ) {
    closeActionMenu();
    return;
  }
  closeActionMenu();

  const menu = document.createElement('div');
  menu.className = 'menu-popover';
  const anchorId = `m${Math.random().toString(36).slice(2, 8)}`;
  anchor.dataset.menuId = anchorId;
  menu.dataset.anchorId = anchorId;

  for (const item of items) {
    const b = document.createElement('button');
    b.textContent = item.label;
    if (item.danger) b.classList.add('menu-danger');
    b.addEventListener('click', () => {
      closeActionMenu();
      item.action();
    });
    menu.appendChild(b);
  }

  document.body.appendChild(menu);
  positionMenuBelow(anchor, menu);

  const onOutside = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && e.target !== anchor) {
      closeActionMenu();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeActionMenu();
  };
  // Defer attaching the click listener so the current click doesn't close it.
  const t = setTimeout(() => document.addEventListener('click', onOutside), 0);
  document.addEventListener('keydown', onKey);

  openMenuEl = menu;
  openMenuCleanup = () => {
    clearTimeout(t);
    document.removeEventListener('click', onOutside);
    document.removeEventListener('keydown', onKey);
  };
}

function positionMenuBelow(anchor: HTMLElement, menu: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const mh = menu.offsetHeight;
  const mw = menu.offsetWidth;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = rect.bottom + 4;
  if (top + mh > vh - 4 && rect.top - mh - 4 > 0) {
    top = rect.top - mh - 4;
  }
  let left = rect.right - mw;
  if (left < 4) left = 4;
  if (left + mw > vw - 4) left = vw - mw - 4;
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

// ---------- tabs ----------

type TabId = 'forms' | 'library';
let currentTab: TabId = 'forms';

const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
for (const btn of tabButtons) {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab as TabId;
    switchTab(tab);
  });
}

function switchTab(tab: TabId): void {
  if (currentTab === tab) return;
  currentTab = tab;
  for (const btn of tabButtons) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
  renderCurrentTab();
}

function renderCurrentTab(): Promise<void> {
  document.body.classList.remove('in-subview');
  return currentTab === 'forms' ? renderForms() : renderLibrary();
}

renderCurrentTab();

type NavDirection = 'forward' | 'back';

const prefersReducedMotion =
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const EXIT_MS = 160;
const ENTER_MS = 220;
const EXIT_EASE = 'cubic-bezier(0.4, 0, 1, 1)';
const ENTER_EASE = 'cubic-bezier(0, 0, 0.2, 1)';

async function navigate(
  direction: NavDirection,
  update: () => void | Promise<void>,
): Promise<void> {
  closeActionMenu();
  if (prefersReducedMotion) {
    await update();
    return;
  }
  const exitTo = direction === 'forward' ? '-30%' : '30%';
  const enterFrom = direction === 'forward' ? '30%' : '-30%';

  await runAnimation(
    screen,
    [
      { transform: 'translateX(0)', opacity: 1 },
      { transform: `translateX(${exitTo})`, opacity: 0 },
    ],
    { duration: EXIT_MS, easing: EXIT_EASE, fill: 'forwards' },
  );

  await update();
  root.scrollTop = 0;

  await runAnimation(
    screen,
    [
      { transform: `translateX(${enterFrom})`, opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 },
    ],
    { duration: ENTER_MS, easing: ENTER_EASE, fill: 'forwards' },
  );
}

async function runAnimation(
  el: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Promise<void> {
  const anim = el.animate(keyframes, options);
  try {
    await anim.finished;
    // Freeze the final frame as inline styles so the layer doesn't demote
    // and no layout/paint change happens when the animation effect ends.
    anim.commitStyles();
  } catch {
    // aborted/cancelled
  } finally {
    anim.cancel();
  }
}

// ---------- This Page tab ----------

async function renderForms(): Promise<void> {
  screen.innerHTML = '<p class="loading">Scanning…</p>';
  let scan: ScanResponse;
  try {
    scan = await sendToActiveTab<ScanResponse>({ kind: 'scan' });
  } catch (e) {
    screen.innerHTML = `<p class="error">Cannot scan this page.<br/>${escapeHtml(String(e))}</p>`;
    return;
  }
  const all = await SnapshotStore.all();
  screen.innerHTML = '';

  if (scan.forms.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No forms detected on this page.';
    screen.appendChild(p);
    return;
  }
  const ranked = scan.forms
    .map((form, originalIndex) => ({
      form,
      originalIndex,
      matchCount: scoreMatches(all, form.identity).length,
    }))
    .sort((a, b) => b.matchCount - a.matchCount || a.originalIndex - b.originalIndex);
  for (const { form } of ranked) {
    screen.appendChild(renderFormCard(form, all));
  }
}

async function fetchActiveFormsSilently(): Promise<DetectedForm[]> {
  try {
    const scan = await sendToActiveTab<ScanResponse>({ kind: 'scan' });
    return scan.forms;
  } catch {
    return [];
  }
}

// ---------- Library tab ----------

async function renderLibrary(): Promise<void> {
  screen.innerHTML = '<p class="loading">Loading…</p>';
  const all = await SnapshotStore.all();
  const forms = all.length > 0 ? await fetchActiveFormsSilently() : [];
  screen.innerHTML = '';

  if (all.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No snapshots saved yet.';
    screen.appendChild(p);
    screen.appendChild(renderDataTools(all));
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'all-list';
  for (const s of all) ul.appendChild(renderAllItem(s, forms));
  screen.appendChild(ul);

  screen.appendChild(renderDataTools(all));
}

function renderFormCard(form: DetectedForm, all: Snapshot[]): HTMLElement {
  const el = document.createElement('section');
  el.className = 'form-card';
  el.addEventListener('mouseenter', () => {
    sendToActiveTab({ kind: 'highlight', formIndex: form.index, scroll: true }).catch(
      () => {},
    );
  });
  el.addEventListener('mouseleave', () => {
    sendToActiveTab({ kind: 'unhighlight' }).catch(() => {});
  });

  const title = formTitle(form);

  el.innerHTML = `
    <header>
      <strong>${escapeHtml(title)}</strong>
      <span class="meta">${form.fieldCount} field${form.fieldCount === 1 ? '' : 's'}</span>
    </header>
    <div class="selector-line" title="Selector used to re-find this form">${escapeHtml(form.identity.domPath)}</div>
    <ul class="matches"></ul>
    <div class="card-actions">
      <button class="save primary">New Snapshot</button>
    </div>
  `;

  (el.querySelector('.save') as HTMLButtonElement).addEventListener('click', () =>
    openSavePreview(form),
  );

  const list = el.querySelector('.matches') as HTMLUListElement;
  const matches = scoreMatches(all, form.identity);
  if (matches.length === 0) {
    list.innerHTML = '<li class="empty inline">No matching snapshots</li>';
  } else {
    for (const m of matches) {
      list.appendChild(renderMatch(m.snapshot, form.index));
    }
  }
  return el;
}

function renderMatch(s: Snapshot, formIndex: number): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'match';
  const secret = s.flags.containsSecrets ? ' <span class="badge danger">secrets</span>' : '';
  li.innerHTML = `
    <div>
      <strong>${escapeHtml(s.label)}</strong>
      ${secret}
    </div>
    <div class="actions">
      <button class="apply primary">Apply</button>
      <button class="menu-btn" title="More actions" aria-label="More actions">⋮</button>
    </div>
  `;
  (li.querySelector('.apply') as HTMLButtonElement).addEventListener('click', () =>
    applyTo(formIndex, s.id),
  );
  const menuBtn = li.querySelector('.menu-btn') as HTMLButtonElement;
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openActionMenu(menuBtn, [
      { label: 'Edit', action: () => openEditSnapshot(s) },
      { label: 'Export JSON', action: () => exportSnapshot(s) },
      { label: 'Delete', action: () => openDeleteConfirm(s), danger: true },
    ]);
  });
  return li;
}

function renderAllItem(s: Snapshot, forms: DetectedForm[]): HTMLLIElement {
  const li = document.createElement('li');
  const secret = s.flags.containsSecrets ? ' <span class="badge danger">secrets</span>' : '';
  const info = document.createElement('div');
  info.innerHTML = `
    <strong>${escapeHtml(s.label)}</strong>
    ${secret}
    <div class="meta-line">${escapeHtml(s.form.origin)}${escapeHtml(s.form.pathname)}</div>
  `;
  li.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const select = document.createElement('select');
  select.innerHTML =
    `<option value="">Apply to…</option>` +
    forms.map((f, i) => `<option value="${i}">${escapeHtml(formTitle(f))}</option>`).join('');
  select.addEventListener('change', async () => {
    if (select.value === '') return;
    const idx = Number(select.value);
    await applyTo(idx, s.id);
    select.value = '';
  });

  const menuBtn = document.createElement('button');
  menuBtn.className = 'menu-btn';
  menuBtn.textContent = '⋮';
  menuBtn.title = 'More actions';
  menuBtn.setAttribute('aria-label', 'More actions');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openActionMenu(menuBtn, [
      { label: 'Edit', action: () => openEditSnapshot(s) },
      { label: 'Export JSON', action: () => exportSnapshot(s) },
      { label: 'Delete', action: () => openDeleteConfirm(s), danger: true },
    ]);
  });

  actions.appendChild(select);
  actions.appendChild(menuBtn);
  li.appendChild(actions);
  return li;
}

function renderDataTools(all: Snapshot[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'data-tools';

  const exportAll = document.createElement('button');
  exportAll.textContent = `Export all (${all.length})`;
  exportAll.disabled = all.length === 0;
  exportAll.addEventListener('click', () => exportAllSnapshots(all));

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Import JSON…';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) await importFromFile(file);
    fileInput.value = '';
  });

  importBtn.addEventListener('click', () => fileInput.click());

  const clearAllBtn = document.createElement('button');
  clearAllBtn.textContent = 'Clear all';
  clearAllBtn.className = 'ghost-danger';
  clearAllBtn.disabled = all.length === 0;
  clearAllBtn.addEventListener('click', () => openClearAllConfirm(all.length));

  wrap.appendChild(exportAll);
  wrap.appendChild(importBtn);
  wrap.appendChild(clearAllBtn);
  wrap.appendChild(fileInput);
  return wrap;
}

// ---------- clear-all confirm view ----------

async function openClearAllConfirm(count: number): Promise<void> {
  await navigate('forward', () => {
    renderClearAllConfirm(count);
  });
  const cancelBtn = document.querySelector<HTMLButtonElement>('.clear-all-view .cancel');
  cancelBtn?.focus({ preventScroll: true });
}

function renderClearAllConfirm(count: number): void {
  document.body.classList.add('in-subview');
  screen.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'preview-view clear-all-view';

  const header = document.createElement('div');
  header.className = 'preview-header';
  header.innerHTML = `
    <button class="back" title="Back">←</button>
    <strong>Clear all snapshots</strong>
    <span class="meta">${count} total</span>
  `;
  (header.querySelector('.back') as HTMLButtonElement).addEventListener('click', backToList);
  view.appendChild(header);

  const warn = document.createElement('p');
  warn.className = 'confirm-prompt';
  warn.textContent = `This will permanently delete all ${count} saved snapshot${
    count === 1 ? '' : 's'
  }. This cannot be undone. Export first if you want a backup.`;
  view.appendChild(warn);

  const footer = document.createElement('div');
  footer.className = 'preview-footer';
  footer.innerHTML = `
    <button class="cancel">Cancel</button>
    <button class="confirm danger">Delete all ${count} snapshot${count === 1 ? '' : 's'}</button>
  `;
  view.appendChild(footer);

  screen.appendChild(view);

  const cancelBtn = footer.querySelector('.cancel') as HTMLButtonElement;
  const confirmBtn = footer.querySelector('.confirm') as HTMLButtonElement;

  cancelBtn.addEventListener('click', backToList);
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    await SnapshotStore.clearAll();
    toast(`Cleared ${count} snapshot${count === 1 ? '' : 's'}`);
    await backToList();
  });

  view.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') backToList();
  });
}

// ---------- import / export ----------

const EXPORT_VERSION = 1;

function exportSnapshot(s: Snapshot): void {
  const filename = `snapshot-${slugify(s.label)}-${s.id.slice(0, 8)}.json`;
  downloadJson(
    { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), snapshots: [s] },
    filename,
  );
}

function exportAllSnapshots(snapshots: Snapshot[]): void {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `form-snapshots-${date}.json`;
  downloadJson(
    { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), snapshots },
    filename,
  );
  toast(`Exported ${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}`);
}

async function importFromFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    const incoming = extractSnapshots(parsed);
    if (incoming.length === 0) {
      toast('No snapshots found in file', true);
      return;
    }
    const existing = await SnapshotStore.all();
    const existingIds = new Set(existing.map((s) => s.id));
    let imported = 0;
    for (const raw of incoming) {
      const s: Snapshot = {
        ...raw,
        id: existingIds.has(raw.id) ? crypto.randomUUID() : raw.id,
        createdAt: raw.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await SnapshotStore.save(s);
      existingIds.add(s.id);
      imported++;
    }
    toast(`Imported ${imported} snapshot${imported === 1 ? '' : 's'}`);
    renderCurrentTab();
  } catch (e) {
    toast(`Import failed: ${String(e)}`, true);
  }
}

function extractSnapshots(parsed: unknown): Snapshot[] {
  if (Array.isArray(parsed)) return parsed.filter(isSnapshotLike);
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { snapshots?: unknown };
    if (Array.isArray(obj.snapshots)) return obj.snapshots.filter(isSnapshotLike);
    if (isSnapshotLike(parsed)) return [parsed];
  }
  return [];
}

function isSnapshotLike(x: unknown): x is Snapshot {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.label === 'string' &&
    typeof o.form === 'object' &&
    o.form !== null &&
    Array.isArray(o.fields)
  );
}

function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'snapshot'
  );
}

// ---------- save-preview view ----------

async function openSavePreview(form: DetectedForm): Promise<void> {
  let preview: PreviewResponse;
  try {
    preview = await sendToActiveTab<PreviewResponse>({
      kind: 'preview',
      formIndex: form.index,
    });
  } catch (e) {
    screen.innerHTML = `<p class="error">Cannot read form.<br/>${escapeHtml(String(e))}</p>`;
    return;
  }
  if (!preview.ok) {
    screen.innerHTML = `<p class="error">${escapeHtml(preview.error)}</p>`;
    return;
  }
  const p = preview;
  await navigate('forward', () => {
    renderSavePreview(form, p.identity, p.fields, {
      hasPassword: p.hasPassword,
      hasHidden: p.hasHidden,
      hasReadonly: p.hasReadonly,
    });
  });
  // Focus after the enter animation completes so that Chrome's scroll-into-view
  // behaviour on focus does not interact with the running animation.
  const labelInput = document.getElementById('snap-label') as HTMLInputElement | null;
  labelInput?.focus({ preventScroll: true });
  labelInput?.select();
}

function generateDefaultLabel(selector: string): string {
  return `${selector} ${Math.floor(Date.now() / 1000)}`;
}

async function backToList(): Promise<void> {
  await navigate('back', renderCurrentTab);
}

type PreviewFormConfig = {
  headerTitle: string;
  headerMeta: string;
  selector?: string;
  initialLabel: string;
  confirmButtonText: string;
  fields: SnapshotField[];
  hasPassword: boolean;
  hasHidden: boolean;
  hasReadonly: boolean;
  initialIncludePwd: boolean;
  initialIncludeHidden: boolean;
  initialIncludeReadonly: boolean;
  onConfirm: (data: {
    label: string;
    includePwd: boolean;
    includeHidden: boolean;
    includeReadonly: boolean;
    editedFields: SnapshotField[];
  }) => Promise<{ ok: true; toast: string } | { ok: false; error: string }>;
};

function renderSavePreview(
  form: DetectedForm,
  _identity: FormIdentity,
  fields: SnapshotField[],
  has: { hasPassword: boolean; hasHidden: boolean; hasReadonly: boolean },
): void {
  renderPreviewForm({
    headerTitle: 'New Snapshot',
    headerMeta: formTitle(form),
    selector: form.identity.domPath,
    initialLabel: generateDefaultLabel(form.identity.domPath),
    confirmButtonText: 'Save snapshot',
    fields,
    hasPassword: has.hasPassword,
    hasHidden: has.hasHidden,
    hasReadonly: has.hasReadonly,
    initialIncludePwd: false,
    initialIncludeHidden: false,
    initialIncludeReadonly: false,
    onConfirm: async (data) => {
      const res = await sendToActiveTab<SaveResponse>({
        kind: 'save',
        formIndex: form.index,
        options: {
          label: data.label,
          includePasswords: data.includePwd,
        },
        fields: data.editedFields,
      });
      if (res.ok) return { ok: true, toast: `Saved "${res.snapshot.label}"` };
      return { ok: false, error: res.error };
    },
  });
}

function renderEditSnapshot(snapshot: Snapshot): void {
  const hasPassword = snapshot.fields.some((f) => f.type === 'password');
  const hasHidden = snapshot.fields.some((f) => f.type === 'hidden');
  const hasReadonly = snapshot.fields.some((f) => f.readonly);

  renderPreviewForm({
    headerTitle: 'Edit Snapshot',
    headerMeta: snapshot.label,
    selector: snapshot.form.domPath,
    initialLabel: snapshot.label,
    confirmButtonText: 'Save changes',
    fields: snapshot.fields,
    hasPassword,
    hasHidden,
    hasReadonly,
    initialIncludePwd: hasPassword,
    initialIncludeHidden: hasHidden,
    initialIncludeReadonly: hasReadonly,
    onConfirm: async (data) => {
      await SnapshotStore.update(snapshot.id, {
        label: data.label,
        fields: data.editedFields,
        flags: {
          containsSecrets:
            data.includePwd && data.editedFields.some((f) => f.type === 'password'),
          containsHidden: data.editedFields.some((f) => f.type === 'hidden'),
          hasUnrestorableFiles: snapshot.flags.hasUnrestorableFiles,
        },
      });
      return { ok: true, toast: `Updated "${data.label}"` };
    },
  });
}

function renderPreviewForm(config: PreviewFormConfig): void {
  document.body.classList.add('in-subview');
  screen.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'preview-view';

  const header = document.createElement('div');
  header.className = 'preview-header';
  header.innerHTML = `
    <button class="back" title="Back">←</button>
    <strong>${escapeHtml(config.headerTitle)}</strong>
    <span class="meta">${escapeHtml(config.headerMeta)}</span>
  `;
  (header.querySelector('.back') as HTMLButtonElement).addEventListener('click', backToList);
  view.appendChild(header);

  if (config.selector) {
    const sel = document.createElement('div');
    sel.className = 'selector-line';
    sel.title = 'Selector used to re-find this form';
    sel.textContent = config.selector;
    view.appendChild(sel);
  }

  const labelField = document.createElement('label');
  labelField.className = 'field';
  labelField.innerHTML = `
    <span>Label <em>required</em></span>
    <div class="label-row">
      <input type="text" id="snap-label" autocomplete="off" placeholder="e.g. dev-admin-login" />
      <button type="button" class="gen-btn" title="Regenerate default label">Generate</button>
    </div>
  `;
  view.appendChild(labelField);

  const toggles = document.createElement('div');
  toggles.className = 'toggle-group';
  const toggleRows: string[] = [];
  if (config.hasPassword) {
    toggleRows.push(`
      <label class="toggle">
        <input type="checkbox" id="snap-include-pwd" />
        <span>Include password fields</span>
      </label>
    `);
  }
  if (config.hasHidden) {
    toggleRows.push(`
      <label class="toggle">
        <input type="checkbox" id="snap-include-hidden" />
        <span>Include hidden fields</span>
      </label>
    `);
  }
  if (config.hasReadonly) {
    toggleRows.push(`
      <label class="toggle">
        <input type="checkbox" id="snap-include-readonly" />
        <span>Include readonly fields</span>
      </label>
    `);
  }
  if (toggleRows.length === 0) {
    toggles.style.display = 'none';
  } else {
    toggles.innerHTML = toggleRows.join('');
  }
  view.appendChild(toggles);

  const previewPanel = document.createElement('div');
  previewPanel.className = 'preview-panel';
  const titleEl = document.createElement('div');
  titleEl.className = 'preview-title';
  const gridEl = document.createElement('div');
  gridEl.className = 'preview-grid';
  previewPanel.appendChild(titleEl);
  previewPanel.appendChild(gridEl);
  view.appendChild(previewPanel);

  const footer = document.createElement('div');
  footer.className = 'preview-footer';
  footer.innerHTML = `
    <button class="cancel">Cancel</button>
    <button class="confirm primary" disabled>${escapeHtml(config.confirmButtonText)}</button>
  `;
  view.appendChild(footer);

  screen.appendChild(view);

  const labelInput = view.querySelector('#snap-label') as HTMLInputElement;
  const includePwdInput = view.querySelector('#snap-include-pwd') as HTMLInputElement | null;
  const includeHiddenInput = view.querySelector('#snap-include-hidden') as HTMLInputElement | null;
  const includeReadonlyInput = view.querySelector('#snap-include-readonly') as HTMLInputElement | null;
  const confirmBtn = footer.querySelector('.confirm') as HTMLButtonElement;
  const cancelBtn = footer.querySelector('.cancel') as HTMLButtonElement;

  labelInput.value = config.initialLabel;
  if (includePwdInput) includePwdInput.checked = config.initialIncludePwd;
  if (includeHiddenInput) includeHiddenInput.checked = config.initialIncludeHidden;
  if (includeReadonlyInput) includeReadonlyInput.checked = config.initialIncludeReadonly;

  const editors = new Map<
    string,
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >();

  const fieldIsIncluded = (f: SnapshotField): boolean => {
    if (f.type === 'password' && !(includePwdInput?.checked ?? false)) return false;
    if (f.type === 'hidden' && !(includeHiddenInput?.checked ?? false)) return false;
    if (f.readonly && !(includeReadonlyInput?.checked ?? false)) return false;
    return true;
  };

  const repaintTable = () => {
    editors.clear();
    const visible = config.fields.filter(fieldIsIncluded);
    titleEl.textContent = `Preview (${visible.length} of ${config.fields.length} field${
      config.fields.length === 1 ? '' : 's'
    })`;
    gridEl.innerHTML = '';
    if (visible.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty inline preview-empty';
      p.textContent = 'No fields to capture with current settings.';
      gridEl.appendChild(p);
      return;
    }
    for (const f of visible) {
      const nameEl = document.createElement('div');
      nameEl.className = 'pv-name' + (f.readonly ? ' is-readonly' : '');
      nameEl.textContent = fieldDisplayLabel(f);

      const valueEl = document.createElement('div');
      valueEl.className = 'pv-value pv-type-' + f.type;
      const { wrapper, input } = createEditor(f);
      editors.set(f.key, input);
      valueEl.appendChild(wrapper);
      if (canFakeField(f, input)) {
        valueEl.appendChild(buildFakerButton(f, input));
      }

      gridEl.appendChild(nameEl);
      gridEl.appendChild(valueEl);
    }
  };

  const validate = () => {
    confirmBtn.disabled = labelInput.value.trim().length === 0;
  };
  validate();

  const genBtn = view.querySelector('.gen-btn') as HTMLButtonElement;
  if (config.selector) {
    genBtn.addEventListener('click', (e) => {
      e.preventDefault();
      labelInput.value = generateDefaultLabel(config.selector as string);
      labelInput.focus();
      labelInput.select();
      validate();
    });
  } else {
    genBtn.disabled = true;
  }

  labelInput.addEventListener('input', validate);
  includePwdInput?.addEventListener('change', repaintTable);
  includeHiddenInput?.addEventListener('change', repaintTable);
  includeReadonlyInput?.addEventListener('change', repaintTable);
  cancelBtn.addEventListener('click', backToList);
  confirmBtn.addEventListener('click', async () => {
    const label = labelInput.value.trim();
    if (!label) return;
    confirmBtn.disabled = true;
    const editedFields: SnapshotField[] = [];
    for (const f of config.fields) {
      if (!fieldIsIncluded(f)) continue;
      const editor = editors.get(f.key);
      editedFields.push(editor ? readEditor(f, editor) : f);
    }
    const res = await config.onConfirm({
      label,
      includePwd: includePwdInput?.checked ?? false,
      includeHidden: includeHiddenInput?.checked ?? false,
      includeReadonly: includeReadonlyInput?.checked ?? false,
      editedFields,
    });
    if (res.ok) {
      toast(res.toast);
      await backToList();
    } else {
      toast(`Save failed: ${res.error}`, true);
      confirmBtn.disabled = false;
    }
  });

  labelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !confirmBtn.disabled) confirmBtn.click();
    if (e.key === 'Escape') backToList();
  });

  repaintTable();
}

async function openEditSnapshot(snapshot: Snapshot): Promise<void> {
  await navigate('forward', () => {
    renderEditSnapshot(snapshot);
  });
  const labelInput = document.getElementById('snap-label') as HTMLInputElement | null;
  labelInput?.focus({ preventScroll: true });
  labelInput?.select();
}

type EditorResult = {
  wrapper: HTMLElement;
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
};

function createEditor(f: SnapshotField): EditorResult {
  switch (f.type) {
    case 'checkbox': {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'edit-check';
      cb.checked = f.value === true;
      return { wrapper: cb, input: cb };
    }
    case 'radio':
    case 'select-one': {
      const sel = document.createElement('select');
      sel.className = 'edit-input';
      const current = typeof f.value === 'string' ? f.value : '';
      const opts = f.options ?? [];
      if (current !== '' && !opts.some((o) => o.value === current)) {
        const o = document.createElement('option');
        o.value = current;
        o.textContent = `${current} (current)`;
        sel.appendChild(o);
      }
      for (const opt of opts) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.text || opt.value;
        sel.appendChild(o);
      }
      sel.value = current;
      return { wrapper: sel, input: sel };
    }
    case 'select-multiple': {
      const sel = document.createElement('select');
      sel.className = 'edit-input edit-multi';
      sel.multiple = true;
      const opts = f.options ?? [];
      const currentArr = Array.isArray(f.value) ? f.value : [];
      const current = new Set(currentArr);
      for (const cv of currentArr) {
        if (!opts.some((o) => o.value === cv)) {
          const o = document.createElement('option');
          o.value = cv;
          o.textContent = `${cv} (current)`;
          o.selected = true;
          sel.appendChild(o);
        }
      }
      for (const opt of opts) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.text || opt.value;
        o.selected = current.has(opt.value);
        sel.appendChild(o);
      }
      sel.size = Math.min(Math.max(sel.options.length, 2), 4);
      return { wrapper: sel, input: sel };
    }
    case 'textarea':
    case 'contenteditable': {
      const ta = document.createElement('textarea');
      ta.className = 'edit-input edit-textarea';
      ta.rows = 3;
      ta.value = typeof f.value === 'string' ? f.value : '';
      return { wrapper: ta, input: ta };
    }
    default: {
      const inp = document.createElement('input');
      inp.className = 'edit-input';
      inp.type = f.type === 'password' ? 'password' : 'text';
      inp.value =
        typeof f.value === 'string'
          ? f.value
          : typeof f.value === 'boolean'
            ? String(f.value)
            : String(f.value ?? '');
      return { wrapper: inp, input: inp };
    }
  }
}

function canFakeField(
  f: SnapshotField,
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): boolean {
  if (input instanceof HTMLSelectElement) return false;
  if (input instanceof HTMLInputElement && input.type === 'checkbox') return false;
  if (f.readonly) return false;
  return true;
}

function buildFakerButton(
  field: SnapshotField,
  input: HTMLInputElement | HTMLTextAreaElement,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'faker-btn';
  btn.title = 'Fill with generated data';
  btn.setAttribute('aria-label', 'Fill with generated data');
  btn.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 L13.5 9 L19.5 10.5 L13.5 12 L12 18 L10.5 12 L4.5 10.5 L10.5 9 Z"/>
      <path d="M18.5 14 L19.25 16.25 L21.5 17 L19.25 17.75 L18.5 20 L17.75 17.75 L15.5 17 L17.75 16.25 Z"/>
    </svg>
  `;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openGeneratorPane(field, input);
  });
  return btn;
}

let activePane: HTMLElement | null = null;
let activePaneCleanup: (() => void) | null = null;

function openGeneratorPane(
  field: SnapshotField,
  input: HTMLInputElement | HTMLTextAreaElement,
): void {
  closeGeneratorPane();

  const backdrop = document.createElement('div');
  backdrop.className = 'gen-backdrop';

  const pane = document.createElement('div');
  pane.className = 'gen-pane';
  const appHeader = document.querySelector('.app-header') as HTMLElement | null;
  const top = appHeader ? appHeader.getBoundingClientRect().bottom : 0;
  backdrop.style.top = `${top}px`;
  pane.style.top = `${top}px`;

  const context = field.labelText || fieldDisplayLabel(field);
  pane.innerHTML = `
    <header class="gen-pane-header">
      <button type="button" class="gen-pane-close" aria-label="Close generator pane">&#x2715;</button>
      <div class="gen-pane-title">
        <span class="gen-pane-eyebrow">Generate for</span>
        <strong>${escapeHtml(context)}</strong>
      </div>
    </header>
    <div class="gen-pane-list" role="list"></div>
  `;

  const list = pane.querySelector('.gen-pane-list') as HTMLDivElement;
  const ranked = rankedFakerOptions({
    type: field.type,
    label: field.labelText,
    fieldKey: field.key,
  });
  for (const opt of ranked) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'gen-pane-row';
    row.textContent = opt.label;
    row.addEventListener('click', () => {
      input.value = fakerGenerate(opt.key);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      closeGeneratorPane();
    });
    list.appendChild(row);
  }

  (pane.querySelector('.gen-pane-close') as HTMLButtonElement).addEventListener(
    'click',
    closeGeneratorPane,
  );
  backdrop.addEventListener('click', closeGeneratorPane);

  document.body.appendChild(backdrop);
  document.body.appendChild(pane);
  activePane = pane;
  activeBackdrop = backdrop;
  requestAnimationFrame(() => {
    pane.classList.add('open');
    backdrop.classList.add('open');
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeGeneratorPane();
  };
  document.addEventListener('keydown', onKey);
  activePaneCleanup = () => {
    document.removeEventListener('keydown', onKey);
  };
}

let activeBackdrop: HTMLElement | null = null;

function closeGeneratorPane(): void {
  if (activePaneCleanup) {
    activePaneCleanup();
    activePaneCleanup = null;
  }
  if (activePane) {
    const pane = activePane;
    pane.classList.remove('open');
    setTimeout(() => pane.remove(), 220);
    activePane = null;
  }
  if (activeBackdrop) {
    const b = activeBackdrop;
    b.classList.remove('open');
    setTimeout(() => b.remove(), 220);
    activeBackdrop = null;
  }
}

function readEditor(
  f: SnapshotField,
  input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): SnapshotField {
  if (input instanceof HTMLInputElement && input.type === 'checkbox') {
    return { ...f, value: input.checked };
  }
  if (input instanceof HTMLSelectElement && input.multiple) {
    return { ...f, value: Array.from(input.selectedOptions).map((o) => o.value) };
  }
  return { ...f, value: input.value };
}

// ---------- delete confirm view ----------

async function openDeleteConfirm(snapshot: Snapshot): Promise<void> {
  await navigate('forward', () => {
    renderDeleteConfirm(snapshot);
  });
  const cancelBtn = document.querySelector<HTMLButtonElement>('.delete-view .cancel');
  cancelBtn?.focus({ preventScroll: true });
}

function renderDeleteConfirm(snapshot: Snapshot): void {
  document.body.classList.add('in-subview');
  screen.innerHTML = '';

  const view = document.createElement('div');
  view.className = 'preview-view delete-view';

  const header = document.createElement('div');
  header.className = 'preview-header';
  header.innerHTML = `
    <button class="back" title="Back">←</button>
    <strong>Delete snapshot</strong>
    <span class="meta">${escapeHtml(snapshot.label)}</span>
  `;
  (header.querySelector('.back') as HTMLButtonElement).addEventListener('click', backToList);
  view.appendChild(header);

  const warn = document.createElement('p');
  warn.className = 'confirm-prompt';
  warn.textContent = 'Are you sure you want to delete this snapshot? This cannot be undone.';
  view.appendChild(warn);

  const panel = document.createElement('div');
  panel.className = 'preview-panel';
  const tbl = document.createElement('table');
  tbl.className = 'preview-table';
  tbl.innerHTML = `
    <tr><td class="k">Label</td><td class="v">${escapeHtml(snapshot.label)}</td></tr>
    <tr><td class="k">Origin</td><td class="v">${escapeHtml(snapshot.form.origin)}${escapeHtml(snapshot.form.pathname)}</td></tr>
    <tr><td class="k">Fields</td><td class="v">${snapshot.fields.length}</td></tr>
    <tr><td class="k">Saved</td><td class="v">${escapeHtml(new Date(snapshot.createdAt).toLocaleString())}</td></tr>
    ${snapshot.flags.containsSecrets ? '<tr><td class="k">Flags</td><td class="v"><span class="badge danger">secrets</span></td></tr>' : ''}
  `;
  panel.appendChild(tbl);
  view.appendChild(panel);

  const footer = document.createElement('div');
  footer.className = 'preview-footer';
  footer.innerHTML = `
    <button class="cancel">Cancel</button>
    <button class="confirm danger">Delete snapshot</button>
  `;
  view.appendChild(footer);

  screen.appendChild(view);

  const cancelBtn = footer.querySelector('.cancel') as HTMLButtonElement;
  const confirmBtn = footer.querySelector('.confirm') as HTMLButtonElement;

  cancelBtn.addEventListener('click', backToList);
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    await SnapshotStore.remove(snapshot.id);
    toast(`Deleted "${snapshot.label}"`);
    await backToList();
  });

  view.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') backToList();
  });
}

// ---------- apply ----------

async function applyTo(formIndex: number, snapshotId: string): Promise<void> {
  const res = await sendToActiveTab<ApplyResponse>({
    kind: 'apply',
    formIndex,
    snapshotId,
  });
  if (res.ok) toast(`Applied ${res.appliedCount} fields`);
  else toast(`Apply failed: ${res.error}`, true);
}

// ---------- helpers ----------

function scoreMatches(
  all: Snapshot[],
  identity: FormIdentity,
): { snapshot: Snapshot; score: number }[] {
  const matches: { snapshot: Snapshot; score: number }[] = [];
  for (const s of all) {
    if (s.form.origin !== identity.origin) continue;
    const a = s.form;
    let score = 0;
    if (a.formId && a.formId === identity.formId) score = Math.max(score, 100);
    if (a.formName && a.formName === identity.formName) score = Math.max(score, 80);
    if (a.fingerprint && a.fingerprint === identity.fingerprint) score = Math.max(score, 70);
    if (a.action && a.action === identity.action) score = Math.max(score, 60);
    if (a.domPath && a.domPath === identity.domPath) score = Math.max(score, 40);
    if (score > 0 && a.pathname === identity.pathname) score += 5;
    if (score > 0) matches.push({ snapshot: s, score });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

function formTitle(f: DetectedForm): string {
  if (f.identity.formId) return `#${f.identity.formId}`;
  if (f.identity.formName) return `name="${f.identity.formName}"`;
  return `Form ${f.index + 1}`;
}

function fieldDisplayLabel(f: SnapshotField): string {
  if (f.labelText) return f.labelText;
  if (f.key.startsWith('name:')) return f.key.slice('name:'.length);
  if (f.key.startsWith('id:')) return f.key.slice('id:'.length);
  if (f.key.startsWith('radio:')) return f.key.slice('radio:'.length);
  return f.key;
}


async function sendToActiveTab<R>(msg: Message): Promise<R> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');
  return browser.tabs.sendMessage(tab.id, msg) as Promise<R>;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  );
}

function toast(msg: string, error = false): void {
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
