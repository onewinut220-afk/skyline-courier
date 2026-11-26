// All the drawing: a voxel-space chase view over the island, the courier
// aeroplane in frame, the rings, and a lit instrument panel. The terrain is
// rendered at half resolution into an offscreen buffer and upscaled; the
// aircraft, rings and HUD are drawn at full resolution on top.
import { FIELD, PLANE, RUNWAYS, SKIES, PALETTE, MISSIONS } from './config.js';
import { LAND } from './terrain.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';
export const SCREEN_FINAL = 'final';

const OFF_W = 640;
const OFF_H = 360;
const FOV = (75 * Math.PI) / 180;
const FOCAL_OFF = OFF_W / 2 / Math.tan(FOV / 2);
const FOCAL = FIELD.width / 2 / Math.tan(FOV / 2);
const FAR = 6500;

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createRenderer(canvas, terrain) {
  const ctx = canvas.getContext('2d');
  const off = document.createElement('canvas');
  off.width = OFF_W;
  off.height = OFF_H;
  const offCtx = off.getContext('2d');
  const image = offCtx.createImageData(OFF_W, OFF_H);
  const buffer = new Uint32Array(image.data.buffer);

  const palettes = new Map();
  const skyGradients = new Map();
  function paletteFor(skyName) {
    if (!palettes.has(skyName)) {
      const sky = SKIES[skyName];
      palettes.set(skyName, terrain.buildPalette(skyName, hexRgb(sky.haze)));
      const zenith = hexRgb(sky.zenith);
      const horizon = hexRgb(sky.horizon);
      const gradient = new Uint32Array(OFF_H);
      for (let y = 0; y < OFF_H; y += 1) {
        const t = y / OFF_H;
        const r = Math.round(lerp(zenith[0], horizon[0], t * t));
        const g = Math.round(lerp(zenith[1], horizon[1], t * t));
        const b = Math.round(lerp(zenith[2], horizon[2], t * t));
        gradient[y] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
      skyGradients.set(skyName, gradient);
    }
    return palettes.get(skyName);
  }

  // Clouds drift with the wind, each fixed to a bearing and an elevation.
  const clouds = [];
  {
    let seed = 1234567;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 12; i += 1) {
      clouds.push({
        angle: next() * Math.PI * 2,
        elev: 0.1 + next() * 0.28,
        size: 70 + next() * 150,
        puffs: 3 + Math.floor(next() * 3),
      });
    }
  }
  const SUN = { morning: { az: 1.9, el: 0.42 }, noon: { az: 2.6, el: 1.0 }, dusk: { az: 4.5, el: 0.2 } };

  function cameraFor(plane) {
    const sin = Math.sin(plane.heading);
    const cos = Math.cos(plane.heading);
    return {
      x: plane.x - sin * 20,
      z: plane.z - cos * 20,
      y: plane.alt + 5,
      heading: plane.heading,
      horizonOff: clamp(OFF_H * 0.42 + plane.pitch * FOCAL_OFF, 24, OFF_H - 24),
    };
  }

  function renderTerrain(camera, skyName) {
    const palette = paletteFor(skyName);
    const gradient = skyGradients.get(skyName);
    const horizon = Math.round(camera.horizonOff);
    // Sky, row by row, down to the horizon.
    for (let y = 0; y < horizon; y += 1) {
      const colour = gradient[y];
      const row = y * OFF_W;
      for (let x = 0; x < OFF_W; x += 1) buffer[row + x] = colour;
    }
    // Voxel pass: each column walks its ray out and fills what it sees.
    const { heights, land } = terrain;
    const camX = camera.x;
    const camZ = camera.z;
    const camY = camera.y;
    const heading = camera.heading;
    for (let col = 0; col < OFF_W; col += 1) {
      const angle = heading + ((col / OFF_W) - 0.5) * FOV;
      const dx = Math.sin(angle);
      const dz = Math.cos(angle);
      let yMax = OFF_H;
      let t = 10;
      while (t < FAR) {
        const wx = camX + dx * t;
        const wz = camZ + dz * t;
        // Nearest cell, clamped to the map; outside the island is open sea.
        let cx = ((wx + 8192) / 16) | 0;
        let cz = ((wz + 8192) / 16) | 0;
        let h;
        let type;
        if (cx < 0 || cz < 0 || cx >= 1024 || cz >= 1024) {
          h = -3;
          type = LAND.WATER_DEEP;
        } else {
          // Bilinear height from the four surrounding cells.
          const fx = (wx + 8192) / 16 - 0.5;
          const fz = (wz + 8192) / 16 - 0.5;
          const ix = clamp(Math.floor(fx), 0, 1022);
          const iz = clamp(Math.floor(fz), 0, 1022);
          const tx = fx - ix;
          const tz = fz - iz;
          const row = iz * 1024 + ix;
          const a = heights[row];
          const b = heights[row + 1];
          const c = heights[row + 1024];
          const d = heights[row + 1025];
          h = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
          type = land[iz * 1024 + ix];
        }
        const screenY = horizon - ((h - camY) * FOCAL_OFF) / t;
        if (screenY < yMax) {
          const haze = t < 6300 ? ((t / 420) | 0) : 15;
          const colour = palette[Math.min(haze, 15) * 32 + type];
          let y0 = Math.ceil(screenY);
          if (y0 < 0) y0 = 0;
          const y1 = yMax;
          for (let y = y0; y < y1; y += 1) buffer[y * OFF_W + col] = colour;
          yMax = y0;
          if (yMax <= 0) break;
        }
        t += 1.2 + t * 0.022;
      }
    }
    offCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, FIELD.width, FIELD.height);
  }

  /** Project a world point into screen space; null when behind the camera. */
  function project(camera, x, z, alt) {
    const dx = x - camera.x;
    const dz = z - camera.z;
    const forward = dx * Math.sin(camera.heading) + dz * Math.cos(camera.heading);
    if (forward < 8) return null;
    const lateral = dx * Math.cos(camera.heading) - dz * Math.sin(camera.heading);
    return {
      x: FIELD.width / 2 + (lateral / forward) * FOCAL,
      y: (camera.horizonOff / OFF_H) * FIELD.height - ((alt - camera.y) / forward) * FOCAL,
      scale: FOCAL / forward,
      depth: forward,
    };
  }

  function drawSun(camera, skyName) {
    const sky = SKIES[skyName];
    const sun = SUN[skyName];
    const rel = wrapAngle(sun.az - camera.heading);
    if (Math.abs(rel) > FOV / 2 + 0.3) return;
    const x = FIELD.width / 2 + (rel / (FOV / 2)) * (FIELD.width / 2);
    const y = (camera.horizonOff / OFF_H) * FIELD.height - Math.tan(sun.el) * FOCAL;
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 120);
    glow.addColorStop(0, sky.sunCore);
    glow.addColorStop(0.25, sky.sun);
    glow.addColorStop(1, 'rgba(255, 240, 180, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 120, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds(camera, time) {
    const horizonY = (camera.horizonOff / OFF_H) * FIELD.height;
    ctx.fillStyle = SKIES[currentSky].cloud;
    for (const cloud of clouds) {
      const rel = wrapAngle(cloud.angle + time * 0.002 - camera.heading);
      if (Math.abs(rel) > FOV / 2 + 0.4) continue;
      const x = FIELD.width / 2 + (rel / (FOV / 2)) * (FIELD.width / 2);
      const y = horizonY - Math.tan(cloud.elev) * FOCAL;
      const size = cloud.size;
      ctx.globalAlpha = 0.75;
      for (let p = 0; p < cloud.puffs; p += 1) {
        const px = x + (p - cloud.puffs / 2) * size * 0.45;
        const py = y + Math.sin(p * 2.1) * size * 0.08;
        ctx.beginPath();
        ctx.ellipse(px, py, size * 0.42, size * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  let currentSky = 'morning';

  function drawRing(camera, ring, passed, isNext, time, distance) {
    const p = project(camera, ring.x, ring.z, ring.alt);
    if (!p) return;
    const radius = ring.r * p.scale;
    if (radius < 3 || p.x < -radius - 80 || p.x > FIELD.width + radius + 80) return;
    const colour = passed ? '#4dff88' : isNext ? '#ffb347' : '#7dd8ff';
    const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0.9;
    ctx.save();
    ctx.globalAlpha = pulse * 0.3;
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, radius * 0.16);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = pulse;
    ctx.lineWidth = Math.max(2, radius * 0.045);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Chevrons on the hoop, pointing the way through.
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, radius * 0.05);
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(p.x - radius * 0.3 + i * radius * 0.3, p.y - radius * 0.55);
      ctx.lineTo(p.x + i * radius * 0.3, p.y - radius * 0.35);
      ctx.lineTo(p.x + radius * 0.3 + i * radius * 0.3, p.y - radius * 0.55);
      ctx.stroke();
    }
    if (isNext) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(distance)} m`, p.x, p.y - radius - 12);
    }
    ctx.restore();
  }

  function drawWindsock(camera, time) {
    const runway = RUNWAYS.home;
    const p = project(camera, runway.x, runway.z + runway.length / 2 - 30, runway.alt + 14);
    if (!p || p.depth > 2500) return;
    const s = clamp(p.scale, 0.2, 3);
    ctx.save();
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 26 * s);
    ctx.stroke();
    ctx.fillStyle = '#ff7a2e';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 26 * s);
    ctx.lineTo(p.x + 22 * s, p.y - 22 * s + Math.sin(time * 2) * 1.5);
    ctx.lineTo(p.x + 22 * s, p.y - 16 * s + Math.sin(time * 2) * 1.5);
    ctx.lineTo(p.x, p.y - 18 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPlaneShadow(camera, plane) {
    const ground = terrain.heightAt(plane.x, plane.z);
    if (plane.alt - ground > 260 || plane.onGround) return;
    const p = project(camera, plane.x, plane.z, ground + 1);
    if (!p) return;
    const size = clamp(90 * p.scale * 0.09, 6, 120);
    ctx.save();
    ctx.globalAlpha = clamp(0.35 - (plane.alt - ground) / 700, 0.06, 0.35);
    ctx.fillStyle = '#06202e';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The courier aeroplane, seen from behind and above: cream fuselage, red
   * cheatline, high wing, tail fin marked SKY-07, nav lights lit. */
  function drawPlane(plane, time) {
    const cx = FIELD.width / 2;
    const cy = 468 - plane.pitch * 130;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-plane.bank * 0.85);
    const scale = 1 + clamp((plane.speed - 30) / 120, -0.08, 0.1);
    ctx.scale(scale, scale);
    // Wings, slightly swept, with aileron lines and tip lights.
    const wingGrad = ctx.createLinearGradient(0, -58, 0, -30);
    wingGrad.addColorStop(0, '#f6ecd8');
    wingGrad.addColorStop(1, '#d9c49a');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-118, -46);
    ctx.lineTo(-14, -56);
    ctx.lineTo(14, -56);
    ctx.lineTo(118, -46);
    ctx.lineTo(104, -30);
    ctx.lineTo(-104, -30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 80, 40, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-104, -38);
    ctx.lineTo(104, -38);
    ctx.stroke();
    // Tailplane and fin.
    ctx.fillStyle = '#e8d9b8';
    ctx.beginPath();
    ctx.moveTo(-42, 34);
    ctx.lineTo(-8, 22);
    ctx.lineTo(8, 22);
    ctx.lineTo(42, 34);
    ctx.lineTo(30, 46);
    ctx.lineTo(-30, 46);
    ctx.closePath();
    ctx.fill();
    const finGrad = ctx.createLinearGradient(0, 0, 0, 78);
    finGrad.addColorStop(0, '#c23b2e');
    finGrad.addColorStop(1, '#8f2318');
    ctx.fillStyle = finGrad;
    ctx.beginPath();
    ctx.moveTo(-16, 26);
    ctx.lineTo(-10, -34);
    ctx.lineTo(12, -34);
    ctx.lineTo(18, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(1, -8);
    ctx.rotate(0);
    ctx.fillText('SKY-07', 0, 0);
    ctx.restore();
    // Fuselage: a tapered body with a red cheatline and rear windows.
    const bodyGrad = ctx.createLinearGradient(-20, 0, 20, 0);
    bodyGrad.addColorStop(0, '#efe3c8');
    bodyGrad.addColorStop(0.5, '#fbf3df');
    bodyGrad.addColorStop(1, '#dcc79b');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-19, -58);
    ctx.quadraticCurveTo(-24, 10, -15, 62);
    ctx.quadraticCurveTo(0, 72, 15, 62);
    ctx.quadraticCurveTo(24, 10, 19, -58);
    ctx.quadraticCurveTo(0, -68, -19, -58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c23b2e';
    ctx.fillRect(-19, -6, 38, 7);
    ctx.fillStyle = '#274b63';
    ctx.beginPath();
    ctx.ellipse(-9, -38, 5, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(9, -38, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nav lights: red port, green starboard, white strobe blinking.
    const blink = Math.sin(time * 6) > 0;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-118, -40, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2eff5e';
    ctx.beginPath();
    ctx.arc(118, -40, 4, 0, Math.PI * 2);
    ctx.fill();
    if (blink) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 70, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- HUD ---------------------------------------------------------------
  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
  }
  function hudText(text, x, y, size, colour, align = 'left') {
    ctx.fillStyle = colour || PALETTE.hud;
    ctx.font = `bold ${size}px "SF Mono", ui-monospace, Menlo, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }
  function compass(heading) {
    const cx = FIELD.width / 2;
    const w = 420;
    panel(cx - w / 2, 14, w, 44);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - w / 2, 14, w, 44);
    ctx.clip();
    const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
    for (let d = -60; d <= 60; d += 5) {
      const tick = Math.round(((deg + d) / 5) * 5);
      const offset = (tick - deg) * 3.2;
      const x = cx + offset;
      if (x < cx - w / 2 || x > cx + w / 2) continue;
      const major = tick % 30 === 0;
      ctx.strokeStyle = major ? PALETTE.hud : PALETTE.hudDim;
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, major ? 22 : 28);
      ctx.lineTo(x, 40);
      ctx.stroke();
      if (major) {
        const label = tick % 90 === 0
          ? ['N', 'E', 'S', 'W'][((tick / 90) % 4 + 4) % 4]
          : String(((tick % 360) + 360) % 360).padStart(3, '0');
        hudText(label, x, 48, 13, PALETTE.hud, 'center');
      }
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(cx - 7, 14);
    ctx.lineTo(cx + 7, 14);
    ctx.lineTo(cx, 24);
    ctx.closePath();
    ctx.fill();
    hudText(`${String(Math.round(deg)).padStart(3, '0')}°`, cx, 66, 15, PALETTE.amber, 'center');
  }
  function tape(x, y, w, h, value, unit, step, label) {
    panel(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const centre = y + h / 2;
    const pxPerUnit = h / (step * 8);
    const base = Math.round(value / step) * step;
    for (let v = base - step * 4; v <= base + step * 4; v += step) {
      if (v < 0) continue;
      const ty = centre - (v - value) * pxPerUnit;
      const major = v % (step * 5) === 0;
      ctx.strokeStyle = major ? PALETTE.hud : PALETTE.hudDim;
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x + w - (major ? 16 : 9), ty);
      ctx.lineTo(x + w, ty);
      ctx.stroke();
      if (major) hudText(String(v), x + w - 20, ty, 12, PALETTE.hud, 'right');
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(x + w, centre - 7);
    ctx.lineTo(x + w, centre + 7);
    ctx.lineTo(x + w - 10, centre);
    ctx.closePath();
    ctx.fill();
    panel(x - 8, centre - 26, w + 16, 52);
    hudText(`${label} · ${unit}`, x + w / 2, centre - 13, 11, PALETTE.hudDim, 'center');
    hudText(String(Math.round(value)), x + w / 2, centre + 9, 20, PALETTE.hud, 'center');
  }
  function artificialHorizon(plane) {
    const cx = 96;
    const cy = 620;
    const r = 52;
    panel(cx - r - 14, cy - r - 26, r * 2 + 28, r * 2 + 40);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-plane.bank);
    ctx.translate(0, plane.pitch * 160);
    ctx.fillStyle = '#3f7fd0';
    ctx.fillRect(-r - 4, -r * 2 - 4, r * 2 + 8, r * 2 + 4);
    ctx.fillStyle = '#8a6b42';
    ctx.fillRect(-r - 4, 0, r * 2 + 8, r * 2 + 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = PALETTE.hud;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy);
    ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.stroke();
    hudText('ATT', cx, cy - r - 12, 11, PALETTE.hudDim, 'center');
  }
  function gauges(plane) {
    const x = 1140;
    panel(x - 14, 470, 154, 170);
    hudText('THR', x, 488, 12, PALETTE.hudDim);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 44, 480, 84, 14);
    ctx.fillStyle = plane.throttle > 0.85 ? PALETTE.amber : PALETTE.hud;
    ctx.fillRect(x + 44, 480, 84 * plane.throttle, 14);
    hudText(`${Math.round(plane.throttle * 100)}%`, x + 100, 520, 14, PALETTE.hud, 'center');
    hudText('FUEL', x, 548, 12, PALETTE.hudDim);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 44, 540, 84, 14);
    ctx.fillStyle = plane.fuel < 20 ? PALETTE.red : plane.fuel < 45 ? PALETTE.amber : PALETTE.hud;
    ctx.fillRect(x + 44, 540, 84 * (plane.fuel / 100), 14);
    hudText(`${Math.round(plane.fuel)}%`, x + 100, 580, 14, PALETTE.hud, 'center');
    hudText(`GEAR ${plane.gear ? 'DOWN' : 'UP'}`, x, 606, 12, plane.gear ? PALETTE.hud : PALETTE.amber);
    hudText(`FLAPS ${plane.flaps ? 'ON' : 'OFF'}`, FIELD.width - 8, 606, 12, plane.flaps ? PALETTE.hud : PALETTE.hudDim, 'right');
    hudText(`DMG ${Math.round(plane.damage)}%`, x, 628, 12, plane.damage > 50 ? PALETTE.red : PALETTE.hudDim);
  }
  function drawButtons() {
    const buttons = [
      { id: 'flaps', label: 'FLAPS [F]', x: 1016, y: 668, w: 92, h: 34 },
      { id: 'gear', label: 'GEAR [G]', x: 1116, y: 668, w: 92, h: 34 },
      { id: 'thr-down', label: 'THR −', x: 1216, y: 668, w: 56, h: 34 },
      { id: 'thr-up', label: 'THR +', x: 1280, y: 668, w: 56, h: 34 },
    ];
    // Buttons sit just inside the right edge; keep them on the field.
    for (const b of buttons) {
      const bx = Math.min(b.x, FIELD.width - b.w - 8);
      panel(bx, b.y, b.w, b.h);
      hudText(b.label, bx + b.w / 2, b.y + b.h / 2 + 1, 13, PALETTE.text, 'center');
    }
    return buttons.map((b) => ({ ...b, x: Math.min(b.x, FIELD.width - b.w - 8) }));
  }

  function drawHud(state, time) {
    const plane = state.plane;
    const knots = plane.speed * 1.944;
    const feet = plane.alt * 3.281;
    compass(plane.heading);
    tape(24, 170, 86, 360, knots, 'KT', 10, 'SPD');
    tape(FIELD.width - 110, 170, 86, 360, feet, 'FT', 100, 'ALT');
    hudText(`V/S ${plane.vspeed >= 0 ? '+' : ''}${plane.vspeed.toFixed(1)} m/s`, FIELD.width - 67, 556, 13, PALETTE.hudDim, 'center');
    artificialHorizon(plane);
    gauges(plane);
    const buttons = drawButtons();

    // Objective, top left.
    panel(24, 14, 380, 78);
    hudText(state.mission.name.toUpperCase(), 40, 32, 15, PALETTE.amber);
    if (state.ringIndex < state.mission.rings.length) {
      hudText(`Ring ${state.ringIndex + 1} of ${state.mission.rings.length}`, 40, 56, 14, PALETTE.text);
    } else {
      hudText(`Land at ${RUNWAYS[state.mission.runway].name}`, 40, 56, 14, PALETTE.text);
    }
    hudText(`SCORE ${state.score}`, 40, 76, 14, PALETTE.hud);
    // Clock, top right.
    const minutes = Math.floor(state.time / 60);
    const seconds = Math.floor(state.time % 60);
    hudText(`TIME ${minutes}:${String(seconds).padStart(2, '0')}`, FIELD.width - 40, 32, 15, PALETTE.text, 'right');
    hudText(`MISSION ${state.missionIndex + 1}/3`, FIELD.width - 40, 56, 13, PALETTE.hudDim, 'right');

    // Warnings, centre.
    const ground = terrain.heightAt(plane.x, plane.z);
    const warnings = [];
    if (!plane.onGround && plane.speed < PLANE.stallSpeed + 3) warnings.push('STALL');
    if (plane.fuel < 20 && plane.fuel > 0) warnings.push('LOW FUEL');
    if (plane.fuel <= 0) warnings.push('ENGINE OUT');
    if (!plane.onGround && plane.alt - ground < 40 && plane.vspeed < -2) warnings.push('TERRAIN');
    if (warnings.length > 0 && Math.sin(time * 8) > -0.2) {
      hudText(warnings.join('  •  '), FIELD.width / 2, 120, 26, PALETTE.red, 'center');
    }
    // Transient message.
    if (state.time < state.messageUntil && state.message) {
      hudText(state.message, FIELD.width / 2, 640, 18, '#ffffff', 'center');
    }
    return buttons;
  }

  function overlay(title, lines, footnote) {
    ctx.fillStyle = 'rgba(4, 12, 18, 0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText(title, FIELD.width / 2, 250);
    ctx.font = '20px system-ui, sans-serif';
    let y = 310;
    for (const line of lines) {
      ctx.fillText(line, FIELD.width / 2, y);
      y += 34;
    }
    if (footnote) {
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.amber;
      ctx.fillText(footnote, FIELD.width / 2, y + 30);
    }
  }

  function draw(state, screen, best, time) {
    currentSky = state.mission.sky;
    const plane = state.plane;
    const camera = cameraFor(plane);
    renderTerrain(camera, state.mission.sky);
    drawSun(camera, state.mission.sky);
    drawClouds(camera, time);
    // Rings: the next one bright, the rest dim, passed ones green.
    for (let i = 0; i < state.mission.rings.length; i += 1) {
      const ring = state.mission.rings[i];
      const dx = plane.x - ring.x;
      const dz = plane.z - ring.z;
      const distance = Math.hypot(dx, dz);
      drawRing(camera, ring, i < state.ringIndex, i === state.ringIndex, time, distance);
    }
    drawWindsock(camera, time);
    drawPlaneShadow(camera, plane);
    drawPlane(plane, time);

    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(4, 12, 18, 0.45)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText('SKYLINE COURIER', FIELD.width / 2, 190);
      ctx.font = '24px system-ui, sans-serif';
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText('A bush-plane courier across the island of Skylark', FIELD.width / 2, 232);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillStyle = '#eaf6ef';
      const lines = [
        'Fly the rings in order, then land on the runway. Fuel is finite — mind the throttle.',
        '↑ ↓ pitch   ← → bank   Shift / Ctrl throttle   F flaps   G gear   P pause',
        'Mouse: hold and steer, or click the FLAPS / GEAR / THR buttons.',
        'Three missions: Harbour Hop · Mountain Mail · Sunset Express.',
      ];
      let y = 300;
      for (const line of lines) {
        ctx.fillText(line, FIELD.width / 2, y);
        y += 30;
      }
      if (best > 0) {
        ctx.fillStyle = PALETTE.amber;
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.fillText(`Best score: ${best}`, FIELD.width / 2, y + 16);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillText('Press SPACE or click to fly', FIELD.width / 2, 560);
      return [];
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      const buttons = drawHud(state, time);
      if (screen === SCREEN_PAUSED) {
        overlay('Paused', ['The island waits for you.'], 'Press P or click to resume');
      }
      return buttons;
    }
    if (screen === SCREEN_OVER) {
      overlay('Crashed', [state.crashReason, `Score ${state.score} — best ${Math.max(best, state.score)}`], 'Press SPACE to fly again');
      return [];
    }
    if (screen === SCREEN_LANDED) {
      const last = state.lastMission;
      const lines = last
        ? [
          `${last.name} complete — ${last.rings}/${last.ofRings} rings in ${last.time}s`,
          `Time bonus +${last.timeBonus} · Score ${state.score}`,
          state.missionIndex + 1 < MISSIONS.length ? `Next: ${MISSIONS[state.missionIndex + 1].name}` : 'That was the last mission.',
        ]
        : [`Score ${state.score}`];
      overlay(
        state.missionIndex + 1 < MISSIONS.length ? 'Mission complete' : 'All missions complete',
        lines,
        state.missionIndex + 1 < MISSIONS.length ? 'Press SPACE for the next mission' : 'Press SPACE to see your total',
      );
      return [];
    }
    if (screen === SCREEN_FINAL) {
      const stars = state.score >= 4200 ? '★★★' : state.score >= 3000 ? '★★' : '★';
      overlay(
        'Courier\'s log — complete',
        [
          `${stars}`,
          `Three missions flown in ${Math.floor(state.totalTime / 60)}:${String(Math.floor(state.totalTime % 60)).padStart(2, '0')} · ${state.ringsPassed} rings`,
          `Total score ${state.score} — best ${Math.max(best, state.score)}`,
        ],
        'Press SPACE to fly again',
      );
      return [];
    }
    return [];
  }

  function resize() {
    const scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
    canvas.width = FIELD.width;
    canvas.height = FIELD.height;
    canvas.style.width = `${Math.floor(FIELD.width * scale)}px`;
    canvas.style.height = `${Math.floor(FIELD.height * scale)}px`;
  }

  return { draw, resize, project, cameraFor };
}
