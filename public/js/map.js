// ============================================================
// map.js — de_dust2 (исправленный: чистые спавны)
// ============================================================

export const HALF = 64;

function addB(blocks, x, y, z, type) {
  blocks.push({ x, y, z, type });
}
function wallX(blocks, x1, x2, z, y1, y2, type) {
  type = type || 'bricks';
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      addB(blocks, x, y, z, type);
}
function wallZ(blocks, z1, z2, x, y1, y2, type) {
  type = type || 'bricks';
  for (let z = z1; z <= z2; z++)
    for (let y = y1; y <= y2; y++)
      addB(blocks, x, y, z, type);
}
function floor(blocks, x1, x2, z1, z2, type) {
  type = type || 'sand';
  for (let x = x1; x <= x2; x++)
    for (let z = z1; z <= z2; z++)
      addB(blocks, x, 0, z, type);
}
function crate(blocks, x, z, size, type) {
  size = size || 2;
  type = type || 'planks';
  for (let dx = 0; dx < size; dx++)
    for (let dz = 0; dz < size; dz++)
      for (let y = 1; y <= size; y++)
        addB(blocks, x + dx, y, z + dz, type);
}

export function buildMapBlocks() {
  const blocks = [];

  // === ПОЛ ВСЕЙ КАРТЫ ===
  floor(blocks, -64, 63, -64, 63, 'sand');

  // === ПЕРИМЕТР ===
  wallX(blocks, -64, 63, -64, 1, 6, 'bricks');
  wallX(blocks, -64, 63, 63, 1, 6, 'bricks');
  wallZ(blocks, -64, 63, -64, 1, 6, 'bricks');
  wallZ(blocks, -64, 63, 63, 1, 6, 'bricks');

  // ============================================================
  // T SPAWN (юг, центр) — X = -20..+20, Z = +40..+60
  // СПАВН: X = -8..+8, Z = +42..+52 (свободная зона в центре)
  // ============================================================
  // Пол T Spawn — плитка
  floor(blocks, -20, 20, 40, 60, 'cobble');

  // Стены T Spawn
  wallZ(blocks, 40, 60, -20, 1, 5, 'bricks');    // западная
  wallZ(blocks, 40, 60, 20, 1, 5, 'bricks');     // восточная
  wallX(blocks, -20, 20, 60, 1, 5, 'bricks');    // задняя (юг)

  // Арка на выход из T Spawn (проход на север, X = -8..+8, Z = 40)
  wallX(blocks, -20, -9, 40, 1, 6, 'bricks');    // стена слева от арки
  wallX(blocks, 9, 20, 40, 1, 6, 'bricks');      // стена справа от арки
  // Свод арки
  for (let x = -8; x <= 8; x++) {
    addB(blocks, x, 5, 40, 'bricks');
    addB(blocks, x, 6, 40, 'bricks');
  }

  // === ЯЩИКИ В T SPAWN — СБОКУ, НЕ МЕШАЮТ СПАВНУ ===
  // Слева у стены
  crate(blocks, -18, 50, 2, 'planks');
  crate(blocks, -18, 54, 2, 'planks');
  crate(blocks, -14, 56, 2, 'planks');
  // Справа у стены
  crate(blocks, 12, 50, 2, 'planks');
  crate(blocks, 12, 54, 2, 'planks');
  crate(blocks, 16, 56, 2, 'planks');

  // === КОРИДОР T SPAWN → MID ===
  floor(blocks, -8, 8, 20, 40, 'sand');
  wallZ(blocks, 20, 40, -8, 1, 4, 'bricks');
  wallZ(blocks, 20, 40, 8, 1, 4, 'bricks');

  // Ящики в коридоре — у стен
  crate(blocks, -7, 30, 2, 'planks');
  crate(blocks, 5, 30, 2, 'planks');

  // ============================================================
  // MID (центр) — X = -10..+10, Z = -10..+20
  // ============================================================
  wallZ(blocks, -10, 20, -10, 1, 5, 'bricks');
  wallZ(blocks, -10, 20, 10, 1, 5, 'bricks');

  // Mid Doors
  wallX(blocks, -10, -4, 12, 1, 5, 'bricks');
  wallX(blocks, 4, 10, 12, 1, 5, 'bricks');
  for (let x = -3; x <= 3; x++) addB(blocks, x, 5, 12, 'bricks');

  // Xbox — знаменитый ящик в центре Mid
  crate(blocks, -1, 5, 2, 'planks');

  // Ящики в Mid — по бокам
  crate(blocks, -9, -5, 2, 'planks');
  crate(blocks, 7, -5, 2, 'planks');

  // ============================================================
  // CT SPAWN (север) — X = -30..+30, Z = -50..-20
  // СПАВН: X = -15..+15, Z = -30..-25 (свободная зона)
  // ============================================================
  // Стены CT Spawn
  wallZ(blocks, -50, -20, -30, 1, 5, 'bricks');
  wallZ(blocks, -50, -20, 30, 1, 5, 'bricks');
  wallX(blocks, -30, 30, -50, 1, 5, 'bricks');

  // === ЯЩИКИ В CT SPAWN — СБОКУ, НЕ МЕШАЮТ СПАВНУ ===
  // Слева у стены
  crate(blocks, -28, -45, 2, 'planks');
  crate(blocks, -28, -40, 2, 'planks');
  // Справа у стены
  crate(blocks, 26, -45, 2, 'planks');
  crate(blocks, 26, -40, 2, 'planks');
  // В глубине
  crate(blocks, -8, -48, 2, 'planks');
  crate(blocks, 6, -48, 2, 'planks');

  // ============================================================
  // LONG A (справа) — X = +30..+55, Z = 0..+55
  // ============================================================
  wallZ(blocks, 0, 55, 30, 1, 5, 'bricks');

  // Long Doors (проход X = +40..+50, Z = 50)
  wallX(blocks, 30, 39, 50, 1, 5, 'bricks');
  wallX(blocks, 51, 55, 50, 1, 5, 'bricks');
  for (let x = 40; x <= 50; x++) addB(blocks, x, 5, 50, 'bricks');

  // Машина в Long (Car)
  for (let x = 35; x <= 40; x++)
    for (let z = 28; z <= 32; z++) {
      addB(blocks, x, 1, z, 'cobble');
      addB(blocks, x, 2, z, 'cobble');
    }

  // Ящики в Long
  crate(blocks, 45, 15, 2, 'planks');
  crate(blocks, 45, 40, 2, 'planks');
  crate(blocks, 50, 20, 2, 'planks');

  // Long Corner → A Site
  wallZ(blocks, 0, 15, 30, 1, 5, 'bricks');
  wallX(blocks, 30, 55, 0, 1, 5, 'bricks');

  // ============================================================
  // A SITE (справа-верх) — X = +30..+60, Z = -50..0
  // ============================================================
  wallZ(blocks, -50, 0, 30, 1, 6, 'bricks');
  wallX(blocks, 30, 60, -50, 1, 6, 'bricks');

  // Главные ящики на A (платформа для бомбы)
  crate(blocks, 40, -30, 2, 'planks');
  crate(blocks, 42, -30, 2, 'planks');
  crate(blocks, 44, -30, 2, 'planks');
  for (let x = 40; x <= 45; x++)
    for (let z = -30; z <= -29; z++) {
      addB(blocks, x, 3, z, 'planks');
      addB(blocks, x, 4, z, 'planks');
    }

  // Goose (ящики у входа)
  crate(blocks, 50, -35, 2, 'planks');
  crate(blocks, 52, -35, 2, 'planks');

  // Ящики у Catwalk
  crate(blocks, 35, -15, 2, 'planks');
  crate(blocks, 37, -15, 2, 'planks');

  // Бочки на A
  crate(blocks, 55, -20, 1, 'planks');
  crate(blocks, 56, -22, 1, 'planks');

  // ============================================================
  // TUNNELS (слева) — X = -55..-30, Z = 0..+40
  // ============================================================
  wallZ(blocks, 0, 40, -55, 1, 5, 'bricks');
  wallZ(blocks, 0, 40, -30, 1, 5, 'bricks');
  wallX(blocks, -55, -30, 40, 1, 5, 'bricks');
  wallX(blocks, -55, -30, 0, 1, 5, 'bricks');

  // Ящики в туннелях — у стен
  crate(blocks, -53, 20, 2, 'planks');
  crate(blocks, -53, 10, 2, 'planks');
  crate(blocks, -53, 30, 2, 'planks');

  // ============================================================
  // B SITE (слева-верх) — X = -60..-30, Z = -50..0
  // ============================================================
  wallZ(blocks, -50, 0, -30, 1, 6, 'bricks');
  wallX(blocks, -60, -30, -50, 1, 6, 'bricks');

  // Ящики на B
  crate(blocks, -50, -30, 2, 'planks');
  crate(blocks, -48, -30, 2, 'planks');
  crate(blocks, -46, -30, 2, 'planks');
  for (let x = -50; x <= -45; x++)
    for (let z = -30; z <= -29; z++) {
      addB(blocks, x, 3, z, 'planks');
      addB(blocks, x, 4, z, 'planks');
    }

  // Ящики у входа на B
  crate(blocks, -40, -40, 2, 'planks');
  crate(blocks, -38, -40, 2, 'planks');

  // Машина на B
  for (let x = -58; x <= -52; x++)
    for (let z = -35; z <= -30; z++) {
      addB(blocks, x, 1, z, 'cobble');
      addB(blocks, x, 2, z, 'cobble');
    }

  // ============================================================
  // ПРОХОДЫ CT → A и CT → B
  // ============================================================
  wallZ(blocks, -30, -20, 30, 1, 5, 'bricks');
  wallZ(blocks, -30, -20, -30, 1, 5, 'bricks');

  // ============================================================
  // ДОПОЛНИТЕЛЬНЫЕ ЯЩИКИ ПО КАРТЕ
  // ============================================================
  crate(blocks, -25, 25, 2, 'planks');
  crate(blocks, 25, 25, 2, 'planks');
  crate(blocks, 0, -15, 2, 'planks');
  crate(blocks, 15, -15, 2, 'planks');
  crate(blocks, -15, -15, 2, 'planks');

  // ============================================================
  // ВАЖНО: ЯЩИКИ НЕ СТАВИМ В ЗОНЕ СПАВНА:
  // - T Spawn: X = -8..+8, Z = +42..+52 — СВОБОДНО
  // - CT Spawn: X = -15..+15, Z = -30..-25 — СВОБОДНО
  // - Catwalk (деревянная платформа) — УБРАН полностью
  // ============================================================

  return blocks;
}
