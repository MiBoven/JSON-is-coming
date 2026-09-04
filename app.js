// ---------- App state (declared first: setTheme() below reads cmEditor immediately) ----------
let root = null;              // the JSON data being edited
let currentFileName = 'untitled.json';
let cmEditor = null;
let cmDebounceTimer = null;
const STORAGE_KEY = 'jsoniscoming-session';

// Undo/redo history: array of JSON-string snapshots
let history = [];
let historyIndex = -1;
let suppressHistory = false;

// ---------- Theme & fullscreen ----------
const htmlEl = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
function setTheme(t) {
  htmlEl.setAttribute('data-theme', t);
  localStorage.setItem('jsoniscoming-theme', t);
  themeToggle.textContent = t === 'dark' ? '◐' : '◑';
  if (cmEditor) cmEditor.setOption('theme', t === 'dark' ? 'jsoniscoming-dark' : 'default');
}
setTheme(localStorage.getItem('jsoniscoming-theme') || 'dark');
themeToggle.addEventListener('click', () => {
  setTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

document.getElementById('fullscreenToggle').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
});

// ---------- Path helpers ----------
function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v; // 'object' | 'string' | 'number' | 'boolean'
}

function getAtPath(obj, path) {
  let cur = obj;
  for (const key of path) cur = cur[key];
  return cur;
}

function setAtPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
}

function deleteAtPath(obj, path) {
  if (path.length === 0) return;
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  const lastKey = path[path.length - 1];
  if (Array.isArray(cur)) cur.splice(lastKey, 1);
  else delete cur[lastKey];
}

function uniqueKey(obj, base) {
  if (!(base in obj)) return base;
  let i = 2;
  while ((base + i) in obj) i++;
  return base + i;
}

function renameKey(path, newKey) {
  const parentPath = path.slice(0, -1);
  const oldKey = path[path.length - 1];
  const parent = getAtPath(root, parentPath);
  if (!newKey || newKey === oldKey) { renderAll(); return; }
  if (Object.prototype.hasOwnProperty.call(parent, newKey)) {
    alert('Key "' + newKey + '" already exists here.');
    renderAll();
    return;
  }
  const rebuilt = {};
  Object.keys(parent).forEach((k) => {
    rebuilt[k === oldKey ? newKey : k] = parent[k];
  });
  Object.keys(parent).forEach((k) => delete parent[k]);
  Object.assign(parent, rebuilt);
  afterChange();
}

function updateValue(path, inputValue, originalType) {
  let newValue;
  if (originalType === 'string') {
    newValue = inputValue;
  } else {
    try {
      newValue = JSON.parse(inputValue);
    } catch (e) {
      alert('That is not a valid ' + originalType + ': ' + inputValue);
      renderAll();
      return;
    }
  }
  if (path.length === 0) root = newValue;
  else setAtPath(root, path, newValue);
  afterChange();
}

function changeType(path, newType) {
  const defaults = { string: '', number: 0, boolean: false, null: null, object: {}, array: [] };
  const nv = defaults[newType];
  if (path.length === 0) root = nv;
  else setAtPath(root, path, nv);
  afterChange();
}

// ---------- Shared value/type control (used by table + graph views) ----------
function buildValueCellControls(value, path, type) {
  const wrap = document.createElement('span');
  wrap.className = 'value-cell-controls';

  const typeSelect = document.createElement('select');
  typeSelect.className = 'mini-type-select';
  ['string', 'number', 'boolean', 'null', 'object', 'array'].forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === type) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  typeSelect.addEventListener('change', () => changeType(path, typeSelect.value));
  wrap.appendChild(typeSelect);

  if (type !== 'object' && type !== 'array') {
    const input = document.createElement('input');
    input.className = 'table-value-input';
    input.value = type === 'string' ? value : JSON.stringify(value);
    input.addEventListener('change', () => updateValue(path, input.value, type));
    wrap.appendChild(input);
  }
  return wrap;
}

// ---------- Tree view ----------
function renderTree() {
  const container = document.getElementById('viewTree');
  container.innerHTML = '';
  container.appendChild(renderTreeNode(null, root, [], true));
}

