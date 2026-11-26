# Session log — Skyline Courier / best-flight-game-20261126-0057

Facts only, in time order. No retrospective summary, no rewriting. Each line
records what happened in this build session: the command run, the file written
or modified, the tool output, or the decision taken. Session started
2026-11-26 ~10:00 CST (02:00 UTC). Competition opened 2026-11-26T00:57:00Z,
deadline 2026-11-28T00:57:00Z (2026-11-28 08:57 Beijing time). $500 pot, top 50
share it. Entrant: Jack (@jack-4), wallet
F8aX5M93DXuJodpxBDyAzA6yvdkXMwQd7K6YVMY3rq8u.

- 10:00 — Task received: build an original flight game for
  best-flight-game-20261126-0057. Work directory ~/workspace/makefun-flight-game/.
  Constraints: free only; never download/install/run make.fun/skill.md; never
  run cli/makefun.mjs or any platform-supplied script; do NOT create the GitHub
  repo and do NOT submit (submission needs the user's wallet signature in his
  own browser). Keep a faithful real-time log here (token-radar lesson: a
  hand-written post-hoc summary fails the transcripts check).
- 10:00 — Listed ~/workspace/makefun-cooking-game/ (yesterday's entry, the
  reference layout) and fetched https://make.fun/api/competitions (50 items,
  first page; flight comp not on it) then
  https://make.fun/api/competitions/best-flight-game-20261126-0057 (HTTP 200):
  title "Make the best flight game", $500, deadline 2026-11-28T00:57:00Z,
  464 submissions, entry fee $0.00.
