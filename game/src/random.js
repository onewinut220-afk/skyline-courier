// A small seeded random source (mulberry32) so the island, the missions and
// every staged screenshot are identical on every run with the same seed.
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  function range(min, max) {
    return min + (max - min) * next();
  }
  function pick(list) {
    return list[Math.floor(next() * list.length)];
  }
  function chance(p) {
    return next() < p;
  }
  return { next, range, pick, chance };
}
