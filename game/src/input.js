// Keyboard and mouse: arrows/WASD for pitch and bank, Shift/Ctrl for the
// throttle lever, F flaps, G gear, P pause, Space to start. Holding the mouse
// steers like a yoke; clicking a HUD button works it instead.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

/** The control state the world reads each step: stick -1..1, throttle 0..1. */
export function createInput(canvas, getButtons) {
  const keys = new Set();
  let mouse = { x: FIELD.width / 2, y: FIELD.height / 2, down: false };
  let throttle = 0;
  let gear = true;
  let flaps = false;
  let actions = 0;

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
    };
  }
  function hitButton(point) {
    const buttons = getButtons();
    for (const button of buttons) {
      if (point.x >= button.x && point.x <= button.x + button.w && point.y >= button.y && point.y <= button.y + button.h) {
        return button.id;
      }
    }
    return null;
  }
  function workButton(id) {
    if (id === 'flaps') flaps = !flaps;
    else if (id === 'gear') gear = !gear;
    else if (id === 'thr-up') throttle = Math.min(1, throttle + 0.1);
    else if (id === 'thr-down') throttle = Math.max(0, throttle - 0.1);
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    }
    if (event.code === 'KeyP') actions |= ACTION_PAUSE;
    if (event.code === 'KeyF') flaps = !flaps;
    if (event.code === 'KeyG') gear = !gear;
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown' || event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    const point = canvasPoint(event);
    const button = hitButton(point);
    if (button) {
      workButton(button);
      return;
    }
    mouse = { ...point, down: true };
  });
  canvas.addEventListener('mousemove', (event) => {
    const point = canvasPoint(event);
    mouse.x = point.x;
    mouse.y = point.y;
  });
  window.addEventListener('mouseup', (event) => {
    const point = canvasPoint(event);
    const wasSteering = mouse.down;
    mouse.down = false;
    // A click (not a steering drag) on empty sky confirms, like Space.
    if (wasSteering && hitButton(point) === null) actions |= ACTION_CONFIRM;
  });

  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  /** The stick the world reads: keyboard first, the mouse yoke while held. */
  function control() {
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) throttle = Math.min(1, throttle + 0.016);
    if (keys.has('ControlLeft') || keys.has('ControlRight')) throttle = Math.max(0, throttle - 0.016);
    let pitch = 0;
    let bank = 0;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) bank -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) bank += 1;
    if (mouse.down && pitch === 0 && bank === 0) {
      bank = (mouse.x - FIELD.width / 2) / (FIELD.width / 2);
      pitch = -(mouse.y - FIELD.height / 2) / (FIELD.height / 2);
    }
    return { pitch, bank, throttle, gear, flaps };
  }

  function resetThrottle() {
    throttle = 0;
  }

  return { takeActions, control, resetThrottle };
}
