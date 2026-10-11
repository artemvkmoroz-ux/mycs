import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadDust2Map } from './map.js';

// ============================================================
// Constants
// ============================================================
const EYE = 1.62, P_HALF = 0.3, P_HEIGHT = 1.8;
const GRAVITY = 23, JUMP_V = 8.6, WALK = 5.8, SPRINT = 8.4;

const WEAPONS = {
  rifle:   { name: 'AK-47',    dmg: 18, rate: 110,  mag: 30, reload: 1800, spread: 0.014, auto: true,  pellets: 1, range: 90 },
  shotgun: { name: 'ДРОБОВИК', dmg: 9,  rate: 850,  mag: 6,  reload: 2200, spread: 0.06,  auto: false, pellets: 8, range: 32 },
  sniper:  { name: 'AWP',      dmg: 70, rate: 1400, mag: 5,  reload: 2400, spread: 0.002, auto: false, pellets: 1, range: 140 },
  deagle:  { name: 'DEAGLE',   dmg: 45, rate: 400,  mag: 7,  reload: 2000, spread: 0.01,  auto: false, pellets: 1, range: 100 },
  knife:   { name: 'НОЖ',      dmg: 55, rate: 400,  mag: 0,  reload: 0,    spread: 0,     auto: false, pellets: 1, range: 2 },
};
const SLOTS = ['rifle', 'shotgun', 'sniper', 'deagle', 'knife'];
const TEAM_RU = { red: 'КРАСНЫХ', blue: 'СИНИХ' };
const TEAM_COL = { red: '#ff5555', blue: '#7f9fff' };

// ============================================================
// НАСТРОЙКИ
// ============================================================
const SETTINGS = {
  mobile: false, radar: false, showFps: false,
  sensitivity: 2.0, volume: 0.5, quality: 'medium',
};
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('blockade_settings') || '{}');
    Object.assign(SETTINGS, saved);
  } catch (e) {}
  applySettings();
}
function saveSettings() {
  localStorage.setItem('blockade_settings', JSON.stringify(SETTINGS));
  applySettings();
}
function applySettings() {
  const e1 = document.getElementById('toggleMobile');
  if (e1) e1.classList.toggle('active', SETTINGS.mobile);
  const e2 = document.getElementById('toggleRadar');
  if (e2) e2.classList.toggle('active', SETTINGS.radar);
  const e3 = document.getElementById('toggleFps');
  if (e3) e3.classList.toggle('active', SETTINGS.showFps);
  const s = document.getElementById('sensRange');
  if (s) { s.value = SETTINGS.sensitivity; const sv = document.getElementById('sensVal'); if (sv) sv.textContent = SETTINGS.sensitivity.toFixed(1); }
  const v = document.getElementById('volRange');
  if (v) { v.value = Math.round(SETTINGS.volume * 100); const vv = document.getElementById('volVal'); if (vv) vv.textContent = Math.round(SETTINGS.volume * 100) + '%'; }
  const q = document.getElementById('qualitySelect');
  if (q) q.value = SETTINGS.quality;
  const mc = document.getElementById('mobileControls');
  if (mc) mc.classList.toggle('active', SETTINGS.mobile);
  const r = document.getElementById('radar');
  if (r) r.style.display = SETTINGS.radar ? 'block' : 'none';
  const f = document.getElementById('fpsCounter');
  if (f) f.style.display = SETTINGS.showFps ? 'block' : 'none';
}

// ============================================================
// Globals
// ============================================================
let scene, camera, renderer, clock;
let dust2Map = null;
const weaponModels = {};
let c4Model = null;
const collision = new Set();
const placedMeshes = new Map();
const mapBlockIndex = new Map();
let ws = null, myId = -1, myUserId = null, myTeam = 'red', myName = '';
const remotes = new Map();
let matchScore = { red: 0, blue: 0 };
let roundTimeLeft = 115000;
let buyTimeLeft = 15000;
let inBuyPhase = false;
let currentMode = 'classic';
let selectedMode = 'classic';

let friendsList = [];
let friendRequests = [];
let lobbiesList = [];
let myLobby = null;

const me = {
  pos: new THREE.Vector3(0, 64, 2000),
  vel: new THREE.Vector3(),
  ry: Math.PI, rx: 0,
  onGround: false,
  hp: 100, armor: 0, dead: false,
  kills: 0, deaths: 0,
  money: 800,
  slot: 0,
  ammo: { rifle: 30, shotgun: 6, sniper: 5, deagle: 7, knife: 0 },
  weapons: { rifle: true, shotgun: false, sniper: false, deagle: false, knife: true },
  weapon: 'rifle',
  grenades: { he: 1, flash: 1, smoke: 1 },
  blocks: 64,
  reloading: false,
  lastShot: 0,
  zoomed: false,
  flashing: 0,
};

const keys = {};
let mouseDown = false;
let locked = false;
let inGame = false;
let tabHeld = false;
let chatOpen = false;
let buyMenuOpen = false;

const tracers = [];
const particles = [];

const grenades = [];
let throwing = false;
let throwingType = null;

let activeBomb = null;
let bombMesh = null;
let bombTimerInterval = null;
let planting = false;
let plantStartTime = 0;
let plantDuration = 3000;
let plantProgressInterval = null;
let defusing = false;
let defuseStartTime = 0;
let defuseDuration = 5000;
let defuseProgressInterval = null;

let isCheater = false;
const cheats = {
  aimbot: false, wallhack: false, speedhack: false, noclip: false,
  infiniteAmmo: false, infiniteHp: false, rapidFire: false,
  autoHeadshot: false, fullBright: false, oneShot: false,
  freeBuy: false, instantPlant: false, instantDefuse: false, chams: false,
};
const cheatESP = new Map();
let cheatsMenuOpen = false;

let fpsFrames = 0, fpsLast = performance.now();

let joystickActive = false;
let joystickVector = { x: 0, y: 0 };
let touchLookId = null;
let touchLookLast = { x: 0, y: 0 };
let mobileInited = false;

