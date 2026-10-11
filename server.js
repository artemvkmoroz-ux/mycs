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

const MOROZ_PASSWORD = 'мороз 123';
function isMoroz(name) {
  const n = name.toLowerCase();
  return n === 'moroz' || n === 'мороз';
}

// ============ ЭКОНОМИКА ============
const KILL_REWARD = 300;
const ROUND_WIN_REWARD = 3250;
const ROUND_LOSS_REWARD = 1400;
const START_MONEY = 800;
const MAX_MONEY = 16000;

const PRICES = {
  rifle: 2700, shotgun: 1200, sniper: 4750, deagle: 700,
  armor: 1000, he: 300, flash: 200, smoke: 300,
};

const ROUND_TIME = 115000;
const BUY_TIME = 15000;
const MATCH_SCORE = 16;

// ============ РЕЖИМЫ ============
// 'classic' — обычный, 'arena' — 1v1
let gameMode = 'classic';

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
const placed = [];
const destroyed = [];
const destroyedSet = new Set();
let nextId = 1;

let activeBomb = null;
const BOMB_FUSE = 40000;
const BOMB_PLANT_DURATION = 3000;
const BOMB_DEFUSE_DURATION = 5000;
const BOMB_RADIUS = 3;

let roundActive = false;
let roundStartTime = 0;
let roundEndTime = 0;
let matchScore = { red: 0, blue: 0 };
let buyPhase = true;
let roundEnded = false;

// ============ ГРАНАТЫ ============
const grenades = []; // { x, y, z, type, throwTime, fuseTime, owner, team }

const GRENADE_TYPES = {
  he:    { fuse: 2000, radius: 5, damage: 100 },
  flash: { fuse: 1800, radius: 12, duration: 3000 },
  smoke: { fuse: 1500, radius: 6, duration: 15000 },
};

// ============ SPAWN ============
const SPAWN_Z = [-10, -5, 0, 5, 10];
function spawnPoint(team) {
  if (gameMode === 'arena') {
    // 1v1: две точки напротив друг друга
    return team === 'red' ? { x: -20, y: 1.05, z: 0 } : { x: 20, y: 1.05, z: 0 };
  }
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
  return {
    id: p.id, name: p.name, team: p.team, hp: p.hp, armor: p.armor,
    alive: p.alive, kills: p.kills, deaths: p.deaths,
    pos: p.pos, ry: p.ry, rx: p.rx, money: p.money, weapon: p.weapon,
    flashing: p.flashing || 0,
  };
}

// ============ РАУНД ============
function startRound() {
  console.log('🎬 НАЧАЛО РАУНДА (' + gameMode + ')');
  buyPhase = true;
  roundActive = true;
  roundEnded = false;
  roundStartTime = Date.now();
  activeBomb = null;
  grenades.length = 0;

  for (const p of players.values()) {
    p.hp = 100;
    p.armor = 0;
    p.alive = true;
    p.pos = spawnPoint(p.team);
    p.planting = null;
    p.defusing = null;
    p.flashing = 0;
    if (gameMode === 'arena') {
      // В арене бесплатно даём AK
      p.weapons = { rifle: true, shotgun: false, sniper: false, deagle: false };
      p.weapon = 'rifle';
      p.money = 0;
    } else {
      p.weapons = { rifle: false, shotgun: false, sniper: false, deagle: false };
      p.weapon = 'rifle';
    }
    broadcast({ t: 'respawn', id: p.id, pos: p.pos, hp: 100, armor: 0 });
  }

  broadcast({ t: 'roundStart', matchScore, roundTime: ROUND_TIME, buyTime: BUY_TIME });

  setTimeout(() => { if (roundActive) buyPhase = false; }, BUY_TIME);
  roundEndTime = Date.now() + ROUND_TIME;
  setTimeout(() => { if (roundActive && !roundEnded) endRound('blue', 'time'); }, ROUND_TIME);
}

function endRound(winnerTeam, reason) {
  if (!roundActive || roundEnded) return;
  roundEnded = true;
  roundActive = false;
  console.log(`🏁 РАУНД ОКОНЧЕН. Победитель: ${winnerTeam} (${reason})`);

  if (winnerTeam === 'red' || winnerTeam === 'blue') matchScore[winnerTeam]++;
  for (const p of players.values()) {
    if (p.team === winnerTeam) p.money = Math.min(MAX_MONEY, p.money + ROUND_WIN_REWARD);
    else p.money = Math.min(MAX_MONEY, p.money + ROUND_LOSS_REWARD);
  }
  broadcast({ t: 'roundEnd', winner: winnerTeam, reason, matchScore });

  const scoreTarget = gameMode === 'arena' ? 5 : MATCH_SCORE;
  if (matchScore.red >= scoreTarget || matchScore.blue >= scoreTarget) {
    const champ = matchScore.red >= scoreTarget ? 'red' : 'blue';
    broadcast({ t: 'matchEnd', winner: champ, matchScore });
    console.log(`🏆 МАТЧ ОКОНЧЕН. Победитель: ${champ}`);
    setTimeout(() => {
      matchScore = { red: 0, blue: 0 };
      for (const p of players.values()) p.money = START_MONEY;
      broadcast({ t: 'newMatch' });
      startRound();
    }, 8000);
    return;
  }
  setTimeout(() => { if (players.size > 0) startRound(); }, 5000);
}

