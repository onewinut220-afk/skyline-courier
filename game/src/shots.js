// The screenshot scenes behind ?shot=start|play|rings|end. Each one flies the
// real rules forward from a fresh world, steered by the autopilot, so the frame
// is what a real flight looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { autopilot, EVENT_CRASHED, EVENT_LANDED } from './world.js';
import { SCREEN_LANDED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 3;
const PLAY_SECONDS = 58;
const APPROACH_LIMIT_SECONDS = 300;
const LAND_LIMIT_SECONDS = 420;

/** Fly the autopilot until `done(state)` or the second limit, then stop. */
function flyUntil(world, terrain, limitSeconds, done) {
  const input = { pitch: 0, bank: 0, throttle: 0, gear: true, flaps: false };
  for (let index = 0; index < limitSeconds / STEP; index += 1) {
    const control = autopilot(world, terrain);
    input.pitch = control.pitch;
    input.bank = control.bank;
    input.throttle = control.throttle;
    input.gear = control.gear;
    input.flaps = control.flaps;
    const events = world.step(STEP, input);
    if (events & EVENT_CRASHED) break;
    if (done(world.state)) break;
  }
}

/**
 * Set `world` to the named scene (start, play, rings or end; any other name
 * is start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world, terrain) {
  if (name === 'play') {
    world.reset(0);
    flyUntil(world, terrain, PLAY_SECONDS, () => false);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'rings') {
    // Fly mission 1 to the last ring and stop 500 m short of it: the frame
    // shows the glowing ring ahead with two already banked, the island
    // below, and the instruments lit. Stopping after the rings instead
    // left the runway 1100 m out — too far to read in the frame.
    world.reset(0);
    flyUntil(world, terrain, APPROACH_LIMIT_SECONDS, (state) => {
      if (state.ringIndex !== state.mission.rings.length - 1) return false;
      const ring = state.mission.rings[state.ringIndex];
      const distance = Math.hypot(ring.x - state.plane.x, ring.z - state.plane.z);
      return distance < 500;
    });
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'end') {
    // Fly mission 1 all the way to a landing: the frame shows the mission
    // complete panel over the aeroplane on the strip.
    world.reset(0);
    flyUntil(world, terrain, LAND_LIMIT_SECONDS, (state) => (state.status === 'landed'));
    const over = world.state.status === 'crashed';
    return { screen: over ? SCREEN_OVER : SCREEN_LANDED, best: world.state.score };
  }
  world.reset(0);
  for (let index = 0; index < START_SECONDS / STEP; index += 1) {
    world.step(STEP, { pitch: 0, bank: 0, throttle: 0, gear: true, flaps: false });
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
