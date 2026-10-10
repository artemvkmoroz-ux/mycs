# БЛОКАДА — Minecraft-style multiplayer shooter

Browser FPS in the spirit of the VK game «Блокада»: red vs blue teams, blocky Minecraft world and UI, block building, three guns.

## Run

```bash
node server.js                                  # game server on :3000
cloudflared tunnel --url http://localhost:3000  # public link (trycloudflare.com)
```

On this machine the binaries live in `~/tools/node/bin/node` and `~/tools/cloudflared`.

## How to play

Open the link, enter a nickname — you'll be auto-assigned to the smaller team (random on tie).

| Control | Action |
|---|---|
| WASD / Space / Shift | move / jump / sprint |
| LMB | shoot / place block |
| RMB | zoom (sniper scope) |
| 1 / 2 / 3 / 4 | rifle / shotgun / sniper / blocks |
| R | reload |
| Tab | scoreboard |

## Stack

- Server: Node.js + `ws` (WebSocket), no other deps. Authoritative for HP, kills, team scores, respawns, placed blocks.
- Client: Three.js (CDN), procedurally generated 16x16 canvas textures, voxel collision + DDA raycasting, WebAudio synth sounds. No build step.