// ============================================================
// Audio
// ============================================================
let AC = null;
function ac() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function noiseBurst(dur, freq, vol, type) {
  type = type || 'lowpass';
  try {
    const ctx = ac();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol * SETTINGS.volume * 2;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start();
  } catch (e) {}
}
function tone(freq, dur, vol, type, slide) {
  type = type || 'square';
  slide = slide || 0;
  try {
    const ctx = ac();
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.value = vol * SETTINGS.volume * 2;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch (e) {}
}
const SND = {
  shot: (w, vol) => {
    vol = vol || 0.22;
    if (w === 'rifle') { noiseBurst(0.09, 1800, vol); tone(160, 0.06, vol * 0.5, 'square', -90); }
    else if (w === 'shotgun') { noiseBurst(0.22, 900, vol * 1.4); tone(90, 0.13, vol * 0.7, 'square', -50); }
    else if (w === 'deagle') { noiseBurst(0.14, 2200, vol * 1.2); tone(200, 0.1, vol * 0.6, 'square', -100); }
    else { noiseBurst(0.16, 2600, vol * 1.2); tone(220, 0.12, vol * 0.6, 'sawtooth', -160); }
  },
  hit: () => tone(880, 0.06, 0.12, 'square'),
  headshot: () => { tone(1240, 0.07, 0.14, 'square'); setTimeout(() => tone(1650, 0.08, 0.12, 'square'), 60); },
  hurt: () => tone(140, 0.18, 0.25, 'sawtooth', -60),
  death: () => { tone(300, 0.5, 0.2, 'sawtooth', -240); noiseBurst(0.4, 500, 0.15); },
  reload: () => { tone(500, 0.04, 0.1, 'square'); setTimeout(() => tone(700, 0.04, 0.1, 'square'), 120); },
  place: () => noiseBurst(0.08, 700, 0.25),
  brk: () => { noiseBurst(0.12, 420, 0.3); tone(180, 0.07, 0.12, 'square', -60); },
  swing: () => noiseBurst(0.05, 2200, 0.07, 'highpass'),
  boom: (vol) => { vol = vol || 0.5; noiseBurst(0.7, 250, vol); tone(70, 0.5, vol * 0.8, 'sawtooth', -40); },
  spawn: () => { tone(520, 0.08, 0.12, 'square'); setTimeout(() => tone(780, 0.1, 0.12, 'square'), 90); },
  kill: () => { tone(660, 0.07, 0.14, 'square'); setTimeout(() => tone(880, 0.07, 0.14, 'square'), 70); setTimeout(() => tone(1100, 0.1, 0.14, 'square'), 140); },
  win: () => { tone(660, 0.15, 0.2, 'square'); setTimeout(() => tone(880, 0.15, 0.2, 'square'), 150); setTimeout(() => tone(1100, 0.35, 0.2, 'square'), 300); },
  lose: () => { tone(440, 0.2, 0.18, 'sawtooth', -100); setTimeout(() => tone(330, 0.35, 0.18, 'sawtooth', -100), 200); },
  buy: () => { tone(880, 0.05, 0.15, 'square'); setTimeout(() => tone(1100, 0.08, 0.15, 'square'), 50); },
  error: () => tone(180, 0.15, 0.2, 'sawtooth', -60),
  notif: () => { tone(660, 0.06, 0.12, 'square'); setTimeout(() => tone(880, 0.08, 0.12, 'square'), 60); },
};

const $ = id => document.getElementById(id);

// ============================================================
// Auth
// ============================================================
function setupAuth() {
  const nameInput = $('regName'), passInput = $('regPassword'), btn = $('regBtn'), err = $('authErr');
  if (!nameInput) return;
  nameInput.value = localStorage.getItem('blockade_name') || '';
  passInput.value = localStorage.getItem('blockade_password') || '';
  nameInput.focus();
  const start = () => {
    const name = nameInput.value.trim(), pass = passInput.value.trim();
    if (name.length < 2) { err.textContent = 'Ник минимум 2 символа!'; return; }
    if (pass.length < 3) { err.textContent = 'Пароль минимум 3 символа!'; return; }
    err.textContent = '';
    btn.disabled = true;
    myName = name;
    localStorage.setItem('blockade_name', name);
    localStorage.setItem('blockade_password', pass);
    showMenu(name);
  };
  btn.addEventListener('click', start);
  passInput.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') passInput.focus(); });
}
function showMenu(name) {
  $('authScreen').style.display = 'none';
  $('settings').style.display = 'none';
  $('playModal').classList.remove('active');
  $('menu').style.display = 'flex';
  $('menuNickText').textContent = name;
  $('menuNickBig').textContent = name.toUpperCase();
  $('userAvatar').textContent = name.charAt(0).toUpperCase();
  $('playBtn').disabled = false;
}
function showAuth() {
  $('authScreen').style.display = 'flex';
  $('menu').style.display = 'none';
  $('settings').style.display = 'none';
  $('playModal').classList.remove('active');
}
function setupMenu() {
  $('playBtn').addEventListener('click', openPlayModal);
  $('quickPlayBtn').addEventListener('click', () => { selectedMode = 'classic'; connectAndPlay(); });
  $('logoutBtn').addEventListener('click', showAuth);
  $('settingsBtn').addEventListener('click', () => {
    $('menu').style.display = 'none';
    $('settings').style.display = 'flex';
    applySettings();
  });
  $('settingsBack').addEventListener('click', () => {
    $('settings').style.display = 'none';
    $('menu').style.display = 'flex';
  });
  $('toggleMobile').addEventListener('click', () => { SETTINGS.mobile = !SETTINGS.mobile; saveSettings(); if (SETTINGS.mobile && inGame && !mobileInited) initMobileControls(); });
  $('toggleRadar').addEventListener('click', () => { SETTINGS.radar = !SETTINGS.radar; saveSettings(); });
  $('toggleFps').addEventListener('click', () => { SETTINGS.showFps = !SETTINGS.showFps; saveSettings(); });
  $('sensRange').addEventListener('input', e => { SETTINGS.sensitivity = parseFloat(e.target.value); saveSettings(); });
  $('volRange').addEventListener('input', e => { SETTINGS.volume = parseInt(e.target.value) / 100; saveSettings(); });
  $('qualitySelect').addEventListener('change', e => { SETTINGS.quality = e.target.value; saveSettings(); });
}

// ============================================================
// Play Modal
// ============================================================
function openPlayModal() {
  $('playModal').classList.add('active');
  updateModalUI();
}
function closePlayModal() {
  $('playModal').classList.remove('active');
}
function updateModalUI() {
  document.querySelectorAll('#playModal .modeCard').forEach(el => {
    el.classList.toggle('active', el.dataset.mode === selectedMode);
  });
  renderFriendsInModal();
}
function renderFriendsInModal() {
  const list = $('friendsList');
  if (!list) return;
  if (!friendsList.length && !friendRequests.length) {
    list.innerHTML = '<div style="text-align:center;color:#666;font-size:12px;padding:20px;">Пока нет друзей. Добавь кого-нибудь!</div>';
    return;
  }
  let html = '';
  if (friendRequests.length) {
    html += '<div style="font-size:10px;color:#f0ad4e;letter-spacing:2px;margin-bottom:8px;">ЗАЯВКИ В ДРУЗЬЯ</div>';
    for (const r of friendRequests) {
      html += '<div class="friendRow"><div class="friendInfo"><div class="friendStatus online"></div><div class="friendName">' + r.name + '</div></div><div class="notifActions"><button class="accept" onclick="acceptFriend(\'' + r.id + '\')">✓</button><button class="decline" onclick="declineFriend(\'' + r.id + '\')">×</button></div></div>';
    }
    html += '<div style="height:1px;background:rgba(255,255,255,.08);margin:12px 0;"></div>';
  }
  for (const f of friendsList) {
    html += '<div class="friendRow"><div class="friendInfo"><div class="friendStatus ' + (f.online ? 'online' : 'offline') + '"></div><div class="friendName">' + f.name + (f.inLobby ? ' 🚪' : '') + '</div></div><button class="friendInvite" onclick="inviteFriend(\'' + f.id + '\')" ' + (!f.online ? 'disabled' : '') + '>Пригласить</button></div>';
  }
  list.innerHTML = html;
}

// ============================================================
// Networking
// ============================================================
function connectAndPlay() {
  const name = $('menuNickBig').textContent;
  const pass = localStorage.getItem('blockade_password') || '';
  if (!name || name === '—') { $('menuErr').textContent = 'Введи ник!'; return; }
  if (!pass) { $('menuErr').textContent = 'Введи пароль!'; return; }
  $('menuErr').textContent = '';
  closePlayModal();
  if (ws && ws.readyState === 1) {
    netSend({ t: 'setMode', mode: selectedMode });
    return;
  }
  connect(name, pass);
}

function connect(name, password) {
  myName = name;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name: name, password: password }));
  ws.onerror = () => { $('menuErr').textContent = 'Ошибка подключения'; };
  ws.onclose = () => {
    if (inGame) {
      inGame = false;
      closeChat();
      document.exitPointerLock();
      $('hud').style.display = 'none';
      $('menu').style.display = 'flex';
      $('menuErr').textContent = 'Соединение потеряно.';
    }
  };
  ws.onmessage = e => handleMsg(JSON.parse(e.data));
}
function netSend(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

// ============================================================
// handleMsg
// ============================================================
function handleMsg(m) {
  switch (m.t) {
    case 'authFailed':
      $('authErr').textContent = m.reason || 'Ошибка';
      $('menuErr').textContent = m.reason || 'Ошибка';
      showAuth();
      break;
    case 'welcome': {
      myId = m.id; myUserId = m.userId; myTeam = m.team;
      isCheater = !!m.cheater;
      currentMode = m.gameMode || 'classic';
      selectedMode = currentMode;
      me.pos.set(m.pos.x, m.pos.y, m.pos.z);
      me.ry = m.ry; me.rx = 0;
      me.money = m.money || 800;
      me.armor = m.armor || 0;
      matchScore = m.matchScore || { red: 0, blue: 0 };
      for (const p of m.players) addRemote(p);
      for (const d of m.destroyed || []) removeBlockLocal(d.x, d.y, d.z, true);
      for (const b of m.placed) placeBlockLocal(b.x, b.y, b.z, b.team);
      startGame();
      updateMoneyHud(); updateHealthHud(); updateMatchScoreHud();
      updateGrenadeHud();
      $('modeIndicator').textContent = 'РЕЖИМ: ' + getModeName(currentMode);
      if (isCheater) {
        sysChat('🔥 ЧИТ-ПАНЕЛЬ АКТИВНА. Правый CTRL — меню.');
        updateCheatPanel();
      }
      break;
    }
    case 'join': addRemote(m.p); break;
    case 'leave': {
      const r = remotes.get(m.id);
      if (r) { scene.remove(r.group); remotes.delete(m.id); }
      break;
    }
    case 'states':
      for (const s of m.states) {
        if (s.id === myId) continue;
        const r = remotes.get(s.id);
        if (!r) continue;
        r.target.set(s.pos.x, s.pos.y, s.pos.z);
        r.try = s.ry; r.trx = s.rx; r.anim = s.anim || 0; r.hp = s.hp; r.armor = s.armor || 0;
        if (!r.alive) { r.alive = true; r.group.visible = true; }
      }
      break;
    case 'shoot': {
      const r = remotes.get(m.id);
      const from = new THREE.Vector3(m.from.x, m.from.y, m.from.z);
      const dir = new THREE.Vector3(m.dir.x, m.dir.y, m.dir.z);
      const dist = camera ? from.distanceTo(me.pos) : 50;
      spawnTracer(from, dir, m.w);
      SND.shot(m.w, Math.max(0.02, 0.25 * Math.min(1, 14 / (dist + 1))));
      if (r) r.shootAnim = 0.12;
      break;
    }
    case 'hp':
      if (cheats.infiniteHp) break;
      me.hp = m.hp; me.armor = m.armor || 0;
      updateHealthHud(); SND.hurt();
      const v = $('dmgVignette');
      v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 120);
      break;
    case 'armorUpdate': me.armor = m.armor; updateHealthHud(); break;
    case 'moneyUpdate': me.money = m.money; updateMoneyHud(); break;
    case 'weaponSwitched':
      me.weapon = m.weapon;
      sysChat('🔫 Новое оружие: ' + (WEAPONS[m.weapon] ? WEAPONS[m.weapon].name : m.weapon));
      updateAmmoHud();
      break;
    case 'hitconfirm': {
      const hm = $('hitmarker');
      hm.classList.toggle('head', m.head);
      hm.style.opacity = 1;
      clearTimeout(hm._t); hm._t = setTimeout(() => hm.style.opacity = 0, 120);
      m.head ? SND.headshot() : SND.hit();
      break;
    }
    case 'death': {
      const victim = m.victim === myId ? null : remotes.get(m.victim);
      const killer = m.killer === myId ? null : remotes.get(m.killer);
      const vName = victim ? victim.name : myName;
      const vTeam = victim ? victim.team : myTeam;
      const kName = killer ? killer.name : myName;
      const kTeam = killer ? killer.team : myTeam;
      feed(kName, kTeam, vName, vTeam, m.head, m.w);
      if (victim) { victim.alive = false; victim.deaths++; deathBurst(victim.group.position); victim.group.visible = false; }
      if (killer) killer.kills++;
      if (m.victim === myId) {
        if (cheats.infiniteHp) { me.hp = 100; updateHealthHud(); break; }
        me.hp = 0; me.dead = true; me.deaths++;
        updateHealthHud(); SND.death(); showDeathScreen(kName);
      }
      if (m.killer === myId) { me.kills++; SND.kill(); }
      break;
    }
    case 'respawn': {
      if (m.id === myId) {
        me.pos.set(m.pos.x, m.pos.y, m.pos.z);
        me.vel.set(0, 0, 0);
        me.hp = 100; me.armor = m.armor || 0; me.dead = false;
        me.ammo = { rifle: 30, shotgun: 6, sniper: 5, deagle: 7, knife: 0 };
        me.blocks = 64; me.reloading = false;
        me.flashing = 0;
        me.grenades = { he: 1, flash: 1, smoke: 1 };
        me.ry = myTeam === 'red' ? -Math.PI / 2 : Math.PI / 2; me.rx = 0;
        updateHealthHud(); updateAmmoHud(); updateHotbar(); updateGrenadeHud();
        $('deathScreen').style.display = 'none';
        const f = $('respawnFlash');
        f.style.opacity = 0.8; f.style.transition = 'none';
        requestAnimationFrame(() => { f.style.transition = 'opacity .6s'; f.style.opacity = 0; });
        SND.spawn();
      } else {
        const r = remotes.get(m.id);
        if (r) { r.alive = true; r.hp = 100; r.armor = 0; r.group.position.set(m.pos.x, m.pos.y, m.pos.z); r.target.set(m.pos.x, m.pos.y, m.pos.z); r.group.visible = true; }
      }
      break;
    }
    case 'place': placeBlockLocal(m.x, m.y, m.z, m.team); break;
    case 'destroy': removeBlockLocal(m.x, m.y, m.z); break;

    case 'grenadesUpdate':
      if (me.grenades) {
        me.grenades.he = m.grenades.he;
        me.grenades.flash = m.grenades.flash;
        me.grenades.smoke = m.grenades.smoke;
        updateGrenadeHud();
      }
      break;
    case 'grenadeThrown': spawnGrenadeMesh(m.type, m.from, m.vel); break;
    case 'grenadeExplode': explodeGrenadeLocal(m.x, m.y, m.z, m.type); break;
    case 'flash': me.flashing = m.duration; applyFlash(); break;
    case 'smokeStart': spawnSmokeLocal(m.x, m.y, m.z, m.duration); break;

    case 'modeChanged':
      currentMode = m.mode;
      selectedMode = m.mode;
      $('modeIndicator').textContent = 'РЕЖИМ: ' + getModeName(m.mode);
      sysChat('🎮 Режим: ' + getModeName(m.mode));
      document.querySelectorAll('#modeSelect button').forEach(b => b.classList.toggle('active', b.dataset.mode === m.mode));
      break;

    case 'roundStart':
      matchScore = m.matchScore || matchScore;
      roundTimeLeft = m.roundTime || 115000;
      buyTimeLeft = m.buyTime || 15000;
      inBuyPhase = true;
      updateMatchScoreHud();
      sysChat('🎬 НОВЫЙ РАУНД!');
      break;
    case 'timer':
      roundTimeLeft = m.roundLeft;
      inBuyPhase = m.buyPhase;
      updateTimerHud();
      if (inBuyPhase) buyTimeLeft -= 1000;
      break;
    case 'roundEnd': {
      roundTimeLeft = 0; inBuyPhase = false;
      matchScore = m.matchScore || matchScore;
      updateMatchScoreHud();
      const win = $('roundWin');
      win.className = m.winner;
      $('roundWinText').textContent = m.winner === 'red' ? 'КРАСНЫЕ ПОБЕДИЛИ' : m.winner === 'blue' ? 'СИНИЕ ПОБЕДИЛИ' : 'НИЧЬЯ';
      const reasons = { bomb: 'Бомба взорвалась', defuse: 'Бомба разминирована', time: 'Время вышло', elimination: 'Уничтожение' };
      $('roundWinSub').textContent = reasons[m.reason] || '';
      win.style.display = 'flex';
      if (m.winner === myTeam) SND.win(); else SND.lose();
      setTimeout(() => { win.style.display = 'none'; }, 4000);
      break;
    }
    case 'matchEnd': {
      $('matchEndScreen').classList.add('active');
      const win = $('matchWinText');
      win.className = 'matchWin ' + m.winner;
      win.textContent = m.winner === 'red' ? 'КРАСНЫЕ ПОБЕДИЛИ МАТЧ!' : 'СИНИЕ ПОБЕДИЛИ МАТЧ!';
      $('matchScoreText').textContent = m.matchScore.red + ' : ' + m.matchScore.blue;
      let cd = 8;
      const cdEl = $('matchCountdown');
      cdEl.textContent = cd;
      const iv = setInterval(() => { cd--; if (cd < 0) { clearInterval(iv); return; } cdEl.textContent = cd; }, 1000);
      break;
    }
    case 'newMatch':
      $('matchEndScreen').classList.remove('active');
      matchScore = { red: 0, blue: 0 };
      updateMatchScoreHud();
      break;

    case 'bought':
      me.money = m.money;
      me.armor = m.armor;
      me.weapons = m.weapons || me.weapons;
      if (m.grenades) me.grenades = m.grenades;
      updateMoneyHud(); updateHealthHud(); updateBuyMenu(); updateGrenadeHud();
      SND.buy();
      break;
    case 'buyError': sysChat('⚠️ ' + m.text); SND.error(); break;

    case 'plantStarted': plantDuration = cheats.instantPlant ? 100 : (m.duration || 3000); break;
    case 'plantCancelled':
      planting = false;
      clearInterval(plantProgressInterval); plantProgressInterval = null;
      $('plantProgress').style.display = 'none';
      break;
    case 'bombPlanted':
      activeBomb = m.bomb;
      spawnBombMesh();
      startBombTimer();
      sysChat('💣 БОМБА ЗАЛОЖЕНА!');
      break;
    case 'bombExploded': {
      if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }
      activeBomb = null;
      if (bombTimerInterval) { clearInterval(bombTimerInterval); bombTimerInterval = null; }
      $('bombTimer').style.display = 'none';
      sysChat('💥 БОМБА ВЗОРВАЛАСЬ!');
      const pos = new THREE.Vector3(m.bomb.x, m.bomb.y + 1, m.bomb.z);
      burst(pos, 0xff7722, 40, 15);
      burst(pos, 0xffcc44, 30, 12);
      burst(pos, 0x777777, 25, 8);
      SND.boom(0.6);
      break;
    }
    case 'bombDefused':
      if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }
      activeBomb = null;
      if (bombTimerInterval) { clearInterval(bombTimerInterval); bombTimerInterval = null; }
      $('bombTimer').style.display = 'none';
      sysChat('🔧 БОМБА РАЗМИНИРОВАНА!');
      break;
    case 'bombError': sysChat('⚠️ ' + m.text); break;
    case 'defuseStarted': defuseDuration = cheats.instantDefuse ? 100 : (m.duration || 5000); break;
    case 'defuseCancelled':
      defusing = false;
      clearInterval(defuseProgressInterval); defuseProgressInterval = null;
      $('plantProgress').style.display = 'none';
      break;
    case 'chat': addChatMessage(m.name, m.team, m.text); break;

    case 'friendList':
      friendsList = m.friends || [];
      friendRequests = m.requests || [];
      renderFriendsInModal();
      break;
    case 'friendRequest':
      showNotification('info', 'Заявка в друзья', m.name + ' хочет добавить тебя', null);
      break;
    case 'friendAdded':
      showNotification('success', 'Друзья', m.text || 'Готово');
      break;
    case 'friendError':
      showNotification('error', 'Ошибка', m.text || 'Что-то пошло не так');
      break;

    case 'lobbyList':
      lobbiesList = m.lobbies || [];
      break;
    case 'lobbyJoined':
      myLobby = { code: m.code, name: m.name, mode: m.mode, isHost: m.isHost };
      showNotification('success', 'Лобби', 'Ты в комнате «' + m.name + '» (' + m.code + ')');
      sysChat('🚪 Ты в лобби: ' + m.name + ' (' + m.code + ')');
      if (!inGame) {
        const name2 = $('menuNickBig').textContent;
        const pass2 = localStorage.getItem('blockade_password') || '';
        $('menu').style.display = 'none';
        connect(name2, pass2);
      }
      break;
    case 'lobbyLeft':
      myLobby = null;
      showNotification('info', 'Лобби', 'Ты вышел из комнаты');
      break;
    case 'lobbyError':
      showNotification('error', 'Лобби', m.text || 'Ошибка');
      break;
    case 'lobbyInvite':
      showNotification('info', 'Приглашение в лобби',
        m.fromName + ' приглашает тебя в «' + m.mode + '» (' + m.code + ')',
        { code: m.code, from: m.fromName });
      break;
    case 'lobbyPlayers':
      showNotification('info', 'Лобби', 'Игроки: ' + m.players.join(', '));
      break;
    case 'lobbyModeChanged':
      selectedMode = m.mode;
      showNotification('info', 'Лобби', 'Режим изменён на ' + getModeName(m.mode));
      break;
  }
}

