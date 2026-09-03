// adminPanel.js — the ink theme's admin surface: every parameter as a live
// slider, plus presets (local slots, shipped list, share link).
//
// Reached by `#admin` in the URL or a 1 s hold on the landing screen's
// bottom-right corner. A dev surface, so text labels are allowed here — the
// no-Latin rule protects the play surface, and a deliberate gesture / URL is
// the boundary.
//
// Layout: a preset row that is always visible (tweak → save → copy link
// without switching context), a tab per parameter group, and one group's
// sliders at a time so the sheet stays thumb-sized on a phone.

import { SCHEMA, DEFAULTS, decodeDiff } from '../params.js';
import { SHIPPED_PRESETS } from './presets.js';

const LS_PRESETS = 'heptaweave.ink.presets';
const LS_TAB = 'heptaweave.ink.adminTab';

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_PRESETS) || '{}') || {}; }
  catch { return {}; }
}
function saveLocal(obj) {
  try { localStorage.setItem(LS_PRESETS, JSON.stringify(obj)); } catch {}
}
function loadTab() {
  try { return localStorage.getItem(LS_TAB) || ''; } catch { return ''; }
}
function saveTab(name) {
  try { localStorage.setItem(LS_TAB, name); } catch {}
}
function fmt(v, step) {
  const decimals = (String(step).split('.')[1] || '').length;
  return decimals > 0 ? Number(v).toFixed(decimals) : String(v | 0);
}