function renderTreeNode(keyLabel, value, path, isRoot) {
  const type = typeOf(value);
  const row = document.createElement('div');
  row.className = 'tree-node';

  const line = document.createElement('div');
  line.className = 'tree-line';

  const isContainer = type === 'object' || type === 'array';
  let childrenEl = null;

  if (isContainer) {
    const toggle = document.createElement('button');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▾';
    toggle.addEventListener('click', () => {
      childrenEl.classList.toggle('collapsed');
      toggle.textContent = childrenEl.classList.contains('collapsed') ? '▸' : '▾';
    });
    line.appendChild(toggle);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'tree-spacer';
    line.appendChild(spacer);
  }

  if (isRoot) {
    const label = document.createElement('span');
    label.className = 'tree-root-label';
    label.textContent = 'root';
    line.appendChild(label);
  } else {
    const parentPath = path.slice(0, -1);
    const parent = getAtPath(root, parentPath);
    if (Array.isArray(parent)) {
      const label = document.createElement('span');
      label.className = 'tree-root-label';
      label.textContent = '[' + keyLabel + ']';
      line.appendChild(label);
    } else {
      const keyInput = document.createElement('input');
      keyInput.className = 'tree-key';
      keyInput.value = keyLabel;
      keyInput.addEventListener('change', () => renameKey(path, keyInput.value));
      line.appendChild(keyInput);
    }
  }

  const typeSelect = document.createElement('select');
  typeSelect.className = 'type-badge type-' + type;
  ['string', 'number', 'boolean', 'null', 'object', 'array'].forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === type) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  typeSelect.addEventListener('change', () => changeType(path, typeSelect.value));
  line.appendChild(typeSelect);

  if (isContainer) {
    const len = type === 'array' ? value.length : Object.keys(value).length;
    const countBadge = document.createElement('span');
    countBadge.className = 'count-badge';
    countBadge.textContent = len + (type === 'array' ? (len === 1 ? ' item' : ' items') : (len === 1 ? ' key' : ' keys'));
    line.appendChild(countBadge);
  } else {
    const valueInput = document.createElement('input');
    valueInput.className = 'tree-value';
    valueInput.value = type === 'string' ? value : JSON.stringify(value);
    valueInput.addEventListener('change', () => updateValue(path, valueInput.value, type));
    line.appendChild(valueInput);
  }

  const actions = document.createElement('span');
  actions.className = 'tree-actions';
  if (!isRoot) {
    const delBtn = document.createElement('button');
    delBtn.className = 'mini-btn danger';
    delBtn.textContent = '×';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', () => { deleteAtPath(root, path); afterChange(); });
    actions.appendChild(delBtn);
  }
  line.appendChild(actions);
  row.appendChild(line);

  if (isContainer) {
    childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    const keys = type === 'array' ? value.map((_, i) => i) : Object.keys(value);
    keys.forEach((k) => {
      childrenEl.appendChild(renderTreeNode(k, value[k], path.concat([k]), false));
    });
    const addRow = document.createElement('div');
    addRow.className = 'tree-add-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'mini-btn';
    addBtn.textContent = type === 'array' ? '+ Add item' : '+ Add key';
    addBtn.addEventListener('click', () => {
      if (type === 'array') value.push('');
      else value[uniqueKey(value, 'newKey')] = '';
      afterChange();
    });
    addRow.appendChild(addBtn);
    childrenEl.appendChild(addRow);
    row.appendChild(childrenEl);
  }

  return row;
}

// ---------- Table view (nested tables) ----------
function renderTable() {
  const container = document.getElementById('viewTable');
  container.innerHTML = '';
  const type = typeOf(root);
  if (type !== 'object' && type !== 'array') {
    const wrap = document.createElement('div');
    wrap.className = 'table-primitive-root';
    wrap.appendChild(buildValueCellControls(root, [], type));
    container.appendChild(wrap);
    return;
  }
  container.appendChild(buildTableForValue(root, []));
}

function buildTableForValue(value, path) {
  const type = typeOf(value);
  const table = document.createElement('table');
  table.className = 'nested-table';
  const keys = type === 'array' ? value.map((_, i) => i) : Object.keys(value);

  keys.forEach((k) => {
    const tr = document.createElement('tr');

    const keyTd = document.createElement('td');
    keyTd.className = 'table-key-cell';
    if (type === 'array') {
      keyTd.textContent = '[' + k + ']';
    } else {
      const keyInput = document.createElement('input');
      keyInput.className = 'table-key-input';
      keyInput.value = k;
      keyInput.addEventListener('change', () => renameKey(path.concat([k]), keyInput.value));
      keyTd.appendChild(keyInput);
    }

    const valTd = document.createElement('td');
    valTd.className = 'table-value-cell';
    const childVal = value[k];
    const childType = typeOf(childVal);
    if (childType === 'object' || childType === 'array') {
      valTd.appendChild(buildValueCellControls(childVal, path.concat([k]), childType));
      valTd.appendChild(buildTableForValue(childVal, path.concat([k])));
    } else {
      valTd.appendChild(buildValueCellControls(childVal, path.concat([k]), childType));
    }

    const actionTd = document.createElement('td');
    actionTd.className = 'table-action-cell';
    const delBtn = document.createElement('button');
    delBtn.className = 'mini-btn danger';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => { deleteAtPath(root, path.concat([k])); afterChange(); });
    actionTd.appendChild(delBtn);

    tr.appendChild(keyTd);
    tr.appendChild(valTd);
    tr.appendChild(actionTd);
    table.appendChild(tr);
  });

  const addTr = document.createElement('tr');
  const addTd = document.createElement('td');
  addTd.colSpan = 3;
  const addBtn = document.createElement('button');
  addBtn.className = 'mini-btn';
  addBtn.textContent = type === 'array' ? '+ Add item' : '+ Add key';
  addBtn.addEventListener('click', () => {
    if (type === 'array') value.push('');
    else value[uniqueKey(value, 'newKey')] = '';
    afterChange();
  });
  addTd.appendChild(addBtn);
  addTr.appendChild(addTd);
  table.appendChild(addTr);

  return table;
}

