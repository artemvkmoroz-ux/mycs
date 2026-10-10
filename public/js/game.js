import * as THREE from 'three';
import { buildTextures, buildMaterials } from './textures.js';
import { buildMapBlocks, HALF } from './map.js';

// ============================================================
// Constants
// ============================================================
const EYE = 1.62, P_HALF = 0.3, P_HEIGHT = 1.8;
const GRAVITY = 23, JUMP_V = 8.6, WALK = 5.8, SPRINT = 8.4;

const WEAPONS = {
  rifle:   { name: 'АВТОМАТ',  dmg: 18, rate: 110,  mag: 30, reload: 1800, spread: 0.014, auto: true,  pellets: 1, range: 90 },
  shotgun: { name: 'ДРОБОВИК', dmg: 9,  rate: 850,  mag: 6,  reload: 2200, spread: 0.06,  auto: false, pellets: 8, range: 32 },
  sniper:  { name: 'ВИНТОВКА', dmg: 70, rate: 1400, mag: 5,  reload: 2400, spread: 0.002, auto: false, pellets: 1, range: 140 },
};
const SLOTS = ['rifle', 'shotgun', 'sniper'];
const TEAM_RU = { red: 'КРАСНЫХ', blue: 'СИНИХ' };
const TEAM_COL = { red: '#ff5555', blue: '#7f9fff' };

// ============================================================
// НАСТРОЙКИ
// ============================================================
const SETTINGS = {
  mobile: false,
  radar: false,
  showFps: false,
  sensitivity: 2.0,
  volume: 0.5,
  quality: 'medium',
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('blockade_settings') || '{}');
    Object.assign(SETTINGS, saved);
  } catch {}
  applySettings();
}

function saveSettings() {
  localStorage.setItem('blockade_settings', JSON.stringify(SETTINGS));
  applySettings();
}

function applySettings() {
  document.getElementById('toggleMobile')?.classList.toggle('active', SETTINGS.mobile);
  document.getElementById('toggleRadar')?.classList.toggle('active', SETTINGS.radar);
  document.getElementById('toggleFps')?.classList.toggle('active', SETTINGS.showFps);
  const s = document.getElementById('sensRange');
  if (s) { s.value = SETTINGS.sensitivity; const sv = document.getElementById('sensVal'); if (sv) sv.textContent = SETTINGS.sensitivity.toFixed(1); }
  const v = document.getElementById('volRange');
  if (v) { v.value = Math.round(SETTINGS.volume * 100); const vv = document.getElementById('volVal'); if (vv) vv.textContent = Math.round(SETTINGS.volume * 100) + '%'; }
  const q = document.getElementById('qualitySelect');
  if (q) q.value = SETTINGS.quality;

  document.getElementById('mobileControls')?.classList.toggle('active', SETTINGS.mobile);
  const radarEl = document.getElementById('radar');
  if (radarEl) radarEl.style.display = SETTINGS.radar ? 'block' : 'none';
  const fpsEl = document.getElementById('fpsCounter');
  if (fpsEl) fpsEl.style.display = SETTINGS.showFps ? 'block' : 'none';
}

// ============================================================
// Globals
// ============================================================
let scene, camera, renderer, clock;
let tex, mats;
const collision = new Set();
const placedMeshes = new Map();
const mapBlockIndex = new Map();
let ws = null, myId = -1, myTeam = 'red', myName = '';
const remotes = new Map();
const scores = { red: 0, blue: 0 };

const me = {
  pos: new THREE.Vector3(0, 1.05, 0),
  vel: new THREE.Vector3(),
  ry: 0, rx: 0,
  onGround: false,
  hp: 100, dead: false,
  kills: 0, deaths: 0,
  slot: 0,
  ammo: { rifle: 30, shotgun: 6, sniper: 5 },
  blocks: 64,
  reloading: false, reloadEnd: 0,
  lastShot: 0,
  zoomed: false,
};

const keys = {};
let mouseDown = false;
let locked = false;
let inGame = false;
let tabHeld = false;
let chatOpen = false;

const tracers = [], particles = [];

// ============ БОМБА ============
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

// ============ ЧИТЫ ============
let isCheater = false;
let aimbotOn = false;
let wallhackOn = false;
const cheatESP = new Map();

// ============ FPS ============
let fpsFrames = 0, fpsLast = performance.now();

