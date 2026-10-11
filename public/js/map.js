import * as THREE from 'three';

export const HALF = 64; // половина карты в блоках

// ============================================================
// ТЕКСТУРЫ
// ============================================================
export function buildTextures() {
  return {
    sand: makeSand(),
    wall: makeWall(),
    stone: makeStone(),
    wood: makeWood(),
    redWool: makeWool(0xb03430),
    blueWool: makeWool(0x3a4fb4),
    ground: makeGround(),
  };
}

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  return c;
}

function makeSand() {
  const c = makeCanvas(); const g = c.getContext('2d');
  g.fillStyle = '#d4b88a'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 800; i++) {
    const shade = Math.random() * 50 - 25;
    g.fillStyle = `rgb(${212+shade},${184+shade},${138+shade})`;
    g.fillRect(Math.random()*64, Math.random()*64, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

function makeWall() {
  const c = makeCanvas(); const g = c.getContext('2d');
  g.fillStyle = '#c9a878'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#8a6a48'; g.lineWidth = 2;
  const bh = 16, bw = 32;
  for (let y = 0; y < 64; y += bh) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke();
    const offset = (y / bh) % 2 === 0 ? 0 : bw / 2;
    for (let x = offset; x < 64; x += bw) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + bh); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

function makeStone() {
  const c = makeCanvas(); const g = c.getContext('2d');
  g.fillStyle = '#a89878'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 100; i++) {
    g.fillStyle = `rgba(${120+Math.random()*60},${100+Math.random()*40},${80+Math.random()*30},.5)`;
    g.beginPath();
    g.arc(Math.random()*64, Math.random()*64, Math.random()*5, 0, Math.PI*2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

function makeWood() {
  const c = makeCanvas(); const g = c.getContext('2d');
  g.fillStyle = '#8b5a2b'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#5a3a1a'; g.lineWidth = 2;
  for (let y = 8; y < 64; y += 16) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

function makeWool(color) {
  const c = makeCanvas(); const g = c.getContext('2d');
  const r = (color >> 16) & 255, gr = (color >> 8) & 255, b = color & 255;
  g.fillStyle = `rgb(${r},${gr},${b})`; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 400; i++) {
    const s = Math.random() * 40 - 20;
    g.fillStyle = `rgb(${r+s},${gr+s},${b+s})`;
    g.fillRect(Math.random()*64, Math.random()*64, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

function makeGround() {
  const c = makeCanvas(); const g = c.getContext('2d');
  g.fillStyle = '#b89868'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 500; i++) {
    const s = Math.random() * 40 - 20;
    g.fillStyle = `rgb(${184+s},${152+s},${104+s})`;
    g.fillRect(Math.random()*64, Math.random()*64, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}

export function buildMaterials(tex) {
  return {
    sand:     new THREE.MeshLambertMaterial({ map: tex.sand }),
    wall:     new THREE.MeshLambertMaterial({ map: tex.wall }),
    stone:    new THREE.MeshLambertMaterial({ map: tex.stone }),
    wood:     new THREE.MeshLambertMaterial({ map: tex.wood }),
    redWool:  new THREE.MeshLambertMaterial({ map: tex.redWool }),
    blueWool: new THREE.MeshLambertMaterial({ map: tex.blueWool }),
    ground:   new THREE.MeshLambertMaterial({ map: tex.ground }),
  };
}

// ============================================================
// КАРТА de_dust2 — ПО СХЕМЕ МИНИКАРТЫ
// ============================================================
//
//   КООРДИНАТНАЯ СЕТКА (X — вправо, Z — вниз, Y — высота):
//
//     X = -64 .. +64  (ширина)
//     Z = -64 .. +64  (глубина)
//
//   Схема (вид сверху):
//
//        -64        -32         0        +32       +64
//   -64  +----------+----------+----------+----------+
//        |   B SITE |  CT MID  |  CATWALK |  A SITE  |
//   -32  |    (B)   |          |          |    (A)   |
//        |  TUNNELS |   MID    |  SHORT   | LONG A   |
//    0   |          | DOORS    |          |          |
//        |          |          |          |          |
//   +32  |   T SPAWN (низ слева)   T SPAWN  |          |
//        |          |  OUTSIDE |          |          |
//   +64  +----------+----------+----------+----------+
//
// ============================================================

// Хелпер: добавить блок (стена/пол/ящик)
function addBlock(blocks, x, y, z, type) {
  blocks.push({ x, y, z, type });
}

// Хелпер: стена вдоль оси X
function wallX(blocks, x1, x2, z, y1, y2, type = 'wall') {
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      addBlock(blocks, x, y, z, type);
    }
  }
}

// Хелпер: стена вдоль оси Z
function wallZ(blocks, z1, z2, x, y1, y2, type = 'wall') {
  for (let z = z1; z <= z2; z++) {
    for (let y = y1; y <= y2; y++) {
      addBlock(blocks, x, y, z, type);
    }
  }
}

// Хелпер: залить прямоугольник стенами (толщина 1)
function box(blocks, x1, x2, z1, z2, y1, y2, type = 'wall') {
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      for (let y = y1; y <= y2; y++) {
        addBlock(blocks, x, y, z, type);
      }
    }
  }
}

// Хелпер: пол (только y=0)
function floor(blocks, x1, x2, z1, z2, type = 'sand') {
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      addBlock(blocks, x, 0, z, type);
    }
  }
}

// Хелпер: ящик
function crate(blocks, x, z, size = 2, type = 'wood') {
  for (let dx = 0; dx < size; dx++) {
    for (let dz = 0; dz < size; dz++) {
      for (let y = 1; y <= size; y++) {
        addBlock(blocks, x + dx, y, z + dz, type);
      }
    }
  }
}

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================================
export function buildMapBlocks() {
  const blocks = [];

  // === ПОЛ ВСЕЙ КАРТЫ ===
  floor(blocks, -64, 63, -64, 63, 'sand');

  // ============================================================
  // ВНЕШНИЕ СТЕНЫ КАРТЫ (периметр)
  // ============================================================
  wallX(blocks, -64, 63, -64, 1, 5);   // север
  wallX(blocks, -64, 63, 63, 1, 5);    // юг
  wallZ(blocks, -64, 63, -64, 1, 5);   // запад
  wallZ(blocks, -64, 63, 63, 1, 5);    // восток

  // ============================================================
  // T SPAWN (внизу по центру, X=-20..10, Z=40..60)
  // ============================================================
  // Задняя стена T Spawn
  wallX(blocks, -20, 10, 60, 1, 4);
  // Боковые стены
  wallZ(blocks, 40, 60, -20, 1, 4);
  wallZ(blocks, 40, 60, 10, 1, 4);
  // Выходы из T Spawn:
  // - налево (в Tunnels)
  // - направо (в Long)
  // - вперёд (в Mid)
  // Ящики в T Spawn
  crate(blocks, -15, 45, 2);
  crate(blocks, 5, 45, 2);
  crate(blocks, -5, 50, 2);

  // ============================================================
  // ВЫХОД T SPAWN → MID (центральный проход)
  // ============================================================
  // Стены коридора (X=-5..5, Z=20..40)
  wallZ(blocks, 20, 40, -8, 1, 4);
  wallZ(blocks, 20, 40, 8, 1, 4);

  // ============================================================
  // MID (центральная зона, X=-20..20, Z=-10..20)
  // ============================================================
  // Левая стена Mid
  wallZ(blocks, -10, 20, -20, 1, 4);
  // Правая стена Mid
  wallZ(blocks, -10, 20, 20, 1, 4);

  // Mid Doors (X=-4..4, Z=5) — проход в центре Mid
  wallX(blocks, -20, -5, 5, 1, 4);
  wallX(blocks, 5, 20, 5, 1, 4);
  // Двери — оставляем проход X=-4..4

  // Xbox (знаменитый ящик в Mid, X=0, Z=10)
  crate(blocks, -1, 10, 2, 'wood');
  crate(blocks, -1, 10, 2, 'wood');

  // Ящики в Mid
  crate(blocks, -15, 0, 2);
  crate(blocks, 15, 0, 2);
  crate(blocks, -12, 15, 2);
  crate(blocks, 12, 15, 2);

  // ============================================================
  // CT MID / CT SPAWN (сверху по центру, X=-20..30, Z=-50..-10)
  // ============================================================
  // Стена перед CT Spawn (с проходами на A и B)
  wallX(blocks, -30, -10, -20, 1, 4);   // проход на B (слева)
  wallX(blocks, 20, 30, -20, 1, 4);     // проход на A (справа)
  // Проход Mid → CT Mid — оставляем X=-10..20

  // Боковые стены CT Spawn
  wallZ(blocks, -50, -20, -30, 1, 4);
  wallZ(blocks, -50, -20, 30, 1, 4);
  // Задняя стена CT Spawn
  wallX(blocks, -30, 30, -50, 1, 4);

  // Ящики в CT Spawn
  crate(blocks, -20, -40, 2);
  crate(blocks, 20, -40, 2);

  // ============================================================
  // LONG A (длинный коридор справа, X=30..55, Z=0..55)
  // ============================================================
  // Внутренняя стена Long (отделяет от Mid)
  wallZ(blocks, 0, 55, 30, 1, 4);
  // Внешняя стена Long (периметр)
  // — уже есть внешняя стена на X=63

  // Long Doors (в конце Long, Z=55)
  wallX(blocks, 30, 40, 55, 1, 4);
  wallX(blocks, 50, 55, 55, 1, 4);
  // Проход X=40..50 — Long Doors открыты

  // Ящики в Long
  crate(blocks, 35, 30, 2);
  crate(blocks, 45, 20, 2);
  crate(blocks, 50, 40, 2);
  crate(blocks, 35, 45, 2);

  // ============================================================
  // LONG CORNER → A SITE (переход наверх справа)
  // ============================================================
  // Стены поворота
  wallZ(blocks, 0, 15, 30, 1, 4);
  wallX(blocks, 30, 55, 0, 1, 4);

  // ============================================================
  // A SITE (справа сверху, X=30..60, Z=-50..-5)
  // ============================================================
  // Западная стена A (отделяет от CT Mid)
  wallZ(blocks, -50, -5, 30, 1, 5);
  // Северная стена A
  wallX(blocks, 30, 60, -50, 1, 5);
  // Проход A → CT Mid — оставляем открытым

  // === ГЛАВНЫЕ ЯЩИКИ НА A (платформа для бомбы) ===
  crate(blocks, 40, -30, 2, 'wood');
  crate(blocks, 42, -30, 2, 'wood');
  crate(blocks, 44, -30, 2, 'wood');
  // Второй ряд (повыше — сложенные ящики)
  for (let x = 40; x <= 45; x++) {
    for (let z = -30; z <= -29; z++) {
      addBlock(blocks, x, 3, z, 'wood');
      addBlock(blocks, x, 4, z, 'wood');
    }
  }

  // Ящики справа на A
  crate(blocks, 50, -20, 2);
  crate(blocks, 50, -18, 2);

  // Ящики слева (у Catwalk)
  crate(blocks, 35, -40, 2);
  crate(blocks, 37, -40, 2);

  // Бочки на A (красные)
  crate(blocks, 55, -40, 1, 'wood');
  crate(blocks, 56, -42, 1, 'wood');

  // ============================================================
  // CATWALK (мост от Mid к A, X=15..30, Z=-15..-5)
  // ============================================================
  wallZ(blocks, -15, -5, 15, 1, 4);
  wallZ(blocks, -15, -5, 30, 1, 4);
  // Проход по мосту — X=15..30

  // ============================================================
  // SHORT (короткий путь от Mid к A)
  // ============================================================
  wallZ(blocks, 0, 5, 20, 1, 4);
  wallZ(blocks, 0, 5, 30, 1, 4);

  // ============================================================
  // TUNNELS (слева, X=-55..-30, Z=-10..40)
  // ============================================================
  // Внешняя стена Tunnels
  wallZ(blocks, -10, 40, -55, 1, 4);
  // Внутренняя стена Tunnels (отделяет от Mid)
  wallZ(blocks, -10, 40, -30, 1, 4);
  // Проход Tunnels → T Spawn
  wallX(blocks, -55, -30, 40, 1, 4);
  // Потолок туннеля (частично)
  // Ящики в туннелях
  crate(blocks, -45, 20, 2);
  crate(blocks, -50, 0, 2);

  // ============================================================
  // B SITE (слева сверху, X=-60..-30, Z=-50..-5)
  // ============================================================
  // Восточная стена B (отделяет от CT Mid)
  wallZ(blocks, -50, -5, -30, 1, 5);
  // Северная стена B
  wallX(blocks, -60, -30, -50, 1, 5);
  // Проход B → CT Mid — оставляем открытым

  // === ЯЩИКИ НА B ===
  crate(blocks, -50, -30, 2);
  crate(blocks, -48, -30, 2);
  for (let x = -50; x <= -47; x++) {
    for (let z = -30; z <= -29; z++) {
      addBlock(blocks, x, 3, z, 'wood');
      addBlock(blocks, x, 4, z, 'wood');
    }
  }
  crate(blocks, -40, -40, 2);
  crate(blocks, -55, -20, 2);

  // Машина на B (упрощённая)
  for (let x = -58; x <= -52; x++) {
    for (let z = -35; z <= -30; z++) {
      addBlock(blocks, x, 1, z, 'stone');
      addBlock(blocks, x, 2, z, 'stone');
    }
  }

  // ============================================================
  // ПРОХОД CT → B (слева)
  // ============================================================
  wallZ(blocks, -30, -20, -30, 1, 4);
  wallX(blocks, -30, -30, -20, -30, 1, 4);

  // ============================================================
  // ПРОХОД CT → A (справа)
  // ============================================================
  wallZ(blocks, -30, -20, 30, 1, 4);
  wallX(blocks, 30, 30, -20, -30, 1, 4);

  // ============================================================
  // ДОПОЛНИТЕЛЬНЫЕ УКРЫТИЯ И ДЕКОР
  // ============================================================
  // Ящики в разных местах
  crate(blocks, -25, 25, 2);   // около T Spawn
  crate(blocks, 25, 25, 2);
  crate(blocks, 0, -15, 2);    // в CT Mid
  crate(blocks, 15, -15, 2);
  crate(blocks, -15, -15, 2);

  // Бочки
  crate(blocks, 60, -55, 1, 'wood');
  crate(blocks, -60, 55, 1, 'wood');
  crate(blocks, 60, 55, 1, 'wood');
  crate(blocks, -60, -55, 1, 'wood');

  return blocks;
}
