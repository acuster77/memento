import type { Snapshot, SnapshotField } from '../utils/types';

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value',
)?.set;
const nativeInputCheckedSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'checked',
)?.set;
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  'value',
)?.set;
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
  HTMLSelectElement.prototype,
  'value',
)?.set;

export function applySnapshot(form: HTMLFormElement, snapshot: Snapshot): number {
  let applied = 0;
  let lastEl: HTMLElement | null = null;

  for (const field of snapshot.fields) {
    const el = findField(form, field);
    if (!el) continue;
    if (writeField(el, field)) {
      applied++;
      if (el instanceof HTMLElement) lastEl = el;
    }
  }

  lastEl?.blur();
  return applied;
}

function findField(form: HTMLFormElement, field: SnapshotField): Element | null {
  if (field.type === 'radio' && field.key.startsWith('radio:')) {
    const name = field.key.slice('radio:'.length);
    const radios = Array.from(form.elements).filter(
      (e) => e instanceof HTMLInputElement && e.type === 'radio' && e.name === name,
    ) as HTMLInputElement[];
    return radios.find((r) => r.value === field.value) ?? null;
  }
  if (field.key.startsWith('name:')) {
    const name = field.key.slice('name:'.length);
    return form.querySelector(`[name="${CSS.escape(name)}"]`);
  }
  if (field.key.startsWith('id:')) {
    const id = field.key.slice('id:'.length);
    return form.querySelector(`#${CSS.escape(id)}`);
  }
  return null;
}

function writeField(el: Element, field: SnapshotField): boolean {
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    if (t === 'checkbox') {
      const target = field.value === true;
      if (el.checked !== target) {
        nativeInputCheckedSetter?.call(el, target);
        dispatch(el);
      }
      return true;
    }
    if (t === 'radio') {
      if (!el.checked) {
        nativeInputCheckedSetter?.call(el, true);
        dispatch(el);
      }
      return true;
    }
    nativeInputValueSetter?.call(el, String(field.value));
    dispatch(el);
    return true;
  }
  if (el instanceof HTMLTextAreaElement) {
    nativeTextareaValueSetter?.call(el, String(field.value));
    dispatch(el);
    return true;
  }
  if (el instanceof HTMLSelectElement) {
    if (el.multiple && Array.isArray(field.value)) {
      const values = new Set(field.value);
      for (const opt of Array.from(el.options)) {
        opt.selected = values.has(opt.value);
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    nativeSelectValueSetter?.call(el, String(field.value));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLElement && el.isContentEditable && typeof field.value === 'string') {
    el.focus();
    el.innerHTML = field.value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  }
  return false;
}

function dispatch(el: Element): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