function getModeName(mode) {
  const names = { classic: 'CLASSIC', arena: '1V1 ARENA', deathmatch: 'DEATHMATCH', gungame: 'GUN GAME' };
  return names[mode] || 'CLASSIC';
}

function showNotification(type, title, text, invite) {
  const box = $('notifications');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'notif ' + (type || 'info');
  let html = '<div class="notifTitle">' + title + '</div><div class="notifText">' + text + '</div>';
  if (invite) {
    html += '<div class="notifActions"><button class="accept" onclick="acceptLobbyInvite(\'' + invite.code + '\'); this.closest(\'.notif\').remove();">Принять</button><button class="decline" onclick="this.closest(\'.notif\').remove();">Отклонить</button></div>';
  }
  div.innerHTML = html;
  box.appendChild(div);
  SND.notif();
  if (!invite) setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 400); }, 6000);
  while (box.children.length > 5) box.firstChild.remove();
}
function acceptLobbyInvite(code) { netSend({ t: 'joinLobby', code: code }); }
function addFriendByName(name) { if (name) netSend({ t: 'addFriend', name: name }); }
function acceptFriend(id) { netSend({ t: 'acceptFriend', from: id }); }
function declineFriend(id) { netSend({ t: 'declineFriend', from: id }); }
function inviteFriend(id) { netSend({ t: 'inviteFriend', id: id }); }
function createLobby() { netSend({ t: 'createLobby', name: myName + "'s lobby", mode: selectedMode }); }
function joinLobbyByCode(code) { if (code) netSend({ t: 'joinLobby', code: code.toUpperCase() }); }
function leaveLobby() { netSend({ t: 'leaveLobby' }); myLobby = null; }

