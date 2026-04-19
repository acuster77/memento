# Momento Web Form Filler

A browser extension (Chrome / Edge / Firefox) that captures the state of an
entire HTML `<form>` and restores any saved snapshot back into the form
later.

Built as a QA and developer tool so you don't re-type the same form values
every time you cycle through a test flow.

## Features

- **Capture & restore** the complete state of any form on any website with
  one click.
- **Multiple labelled snapshots per form** — save as many variants as you
  need (e.g. `smoke-test`, `admin-login`, `bad-input`).
- **Editable preview** — inspect and tweak every captured value (matching
  the input type: text, textarea, checkbox, radio, single/multi-select,
  contenteditable) before you save.
- **Opt-in capture** for sensitive or noisy fields: password fields,
  hidden inputs, and read-only fields are all skipped by default; each
  has its own toggle on the save-preview screen.
- **Resilient form matching** — snapshots match forms by ID, name, action
  URL, DOM path, and a structural fingerprint of field names and types,
  so cosmetic refactors don't break your saved fixtures.
- **Framework-aware apply** — uses native value setters plus synthetic
  `input` and `change` events so React, Vue, Svelte, and other controlled
  components re-render correctly after a restore.
- **Hover-to-highlight** — hover a form entry in the popup and the
  matching form on the page gets outlined, then scrolled into view if it
  was offscreen.
- **JSON import/export** — single snapshot or your entire collection,
  for backups or sharing fixtures with teammates.
- **Local-only by design** — no network calls, no analytics, no sync.

## Install

The extension is published as unpacked in this repository. Production
listings: *coming soon*.

### Chrome / Edge

1. `npm install`
2. `npm run build`
3. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
   and point at `.output/chrome-mv3/`.

### Firefox

1. `npm install`
2. `npm run build:firefox`
3. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on**,
   and pick any file inside `.output/firefox-mv2/`.

## Development

```sh
npm install           # runs `wxt prepare` to generate .wxt/ types
npm run dev           # launches Chrome with the extension and live reload
npm run dev:firefox   # same, for Firefox
npm run build         # production Chrome build
npm run build:firefox # production Firefox build
npm run zip           # store-ready zip in .output/
npm run icons         # rebuild PNG icons from assets/icon.svg
```

There is a small sample page at `test/fixtures/sample.html` with four
realistic forms (login, profile, anonymous, React-style controlled) useful
for manual testing. Serve it over HTTP from WSL or a local directory
because Firefox blocks `file://` UNC paths:

```sh
cd test/fixtures && python3 -m http.server 8080
# open http://localhost:8080/sample.html
```

## Architecture

```
entrypoints/
  content.ts              runs on every page; reads/writes form fields, responds to messages
  popup/
    index.html, main.ts   the popup UI
components/
  scanner.ts              enumerate forms, read fields with their options, build form identity
  applier.ts              restore a snapshot using native setters + synthetic events
  highlighter.ts          apply an outline + smooth scrollIntoView to a targeted form
utils/
  storage.ts              typed wrapper around wxt/storage
  messages.ts             typed message kinds shared by popup and content script
  types.ts                Snapshot, SnapshotField, FormIdentity
assets/
  icon.svg                master icon; rasterized into public/icons/ by npm run icons
public/icons/             PNG icons included in the built extension
```

## Privacy

See [PRIVACY.md](./PRIVACY.md) for the full disclosure. The short version:
snapshots are stored as plaintext JSON in `chrome.storage.local` / the
equivalent on Firefox — **not encrypted at rest**. Nothing is transmitted.
Momento is a QA tool, not a password manager; do **not** store production
credentials or real customer data.

## Out of scope

- Cloud sync or team sharing (use JSON export/import).
- File input restoration (browsers do not allow programmatic file input
  setting for security reasons).
- Shadow DOM traversal.
- Cross-origin iframes.
- Auto-fill on page load — applying a snapshot is always an explicit
  click so there are no surprise fills.

## License

[MIT](./LICENSE).
