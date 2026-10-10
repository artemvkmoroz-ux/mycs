const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
};

// ============ ПАРОЛЬ ============
const GAME_PASSWORD = 'мороз123';

// ============ ЧИТ-ПАНЕЛЬ ТОЛЬКО ДЛЯ "moroz" ============
function isCheater(name) {
  return name.toLowerCase() === 'moroz';
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(PUB, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

const players = new Map();
const scores = { red: 0, blue: 0 };
const placed = [];
const destroyed = [];
const destroyedSet = new Set();
let nextId = 1;

let activeBomb = null;
const BOMB_FUSE = 40000;
const BOMB_PLANT_DURATION = 3000;
const BOMB_DEFUSE_DURATION = 5000;
const BOMB_RADIUS = 3;
const BOMB_WIN_SCORE = 5;

const SPAWN_Z = [-10, -5, 0, 5, 10];
function spawnPoint(team) {
  const x = team === 'red' ? -28 : 28;
  const z = SPAWN_Z[Math.floor(Math.random() * SPAWN_Z.length)] + (Math.random() * 2 - 1);
  return { x, y: 1.05, z };
}

function pickTeam() {
  let red = 0, blue = 0;
  for (const p of players.values()) (p.team === 'red' ? red++ : blue++);
  if (players.size === 0) return 'red';
  if (red < blue) return 'red';
  if (blue < red) return 'blue';
  return Math.random() < 0.5 ? 'red' : 'blue';
}

function send(p, msg) {
  if (!p) return;
  const ws = p.ws || p;
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg, exceptId) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s);
  }
}

function publicInfo(p) {
  return { id: p.id, name: p.name, team: p.team, hp: p.hp, alive: p.alive, kills: p.kills, deaths: p.deaths, pos: p.pos, ry: p.ry, rx: p.rx };
}

function startBombTimer() {
  if (!activeBomb) return;
  setTimeout(() => {
    if (!activeBomb) return;
    broadcast({ t: 'bombExploded', bomb: activeBomb });
    console.log('💥 БОМБА ВЗОРВАЛАСЬ! КРАСНЫЕ ПОБЕДИЛИ!');
    scores.red += BOMB_WIN_SCORE;
    broadcast({ t: 'scores', scores });
    broadcast({ t: 'roundWin', team: 'red', reason: 'bomb' });
    for (const p of players.values()) {
      if (!p.alive) continue;
      const dx = p.pos.x - activeBomb.x;
      const dz = p.pos.z - activeBomb.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < 15) {
        const dmg = Math.max(0, Math.round(150 * (1 - dist/15)));
        p.hp -= dmg;
        if (p.hp <= 0) {
          p.hp = 0; p.alive = false; p.deaths++;
          const planter = players.get(activeBomb.plantedBy);
          if (planter && planter.id !== p.id) planter.kills++;
          broadcast({ t: 'death', victim: p.id, killer: activeBomb.plantedBy, w: 'bomb', head: false });
          const pid = p.id;
          setTimeout(() => {
            const pl = players.get(pid);
            if (!pl) return;
            pl.hp = 100; pl.alive = true;
            pl.pos = spawnPoint(pl.team);
            broadcast({ t: 'respawn', id: pl.id, pos: pl.pos, hp: 100 });
          }, 3500);
        }
      }
    }
    activeBomb = null;
    setTimeout(() => broadcast({ t: 'newRound' }), 5000);
  }, BOMB_FUSE);
}