export function createAdminPanel({ params, root }) {
  const GROUPS = [...new Set(SCHEMA.map(r => r[0]))];

  const sheet = document.createElement('section');
  sheet.className = 'admin-sheet';
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="ts-handle" data-act="collapse">
      <span class="ts-grip"></span>
      <span class="ts-title">admin</span>
      <span class="ts-close" data-act="close">✕</span>
    </div>
    <div class="ts-body">
      <div class="ts-presets">
        <div class="ts-row">
          <input class="ts-name" type="text" placeholder="preset name" maxlength="24" />
          <button class="ts-btn" data-act="save">save</button>
          <button class="ts-btn" data-act="link">copy link</button>
          <button class="ts-btn ts-warn" data-act="reset">reset</button>
        </div>
        <div class="ts-list"></div>
        <div class="ts-status"></div>
      </div>
      <div class="ts-tabs"></div>
      <div class="ts-controls"></div>
      <pre class="ts-dump"></pre>
    </div>`;
  root.appendChild(sheet);

  const tabsEl = sheet.querySelector('.ts-tabs');
  const controls = sheet.querySelector('.ts-controls');
  const list = sheet.querySelector('.ts-list');
  const status = sheet.querySelector('.ts-status');
  const dump = sheet.querySelector('.ts-dump');
  const nameInput = sheet.querySelector('.ts-name');
  const inputs = new Map();
  const panes = new Map();

  // ---- tabs + sliders ---------------------------------------------------
  let activeTab = GROUPS.includes(loadTab()) ? loadTab() : GROUPS[0];

  for (const grp of GROUPS) {
    const tab = document.createElement('button');
    tab.className = 'ts-tab';
    tab.type = 'button';
    tab.textContent = grp;
    tab.addEventListener('click', () => selectTab(grp));
    tabsEl.appendChild(tab);

    const pane = document.createElement('div');
    pane.className = 'ts-pane';
    controls.appendChild(pane);
    panes.set(grp, { tab, pane });
  }

  for (const [grp, key, label, min, max, step] of SCHEMA) {
    const wrap = document.createElement('label');
    wrap.className = 'ts-slider';
    const lab = document.createElement('span');
    lab.className = 'ts-label';
    lab.textContent = label;
    const val = document.createElement('span');
    val.className = 'ts-val';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = String(params.get(key));
    val.textContent = fmt(params.get(key), step);
    input.addEventListener('input', () => {
      params.set(key, Number(input.value));
      val.textContent = fmt(input.value, step);
      refreshDump();
    });
    wrap.append(lab, val, input);
    panes.get(grp).pane.appendChild(wrap);
    inputs.set(key, { input, val, step });
  }

  function selectTab(grp) {
    activeTab = grp;
    saveTab(grp);
    for (const [name, { tab, pane }] of panes) {
      const on = (name === grp);
      tab.classList.toggle('active', on);
      pane.hidden = !on;
    }
  }
  selectTab(activeTab);

  function syncInputs() {
    for (const [key, { input, val, step }] of inputs) {
      input.value = String(params.get(key));
      val.textContent = fmt(params.get(key), step);
    }
  }
  params.on((key) => { if (key === null) syncInputs(); });

  function refreshDump() {
    const diff = params.diff();
    const n = Object.keys(diff).length;
    dump.textContent = n ? JSON.stringify(diff, null, 1) : '{} (all defaults)';
  }

  // ---- presets ------------------------------------------------------------
  function say(msg) { status.textContent = msg; }

  function renderList() {
    list.replaceChildren();
    const local = loadLocal();
    const add = (name, diff, removable) => {
      const row = document.createElement('div');
      row.className = 'ts-preset';
      const load = document.createElement('button');
      load.className = 'ts-btn ts-load';
      load.textContent = name;
      load.addEventListener('click', () => {
        params.load(diff);
        params.save();
        nameInput.value = name;
        refreshDump();
        say(`loaded "${name}"`);
      });
      row.appendChild(load);
      if (removable) {
        const del = document.createElement('button');
        del.className = 'ts-btn ts-del';
        del.textContent = '✕';
        del.title = 'delete';
        del.addEventListener('click', () => {
          const cur = loadLocal();
          delete cur[name];
          saveLocal(cur);
          renderList();
          say(`deleted "${name}"`);
        });
        row.appendChild(del);
      }
      list.appendChild(row);
    };
    for (const p of SHIPPED_PRESETS) add(p.name, p.diff, false);
    for (const [name, diff] of Object.entries(local)) add(name, diff, true);
  }

  async function copyLink() {
    const hash = params.shareHash();
    const url = new URL(location.href);
    // Keep the admin flag in the shared link so the recipient lands in the
    // same surface they were sent from.
    url.hash = hash ? `#admin&${hash}` : '#admin';
    history.replaceState(null, '', url.toString());
    try {
      await navigator.clipboard.writeText(url.toString());
      say('link copied');
    } catch {
      say('link in address bar (clipboard blocked)');
    }
  }

  sheet.addEventListener('click', (ev) => {
    const act = ev.target?.dataset?.act;
    if (!act) return;
    ev.stopPropagation();
    if (act === 'close') { api.hide(); return; }
    if (act === 'collapse') { sheet.classList.toggle('collapsed'); return; }
    if (act === 'reset') { params.reset(); params.save(); refreshDump(); say('reset to defaults'); return; }
    if (act === 'link') { copyLink(); return; }
    if (act === 'save') {
      const name = (nameInput.value || '').trim() || `preset ${new Date().toISOString().slice(11, 16)}`;
      const cur = loadLocal();
      cur[name] = params.diff();
      saveLocal(cur);
      params.save();
      renderList();
      say(`saved "${name}"`);
    }
  });
  // Sliders must not fall through to the game surface.
  sheet.addEventListener('pointerdown', (ev) => ev.stopPropagation());

  renderList();
  refreshDump();

  // Opening the sheet lifts the play stage (see `body.admin-open` in the
  // page CSS). A resize event makes the renderer re-measure and re-lay the
  // glyph that is currently in the water; choice tiles settle next round.
  function setOpen(open) {
    document.body.classList.toggle('admin-open', open);
    window.dispatchEvent(new Event('resize'));
  }

  const api = {
    el: sheet,
    show() { sheet.hidden = false; syncInputs(); refreshDump(); setOpen(true); },
    hide() { sheet.hidden = true; setOpen(false); },
    toggle() { sheet.hidden ? api.show() : api.hide(); },
    get visible() { return !sheet.hidden; },
    selectTab,
    /** Load a diff from a raw base64url string (e.g. pasted). */
    loadEncoded(str) { params.load(decodeDiff(str)); refreshDump(); },
  };
  return api;
}

// Legacy name — the panel was `createTestPanel` while the theme lived at
// ink.html#test. Kept so older harnesses and links keep working.
export { createAdminPanel as createTestPanel, DEFAULTS };
