---
name: UXP panel flyout menu & modal dialogs
description: How to add a flyout (☰) menu item and open a modal in a "main"-HTML UXP Premiere panel
---

# Flyout menu (the ☰ at the panel's top-right)

Add items to the panel's flyout menu via `entrypoints.setup`, even for a panel
that renders from manifest `"main": "index.html"` (no JS-created panel needed):

```js
const uxp = require("uxp");
uxp.entrypoints.setup({
  panels: {
    obviuPanel: {                 // MUST match the manifest entrypoint id
      show() {},                  // REQUIRED (see below) — no-op is fine
      menuItems: [{ id: "sendCut", label: "Send your cut" }],
      invokeMenu(id) { if (id === "sendCut") openSendCut(); },
    },
  },
});
```

- `menuItems` can live in the setup call (don't need to duplicate in manifest).
- Calling `setup()` at module load (our `init()` runs then) is fine; it does not
  conflict with the auto-rendered `"main"` HTML body.
- **Each panel entry MUST include a `create` or `show` handler**, even for a
  `"main"`-HTML panel whose body UXP renders itself. Without it, newer Premiere
  builds throw `entrypoints.panels.{panel} should contain either of 'create' or
  'show'` and the whole setup (flyout included) fails. A no-op `show() {}` is
  enough. (Older builds tolerated its absence — do not rely on that.)
- Wrap in try/catch: if it throws, the flyout just won't appear (silent), which
  costs a Premiere reload to discover.

# Modal dialogs

UXP does **not** use the browser `HTMLDialogElement.showModal()`. Use
`dialog.uxpShowModal({ title, resize, size:{width,height} })` — it returns a
promise that settles when the dialog closes and **rejects** on Esc / title-bar
close, so `.catch(() => {})` it. Dismiss with `dialog.close(value)`. Wire close
buttons before showing. Fall back to `showModal()` / removing `hidden` for plain
browser layout work.

**Why:** "Send your cut" export form was moved off the file view into a flyout
menu item that opens an `<dialog>` modal, freeing vertical space.