// ============================================================
// Buy Menu
// ============================================================
function openBuyMenu() {
  if (!inGame || me.dead || buyMenuOpen) return;
  if (!inBuyPhase && !cheats.freeBuy) { sysChat('⚠️ Закупка только в начале раунда!'); return; }
  buyMenuOpen = true;
  $('buyMenu').classList.add('active');
  updateBuyMenu();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeBuyMenu() {
  buyMenuOpen = false;
  $('buyMenu').classList.remove('active');
  if (inGame && !me.dead) renderer.domElement.requestPointerLock();
}
function updateBuyMenu() {
  $('buyMoneyVal').textContent = cheats.freeBuy ? '∞' : me.money;
  document.querySelectorAll('#buyMenu .buyItem').forEach(el => {
    const item = el.dataset.item;
    const prices = { rifle: 2700, shotgun: 1200, sniper: 4750, deagle: 700, armor: 1000, he: 300, flash: 200, smoke: 300 };
    const price = prices[item];
    const owned = me.weapons[item] || (item === 'armor' && me.armor > 0) || (me.grenades && me.grenades[item] > 0);
    const disabled = !cheats.freeBuy && (me.money < price || owned);
    el.classList.toggle('disabled', disabled);
    if (owned) {
      el.querySelector('.price').textContent = '✓ Куплено';
      el.querySelector('.price').style.color = '#888';
    } else {
      el.querySelector('.price').textContent = cheats.freeBuy ? 'FREE' : '$' + price;
      el.querySelector('.price').style.color = cheats.freeBuy ? '#f0ad4e' : '#6ab04c';
    }
  });
}
function buyItem(item) {
  if (!inBuyPhase && !cheats.freeBuy) { SND.error(); sysChat('⚠️ Закупка только в начале раунда!'); return; }
  if (!item) return;
  if (cheats.freeBuy) {
    if (item === 'armor') me.armor = 100;
    else if (item === 'he' || item === 'flash' || item === 'smoke') { me.grenades[item] = 1; updateGrenadeHud(); }
    else { me.weapons[item] = true; me.weapon = item; me.slot = SLOTS.indexOf(item); }
    updateBuyMenu(); updateHealthHud(); updateAmmoHud(); updateHotbar();
    SND.buy();
    return;
  }
  netSend({ t: 'buy', item: item });
}

// ============================================================
// Cheat Menu
// ============================================================
function openCheatMenu() {
  if (!isCheater) return;
  cheatsMenuOpen = true;
  $('cheatMenu').classList.add('active');
  updateCheatMenu();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeCheatMenu() {
  cheatsMenuOpen = false;
  $('cheatMenu').classList.remove('active');
  if (inGame && !me.dead && !buyMenuOpen) renderer.domElement.requestPointerLock();
}
function updateCheatMenu() {
  document.querySelectorAll('#cheatMenu .cheatItem').forEach(el => {
    const key = el.dataset.cheat;
    el.classList.toggle('active', cheats[key]);
    const val = el.querySelector('.val');
    if (val) val.textContent = cheats[key] ? 'ON' : 'OFF';
  });
}
function toggleCheat(name) {
  if (!isCheater) return;
  cheats[name] = !cheats[name];
  updateCheatMenu();
  updateCheatPanel();
  if (name === 'fullBright') applyFullBright();
  sysChat('[ЧИТ] ' + name + ': ' + (cheats[name] ? 'ВКЛ' : 'ВЫКЛ'));
}
function updateCheatPanel() {
  if (!isCheater) return;
  const list = $('cheatPanelList');
  if (!list) return;
  const names = {
    aimbot: 'Aimbot', wallhack: 'Wallhack', speedhack: 'Speedhack',
    noclip: 'NoClip', infiniteAmmo: 'InfAmmo', infiniteHp: 'InfHP',
    rapidFire: 'RapidFire', autoHeadshot: 'AutoHS', fullBright: 'FullBright',
    oneShot: 'OneShot', freeBuy: 'FreeBuy', instantPlant: 'FastPlant',
    instantDefuse: 'FastDefuse', chams: 'Chams',
  };
  list.innerHTML = '';
  for (const k in cheats) {
    if (!cheats.hasOwnProperty(k)) continue;
    const v = cheats[k];
    const div = document.createElement('div');
    div.className = 'cheatRow' + (v ? ' active' : '');
    div.innerHTML = '<span>' + names[k] + '</span><span class="val">' + (v ? 'ON' : 'OFF') + '</span>';
    list.appendChild(div);
  }
}
function applyFullBright() {
  if (!scene) return;
  scene.traverse(o => {
    if (o.isLight) {
      if (o.isAmbientLight) o.intensity = cheats.fullBright ? 2.5 : 0.75;
      if (o.isDirectionalLight) o.intensity = cheats.fullBright ? 1.0 : 1.6;
    }
  });
}
// ============================================================
// HUD
// ============================================================
function updateHealthHud() {
  const hp = Math.max(0, me.hp);
  const el = $('hpNum');
  if (el) {
    el.textContent = hp;
    el.classList.toggle('low', hp <= 25);
    el.classList.toggle('mid', hp > 25 && hp <= 60);
  }
  const hpBar = $('hpBar');
  if (hpBar) hpBar.style.width = hp + '%';
  const hpPct = $('hpPct');
  if (hpPct) hpPct.textContent = hp + '%';
  const a = $('armorBar');
  if (a) a.style.width = Math.max(0, me.armor) + '%';
  const ap = $('armorPct');
  if (ap) ap.textContent = Math.max(0, me.armor) + '%';
}
function updateMoneyHud() {
  const el = $('moneyHud');
  if (el) el.textContent = cheats.freeBuy ? '$∞' : '$' + me.money;
}
function updateMatchScoreHud() {
  const r = $('matchRed'); if (r) r.textContent = matchScore.red;
  const b = $('matchBlue'); if (b) b.textContent = matchScore.blue;
}
function updateTimerHud() {
  const el = $('timerText');
  if (!el) return;
  const s = Math.max(0, Math.ceil(roundTimeLeft / 1000));
  el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  el.classList.toggle('warning', roundTimeLeft < 20000 && !inBuyPhase);
  const p = $('phaseText');
  if (p) p.textContent = inBuyPhase ? 'ЗАКУПКА · ' + Math.max(0, Math.ceil(buyTimeLeft / 1000)) + 'с' : 'В БОЮ';
}
function updateGrenadeHud() {
  if (!me.grenades) me.grenades = { he: 0, flash: 0, smoke: 0 };
  const g1 = $('gHE'); if (g1) g1.classList.toggle('empty', me.grenades.he <= 0);
  const g2 = $('gFlash'); if (g2) g2.classList.toggle('empty', me.grenades.flash <= 0);
  const g3 = $('gSmoke'); if (g3) g3.classList.toggle('empty', me.grenades.smoke <= 0);
}

// ============================================================
// Chat
// ============================================================
function addChatMessage(name, team, text) {
  const box = $('chatMessages');
  if (!box) return;
  const div = document.createElement('div');
  const nick = document.createElement('span');
  nick.className = 'nick ' + (team === 'red' ? 'r' : 'b');
  nick.textContent = name;
  div.appendChild(nick);
  div.appendChild(document.createTextNode(': ' + text));
  box.appendChild(div);
  while (box.children.length > 8) box.firstChild.remove();
  setTimeout(() => { div.style.opacity = 0; setTimeout(() => div.remove(), 600); }, 9000);
}
function openChat() {
  chatOpen = true;
  const input = $('chatInput');
  input.style.display = 'block'; input.value = ''; input.focus();
  Object.keys(keys).forEach(k => keys[k] = false);
  mouseDown = false;
}
function closeChat() {
  chatOpen = false;
  const input = $('chatInput');
  input.style.display = 'none'; input.blur();
}
function sysChat(text) {
  const box = $('chatMessages');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'sys';
  div.textContent = text;
  box.appendChild(div);
  while (box.children.length > 8) box.firstChild.remove();
  setTimeout(() => { div.style.opacity = 0; setTimeout(() => div.remove(), 600); }, 9000);
}

// ============================================================
// Загрузка моделей оружия (заглушка — оружие кубами)
// ============================================================
function loadWeaponModels() {
  console.log('🎮 Оружие: кубы (GLB не нужны)');
}

// ============================================================
// Remote players
// ============================================================
function makeFaceTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#d8a37a'; g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#fff'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1);
  g.fillStyle = '#3b2db0'; g.fillRect(2, 3, 1, 1); g.fillRect(5, 3, 1, 1);
  g.fillStyle = '#8a5c3a'; g.fillRect(0, 0, 8, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}
let faceTex = null;

function makeNameSprite(name, team) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = 'bold 26px Inter, sans-serif';
  const w = Math.max(80, g.measureText(name).width + 30);
  c.width = w; c.height = 44;
  const g2 = c.getContext('2d');
  g2.fillStyle = 'rgba(0,0,0,0.6)'; g2.fillRect(0, 0, w, 44);
  g2.font = 'bold 26px Inter, sans-serif';
  g2.fillStyle = TEAM_COL[team];
  g2.textAlign = 'center'; g2.textBaseline = 'middle';
  g2.fillText(name, w / 2, 23);
  const t = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t }));
  sp.scale.set(w / 70, 0.62, 1);
  sp.position.y = 2.45;
  return sp;
}
function makeCharacter(team, name) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a37a });
  const jersey = new THREE.MeshLambertMaterial({ color: team === 'red' ? 0xb03430 : 0x3a4fb4 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x33343c });
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTex });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [skin, skin, skin, skin, faceMat, skin]);
  head.position.y = 1.65;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.26), jersey);
  body.position.y = 1.05;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), jersey);
  const armR = armL.clone();
  armL.position.set(-0.37, 1.32, 0); armR.position.set(0.37, 1.32, 0);
  armL.geometry = armL.geometry.clone(); armR.geometry = armR.geometry.clone();
  armL.geometry.translate(0, -0.28, 0); armR.geometry.translate(0, -0.28, 0);
  armL.position.y = armR.position.y = 1.36;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.6), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  gun.position.set(0.37, 0.78, -0.42);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.7, 0.25), pants);
  const legR = legL.clone();
  legL.geometry = legL.geometry.clone(); legR.geometry = legR.geometry.clone();
  legL.geometry.translate(0, -0.35, 0); legR.geometry.translate(0, -0.35, 0);
  legL.position.set(-0.13, 0.7, 0); legR.position.set(0.13, 0.7, 0);
  [head, body, armL, armR, legL, legR, gun].forEach(o => { o.castShadow = true; group.add(o); });
  group.add(makeNameSprite(name, team));
  group.userData = { head: head, armL: armL, armR: armR, legL: legL, legR: legR, gun: gun };
  return group;
}
function addRemote(p) {
  if (remotes.has(p.id)) return;
  const group = makeCharacter(p.team, p.name);
  group.position.set(p.pos.x, p.pos.y, p.pos.z);
  group.rotation.y = p.ry + Math.PI;
  group.visible = p.alive;
  scene.add(group);
  remotes.set(p.id, {
    id: p.id, name: p.name, team: p.team, group: group,
    target: new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z),
    try: p.ry, trx: p.rx || 0, anim: 0, phase: 0,
    alive: p.alive, hp: p.hp, armor: p.armor || 0,
    kills: p.kills || 0, deaths: p.deaths || 0, shootAnim: 0,
  });
}
function updateRemotes(dt) {
  const k = Math.min(1, dt * 14);
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    r.group.position.lerp(r.target, k);
    let dy = (r.try + Math.PI) - r.group.rotation.y;
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    r.group.rotation.y += dy * k;
    const u = r.group.userData;
    u.head.rotation.x = -(r.trx || 0);
    r.phase += dt * (4 + r.anim * 9);
    const swing = Math.sin(r.phase) * Math.min(0.7, r.anim * 0.9);
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = r.shootAnim > 0 ? -1.35 : swing * 0.7 - 0.6;
    if (r.shootAnim > 0) r.shootAnim -= dt;
  }
}

