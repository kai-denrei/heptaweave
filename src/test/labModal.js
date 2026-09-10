// labModal.js — the hidden gear's modal: experiments only.
//
// A second, smaller dev surface next to the admin sheet. It lists the `lab`
// group of params.js as switches (0/1 rows) and sliders, nothing else. Opened
// by an invisible gear in the top-right corner (see index.html) — it never
// shows, it is only there to be tapped by someone who knows.

import { SCHEMA } from '../params.js';

export function createLabModal({ params, root }) {
  const rows = SCHEMA.filter(r => r[0] === 'lab');
  const modal = document.createElement('div');
  modal.className = 'lab-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="lab-card" role="dialog" aria-label="lab">
      <div class="lab-head"><span>lab</span><button class="lab-close" type="button" aria-label="close">✕</button></div>
      <div class="lab-rows"></div>
      <div class="lab-foot">experiments · saved with the other params</div>
    </div>`;
  root.appendChild(modal);
  const rowsEl = modal.querySelector('.lab-rows');
  const inputs = new Map();

  for (const [, key, label, min, max, step] of rows) {
    const isSwitch = (min === 0 && max === 1 && step === 1);
    const row = document.createElement('label');
    row.className = 'lab-row';
    const lab = document.createElement('span');
    lab.className = 'lab-label';
    lab.textContent = label;
    const input = document.createElement('input');
    const val = document.createElement('span');
    val.className = 'lab-val';
    if (isSwitch) {
      input.type = 'checkbox';
      input.checked = params.get(key) >= 1;
      input.addEventListener('change', () => { params.set(key, input.checked ? 1 : 0); params.save(); });
    } else {
      input.type = 'range';
      input.min = String(min); input.max = String(max); input.step = String(step);
      input.value = String(params.get(key));
      val.textContent = String(params.get(key));
      input.addEventListener('input', () => { params.set(key, Number(input.value)); val.textContent = input.value; params.save(); });
    }
    row.append(lab, val, input);
    rowsEl.appendChild(row);
    inputs.set(key, { input, val, isSwitch });
  }
  function sync() {
    for (const [key, { input, val, isSwitch }] of inputs) {
      if (isSwitch) input.checked = params.get(key) >= 1;
      else { input.value = String(params.get(key)); val.textContent = String(params.get(key)); }
    }
  }
  params.on((key) => { if (key === null || inputs.has(key)) sync(); });

  modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('.lab-close')) api.hide(); });
  modal.addEventListener('pointerdown', (ev) => ev.stopPropagation());

  const api = {
    el: modal,
    show() { modal.hidden = false; sync(); },
    hide() { modal.hidden = true; },
    toggle() { modal.hidden ? api.show() : api.hide(); },
    get visible() { return !modal.hidden; },
  };
  return api;
}