// ============ МОБИЛЬНОЕ УПРАВЛЕНИЕ ============
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
function noiseBurst(dur, freq, vol, type = 'lowpass') {
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
  } catch {}
}
function tone(freq, dur, vol, type = 'square', slide = 0) {
  try {
    const ctx = ac();
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.value = vol * SETTINGS.volume * 2;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch {}
}
const SND = {
  shot: (w, vol = 0.22) => {
    if (w === 'rifle') { noiseBurst(0.09, 1800, vol); tone(160, 0.06, vol * 0.5, 'square', -90); }
    else if (w === 'shotgun') { noiseBurst(0.22, 900, vol * 1.4); tone(90, 0.13, vol * 0.7, 'square', -50); }
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
  boom: (vol = 0.5) => { noiseBurst(0.7, 250, vol); tone(70, 0.5, vol * 0.8, 'sawtooth', -40); },
  spawn: () => { tone(520, 0.08, 0.12, 'square'); setTimeout(() => tone(780, 0.1, 0.12, 'square'), 90); },
  kill: () => { tone(660, 0.07, 0.14, 'square'); setTimeout(() => tone(880, 0.07, 0.14, 'square'), 70); setTimeout(() => tone(1100, 0.1, 0.14, 'square'), 140); },
  win: () => { tone(660, 0.15, 0.2, 'square'); setTimeout(() => tone(880, 0.15, 0.2, 'square'), 150); setTimeout(() => tone(1100, 0.35, 0.2, 'square'), 300); },
  lose: () => { tone(440, 0.2, 0.18, 'sawtooth', -100); setTimeout(() => tone(330, 0.35, 0.18, 'sawtooth', -100), 200); },
};

// ============================================================
// Menu / Auth
// ============================================================
function dirtBackground() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  const cols = ['#5a3f29', '#523a25', '#62452d', '#4a3421'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
    g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, 16, 16);
  const menuEl = document.getElementById('menu');
  if (menuEl) menuEl.style.backgroundImage = `url(${c.toDataURL()})`;
}

const $ = id => document.getElementById(id);

function setupAuth() {
  const nameInput = $('regName');
  const passInput = $('regPassword');
  const btn = $('regBtn');
  const err = $('authErr');

  nameInput.value = localStorage.getItem('blockade_name') || '';
  passInput.value = localStorage.getItem('blockade_password') || '';
  nameInput.focus();

  const start = () => {
    const name = nameInput.value.trim();
    const pass = passInput.value.trim();
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
  $('menu').style.display = 'flex';
  $('menuNickText').textContent = name;
  $('playBtn').disabled = false;
}

function showAuth() {
  $('authScreen').style.display = 'flex';
  $('menu').style.display = 'none';
  $('settings').style.display = 'none';
}

function setupMenu() {
  dirtBackground();
  const btn = $('playBtn'), err = $('menuErr');

  btn.addEventListener('click', () => {
    const name = $('menuNickText').textContent;
    const pass = $('regPassword').value.trim() || localStorage.getItem('blockade_password') || '';
    if (name === '—' || !name) { err.textContent = 'Введи ник!'; return; }
    if (!pass) { err.textContent = 'Введи пароль!'; return; }
    err.textContent = '';
    btn.disabled = true;
    connect(name, pass);
  });

  $('logoutBtn').addEventListener('click', () => {
    showAuth();
  });

  $('settingsBtn').addEventListener('click', () => {
    $('menu').style.display = 'none';
    $('settings').style.display = 'flex';
    applySettings();
  });

  $('settingsBack').addEventListener('click', () => {
    $('settings').style.display = 'none';
    $('menu').style.display = 'flex';
  });

  // Переключатели в настройках
  $('toggleMobile').addEventListener('click', () => { SETTINGS.mobile = !SETTINGS.mobile; saveSettings(); if (SETTINGS.mobile && inGame && !mobileInited) initMobileControls(); });
  $('toggleRadar').addEventListener('click', () => { SETTINGS.radar = !SETTINGS.radar; saveSettings(); });
  $('toggleFps').addEventListener('click', () => { SETTINGS.showFps = !SETTINGS.showFps; saveSettings(); });
  $('sensRange').addEventListener('input', e => { SETTINGS.sensitivity = parseFloat(e.target.value); saveSettings(); });
  $('volRange').addEventListener('input', e => { SETTINGS.volume = parseInt(e.target.value) / 100; saveSettings(); });
  $('qualitySelect').addEventListener('change', e => { SETTINGS.quality = e.target.value; saveSettings(); });
}

// ============================================================
// Networking
// ============================================================
function connect(name, password) {
  myName = name;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, password }));
  ws.onerror = () => { $('menuErr').textContent = 'Ошибка подключения к серверу'; $('playBtn').disabled = false; };
  ws.onclose = () => {
    if (inGame) {
      inGame = false;
      closeChat();
      closeAllVoice();
      document.exitPointerLock();
      $('hud').style.display = 'none';
      $('menu').style.display = 'flex';
      $('menuErr').textContent = 'Соединение потеряно. Заходи снова!';
      $('playBtn').disabled = false;
    }
  };
  ws.onmessage = e => handleMsg(JSON.parse(e.data));
}

function netSend(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function handleMsg(m) {
  switch (m.t) {
    case 'authFailed': {
      $('authErr').textContent = m.reason || 'Ошибка авторизации';
      $('menuErr').textContent = m.reason || 'Ошибка авторизации';
      $('playBtn').disabled = false;
      showAuth();
      break;
    }
    case 'welcome': {
      myId = m.id; myTeam = m.team;
      isCheater = !!m.cheater;
      me.pos.set(m.pos.x, m.pos.y, m.pos.z);
      me.ry = m.ry; me.rx = 0;
      Object.assign(scores, m.scores);
      for (const p of m.players) addRemote(p);
      for (const d of m.destroyed || []) removeBlockLocal(d.x, d.y, d.z, true);
      for (const b of m.placed) placeBlockLocal(b.x, b.y, b.z, b.team);
      if (m.bomb) {
        activeBomb = m.bomb;
        spawnBombMesh();
        startBombTimer();
      }
      startGame();
      initVoice();
      if (SETTINGS.mobile) initMobileControls();
      break;
    }
    case 'join': addRemote(m.p); feed(`${m.p.name} зашёл в игру`, m.p.team); break;
    case 'leave': {
      const r = remotes.get(m.id);
      if (r) { feed(`${r.name} вышел`, r.team); scene.remove(r.group); remotes.delete(m.id); }
      closeVoicePeer(m.id);
      break;
    }
    case 'states':
      for (const s of m.states) {
        if (s.id === myId) continue;
        const r = remotes.get(s.id);
        if (!r) continue;
        r.target.set(s.pos.x, s.pos.y, s.pos.z);
        r.try = s.ry; r.trx = s.rx; r.anim = s.anim || 0; r.hp = s.hp;
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
    case 'hp': {
      me.hp = m.hp;
      updateHearts();
      SND.hurt();
      const v = $('dmgVignette');
      v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 120);
      break;
    }
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
      feed(`${kName} ${m.head ? '[в голову] ' : ''}► ${vName}`, kTeam, vTeam);
      if (victim) {
        victim.alive = false; victim.deaths++;
        deathBurst(victim.group.position);
        victim.group.visible = false;
      }
      if (killer) killer.kills++;
      if (m.victim === myId) {
        me.hp = 0; me.dead = true; me.deaths++;
        updateHearts();
        SND.death();
        showDeathScreen(kName);
      }
      if (m.killer === myId) { me.kills++; SND.kill(); }
      break;
    }
    case 'respawn': {
      if (m.id === myId) {
        me.pos.set(m.pos.x, m.pos.y, m.pos.z);
        me.vel.set(0, 0, 0);
        me.hp = 100; me.dead = false;
        me.ammo = { rifle: 30, shotgun: 6, sniper: 5 };
        me.blocks = 64; me.reloading = false;
        me.ry = myTeam === 'red' ? -Math.PI / 2 : Math.PI / 2; me.rx = 0;
        updateHearts(); updateAmmoHud(); updateHotbar();
        $('deathScreen').style.display = 'none';
        const f = $('respawnFlash');
        f.style.opacity = 0.8; f.style.transition = 'none';
        requestAnimationFrame(() => { f.style.transition = 'opacity .6s'; f.style.opacity = 0; });
        SND.spawn();
      } else {
        const r = remotes.get(m.id);
        if (r) {
          r.alive = true; r.hp = 100;
          r.group.position.set(m.pos.x, m.pos.y, m.pos.z);
          r.target.set(m.pos.x, m.pos.y, m.pos.z);
          r.group.visible = true;
        }
      }
      break;
    }
    case 'place': placeBlockLocal(m.x, m.y, m.z, m.team); break;
    case 'destroy': removeBlockLocal(m.x, m.y, m.z); break;
    case 'rtc': handleRtcSignal(m.from, m.data); break;
    case 'scores':
      Object.assign(scores, m.scores);
      $('scoreRed').textContent = scores.red;
      $('scoreBlue').textContent = scores.blue;
      break;
    case 'chat': addChatMessage(m.name, m.team, m.text); break;

    case 'plantStarted': { plantDuration = m.duration || 3000; break; }
    case 'plantCancelled': {
      planting = false;
      clearInterval(plantProgressInterval); plantProgressInterval = null;
      $('plantProgress').style.display = 'none';
      sysChat('❌ Закладка отменена');
      break;
    }
    case 'bombPlanted': {
      activeBomb = m.bomb;
      spawnBombMesh();
      startBombTimer();
      sysChat('💣 БОМБА ЗАЛОЖЕНА!');
      tone(220, 0.5, 0.3, 'sawtooth', -100);
      break;
    }
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
    case 'bombDefused': {
      if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }
      activeBomb = null;
      if (bombTimerInterval) { clearInterval(bombTimerInterval); bombTimerInterval = null; }
      $('bombTimer').style.display = 'none';
      sysChat('🔧 БОМБА РАЗМИНИРОВАНА!');
      tone(660, 0.1, 0.15, 'square');
      setTimeout(() => tone(880, 0.15, 0.15, 'square'), 100);
      break;
    }
    case 'bombError': { sysChat('⚠️ ' + m.text); break; }
    case 'defuseStarted': { defuseDuration = m.duration || 5000; break; }
    case 'defuseCancelled': {
      defusing = false;
      clearInterval(defuseProgressInterval); defuseProgressInterval = null;
      $('plantProgress').style.display = 'none';
      break;
    }
    case 'roundWin': {
      const win = $('roundWin');
      win.className = m.team;
      $('roundWinText').textContent = m.team === 'red' ? 'КРАСНЫЕ ПОБЕДИЛИ!' : 'СИНИЕ ПОБЕДИЛИ!';
      $('roundWinSub').textContent = m.reason === 'bomb' ? 'Бомба взорвалась' : 'Бомба разминирована';
      win.style.display = 'flex';
      if (m.team === myTeam) SND.win(); else SND.lose();
      setTimeout(() => { win.style.display = 'none'; }, 4000);
      break;
    }
    case 'newRound': { sysChat('🔄 Новый раунд!'); break; }
  }
}