// ============================================================
// Читы
// ============================================================
function runAimbot() {
  if (!cheats.aimbot || !isCheater) return;
  let best = null, bestDist = Infinity;
  for (const r of remotes.values()) {
    if (!r.alive || r.team === myTeam) continue;
    const d = r.group.position.distanceTo(me.pos);
    if (d < bestDist) { bestDist = d; best = r; }
  }
  if (!best) return;
  const target = best.group.position.clone();
  target.y += cheats.autoHeadshot ? 1.7 : 1.2;
  const dx = target.x - me.pos.x;
  const dy = target.y - (me.pos.y + EYE);
  const dz = target.z - me.pos.z;
  me.ry = Math.atan2(-dx, -dz);
  me.rx = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
}
function updateWallhack() {
  if (!isCheater) return;
  const showESP = cheats.wallhack || cheats.chams;
  if (!showESP) {
    for (const m of cheatESP.values()) scene.remove(m);
    cheatESP.clear(); return;
  }
  const alive = new Set();
  for (const r of remotes.values()) {
    if (!r.alive || r.team === myTeam) {
      if (cheatESP.has(r.id)) { scene.remove(cheatESP.get(r.id)); cheatESP.delete(r.id); }
      continue;
    }
    alive.add(r.id);
    let esp = cheatESP.get(r.id);
    if (!esp) {
      const geo = cheats.chams ? new THREE.BoxGeometry(0.9, 2.1, 0.9) : new THREE.BoxGeometry(1.2, 2.6, 1.2);
      const mat = cheats.chams
        ? new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false })
        : new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.9, depthTest: false });
      esp = new THREE.Mesh(geo, mat);
      esp.renderOrder = 999;
      scene.add(esp);
      cheatESP.set(r.id, esp);
    }
    esp.position.copy(r.group.position);
    esp.position.y += cheats.chams ? 1.0 : 0.9;
  }
  for (const id of Array.from(cheatESP.keys())) {
    if (!alive.has(id)) { scene.remove(cheatESP.get(id)); cheatESP.delete(id); }
  }
}
function teleportToEnemy() {
  if (!isCheater) return;
  let best = null, bestDist = Infinity;
  for (const r of remotes.values()) {
    if (!r.alive || r.team === myTeam) continue;
    const d = r.group.position.distanceTo(me.pos);
    if (d < bestDist) { bestDist = d; best = r; }
  }
  if (!best) { sysChat('Нет врагов'); return; }
  me.pos.copy(best.group.position);
  me.pos.y += 1;
  sysChat('⚡ Телепорт к врагу');
}

// ============================================================
// Physics
// ============================================================
function collideAxis(pos) {
  if (cheats.noclip) return false;
  if (!dust2Map) return false;
  const minX = Math.floor(pos.x - P_HALF), maxX = Math.floor(pos.x + P_HALF);
  const minY = Math.floor(pos.y), maxY = Math.floor(pos.y + P_HEIGHT - 0.001);
  const minZ = Math.floor(pos.z - P_HALF), maxZ = Math.floor(pos.z + P_HALF);
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++)
        if (solid(x, y, z)) return true;
  return false;
}
function movePlayer(dt) {
  if (SETTINGS.mobile && joystickActive) {
    const speed = SPRINT * (cheats.speedhack ? 3 : 1);
    const forward = new THREE.Vector3(-Math.sin(me.ry), 0, -Math.cos(me.ry));
    const right = new THREE.Vector3(Math.cos(me.ry), 0, -Math.sin(me.ry));
    const move = new THREE.Vector3();
    if (joystickVector.y < -0.2) move.add(forward);
    if (joystickVector.y > 0.2) move.sub(forward);
    if (joystickVector.x > 0.2) move.add(right);
    if (joystickVector.x < -0.2) move.sub(right);
    if (move.length() > 0) move.normalize().multiplyScalar(speed);
    const accel = me.onGround ? 14 : 4;
    me.vel.x += (move.x - me.vel.x) * Math.min(1, accel * dt);
    me.vel.z += (move.z - me.vel.z) * Math.min(1, accel * dt);
  } else {
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = (sprint ? SPRINT : WALK) * (cheats.speedhack ? 3 : 1);
    let fx = 0, fz = 0;
    if (keys['KeyW']) fz -= 1;
    if (keys['KeyS']) fz += 1;
    if (keys['KeyA']) fx -= 1;
    if (keys['KeyD']) fx += 1;
    const len = Math.hypot(fx, fz);
    let wishX = 0, wishZ = 0;
    if (len > 0) {
      fx /= len; fz /= len;
      wishX = (-Math.sin(me.ry)) * (-fz) * speed + Math.cos(me.ry) * fx * speed;
      wishZ = (-Math.cos(me.ry)) * (-fz) * speed + (-Math.sin(me.ry)) * fx * speed;
    }
    const accel = me.onGround ? 14 : 4;
    me.vel.x += (wishX - me.vel.x) * Math.min(1, accel * dt);
    me.vel.z += (wishZ - me.vel.z) * Math.min(1, accel * dt);
  }
  if (!cheats.noclip) me.vel.y -= GRAVITY * dt;
  if (keys['Space'] && me.onGround) { me.vel.y = JUMP_V; me.onGround = false; }
  const p = me.pos;
  p.x += me.vel.x * dt;
  if (collideAxis(p)) { p.x -= me.vel.x * dt; me.vel.x = 0; }
  p.z += me.vel.z * dt;
  if (collideAxis(p)) { p.z -= me.vel.z * dt; me.vel.z = 0; }
  p.y += me.vel.y * dt;
  me.onGround = false;
  if (collideAxis(p)) {
    if (me.vel.y < 0) me.onGround = true;
    p.y -= me.vel.y * dt;
    me.vel.y = 0;
  }
  if (p.y < -10) {
    if (myTeam === 'red') p.set(0, 1.05, 47);
    else p.set(0, 1.05, -27);
    me.vel.set(0, 0, 0);
  }
  return (Math.abs(me.vel.x) + Math.abs(me.vel.z)) > 0.5 ? 0.6 : 0;
}

// ============================================================
// Raycasting
// ============================================================
function raycastVoxels(o, d, maxDist) {
  if (!dust2Map) return null;
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const stepX = d.x >= 0 ? 1 : -1, stepY = d.y >= 0 ? 1 : -1, stepZ = d.z >= 0 ? 1 : -1;
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tmx = d.x !== 0 ? ((stepX > 0 ? x + 1 - o.x : o.x - x) * tdx) : Infinity;
  let tmy = d.y !== 0 ? ((stepY > 0 ? y + 1 - o.y : o.y - y) * tdy) : Infinity;
  let tmz = d.z !== 0 ? ((stepZ > 0 ? z + 1 - o.z : o.z - z) * tdz) : Infinity;
  let t = 0, normal = [0, 0, 0];
  for (let i = 0; i < 400; i++) {
    if (tmx < tmy && tmx < tmz) { x += stepX; t = tmx; tmx += tdx; normal = [-stepX, 0, 0]; }
    else if (tmy < tmz) { y += stepY; t = tmy; tmy += tdy; normal = [0, -stepY, 0]; }
    else { z += stepZ; t = tmz; tmz += tdz; normal = [0, 0, -stepZ]; }
    if (t > maxDist) return null;
    if (solid(x, y, z)) return { x: x, y: y, z: z, dist: t, normal: normal };
  }
  return null;
}
function rayAABB(o, d, min, max) {
  let tmin = 0, tmax = Infinity;
  const ax = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const a = ax[i];
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
    } else {
      let t1 = (min[a] - o[a]) / d[a], t2 = (max[a] - o[a]) / d[a];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// ============================================================
// Weapons
// ============================================================
function currentWeapon() { return WEAPONS[me.weapon || 'rifle'] || WEAPONS.rifle; }
function tryShoot(now) {
  const wkey = me.weapon || 'rifle';
  const w = WEAPONS[wkey] || WEAPONS.rifle;
  if (me.dead || me.reloading || planting || defusing || buyMenuOpen) return;
  if (wkey === 'knife') {
    if (now - me.lastShot < 400) return;
    me.lastShot = now;
    SND.swing();
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    for (const r of remotes.values()) {
      if (!r.alive || r.team === myTeam) continue;
      const dist = r.group.position.distanceTo(me.pos);
      if (dist < 2.5) {
        netSend({ t: 'hit', target: r.id, dmg: 55, w: 'knife', head: false, legs: false });
      }
    }
    return;
  }
  const rate = cheats.rapidFire ? 30 : w.rate;
  if (now - me.lastShot < rate) return;
  if (!cheats.infiniteAmmo && (me.ammo[wkey] || 0) <= 0) { startReload(); return; }
  me.lastShot = now;
  if (!cheats.infiniteAmmo) me.ammo[wkey]--;
  updateAmmoHud();
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);
  const spread = w.spread * (me.zoomed ? 0.25 : 1) * (me.onGround ? 1 : 1.8);
  for (let p = 0; p < w.pellets; p++) {
    const dir = baseDir.clone();
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
    const blockHit = raycastVoxels(origin, dir, w.range);
    let bestPlayer = null, bestT = blockHit ? blockHit.dist : w.range;
    for (const r of remotes.values()) {
      if (!r.alive) continue;
      if (r.team === myTeam && !isCheater) continue;
      const bp = r.group.position;
      const t = rayAABB(origin, dir, { x: bp.x - 0.35, y: bp.y, z: bp.z - 0.35 }, { x: bp.x + 0.35, y: bp.y + 1.9, z: bp.z + 0.35 });
      if (t !== null && t < bestT) { bestT = t; bestPlayer = r; }
    }
    if (bestPlayer) {
      const hitY = origin.y + dir.y * bestT;
      const localY = hitY - bestPlayer.group.position.y;
      const head = cheats.autoHeadshot || localY > 1.45;
      const legs = !head && localY < 0.6;
      let dmg = w.dmg * (head ? 2 : legs ? 0.75 : 1);
      if (cheats.oneShot) dmg = 999;
      netSend({ t: 'hit', target: bestPlayer.id, dmg: Math.round(dmg), w: wkey, head: head, legs: legs });
      bloodBurst(new THREE.Vector3(origin.x + dir.x * bestT, hitY, origin.z + dir.z * bestT));
    } else if (blockHit) {
      debrisBurst(new THREE.Vector3(origin.x + dir.x * blockHit.dist, origin.y + dir.y * blockHit.dist, origin.z + dir.z * blockHit.dist));
    }
    spawnTracer(origin, dir, wkey, bestT);
  }
  SND.shot(wkey);
  netSend({ t: 'shoot', from: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: baseDir.x, y: baseDir.y, z: baseDir.z }, w: wkey });
  me.rx += w.pellets > 1 ? 0.03 : (wkey === 'sniper' ? 0.05 : wkey === 'deagle' ? 0.03 : 0.012);
  if (vm.group) vm.recoil = 1;
  if (!cheats.infiniteAmmo && me.ammo[wkey] <= 0) startReload();
}
function startReload() {
  const wkey = me.weapon || 'rifle';
  const w = WEAPONS[wkey] || WEAPONS.rifle;
  if (wkey === 'knife' || me.reloading || me.ammo[wkey] === w.mag) return;
  me.reloading = true;
  $('reloadLbl').style.display = 'block';
  SND.reload();
  setTimeout(() => {
    me.ammo[wkey] = w.mag;
    me.reloading = false;
    $('reloadLbl').style.display = 'none';
    updateAmmoHud();
  }, w.reload);
}

