import type {
  DetectedForm,
  FieldOption,
  FormIdentity,
  SnapshotField,
} from '../utils/types';

export function enumerateForms(): DetectedForm[] {
  return Array.from(document.forms).map((form, index) => {
    const fieldCount = readFields(form, false).length;
    return {
      index,
      identity: buildIdentity(form),
      fieldCount,
      hasPassword: !!form.querySelector('input[type="password"]'),
      hasFile: !!form.querySelector('input[type="file"]'),
      hasHidden: !!form.querySelector('input[type="hidden"]'),
      hasReadonly: !!form.querySelector(
        'input[readonly]:not([type="hidden"]), textarea[readonly]',
      ),
    };
  });
}

export function buildIdentity(form: HTMLFormElement): FormIdentity {
  return {
    origin: location.origin,
    pathname: location.pathname,
    formId: form.id || undefined,
    formName: form.getAttribute('name') || undefined,
    action: form.action ? stripQuery(form.action) : undefined,
    domPath: cssPath(form),
    fingerprint: computeFingerprint(form),
  };
}

export function readFields(form: HTMLFormElement, includePasswords: boolean): SnapshotField[] {
  const result: SnapshotField[] = [];
  const radioGroupsSeen = new Set<string>();
  for (const el of Array.from(form.elements)) {
    const field = readField(el, radioGroupsSeen, includePasswords);
    if (field) result.push(field);
  }
  const editables = form.querySelectorAll<HTMLElement>('[contenteditable="true"]');
  editables.forEach((el, i) => {
    result.push({
      key: el.id ? `id:${el.id}` : `anon:contenteditable:${i}`,
      type: 'contenteditable',
      value: el.innerHTML,
      labelText: findLabel(el),
    });
  });
  return result;
}

function readField(
  el: Element,
  radioGroupsSeen: Set<string>,
  includePasswords: boolean,
): SnapshotField | null {
  const field = readFieldInner(el, radioGroupsSeen, includePasswords);
  if (
    field &&
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    el.readOnly
  ) {
    field.readonly = true;
  }
  return field;
}

function readFieldInner(
  el: Element,
  radioGroupsSeen: Set<string>,
  includePasswords: boolean,
): SnapshotField | null {
  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement) &&
    !(el instanceof HTMLSelectElement)
  ) {
    return null;
  }
  if ((el as HTMLInputElement).disabled) return null;

  const labelText = findLabel(el as HTMLElement);

  if (el instanceof HTMLInputElement) {
    const type = el.type;
    if (type === 'file' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
      return null;
    }
    if (type === 'password' && !includePasswords) return null;
    if (type === 'checkbox') {
      return { key: fieldKey(el), type: 'checkbox', value: el.checked, labelText };
    }
    if (type === 'radio') {
      if (!el.name || radioGroupsSeen.has(el.name)) return null;
      radioGroupsSeen.add(el.name);
      const form = el.form;
      if (!form) return null;
      const groupRadios = Array.from(form.elements).filter(
        (e) => e instanceof HTMLInputElement && e.type === 'radio' && e.name === el.name,
      ) as HTMLInputElement[];
      const selected = groupRadios.find((r) => r.checked);
      const options: FieldOption[] = groupRadios.map((r) => ({
        value: r.value,
        text: findLabel(r) ?? r.value,
      }));
      return {
        key: `radio:${el.name}`,
        type: 'radio',
        value: selected?.value ?? '',
        labelText: findRadioGroupLabel(el) ?? labelText,
        options,
      };
    }
    return { key: fieldKey(el), type: type || 'text', value: el.value, labelText };
  }
  if (el instanceof HTMLTextAreaElement) {
    return { key: fieldKey(el), type: 'textarea', value: el.value, labelText };
  }
  if (el instanceof HTMLSelectElement) {
    const options: FieldOption[] = Array.from(el.options).map((o) => ({
      value: o.value,
      text: o.textContent?.trim() || o.value,
    }));
    if (el.multiple) {
      return {
        key: fieldKey(el),
        type: 'select-multiple',
        value: Array.from(el.selectedOptions).map((o) => o.value),
        labelText,
        options,
      };
    }
    return {
      key: fieldKey(el),
      type: 'select-one',
      value: el.value,
      labelText,
      options,
    };
  }
  return null;
}