// ============================================================
// Chat
// ============================================================
function addChatMessage(name, team, text) {
  const box = $('chatMessages');
  const div = document.createElement('div');
  const nick = document.createElement('span');
  nick.className = `nick ${team === 'red' ? 'r' : 'b'}`;
  nick.textContent = name;
  div.appendChild(nick);
  div.appendChild(document.createTextNode(`: ${text}`));
  box.appendChild(div);
  while (box.children.length > 8) box.firstChild.remove();
  setTimeout(() => { div.style.opacity = 0; setTimeout(() => div.remove(), 600); }, 9000);
}

function openChat() {
  chatOpen = true;
  const input = $('chatInput');
  input.style.display = 'block';
  input.value = '';
  input.focus();
  Object.keys(keys).forEach(k => keys[k] = false);
  mouseDown = false;
}

function closeChat() {
  chatOpen = false;
  const input = $('chatInput');
  input.style.display = 'none';
  input.blur();
}

function sysChat(text) {
  const box = $('chatMessages');
  const div = document.createElement('div');
  div.className = 'sys';
  div.textContent = text;
  box.appendChild(div);
  while (box.children.length > 8) box.firstChild.remove();
  setTimeout(() => { div.style.opacity = 0; setTimeout(() => div.remove(), 600); }, 9000);
}

// ============================================================
// Voice
// ============================================================
const voicePeers = new Map();
let micStream = null, micTrack = null, voiceFailed = false;

async function initVoice() {
  if (!micStream && !voiceFailed) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micTrack = micStream.getAudioTracks()[0];
      micTrack.enabled = false;
      sysChat('Голосовой чат включён — зажми V');
    } catch {
      voiceFailed = true;
    }
  }
  for (const id of remotes.keys()) makeVoicePeer(id, true);
}

function makeVoicePeer(id, initiator) {
  let p = voicePeers.get(id);
  if (p) return p;
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const audio = new Audio();
  audio.autoplay = true;
  p = { pc, audio, pendingIce: [] };
  voicePeers.set(id, p);
  if (micStream) for (const tr of micStream.getTracks()) pc.addTrack(tr, micStream);
  else pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.onicecandidate = e => { if (e.candidate) netSend({ t: 'rtc', to: id, data: { ice: e.candidate } }); };
  pc.ontrack = e => { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); };
  if (initiator) {
    pc.createOffer()
      .then(o => pc.setLocalDescription(o))
      .then(() => netSend({ t: 'rtc', to: id, data: { sdp: pc.localDescription } }))
      .catch(() => {});
  }
  return p;
}

async function handleRtcSignal(from, data) {
  if (!data) return;
  try {
    const p = makeVoicePeer(from, false);
    const pc = p.pc;
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      for (const c of p.pendingIce) await pc.addIceCandidate(c).catch(() => {});
      p.pendingIce.length = 0;
      if (data.sdp.type === 'offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        netSend({ t: 'rtc', to: from, data: { sdp: pc.localDescription } });
      }
    } else if (data.ice) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.ice).catch(() => {});
      else p.pendingIce.push(data.ice);
    }
  } catch {}
}

function closeVoicePeer(id) {
  const p = voicePeers.get(id);
  if (!p) return;
  try { p.pc.close(); } catch {}
  p.audio.srcObject = null;
  voicePeers.delete(id);
}

function closeAllVoice() {
  for (const id of [...voicePeers.keys()]) closeVoicePeer(id);
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null; micTrack = null;
  }
  setTalking(false);
}

function setTalking(on) {
  if (!micTrack) on = false;
  if (micTrack) micTrack.enabled = on;
  $('voiceInd').style.display = on ? 'flex' : 'none';
}

