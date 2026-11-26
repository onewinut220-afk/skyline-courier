// The flight model and the missions: throttle and turn discipline, rings in
// order, fuel and damage that turn a sortie into decisions, landings that
// read as what happened. Fixed 1/60 s steps; the same seed always flies the
// same sky.
import { MISSIONS, PLANE, RUNWAYS, SCORE, STEP } from './config.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_TOUCHDOWN = 16;

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Which runway, if any, the point (x, z) sits on; null when off the strip. */
export function runwayAt(x, z) {
  for (const key of Object.keys(RUNWAYS)) {
    const runway = RUNWAYS[key];
    const dx = x - runway.x;
    const dz = z - runway.z;
    const sin = Math.sin(runway.heading);
    const cos = Math.cos(runway.heading);
    const u = dx * sin + dz * cos;
    const v = dx * cos - dz * sin;
    if (Math.abs(u) <= runway.length / 2 && Math.abs(v) <= runway.width / 2 + 12) {
      return { key, runway, u, v };
    }
  }
  return null;
}

export function createWorld(terrain) {
  const state = {
    missionIndex: 0,
    mission: MISSIONS[0],
    time: 0,
    score: 0,
    totalTime: 0,
    missionsDone: 0,
    ringIndex: 0,
    ringsPassed: 0,
    status: 'flying',
    crashReason: '',
    message: '',
    messageUntil: 0,
    fuelEmptyAnnounced: false,
    lastMission: null,
    /** Seconds since the wheels left the ground; the ground cannot claim the
     * aeroplane again until this has passed a second, so a fresh liftoff
     * never bounces back onto the strip. */
    airTime: 0,
    plane: {
      x: 0, z: 0, alt: 0, heading: 0, pitch: 0, bank: 0,
      speed: 0, throttle: 0, fuel: PLANE.fuelStart, damage: 0,
      gear: true, flaps: false, vspeed: 0, onGround: true, rolling: false,
    },
  };

  function setMessage(text, seconds) {
    state.message = text;
    state.messageUntil = state.time + seconds;
  }

  function placeOnRunway(runwayKey) {
    const runway = RUNWAYS[runwayKey];
    const plane = state.plane;
    const startU = -runway.length / 2 + 60;
    const sin = Math.sin(runway.heading);
    const cos = Math.cos(runway.heading);
    plane.x = runway.x + startU * sin;
    plane.z = runway.z + startU * cos;
    plane.alt = runway.alt + 1.5;
    plane.heading = runway.heading;
    plane.pitch = 0;
    plane.bank = 0;
    plane.speed = 0;
    plane.throttle = 0;
    plane.fuel = PLANE.fuelStart;
    plane.damage = 0;
    plane.gear = true;
    plane.flaps = false;
    plane.vspeed = 0;
    plane.onGround = true;
    plane.rolling = false;
  }

  function reset(missionIndex) {
    state.missionIndex = missionIndex;
    state.mission = MISSIONS[missionIndex];
    state.time = 0;
    state.ringIndex = 0;
    state.status = 'flying';
    state.crashReason = '';
    state.fuelEmptyAnnounced = false;
    placeOnRunway(state.mission.runway);
    setMessage(`${state.mission.name} — ${state.mission.brief}`, 6);
  }

  function resetAll() {
    state.score = 0;
    state.totalTime = 0;
    state.missionsDone = 0;
    state.ringsPassed = 0;
    state.lastMission = null;
    reset(0);
  }

  /** Distance and bearing to the next ring, or to the runway when rings are done. */
  function nextTarget() {
    if (state.ringIndex < state.mission.rings.length) {
      const ring = state.mission.rings[state.ringIndex];
      return { x: ring.x, z: ring.z, alt: ring.alt, ring: true, radius: ring.r };
    }
    const runway = RUNWAYS[state.mission.runway];
    const sin = Math.sin(runway.heading);
    const cos = Math.cos(runway.heading);
    return {
      x: runway.x - sin * (runway.length / 2 - 80),
      z: runway.z - cos * (runway.length / 2 - 80),
      alt: runway.alt + 30,
      ring: false,
      radius: runway.width,
      runway,
    };
  }

  function step(dt, input) {
    const plane = state.plane;
    let events = 0;
    if (state.status !== 'flying') return events;
    state.time += dt;

    // A stopped aeroplane on the target strip ends the mission. This runs
    // first, before the ground and air branches split: the ground branch
    // returns early, so a check placed after it would never see the
    // aeroplane roll to a stop.
    if (plane.onGround && plane.rolling && plane.speed < 1.5) {
      plane.rolling = false;
      const timeBonus = Math.max(0, (SCORE.missionTimePar - Math.floor(state.time)) * 2);
      state.score += timeBonus;
      state.totalTime += state.time;
      state.missionsDone += 1;
      state.lastMission = {
        name: state.mission.name,
        time: Math.floor(state.time),
        rings: state.ringIndex,
        ofRings: state.mission.rings.length,
        timeBonus,
      };
      state.status = 'landed';
      events |= EVENT_LANDED;
      return events;
    }

    // Wind gusts breathe slowly over the flight.
    const gust = 1 + 0.35 * Math.sin(state.time * 0.45) + 0.2 * Math.sin(state.time * 1.13 + 2);
    const windSpeed = state.mission.wind.speed * gust;
    const windFrom = state.mission.wind.from;
    const windX = -Math.sin(windFrom) * windSpeed;
    const windZ = -Math.cos(windFrom) * windSpeed;

    // Throttle follows the lever; an empty tank means no thrust at all.
    plane.throttle = clamp(input.throttle, 0, 1);
    if (plane.fuel <= 0) {
      plane.throttle = 0;
      if (!state.fuelEmptyAnnounced) {
        state.fuelEmptyAnnounced = true;
        setMessage('Fuel empty — engine out. Glide her in.', 5);
        events |= EVENT_FUEL_EMPTY;
      }
    }
    plane.gear = input.gear;
    plane.flaps = input.flaps;
    const stallSpeed = PLANE.stallSpeed - (plane.flaps ? 4 : 0);

    if (plane.onGround) {
      // Rolling: thrust builds speed, brakes and drag bleed it away.
      const braking = plane.throttle < 0.15 ? 2.5 : 0;
      const accel = PLANE.thrust * plane.throttle - 0.9 - braking - PLANE.drag * plane.speed * plane.speed;
      plane.speed = Math.max(0, plane.speed + accel * dt);
      plane.alt = terrain.heightAt(plane.x, plane.z) + 1.5;
      plane.vspeed = 0;
      plane.x += Math.sin(plane.heading) * plane.speed * dt;
      plane.z += Math.cos(plane.heading) * plane.speed * dt;
      plane.pitch = 0;
      plane.bank = 0;
      if (plane.speed > stallSpeed + 6 && input.pitch > 0.15) {
        plane.onGround = false;
        plane.rolling = false;
        plane.pitch = 0.15;
        state.airTime = 0;
        setMessage('Airborne.', 2);
      }
      plane.fuel = Math.max(0, plane.fuel - PLANE.fuelBurn * plane.throttle * dt * 0.5);
      return events;
    }

    // In the air: the stick steers bank and pitch toward where it points.
    state.airTime += dt;
    const bankTarget = clamp(input.bank, -1, 1) * PLANE.maxBank;
    plane.bank += clamp(bankTarget - plane.bank, -PLANE.bankRate * dt, PLANE.bankRate * dt);
    const pitchTarget = clamp(input.pitch, -1, 1) * PLANE.maxPitch;
    plane.pitch += clamp(pitchTarget - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    // A stalled wing drops the nose and answers the stick like treacle.
    const stalled = plane.speed < stallSpeed;
    if (stalled) plane.pitch = Math.max(plane.pitch - 0.35 * dt, -0.2);

    const turnRate = (1.4 * 9.81 * Math.tan(plane.bank)) / Math.max(plane.speed, 12);
    plane.heading = wrapAngle(plane.heading + turnRate * dt);

    const climbCost = 9.81 * Math.sin(plane.pitch) * 0.55;
    const accel = PLANE.thrust * plane.throttle
      - PLANE.drag * plane.speed * plane.speed
      - climbCost
      - PLANE.turnDrag * Math.abs(plane.bank);
    plane.speed = Math.max(0, plane.speed + accel * dt);

    const sink = stalled ? (stallSpeed - plane.speed) * 0.4 + 2.5 : 2.2 - (plane.flaps ? 0.7 : 0);
    plane.vspeed = plane.speed * Math.sin(plane.pitch) - sink;
    plane.alt += plane.vspeed * dt;
    plane.x += Math.sin(plane.heading) * plane.speed * Math.cos(plane.pitch) * dt + windX * dt;
    plane.z += Math.cos(plane.heading) * plane.speed * Math.cos(plane.pitch) * dt + windZ * dt;
    plane.fuel = Math.max(0, plane.fuel - PLANE.fuelBurn * plane.throttle * dt);

    // Rings, in order: fly through the glowing hoop.
    if (state.ringIndex < state.mission.rings.length) {
      const ring = state.mission.rings[state.ringIndex];
      const dx = plane.x - ring.x;
      const dz = plane.z - ring.z;
      const da = plane.alt - ring.alt;
      if (Math.sqrt(dx * dx + dz * dz + da * da) < ring.r) {
        const timeBonus = Math.max(0, SCORE.ringTimeBonus - Math.floor(state.time) * 2);
        state.score += SCORE.ring + timeBonus;
        state.ringsPassed += 1;
        state.ringIndex += 1;
        setMessage(`Ring ${state.ringIndex} of ${state.mission.rings.length} — +${SCORE.ring + timeBonus}`, 2.5);
        events |= EVENT_RING;
      }
    }

    // The ground arrives: runway, field, hillside or water. Only a plane
    // that is actually coming down can touch it — a fresh liftoff climbs
    // away from the strip instead of touching down again at once.
    const ground = terrain.heightAt(plane.x, plane.z);
    if (plane.alt <= ground + 1.5 && plane.vspeed <= 0.5 && state.airTime > 1.2) {
      const strip = runwayAt(plane.x, plane.z);
      const target = RUNWAYS[state.mission.runway];
      const onTarget = strip !== null && strip.key === state.mission.runway;
      const aligned = strip !== null
        && Math.min(
          Math.abs(wrapAngle(plane.heading - strip.runway.heading)),
          Math.abs(wrapAngle(plane.heading - strip.runway.heading - Math.PI)),
        ) < 0.45;
      const gentle = plane.vspeed >= -PLANE.softTouchdown;
      const survivable = plane.vspeed >= -PLANE.hardTouchdown && plane.speed <= 62;
      if (onTarget && aligned && gentle && plane.speed <= PLANE.fastTouchdown + 12) {
        // Touchdown: roll out on the strip.
        const touchdownVspeed = plane.vspeed;
        plane.onGround = true;
        plane.rolling = true;
        state.airTime = 0;
        plane.alt = ground + 1.5;
        plane.vspeed = 0;
        plane.pitch = 0;
        plane.bank = 0;
        let bonus = SCORE.landing;
        if (touchdownVspeed >= -2.5) bonus += SCORE.landingSoft;
        if (strip && Math.abs(strip.v) < 8) bonus += SCORE.landingOnCentre;
        state.score += bonus;
        setMessage(`Touchdown on ${target.name} — +${bonus}`, 3);
        events |= EVENT_TOUCHDOWN;
      } else if (survivable && strip !== null) {
        // A hard arrival on tarmac: the undercarriage takes it, once.
        const overSpeed = Math.max(0, plane.speed - PLANE.fastTouchdown);
        plane.damage += Math.round(Math.max(0, Math.abs(plane.vspeed) - PLANE.softTouchdown) * 9 + overSpeed * 2);
        plane.alt = ground + 2;
        plane.vspeed = 2.5;
        plane.pitch = 0.12;
        setMessage(`Hard landing — airframe ${plane.damage}% damaged`, 3);
        if (plane.damage >= 100) {
          state.status = 'crashed';
          state.crashReason = 'The undercarriage gave way on a hard landing.';
          events |= EVENT_CRASHED;
        }
      } else {
        state.status = 'crashed';
        if (ground < 0.5) state.crashReason = 'Ditched in the water.';
        else if (strip !== null) state.crashReason = 'Came down too hard on the runway.';
        else state.crashReason = 'Hit the ground away from any runway.';
        events |= EVENT_CRASHED;
      }
    }

    return events;
  }

  return {
    state, reset, resetAll, step, nextTarget, runwayAt,
  };
}

/** The autopilot that flies the staged screenshots: steer at the next target,
 * manage the throttle, flare over the threshold. It only uses the same inputs
 * a player has. */
export function autopilot(world, terrain) {
  const { state } = world;
  const plane = state.plane;
  const target = world.nextTarget();
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const distance = Math.hypot(dx, dz);
  // Aim past a ring, 300 m beyond it on the same line: chasing the ring
  // itself makes the aeroplane orbit it instead of flying through it.
  let aimX = target.x;
  let aimZ = target.z;
  if (target.ring && distance > 1) {
    aimX = target.x + (dx / distance) * 300;
    aimZ = target.z + (dz / distance) * 300;
  }
  const desiredHeading = Math.atan2(aimX - plane.x, aimZ - plane.z);
  let pitchInput;
  let throttle = 0.8;
  let gear = plane.gear;
  let flaps = plane.flaps;
  // Never fly into a hillside: stay clear of the ground ahead. En route the
  // margin is 25 m; on final the ground ahead is the strip itself, so the
  // margin shrinks to 8 m — a 25 m floor would hold the aeroplane above the
  // runway for ever. The floor is the highest ground over the next 400 m,
  // sampled every 100 m, so a hill raises it gradually instead of all at once.
  const sinH = Math.sin(plane.heading);
  const cosH = Math.cos(plane.heading);
  let terrainFloor = terrain.heightAt(plane.x, plane.z);
  for (let d = 100; d <= 400; d += 100) {
    terrainFloor = Math.max(terrainFloor, terrain.heightAt(plane.x + sinH * d, plane.z + cosH * d));
  }
  const clearanceAlt = terrainFloor + 25;
  const finalClearanceAlt = terrainFloor + 8;

  /** Pitch stick position that holds an altitude: command a vertical speed
   * toward it, then the pitch that gives that speed. The stick is a fraction
   * of max pitch, so the pitch it asks for is divided by maxPitch — sending
   * the pitch error itself would only ever reach half the pitch asked for.
   * Steadier than chasing the altitude itself, and it climbs over rising
   * ground instead of sinking into it. */
  function pitchForAltitude(targetAlt) {
    const sink = 2.2 - (plane.flaps ? 0.7 : 0);
    const desiredVspeed = clamp((targetAlt - plane.alt) * 0.35, -8, 6);
    const sinPitch = clamp((desiredVspeed + sink) / Math.max(plane.speed, 20), -0.9, 0.9);
    const pitchTarget = clamp(Math.asin(sinPitch), -PLANE.maxPitch, PLANE.maxPitch);
    return clamp(pitchTarget / PLANE.maxPitch, -1, 1);
  }
  // Steer by ground track, not by heading: the wind shoves the aeroplane
  // sideways, and only the track over the ground takes it through a ring.
  // The track is the heading plus the wind's push, so this crabs into the
  // wind on its own. On the ground the track means nothing, so use heading.
  const gust = 1 + 0.35 * Math.sin(state.time * 0.45) + 0.2 * Math.sin(state.time * 1.13 + 2);
  const windSpeed = state.mission.wind.speed * gust;
  const windX = -Math.sin(state.mission.wind.from) * windSpeed;
  const windZ = -Math.cos(state.mission.wind.from) * windSpeed;
  const vx = Math.sin(plane.heading) * plane.speed * Math.cos(plane.pitch) + windX;
  const vz = Math.cos(plane.heading) * plane.speed * Math.cos(plane.pitch) + windZ;
  const track = Math.atan2(vx, vz);
  let steerError = plane.speed > 15
    ? wrapAngle(desiredHeading - track)
    : wrapAngle(desiredHeading - plane.heading);
  // The landing: one line to follow, from the fix 1100 m before the threshold
  // at 60 m down to the numbers at 14 m, then flat for 1200 m past the far
  // end, so the lookahead keeps moving down the strip and the aeroplane
  // flies along it instead of orbiting its end.
  // The autopilot steers at a point 250 m ahead of the nearest point on the
  // line, so it converges onto the line from any direction and rides it down
  // — no phase switch, no orbit. Past the far end and still flying, it goes
  // around: climb and rejoin the line.
  let onFinal = false;
  let goAround = false;
  let finalTargetAlt = 0;
  let distToThreshold = distance;
  /** The terrain floor under the approach line: on final the ground ahead is
   * the strip's own corridor, so the floor is read from the line, not from
   * wherever the nose happens to point. */
  let lineFloorAlt = 0;
  /** How far the aeroplane is sideways from the approach line. While it is
   * still converging on the line it holds circuit height; the line's own
   * altitude only applies once it is actually on the line, or it would
   * descend to 20 m over hills a kilometre off to one side. */
  let lineLateral = 0;
  if (!target.ring) {
    const runway = RUNWAYS[state.mission.runway];
    const sin = Math.sin(runway.heading);
    const cos = Math.cos(runway.heading);
    const thresholdX = runway.x - sin * (runway.length / 2 - 80);
    const thresholdZ = runway.z - cos * (runway.length / 2 - 80);
    const fafX = thresholdX - sin * 1100;
    const fafZ = thresholdZ - cos * 1100;
    const fafAlt = runway.alt + 48;
    const endX = thresholdX + sin * 1200;
    const endZ = thresholdZ + cos * 1200;
    const endAlt = runway.alt + 2;
    const lineX = endX - fafX;
    const lineZ = endZ - fafZ;
    const lineLen = Math.hypot(lineX, lineZ);
    const dirX = lineX / lineLen;
    const dirZ = lineZ / lineLen;
    const relX = plane.x - fafX;
    const relZ = plane.z - fafZ;
    const along = clamp(relX * dirX + relZ * dirZ, 0, lineLen);
    const alongRunway = (plane.x - runway.x) * sin + (plane.z - runway.z) * cos;
    // Past the end of the approach line and still flying: go around — climb
    // and rejoin from the fix. Judged on the line itself, so it cannot flap
    // on and off as the altitude crosses a threshold.
    goAround = along > lineLen - 100 && !plane.onGround;
    if (goAround) {
      const goX = fafX - dirX * 500;
      const goZ = fafZ - dirZ * 500;
      const bearing = Math.atan2(goX - plane.x, goZ - plane.z);
      steerError = plane.speed > 15
        ? wrapAngle(bearing - track)
        : wrapAngle(bearing - plane.heading);
      finalTargetAlt = runway.alt + 80;
    } else {
      lineLateral = Math.abs(relX * dirZ - relZ * dirX);
      // Joining: still converging on the line, or past the threshold without
      // being established on it — fly to the fix at circuit height and join
      // the line there, where the full descent is available. A plane that
      // joins north of the threshold arrives too high and runs out of strip.
      const joining = lineLateral > 300 || (along > 1100 && lineLateral > 150);
      if (joining) {
        // Fly to the fix at circuit height and join the line there. Chasing
        // the look point instead would pull the aeroplane north along the
        // line while it is still a kilometre off to one side, so it would
        // arrive at the far end and go around.
        const bearing = Math.atan2(fafX - plane.x, fafZ - plane.z);
        steerError = plane.speed > 15
          ? wrapAngle(bearing - track)
          : wrapAngle(bearing - plane.heading);
        finalTargetAlt = runway.alt + 80;
        lineFloorAlt = runway.alt + 80;
        onFinal = true;
      } else {
        const look = Math.min(along + 250, lineLen);
        const lookX = fafX + dirX * look;
        const lookZ = fafZ + dirZ * look;
        const bearing = Math.atan2(lookX - plane.x, lookZ - plane.z);
        steerError = plane.speed > 15
          ? wrapAngle(bearing - track)
          : wrapAngle(bearing - plane.heading);
        // The descent is complete at the threshold: 60 m at the fix, 14 m
        // at the numbers, then flat past the far end. Reaching 14 m only
        // at the line's far end would leave the aeroplane 27 m up over the
        // threshold with no strip left to lose it on.
        const altLook = Math.min(look, 1100);
        finalTargetAlt = fafAlt + ((endAlt - fafAlt) * altLook) / 1100;
        // The floor margin shrinks to nothing at the threshold: over the strip
        // the ground is flat and known, and an 8 m floor would hold the
        // aeroplane above the tarmac for ever. Judged on the distance along
        // the line — the distance to the threshold grows again past the
        // numbers, which would keep the floor raised down the whole runway.
        const floorMargin = 8 * clamp((1100 - along) / 300, 0, 1);
        lineFloorAlt = Math.max(
          terrain.heightAt(plane.x, plane.z),
          terrain.heightAt(lookX, lookZ),
        ) + floorMargin;
        onFinal = true;
      }
    }
    distToThreshold = Math.hypot(thresholdX - plane.x, thresholdZ - plane.z);
  }
  const bankTarget = clamp(steerError * 1.6, -PLANE.maxBank, PLANE.maxBank);
  const bankInput = clamp((bankTarget - plane.bank) * 2.5, -1, 1);
  if (plane.onGround) {
    if (plane.rolling) {
      // A landing rollout: throttle shut, nose level, let the brakes work.
      pitchInput = 0;
      throttle = 0;
    } else {
      pitchInput = plane.speed > PLANE.stallSpeed + 4 ? 0.55 : 0;
      throttle = 1;
    }
    gear = true;
    flaps = false;
  } else if (onFinal) {
    // Ride the line down. The flare is nearly level with the throttle idle,
    // so the aeroplane settles instead of floating past the runway. It keys
    // on height above the strip, not distance to the threshold: past the
    // numbers that distance grows again, and the flare would switch off
    // exactly when it is needed.
    const runwayAlt = RUNWAYS[state.mission.runway].alt;
    let targetAlt = Math.max(finalTargetAlt, lineFloorAlt);
    if (lineLateral > 300) targetAlt = Math.max(targetAlt, runwayAlt + 80);
    pitchInput = pitchForAltitude(targetAlt);
    if (plane.alt < runwayAlt + 8) {
      pitchInput = clamp(0.02 / PLANE.maxPitch, -1, 1);
      throttle = 0.05;
    } else {
      throttle = plane.speed < 45 ? 0.35 : 0.2;
    }
    gear = true;
    flaps = plane.speed < 42;
  } else if (goAround) {
    const runwayAlt = RUNWAYS[state.mission.runway].alt;
    pitchInput = pitchForAltitude(Math.max(finalTargetAlt, clearanceAlt));
    throttle = 0.8;
    gear = true;
    flaps = false;
  } else {
    // Flying to a ring, or to the final approach fix: hold the target's
    // altitude, or 60 m when the target is the runway, and never below the
    // ground ahead.
    const cruiseAlt = target.ring ? target.alt : Math.max(60, RUNWAYS[state.mission.runway].alt + 48);
    pitchInput = pitchForAltitude(Math.max(cruiseAlt, clearanceAlt));
    throttle = plane.speed > 66 ? 0.45 : 0.8;
    gear = true;
    flaps = false;
  }
  return { pitch: pitchInput, bank: bankInput, throttle, gear, flaps };
}

export { STEP };
