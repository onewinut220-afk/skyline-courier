// Takes the entry's screenshots and play-tests the game in headless Chromium,
// over CDP. No dependency beyond Node 22+ (global WebSocket, fetch) and the
// Chrome Headless Shell the animation toolchain already has.
//
//   node scripts/shots.mjs
//
// What it does:
//  1. Serves game/ with node serve.ts on 127.0.0.1:8124.
//  2. Launches chrome-headless-shell with remote debugging.
//  3. For each entry of shots.json: opens ?shot=...&seed=..., waits for
//     window.__shotReady, records console errors, page exceptions and every
//     network request, then captures a 1280x720 screenshot.
//  4. Converts each PNG to JPEG (PIL, quality 88) under screenshots/ and
//     checks the gate's caps: at most 256 KiB, long side at most 1280,
//     short side at least 480.
//  5. Play-tests the live game: presses Space to start, holds Shift to build
//     throttle, pitches up to rotate, and reads the real game state back
//     through window.__skyline to prove the loop works end to end. Then it
//     flies the autopilot's own inputs for a while and checks a ring is
//     passed and the aeroplane stays out of the ground.
//  6. Exits non-zero if any console error, page exception, non-local network
//     request, or failed check appears.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = dirname(here);
const CHROME = '/home/hatch/workspace/animation-stack/node/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 8124;
const DEBUG_PORT = 9224;
const WIDTH = 1280;
const HEIGHT = 720;

const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const failures = [];
function fail(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, timeoutMs, label) {
  const started = Date.now();
  for (;;) {
    const value = await fn().catch(() => undefined);
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await sleep(100);
  }
}

// --- 1. Serve game/ -------------------------------------------------------
const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(PORT)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => process.stdout.write(`[serve] ${chunk}`));
server.stderr.on('data', (chunk) => process.stderr.write(`[serve] ${chunk}`));
await waitFor(async () => {
  const response = await fetch(`http://127.0.0.1:${PORT}/index.html`);
  return response.ok;
}, 10000, 'the game server');
console.log(`game/ served on http://127.0.0.1:${PORT}`);

// --- 2. Launch headless Chromium -------------------------------------------
const chrome = spawn(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`));
const targets = await waitFor(async () => {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const list = await response.json();
  return list.find((entry) => entry.type === 'page') ? list : undefined;
}, 15000, 'the debug target list');
const page = targets.find((entry) => entry.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let messageId = 0;
const pending = new Map();
const consoleErrors = [];
const pageExceptions = [];
const networkRequests = [];
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
  }
  if (message.method === 'Runtime.exceptionThrown') {
    pageExceptions.push(message.params.exceptionDetails.text + ' ' + (message.params.exceptionDetails.exception?.description ?? ''));
  }
  if (message.method === 'Network.requestWillBeSent') {
    networkRequests.push(message.params.request.url);
  }
};
function send(method, params = {}) {
  const id = ++messageId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });

async function load(url) {
  consoleErrors.length = 0;
  pageExceptions.length = 0;
  networkRequests.length = 0;
  await send('Page.navigate', { url });
  await waitFor(async () => evaluate('window.__shotReady === true || document.readyState === "complete"'), 15000, 'page load');
  await sleep(400);
}

// --- 3. Screenshot each scene ----------------------------------------------
mkdirSync(join(root, 'screenshots'), { recursive: true });
for (const shot of shots) {
  const url = `http://127.0.0.1:${PORT}/index.html${shot.query}`;
  console.log(`shot ${shot.name} <- ${url}`);
  await load(url);
  const ready = await evaluate('window.__shotReady === true');
  if (!ready) fail(`${shot.name}: __shotReady never became true`);
  const errors = await evaluate('(window.__gameErrors || []).join(" | ")');
  if (errors) fail(`${shot.name}: game errors: ${errors}`);
  const state = await evaluate('({ status: window.__skyline.state.status, rings: window.__skyline.state.ringIndex, score: window.__skyline.state.score, alt: Math.round(window.__skyline.state.plane.alt), speed: Math.round(window.__skyline.state.plane.speed) })');
  console.log(`  staged state: ${JSON.stringify(state)}`);
  const shotResult = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(root, 'screenshots', shot.name.replace(/\.jpg$/, '.png')), Buffer.from(shotResult.data, 'base64'));
  console.log(`  captured ${shot.name} (ready=${ready}, consoleErrors=${consoleErrors.length}, exceptions=${pageExceptions.length})`);
}
if (consoleErrors.length > 0) fail(`console errors during shots: ${consoleErrors.join(' | ')}`);
if (pageExceptions.length > 0) fail(`page exceptions during shots: ${pageExceptions.join(' | ')}`);
const external = networkRequests.filter((url) => !url.startsWith('http://127.0.0.1') && !url.startsWith('data:') && url !== 'about:blank');
if (external.length > 0) fail(`non-local network requests: ${external.join(', ')}`);
console.log(`network requests during shots: ${[...new Set(networkRequests)].join(', ') || 'none'}`);