// ============================================================
// World
// ============================================================
function buildWorld() {
  const blocks = buildMapBlocks();
  const byType = {};
  for (const b of blocks) {
    (byType[b.type] ||= []).push(b);
    collision.add(`${b.x},${b.y},${b.z}`);
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const m4 = new THREE.Matrix4();
  for (const [type, list] of Object.entries(byType)) {
    const mesh = new THREE.InstancedMesh(geo, mats[type], list.length);
    list.forEach((b, i) => {
      m4.makeTranslation(b.x + 0.5, b.y + 0.5, b.z + 0.5);
      mesh.setMatrixAt(i, m4);
      mapBlockIndex.set(`${b.x},${b.y},${b.z}`, { mesh, i });
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function placeBlockLocal(x, y, z, team) {
  const k = `${x},${y},${z}`;
  if (collision.has(k)) return;
  collision.add(k);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats[team === 'red' ? 'redWool' : 'blueWool']);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  placedMeshes.set(k, mesh);
  SND.place();
}

const ZERO_M4 = new THREE.Matrix4().makeScale(0, 0, 0);

function removeBlockLocal(x, y, z, silent) {
  const k = `${x},${y},${z}`;
  if (!collision.has(k)) return;
  const mesh = placedMeshes.get(k);
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    placedMeshes.delete(k);
  } else {
    const mi = mapBlockIndex.get(k);
    if (!mi) return;
    mi.mesh.setMatrixAt(mi.i, ZERO_M4);
    mi.mesh.instanceMatrix.needsUpdate = true;
  }
  collision.delete(k);
  if (!silent) {
    debrisBurst(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
    SND.brk();
  }
}

const solid = (x, y, z) => collision.has(`${x},${y},${z}`);

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
  g.fillStyle = '#a8674a'; g.fillRect(3, 5, 2, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let faceTex = null;

function makeNameSprite(name, team) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = '28px monospace';
  const w = Math.max(64, g.measureText(name).width + 24);
  c.width = w; c.height = 44;
  const g2 = c.getContext('2d');
  g2.fillStyle = 'rgba(0,0,0,0.45)'; g2.fillRect(0, 0, w, 44);
  g2.font = 'bold 28px monospace';
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
  group.userData = { head, armL, armR, legL, legR, gun };
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
    id: p.id, name: p.name, team: p.team, group,
    target: new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z),
    try: p.ry, trx: p.rx || 0, anim: 0, phase: 0,
    alive: p.alive, hp: p.hp, kills: p.kills || 0, deaths: p.deaths || 0,
    shootAnim: 0,
  });
}

function updateRemotes(dt) {
  const k = Math.min(1, dt * 14);
  for (const r of remotes.values()) {
    const vp = voicePeers.get(r.id);
    if (vp) vp.audio.volume = Math.max(0.15, Math.min(1, 1.25 - r.group.position.distanceTo(me.pos) / 50)) * SETTINGS.volume * 2;
    if (!r.alive) continue;
    r.group.position.lerp(r.target, k);
    let dy = (r.try + Math.PI) - r.group.rotation.y;
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    r.group.rotation.y += dy * k;
    const u = r.group.userData;
    u.head.rotation.x = -(r.trx || 0);
    r.phase += dt * (4 + r.anim * 9);
    const swing = Math.sin(r.phase) * Math.min(0.7, r.anim * 0.9);
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = r.shootAnim > 0 ? -1.35 : swing * 0.7 - 0.6;
    if (r.shootAnim > 0) r.shootAnim -= dt;
  }
}

// ============================================================
// ЧИТЫ
// ============================================================
function setupCheats() {
  if (!isCheater) { $('cheatPanel').style.display = 'none'; return; }
  $('cheatPanel').style.display = 'flex';
  console.log('🔥 ЧИТ-ПАНЕЛЬ АКТИВНА (moroz)');
  sysChat('🔥 ЧИТ-ПАНЕЛЬ: X — aimbot, Z — wallhack');
}

function toggleAimbot() {
  if (!isCheater) return;
  aimbotOn = !aimbotOn;
  $('cheatAimVal').textContent = aimbotOn ? 'ON' : 'OFF';
  $('cheatAim').classList.toggle('active', aimbotOn);
  sysChat(aimbotOn ? '🎯 Aimbot ВКЛ' : '🎯 Aimbot ВЫКЛ');
}

function toggleWallhack() {
  if (!isCheater) return;
  wallhackOn = !wallhackOn;
  $('cheatWallVal').textContent = wallhackOn ? 'ON' : 'OFF';
  $('cheatWall').classList.toggle('active', wallhackOn);
  sysChat(wallhackOn ? '👁 Wallhack ВКЛ' : '👁 Wallhack ВЫКЛ');
  if (!wallhackOn) {
    for (const esp of cheatESP.values()) scene.remove(esp);
    cheatESP.clear();
  }
}

function runAimbot() {
  if (!aimbotOn || !isCheater) return;
  let best = null, bestDist = Infinity;
  for (const r of remotes.values()) {
    if (!r.alive || r.team === myTeam) continue;
    const d = r.group.position.distanceTo(me.pos);
    if (d < bestDist) { bestDist = d; best = r; }
  }
  if (!best) return;
  const target = best.group.position.clone();
  target.y += 1.2;
  const dx = target.x - me.pos.x;
  const dy = target.y - (me.pos.y + EYE);
  const dz = target.z - me.pos.z;
  me.ry = Math.atan2(-dx, -dz);
  me.rx = Math.atan2(dy, Math.sqrt(dx*dx + dz*dz));
}

function updateWallhack() {
  if (!isCheater) return;
  if (!wallhackOn) {
    for (const m of cheatESP.values()) scene.remove(m);
    cheatESP.clear();
    return;
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
      const geo = new THREE.BoxGeometry(1.2, 2.6, 1.2);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.9, depthTest: false });
      esp = new THREE.Mesh(geo, mat);
      esp.renderOrder = 999;
      scene.add(esp);
      cheatESP.set(r.id, esp);
    }
    esp.position.copy(r.group.position);
    esp.position.y += 0.9;
  }
  for (const id of [...cheatESP.keys()]) {
    if (!alive.has(id)) { scene.remove(cheatESP.get(id)); cheatESP.delete(id); }
  }
}

