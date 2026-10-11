// ============================================================
// map.js — загрузка Dust 2 из GitHub Releases
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const HALF = 64;

// ============ ПРЯМАЯ ССЫЛКА НА КАРТУ ============
const DUST2_URL = 'https://github.com/artemvkmoroz-ux/mycs/releases/download/ya/dust2_a.webp.glb';

// ============================================================
// ЗАГРУЗКА КАРТЫ
// ============================================================
export function loadDust2Map(scene, onLoaded) {
  const loader = new GLTFLoader();
  console.log('⏳ Загружаю Dust 2...');
  
  loader.load(
    DUST2_URL,
    (gltf) => {
      const map = gltf.scene;
      map.scale.set(1, 1, 1);
      map.position.set(0, 0, 0);
      map.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(map);
      console.log('✅ Dust 2 загружена');
      if (onLoaded) onLoaded(map);
    },
    (progress) => {
      if (progress.total > 0) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        if (pct % 20 === 0) console.log('Загрузка карты: ' + pct + '%');
      } else {
        console.log('Загружено: ' + Math.round(progress.loaded / 1024 / 1024) + ' МБ');
      }
    },
    (error) => {
      console.error('❌ Ошибка загрузки карты:', error);
      console.log('Откат на процедурную карту...');
      buildFallbackMap(scene);
    }
  );
}

// ============================================================
// ПРОЦЕДУРНАЯ КАРТА (если ссылка не сработает)
// ============================================================
function buildFallbackMap(scene) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xc9a878 });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0xd4b88a });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(128, 128), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const walls = [
    [128, 6, 1, 0, 3, -64],
    [128, 6, 1, 0, 3, 64],
    [1, 6, 128, -64, 3, 0],
    [1, 6, 128, 64, 3, 0],
  ];
  for (const w of walls) {
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.scale.set(w[0], w[1], w[2]);
    mesh.position.set(w[3], w[4], w[5]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  console.log('⚠️ Загружена процедурная карта');
}

// ============================================================
// ПУСТОЙ МАССИВ (для совместимости)
// ============================================================
export function buildMapBlocks() {
  return [];
}
