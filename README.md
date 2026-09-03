# JSON is Coming

*But Still Thursday though.*

A privacy-friendly web app for reading, editing, and creating JSON files — entirely in your browser. No file is ever uploaded to a server.

**Live at:** [json.michels.world](https://json.michels.world)

## Features

- Load a JSON file (upload or drag & drop, file picker opens by default), paste raw JSON text instead (hidden by default, one tap away), or start a brand-new empty JSON from scratch
- Four fully synchronized, fully editable views — edit in any one of them and the others update instantly:
  - **Tree** — collapsible tree with inline key/value editing, a type selector per node (string, number, boolean, null, object, array), and buttons to add or delete keys/items
  - **Code** — a text editor showing the raw, formatted JSON, with live validation as you type and a dark theme that follows the app's Dark Mode (see [Code view](#code-view) below)
  - **Graph** — an auto-laid-out node diagram of the whole structure, automatically zoomed to fit the whole tree with manual +/−/Fit controls; tap a node to see and edit it in the details panel below the graph
  - **Table** — nested tables: objects and arrays render as tables, and any object/array *value* renders as another table inside its cell, however deep it goes
- Changing a node's type (e.g. turning a string into an object) resets it to a sensible empty default for that type, so you can build out structure from nothing
- Renaming a key, deleting a node, or adding a key/item is available from every view
- Click the filename in the toolbar to rename the file
- **Undo/redo** with full multi-step history (toolbar buttons, plus Ctrl/Cmd+Z and Ctrl/Cmd+Y or Shift+Ctrl/Cmd+Z)
- **Autosave**: your file is saved to `localStorage` after every change and restored automatically next time you open the app — even after closing the tab or the whole browser
- **Compare two files**: select or drop two JSON files at once on the welcome screen (or drop a second file into the small dropzone that stays above the toolbar once a file is loaded, and choose "Compare" instead of "Replace") to see a path-by-path diff, color-coded by added/removed/changed, with a toggle to also show unchanged values; pick either file to continue editing it
- Invalid JSON (typed in the Code view, or pasted) is caught immediately with an error message — nothing is lost, you just get pointed at the mistake
- Download the result as a `.json` file, or copy it straight to the clipboard (icon buttons in the toolbar)
- "Close file" clears the autosaved session for that file — download first if you want to keep it
- Dark mode by default, with a light mode toggle, and a fullscreen button
- Mobile-first layout — all four views and every action are usable from a phone
- 100% client-side: no backend, no analytics, no file ever leaves the device

## Roadmap

**0.3.0 (planned):** additional import/export formats — CSV, XML, YAML (via a small vendored `js-yaml`), JSON5/JSONC (hand-written tolerant parser), and Excel/.xlsx + OpenOffice/.ods support via a vendored [SheetJS](https://sheetjs.com/) library. Since that library is ~1 MB, it will be lazy-loaded on demand only when an XLSX/ODS import or export is actually triggered, with a heads-up that it needs a moment to download first.

## Code view

The Code view uses [CodeMirror](https://codemirror.net/5/) for syntax highlighting and line numbers, **if** the library files are present in `vendor/codemirror/` (see [Vendoring CodeMirror](#vendoring-codemirror) below). If they're missing, the app automatically falls back to a plain text area with the exact same live validation — nothing breaks, you just lose the syntax colors.

## Vendoring CodeMirror

To keep this repo dependency-free and under your control (same principle as the other apps in this suite — no CDN calls at runtime), CodeMirror isn't bundled in. To enable syntax highlighting, download these three files and place them under `vendor/codemirror/` at the repo root, keeping exactly these names:

- `codemirror.js`
- `codemirror.css`
- `javascript.js` (the JS mode — CodeMirror 5 uses it for JSON too)

**Note:** the `codemirror/codemirror5` and `codemirror/dev` repos on GitHub are source code only (the `dev` repo is CodeMirror 6's modular monorepo — a different, ESM-based library entirely) and won't work by just copying a file out of them. Instead, download the ready-built files from cdnjs (right-click → "Save link as…" on each), then rename them as noted:

- `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.21/codemirror.min.js` → save as `codemirror.js`
- `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.21/codemirror.min.css` → save as `codemirror.css`
- `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.21/mode/javascript/javascript.min.js` → save as `javascript.js`

(Check [cdnjs.com/libraries/codemirror](https://cdnjs.com/libraries/codemirror) for a newer 5.x version if you'd like — any 5.x release works the same way.) If any file is missing, the browser silently skips it and the Code view uses its plain-text fallback instead — nothing breaks.

## Example files

The `examples/` folder has five ready-made JSON files to try every view against:

| File | What it's good for |
|---|---|
| `01-simple-flat.json` | Flat key/value pairs, all primitive types |
| `02-nested-object.json` | Moderate 2–3 level nesting |
| `03-array-of-objects.json` | Array of objects — good for the Table view |
| `04-deeply-nested.json` | 5+ levels deep — stress-tests Tree and Graph |
| `05-edge-cases.json` | Empty object/array, unicode, big numbers, mixed-type array |

## Files

- `index.html` — markup and screen structure
- `style.css` — all styling
- `app.js` — app logic (state, the four views, file/paste/new handling, export)
- `examples/` — sample JSON files, see above
- `vendor/codemirror/` — not included, add yourself (see [Vendoring CodeMirror](#vendoring-codemirror))
- Push everything to the repo root, keeping the relative folder structure

## Favicon

`index.html` already references these files at the repo root (add them yourself — they aren't included):

- `favicon.ico`
- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon.png` (180×180, used for "Add to Home Screen" on iOS)

If any file is missing, browsers just silently skip it — nothing breaks, you'll just see a generic icon until they're added.

## Browser support

Works in all modern browsers (Chrome, Safari, Firefox, Edge). Uses `navigator.clipboard` for the Copy button, `Blob`/`URL.createObjectURL` for downloads, and inline SVG for the Graph view — all standard in current browsers.

## Changelog

### 0.2.0 — 2026-09-03
- Undo/redo with full multi-step history, keyboard shortcuts included
- Autosave to `localStorage`; the current file is restored automatically on next visit
- Compare two JSON files: pick/drop two at once, or add a second file via the persistent post-load dropzone and choose "Compare" instead of "Replace" — shows a color-coded, path-by-path diff
- Graph view now auto-fits to the visible width on open and on tab switch, with manual +/−/Fit zoom controls
- Code view gets a dark theme that follows the app's Dark Mode
- Tabs reordered to Tree, Code (visually highlighted), Graph, Table
- Toolbar reworked: Copy/Download are now self-drawn SVG icon buttons, the close action is now a clearly labeled "Close file" button
- Click the filename in the toolbar to rename it
- Fixed a startup crash: the theme toggle referenced the Code editor variable before it was declared

### 0.1.0 — 2026-09-03 — Initial release
- Load via file upload/drag & drop, paste, or start a new empty JSON
- Four synchronized, editable views: Tree, Table, Code, Graph
- Type switching, key rename, add/delete keys and items from every view
- Live JSON validation with inline error messages
- Download as `.json` and copy to clipboard
- Five example JSON files covering flat, nested, array, deep, and edge-case structures