// ---------- Graph view ----------
let graphZoom = 1;
let graphNaturalWidth = 0;
let graphNaturalHeight = 0;

function maxDepth(value, depth) {
  depth = depth || 0;
  const type = typeOf(value);
  if (type !== 'object' && type !== 'array') return depth;
  const values = type === 'array' ? value : Object.values(value);
  if (values.length === 0) return depth;
  return Math.max.apply(null, values.map((v) => maxDepth(v, depth + 1)));
}

function truncateLabel(s) {
  s = String(s);
  return s.length > 12 ? s.slice(0, 11) + '…' : s;
}

function renderGraph() {
  const container = document.getElementById('graphCanvas');
  container.innerHTML = '';

  const nodes = [];
  const edges = [];
  let leafCounter = 0;
  const levelHeight = 90;
  const leafWidth = 130;

  function walk(value, path, depth, parentId) {
    const id = path.join('.') || '::root::';
    const type = typeOf(value);
    let x;
    if (type === 'object' || type === 'array') {
      const keys = type === 'array' ? value.map((_, i) => i) : Object.keys(value);
      if (keys.length === 0) {
        x = leafCounter * leafWidth;
        leafCounter++;
      } else {
        const startLeaf = leafCounter;
        keys.forEach((k) => walk(value[k], path.concat([k]), depth + 1, id));
        const endLeaf = leafCounter;
        x = ((startLeaf + endLeaf - 1) / 2) * leafWidth;
      }
    } else {
      x = leafCounter * leafWidth;
      leafCounter++;
    }
    nodes.push({ id, path, label: path.length ? String(path[path.length - 1]) : 'root', type, x, y: depth * levelHeight });
    if (parentId !== null) edges.push({ from: parentId, to: id });
  }
  walk(root, [], 0, null);

  const width = Math.max(320, leafCounter * leafWidth + 40);
  const height = (maxDepth(root) + 1) * levelHeight + 60;
  graphNaturalWidth = width;
  graphNaturalHeight = height;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.classList.add('graph-svg');

  edges.forEach((e) => {
    const fromNode = nodes.find((n) => n.id === e.from);
    const toNode = nodes.find((n) => n.id === e.to);
    if (!fromNode || !toNode) return;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', fromNode.x + 40 + 20);
    line.setAttribute('y1', fromNode.y + 36 + 20);
    line.setAttribute('x2', toNode.x + 40 + 20);
    line.setAttribute('y2', toNode.y + 20);
    line.setAttribute('class', 'graph-edge');
    svg.appendChild(line);
  });

  nodes.forEach((n) => {
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'graph-node type-' + n.type);
    g.setAttribute('transform', 'translate(' + (n.x + 20) + ',' + (n.y + 10) + ')');
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('width', 80);
    rect.setAttribute('height', 36);
    rect.setAttribute('rx', 8);
    g.appendChild(rect);
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', 40);
    text.setAttribute('y', 22);
    text.setAttribute('text-anchor', 'middle');
    text.textContent = truncateLabel(n.label);
    g.appendChild(text);
    g.addEventListener('click', () => selectGraphNode(n.path));
    svg.appendChild(g);
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'graph-zoom-wrapper';
  wrapper.id = 'graphZoomWrapper';
  wrapper.appendChild(svg);
  container.appendChild(wrapper);

  fitGraphToView(true);
}

function applyGraphZoom() {
  const wrapper = document.getElementById('graphZoomWrapper');
  if (wrapper) wrapper.style.transform = 'scale(' + graphZoom + ')';
}

function fitGraphToView(centerTop) {
  const container = document.getElementById('graphCanvas');
  const containerWidth = container.clientWidth || 320;
  if (graphNaturalWidth > 0) {
    graphZoom = Math.min(1, (containerWidth - 16) / graphNaturalWidth);
  } else {
    graphZoom = 1;
  }
  applyGraphZoom();
  requestAnimationFrame(() => {
    const scaledWidth = graphNaturalWidth * graphZoom;
    container.scrollLeft = Math.max(0, (scaledWidth - containerWidth) / 2);
    if (centerTop) container.scrollTop = 0;
  });
}

document.getElementById('graphZoomIn').addEventListener('click', () => {
  graphZoom = Math.min(3, graphZoom + 0.15);
  applyGraphZoom();
});
document.getElementById('graphZoomOut').addEventListener('click', () => {
  graphZoom = Math.max(0.15, graphZoom - 0.15);
  applyGraphZoom();
});
document.getElementById('graphZoomFit').addEventListener('click', () => fitGraphToView(false));

function selectGraphNode(path) {
  const panel = document.getElementById('graphDetails');
  const value = getAtPath(root, path);
  const type = typeOf(value);
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'graph-details-title';
  title.textContent = path.length ? path.map((p) => String(p)).join(' → ') : 'root';
  panel.appendChild(title);

  if (path.length) {
    const parent = getAtPath(root, path.slice(0, -1));
    if (!Array.isArray(parent)) {
      const keyInput = document.createElement('input');
      keyInput.value = path[path.length - 1];
      keyInput.addEventListener('change', () => { renameKey(path, keyInput.value); selectGraphNode(path.slice(0, -1).concat([keyInput.value])); });
      panel.appendChild(keyInput);
    }
  }

  panel.appendChild(buildValueCellControls(value, path, type));

  if (type === 'object' || type === 'array') {
    const addBtn = document.createElement('button');
    addBtn.className = 'mini-btn';
    addBtn.textContent = type === 'array' ? '+ Add item' : '+ Add key';
    addBtn.addEventListener('click', () => {
      if (type === 'array') value.push('');
      else value[uniqueKey(value, 'newKey')] = '';
      afterChange();
      selectGraphNode(path);
    });
    panel.appendChild(addBtn);
  }

  if (path.length) {
    const delBtn = document.createElement('button');
    delBtn.className = 'mini-btn danger';
    delBtn.textContent = 'Delete this node';
    delBtn.addEventListener('click', () => {
      deleteAtPath(root, path);
      afterChange();
      panel.innerHTML = '';
      const empty = document.createElement('p');
      empty.className = 'graph-details-empty';
      empty.textContent = 'Tap a node above to view or edit it.';
      panel.appendChild(empty);
    });
    panel.appendChild(delBtn);
  }
}

// ---------- Code view ----------
function initCodeView() {
  const mount = document.getElementById('codeMount');
  mount.innerHTML = '';
  const note = document.getElementById('codeFallbackNote');
  if (window.CodeMirror) {
    cmEditor = window.CodeMirror(mount, {
      value: JSON.stringify(root, null, 2),
      mode: 'application/json',
      lineNumbers: true,
      tabSize: 2,
      theme: htmlEl.getAttribute('data-theme') === 'dark' ? 'jsoniscoming-dark' : 'default',
    });
    cmEditor.on('change', () => {
      clearTimeout(cmDebounceTimer);
      cmDebounceTimer = setTimeout(() => applyCodeChange(cmEditor.getValue()), 400);
    });
    note.style.display = 'none';
  } else {
    cmEditor = null;
    const ta = document.createElement('textarea');
    ta.id = 'codeFallback';
    ta.className = 'code-fallback-textarea';
    ta.value = JSON.stringify(root, null, 2);
    ta.addEventListener('input', () => {
      clearTimeout(cmDebounceTimer);
      cmDebounceTimer = setTimeout(() => applyCodeChange(ta.value), 400);
    });
    mount.appendChild(ta);
    note.style.display = 'block';
  }
}

function applyCodeChange(text) {
  try {
    const parsed = parseLenientJSON(text);
    root = parsed;
    hideError();
    commitHistory();
    renderTree();
    renderTable();
    renderGraph();
    saveToStorage();
  } catch (e) {
    showError('Invalid JSON: ' + e.message);
  }
}

function syncCodeView() {
  const text = JSON.stringify(root, null, 2);
  if (cmEditor) {
    if (cmEditor.getValue() !== text) cmEditor.setValue(text);
  } else {
    const ta = document.getElementById('codeFallback');
    if (ta && ta.value !== text) ta.value = text;
  }
}

// ---------- Error banner ----------
function showError(msg) {
  const el = document.getElementById('errorBanner');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideError() {
  document.getElementById('errorBanner').style.display = 'none';
}

// ---------- Undo / redo ----------
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

function commitHistory() {
  if (suppressHistory) return;
  const snapshot = JSON.stringify(root);
  if (history[historyIndex] === snapshot) return;
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot);
  historyIndex = history.length - 1;
  if (history.length > 100) { history.shift(); historyIndex--; }
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  undoBtn.disabled = historyIndex <= 0;
  redoBtn.disabled = historyIndex >= history.length - 1;
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  suppressHistory = true;
  root = JSON.parse(history[historyIndex]);
  renderTree(); renderTable(); renderGraph(); syncCodeView();
  suppressHistory = false;
  updateUndoRedoButtons();
  saveToStorage();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  suppressHistory = true;
  root = JSON.parse(history[historyIndex]);
  renderTree(); renderTable(); renderGraph(); syncCodeView();
  suppressHistory = false;
  updateUndoRedoButtons();
  saveToStorage();
}

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

document.addEventListener('keydown', (e) => {
  if (root === null || document.getElementById('appScreen').style.display === 'none') return;
  const meta = e.ctrlKey || e.metaKey;
  if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (meta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// ---------- Autosave ----------
function saveToStorage() {
  try {
    if (root === null) { localStorage.removeItem(STORAGE_KEY); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fileName: currentFileName, data: root }));
  } catch (e) {
    // storage full/blocked - fail silently, editing still works without persistence
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ---------- Render orchestration ----------
function renderAll() {
  renderTree();
  renderTable();
  renderGraph();
  syncCodeView();
}

function afterChange() {
  commitHistory();
  renderAll();
  saveToStorage();
}

// ---------- Tabs ----------
document.querySelectorAll('.view-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view-pane').forEach((p) => p.classList.remove('active'));
    document.getElementById('view' + btn.dataset.view).classList.add('active');
    if (btn.dataset.view === 'Code' && cmEditor) cmEditor.refresh();
    if (btn.dataset.view === 'Graph') fitGraphToView(false);
  });
});