// ============================================================
// Physics
// ============================================================
function collideAxis(pos) {
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
  // Мобильный джойстик
  if (SETTINGS.mobile && joystickActive) {
    const speed = SPRINT;
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
    const speed = sprint ? SPRINT : WALK;
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

  me.vel.y -= GRAVITY * dt;
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
  if (p.y < -10) { p.set(myTeam === 'red' ? -28 : 28, 1.05, 0); me.vel.set(0, 0, 0); }
  return (Math.abs(me.vel.x) + Math.abs(me.vel.z)) > 0.5 ? 0.6 : 0;
}

// ============================================================
// Raycasting
// ============================================================
function raycastVoxels(o, d, maxDist) {
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
    if (solid(x, y, z)) return { x, y, z, dist: t, normal };
  }
  return null;
}

function rayAABB(o, d, min, max) {
  let tmin = 0, tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    if (Math.abs(d[ax]) < 1e-9) {
      if (o[ax] < min[ax] || o[ax] > max[ax]) return null;
    } else {
      let t1 = (min[ax] - o[ax]) / d[ax], t2 = (max[ax] - o[ax]) / d[ax];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// ============================================================
// Weapons
// ============================================================
function currentWeapon() { return WEAPONS[SLOTS[me.slot]]; }

function tryShoot(now) {
  const wkey = SLOTS[me.slot];
  const w = WEAPONS[wkey];
  if (me.dead || me.reloading || planting || defusing) return;
  if (w.builder) { tryPlaceBlock(); return; }
  if (w.tool) { tryBreakBlock(); return; }
  if (now - me.lastShot < w.rate) return;
  if (me.ammo[wkey] <= 0) { startReload(); return; }
  me.lastShot = now;
  me.ammo[wkey]--;
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
      const head = hitY > bestPlayer.group.position.y + 1.45;
      let dmg = w.dmg * (head ? 2 : 1);
      netSend({ t: 'hit', target: bestPlayer.id, dmg: Math.round(dmg), w: wkey, head });
      bloodBurst(new THREE.Vector3(origin.x + dir.x * bestT, hitY, origin.z + dir.z * bestT));
    } else if (blockHit) {
      debrisBurst(new THREE.Vector3(origin.x + dir.x * blockHit.dist, origin.y + dir.y * blockHit.dist, origin.z + dir.z * blockHit.dist));
    }
    spawnTracer(origin, dir, wkey, bestT);
  }

  SND.shot(wkey);
  netSend({ t: 'shoot', from: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: baseDir.x, y: baseDir.y, z: baseDir.z }, w: wkey });
  me.rx += w.pellets > 1 ? 0.03 : (wkey === 'sniper' ? 0.04 : 0.012);
  vm.recoil = 1;
  if (me.ammo[wkey] <= 0) startReload();
}

function startReload() {
  const wkey = SLOTS[me.slot];
  const w = WEAPONS[wkey];
  if (w.builder || w.tool || me.reloading || me.ammo[wkey] === w.mag) return;
  me.reloading = true;
  me.reloadEnd = performance.now() + w.reload;
  $('reloadLbl').style.display = 'block';
  SND.reload();
  setTimeout(() => {
    me.ammo[wkey] = w.mag;
    me.reloading = false;
    $('reloadLbl').style.display = 'none';
    updateAmmoHud();
  }, w.reload);
}

function tryPlaceBlock() {
  const now = performance.now();
  if (now - me.lastShot < 220 || me.blocks <= 0) return;
  me.lastShot = now;
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const hit = raycastVoxels(origin, dir, 6);
  if (!hit) return;
  const nx = hit.x + hit.normal[0], ny = hit.y + hit.normal[1], nz = hit.z + hit.normal[2];
  if (ny < 1 || ny > 20 || Math.abs(nx) > HALF + 1 || Math.abs(nz) > HALF + 1) return;
  if (collision.has(`${nx},${ny},${nz}`)) return;
  const bx = nx + 0.5, bz = nz + 0.5;
  const overlaps = (pos) =>
    Math.abs(pos.x - bx) < 0.5 + P_HALF && Math.abs(pos.z - bz) < 0.5 + P_HALF &&
    pos.y + P_HEIGHT > ny && pos.y < ny + 1;
  if (overlaps(me.pos)) return;
  for (const r of remotes.values()) if (r.alive && overlaps(r.group.position)) return;
  me.blocks--;
  placeBlockLocal(nx, ny, nz, myTeam);
  netSend({ t: 'place', x: nx, y: ny, z: nz });
  updateAmmoHud(); updateHotbar();
}

function tryBreakBlock() {
  const now = performance.now();
  if (now - me.lastShot < 280) return;
  me.lastShot = now;
  vm.recoil = 1;
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const hit = raycastVoxels(origin, dir, 5);
  if (!hit || hit.y < 1 || hit.x < -HALF || hit.x > HALF - 1 || hit.z < -HALF || hit.z > HALF - 1) {
    SND.swing();
    return;
  }
  removeBlockLocal(hit.x, hit.y, hit.z);
  netSend({ t: 'destroy', x: hit.x, y: hit.y, z: hit.z });
  me.blocks = Math.min(64, me.blocks + 1);
  updateHotbar();
}

// ============================================================
// FX
// ============================================================
function spawnTracer(origin, dir, wkey, dist) {
  const len = dist !== undefined ? dist : (raycastVoxels(origin, dir, 100)?.dist ?? 100);
  const end = origin.clone().addScaledVector(dir, len);
  const start = origin.clone().addScaledVector(dir, 0.8).add(new THREE.Vector3(0, -0.12, 0));
  const g = new THREE.BufferGeometry().setFromPoints([start, end]);
  const m = new THREE.LineBasicMaterial({
    color: wkey === 'sniper' ? 0xaadfff : 0xffd080,
    transparent: true, opacity: 0.85,
  });
  const line = new THREE.Line(g, m);
  scene.add(line);
  tracers.push({ obj: line, ttl: 0.09 });
}

function burst(pos, color, n, spd) {
  for (let i = 0; i < n; i++) {
    const s = 0.05 + Math.random() * 0.06;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color }));
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
    const t = tracers[i];
    t.ttl -= dt;
    t.obj.material.opacity = Math.max(0, t.ttl / 0.09) * 0.85;
    if (t.ttl <= 0) { scene.remove(t.obj); t.obj.geometry.dispose(); t.obj.material.dispose(); tracers.splice(i, 1); }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.ttl -= dt;
    p.vel.y -= 12 * dt;
    p.obj.position.addScaledVector(p.vel, dt);
    if (p.ttl <= 0) { scene.remove(p.obj); p.obj.geometry.dispose(); p.obj.material.dispose(); particles.splice(i, 1); }
  }
}

