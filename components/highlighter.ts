type Saved = {
  el: HTMLElement;
  outline: string;
  outlineOffset: string;
  boxShadow: string;
  transition: string;
};

let current: Saved | null = null;

export function highlightForm(formIndex: number, scroll: boolean): void {
  clearHighlight();
  const form = document.forms[formIndex];
  if (!form) return;

  const saved: Saved = {
    el: form,
    outline: form.style.outline,
    outlineOffset: form.style.outlineOffset,
    boxShadow: form.style.boxShadow,
    transition: form.style.transition,
  };

  form.style.transition = 'outline-color 120ms ease, box-shadow 120ms ease';
  form.style.outline = '3px solid #5ac8fa';
  form.style.outlineOffset = '3px';
  form.style.boxShadow = '0 0 0 6px rgba(90, 200, 250, 0.18)';

  current = saved;

  if (scroll) {
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export function clearHighlight(): void {
  if (!current) return;
  const { el, outline, outlineOffset, boxShadow, transition } = current;
  el.style.outline = outline;
  el.style.outlineOffset = outlineOffset;
  el.style.boxShadow = boxShadow;
  el.style.transition = transition;
  current = null;
}