// ---------- Lenient JSON parser (JSONC-style: comments + trailing commas) ----------
// Deliberately does NOT attempt unquoted keys or single-quoted strings: those
// need a full tokenizer to handle safely, and a naive regex risks corrupting
// string content. Comments and trailing commas cover the common real-world
// case (the tsconfig.json / VS Code settings style of "JSON with comments").
function stripJsonComments(text) {
  let out = '';
  let inStr = false, strChar = '', inLineComment = false, inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (c === '\n') { inLineComment = false; out += c; }
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inStr) {
      out += c;
      if (c === '\\') { out += next; i++; continue; }
      if (c === strChar) inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; strChar = c; out += c; continue; }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    out += c;
  }
  return out;
}

function stripTrailingCommas(text) {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

function parseLenientJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return JSON.parse(stripTrailingCommas(stripJsonComments(text)));
  }
}

// ---------- CSV converter ----------
// Nested objects are flattened with dot-notation columns (user.name).
// Nested arrays inside a row are kept as a JSON string in the cell — CSV
// has no native way to represent a variable-length list inside one cell.
function flattenForCSV(value, prefix, out) {
  out = out || {};
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) out[prefix || 'value'] = '{}';
    else keys.forEach((k) => flattenForCSV(value[k], prefix ? prefix + '.' + k : k, out));
  } else if (Array.isArray(value)) {
    out[prefix || 'value'] = JSON.stringify(value);
  } else {
    out[prefix || 'value'] = value === null ? '' : value;
  }
  return out;
}

