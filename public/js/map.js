// ============================================================
// map.js — загрузка Dust 2 из GLB + запасная процедурная карта
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const HALF = 64;

// ============================================================
// ЗАГРУЗКА КАРТЫ ИЗ GLB
// ============================================================
export function loadDust2Map(scene, onLoaded) {
  const loader = new GLTFLoader();
  
  console.log('⏳ Загружаю карту Dust 2...');
  
  loader.load(
    'models/dust2_a.webp.glb',
    (gltf) => {
      const map = gltf.scene;
      
      // Масштаб — можно менять (1 = оригинал)
      map.scale.set(1, 1, 1);
      map.position.set(0, 0, 0);
      
      // Тени
      map.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      scene.add(map);
      console.log('✅ Dust 2 загружена из GLB');
      
      if (onLoaded) onLoaded(map);
    },
    (progress) => {
      if (progress.total > 0) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        if (pct % 20 === 0) console.log('Загрузка карты: ' + pct + '%');
      }
    },
    (error) => {
      console.error('❌ Ошибка загрузки карты:', error);
      console.log('Откат на процедурную карту...');
      // Запасной вариант — строим из кубов
      const blocks = buildMapBlocks();
      const byType = {};
      for (const b of blocks) {
        if (!byType[b.type]) byType[b.type] = [];
        byType[b.type].push(b);
      }
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const m4 = new THREE.Matrix4();
      for (const type in byType) {
        const list = byType[type];
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xc9a878 }), list.length);
        list.forEach((b, i) => {
          m4.makeTranslation(b.x + 0.5, b.y + 0.5, b.z + 0.5);
          mesh.setMatrixAt(i, m4);
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
  );
}

// ============================================================
// ПРОЦЕДУРНАЯ КАРТА (запасной вариант)
// ============================================================
function addB(blocks, x, y, z, type) { blocks.push({ x, y, z, type }); }
function wallX(blocks, x1, x2, z, y1, y2, type) {
  type = type || 'bricks';
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++) addB(blocks, x, y, z, type);
}
function wallZ(blocks, z1, z2, x, y1, y2, type) {
  type = type || 'bricks';
  for (let z = z1; z <= z2; z++)
    for (let y = y1; y <= y2; y++) addB(blocks, x, y, z, type);
}
function floor(blocks, x1, x2, z1, z2, type) {
  type = type || 'sand';
  for (let x = x1; x <= x2; x++)
    for (let z = z1; z <= z2; z++) addB(blocks, x, 0, z, type);
}

export function buildMapBlocks() {
  const blocks = [];
  floor(blocks, -64, 63, -64, 63, 'sand');
  // Периметр
  wallX(blocks, -64, 63, -64, 1, 6, 'bricks');
  wallX(blocks, -64, 63, 63, 1, 6, 'bricks');
  wallZ(blocks, -64, 63, -64, 1, 6, 'bricks');
  wallZ(blocks, -64, 63, 63, 1, 6, 'bricks');
  // Мини-карта из кубов
  wallZ(blocks, 20, 40, -8, 1, 4, 'bricks');
  wallZ(blocks, 20, 40, 8, 1, 4, 'bricks');
  wallZ(blocks, -10, 20, -10, 1, 5, 'bricks');
  wallZ(blocks, -10, 20, 10, 1, 5, 'bricks');
  wallZ(blocks, -50, -20, -30, 1, 5, 'bricks');
  wallZ(blocks, -50, -20, 30, 1, 5, 'bricks');
  wallX(blocks, -30, 30, -50, 1, 5, 'bricks');
  return blocks;
}