// ============================================================
// View model
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

  {
    const g = gunBase();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.5), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.3), dark2);
    barrel.position.set(0, 0.01, -0.38);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), dark2);
    mag.position.set(0, -0.11, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.16), wood);
    stock.position.set(0, -0.01, 0.3);
    g.add(body, barrel, mag, stock);
    vm.models.rifle = g;
  }
  {
    const g = gunBase();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.45), wood);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), dark);
    barrel.position.set(0, 0.03, -0.35);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.14), dark2);
    pump.position.set(0, -0.04, -0.22);
    g.add(body, barrel, pump);
    vm.models.shotgun = g;
  }
  {
    const g = gunBase();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.55), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.45), dark2);
    barrel.position.set(0, 0.02, -0.48);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.16), dark2);
    scope.position.set(0, 0.09, -0.05);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.18), wood);
    stock.position.set(0, -0.01, 0.33);
    g.add(body, barrel, scope, stock);
    vm.models.sniper = g;
  }
  {
    const g = new THREE.Group();
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), mats[myTeam === 'red' ? 'redWool' : 'blueWool']);
    cube.rotation.y = 0.5;
    g.add(cube);
    vm.models.blocks = g;
  }
  {
    const g = gunBase();
    const stone = new THREE.MeshLambertMaterial({ color: 0x7a7a7a });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.55), wood);
    handle.rotation.x = -0.5;
    handle.position.set(0, 0.05, -0.15);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.09), stone);
    head.rotation.x = -0.5;
    head.position.set(0, 0.21, -0.38);
    const tipT = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.08), stone);
    tipT.rotation.x = -0.5;
    tipT.position.set(0, 0.33, -0.32);
    const tipB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.08), stone);
    tipB.rotation.x = -0.5;
    tipB.position.set(0, 0.1, -0.45);
    g.add(handle, head, tipT, tipB);
    vm.models.pickaxe = g;
  }
  for (const m of Object.values(vm.models)) { vm.group.add(m); m.visible = false; }
  vm.models[SLOTS[me.slot]].visible = true;
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
  me.slot = i;
  me.zoomed = false;
  for (const [k, m] of Object.entries(vm.models)) m.visible = (k === SLOTS[i]);
  updateHotbar(); updateAmmoHud();
  tone(420, 0.04, 0.08, 'square');
}

// ============================================================
// HUD
// ============================================================
let heartFull, heartHalf, heartEmpty;
function makeHeart(fill) {
  const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  const c = document.createElement('canvas'); c.width = 9; c.height = 8;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== 'X') return;
      g.fillStyle = '#000'; g.fillRect(x, y + 1, 1, 1);
    });
  });
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== 'X') return;
      let col = '#3b0a0a';
      if (fill === 'full' || (fill === 'half' && x < 4)) col = (y < 2 && (x === 1 || x === 4)) ? '#ff6a6a' : '#e2210b';
      g.fillStyle = col; g.fillRect(x + 0.5, y + 0.5, 1, 1);
    });
  });
  return c.toDataURL();
}

function updateHearts() {
  const wrap = $('hearts');
  if (!heartFull) { heartFull = makeHeart('full'); heartHalf = makeHeart('half'); heartEmpty = makeHeart('empty'); }
  wrap.innerHTML = '';
  const hp = Math.max(0, me.hp);
  for (let i = 0; i < 10; i++) {
    const img = document.createElement('img');
    const lo = i * 10;
    img.src = hp >= lo + 10 ? heartFull : hp >= lo + 5 ? heartHalf : heartEmpty;
    wrap.appendChild(img);
  }
}

function drawIcon(kind) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (kind === 'blocks') {
    const cols = myTeam === 'red'
      ? ['#b03430', '#a32e2a', '#bd3d38'] : ['#3a4fb4', '#3448a6', '#4458c2'];
    for (let y = 6; y < 26; y++) for (let x = 6; x < 26; x++) {
      g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      g.fillRect(x, y, 1, 1);
    }
    g.strokeStyle = '#000'; g.strokeRect(6, 6, 20, 20);
    return c.toDataURL();
  }
  if (kind === 'pickaxe') {
    g.fillStyle = '#6e4f2a';
    for (let i = 0; i < 16; i++) g.fillRect(6 + i, 24 - i, 3, 3);
    g.fillStyle = '#7a7a7a';
    g.fillRect(4, 6, 6, 4); g.fillRect(8, 4, 8, 4); g.fillRect(16, 4, 6, 4); g.fillRect(21, 6, 5, 4); g.fillRect(24, 9, 4, 5);
    g.fillStyle = '#9a9a9a';
    g.fillRect(8, 5, 12, 2);
    return c.toDataURL();
  }
  g.fillStyle = '#222';
  if (kind === 'rifle') {
    g.fillRect(2, 14, 24, 5);
    g.fillRect(24, 15, 6, 3);
    g.fillStyle = '#444'; g.fillRect(10, 19, 4, 7);
    g.fillStyle = '#6e4f2a'; g.fillRect(2, 13, 6, 8);
    g.fillStyle = '#444'; g.fillRect(16, 11, 6, 3);
  } else if (kind === 'shotgun') {
    g.fillStyle = '#6e4f2a'; g.fillRect(2, 14, 10, 7);
    g.fillStyle = '#222'; g.fillRect(10, 14, 20, 4);
    g.fillStyle = '#555'; g.fillRect(14, 18, 7, 4);
  } else if (kind === 'sniper') {
    g.fillRect(2, 16, 28, 3);
    g.fillStyle = '#444'; g.fillRect(8, 11, 8, 4);
    g.fillStyle = '#6e4f2a'; g.fillRect(2, 15, 5, 7);
    g.fillStyle = '#555'; g.fillRect(12, 19, 3, 5);
  }
  return c.toDataURL();
}

function updateHotbar() {
  const bar = $('hotbar');
  bar.innerHTML = '';
  SLOTS.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'slot' + (i === me.slot ? ' sel' : '');
    const img = document.createElement('img');
    img.src = drawIcon(s);
    div.appendChild(img);
    const key = document.createElement('span');
    key.className = 'key'; key.textContent = i + 1;
    div.appendChild(key);
    if (s === 'blocks') {
      const cnt = document.createElement('span');
      cnt.className = 'cnt'; cnt.textContent = me.blocks;
      div.appendChild(cnt);
    }
    div.addEventListener('click', () => selectSlot(i));
    bar.appendChild(div);
  });
}

