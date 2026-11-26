// Skyline Courier — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The seed that fixes the island, the missions and every staged screenshot. */
export const DEFAULT_SEED = 7;

/** One heightmap cell is this many metres across; the map is 1024 cells wide. */
export const CELL = 16;
/** The heightmap's size in cells (square). */
export const MAP_CELLS = 1024;
/** Sea level, in metres. */
export const SEA_LEVEL = 0;

/** The courier aeroplane: a single-engine high-wing bush plane, registration SKY-07. */
export const PLANE = {
  /** Top speed at full throttle, level flight, m/s. */
  maxSpeed: 78,
  /** Speed below which the wing stops flying, m/s. */
  stallSpeed: 24,
  /** Throttle acceleration, m/s per s at full throttle. */
  thrust: 9,
  /** Drag, per s, as a fraction of speed squared over max speed. */
  drag: 0.0015,
  /** How fast the nose follows the pitch stick, rad/s. */
  pitchRate: 0.55,
  /** How fast the wings follow the roll stick, rad/s. */
  bankRate: 1.5,
  /** The steepest bank the autopilot and the stick allow, rad. */
  maxBank: 0.9,
  /** The steepest climb or dive the stick allows, rad. */
  maxPitch: 0.42,
  /** Sink rate when the engine is out, m/s. */
  glideSink: 3.2,
  /** How much speed a turn scrubs, per s per rad of bank. */
  turnDrag: 2.2,
  /** Fuel in the tank at the start of a mission, percent. */
  fuelStart: 100,
  /** Fuel burned per second at full throttle, percent. */
  fuelBurn: 0.22,
  /** Vertical speed that still counts as a gentle touchdown, m/s. */
  softTouchdown: 4,
  /** Vertical speed that wrecks the undercarriage, m/s. */
  hardTouchdown: 7,
  /** Landing speed above which the tyres complain, m/s. */
  fastTouchdown: 48,
};

/** A mission: its name, its sky, its rings and where it ends. */
export const MISSIONS = [
  {
    name: 'Harbour Hop',
    brief: 'Three rings over the harbour, then bring her home.',
    sky: 'morning',
    wind: { from: 0.6, speed: 4 },
    rings: [
      { x: -1400, z: 2600, alt: 150, r: 26 },
      { x: 900, z: 3400, alt: 170, r: 26 },
      { x: 2100, z: 1200, alt: 140, r: 26 },
    ],
    runway: 'home',
  },
  {
    name: 'Mountain Mail',
    brief: 'Four rings through the valley, then the island strip.',
    sky: 'noon',
    wind: { from: 2.4, speed: 7 },
    rings: [
      { x: -900, z: -900, alt: 210, r: 26 },
      { x: -1900, z: -2100, alt: 240, r: 26 },
      { x: -600, z: -3300, alt: 260, r: 26 },
      { x: 1300, z: -2600, alt: 180, r: 26 },
    ],
    runway: 'island',
  },
  {
    name: 'Sunset Express',
    brief: 'Five rings round the island, home before dark.',
    sky: 'dusk',
    wind: { from: 4.4, speed: 5 },
    rings: [
      { x: 2600, z: -1200, alt: 160, r: 26 },
      { x: 3400, z: -2600, alt: 190, r: 26 },
      { x: 2400, z: -3800, alt: 210, r: 26 },
      { x: 900, z: -3400, alt: 170, r: 26 },
      { x: -200, z: -1400, alt: 150, r: 26 },
    ],
    runway: 'home',
  },
];

/** The two runways, in world metres: x and z are the centre, heading is radians (0 = north, +z). */
export const RUNWAYS = {
  home: { x: 0, z: 0, heading: 0, length: 900, width: 40, alt: 12, name: 'Skylark Field' },
  island: { x: 2600, z: -2200, heading: 1.05, length: 520, width: 30, alt: 9, name: 'Gull Island Strip' },
};

/** Ring pass and landing bonuses, in points. */
export const SCORE = {
  ring: 150,
  ringTimeBonus: 120,
  landing: 400,
  landingSoft: 150,
  landingOnCentre: 100,
  missionTimePar: 150,
};

/** Skies by time of day: horizon and zenith colours, sun colour, haze colour. */
export const SKIES = {
  morning: {
    zenith: '#3f7fd0', horizon: '#cfe4f2', sun: '#fff3c4', sunCore: '#fffbe8',
    haze: '#cfe0ee', cloud: 'rgba(255,255,255,0.85)', groundHaze: '#b8cfe0',
  },
  noon: {
    zenith: '#2f6fc4', horizon: '#bcd9ef', sun: '#fff8d0', sunCore: '#ffffff',
    haze: '#c4d8ea', cloud: 'rgba(255,255,255,0.9)', groundHaze: '#aec9de',
  },
  dusk: {
    zenith: '#4a3a72', horizon: '#f2a35e', sun: '#ffcf7a', sunCore: '#ffe9b0',
    haze: '#e8a06a', cloud: 'rgba(255,214,180,0.8)', groundHaze: '#c98d68',
  },
};

/** HUD and screen palette. */
export const PALETTE = {
  hud: '#7dffb0',
  hudDim: '#3fae72',
  amber: '#ffb347',
  red: '#ff5a4e',
  panel: 'rgba(8, 18, 26, 0.72)',
  panelEdge: 'rgba(125, 255, 176, 0.35)',
  text: '#eaf6ef',
};

export const BEST_KEY = 'skyline-courier.best';