function csvEscape(v) {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function jsonToCSV(data) {
  const rows = Array.isArray(data) ? data : [data];
  const flatRows = rows.map((r) => flattenForCSV(r, ''));
  const columns = [];
  flatRows.forEach((fr) => Object.keys(fr).forEach((k) => { if (!columns.includes(k)) columns.push(k); }));
  const lines = [columns.map(csvEscape).join(',')];
  flatRows.forEach((fr) => lines.push(columns.map((c) => csvEscape(fr[c])).join(',')));
  return lines.join('\r\n');
}

function coercePlainValue(v) {
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v[0] === '{' && v[v.length - 1] === '}') || (v[0] === '[' && v[v.length - 1] === ']')) {
    try { return JSON.parse(v); } catch (e) { /* keep as string */ }
  }
  return v;
}

function parseCSVRows(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // skip, \n handles the line break
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function setDotPath(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = coercePlainValue(value);
}

function csvToJSON(text) {
  const rows = parseCSVRows(text).filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((col, i) => setDotPath(obj, col, r[i] !== undefined ? r[i] : ''));
    return obj;
  });
}

// ---------- XML converter (uses the browser's native DOMParser/XMLSerializer) ----------
// Note: XML can't natively distinguish "one item" from "an array of one item",
// so a single-item array round-trips back as a plain object. Attribute-based
// XML isn't produced or read — everything becomes nested elements.
function sanitizeTagName(k) {
  let name = String(k).replace(/[^a-zA-Z0-9_.-]/g, '_');
  if (!/^[a-zA-Z_]/.test(name)) name = '_' + name;
  return name;
}

function appendXMLChild(doc, parentEl, tagName, value) {
  const type = typeOf(value);
  if (type === 'array') {
    value.forEach((item) => appendXMLChild(doc, parentEl, tagName, item));
    return;
  }
  const el = doc.createElement(tagName);
  if (type === 'object') {
    Object.keys(value).forEach((k) => appendXMLChild(doc, el, sanitizeTagName(k), value[k]));
  } else if (type !== 'null') {
    el.textContent = String(value);
  }
  parentEl.appendChild(el);
}