function updateAmmoHud() {
  const wkey = SLOTS[me.slot];
  const w = WEAPONS[wkey];
  $('weaponName').textContent = w.name;
  $('ammoNum').textContent = w.builder ? `${me.blocks}` : w.tool ? '—' : `${me.ammo[wkey]} / ${w.mag}`;
}

function feed(text, teamA, teamB) {
  const kf = $('killfeed');
  const div = document.createElement('div');
  div.textContent = text;
  div.className = teamA === 'red' ? 'r' : 'b';
  kf.prepend(div);
  while (kf.children.length > 6) kf.lastChild.remove();
  setTimeout(() => div.remove(), 5000);
}

function showDeathScreen(killerName) {
  $('deathScreen').style.display = 'flex';
  $('deathBy').textContent = `Тебя убил: ${killerName}`;
  let left = 3.5;
  const cd = $('deathCd');
  const iv = setInterval(() => {
    left -= 0.1;
    if (left <= 0 || !me.dead) { clearInterval(iv); cd.textContent = ''; return; }
    cd.textContent = `Возрождение через ${left.toFixed(1)}с`;
  }, 100);
}

function updateScoreboard() {
  const sb = $('scoreboard');
  if (!tabHeld) { sb.style.display = 'none'; return; }
  const all = [
    { name: myName + ' (ты)', team: myTeam, kills: me.kills, deaths: me.deaths, me: true },
    ...[...remotes.values()].map(r => ({ name: r.name, team: r.team, kills: r.kills, deaths: r.deaths })),
  ];
  const row = p => `<tr><td class="${p.me ? 'me' : ''}">${p.name}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`;
  const table = list => `<table><tr><th>ИГРОК</th><th>УБИЙСТВА</th><th>СМЕРТИ</th></tr>${list.sort((a, b) => b.kills - a.kills).map(row).join('')}</table>`;
  sb.innerHTML =
    `<h3 class="red">КРАСНЫЕ — ${scores.red}</h3>` + table(all.filter(p => p.team === 'red')) +
    `<h3 class="blue">СИНИЕ — ${scores.blue}</h3>` + table(all.filter(p => p.team === 'blue'));
  sb.style.display = 'block';
}

// ============================================================
// РАДАР
// ============================================================
function updateRadar() {
  const canvas = $('radarCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(20,30,20,0.8)';
  ctx.beginPath(); ctx.arc(cx, cy, cx-2, 0, Math.PI*2); ctx.fill();

  const R = cx - 10;
  const scale = R / 50;

  ctx.save();
  ctx.translate(cx, cy);

  // Враги
  for (const r of remotes.values()) {
    if (!r.alive || r.team === myTeam) continue;
    const dx = r.group.position.x - me.pos.x;
    const dz = r.group.position.z - me.pos.z;
    const cs = Math.cos(-me.ry), sn = Math.sin(-me.ry);
    const rx = dx * cs - dz * sn;
    const rz = dx * sn + dz * cs;
    if (Math.abs(rx) > 50 || Math.abs(rz) > 50) continue;
    ctx.fillStyle = '#ff3333';
    ctx.beginPath(); ctx.arc(rx * scale, rz * scale, 5, 0, Math.PI*2); ctx.fill();
  }

  // Бомба
  if (activeBomb) {
    const dx = activeBomb.x - me.pos.x;
    const dz = activeBomb.z - me.pos.z;
    const cs = Math.cos(-me.ry), sn = Math.sin(-me.ry);
    const rx = dx * cs - dz * sn;
    const rz = dx * sn + dz * cs;
    if (Math.abs(rx) < 50 && Math.abs(rz) < 50) {
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath(); ctx.arc(rx * scale, rz * scale, 7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('B', rx * scale, rz * scale);
    }
  }

  // Я
  ctx.fillStyle = '#44ff44';
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(8, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ============================================================
// БОМБА
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
    const sec = (left / 1000).toFixed(1);
    el.textContent = `💣 ${sec}с`;
    el.style.color = left < 10000 ? '#ff2222' : '#ffaa00';
    if (bombMesh) {
      const scale = 1 + Math.sin(Date.now() / 100) * 0.1 * (1 - left / activeBomb.fuseTime);
      bombMesh.scale.set(scale, scale, scale);
      bombMesh.material.emissiveIntensity = 0.6 + Math.sin(Date.now() / 80) * 0.4;
    }
  };
  update();
  bombTimerInterval = setInterval(update, 100);
}

function startPlant() {
  if (me.dead) return;
  if (myTeam !== 'red') { sysChat('⚠️ Бомбу закладывают только КРАСНЫЕ!'); return; }
  if (activeBomb) { sysChat('⚠️ Бомба уже заложена!'); return; }
  if (planting) return;
  planting = true;
  plantStartTime = Date.now();
  netSend({ t: 'startPlant' });
  showPlantProgress();
  sysChat('🔧 Закладываю бомбу... не двигайся!');
  tone(330, 0.15, 0.15, 'square');
}

function finishPlant() {
  if (!planting) return;
  planting = false;
  clearInterval(plantProgressInterval);
  plantProgressInterval = null;
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
    const elapsed = Date.now() - plantStartTime;
    const pct = Math.min(100, (elapsed / plantDuration) * 100);
    fill.style.width = pct + '%';
    label.textContent = `ЗАКЛАДКА БОМБЫ ${pct.toFixed(0)}%`;
    if (pct >= 100) finishPlant();
  }, 50);
}

function startDefuse() {
  if (me.dead || !activeBomb) return;
  if (myTeam !== 'blue') { sysChat('⚠️ Разминируют только СИНИЕ!'); return; }
  const dx = me.pos.x - activeBomb.x;
  const dz = me.pos.z - activeBomb.z;
  if (Math.sqrt(dx*dx + dz*dz) > 3) { sysChat('⚠️ Слишком далеко от бомбы!'); return; }
  if (defusing) return;
  defusing = true;
  defuseStartTime = Date.now();
  netSend({ t: 'startDefuse' });
  showDefuseProgress();
  sysChat('🔧 Разминирую... не двигайся!');
  tone(440, 0.15, 0.15, 'square');
}

