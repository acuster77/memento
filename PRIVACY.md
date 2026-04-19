# Privacy Policy

_Last updated: 2026-04-18_

Momento is a browser extension that lets you capture and restore the state of
HTML forms on websites you visit. This policy describes what data the
extension handles and where it goes.

## What Momento stores

- **Form snapshots** you explicitly save: the field values, field types, labels,
  the form's identity signals (DOM id, name, action URL, structural fingerprint,
  DOM path), the page's origin and path, and the label you type in.
- **Schema metadata** used to upgrade older saved data safely.

All of this is stored locally on your device using the browser's standard
`chrome.storage.local` / `browser.storage.local` API. It never leaves your
machine.

## What Momento does NOT do

- **No network requests.** The extension declares no `host_permissions` for
  remote origins and makes no `fetch`, `XMLHttpRequest`, or WebSocket calls.
  You can verify this by inspecting the source code or the network tab.
- **No analytics, telemetry, tracking, or advertising identifiers.**
- **No sync across devices.** Momento deliberately uses `storage.local`, not
  `storage.sync`. If you want your snapshots on another machine, use
  **Export JSON** to download them and import on the other browser.
- **No sharing with third parties.** There are no third parties involved.

## Password fields

Password fields are **skipped by default** when you save a snapshot. To
capture them, you must explicitly tick the "Include password fields" toggle
on the save-preview screen; the resulting snapshot is then flagged as
containing secrets in the UI.

Snapshots are stored as **plaintext JSON** in `storage.local`. They are
**not encrypted at rest**: any process on your computer with access to your
browser profile directory — other extensions with the `storage` permission,
local malware, or anyone who can read the profile on disk — can read them.

Momento is a **QA and developer tool**, not a password manager. It does not
provide the protections a password manager does: no master-password
encryption, no device-bound key, no lockout after inactivity, no zero-
knowledge sync. Do **not** store production credentials, real customer
data, or any secret you would be uncomfortable finding in an unencrypted
JSON file on disk. Use real test accounts or throwaway fixtures.

## Hidden and read-only fields

Hidden and read-only fields are also off by default. Each category has its
own opt-in toggle on the save-preview screen. Hidden fields often contain
session-scoped values (like CSRF tokens) that go stale between visits,
which is why capture is opt-in.

## Deleting your data

- Remove a single snapshot with the delete button on its entry.
- Clear everything from the **Clear all** button in the popup footer.
- Uninstalling the extension removes all of its local storage, along with
  the extension itself.

## Permissions the extension requests

- `storage`: to persist your snapshots locally on this device.
- `activeTab`: to let the popup communicate with the content script running
  on the tab you're currently viewing, so it can read and restore form
  fields on your explicit action.
- Content-script match `<all_urls>`: to make the extension work on any site
  you want to test against. The content script only reads and writes form
  fields in response to messages from the popup; it performs no work on
  its own.

## Changes

If this policy changes, the updated version will be published alongside the
extension source code and noted in the release notes.

## Contact

Questions or concerns: open an issue at the repository linked in the
extension's `package.json` or on its listing page.
