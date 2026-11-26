// The island of Skylark: a deterministic heightmap and land-use map, built
// once from the seed. The renderer reads these, never the network.
// World metres run -8192..8192 on both axes; the map is 1024 cells of 16 m.
import { CELL, MAP_CELLS, RUNWAYS } from './config.js';
import { createRandom } from './random.js';

// Land types, one byte per cell in the land map.
export const LAND = {
  WATER_DEEP: 0, WATER_SHALLOW: 1, SAND: 2,
  GRASS_LIGHT: 3, GRASS_DARK: 4, FIELD_WHEAT: 5, FIELD_GREEN: 6, FIELD_BROWN: 7,
  FOREST: 8, ROCK: 9, SNOW: 10,
  ROAD: 11, ASPHALT: 12, MARKING: 13, APRON: 14,
  ROOF_RED: 15, ROOF_BROWN: 16, ROOF_SLATE: 17, STREET: 18,
};

// Base daylight colours per land type, [r, g, b].
const BASE = {
  0: [26, 88, 138], 1: [58, 138, 181], 2: [217, 194, 138],
  3: [111, 174, 78], 4: [79, 143, 62], 5: [201, 169, 79], 6: [127, 174, 74],
  7: [138, 107, 66], 8: [47, 107, 47], 9: [138, 125, 114], 10: [242, 246, 248],
  11: [74, 74, 80], 12: [60, 63, 69], 13: [232, 232, 232], 14: [154, 154, 148],
  15: [181, 84, 60], 16: [122, 90, 60], 17: [90, 106, 122], 18: [106, 106, 106],
};

// How each sky tints the ground: morning is cool, noon neutral, dusk warm.
const TINT = {
  morning: [1.0, 1.03, 1.1],
  noon: [1.0, 1.0, 1.0],
  dusk: [1.14, 0.88, 0.64],
};