function finishDefuse() {
  if (!defusing) return;
  defusing = false;
  clearInterval(defuseProgressInterval);
  defuseProgressInterval = null;
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
    const elapsed = Date.now() - defuseStartTime;
    const pct = Math.min(100, (elapsed / defuseDuration) * 100);
    fill.style.width = pct + '%';
    label.textContent = `РАЗМИНИРОВАНИЕ ${pct.toFixed(0)}%`;
    if (pct >= 100) finishDefuse();
  }, 50);
}

// ============================================================
// МОБИЛЬНОЕ УПРАВЛЕНИЕ
// ============================================================
function initMobileControls() {
  if (mobileInited) return;
  mobileInited = true;
  const zone = $('joystickZone');
  const knob = $('joystickKnob');
  const fireBtn = $('fireBtn');
  const reloadBtn = $('reloadBtn');
  const jumpBtn = $('jumpBtn');
  const bombBtn = $('bombBtn');
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
    const t = e.touches[0];
    updateJoystick(t.clientX, t.clientY, baseCenter, baseRadius, knob);
  }, { passive: false });

  zone.addEventListener('touchend', e => {
    e.preventDefault();
    joystickActive = false;
    joystickVector = { x: 0, y: 0 };
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
  });

  // Обзор — свайп по правой части
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
    for (const t of e.changedTouches) {
      if (t.identifier === touchLookId) touchLookId = null;
    }
  });

  fireBtn?.addEventListener('touchstart', e => { e.preventDefault(); mouseDown = true; tryShoot(performance.now()); });
  fireBtn?.addEventListener('touchend', e => { e.preventDefault(); mouseDown = false; });
  reloadBtn?.addEventListener('touchstart', e => { e.preventDefault(); startReload(); });
  jumpBtn?.addEventListener('touchstart', e => { e.preventDefault(); keys['Space'] = true; setTimeout(() => keys['Space'] = false, 100); });
  bombBtn?.addEventListener('touchstart', e => {
    e.preventDefault();
    if (activeBomb) startDefuse();
    else if (!planting) startPlant();
  });
}

function updateJoystick(tx, ty, center, radius, knob) {
  let dx = tx - center.x;
  let dy = ty - center.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist > radius) { dx = dx / dist * radius; dy = dy / dist * radius; }
  if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
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
        if (text) netSend({ t: 'chat', text });
        closeChat();
      }
      return;
    }
    if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); openChat(); return; }
    if (e.code === 'KeyV' && !e.repeat) setTalking(true);
    keys[e.code] = true;
    if (e.code === 'Tab') { e.preventDefault(); tabHeld = true; updateScoreboard(); }
    if (e.code === 'KeyR') startReload();
    if (/^Digit[1-9]$/.test(e.code)) selectSlot(parseInt(e.code[5]) - 1);
    if (e.code === 'KeyM') { SETTINGS.radar = !SETTINGS.radar; saveSettings(); }

    if (e.code === 'KeyX' && isCheater) { e.preventDefault(); toggleAimbot(); }
    if (e.code === 'KeyZ' && isCheater) { e.preventDefault(); toggleWallhack(); }

    if (e.code === 'KeyE' && !e.repeat) {
      if (activeBomb) startDefuse();
      else if (!planting) startPlant();
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'KeyV') setTalking(false);
    if (chatOpen) return;
    keys[e.code] = false;
    if (e.code === 'Tab') { tabHeld = false; updateScoreboard(); }
  });
  document.addEventListener('mousemove', e => {
    if (!locked || me.dead) return;
    me.ry -= e.movementX * 0.0023 * SETTINGS.sensitivity;
    me.rx -= e.movementY * 0.0023 * SETTINGS.sensitivity * (me.zoomed ? 0.5 : 1);
    me.rx = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, me.rx));
  });
  document.addEventListener('mousedown', e => {
    if (!inGame || chatOpen) return;
    if (!locked) { canvas.requestPointerLock(); return; }
    if (e.button === 0) { mouseDown = true; tryShoot(performance.now()); }
    else if (e.button === 2) { me.zoomed = !me.zoomed; }
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (inGame) {
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
}

// ============================================================
// Scene
// ============================================================
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 60, 140);

  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 300);
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: SETTINGS.quality === 'high' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(SETTINGS.quality === 'low' ? 1 : Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = SETTINGS.quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.6);
  sun.position.set(40, 70, 25);
  sun.castShadow = SETTINGS.quality !== 'low';
  sun.shadow.mapSize.set(SETTINGS.quality === 'high' ? 2048 : 1024, SETTINGS.quality === 'high' ? 2048 : 1024);
  sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(6 + Math.random() * 10, 0.8, 4 + Math.random() * 6), cloudMat);
    c.position.set(Math.random() * 180 - 90, 36 + Math.random() * 8, Math.random() * 180 - 90);
    c.userData.cloud = true;
    scene.add(c);
  }

  tex = buildTextures();
  mats = buildMaterials(tex);
  faceTex = makeFaceTexture();
  buildWorld();
}

function startGame() {
  inGame = true;
  $('menu').style.display = 'none';
  $('authScreen').style.display = 'none';
  $('settings').style.display = 'none';
  $('hud').style.display = 'block';
  $('scoreRed').textContent = scores.red;
  $('scoreBlue').textContent = scores.blue;
  const banner = $('teamBanner');
  banner.style.display = 'flex';
  const t = $('teamBannerText');
  t.textContent = `ТЫ В КОМАНДЕ ${TEAM_RU[myTeam]}`;
  t.style.color = TEAM_COL[myTeam];
  setTimeout(() => { banner.style.display = 'none'; }, 2500);
  buildViewModels();
  updateHearts(); updateHotbar(); updateAmmoHud();
  setupCheats();
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
    if (!me.dead && locked) {
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
    updateViewModel(dt, moving > 0);
    updateWallhack();
    if (tabHeld) updateScoreboard();
    if (SETTINGS.radar) updateRadar();
    if (SETTINGS.showFps) {
      fpsFrames++;
      if (now - fpsLast >= 500) {
        const fpsEl = $('fpsCounter');
        if (fpsEl) fpsEl.textContent = 'FPS: ' + Math.round(fpsFrames / ((now - fpsLast) / 1000));
        fpsFrames = 0; fpsLast = now;
      }
    }

    scene.traverse(o => {
      if (o.userData.cloud) {
        o.position.x += dt * 0.9;
        if (o.position.x > 100) o.position.x = -100;
      }
    });

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
loadSettings();
setupAuth();
setupMenu();
initScene();
setupInput();
clock = new THREE.Clock();
loop();
