// ============================================================
// map.js — Карта de_dust2
// Использует текстуры из textures.js
// ============================================================

export const HALF = 64;

// Хелпер: блок
function addB(blocks, x, y, z, type) {
  blocks.push({ x, y, z, type });
}

// Стена вдоль X
function wallX(blocks, x1, x2, z, y1, y2, type = 'sand') {
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      addB(blocks, x, y, z, type);
}

// Стена вдоль Z
function wallZ(blocks, z1, z2, x, y1, y2, type = 'sand') {
  for (let z = z1; z <= z2; z++)
    for (let y = y1; y <= y2; y++)
      addB(blocks, x, y, z, type);
}

// Пол
function floor(blocks, x1, x2, z1, z2, type = 'sand') {
  for (let x = x1; x <= x2; x++)
    for (let z = z1; z <= z2; z++)
      addB(blocks, x, 0, z, type);
}

// Ящик
function crate(blocks, x, z, size = 2, type = 'planks') {
  for (let dx = 0; dx < size; dx++)
    for (let dz = 0; dz < size; dz++)
      for (let y = 1; y <= size; y++)
        addB(blocks, x + dx, y, z + dz, type);
}

// ============================================================
export function buildMapBlocks() {
  const blocks = [];

  // === ПОЛ ВСЕЙ КАРТЫ ===
  floor(blocks, -64, 63, -64, 63, 'sand');

  // === ПЕРИМЕТР ===
  wallX(blocks, -64, 63, -64, 1, 5, 'bricks');
  wallX(blocks, -64, 63, 63, 1, 5, 'bricks');
  wallZ(blocks, -64, 63, -64, 1, 5, 'bricks');
  wallZ(blocks, -64, 63, 63, 1, 5, 'bricks');

  // === T SPAWN (внизу по центру, X=-20..10, Z=40..60) ===
  wallX(blocks, -20, 10, 60, 1, 4, 'bricks');
  wallZ(blocks, 40, 60, -20, 1, 4, 'bricks');
  wallZ(blocks, 40, 60, 10, 1, 4, 'bricks');
  crate(blocks, -15, 45, 2, 'planks');
  crate(blocks, 5, 45, 2, 'planks');
  crate(blocks, -5, 52, 2, 'planks');

  // === ВЫХОД T SPAWN → MID ===
  wallZ(blocks, 20, 40, -8, 1, 4, 'bricks');
  wallZ(blocks, 20, 40, 8, 1, 4, 'bricks');

  // === MID ===
  wallZ(blocks, -10, 20, -20, 1, 4, 'bricks');
  wallZ(blocks, -10, 20, 20, 1, 4, 'bricks');
  // Mid Doors
  wallX(blocks, -20, -5, 5, 1, 4, 'planks');
  wallX(blocks, 5, 20, 5, 1, 4, 'planks');
  // Xbox
  crate(blocks, -1, 10, 2, 'planks');
  crate(blocks, -15, 0, 2, 'planks');
  crate(blocks, 15, 0, 2, 'planks');
  crate(blocks, -12, 15, 2, 'planks');
  crate(blocks, 12, 15, 2, 'planks');

  // === CT SPAWN ===
  wallX(blocks, -30, -10, -20, 1, 4, 'bricks');
  wallX(blocks, 20, 30, -20, 1, 4, 'bricks');
  wallZ(blocks, -50, -20, -30, 1, 4, 'bricks');
  wallZ(blocks, -50, -20, 30, 1, 4, 'bricks');
  wallX(blocks, -30, 30, -50, 1, 4, 'bricks');
  crate(blocks, -20, -40, 2, 'planks');
  crate(blocks, 20, -40, 2, 'planks');

  // === LONG A ===
  wallZ(blocks, 0, 55, 30, 1, 4, 'bricks');
  wallX(blocks, 30, 40, 55, 1, 4, 'bricks');
  wallX(blocks, 50, 55, 55, 1, 4, 'bricks');
  crate(blocks, 35, 30, 2, 'planks');
  crate(blocks, 45, 20, 2, 'planks');
  crate(blocks, 50, 40, 2, 'planks');

  // === A SITE ===
  wallZ(blocks, -50, -5, 30, 1, 5, 'bricks');
  wallX(blocks, 30, 60, -50, 1, 5, 'bricks');
  crate(blocks, 40, -30, 2, 'planks');
  crate(blocks, 42, -30, 2, 'planks');
  crate(blocks, 44, -30, 2, 'planks');
  // Сложенные
  for (let x = 40; x <= 45; x++)
    for (let z = -30; z <= -29; z++) {
      addB(blocks, x, 3, z, 'planks');
      addB(blocks, x, 4, z, 'planks');
    }
  crate(blocks, 50, -20, 2, 'planks');
  crate(blocks, 35, -40, 2, 'planks');

  // === CATWALK ===
  wallZ(blocks, -15, -5, 15, 1, 4, 'bricks');
  wallZ(blocks, -15, -5, 30, 1, 4, 'bricks');

  // === SHORT ===
  wallZ(blocks, 0, 5, 20, 1, 4, 'bricks');
  wallZ(blocks, 0, 5, 30, 1, 4, 'bricks');

  // === TUNNELS ===
  wallZ(blocks, -10, 40, -55, 1, 4, 'bricks');
  wallZ(blocks, -10, 40, -30, 1, 4, 'bricks');
  wallX(blocks, -55, -30, 40, 1, 4, 'bricks');
  crate(blocks, -45, 20, 2, 'planks');
  crate(blocks, -50, 0, 2, 'planks');

  // === B SITE ===
  wallZ(blocks, -50, -5, -30, 1, 5, 'bricks');
  wallX(blocks, -60, -30, -50, 1, 5, 'bricks');
  crate(blocks, -50, -30, 2, 'planks');
  crate(blocks, -48, -30, 2, 'planks');
  for (let x = -50; x <= -47; x++)
    for (let z = -30; z <= -29; z++) {
      addB(blocks, x, 3, z, 'planks');
      addB(blocks, x, 4, z, 'planks');
    }
  crate(blocks, -40, -40, 2, 'planks');
  // Машина
  for (let x = -58; x <= -52; x++)
    for (let z = -35; z <= -30; z++) {
      addB(blocks, x, 1, z, 'cobble');
      addB(blocks, x, 2, z, 'cobble');
    }

  // === Проходы CT → A и B ===
  wallZ(blocks, -30, -20, -30, 1, 4, 'bricks');
  wallZ(blocks, -30, -20, 30, 1, 4, 'bricks');

  // === Доп. ящики ===
  crate(blocks, -25, 25, 2, 'planks');
  crate(blocks, 25, 25, 2, 'planks');
  crate(blocks, 0, -15, 2, 'planks');
  crate(blocks, 15, -15, 2, 'planks');
  crate(blocks, -15, -15, 2, 'planks');

  return blocks;
}
