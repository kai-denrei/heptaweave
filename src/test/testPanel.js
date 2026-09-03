// testPanel.js — the ink theme's test mode: every param as a live slider,
// plus presets (local slots, shipped list, share link).
//
// A dev surface: text labels are allowed here. Reached only by a deliberate
// gesture (1 s corner hold on landing) or `#test` in the URL, so the play
// surface's no-text rule is untouched.

import { SCHEMA, DEFAULTS, decodeDiff } from '../params.js';
import { SHIPPED_PRESETS } from './presets.js';

const LS_PRESETS = 'heptaweave.ink.presets';

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_PRESETS) || '{}') || {}; }
  catch { return {}; }
}
function saveLocal(obj) {
  try { localStorage.setItem(LS_PRESETS, JSON.stringify(obj)); } catch {}
}
function fmt(v, step) {
  const decimals = (String(step).split('.')[1] || '').length;
  return decimals > 0 ? Number(v).toFixed(decimals) : String(v | 0);
}

export function createTestPanel({ params, root }) {
  const sheet = document.createElement('section');
  sheet.className = 'test-sheet';
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="ts-handle" data-act="collapse"><span class="ts-grip"></span><span class="ts-title">test mode</span><span class="ts-close" data-act="close">✕</span></div>
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
      <div class="ts-controls"></div>
      <pre class="ts-dump"></pre>
    </div>`;
  root.appendChild(sheet);

  const controls = sheet.querySelector('.ts-controls');
  const list = sheet.querySelector('.ts-list');
  const status = sheet.querySelector('.ts-status');
  const dump = sheet.querySelector('.ts-dump');
  const nameInput = sheet.querySelector('.ts-name');
  const inputs = new Map();

  // ---- sliders, grouped -------------------------------------------------
  let group = null;
  for (const [grp, key, label, min, max, step] of SCHEMA) {
    if (grp !== group) {
      group = grp;
      const h = document.createElement('div');
      h.className = 'ts-section';
      h.textContent = grp;
      controls.appendChild(h);
    }
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
    controls.appendChild(wrap);
    inputs.set(key, { input, val, step });
  }

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
    url.hash = hash ? `#${hash}` : '';
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

  const api = {
    el: sheet,
    show() { sheet.hidden = false; syncInputs(); refreshDump(); },
    hide() { sheet.hidden = true; },
    toggle() { sheet.hidden ? api.show() : api.hide(); },
    get visible() { return !sheet.hidden; },
    /** Load a diff from a raw base64url string (e.g. pasted). */
    loadEncoded(str) { params.load(decodeDiff(str)); refreshDump(); },
  };
  return api;
}

export { DEFAULTS };