function fieldKey(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  if (el.name) return `name:${el.name}`;
  if (el.id) return `id:${el.id}`;
  const form = el.form;
  const tag = el.tagName.toLowerCase();
  const type = el instanceof HTMLInputElement ? el.type : tag;
  if (form) {
    const same = Array.from(form.elements).filter(
      (e) =>
        e.tagName === el.tagName &&
        (e instanceof HTMLInputElement ? e.type === type : true),
    );
    return `anon:${type}:${same.indexOf(el)}`;
  }
  return `anon:${type}`;
}

function findLabel(el: Element): string | undefined {
  // 1. Explicit <label for="id">
  if (el.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const text = lbl?.textContent?.trim();
    if (text) return text;
  }
  // 2. aria-labelledby / aria-label
  const ariaLbl = el.getAttribute('aria-labelledby');
  if (ariaLbl) {
    const target = document.getElementById(ariaLbl);
    const text = target?.textContent?.trim();
    if (text) return text;
  }
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  // 3. Wrapping <label>
  const parent = el.closest('label');
  const parentText = parent?.textContent?.trim();
  if (parentText) return parentText;
  // 4. Preceding sibling <label> (common "label then field" pattern)
  const sibLabel = findPrecedingSiblingLabel(el);
  if (sibLabel) return sibLabel;
  return undefined;
}

/** For a radio group, the individual radio is usually wrapped by a label
 * containing the option's inline text ("Free"). The *group* label (e.g.
 * "Plan") lives outside that wrapper. This walks out of any wrapping label
 * before looking for an implicit or fieldset-legend label. */
function findRadioGroupLabel(el: HTMLInputElement): string | undefined {
  const ariaLbl = el.getAttribute('aria-labelledby');
  if (ariaLbl) {
    const target = document.getElementById(ariaLbl);
    const text = target?.textContent?.trim();
    if (text) return text;
  }
  const wrap = el.closest('label');
  const start: Element = wrap ?? el;
  let node: Element | null = start;
  while (node && node.tagName !== 'FORM') {
    const sib = findPrecedingSiblingLabel(node);
    if (sib) return sib;
    if (node.tagName === 'FIELDSET') {
      const legend = node.querySelector(':scope > legend');
      const text = legend?.textContent?.trim();
      if (text) return text;
    }
    node = node.parentElement;
  }
  return undefined;
}

function findPrecedingSiblingLabel(el: Element): string | undefined {
  let prev: Element | null = el.previousElementSibling;
  while (prev) {
    if (prev.tagName === 'LABEL' && !prev.hasAttribute('for')) {
      // A label that wraps its own form control belongs to that control,
      // not to us — stop so we don't steal a sibling field's label.
      if (prev.querySelector('input, select, textarea')) break;
      const text = prev.textContent?.trim();
      if (text) return text;
    }
    // Stop at the previous form control; that label "belongs" to it.
    const tag = prev.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'FIELDSET') {
      break;
    }
    prev = prev.previousElementSibling;
  }
  return undefined;
}

function stripQuery(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

export function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && node.parentElement) {
    const parent = node.parentElement;
    const tag = node.tagName.toLowerCase();
    const currentNode = node;
    const siblings = Array.from(parent.children).filter((c) => c.tagName === currentNode.tagName);
    const index = siblings.indexOf(currentNode) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    node = parent;
  }
  return parts.join(' > ');
}

function computeFingerprint(form: HTMLFormElement): string {
  const tuples: string[] = [];
  for (const el of Array.from(form.elements)) {
    const tag = el.tagName.toLowerCase();
    const type = (el as HTMLInputElement).type ?? '';
    const name = (el as HTMLInputElement).name ?? '';
    const id = el.id ?? '';
    tuples.push(`${tag}|${type}|${name || id}`);
  }
  tuples.sort();
  return fnv1a(tuples.join(';'));
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
