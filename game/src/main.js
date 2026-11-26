// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, paused, crashed, mission complete and final.
//
// ?seed=N fixes the island and the missions. ?shot=start|play|rings|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { BEST_KEY, DEFAULT_SEED, STEP } from './config.js';
import { createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { createWorld, EVENT_CRASHED, EVENT_LANDED, EVENT_RING, EVENT_TOUCHDOWN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_FINAL, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const terrain = createTerrain(seed);
const world = createWorld(terrain);
const renderer = createRenderer(canvas, terrain);
const audio = createAudio();
window.__gameErrors = [];
window.addEventListener('error', (event) => window.__gameErrors.push(String(event.message)));

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  // Size the canvas to the viewport first: without this the canvas stays
  // at its 300x150 default and the whole scene is drawn into a small box
  // in the middle of the frame.
  renderer.resize();
  const scene = stageShot(name, world, terrain);
  // A handle for the play-test driver: the real world state behind the shot.
  window.__skyline = { state: world.state, screen: scene.screen, terrain, world };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, 12);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, () => buttons);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let buttons = [];
  let accumulator = 0;
  let last = performance.now();
  let warned = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each ring.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.resetAll();
    input.resetThrottle();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Mission 1: Harbour Hop.');
  }

  function nextMission() {
    if (world.state.missionIndex + 1 < 3) {
      world.reset(world.state.missionIndex + 1);
      input.resetThrottle();
      screen = SCREEN_PLAY;
      announce(`Flying. Mission ${world.state.missionIndex + 1}: ${world.state.mission.name}.`);
    } else {
      screen = SCREEN_FINAL;
      announce(`All missions complete. Total score ${world.state.score}.`);
    }
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Crashed. ${world.state.crashReason} Score ${world.state.score}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_RING) {
      audio.ring();
      announce(`Ring ${world.state.ringIndex} of ${world.state.mission.rings.length}. Score ${world.state.score}.`);
    }
    if (events & EVENT_TOUCHDOWN) audio.touchdown();
    if (events & EVENT_CRASHED) {
      audio.crash();
      endGame();
    } else if (events & EVENT_LANDED) {
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
      screen = SCREEN_LANDED;
      announce(`Mission complete. Score ${world.state.score}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
      else if (screen === SCREEN_LANDED) nextMission();
      else if (screen === SCREEN_FINAL) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { pitch: 0, bank: 0, throttle: 0, gear: true, flaps: false });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, input.control());
    const plane = world.state.plane;
    if (!plane.onGround && plane.speed < 27 && !warned) {
      warned = true;
      audio.warning();
    } else if (plane.speed > 32) warned = false;
    audio.update(plane, screen === SCREEN_PLAY);
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    buttons = renderer.draw(world.state, screen, best, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting the island fly by unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A handle for the play-test driver: the live world and its screen.
  window.__skyline = { state: world.state, screen: () => screen, world, input, terrain };
  window.__skylineScreen = () => screen;
  world.resetAll();
  renderer.resize();
  window.addEventListener('resize', renderer.resize);
  announce('Skyline Courier. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