wss.on('connection', (ws) => {
  let me = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.t === 'join' && !me) {
      if (msg.password !== GAME_PASSWORD) {
        send(ws, { t: 'authFailed', reason: 'Неверный пароль!' });
        ws.close();
        return;
      }
      const name = String(msg.name || 'Игрок').replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Игрок';
      const team = pickTeam();
      const pos = spawnPoint(team);
      const cheater = isCheater(name);
      me = {
        id: nextId++, ws, name, team,
        hp: 100, alive: true, kills: 0, deaths: 0,
        pos, ry: team === 'red' ? -Math.PI / 2 : Math.PI / 2, rx: 0,
        anim: 0, respawnTimer: null,
        planting: null, defusing: null,
        cheater,
      };
      players.set(me.id, me);
      send(me, {
        t: 'welcome', id: me.id, team, pos, ry: me.ry,
        players: [...players.values()].filter(p => p.id !== me.id).map(publicInfo),
        placed, destroyed, scores, bomb: activeBomb,
        cheater,
      });
      broadcast({ t: 'join', p: publicInfo(me) }, me.id);
      console.log(`+ ${name} joined team ${team}${cheater ? ' [ЧИТЕР]' : ''} (${players.size} online)`);
      return;
    }
    if (!me) return;

    switch (msg.t) {
      case 'state': {
        if (!me.alive) break;
        if (me.planting) {
          if (Math.abs(me.pos.x - msg.pos.x) > 0.3 || Math.abs(me.pos.z - msg.pos.z) > 0.3) {
            me.planting = null;
            send(me, { t: 'plantCancelled' });
          }
        }
        if (me.defusing) {
          if (Math.abs(me.pos.x - msg.pos.x) > 0.3 || Math.abs(me.pos.z - msg.pos.z) > 0.3) {
            me.defusing = null;
            send(me, { t: 'defuseCancelled' });
          }
        }
        me.pos = msg.pos; me.ry = msg.ry; me.rx = msg.rx; me.anim = msg.anim;
        break;
      }
      case 'shoot':
        broadcast({ t: 'shoot', id: me.id, from: msg.from, dir: msg.dir, w: msg.w }, me.id);
        break;
      case 'hit': {
        const target = players.get(msg.target);
        if (!target || !target.alive || !me.alive) break;
        if (target.team === me.team && !me.cheater) break;
        const dmg = Math.min(150, Math.max(0, msg.dmg | 0));
        target.hp -= dmg;
        if (target.hp <= 0) {
          target.hp = 0;
          target.alive = false;
          target.deaths++;
          me.kills++;
          scores[me.team]++;
          broadcast({ t: 'death', victim: target.id, killer: me.id, w: msg.w, head: !!msg.head });
          broadcast({ t: 'scores', scores });
          const tid = target.id;
          target.respawnTimer = setTimeout(() => {
            const p = players.get(tid);
            if (!p) return;
            p.hp = 100; p.alive = true;
            p.pos = spawnPoint(p.team);
            broadcast({ t: 'respawn', id: p.id, pos: p.pos, hp: 100 });
          }, 3500);
        } else {
          send(target, { t: 'hp', hp: target.hp, from: me.id });
          send(me, { t: 'hitconfirm', target: target.id, dmg, head: !!msg.head });
        }
        break;
      }
      case 'chat': {
        const now = Date.now();
        if (now - (me.lastChat || 0) < 500) break;
        const text = String(msg.text || '').replace(/[<>&"]/g, '').trim().slice(0, 120);
        if (!text) break;
        me.lastChat = now;
        broadcast({ t: 'chat', id: me.id, name: me.name, team: me.team, text });
        break;
      }
      case 'place': {
        const { x, y, z } = msg;
        if (![x, y, z].every(Number.isInteger)) break;
        if (Math.abs(x) > 40 || Math.abs(z) > 40 || y < 1 || y > 20) break;
        if (placed.length > 4000) break;
        placed.push({ x, y, z, team: me.team });
        broadcast({ t: 'place', x, y, z, team: me.team });
        break;
      }
      case 'destroy': {
        const { x, y, z } = msg;
        if (![x, y, z].every(Number.isInteger)) break;
        if (x < -32 || x > 31 || z < -32 || z > 31 || y < 1 || y > 20) break;
        const key = `${x},${y},${z}`;
        if (destroyedSet.has(key)) break;
        const pi = placed.findIndex(b => b.x === x && b.y === y && b.z === z);
        if (pi >= 0) placed.splice(pi, 1);
        else {
          if (destroyed.length > 8000) break;
          destroyedSet.add(key);
          destroyed.push({ x, y, z });
        }
        broadcast({ t: 'destroy', x, y, z });
        break;
      }
      case 'rtc': {
        const target = players.get(msg.to | 0);
        if (!target || target.id === me.id || !msg.data) break;
        send(target, { t: 'rtc', from: me.id, data: msg.data });
        break;
      }
      case 'startPlant': {
        if (!me.alive) break;
        if (me.team !== 'red') { send(me, { t: 'bombError', text: 'Бомбу закладывают только КРАСНЫЕ!' }); break; }
        if (activeBomb) { send(me, { t: 'bombError', text: 'Бомба уже заложена!' }); break; }
        if (me.planting) break;
        me.planting = { startTime: Date.now(), duration: BOMB_PLANT_DURATION };
        send(me, { t: 'plantStarted', duration: BOMB_PLANT_DURATION });
        break;
      }
      case 'cancelPlant': {
        if (me.planting) { me.planting = null; send(me, { t: 'plantCancelled' }); }
        break;
      }
      case 'finishPlant': {
        if (!me.alive || !me.planting || me.team !== 'red') break;
        if (Date.now() - me.planting.startTime < me.planting.duration - 200) break;
        me.planting = null;
        activeBomb = { x: me.pos.x, y: me.pos.y, z: me.pos.z, plantedBy: me.id, team: me.team, plantTime: Date.now(), fuseTime: BOMB_FUSE };
        broadcast({ t: 'bombPlanted', bomb: activeBomb });
        startBombTimer();
        break;
      }
      case 'startDefuse': {
        if (!me.alive || !activeBomb || me.team !== 'blue') break;
        const dx = me.pos.x - activeBomb.x;
        const dz = me.pos.z - activeBomb.z;
        if (Math.sqrt(dx*dx + dz*dz) > BOMB_RADIUS) { send(me, { t: 'bombError', text: 'Слишком далеко!' }); break; }
        if (me.defusing) break;
        me.defusing = { startTime: Date.now(), duration: BOMB_DEFUSE_DURATION };
        send(me, { t: 'defuseStarted', duration: BOMB_DEFUSE_DURATION });
        break;
      }
      case 'cancelDefuse': {
        if (me.defusing) { me.defusing = null; send(me, { t: 'defuseCancelled' }); }
        break;
      }
      case 'finishDefuse': {
        if (!me.alive || !me.defusing || !activeBomb || me.team !== 'blue') break;
        if (Date.now() - me.defusing.startTime < me.defusing.duration - 200) break;
        me.defusing = null;
        broadcast({ t: 'bombDefused', bomb: activeBomb, defusedBy: me.id });
        scores.blue += BOMB_WIN_SCORE;
        broadcast({ t: 'scores', scores });
        broadcast({ t: 'roundWin', team: 'blue', reason: 'defuse' });
        activeBomb = null;
        setTimeout(() => broadcast({ t: 'newRound' }), 5000);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!me) return;
    if (me.respawnTimer) clearTimeout(me.respawnTimer);
    players.delete(me.id);
    broadcast({ t: 'leave', id: me.id });
    console.log(`- ${me.name} left (${players.size} online)`);
  });
});

setInterval(() => {
  if (players.size === 0) return;
  const states = [...players.values()].filter(p => p.alive)
    .map(p => ({ id: p.id, pos: p.pos, ry: p.ry, rx: p.rx, anim: p.anim, hp: p.hp }));
  broadcast({ t: 'states', states });
}, 50);

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, '0.0.0.0', () => console.log(`BLOCKADE server on http://localhost:${PORT}`));