// ============================================================
// Гранаты
// ============================================================
function startThrowGrenade(type) {
  if (me.dead) return;
  if (!me.grenades || !me.grenades[type] || me.grenades[type] <= 0) { sysChat('Нет гранат'); SND.error(); return; }
  throwing = true;
  throwingType = type;
  sysChat('Бросаю ' + type.toUpperCase() + '...');
}
function releaseThrowGrenade() {
  if (!throwing || !throwingType) return;
  const type = throwingType;
  throwing = false;
  throwingType = null;
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const speed = 20;
  const vx = dir.x * speed;
  const vy = dir.y * speed + 4;
  const vz = dir.z * speed;
  netSend({
    t: 'throwGrenade', type: type,
    x: origin.x + dir.x * 0.5,
    y: origin.y + dir.y * 0.5,
    z: origin.z + dir.z * 0.5,
    vx: vx, vy: vy, vz: vz,
  });
  spawnGrenadeMesh(type, { x: origin.x + dir.x * 0.5, y: origin.y + dir.y * 0.5, z: origin.z + dir.z * 0.5 }, { x: vx, y: vy, z: vz });
}
function spawnGrenadeMesh(type, from, vel) {
  const colors = { he: 0xff6644, flash: 0xffee44, smoke: 0x66aaff };
  const geo = new THREE.SphereGeometry(0.15, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: colors[type] || 0xffffff });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(from.x, from.y, from.z);
  scene.add(mesh);
  grenades.push({
    mesh: mesh, type: type,
    x: from.x, y: from.y, z: from.z,
    vx: vel.x, vy: vel.y, vz: vel.z,
    ttl: 3,
  });
}
function updateGrenadesClient(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.ttl -= dt;
    g.vy -= 23 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    if (g.y < 0.2) {
      g.y = 0.2;
      g.vy = 0;
      g.vx *= 0.7;
      g.vz *= 0.7;
    }
    g.mesh.position.set(g.x, g.y, g.z);
    if (g.ttl <= 0) {
      scene.remove(g.mesh);
      g.mesh.geometry.dispose();
      g.mesh.material.dispose();
      grenades.splice(i, 1);
    }
  }
}
function explodeGrenadeLocal(x, y, z, type) {
  const pos = new THREE.Vector3(x, y, z);
  if (type === 'he') {
    burst(pos, 0xff7722, 30, 12);
    burst(pos, 0xffcc44, 20, 10);
    if (pos.distanceTo(me.pos) < 20) SND.boom(Math.max(0.1, 1 - pos.distanceTo(me.pos) / 20));
  } else if (type === 'flash') {
    burst(pos, 0xffee44, 40, 15);
    tone(1200, 0.3, 0.3, 'square');
  } else if (type === 'smoke') {
    burst(pos, 0x888888, 30, 5);
  }
}
function applyFlash() {
  const overlay = $('flashOverlay');
  if (!overlay) return;
  overlay.style.opacity = Math.min(1, me.flashing / 3000);
  const iv = setInterval(() => {
    me.flashing = Math.max(0, me.flashing - 100);
    overlay.style.opacity = Math.min(1, me.flashing / 3000);
    if (me.flashing <= 0) { clearInterval(iv); overlay.style.opacity = 0; }
  }, 100);
}
function spawnSmokeLocal(x, y, z, duration) {
  const geo = new THREE.SphereGeometry(4, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y + 2, z);
  scene.add(mesh);
  setTimeout(() => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }, duration);
}

// ============================================================
// FX
// ============================================================
function spawnTracer(origin, dir, wkey, dist) {
  const len = dist !== undefined ? dist : 100;
  const end = origin.clone().addScaledVector(dir, len);
  const start = origin.clone().addScaledVector(dir, 0.8).add(new THREE.Vector3(0, -0.12, 0));
  const g = new THREE.BufferGeometry().setFromPoints([start, end]);
  const m = new THREE.LineBasicMaterial({
    color: wkey === 'sniper' ? 0xaadfff : wkey === 'deagle' ? 0xffaa44 : 0xffd080,
    transparent: true, opacity: 0.85,
  });
  const line = new THREE.Line(g, m);
  scene.add(line);
  tracers.push({ obj: line, ttl: 0.09 });
}
function burst(pos, color, n, spd) {
  for (let i = 0; i < n; i++) {
    const s = 0.05 + Math.random() * 0.06;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: color }));
    mesh.position.copy(pos);
    scene.add(mesh);
    particles.push({
      obj: mesh, ttl: 0.45 + Math.random() * 0.3,
      vel: new THREE.Vector3((Math.random() - 0.5) * spd, Math.random() * spd * 0.8, (Math.random() - 0.5) * spd),
    });
  }
}
const bloodBurst = p => burst(p, 0xaa1111, 7, 4);
const debrisBurst = p => burst(p, 0x8a8a8a, 5, 3);
const deathBurst = p => { burst(p.clone().add(new THREE.Vector3(0, 1, 0)), 0xaa1111, 16, 5); };
function updateFx(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.ttl -= dt;
    t.obj.material.opacity = Math.max(0, t.ttl / 0.09) * 0.85;
    if (t.ttl <= 0) { scene.remove(t.obj); t.obj.geometry.dispose(); t.obj.material.dispose(); tracers.splice(i, 1); }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.ttl -= dt;
    p.vel.y -= 12 * dt;
    p.obj.position.addScaledVector(p.vel, dt);
    if (p.ttl <= 0) { scene.remove(p.obj); p.obj.geometry.dispose(); p.obj.material.dispose(); particles.splice(i, 1); }
  }
}

// ============================================================
// View model (оружие от 1-го лица — кубы)
// ============================================================
const vm = { group: null, models: {}, recoil: 0, bob: 0 };
function buildViewModels() {
  vm.group = new THREE.Group();
  camera.add(vm.group);
  vm.group.position.set(0.32, -0.3, -0.55);
  const dark = new THREE.MeshLambertMaterial({ color: 0x26262b });
  const dark2 = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6e4f2a });
  const hand = new THREE.MeshLambertMaterial({ color: 0xd8a37a });
  function gunBase() {
    const g = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.1), hand);
    h.position.set(0, -0.07, 0.08);
    g.add(h);
    return g;
  }
  const rifleG = gunBase();
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.5), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.3), dark2);
    barrel.position.set(0, 0.01, -0.38);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), dark2);
    mag.position.set(0, -0.11, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), wood);
    stock.position.set(0, -0.01, 0.3);
    rifleG.add(body, barrel, mag, stock);
    vm.models.rifle = rifleG;
  }
  const sgG = gunBase();
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.45), wood);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), dark);
    barrel.position.set(0, 0.03, -0.35);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.14), dark2);
    pump.position.set(0, -0.04, -0.22);
    sgG.add(body, barrel, pump);
    vm.models.shotgun = sgG;
  }
  const snG = gunBase();
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.55), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.45), dark2);
    barrel.position.set(0, 0.02, -0.48);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.16), dark2);
    scope.position.set(0, 0.09, -0.05);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.18), wood);
    stock.position.set(0, -0.01, 0.33);
    snG.add(body, barrel, scope, stock);
    vm.models.sniper = snG;
  }
  const dgG = gunBase();
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.25), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), dark2);
    barrel.position.set(0, 0.03, -0.22);
    dgG.add(body, barrel);
    vm.models.deagle = dgG;
  }
  const knG = gunBase();
  {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), new THREE.MeshLambertMaterial({ color: 0xc0c0c8 }));
    blade.position.set(0, 0.02, -0.35);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.15), dark);
    handle.position.set(0, -0.02, 0.05);
    knG.add(blade, handle);
    vm.models.knife = knG;
  }
  for (const m of Object.values(vm.models)) { vm.group.add(m); m.visible = false; }
  if (vm.models[SLOTS[me.slot]]) vm.models[SLOTS[me.slot]].visible = true;
}
function updateViewModel(dt, moving) {
  if (!vm.group) return;
  vm.recoil = Math.max(0, vm.recoil - dt * 7);
  vm.bob += dt * (moving ? 9 : 2);
  const bobAmt = moving ? 0.012 : 0.004;
  const targetX = me.zoomed && SLOTS[me.slot] === 'sniper' ? 0 : 0.32;
  vm.group.position.x += (targetX - vm.group.position.x) * Math.min(1, dt * 12);
  vm.group.position.y = -0.3 + Math.sin(vm.bob) * bobAmt;
  vm.group.position.z = -0.55 + vm.recoil * 0.09;
  vm.group.rotation.x = vm.recoil * 0.14;
  vm.group.visible = !me.dead && !(me.zoomed && SLOTS[me.slot] === 'sniper');
}
function selectSlot(i) {
  if (i >= SLOTS.length || i === me.slot) return;
  const wkey = SLOTS[i];
  if (WEAPONS[wkey]) {
    if (!me.weapons[wkey] && wkey !== 'rifle' && wkey !== 'knife' && !cheats.freeBuy) {
      sysChat('⚠️ ' + WEAPONS[wkey].name + ' не куплено!');
      SND.error();
      return;
    }
  }
  me.slot = i;
  me.weapon = wkey;
  me.zoomed = false;
  for (const k in vm.models) {
    if (vm.models.hasOwnProperty(k)) vm.models[k].visible = (k === SLOTS[i]);
  }
  updateHotbar(); updateAmmoHud();
  tone(420, 0.04, 0.08, 'square');
}