function jsonToXML(data) {
  const doc = document.implementation.createDocument(null, 'root', null);
  const type = typeOf(data);
  if (type === 'object') {
    Object.keys(data).forEach((k) => appendXMLChild(doc, doc.documentElement, sanitizeTagName(k), data[k]));
  } else if (type === 'array') {
    data.forEach((item) => appendXMLChild(doc, doc.documentElement, 'item', item));
  } else if (type !== 'null') {
    doc.documentElement.textContent = String(data);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(doc);
}

function xmlNodeToJSON(el) {
  const children = Array.from(el.children);
  if (children.length === 0) return coercePlainValue(el.textContent || '');
  const groups = {};
  children.forEach((c) => { (groups[c.tagName] = groups[c.tagName] || []).push(c); });
  const obj = {};
  Object.keys(groups).forEach((tag) => {
    const els = groups[tag];
    obj[tag] = els.length > 1 ? els.map(xmlNodeToJSON) : xmlNodeToJSON(els[0]);
  });
  return obj;
}

function xmlToJSON(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) throw new Error('Invalid XML: ' + errorNode.textContent.slice(0, 200));
  return xmlNodeToJSON(doc.documentElement);
}

// ---------- Multi-format import helpers ----------
const SUPPORTED_IMPORT_EXT = '.json,.json5,.jsonc,.csv,.xml,.yaml,.yml';

function detectFormat(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'csv') return 'csv';
  if (ext === 'xml') return 'xml';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  return 'json'; // json, json5, jsonc all go through the lenient JSON parser
}

function parseByFormat(text, format) {
  if (format === 'csv') return csvToJSON(text);
  if (format === 'xml') return xmlToJSON(text);
  if (format === 'yaml') {
    if (!window.jsyaml) throw new Error('YAML support needs js-yaml in vendor/js-yaml/ (see README).');
    return window.jsyaml.load(text);
  }
  return parseLenientJSON(text);
}