const HALF = (MAP_CELLS * CELL) / 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function hash2(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

/** Value-noise field: a grid of random values, bilinearly interpolated. */
function makeNoise(seed, cells) {
  const grid = new Float32Array((cells + 1) * (cells + 1));
  const rng = createRandom(seed);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rng.next();
  return (x, z) => {
    const fx = clamp((x + HALF) / (MAP_CELLS * CELL), 0, 1) * cells;
    const fz = clamp((z + HALF) / (MAP_CELLS * CELL), 0, 1) * cells;
    const ix = Math.min(Math.floor(fx), cells - 1);
    const iz = Math.min(Math.floor(fz), cells - 1);
    const tx = smoothstep(0, 1, fx - ix);
    const tz = smoothstep(0, 1, fz - iz);
    const a = grid[iz * (cells + 1) + ix];
    const b = grid[iz * (cells + 1) + ix + 1];
    const c = grid[(iz + 1) * (cells + 1) + ix];
    const d = grid[(iz + 1) * (cells + 1) + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
}

/** The river's centre line, in world x, as a function of world z. */
function riverX(z) {
  return -1200 + 900 * Math.sin(z * 0.00012) + 300 * Math.sin(z * 0.00031 + 1.7);
}

/** Distance from a point to the home runway's centre line, and along it. */
function runwayLocal(runway, x, z) {
  const dx = x - runway.x;
  const dz = z - runway.z;
  const sin = Math.sin(runway.heading);
  const cos = Math.cos(runway.heading);
  // Along the runway (u) and across it (v), in metres.
  return { u: dx * sin + dz * cos, v: dx * cos - dz * sin };
}

export function createTerrain(seed) {
  const n1 = makeNoise(seed + 11, 8);
  const n2 = makeNoise(seed + 23, 16);
  const n3 = makeNoise(seed + 37, 32);
  const n4 = makeNoise(seed + 51, 64);
  const forestNoise = makeNoise(seed + 71, 24);
  const fieldNoise = makeNoise(seed + 97, 48);

  const heights = new Float32Array(MAP_CELLS * MAP_CELLS);
  const land = new Uint8Array(MAP_CELLS * MAP_CELLS);

  for (let cz = 0; cz < MAP_CELLS; cz += 1) {
    for (let cx = 0; cx < MAP_CELLS; cx += 1) {
      const x = (cx + 0.5) * CELL - HALF;
      const z = (cz + 0.5) * CELL - HALF;
      // Rolling hills from three octaves of value noise.
      let h = 34 + 58 * (n1(x, z) - 0.5) * 2 + 26 * (n2(x, z) - 0.5) * 2 + 10 * (n3(x, z) - 0.5) * 2;
      // Mountains rise toward the north-west corner.
      const mountain = smoothstep(5200, 900, Math.hypot(x + 5200, z + 5200));
      h += mountain * (180 + 170 * (n4(x, z) - 0.5) * 2);
      // The river valley: carve a channel along the river's path.
      const riverDistance = Math.abs(x - riverX(z));
      h = h * (1 - smoothstep(420, 90, riverDistance)) + 1.5 * smoothstep(420, 90, riverDistance);
      if (riverDistance < 55) h = Math.min(h, -2);
      // Gull Lake in the south-east, with Gull Island in it.
      const lakeD = Math.hypot((x - 2700) / 2300, (z + 2400) / 1900);
      if (lakeD < 1) h = Math.min(h, -3);
      const islandD = Math.hypot((x - 2600) / 720, (z + 2200) / 470);
      if (islandD < 1) h = Math.max(h, 7 + 4 * (n3(x, z) - 0.5) * 2);
      // Flatten the town shelf near Skylark Field.
      const townD = Math.hypot(x - 700, z - 500) / 380;
      if (townD < 1) h = h * (1 - smoothstep(1, 0.4, townD)) + 16 * smoothstep(1, 0.4, townD);
      // Flatten both runways, with a soft edge, and clear an approach
      // corridor on the landing side that rises gently away from the strip,
      // so a final approach never meets a hillside.
      for (const key of Object.keys(RUNWAYS)) {
        const runway = RUNWAYS[key];
        const local = runwayLocal(runway, x, z);
        const inside = smoothstep(runway.length / 2 + 140, runway.length / 2 + 20, Math.abs(local.u))
          * smoothstep(runway.width / 2 + 110, runway.width / 2 + 10, Math.abs(local.v));
        h = h * (1 - inside) + runway.alt * inside;
        const beyond = -local.u - runway.length / 2;
        if (beyond > 0 && beyond < 1400 && Math.abs(local.v) < 150) {
          const corridor = smoothstep(1400, 1200, beyond)
            * smoothstep(150, 110, Math.abs(local.v));
          const corridorAlt = runway.alt + beyond * 0.03;
          h = h * (1 - corridor) + corridorAlt * corridor;
        }
      }
      heights[cz * MAP_CELLS + cx] = h;
    }
  }

  // Land use, from height, slope and region.
  for (let cz = 0; cz < MAP_CELLS; cz += 1) {
    for (let cx = 0; cx < MAP_CELLS; cx += 1) {
      const i = cz * MAP_CELLS + cx;
      const h = heights[i];
      const hx = heights[cz * MAP_CELLS + Math.min(cx + 1, MAP_CELLS - 1)] - heights[cz * MAP_CELLS + Math.max(cx - 1, 0)];
      const hz = heights[Math.min(cz + 1, MAP_CELLS - 1) * MAP_CELLS + cx] - heights[Math.max(cz - 1, 0) * MAP_CELLS + cx];
      const slope = Math.hypot(hx, hz) / (2 * CELL);
      const x = (cx + 0.5) * CELL - HALF;
      const z = (cz + 0.5) * CELL - HALF;
      let type;
      if (h < -4) type = LAND.WATER_DEEP;
      else if (h < 0.5) type = LAND.WATER_SHALLOW;
      else if (h < 2.5) type = LAND.SAND;
      else if (h > 300) type = LAND.SNOW;
      else if (slope > 0.5 || h > 235) type = LAND.ROCK;
      else if (forestNoise(x, z) > 0.62 && h > 8 && h < 185) type = LAND.FOREST;
      else if (h < 62 && slope < 0.22) {
        // Patchwork fields: a coarse 128 m cell picks the crop.
        const pick = hash2(Math.floor(x / 128), Math.floor(z / 128), seed + 5);
        type = pick < 0.3 ? LAND.FIELD_WHEAT : pick < 0.6 ? LAND.FIELD_GREEN : pick < 0.8 ? LAND.FIELD_BROWN : LAND.GRASS_LIGHT;
      } else type = fieldNoise(x, z) > 0.5 ? LAND.GRASS_LIGHT : LAND.GRASS_DARK;
      land[i] = type;
    }
  }

  // Roads: the valley road from the town to the field, and the east-west road.
  function paintRoad(x0, z0, x1, z1, widthCells) {
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / CELL);
    for (let s = 0; s <= steps; s += 1) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const z = z0 + ((z1 - z0) * s) / steps;
      for (let a = -widthCells; a <= widthCells; a += 1) {
        for (let b = -widthCells; b <= widthCells; b += 1) {
          const cx = Math.floor((x + a * CELL + HALF) / CELL);
          const cz = Math.floor((z + b * CELL + HALF) / CELL);
          if (cx < 0 || cz < 0 || cx >= MAP_CELLS || cz >= MAP_CELLS) continue;
          const i = cz * MAP_CELLS + cx;
          if (heights[i] > 0.5 && heights[i] < 80) land[i] = LAND.ROAD;
        }
      }
    }
  }
  paintRoad(700, 500, 0, 470, 0);
  paintRoad(0, 470, -2600, 1500, 0);
  paintRoad(-4200, 1500, 4200, 1500, 0);

  // The town of Skylark: a grid of little roofs around (700, 500).
  const townRng = createRandom(seed + 131);
  for (let gx = -4; gx <= 4; gx += 1) {
    for (let gz = -3; gz <= 3; gz += 1) {
      if (townRng.chance(0.25)) continue;
      const hx = 700 + gx * 64 + townRng.range(-8, 8);
      const hz = 500 + gz * 64 + townRng.range(-8, 8);
      const roof = townRng.pick([LAND.ROOF_RED, LAND.ROOF_BROWN, LAND.ROOF_SLATE]);
      for (let a = 0; a < 2; a += 1) {
        for (let b = 0; b < 2; b += 1) {
          const cx = Math.floor((hx + a * CELL + HALF) / CELL);
          const cz = Math.floor((hz + b * CELL + HALF) / CELL);
          if (cx < 0 || cz < 0 || cx >= MAP_CELLS || cz >= MAP_CELLS) continue;
          land[cz * MAP_CELLS + cx] = roof;
        }
      }
    }
  }

  // Runways and aprons, painted cell by cell.
  function paintRunway(runway) {
    const halfL = runway.length / 2;
    const halfW = runway.width / 2;
    for (let u = -halfL - 30; u <= halfL + 30; u += CELL / 2) {
      for (let v = -halfW - 24; v <= halfW + 24; v += CELL / 2) {
        const sin = Math.sin(runway.heading);
        const cos = Math.cos(runway.heading);
        const x = runway.x + u * sin + v * cos;
        const z = runway.z + u * cos - v * sin;
        const cx = Math.floor((x + HALF) / CELL);
        const cz = Math.floor((z + HALF) / CELL);
        if (cx < 0 || cz < 0 || cx >= MAP_CELLS || cz >= MAP_CELLS) continue;
        const i = cz * MAP_CELLS + cx;
        if (Math.abs(u) <= halfL && Math.abs(v) <= halfW) {
          // Centreline dashes and threshold bars in white.
          const onCentre = Math.abs(v) < 1.6 && (Math.floor(Math.abs(u) / 30) % 2 === 0);
          const threshold = Math.abs(Math.abs(u) - (halfL - 18)) < 8 && Math.abs(v) > 4;
          land[i] = onCentre || threshold ? LAND.MARKING : LAND.ASPHALT;
        } else if (Math.abs(u) <= halfL + 30 && Math.abs(v) <= halfW + 24) {
          land[i] = LAND.APRON;
        }
      }
    }
  }
  paintRunway(RUNWAYS.home);
  paintRunway(RUNWAYS.island);

  function heightAt(x, z) {
    const fx = clamp((x + HALF) / CELL - 0.5, 0, MAP_CELLS - 1.001);
    const fz = clamp((z + HALF) / CELL - 0.5, 0, MAP_CELLS - 1.001);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = heights[iz * MAP_CELLS + ix];
    const b = heights[iz * MAP_CELLS + ix + 1];
    const c = heights[(iz + 1) * MAP_CELLS + ix];
    const d = heights[(iz + 1) * MAP_CELLS + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  function landAt(x, z) {
    const cx = clamp(Math.floor((x + HALF) / CELL), 0, MAP_CELLS - 1);
    const cz = clamp(Math.floor((z + HALF) / CELL), 0, MAP_CELLS - 1);
    return land[cz * MAP_CELLS + cx];
  }

  // Palettes: for each sky, 16 haze steps over the land types, as 32-bit ABGR.
  function buildPalette(skyName, hazeRgb) {
    const tint = TINT[skyName];
    const palette = new Uint32Array(16 * 32);
    for (let haze = 0; haze < 16; haze += 1) {
      const mix = (haze / 15) * 0.72;
      for (let type = 0; type < 32; type += 1) {
        const base = BASE[type] || [0, 0, 0];
        const r = clamp(Math.round((base[0] * tint[0] * (1 - mix) + hazeRgb[0] * mix)), 0, 255);
        const g = clamp(Math.round((base[1] * tint[1] * (1 - mix) + hazeRgb[1] * mix)), 0, 255);
        const b = clamp(Math.round((base[2] * tint[2] * (1 - mix) + hazeRgb[2] * mix)), 0, 255);
        palette[haze * 32 + type] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }
    return palette;
  }

  return { heights, land, heightAt, landAt, buildPalette, riverX };
}