// ============ ВЗРЫВ БОМБЫ ============
function startBombTimer() {
  if (!activeBomb) return;
  setTimeout(() => {
    if (!activeBomb) return;
    broadcast({ t: 'bombExploded', bomb: activeBomb });
    console.log('💥 БОМБА ВЗОРВАЛАСЬ!');
    for (const p of players.values()) {
      if (!p.alive) continue;
      const dx = p.pos.x - activeBomb.x;
      const dz = p.pos.z - activeBomb.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < 15) {
        const dmg = Math.max(0, Math.round(150 * (1 - dist/15)));
        applyDamage(p, dmg, activeBomb.plantedBy, false);
      }
    }
    activeBomb = null;
    endRound('red', 'bomb');
  }, BOMB_FUSE);
}

// ============ УРОН ============
function applyDamage(target, dmg, attackerId, isHead) {
  if (!target.alive) return;
  let finalDmg = dmg;
  if (target.armor > 0) {
    finalDmg = Math.round(dmg * 0.5);
    target.armor = Math.max(0, target.armor - Math.round(dmg * 0.5));
    send(target, { t: 'armorUpdate', armor: target.armor });
  }
  target.hp -= finalDmg;
  if (target.hp <= 0) {
    target.hp = 0; target.alive = false; target.deaths++;
    const killer = players.get(attackerId);
    if (killer && killer.id !== target.id) {
      killer.kills++;
      killer.money = Math.min(MAX_MONEY, killer.money + KILL_REWARD);
      send(killer, { t: 'moneyUpdate', money: killer.money });
    }
    broadcast({ t: 'death', victim: target.id, killer: attackerId, head: !!isHead });

    const aliveRed = [...players.values()].filter(p => p.alive && p.team === 'red').length;
    const aliveBlue = [...players.values()].filter(p => p.alive && p.team === 'blue').length;
    if (players.size >= 2) {
      if (aliveRed === 0 && aliveBlue > 0) setTimeout(() => endRound('blue', 'elimination'), 500);
      else if (aliveBlue === 0 && aliveRed > 0) setTimeout(() => endRound('red', 'elimination'), 500);
    }
  } else {
    send(target, { t: 'hp', hp: target.hp, armor: target.armor, from: attackerId });
  }
}

// ============ ГРАНАТЫ ============
function updateGrenades() {
  const now = Date.now();
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    if (now < g.explodeAt) continue;

    // Взрыв
    const cfg = GRENADE_TYPES[g.type];
    if (g.type === 'he') {
      // Урон
      for (const p of players.values()) {
        if (!p.alive) continue;
        const dx = p.pos.x - g.x;
        const dy = (p.pos.y + 1) - g.y;
        const dz = p.pos.z - g.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < cfg.radius) {
          const dmg = Math.max(0, Math.round(cfg.damage * (1 - dist/cfg.radius)));
          if (p.team === g.team && p.id !== g.owner) {
            // Тимкилл
            applyDamage(p, dmg, g.owner, false);
          } else {
            applyDamage(p, dmg, g.owner, false);
          }
        }
      }
      broadcast({ t: 'grenadeExplode', x: g.x, y: g.y, z: g.z, type: 'he' });
    } else if (g.type === 'flash') {
      // Ослепление
      for (const p of players.values()) {
        if (!p.alive) continue;
        const dx = p.pos.x - g.x;
        const dy = (p.pos.y + 1) - g.y;
        const dz = p.pos.z - g.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < cfg.radius) {
          // Проверка на взгляд в сторону вспышки
          const toFlash = Math.atan2(-(g.x - p.pos.x), -(g.z - p.pos.z));
          let angleDiff = Math.abs(p.ry - toFlash);
          angleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
          if (angleDiff < Math.PI / 2) {
            const intensity = Math.max(0, 1 - dist/cfg.radius) * (1 - angleDiff / (Math.PI/2));
            p.flashing = Math.max(p.flashing, Math.round(intensity * cfg.duration));
            send(p, { t: 'flash', duration: p.flashing });
          }
        }
      }
      broadcast({ t: 'grenadeExplode', x: g.x, y: g.y, z: g.z, type: 'flash' });
    } else if (g.type === 'smoke') {
      broadcast({ t: 'smokeStart', x: g.x, y: g.y, z: g.z, duration: cfg.duration });
      // Дым живёт cfg.duration
      setTimeout(() => {
        broadcast({ t: 'smokeEnd', x: g.x, y: g.y, z: g.z });
      }, cfg.duration);
    }
    grenades.splice(i, 1);
  }
}
setInterval(updateGrenades, 100);