function readFileAsData(file) {
  return new Promise((resolve, reject) => {
    const format = detectFormat(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve({ data: parseByFormat(reader.result, format), name: file.name.replace(/\.[^.]+$/, '') + '.json', format });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ---------- Welcome screen: file / paste / new / compare-on-upload ----------
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', () => fileInput.click());
['dragenter', 'dragover'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('drag'); }));
dropZone.addEventListener('drop', (e) => handleWelcomeFiles(e.dataTransfer.files));
fileInput.addEventListener('change', (e) => { handleWelcomeFiles(e.target.files); fileInput.value = ''; });

function handleWelcomeFiles(fileList) {
  const files = Array.from(fileList).filter((f) => /\.(json5?|jsonc|csv|xml|ya?ml)$/i.test(f.name));
  if (files.length === 0) return;
  if (files.length >= 2) {
    Promise.all([readFileAsData(files[0]), readFileAsData(files[1])])
      .then(([a, b]) => startCompare(a.data, b.data, a.name, b.name))
      .catch((e) => alert('One of the files could not be read:\n' + e.message));
  } else {
    loadFile(files[0]);
  }
}

function loadFile(file) {
  readFileAsData(file).then(({ data, name }) => {
    root = data;
    currentFileName = name;
    openApp(true);
  }).catch((e) => alert('This file could not be read:\n' + e.message));
}

document.getElementById('newJsonBtn').addEventListener('click', () => {
  root = {};
  currentFileName = 'untitled.json';
  openApp(true);
});

document.getElementById('pasteToggleBtn').addEventListener('click', () => {
  const area = document.getElementById('pasteArea');
  area.style.display = area.style.display === 'none' ? 'flex' : 'none';
});

document.getElementById('pasteLoadBtn').addEventListener('click', () => {
  const text = document.getElementById('pasteText').value;
  try {
    root = parseLenientJSON(text);
    currentFileName = 'untitled.json';
    openApp(true);
  } catch (e) {
    alert('This is not valid JSON:\n' + e.message);
  }
});

// ---------- Compare screen ----------
let compareData = null; // { a, b, nameA, nameB }

function flattenForDiff(value, path, out) {
  out = out || {};
  const type = typeOf(value);
  if (type === 'object' || type === 'array') {
    const keys = type === 'array' ? value.map((_, i) => i) : Object.keys(value);
    if (keys.length === 0) out[path.join('.') || '(root)'] = type === 'array' ? '[]' : '{}';
    else keys.forEach((k) => flattenForDiff(value[k], path.concat([k]), out));
  } else {
    out[path.join('.') || '(root)'] = type === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

function computeDiff(a, b) {
  const flatA = flattenForDiff(a, []);
  const flatB = flattenForDiff(b, []);
  const paths = Array.from(new Set(Object.keys(flatA).concat(Object.keys(flatB)))).sort();
  return paths.map((p) => {
    const inA = Object.prototype.hasOwnProperty.call(flatA, p);
    const inB = Object.prototype.hasOwnProperty.call(flatB, p);
    let status;
    if (inA && inB) status = flatA[p] === flatB[p] ? 'same' : 'changed';
    else if (inA) status = 'removed';
    else status = 'added';
    return { path: p, a: inA ? flatA[p] : '—', b: inB ? flatB[p] : '—', status };
  });
}

function startCompare(a, b, nameA, nameB) {
  compareData = { a, b, nameA, nameB };
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('compareScreen').style.display = 'block';
  document.getElementById('compareNameA').textContent = nameA;
  document.getElementById('compareNameB').textContent = nameB;
  document.getElementById('compareShowUnchanged').checked = false;
  renderCompareTable();
}

function renderCompareTable() {
  const container = document.getElementById('compareTableContainer');
  const showUnchanged = document.getElementById('compareShowUnchanged').checked;
  const diff = computeDiff(compareData.a, compareData.b).filter((row) => showUnchanged || row.status !== 'same');
  container.innerHTML = '';
  if (diff.length === 0) {
    const p = document.createElement('p');
    p.className = 'graph-details-empty';
    p.textContent = 'No differences found.';
    container.appendChild(p);
    return;
  }
  const table = document.createElement('table');
  table.className = 'compare-table';
  const thead = document.createElement('tr');
  ['Path', 'File A', 'File B'].forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    thead.appendChild(th);
  });
  table.appendChild(thead);
  diff.forEach((row) => {
    const tr = document.createElement('tr');
    tr.className = 'status-' + row.status;
    const pathTd = document.createElement('td');
    pathTd.textContent = row.path;
    const aTd = document.createElement('td');
    aTd.className = 'val-a';
    aTd.textContent = row.a;
    const bTd = document.createElement('td');
    bTd.className = 'val-b';
    bTd.textContent = row.b;
    tr.appendChild(pathTd);
    tr.appendChild(aTd);
    tr.appendChild(bTd);
    table.appendChild(tr);
  });
  container.appendChild(table);
}

document.getElementById('compareShowUnchanged').addEventListener('change', renderCompareTable);

document.getElementById('useABtn').addEventListener('click', () => {
  root = compareData.a;
  currentFileName = compareData.nameA;
  finishCompare();
});
document.getElementById('useBBtn').addEventListener('click', () => {
  root = compareData.b;
  currentFileName = compareData.nameB;
  finishCompare();
});
document.getElementById('cancelCompareBtn').addEventListener('click', () => {
  compareData = null;
  document.getElementById('compareScreen').style.display = 'none';
  if (root !== null) document.getElementById('appScreen').style.display = 'block';
  else document.getElementById('welcomeScreen').style.display = 'block';
});

function finishCompare() {
  compareData = null;
  document.getElementById('compareScreen').style.display = 'none';
  openApp(true);
}

// ---------- App screen ----------
function openApp(resetHistory) {
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('compareScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('fileNameLabel').value = currentFileName;
  hideError();
  hidePostLoadPrompt();
  if (resetHistory) {
    history = [JSON.stringify(root)];
    historyIndex = 0;
  }
  initCodeView();
  renderAll();
  updateUndoRedoButtons();
  saveToStorage();
}

document.getElementById('fileNameLabel').addEventListener('change', (e) => {
  let name = e.target.value.trim() || 'untitled.json';
  if (!name.toLowerCase().endsWith('.json')) name += '.json';
  currentFileName = name;
  e.target.value = name;
  saveToStorage();
});

document.getElementById('backBtn').addEventListener('click', () => {
  if (!confirm('Close this file? Its autosave will be cleared (download first if you want to keep it).')) return;
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('welcomeScreen').style.display = 'block';
  root = null;
  cmEditor = null;
  history = [];
  historyIndex = -1;
  saveToStorage();
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(root, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFileName;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('copyBtn').addEventListener('click', async () => {
  const btn = document.getElementById('copyBtn');
  try {
    await navigator.clipboard.writeText(JSON.stringify(root, null, 2));
    btn.classList.add('mini-btn-flash');
    setTimeout(() => btn.classList.remove('mini-btn-flash'), 800);
  } catch (e) {
    alert('Could not copy automatically. Please copy manually from the Code view.');
  }
});

// ---------- Post-load dropzone: replace or compare ----------
const postLoadDropZone = document.getElementById('postLoadDropZone');
const postLoadFileInput = document.getElementById('postLoadFileInput');
let pendingPostLoadFile = null;

postLoadDropZone.addEventListener('click', () => postLoadFileInput.click());
['dragenter', 'dragover'].forEach((ev) => postLoadDropZone.addEventListener(ev, (e) => { e.preventDefault(); postLoadDropZone.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => postLoadDropZone.addEventListener(ev, (e) => { e.preventDefault(); postLoadDropZone.classList.remove('drag'); }));
postLoadDropZone.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) handlePostLoadFile(e.dataTransfer.files[0]); });
postLoadFileInput.addEventListener('change', (e) => { if (e.target.files[0]) handlePostLoadFile(e.target.files[0]); postLoadFileInput.value = ''; });

function handlePostLoadFile(file) {
  readFileAsData(file).then(({ data, name }) => {
    pendingPostLoadFile = { data, name };
    document.getElementById('postLoadPromptText').textContent = '"' + name + '" — what should I do with it?';
    document.getElementById('postLoadPrompt').style.display = 'flex';
  }).catch((e) => alert('This file could not be read:\n' + e.message));
}

function hidePostLoadPrompt() {
  pendingPostLoadFile = null;
  document.getElementById('postLoadPrompt').style.display = 'none';
}

document.getElementById('postLoadReplaceBtn').addEventListener('click', () => {
  if (!pendingPostLoadFile) return;
  root = pendingPostLoadFile.data;
  currentFileName = pendingPostLoadFile.name;
  hidePostLoadPrompt();
  openApp(true);
});
document.getElementById('postLoadCompareBtn').addEventListener('click', () => {
  if (!pendingPostLoadFile) return;
  const oldRoot = root;
  const oldName = currentFileName;
  const newData = pendingPostLoadFile.data;
  const newName = pendingPostLoadFile.name;
  hidePostLoadPrompt();
  startCompare(oldRoot, newData, oldName, newName);
});
document.getElementById('postLoadCancelBtn').addEventListener('click', hidePostLoadPrompt);

// ---------- Header menu: Import / Export / About ----------
const menuToggle = document.getElementById('menuToggle');
const menuDropdown = document.getElementById('menuDropdown');
const menuExportToggle = document.getElementById('menuExportToggle');
const menuExportSubmenu = document.getElementById('menuExportSubmenu');
const menuImportInput = document.getElementById('menuImportInput');

function closeMenu() {
  menuDropdown.style.display = 'none';
  menuExportSubmenu.style.display = 'none';
}

menuToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = menuDropdown.style.display === 'flex';
  closeMenu();
  if (!isOpen) menuDropdown.style.display = 'flex';
});
document.addEventListener('click', (e) => {
  if (!menuDropdown.contains(e.target) && e.target !== menuToggle) closeMenu();
});

document.getElementById('menuImportBtn').addEventListener('click', () => {
  closeMenu();
  menuImportInput.click();
});

menuImportInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  menuImportInput.value = '';
  if (!file) return;
  readFileAsData(file).then(({ data, name }) => {
    if (root === null) {
      root = data;
      currentFileName = name;
      openApp(true);
    } else {
      pendingPostLoadFile = { data, name };
      document.getElementById('postLoadPromptText').textContent = '"' + name + '" — what should I do with it?';
      document.getElementById('postLoadPrompt').style.display = 'flex';
    }
  }).catch((e) => alert('This file could not be read:\n' + e.message));
});

menuExportToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  menuExportSubmenu.style.display = menuExportSubmenu.style.display === 'flex' ? 'none' : 'flex';
});

