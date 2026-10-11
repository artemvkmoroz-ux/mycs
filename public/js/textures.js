// ============================================================
// textures.js — Текстуры для карты Dust 2
// ============================================================
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(draw, size = 16) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noisy(g, palette, seed, size = 16) {
  const r = rng(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      g.fillStyle = palette[Math.floor(r() * palette.length)];
      g.fillRect(x, y, 1, 1);
    }
  }
}

// ---------- Палитры (в стиле Dust 2) ----------
const SAND = ['#d9cf9e', '#d1c694', '#e0d6a8', '#c9bd88'];
const WALL = ['#c9a878', '#b89868', '#d4b88a', '#a88050'];
const BRICK = ['#a86a4a', '#9a5e42', '#b87858', '#8e5238'];
const COBBLE = ['#828282', '#6b6b6b', '#909090', '#5e5e5e'];
const PLANKS = ['#a8824e', '#9c7845', '#b08a55', '#93713f'];
const STONE = ['#7f7f7f', '#747474', '#8a8a8a', '#6f6f6f'];
const GRASS = ['#5d9c3a', '#549135', '#67a83f', '#4f8a31'];
const DIRT = ['#79553a', '#6e4c33', '#82603f', '#65462f'];

export function buildTextures() {
  const tex = {};

  tex.sand = toTexture(makeCanvas((g, s) => noisy(g, SAND, 1, s)));
  tex.wall = toTexture(makeCanvas((g, s) => noisy(g, WALL, 2, s)));
  tex.stone = toTexture(makeCanvas((g, s) => noisy(g, STONE, 3, s)));

  tex.bricks = toTexture(makeCanvas((g, s) => {
    noisy(g, BRICK, 4, s);
    g.fillStyle = '#d3c5b5';
    for (let y = 0; y < s; y += 4) g.fillRect(0, y + 3, s, 1);
    for (let row = 0; row < 4; row++) {
      for (let x = (row % 2 ? 0 : 4); x < s; x += 8) {
        g.fillRect(x, row * 4, 1, 3);
      }
    }
  }));

  tex.cobble = toTexture(makeCanvas((g, s) => {
    noisy(g, COBBLE, 5, s);
    g.fillStyle = '#4a4a4a';
    [[0, 5], [5, 0], [10, 6], [3, 11], [12, 12], [8, 9]].forEach(([x, y]) => {
      g.fillRect(x, y, 5, 1);
      g.fillRect(x, y, 1, 5);
    });
  }));

  tex.planks = toTexture(makeCanvas((g, s) => {
    noisy(g, PLANKS, 6, s);
    g.fillStyle = '#6e5530';
    for (let y = 3; y < s; y += 4) g.fillRect(0, y, s, 1);
    g.fillRect(4, 0, 1, 4);
    g.fillRect(11, 4, 1, 4);
    g.fillRect(2, 8, 1, 4);
    g.fillRect(13, 12, 1, 4);
  }));

  tex.grass = toTexture(makeCanvas((g, s) => noisy(g, GRASS, 7, s)));
  tex.dirt = toTexture(makeCanvas((g, s) => noisy(g, DIRT, 8, s)));

  tex.redWool = toTexture(makeCanvas((g, s) => noisy(g, ['#b03430','#a32e2a','#bd3d38','#962824'], 9, s)));
  tex.blueWool = toTexture(makeCanvas((g, s) => noisy(g, ['#3a4fb4','#3448a6','#4458c2','#2e4096'], 10, s)));

  return tex;
}

function mat(t) { return new THREE.MeshLambertMaterial({ map: t }); }

export function buildMaterials(tex) {
  return {
    sand: mat(tex.sand),
    wall: mat(tex.wall),
    bricks: mat(tex.bricks),
    cobble: mat(tex.cobble),
    planks: mat(tex.planks),
    stone: mat(tex.stone),
    grass: mat(tex.grass),
    dirt: mat(tex.dirt),
    redWool: mat(tex.redWool),
    blueWool: mat(tex.blueWool),
  };
}