// ============ СТАРТ ============
setTimeout(() => { if (players.size > 0) startRound(); }, 1500);

wss.on('connection', (ws) => {
  let me = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.t === 'join' && !me) {
      const rawName = String(msg.name || 'Игрок').replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Игрок';
      const pass = String(msg.password || '').trim();
      const isMorozPlayer = isMoroz(rawName);

      if (isMorozPlayer) {
        if (pass !== MOROZ_PASSWORD) { send(ws, { t: 'authFailed', reason: 'Для moroz пароль: "мороз 123"' }); ws.close(); return; }
      } else {
        if (pass.length < 3) { send(ws, { t: 'authFailed', reason: 'Пароль минимум 3 символа!' }); ws.close(); return; }
      }

      const team = pickTeam();
      const pos = spawnPoint(team);
      me = {
        id: nextId++, ws, name: rawName, team,
        hp: 100, armor: 0, alive: true, kills: 0, deaths: 0,
        money: START_MONEY,
        pos, ry: team === 'red' ? -Math.PI / 2 : Math.PI / 2, rx: 0,
        anim: 0, respawnTimer: null,
        planting: null, defusing: null,
        weapon: 'rifle',
        weapons: { rifle: false, shotgun: false, sniper: false, deagle: false },
        grenades: { he: 1, flash: 1, smoke: 1 }, // стартовые
        flashing: 0,
        cheater: isMorozPlayer,
      };
      players.set(me.id, me);
      send(me, {
        t: 'welcome', id: me.id, team, pos, ry: me.ry,
        players: [...players.values()].filter(p => p.id !== me.id).map(publicInfo),
        placed, destroyed, matchScore, money: me.money, armor: me.armor,
        cheater: isMorozPlayer, roundActive, buyPhase, gameMode,
      });
      broadcast({ t: 'join', p: publicInfo(me) }, me.id);
      console.log(`+ ${me.name} joined team ${team}${isMorozPlayer ? ' [MOROZ]' : ''} (${players.size} online)`);
      if (!roundActive && players.size >= 1) startRound();
      return;
    }
    if (!me) return;

    switch (msg.t) {
      case 'state': {
        if (!me.alive) break;
        if (me.planting) {
          if (Math.abs(me.pos.x - msg.pos.x) > 0.3 || Math.abs(me.pos.z - msg.pos.z) > 0.3) {
            me.planting = null; send(me, { t: 'plantCancelled' });
          }
        }
        if (me.defusing) {
          if (Math.abs(me.pos.x - msg.pos.x) > 0.3 || Math.abs(me.pos.z - msg.pos.z) > 0.3) {
            me.defusing = null; send(me, { t: 'defuseCancelled' });
          }
        }
        me.pos = msg.pos; me.ry = msg.ry; me.rx = msg.rx; me.anim = msg.anim;
        // Обновляем ослепление
        if (me.flashing > 0) me.flashing = Math.max(0, me.flashing - 50);
        break;
      }
      case 'shoot':
        broadcast({ t: 'shoot', id: me.id, from: msg.from, dir: msg.dir, w: msg.w }, me.id);
        break;
      case 'hit': {
        const target = players.get(msg.target);
        if (!target || !target.alive || !me.alive) break;
        if (target.team === me.team && !me.cheater) break;
        const dx = target.pos.x - me.pos.x;
        const dz = target.pos.z - me.pos.z;
        if (dx*dx + dz*dz > 200*200) break;
        let baseDmg = msg.dmg | 0;
        if (msg.head) baseDmg *= 2;
        else if (msg.legs) baseDmg = Math.round(baseDmg * 0.75);
        applyDamage(target, baseDmg, me.id, msg.head);
        send(me, { t: 'hitconfirm', target: target.id, dmg: baseDmg, head: !!msg.head });
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
        else { if (destroyed.length > 8000) break; destroyedSet.add(key); destroyed.push({ x, y, z }); }
        broadcast({ t: 'destroy', x, y, z });
        break;
      }
      case 'rtc': {
        const target = players.get(msg.to | 0);
        if (!target || target.id === me.id || !msg.data) break;
        send(target, { t: 'rtc', from: me.id, data: msg.data });
        break;
      }

      // ============ ПОКУПКА ============
      case 'buy': {
        if (!buyPhase) { send(me, { t: 'buyError', text: 'Закупка только в начале раунда!' }); break; }
        const item = msg.item;
        const price = PRICES[item];
        if (!price) { send(me, { t: 'buyError', text: 'Неизвестный предмет' }); break; }
        if (me.money < price) { send(me, { t: 'buyError', text: 'Недостаточно денег!' }); break; }
        if (item === 'he' || item === 'flash' || item === 'smoke') {
          if (me.grenades[item] >= 1) { send(me, { t: 'buyError', text: 'Граната уже куплена' }); break; }
          me.money -= price;
          me.grenades[item] = 1;
        } else if (item === 'armor') {
          if (me.armor > 0) { send(me, { t: 'buyError', text: 'Броня уже куплена' }); break; }
          me.money -= price;
          me.armor = 100;
        } else {
          if (me.weapons[item]) { send(me, { t: 'buyError', text: 'Уже куплено' }); break; }
          me.money -= price;
          me.weapons[item] = true;
          me.weapon = item;
        }
        send(me, { t: 'bought', item, money: me.money, armor: me.armor, weapons: me.weapons, grenades: me.grenades });
        break;
      }

      // ============ ГРАНАТЫ — БРОСОК ============
      case 'throwGrenade': {
        if (!me.alive) break;
        const type = msg.type;
        if (!me.grenades[type] || me.grenades[type] <= 0) { send(me, { t: 'bombError', text: 'Нет гранат' }); break; }
        me.grenades[type]--;
        const g = {
          x: msg.x, y: msg.y, z: msg.z,
          vx: msg.vx, vy: msg.vy, vz: msg.vz,
          type, owner: me.id, team: me.team,
          explodeAt: Date.now() + GRENADE_TYPES[type].fuse,
        };
        grenades.push(g);
        send(me, { t: 'grenadesUpdate', grenades: me.grenades });
        broadcast({ t: 'grenadeThrown', id: me.id, type, from: { x: g.x, y: g.y, z: g.z }, vel: { x: g.vx, y: g.vy, z: g.vz } }, me.id);
        break;
      }

      // ============ СМЕНА РЕЖИМА ============
      case 'setMode': {
        if (!me.cheater) break; // Только moroz
        gameMode = msg.mode === 'arena' ? 'arena' : 'classic';
        matchScore = { red: 0, blue: 0 };
        broadcast({ t: 'modeChanged', mode: gameMode });
        console.log(`🎮 Режим: ${gameMode}`);
        setTimeout(() => startRound(), 1000);
        break;
      }

      // ============ БОМБА ============
      case 'startPlant': {
        if (!me.alive || !roundActive) break;
        if (me.team !== 'red') { send(me, { t: 'bombError', text: 'Бомбу закладывают только КРАСНЫЕ!' }); break; }
        if (activeBomb) { send(me, { t: 'bombError', text: 'Бомба уже заложена!' }); break; }
        if (me.planting) break;
        me.planting = { startTime: Date.now(), duration: BOMB_PLANT_DURATION };
        send(me, { t: 'plantStarted', duration: BOMB_PLANT_DURATION });
        break;
      }
      case 'cancelPlant': { if (me.planting) { me.planting = null; send(me, { t: 'plantCancelled' }); } break; }
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
      case 'cancelDefuse': { if (me.defusing) { me.defusing = null; send(me, { t: 'defuseCancelled' }); } break; }
      case 'finishDefuse': {
        if (!me.alive || !me.defusing || !activeBomb || me.team !== 'blue') break;
        if (Date.now() - me.defusing.startTime < me.defusing.duration - 200) break;
        me.defusing = null;
        broadcast({ t: 'bombDefused', bomb: activeBomb, defusedBy: me.id });
        activeBomb = null;
        endRound('blue', 'defuse');
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
    if (players.size === 0) { roundActive = false; activeBomb = null; }
  });
});

setInterval(() => {
  if (players.size === 0) return;
  const states = [...players.values()].filter(p => p.alive)
    .map(p => ({ id: p.id, pos: p.pos, ry: p.ry, rx: p.rx, anim: p.anim, hp: p.hp, armor: p.armor, flashing: p.flashing || 0 }));
  broadcast({ t: 'states', states });
}, 50);

setInterval(() => {
  if (!roundActive || players.size === 0) return;
  const left = Math.max(0, roundEndTime - Date.now());
  broadcast({ t: 'timer', roundLeft: left, buyPhase });
}, 1000);

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 30000);

server.listen(PORT, '0.0.0.0', () => console.log(`BLOCKADE server on http://localhost:${PORT}`));