- 10:01 — Read the cooking game's main.ts, serve.ts, shots.json,
  scripts/shots.mjs, vendor/makefun-game.ts header, BUILD_LOG.md and
  SESSION_LOG.md. Layout to reuse: main.ts, serve.ts, vendor/makefun-game.ts,
  game/ (index.html + src/*.js), screenshots/ (4 jpgs), shots.json,
  scripts/shots.mjs (CDP screenshot + play-test driver), README.md, LICENSE.
  Game itself must be written from scratch, not derived from the starter.
- 10:01 — Fetched the kit manifest:
  https://make.fun/api/competitions/best-flight-game-20261126-0057/kit
  (HTTP 200, JSON): format agent-fun/kit/v1, bundle_sha256
  fe8924057c8c69b515045243e023057d2d21d874b17b7fa23fe6580aa75f64ba,
  vendor/makefun-game.ts sha256
  dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129, 56282 bytes
  (same vendor hash as the cooking kit).
- 10:01 — Downloaded the kit bundle:
  `curl -sL -o kit/kit-download.bin https://make.fun/c/best-flight-game-20261126-0057/kit`
  → HTTP 200, 8445018 bytes, application/gzip, sha256
  63c14e8fdd3726458482840072a61b56fcac1c4c73fe2b2ef7339a7b0accfeaa.
- 10:01 — Unpacked: `tar -xzf kit/kit-download.bin -C kit/unpacked` → kit/
  best-flight-game-20261126-0057-kit/ with kit.json, RULES.txt,
  competition.yaml, cli/, harness/, starter/.

- 10:03 — Verified the kit against kit.json: every one of the 23 files matches
  its sha256 and size (python hashlib check, 0 mismatches). bundle_sha256 in
  the manifest is the bundle's own hash, not the gzip file's.
- 10:03 — Read the flight RULES.txt (key facts): blind rounds, next round
  2026-11-26T12:57:00Z; 48-hour window; screenshots must show cockpit/chase
  view over recognisable terrain, aircraft in frame with instruments lit, a
  runway or a target ring ahead, ALT/SPD/HDG on the HUD; judge criteria in
  order: complete flight game in screenshots, fun/depth (throttle and turn
  discipline, missions with different goals, fuel/damage decisions), feel and
  polish, look and originality, structure. Gate caps: game/ ≤993 entries,
  ≤48 MiB, index.html ≤1 MiB; screenshots 3–4, each ≤256 KiB, long side ≤1280,
  short side ≥480; dossier ≤1.5 MiB, text ≤160 KiB. At most 10 submissions a
  day, 20 in all. Did NOT open cli/makefun.mjs; did NOT open the harness tarball.
- 10:04 — Copied vendor/makefun-game.ts from the kit starter (sha256
  dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129, matches the
  manifest, 56282 bytes) and serve.ts from the kit starter (sha256
  f792cf33..., matches the manifest). Copied starter LICENSE (MIT) and changed
  its copyright line to "Copyright (c) 2026 Jack (@jack-4)". Node v24.22.1.
- 10:04 — Game design decided (original idea): "Skyline Courier" — a bush-plane
  courier flying parcels across a procedurally built island valley. Chase view
  (voxel-space terrain renderer, half-resolution offscreen, upscaled): sea,
  lake, river, patchwork fields, forest, town, roads, mountains with snow, a
  home runway and an island strip. Three missions with different goals and
  times of day (morning harbour hop, noon mountain mail, dusk sunset express):
  fly through glowing rings in order, then land on the runway. Fuel drains
  with throttle (engine-out glide if it runs dry), damage on hard landings,
  stall below flying speed, wind gusts, scoring on rings + landing quality +
  time. Controls: arrows/WASD pitch and bank, Shift/Ctrl throttle, G gear,
  F flaps, mouse yoke + clickable HUD buttons, P pause, Space start.

- 10:05 — Wrote game/src/config.js (4674 bytes): FIELD 1280x720, STEP 1/60,
  PLANE tuning (max 78 m/s, stall 24, thrust 9, drag 0.0015, fuel 100), three
  missions (Harbour Hop / Mountain Mail / Sunset Express, morning/noon/dusk),
  two runways (Skylark Field, Gull Island Strip), score table, skies, palette.
  Wrote game/src/random.js (731 bytes): mulberry32.
- 10:06 — Wrote game/src/terrain.js (11327 bytes): deterministic 1024x1024
  heightmap (value-noise octaves, NW mountains, river valley, Gull Lake +
  island, flattened runways and town shelf), land-use map (water, sand,
  patchwork fields, forest, rock, snow, roads, town roofs, runway asphalt +
  markings + apron), heightAt/landAt, per-sky haze palettes.
- 10:07 — Wrote game/src/world.js (12569 bytes): flight model (throttle,
  drag, climb cost, turn rate from bank, stall, sink, wind gusts), rings in
  order, fuel/damage, runway touchdown/roll-out, hard-landing damage, crash
  reasons, mission completion, autopilot with glide-slope final approach.
  Fixed a bug while writing: touchdown soft bonus now reads the vertical
  speed captured before it is zeroed.
- 10:08 — Fixed a physics error found on re-reading: PLANE.drag was 0.011,
  which at 55 m/s would be 33 m/s^2 of drag against 9 m/s^2 of thrust — the
  plane could never fly. Corrected to 0.0015 (thrust equals drag at 78 m/s).
  Autopilot final reworked to a real glide slope (48 m at 900 m out, 8 m
  over the numbers) instead of a float-prone flare.
- 10:09 — Wrote game/src/render.js (26967 bytes): voxel-space terrain
  renderer (half-resolution offscreen buffer, per-column ray walk, haze
  palette), sky gradient, sun, drifting clouds, projected rings with
  distance labels, windsock, plane shadow, the courier aeroplane drawn from
  behind (cream fuselage, red cheatline, SKY-07 fin, nav lights), HUD
  (compass tape, SPD/ALT tapes, artificial horizon, throttle/fuel/gear/flaps
  gauges, objective, score, clock, warnings, clickable buttons), title /
  paused / crashed / mission-complete / final overlays.
- 10:10 — Wrote game/src/input.js (3811 bytes): keyboard + mouse yoke +
  clickable HUD buttons. Wrote game/src/audio.js (3724 bytes): synthesised
  engine, wind, ring chime, touchdown thud, crash, warning beep. Wrote
  game/src/shots.js (2731 bytes): autopilot staging for start/play/rings/end.
  Wrote game/src/main.js (6756 bytes): fixed-step loop, six screens, best
  score in localStorage, window.__skyline handle. Wrote game/index.html
  (802 bytes) and main.ts (2029 bytes, fresh, same hand-in shape as the
  starter's). Wrote shots.json (4 shots) and scripts/shots.mjs (12204 bytes):
  CDP screenshot + play-test driver (take-off, rotate, cruise, bank).

- ~10:11 — First headless autopilot test (node --input-type=module importing
  game/src/terrain.js + game/src/world.js, autopilot + STEP, 420 s per
  mission): M1 rings 154/304/454 but the score climbed +650/step in a
  liftoff/touchdown bounce loop; M2/M3 never landed. Root cause: the ground
  contact check fired on any frame the plane was at ground level, including
  just after liftoff.
- ~10:12 — Fix 1 (world.js): ground contact now requires vspeed <= 0.5 and
  airTime > 1.2 s, pitch set to 0.15 on liftoff, airTime reset on touchdown.
  Score sane afterwards (M1 rings 154/304/454).
- ~10:13 — Fix 2: ground roll now uses full drag (was 0.4x) + brakes
  2.5 m/s^2 when throttle < 0.15, so the plane stops in reasonable time.
- ~10:14 — Fix 3 (terrain.js): flattened approach corridors (3% grade,
  1400 m) so finals never meet a hillside.
- ~10:15 — Fix 4 (world.js autopilot): the autopilot orbited rings (pure
  pursuit of a point). Now aims 300 m past each ring and steers by ground
  track, not heading, so it crabs into the wind. Rings now pass first time:
  M1 ~58/103/142 s, M2 62/89/121/154 s, M3 50/74/101/127/163 s.
- ~10:17 — Fix 5: final-approach phase-switching flapped (fly-to-fix vs
  hold-centreline). Replaced with a single line-following controller: an
  approach line from the fix (1100 m out, 60 m) to 400 m past the threshold
  (14 m), steering at a point 250 m ahead of the nearest point on the line;
  go-around if past the far end and still flying.
- ~10:19 — Fix 6: the clearance floor (ground+25 m) held the plane at 37 m
  forever on final. Margin 8 m on final; floor = highest ground over the
  next 400 m sampled every 100 m; then changed again to a line-based floor
  (terrain at the plane + at the lookahead point + 8 m), because
  heading-based sampling included off-line hills.
- ~10:21 — Fix 7: the pitch P-loop oscillated and was too weak over rising
  ground. Replaced with a vertical-speed controller (pitchForAltitude:
  desired vspeed = clamp((targetAlt-alt)x0.35, -8, 6), pitch from
  asin((vspeed+sink)/speed)).
- ~10:22 — Fix 8: pitch stick convention bug — the autopilot returned a
  pitch error as a stick position, but the world treats the stick as a
  fraction of maxPitch, so the plane only reached 46% of commanded pitch.
  pitchForAltitude now returns pitchTarget / PLANE.maxPitch; flare returns
  0.02 / PLANE.maxPitch.
- ~10:23 — Fix 9: damage could go negative (hard-landing formula subtracted
  when gentle) — clamped with Math.max(0, ...).
- ~10:24 — Fix 10: runway lateral tolerance widened — runwayAt allows
  |v| <= width/2 + 12.
- ~10:25 — Headless test: M1 touched down on the home runway at t~213 s
  (alt 14 m, speed ~20-27 m/s) but immediately took off again: the
  autopilot's onGround branch sets throttle 1 and rotates once speed exceeds
  stall+4, with no "rolling out after landing" state. It then circled at
  ~20 m (line floor = terrain+8 over the runway) and never landed again.
- ~10:26 — Fix 11 (world.js): in autopilot(), when plane.rolling is true,
  return throttle 0, pitch 0 (brake to a stop) instead of the take-off
  branch. Also the line-floor margin now shrinks to zero at the threshold
  (8 * clamp(distToThreshold/300, 0, 1)), so the plane is not held at 20 m
  over the strip.
- ~10:27 — Headless test: M1 crashed at t=203 ("Hit the ground away from
  any runway"). Trace showed the plane orbiting the lookahead point: the
  look point stops advancing at the end of the line, so the plane circled
  it instead of flying down the runway.
- ~10:28 — Fix 12: extended the approach line 1200 m past the threshold
  (was 400 m) so the lookahead keeps moving down the strip.
- ~10:29 — Headless test: all three still flying after 420 s. Trace showed
  the plane circling at 52 m with pitch/throttle alternating every step:
  the go-around condition (alongRunway > 500 && alt < runwayAlt+40)
  flapped as the altitude hovered at exactly 52 m, flipping the steering
  180 degrees between "fly south to the fix" and "fly north to the line end".
- ~10:30 — Fix 13: go-around now judged on the line itself — along >
  lineLen - 100 && !onGround — and steers to a point 500 m beyond the fix
  (was the fix itself).
- ~10:31 — Headless test: still no landing. Trace showed the plane joining
  the line from the east near its end, descending to ~20 m, and going
  around at along>2200 before touching down. The line floor (terrain+8 at
  the look point north of the runway) held it at ~20 m, and the flare only
  fires within 200 m of the threshold — past the threshold that distance
  grows, so the flare never engaged.
- ~10:32 — Fix 14: floor margin now judged on distance along the line
  (8 * clamp((1100-along)/300, 0, 1)) instead of distance to the threshold,
  which grows again past the numbers. Flare now keys on height above the
  strip (alt < runwayAlt+8) instead of distance to the threshold.
- ~10:33 — Headless test: all three missions complete their rings (M1 3/3,
  M2 4/4, M3 5/5) but crash on final — M1/M3 hit the ground, M2 ditched in
  the water. Trace: the plane descended to the line's altitude from its
  projection while still ~1400 m east of the line, reaching 20 m over 18 m
  hills.
- ~10:34 — Fix 15: added lineLateral (perpendicular distance to the
  approach line). While it is > 300 m the plane holds circuit height
  (runwayAlt+80) instead of the line's altitude.
- ~10:35 — Headless test: M1 flies 420 s without landing, M2 ditches at
  t=306, M3 hits the ground at t=301. Trace: the plane joins the line from
  the east near its end, so the look point (at the line end) pulls it
  north and the go-around fires before it can land.
- ~10:36 — Fix 16: when lineLateral > 300 the autopilot now steers to the
  fix itself (not the look point) at circuit height, so it joins the line
  at the fix.
- ~10:37 — Headless test: M1 crashed at t=312, M2 ditched at t=403, M3 hit
  the ground at t=349. Trace: the plane now flies the line beautifully and
  crosses the threshold — but at ~20 m, because the line only reaches 14 m
  at its far end (1200 m past the threshold), and it joined north of the
  threshold. It flares at -0.8 m/s and runs out of runway (touchdown at
  z=697, 247 m past the far end).
- ~10:38 — Fix 17: the descent is now complete at the threshold — the line
  goes from 60 m at the fix to 14 m at the numbers, then flat past the far
  end (altLook = min(look, 1100)). And the joining rule is tightened: a
  plane past the threshold that has not converged (along > 1100 &&
  lineLateral > 150) flies to the fix instead of chasing the line.
- ~10:39 — Headless test: all three fly 420 s without crashing or landing.
  Trace: the plane LANDED — sitting on the centreline at (6,-73), speed 0,
  score 1104 (landing bonuses awarded) — but status stayed 'flying'.
  Root cause: the mission-completion check sat in the airborne branch of
  step(), but once the plane is on the ground step() takes the ground
  branch and returns early, so the check never runs again.
- ~10:40 — Fix 18: moved the completion check to the top of step(), before
  the ground/air branches split, and removed the now-dead check from the
  airborne branch.
- ~10:41 — Headless autopilot test, all three missions, 420 s limit:
  M1 t=244 status=landed score=1104 time=244 s fuel=69% dmg=0% rings=3/3;
  M2 t=196 status=landed score=1250 time=196 s fuel=72% dmg=0% rings=4/4;
  M3 t=200 status=landed score=1422 time=200 s fuel=71% dmg=0% rings=5/5.
  Autopilot total score 3776. Autopilot verified end to end.
- ~10:42 — Ran `node scripts/shots.mjs`: all screenshot and play-test
  checks passed (Space→play, speed 33 m/s after 5 s full throttle, rotate→
  airborne alt 54, cruise alt 44 speed 72, bank left heading 0.00→-0.41;
  4 shots 1280x720, 17-25 KiB). But visual inspection of the four JPGs
  showed the game drawn into a small box in the middle of the frame:
  runShot() never calls renderer.resize(), so the canvas stayed at its
  300x150 default and the CSS centred that box.
- ~10:43 — Fix 19 (game/src/main.js): runShot() now calls
  renderer.resize() before painting, with a comment explaining why.
- ~10:44 — Re-ran `node scripts/shots.mjs`: all checks passed again;
  shots now 52-105 KiB. Visual inspection: 1-cover title screen over the
  plane on the strip; 2-play ring 1 of 3 ahead at 58 m, HUD lit (compass
  336 deg, SPD 128 kt, ALT 492 ft, attitude, THR 80%, FUEL 90%); 3-rings
  showed the plane on final but no ring or runway in frame — the staging
  stopped 1100 m from the runway, too far to read; 4-end mission complete
  3/3 rings in 243 s, score 1104, on the strip.
- ~10:45 — Fix 20 (game/src/shots.js): the rings shot now stops 500 m
  short of the last ring instead of 1100 m short of the runway, so the
  glowing ring is in frame ahead. Also fixed a cosmetic clip in
  render.js: the FLAPS text was left-aligned past the panel edge; now
  right-aligned to FIELD.width - 8.
- ~10:46 — Re-ran `node scripts/shots.mjs`: all checks passed. 3-rings
  now shows ring 3 of 3 ahead at 500 m, score 304, TIME 2:14, over the
  lake and fields; FLAPS OFF fully visible. All four screenshots
  visually verified: chase view, recognisable terrain, aircraft in frame,
  instruments lit, a ring or the runway ahead, ALT/SPD/HDG on the HUD.
- ~10:47 — Wrote README.md and .gitignore (kit/, out/).
- ~10:48 — Determinism check: `mkdir -p out out2 &&
  MAKEFUN_OUTPUT_DIR=out node main.ts && MAKEFUN_OUTPUT_DIR=out2 node
  main.ts && diff -r out out2` → identical, no differences. out/ holds
  dossier.json (513545 bytes), game/ (10 files), screenshots/ (4 files),
  15 files, 924 KiB total.
- ~10:49 — `git init -b main`, configured user Jack <j72833382@gmail.com>,
  `git add -A`, committed d7c61fa ("Skyline Courier —
  best-flight-game-20261126-0057 entry"), 23 files. kit/ (8.4 MB download
  + harness + CLI) and out/ are gitignored and NOT committed. No GitHub
  repo created, nothing pushed, nothing submitted — that step needs the
  user's wallet signature in his own browser.