// ============================================================
// HUD helpers
// ============================================================
function updateHotbar() {}
function updateAmmoHud() {
  const wkey = me.weapon || 'rifle';
  const w = WEAPONS[wkey] || WEAPONS.rifle;
  const wn = $('weaponName');
  if (wn) wn.textContent = w.name + (cheats.infiniteAmmo ? ' [∞]' : '');
  const ac = $('ammoCur');
  if (ac) ac.textContent = cheats.infiniteAmmo ? '∞' : (wkey === 'knife' ? '∞' : (me.ammo[wkey] || 0));
  const am = $('ammoMax');
  if (am) am.textContent = wkey === 'knife' ? '' : w.mag;
}
function feed(killer, kTeam, victim, vTeam, head, weapon) {
  const kf = $('killfeed');
  if (!kf) return;
  const div = document.createElement('div');
  div.className = 'kfItem ' + (kTeam === 'red' ? 'red' : 'blue');
  const wIcon = weapon ? '<span class="weapon">' + weapon.toUpperCase() + '</span>' : '';
  div.innerHTML = '<span class="killer">' + killer + '</span> ' + (head ? '<span class="hs">[HS]</span>' : '') + ' ' + wIcon + ' <span class="victim">' + victim + '</span>';
  kf.prepend(div);
  while (kf.children.length > 6) kf.lastChild.remove();
  setTimeout(() => div.remove(), 6000);
}
function showDeathScreen(killerName) {
  $('deathScreen').style.display = 'flex';
  $('deathBy').textContent = 'Тебя убил: ' + killerName;
  $('deathCd').textContent = 'Ждём...';
}
function updateScoreboard() {
  const sb = $('scoreboard');
  if (!sb) return;
  if (!tabHeld) { sb.style.display = 'none'; return; }
  const all = [
    { name: myName + ' (ты)', team: myTeam, kills: me.kills, deaths: me.deaths, me: true },
  ];
  for (const r of remotes.values()) {
    all.push({ name: r.name, team: r.team, kills: r.kills, deaths: r.deaths, me: false });
  }
  const row = p => '<tr><td class="' + (p.me ? 'me' : '') + '">' + p.name + '</td><td>' + p.kills + '</td><td>' + p.deaths + '</td></tr>';
  const table = list => '<table><tr><th>ИГРОК</th><th>УБИЙСТВА</th><th>СМЕРТИ</th></tr>' + list.sort((a, b) => b.kills - a.kills).map(row).join('') + '</table>';
  sb.innerHTML = '<h3 class="red">КРАСНЫЕ — ' + matchScore.red + '</h3>' + table(all.filter(p => p.team === 'red')) +
    '<h3 class="blue">СИНИЕ — ' + matchScore.blue + '</h3>' + table(all.filter(p => p.team === 'blue'));
  sb.style.display = 'block';
}

// ============================================================
// Radar
// ============================================================
function updateRadar() {
  const canvas = $('radarCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(15,20,15,0.85)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
  for (let i = 0; i < H; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }
  const scale = 3.5;
  ctx.save();
  ctx.translate(cx, cy);
  for (const r of remotes.values()) {
    if (!r.alive || r.team === myTeam) continue;
    const dx = r.group.position.x - me.pos.x;
    const dz = r.group.position.z - me.pos.z;
    const cs = Math.cos(-me.ry), sn = Math.sin(-me.ry);
    const rx = (dx * cs - dz * sn) * scale;
    const rz = (dx * sn + dz * cs) * scale;
    if (Math.abs(rx) > W / 2 || Math.abs(rz) > H / 2) continue;
    ctx.fillStyle = '#ff3333';
    ctx.beginPath(); ctx.arc(rx, rz, 5, 0, Math.PI * 2); ctx.fill();
  }
  if (activeBomb) {
    const dx = activeBomb.x - me.pos.x;
    const dz = activeBomb.z - me.pos.z;
    const cs = Math.cos(-me.ry), sn = Math.sin(-me.ry);
    const rx = (dx * cs - dz * sn) * scale;
    const rz = (dx * sn + dz * cs) * scale;
    if (Math.abs(rx) < W / 2 && Math.abs(rz) < H / 2) {
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath(); ctx.arc(rx, rz, 7, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = '#44ff44';
  ctx.beginPath();
  ctx.moveTo(0, -10); ctx.lineTo(8, 8); ctx.lineTo(0, 4); ctx.lineTo(-8, 8);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ============================================================
// Bomb (C4) — куб
// ============================================================
function spawnBombMesh() {
  if (bombMesh) scene.remove(bombMesh);
  const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xaa0000, emissiveIntensity: 0.6 });
  bombMesh = new THREE.Mesh(geo, mat);
  bombMesh.position.set(activeBomb.x, activeBomb.y + 0.3, activeBomb.z);
  bombMesh.castShadow = true;
  scene.add(bombMesh);
}
function startBombTimer() {
  if (bombTimerInterval) clearInterval(bombTimerInterval);
  const el = $('bombTimer');
  el.style.display = 'block';
  const update = () => {
    if (!activeBomb) return;
    const left = Math.max(0, activeBomb.fuseTime - (Date.now() - activeBomb.plantTime));
    el.textContent = '💣 ' + (left / 1000).toFixed(1) + 'с';
    el.style.color = left < 10000 ? '#ff2222' : '#ffaa00';
    if (bombMesh) {
      const scale = 1 + Math.sin(Date.now() / 100) * 0.1 * (1 - left / activeBomb.fuseTime);
      bombMesh.scale.set(scale, scale, scale);
    }
  };
  update();
  bombTimerInterval = setInterval(update, 100);
}
function startPlant() {
  if (me.dead) return;
  if (myTeam !== 'red') { sysChat('⚠️ Бомбу закладывают только КРАСНЫЕ!'); SND.error(); return; }
  if (activeBomb) { sysChat('⚠️ Бомба уже заложена!'); SND.error(); return; }
  if (planting) return;
  planting = true;
  plantStartTime = Date.now();
  netSend({ t: 'startPlant' });
  showPlantProgress();
  sysChat('🔧 Закладываю...');
}
function finishPlant() {
  if (!planting) return;
  planting = false;
  clearInterval(plantProgressInterval); plantProgressInterval = null;
  $('plantProgress').style.display = 'none';
  netSend({ t: 'finishPlant' });
}
function showPlantProgress() {
  const el = $('plantProgress');
  el.style.display = 'block';
  const fill = $('plantProgressFill');
  const label = $('plantProgressLabel');
  fill.style.background = 'linear-gradient(90deg, #f0ad4e, #ff6b00)';
  plantProgressInterval = setInterval(() => {
    if (!planting) return;
    const pct = Math.min(100, ((Date.now() - plantStartTime) / plantDuration) * 100);
    fill.style.width = pct + '%';
    label.textContent = 'ЗАКЛАДКА ' + pct.toFixed(0) + '%';
    if (pct >= 100) finishPlant();
  }, 50);
}
function startDefuse() {
  if (me.dead || !activeBomb) return;
  if (myTeam !== 'blue') { sysChat('⚠️ Разминируют только СИНИЕ!'); SND.error(); return; }
  const dx = me.pos.x - activeBomb.x;
  const dz = me.pos.z - activeBomb.z;
  if (Math.sqrt(dx * dx + dz * dz) > 3) { sysChat('⚠️ Слишком далеко!'); SND.error(); return; }
  if (defusing) return;
  defusing = true;
  defuseStartTime = Date.now();
  netSend({ t: 'startDefuse' });
  showDefuseProgress();
  sysChat('🔧 Разминирую...');
}
function finishDefuse() {
  if (!defusing) return;
  defusing = false;
  clearInterval(defuseProgressInterval); defuseProgressInterval = null;
  $('plantProgress').style.display = 'none';
  netSend({ t: 'finishDefuse' });
}
function showDefuseProgress() {
  const el = $('plantProgress');
  el.style.display = 'block';
  const fill = $('plantProgressFill');
  const label = $('plantProgressLabel');
  fill.style.background = 'linear-gradient(90deg, #22aaff, #00ff88)';
  defuseProgressInterval = setInterval(() => {
    if (!defusing) return;
    const pct = Math.min(100, ((Date.now() - defuseStartTime) / defuseDuration) * 100);
    fill.style.width = pct + '%';
    label.textContent = 'РАЗМИНИРОВАНИЕ ' + pct.toFixed(0) + '%';
    if (pct >= 100) finishDefuse();
  }, 50);
}

// ============================================================
// Mobile
// ============================================================
function initMobileControls() {
  if (mobileInited) return;
  mobileInited = true;
  const zone = $('joystickZone'), knob = $('joystickKnob');
  const fireBtn = $('fireBtn'), reloadBtn = $('reloadBtn'), jumpBtn = $('jumpBtn'), bombBtn = $('bombBtn');
  if (!zone) return;
  let baseCenter = { x: 0, y: 0 };
  const baseRadius = 80;
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    const rect = zone.getBoundingClientRect();
    baseCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    joystickActive = true;
    updateJoystick(t.clientX, t.clientY, baseCenter, baseRadius, knob);
  }, { passive: false });
  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!joystickActive) return;
    updateJoystick(e.touches[0].clientX, e.touches[0].clientY, baseCenter, baseRadius, knob);
  }, { passive: false });
  zone.addEventListener('touchend', e => {
    e.preventDefault();
    joystickActive = false;
    joystickVector = { x: 0, y: 0 };
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
  });
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (t.clientX > window.innerWidth / 2 && !touchLookId) {
      touchLookId = t.identifier;
      touchLookLast = { x: t.clientX, y: t.clientY };
    }
  }, { passive: false });
  document.addEventListener('touchmove', e => {
    for (const t of e.touches) {
      if (t.identifier === touchLookId) {
        const dx = t.clientX - touchLookLast.x;
        const dy = t.clientY - touchLookLast.y;
        touchLookLast = { x: t.clientX, y: t.clientY };
        me.ry -= dx * 0.005 * SETTINGS.sensitivity;
        me.rx -= dy * 0.005 * SETTINGS.sensitivity;
        me.rx = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, me.rx));
      }
    }
  }, { passive: false });
  document.addEventListener('touchend', e => {
    for (const t of e.changedTouches) if (t.identifier === touchLookId) touchLookId = null;
  });
  if (fireBtn) fireBtn.addEventListener('touchstart', e => { e.preventDefault(); mouseDown = true; tryShoot(performance.now()); });
  if (fireBtn) fireBtn.addEventListener('touchend', e => { e.preventDefault(); mouseDown = false; });
  if (reloadBtn) reloadBtn.addEventListener('touchstart', e => { e.preventDefault(); startReload(); });
  if (jumpBtn) jumpBtn.addEventListener('touchstart', e => { e.preventDefault(); keys['Space'] = true; setTimeout(() => keys['Space'] = false, 100); });
  if (bombBtn) bombBtn.addEventListener('touchstart', e => {
    e.preventDefault();
    if (activeBomb) startDefuse();
    else if (!planting) startPlant();
  });
}
function updateJoystick(tx, ty, center, radius, knob) {
  let dx = tx - center.x, dy = ty - center.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > radius) { dx = dx / dist * radius; dy = dy / dist * radius; }
  if (knob) knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
  joystickVector.x = dx / radius;
  joystickVector.y = dy / radius;
}