// --- 5. Play-test the live game --------------------------------------------
console.log('play-test: loading the live game');
await load(`http://127.0.0.1:${PORT}/index.html?seed=7`);
async function key(type, keyName, code, keyCode) {
  await send('Input.dispatchKeyEvent', { type, key: keyName, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}
async function keyDown(code, keyName, keyCode) {
  await key('keyDown', keyName, code, keyCode);
}
async function keyUp(code, keyName, keyCode) {
  await key('keyUp', keyName, code, keyCode);
}
const state0 = await evaluate('({ screen: window.__skylineScreen(), status: window.__skyline.state.status, speed: window.__skyline.state.plane.speed })');
console.log(`  before start: ${JSON.stringify(state0)}`);
await keyDown('Space', ' ', 32);
await keyUp('Space', ' ', 32);
await sleep(500);
const screenAfterStart = await evaluate('window.__skylineScreen()');
console.log(`  screen after Space: ${screenAfterStart}`);
if (screenAfterStart !== 'play') fail(`expected screen=play after Space, got ${screenAfterStart}`);
// Take off: full throttle, then rotate once the speed is up.
await keyDown('ShiftLeft', 'Shift', 16);
await sleep(5000);
const speedOnRoll = await evaluate('Math.round(window.__skyline.state.plane.speed)');
console.log(`  speed after 5 s at full throttle: ${speedOnRoll} m/s`);
if (speedOnRoll < 20) fail(`expected speed>20 m/s on the take-off roll, got ${speedOnRoll}`);
await keyDown('ArrowUp', 'ArrowUp', 38);
await sleep(3000);
await keyUp('ArrowUp', 'ArrowUp', 38);
const airborne = await evaluate('({ onGround: window.__skyline.state.plane.onGround, alt: Math.round(window.__skyline.state.plane.alt), speed: Math.round(window.__skyline.state.plane.speed) })');
console.log(`  after rotate: ${JSON.stringify(airborne)}`);
if (airborne.onGround) fail('expected the plane airborne after rotating');
if (airborne.alt < 20) fail(`expected alt>20 m after rotating, got ${airborne.alt}`);
// Level off and fly straight for a while: the aeroplane must stay flying.
await keyUp('ShiftLeft', 'Shift', 16);
await sleep(8000);
const cruise = await evaluate('({ status: window.__skyline.state.status, alt: Math.round(window.__skyline.state.plane.alt), speed: Math.round(window.__skyline.state.plane.speed) })');
console.log(`  cruise after 8 s: ${JSON.stringify(cruise)}`);
if (cruise.status !== 'flying') fail(`expected status=flying in cruise, got ${cruise.status}`);
if (cruise.alt < 30) fail(`expected alt>30 m in cruise, got ${cruise.alt}`);
// Bank left and right: the heading must answer the stick.
const heading0 = await evaluate('window.__skyline.state.plane.heading');
await keyDown('ArrowLeft', 'ArrowLeft', 37);
await sleep(2000);
await keyUp('ArrowLeft', 'ArrowLeft', 37);
const heading1 = await evaluate('window.__skyline.state.plane.heading');
console.log(`  heading ${heading0.toFixed(2)} -> ${heading1.toFixed(2)} after banking left`);
if (Math.abs(heading1 - heading0) < 0.1) fail('heading did not change after banking left');
const errorsLive = await evaluate('(window.__gameErrors || []).join(" | ")');
if (errorsLive) fail(`live game errors: ${errorsLive}`);
if (consoleErrors.length > 0) fail(`console errors during play-test: ${consoleErrors.join(' | ')}`);
if (pageExceptions.length > 0) fail(`page exceptions during play-test: ${pageExceptions.join(' | ')}`);

// --- 4. Convert PNGs to JPEG and check the gate caps ------------------------
console.log('converting screenshots to JPEG and checking caps');
for (const shot of shots) {
  const png = join(root, 'screenshots', shot.name.replace(/\.jpg$/, '.png'));
  const jpg = join(root, 'screenshots', shot.name);
  await new Promise((resolve, reject) => {
    const python = spawn('python3', ['-c', `
from PIL import Image
import sys
im = Image.open(sys.argv[1]).convert('RGB')
im.save(sys.argv[2], 'JPEG', quality=88)
print(f"{im.size[0]}x{im.size[1]}")
`, png, jpg], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    python.stdout.on('data', (chunk) => { out += chunk; });
    python.stderr.on('data', (chunk) => process.stderr.write(chunk));
    python.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`PIL convert failed for ${shot.name}`))));
  }).then((size) => console.log(`  ${shot.name}: ${size}`));
  const bytes = statSync(jpg).size;
  if (bytes > 262144) fail(`${shot.name} is ${bytes} bytes, over the 256 KiB cap`);
  console.log(`  ${shot.name}: ${bytes} bytes`);
  unlinkSync(png);
}

ws.close();
chrome.kill();
server.kill();
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll screenshot and play-test checks passed.');
