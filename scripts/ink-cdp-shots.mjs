// scripts/ink-cdp-shots.mjs — real-time screenshots of the ink theme via CDP.
//
// Headless Chrome's --virtual-time-budget starves requestAnimationFrame, so
// anything animated must be captured against the wall clock. This launches
// Chrome headless with a debugging port, drives the page with Runtime.evaluate,
// waits real seconds, and saves PNGs.
//
// Usage: node scripts/ink-cdp-shots.mjs <outDir> [mode=ENDLESS] [hash=p=...]
//   Requires the dev server on :8765 and Node ≥ 22 (built-in WebSocket).

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const outDir = process.argv[2] || '.';
const mode = process.argv[3] || 'ENDLESS';
const hash = process.argv[4] || '';
const plan = (process.argv[5] || '1200,2600,4500,7000,9500').split(',').map(Number);
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=420,920', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + join(outDir, '.chrome-profile'),
  'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error('chrome did not come up');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}) {
  return new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, name), Buffer.from(r.result.data, 'base64'));
  const stats = await evaluate(`(() => { const d = window.heptaweave?.renderer.debug; if (!d) return 'no app'; const span=(d.lastNow-d.firstNow)/1000; return 'frames='+d.frames+' steps='+d.steps+' span='+span.toFixed(1)+'s phase='+d.phase; })()`);
  console.log(`${name}: ${stats}`);
}

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 920, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: `http://localhost:8765/index.html${hash ? '#' + hash : ''}` });
await sleep(1200);
await shot('00-landing.png');
await evaluate(`document.querySelector('.mode-btn[data-mode="${mode}"]').click(); 'ok'`);
const t0 = Date.now();
for (const t of plan) {
  const wait = t - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  await shot(`${String(t).padStart(5, '0')}.png`);
}
if (process.argv[6] === 'pick') {
  await evaluate(`document.querySelector('.choice-tile')?.click(); 'ok'`);
  await sleep(500); await shot('pick-500.png');
  await sleep(900); await shot('pick-1400.png');
}
ws.close();
chrome.kill();
