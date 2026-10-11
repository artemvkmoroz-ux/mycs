// ============================================================
// map.js — de_dust2 (исправленный)
// ============================================================

export const HALF = 64;

function addB(blocks, x, y, z, type) {
  blocks.push({ x, y, z, type });
}
function wallX(blocks, x1, x2, z, y1, y2, type = 'bricks') {
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      addB(blocks, x, y, z, type);
}
function wallZ(blocks, z1, z2, x, y1, y2, type = 'bricks') {
  for (let z = z1; z <= z2; z++)
    for (let y = y1; y <= y2; y++)
      addB(blocks, x, y, z, type);
}
function floor(blocks, x1, x2, z1, z2, type = 'sand') {
  for (let x = x1; x <= x2; x++)
    for (let z = z1; z <= z2; z++)
      addB(blocks, x, 0, z, type);
}
function crate(blocks, x, z, size = 2, type = 'planks') {
  for (let dx = 0; dx < size; dx++)
    for (let dz = 0; dz < size; dz++)
      for (let y = 1; y <= size; y++)
        addB(blocks, x + dx, y, z + dz, type);
}

export function buildMapBlocks() {
  const blocks = [];

  // === ПОЛ ===
  floor(blocks, -64, 63, -64, 63, 'sand');

  // === ПЕРИМЕТР ===
  wallX(blocks, -64, 63, -64, 1, 6, 'bricks');
  wallX(blocks, -64, 63, 63, 1, 6, 'bricks');
  wallZ(blocks, -64, 63, -64, 1, 6, 'bricks');
  wallZ(blocks, -64, 63, 63, 1, 6, 'bricks');

  // === T SPAWN (юг, центр) ===
  floor(blocks, -20, 20, 40, 60, 'cobble');
  wallZ(blocks, 40, 60, -20, 1, 5, 'bricks');
  wallZ(blocks, 40, 60, 20, 1, 5, 'bricks');
  wallX(blocks, -20, 20, 60, 1, 5, 'bricks');
  // Арка
  wallX(blocks, -20, -9, 40, 1, 6, 'bricks');
  wallX(blocks, 9, 20, 40, 1, 6, 'bricks');
  for (let x = -8; x <= 8; x++) {
    addB(blocks, x, 5, 40, 'bricks');
    addB(blocks, x, 6, 40, 'bricks');
  }
  // Ящики в T Spawn
  crate(blocks, 12, 48, 2, 'planks');
  crate(blocks, 12, 52, 2, 'planks');
  crate(blocks, 16, 48, 2, 'planks');
  crate(blocks, -16, 50, 2, 'planks');
  crate(blocks, -14, 52, 2, 'planks');

  // === КОРИДОР T → MID ===
  floor(blocks, -8, 8, 20, 40, 'sand');
  wallZ(blocks, 20, 40, -8, 1, 4, 'bricks');
  wallZ(blocks, 20, 40, 8, 1, 4, 'bricks');
  crate(blocks, -5, 30, 2, 'planks');
  crate(blocks, 3, 30, 2, 'planks');

  // === MID ===
  wallZ(blocks, -10, 20, -10, 1, 5, 'bricks');
  wallZ(blocks, -10, 20, 10, 1, 5, 'bricks');
  // Mid Doors
  wallX(blocks, -10, -4, 12, 1, 5, 'bricks');
  wallX(blocks, 4, 10, 12, 1, 5, 'bricks');
  for (let x = -3; x <= 3; x++) addB(blocks, x, 5, 12, 'bricks');
  // Xbox
  crate(blocks, -1, 5, 2, 'planks');
  crate(blocks, -8, -5, 2, 'planks');
  crate(blocks, 8, -5, 2, 'planks');

  // === CT SPAWN (север) ===
  wallZ(blocks, -50, -20, -30, 1, 5, 'bricks');
  wallZ(blocks, -50, -20, 30, 1, 5, 'bricks');
  wallX(blocks, -30, 30, -50, 1, 5, 'bricks');
  crate(blocks, -20, -40, 2, 'planks');
  crate(blocks, 20, -40, 2, 'planks');
  crate(blocks, 0, -45, 2, 'planks');

  // === LONG A ===
  wallZ(blocks, 0, 55, 30, 1, 5, 'bricks');
  wallX(blocks, 30, 39, 50, 1, 5, 'bricks');
  wallX(blocks, 51, 55, 50, 1, 5, 'bricks');
  for (let x = 40; x <= 50; x++) addB(blocks, x, 5, 50, 'bricks');
  // Машина
  for (let x = 35; x <= 40; x++)
    for (let z = 28; z <= 32; z++) {
      addB(blocks, x, 1, z, 'cobble');
      addB(blocks, x, 2, z, 'cobble');
    }
  crate(blocks, 45, 15, 2, 'planks');
  crate(blocks, 45, 40, 2, 'planks');
  crate(blocks, 50, 20, 2, 'planks');

  // === LONG CORNER → A ===
  wallZ(blocks, 0, 15, 30, 1, 5, 'bricks');
  wallX(blocks, 30, 55, 0, 1, 5, 'bricks');

  // === A SITE ===
  wallZ(blocks, -50, 0, 30, 1, 6, 'bricks');
  wallX(blocks, 30, 60, -50, 1, 6, 'bricks');
  // Ящики-платформа
  crate(blocks, 40, -30, 2, 'planks');
  crate(blocks, 42, -30, 2, 'planks');
  crate(blocks, 44, -30, 2, 'planks');
  for (let x = 40; x <= 45; x++)
    for (let z = -30; z <= -29; z++) {
      addB(blocks, x, 3, z, 'planks');
      addB(blocks, x, 4, z, 'planks');
    }
  crate(blocks, 50, -35, 2, 'planks');
  crate(blocks, 52, -35, 2, 'planks');
  crate(blocks, 35, -15, 2, 'planks');
  crate(blocks, 37, -15, 2, 'planks');
  crate(blocks, 55, -20, 1, 'planks');
  crate(blocks, 56, -22, 1, 'planks');

  // === TUNNELS (слева) ===
  wallZ(blocks, 0, 40, -55, 1, 5, 'bricks');
  wallZ(blocks, 0, 40, -30, 1, 5, 'bricks');
  wallX(blocks, -55, -30, 40, 1, 5, 'bricks');
  wallX(blocks, -55, -30, 0, 1, 5, 'bricks');
  crate(blocks, -45, 20, 2, 'planks');
  crate(blocks, -50, 10, 2, 'planks');
  crate(blocks, -45, 30, 2, 'planks');

  // === B SITE ===
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
  crate(blocks, -40, -40, 2, 'planks');
  crate(blocks, -38, -40, 2, 'planks');
  // Машина на B
  for (let x = -58; x <= -52; x++)
    for (let z = -35; z <= -30; z++) {
      addB(blocks, x, 1, z, 'cobble');
      addB(blocks, x, 2, z, 'cobble');
    }

  // === ПРОХОДЫ CT → A и CT → B ===
  wallZ(blocks, -30, -20, 30, 1, 5, 'bricks');
  wallZ(blocks, -30, -20, -30, 1, 5, 'bricks');

  // === ДОП. ЯЩИКИ ===
  crate(blocks, -25, 25, 2, 'planks');
  crate(blocks, 25, 25, 2, 'planks');
  crate(blocks, 0, -15, 2, 'planks');
  crate(blocks, 15, -15, 2, 'planks');
  crate(blocks, -15, -15, 2, 'planks');

  // ============================================================
  // ВАЖНО: УБРАЛ CATWALK (деревянную платформу)
  // которая пересекалась с CT Spawn и спавнила синих внутри
  // ============================================================

  return blocks;
}