document.querySelectorAll('.menu-subitem').forEach((btn) => {
  btn.addEventListener('click', () => exportAs(btn.dataset.format));
});

function baseName() {
  return currentFileName.replace(/\.json$/i, '');
}

function exportAs(format) {
  if (root === null) { alert('Load or create a JSON first.'); closeMenu(); return; }
  let content, mime, ext;
  try {
    if (format === 'json') { content = JSON.stringify(root, null, 2); mime = 'application/json'; ext = 'json'; }
    else if (format === 'csv') { content = jsonToCSV(root); mime = 'text/csv'; ext = 'csv'; }
    else if (format === 'xml') { content = jsonToXML(root); mime = 'application/xml'; ext = 'xml'; }
    else if (format === 'yaml') {
      if (!window.jsyaml) { alert('YAML export needs js-yaml in vendor/js-yaml/ (see README).'); closeMenu(); return; }
      content = window.jsyaml.dump(root); mime = 'text/yaml'; ext = 'yaml';
    } else {
      return;
    }
  } catch (e) {
    alert('Could not export as ' + format.toUpperCase() + ':\n' + e.message);
    closeMenu();
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = baseName() + '.' + ext;
  a.click();
  URL.revokeObjectURL(url);
  closeMenu();
}

const aboutModalBg = document.getElementById('aboutModalBg');
document.getElementById('menuAboutBtn').addEventListener('click', () => {
  closeMenu();
  aboutModalBg.classList.add('open');
});
document.getElementById('aboutCloseBtn').addEventListener('click', () => aboutModalBg.classList.remove('open'));
aboutModalBg.addEventListener('click', (e) => { if (e.target === aboutModalBg) aboutModalBg.classList.remove('open'); });

// ---------- Resume autosaved session on load ----------
(function resumeSession() {
  const saved = loadFromStorage();
  if (saved && saved.data !== undefined) {
    root = saved.data;
    currentFileName = saved.fileName || 'untitled.json';
    openApp(true);
  }
})();