// ============================================================
// Input
// ============================================================
function setupInput() {
  const canvas = renderer.domElement;
  document.addEventListener('keydown', e => {
    if (!inGame) return;
    if (chatOpen) {
      if (e.code === 'Escape') closeChat();
      if (e.code === 'Enter') {
        const text = $('chatInput').value.trim();
        if (text) netSend({ t: 'chat', text: text });
        closeChat();
      }
      return;
    }
    if (cheatsMenuOpen) {
      if (e.code === 'ControlRight' || e.code === 'Escape') { e.preventDefault(); closeCheatMenu(); return; }
      return;
    }
    if (buyMenuOpen) {
      if (e.code === 'KeyB' || e.code === 'Escape') { e.preventDefault(); closeBuyMenu(); return; }
      const map = { Digit1: 'rifle', Digit2: 'shotgun', Digit3: 'sniper', Digit4: 'deagle', Digit5: 'armor', Digit6: 'he', Digit7: 'flash', Digit8: 'smoke' };
      if (map[e.code]) { e.preventDefault(); buyItem(map[e.code]); }
      return;
    }
    if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); openChat(); return; }
    if (e.code === 'KeyV' && !e.repeat) setTalking(true);
    if (e.code === 'KeyB') { e.preventDefault(); openBuyMenu(); return; }
    if (e.code === 'ControlRight' && isCheater) { e.preventDefault(); openCheatMenu(); return; }
    keys[e.code] = true;
    if (e.code === 'Tab') { e.preventDefault(); tabHeld = true; updateScoreboard(); }
    if (e.code === 'KeyR') startReload();
    if (/^Digit[1-9]$/.test(e.code)) selectSlot(parseInt(e.code[5]) - 1);
    if (e.code === 'KeyM') { SETTINGS.radar = !SETTINGS.radar; saveSettings(); }
    if (e.code === 'KeyE' && !e.repeat) {
      if (activeBomb) startDefuse();
      else if (!planting) startPlant();
    }
    if (e.code === 'KeyG' && !e.repeat) { e.preventDefault(); startThrowGrenade('he'); }
    if (e.code === 'KeyF' && !e.repeat) { e.preventDefault(); startThrowGrenade('flash'); }
    if (e.code === 'KeyC' && !e.repeat) { e.preventDefault(); startThrowGrenade('smoke'); }
    if (isCheater) {
      if (e.code === 'KeyX') { e.preventDefault(); toggleCheat('aimbot'); }
      if (e.code === 'KeyZ') { e.preventDefault(); toggleCheat('wallhack'); }
      if (e.code === 'KeyN') { e.preventDefault(); toggleCheat('noclip'); }
      if (e.code === 'KeyH') { e.preventDefault(); toggleCheat('infiniteHp'); }
      if (e.code === 'KeyJ') { e.preventDefault(); toggleCheat('chams'); }
      if (e.code === 'KeyL') { e.preventDefault(); toggleCheat('fullBright'); }
      if (e.code === 'KeyK') { e.preventDefault(); toggleCheat('oneShot'); }
      if (e.code === 'KeyU') { e.preventDefault(); toggleCheat('infiniteAmmo'); }
      if (e.code === 'KeyI') { e.preventDefault(); toggleCheat('rapidFire'); }
      if (e.code === 'KeyO') { e.preventDefault(); toggleCheat('freeBuy'); updateMoneyHud(); }
      if (e.code === 'KeyP') { e.preventDefault(); toggleCheat('autoHeadshot'); }
      if (e.code === 'KeyY') { e.preventDefault(); teleportToEnemy(); }
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'KeyV') setTalking(false);
    if (chatOpen) return;
    keys[e.code] = false;
    if (e.code === 'Tab') { tabHeld = false; updateScoreboard(); }
    if ((e.code === 'KeyG' || e.code === 'KeyF' || e.code === 'KeyC') && throwing) {
      releaseThrowGrenade();
    }
  });
  document.addEventListener('mousemove', e => {
    if (!locked || me.dead || buyMenuOpen || cheatsMenuOpen) return;
    if (cheats.aimbot && isCheater) return;
    me.ry -= e.movementX * 0.0023 * SETTINGS.sensitivity;
    me.rx -= e.movementY * 0.0023 * SETTINGS.sensitivity * (me.zoomed ? 0.5 : 1);
    me.rx = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, me.rx));
  });
  document.addEventListener('mousedown', e => {
    if (!inGame || chatOpen || buyMenuOpen || cheatsMenuOpen) return;
    if (!locked) { canvas.requestPointerLock(); return; }
    if (e.button === 0) { mouseDown = true; tryShoot(performance.now()); }
    else if (e.button === 2) { me.zoomed = !me.zoomed; }
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (inGame && !buyMenuOpen && !cheatsMenuOpen) {
      $('pauseHint').style.display = locked ? 'none' : 'flex';
      $('teamBanner').style.display = 'none';
    }
    if (!locked) { mouseDown = false; Object.keys(keys).forEach(k => keys[k] = false); }
  });
  $('resumeBtn').addEventListener('click', () => canvas.requestPointerLock());
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  document.querySelectorAll('#buyMenu .buyItem').forEach(el => {
    el.addEventListener('click', () => buyItem(el.dataset.item));
  });
  document.querySelectorAll('#cheatMenu .cheatItem').forEach(el => {
    el.addEventListener('click', () => toggleCheat(el.dataset.cheat));
  });
  $('cheatMenuClose').addEventListener('click', closeCheatMenu);
  $('cheatMenuBtn').addEventListener('click', openCheatMenu);
  document.querySelectorAll('#modeSelect button').forEach(b => {
    b.addEventListener('click', () => {
      if (!isCheater) return;
      netSend({ t: 'setMode', mode: b.dataset.mode });
    });
  });
  document.querySelectorAll('#playModal .modeCard').forEach(el => {
    el.addEventListener('click', () => {
      selectedMode = el.dataset.mode;
      updateModalUI();
    });
  });
  $('modalCancel').addEventListener('click', closePlayModal);
  $('modalPlay').addEventListener('click', connectAndPlay);
  $('createLobbyBtn').addEventListener('click', createLobby);
  $('quickPlayBtn2').addEventListener('click', () => { closePlayModal(); connectAndPlay(); });
  $('joinLobbyBtn').addEventListener('click', () => {
    const code = $('lobbyCodeInput').value.trim();
    if (code) joinLobbyByCode(code);
  });
  $('addFriendBtn').addEventListener('click', () => {
    const name = $('friendNameInput').value.trim();
    if (name) { addFriendByName(name); $('friendNameInput').value = ''; }
  });
  $('lobbyCodeInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') joinLobbyByCode(e.target.value);
  });
}
function setTalking(on) {
  $('voiceInd').style.display = on ? 'flex' : 'none';
}

// ============================================================
// Scene + загрузка Dust 2 с GitHub Releases
// ============================================================
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 200, 800);
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2000);
  scene.add(camera);
  renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: SETTINGS.quality === 'high' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(SETTINGS.quality === 'low' ? 1 : Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = SETTINGS.quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.6);
  sun.position.set(400, 700, 250);
  sun.castShadow = SETTINGS.quality !== 'low';
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -500; sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500; sun.shadow.camera.bottom = -500;
  sun.shadow.camera.far = 2000;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  faceTex = makeFaceTexture();
  
  // Загружаем GLB-карту Dust 2 с GitHub Releases
  loadDust2Map(scene, (map) => {
    dust2Map = map;
    console.log('✅ Карта Dust 2 готова к игре');
    if (myTeam === 'red') {
      me.pos.set(0, 64, 2000);
    } else {
      me.pos.set(0, 64, -1000);
    }
    camera.position.copy(me.pos);
  });
}
function startGame() {
  inGame = true;
  $('menu').style.display = 'none';
  $('authScreen').style.display = 'none';
  $('settings').style.display = 'none';
  $('playModal').classList.remove('active');
  $('hud').style.display = 'block';
  $('teamBanner').style.display = 'flex';
  const t = $('teamBannerText');
  t.textContent = 'КОМАНДА ' + TEAM_RU[myTeam];
  t.style.color = TEAM_COL[myTeam];
  setTimeout(() => { $('teamBanner').style.display = 'none'; }, 2500);
  buildViewModels();
  loadWeaponModels();
  updateHealthHud(); updateMoneyHud(); updateHotbar(); updateAmmoHud();
  updateMatchScoreHud(); updateTimerHud(); updateGrenadeHud();
  if (isCheater) {
    $('cheatPanel').style.display = 'flex';
    $('cheatMenuBtn').style.display = 'block';
    $('modeSelect').style.display = 'flex';
    updateCheatPanel();
  } else {
    $('cheatPanel').style.display = 'none';
    $('cheatMenuBtn').style.display = 'none';
    $('modeSelect').style.display = 'none';
  }
  if (SETTINGS.mobile) initMobileControls();
  SND.spawn();
  renderer.domElement.requestPointerLock();
}

// ============================================================
// Main loop
// ============================================================
let lastNetSend = 0, lastAnim = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now();
  if (inGame) {
    let moving = 0;
    if (!me.dead && locked && !buyMenuOpen && !cheatsMenuOpen) {
      moving = movePlayer(dt);
      lastAnim = moving;
      const w = currentWeapon();
      if (mouseDown && w.auto && !planting && !defusing) tryShoot(now);
      runAimbot();
    } else if (!me.dead) {
      me.vel.x = me.vel.z = 0;
    }
    camera.rotation.order = 'YXZ';
    camera.rotation.y = me.ry;
    camera.rotation.x = me.rx;
    camera.position.set(me.pos.x, me.pos.y + EYE, me.pos.z);
    const targetFov = me.zoomed ? (SLOTS[me.slot] === 'sniper' ? 22 : 55)
      : ((keys['ShiftLeft'] || keys['ShiftRight']) && moving ? 76 : 70);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    updateRemotes(dt);
    updateFx(dt);
    updateGrenadesClient(dt);
    updateViewModel(dt, moving > 0);
    updateWallhack();
    if (tabHeld) updateScoreboard();
    if (SETTINGS.radar) updateRadar();
    if (SETTINGS.showFps) {
      fpsFrames++;
      if (now - fpsLast >= 500) {
        $('fpsCounter').textContent = 'FPS: ' + Math.round(fpsFrames / ((now - fpsLast) / 1000));
        fpsFrames = 0; fpsLast = now;
      }
    }
    if (now - lastNetSend > 50 && !me.dead) {
      lastNetSend = now;
      netSend({
        t: 'state',
        pos: { x: +me.pos.x.toFixed(3), y: +me.pos.y.toFixed(3), z: +me.pos.z.toFixed(3) },
        ry: +me.ry.toFixed(3), rx: +me.rx.toFixed(3), anim: +lastAnim.toFixed(2),
      });
    }
  }
  renderer.render(scene, camera);
}

// ============================================================
// START
// ============================================================
window.acceptFriend = acceptFriend;
window.declineFriend = declineFriend;
window.inviteFriend = inviteFriend;
window.acceptLobbyInvite = acceptLobbyInvite;

loadSettings();
setupAuth();
setupMenu();
initScene();
setupInput();
clock = new THREE.Clock();
loop();
