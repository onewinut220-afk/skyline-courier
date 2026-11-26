# Skyline Courier

[![make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/onewinut220-afk/skyline-courier/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/onewinut220-afk/skyline-courier/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A complete, original HTML5 flight game for the make.fun bounty
**best-flight-game-20261126-0057** ($500 pot, top 50 share it).

Bounty: [https://make.fun/bounty/best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057)

You fly a bush-plane courier across the island of Skylark. Each mission
gives you a route of glowing rings to fly through in order, then a runway
to land on. Fuel is finite — mind the throttle — and a hard arrival bends
the airframe. Three missions with different goals and times of day: a
morning harbour hop, a noon mountain mail run, and a dusk sunset express.
Wind gusts, a stall below flying speed, and an engine-out glide if the
tank runs dry.

## How to play

- **Keyboard:** `↑`/`↓` pitch, `←`/`→` bank, `Shift`/`Ctrl` throttle,
  `F` flaps, `G` gear, `P` pause, `Space` start / next mission.
- **Mouse:** hold and steer (a mouse yoke), or click the FLAPS / GEAR /
  THR buttons on the panel.
- **Rules:** fly through each ring in order (150 points, plus a time
  bonus), then land on the mission's runway — 400 for the landing, +150
  for a soft touchdown, +100 for landing on the centreline, plus a time
  bonus for a quick mission. Touch down gentle (under 4 m/s down), slow
  (under 48 m/s) and lined up with the strip, or the undercarriage takes
  damage. Come down anywhere else and the flight is over.

## The missions

| Mission | Sky | Route |
| --- | --- | --- |
| Harbour Hop | Morning | 3 rings over the harbour, land at Skylark Field |
| Mountain Mail | Noon | 4 rings through the mountains, land on Gull Island Strip |
| Sunset Express | Dusk | 5 rings around the island, land at Skylark Field |

## Run it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Open `game/index.html` in desktop Chrome. The game is plain static files —
no build step, no network request, no assets: all art is drawn in code
(a voxel-space terrain renderer over a procedural island) and all sound is
synthesized with WebAudio.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `/output/dossier.json` with `buildDossier` from the
vendored `vendor/makefun-game.ts`. Two runs write identical bytes.

## Screenshots

`screenshots/` holds four real renders of the game's own code, staged by
`game/src/shots.js` through the `?shot=` query parameter, captured in
headless Chrome by `scripts/shots.mjs` (which also play-tests the live
game: take-off, rotate, cruise, bank):

| File | Scene |
| --- | --- |
| `1-cover.jpg` | Title screen over the plane on the strip, first ring 3302 m out |
| `2-play.jpg` | In flight: ring 1 of 3 dead ahead at 58 m, instruments lit |
| `3-rings.jpg` | Ring 3 of 3 ahead at 500 m, two banked, score 304 |
| `4-end.jpg` | Mission complete: 3/3 rings in 243 s, score 1104, on the strip |

## Layout

- `main.ts` — the hand-in program
- `serve.ts` — a tiny static server for local play
- `vendor/makefun-game.ts` — the kit's dossier library, copied unchanged
- `game/index.html` — the page: one canvas, one module script
- `game/src/config.js` — tuning, missions, runways, score table, skies
- `game/src/random.js` — the seeded random source
- `game/src/terrain.js` — the procedural island: heightmap and land use
- `game/src/world.js` — flight model, rings, fuel/damage, landings, autopilot
- `game/src/render.js` — all canvas art: voxel terrain, plane, rings, HUD
- `game/src/input.js` — keyboard, mouse yoke, clickable HUD buttons
- `game/src/audio.js` — synthesized WebAudio sounds
- `game/src/shots.js` — the four screenshot scenes
- `game/src/main.js` — boot, the fixed-step loop, the six screens
- `scripts/shots.mjs` — the screenshot + play-test driver
- `shots.json` — the four shots the driver takes
- `screenshots/` — the four renders above
- `transcripts/` — the build log and session log of the session that built this

## License

MIT — see `LICENSE`. An original game: its own idea, art, sounds and names.
`vendor/makefun-game.ts` is the competition kit's file, unchanged.
