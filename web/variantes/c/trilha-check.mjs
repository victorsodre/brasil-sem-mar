#!/usr/bin/env node
// Confere a trilha de câmera contra o terreno: a 30 fps, para cada quadro, a folga
// da câmera sobre o relevo (e sobre a água), a velocidade e o passo angular do alvo.
// Uso: node web/variantes/c/trilha-check.mjs [slug] [--camera web/variantes/c/camera.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { prepararTrilha } from './trilha.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..', '..');
const args = process.argv.slice(2);
const opt = (nome, def) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : def; };
const slug = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) || '002-vitoria-trindade';
const camPath = path.resolve(opt('--camera', path.join(AQUI, 'camera.json')));
const dir = path.join(RAIZ, 'lugares', slug);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'terreno.json'), 'utf8'));
const lugar = JSON.parse(fs.readFileSync(path.join(dir, 'lugar.json'), 'utf8'));
const exag = (lugar.exagero_vertical ?? 15) / 1000;
const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'terreno.png')));
const W = png.width, H = png.height, h = new Float32Array(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += 4) h[i] = -10000 + (png.data[p] * 65536 + png.data[p + 1] * 256 + png.data[p + 2]) * 0.1;
const bb = meta.bbox, latC = (bb.norte + bb.sul) / 2;
const kmW = (bb.leste - bb.oeste) * 111.32 * Math.cos(latC * Math.PI / 180), kmH = (bb.norte - bb.sul) * 111.32;
function alturaM(x, z) { // bilinear, metros; fora do bbox: borda
  const fx = Math.min(Math.max(x / kmW + 0.5, 0), 1) * (W - 1), fy = Math.min(Math.max(z / kmH + 0.5, 0), 1) * (H - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
  return (h[y0 * W + x0] * (1 - tx) + h[y0 * W + x1] * tx) * (1 - ty) + (h[y1 * W + x0] * (1 - tx) + h[y1 * W + x1] * tx) * ty;
}
// folga mínima numa vizinhança (a câmera tem near plane e a malha é mais grossa que o heightmap)
function folgaKm(pos, raioKm = 0.4) {
  let mx = -Infinity;
  for (let dz = -raioKm; dz <= raioKm; dz += raioKm / 2) for (let dx = -raioKm; dx <= raioKm; dx += raioKm / 2) {
    const v = alturaM(pos[0] + dx, pos[2] + dz) * exag; if (v > mx) mx = v;
  }
  return pos[1] - mx;
}
const trilha = prepararTrilha(JSON.parse(fs.readFileSync(camPath, 'utf8')));
const fps = trilha.fps, n = Math.round(trilha.duracao * fps);
let pior = { folga: Infinity }, piorAgua = { folga: Infinity }, vmax = { v: 0 }, amax = { a: 0 };
let prev = null, prevDir = null;
const linhas = [];
for (let q = 0; q <= n; q++) {
  const t = q / fps, a = trilha.amostrar(t);
  const folga = folgaKm(a.pos);
  const folgaAgua = a.pos[1] - a.nivel_agua_m * exag;
  if (folga < pior.folga) pior = { folga, t, pos: a.pos.map((v) => +v.toFixed(1)) };
  if (folgaAgua < piorAgua.folga) piorAgua = { folga: folgaAgua, t };
  const dir = [a.alvo[0] - a.pos[0], a.alvo[1] - a.pos[1], a.alvo[2] - a.pos[2]];
  const L = Math.hypot(...dir); dir[0] /= L; dir[1] /= L; dir[2] /= L;
  if (prev) {
    const v = Math.hypot(a.pos[0] - prev.pos[0], a.pos[1] - prev.pos[1], a.pos[2] - prev.pos[2]) * fps;
    if (v > vmax.v) vmax = { v, t };
    const cosA = Math.max(-1, Math.min(1, dir[0] * prevDir[0] + dir[1] * prevDir[1] + dir[2] * prevDir[2]));
    const ang = Math.acos(cosA) * 180 / Math.PI * fps;
    if (ang > amax.a) amax = { a: ang, t };
  }
  if (q % (fps * 2) === 0) linhas.push(`t=${t.toFixed(0).padStart(2)}s  pos ${a.pos.map((v) => v.toFixed(1).padStart(7)).join(' ')}  folga ${folga.toFixed(1).padStart(6)} km (${(folga / exag).toFixed(0).padStart(5)} m)  água ${a.nivel_agua_m.toFixed(0).padStart(6)} m  pitch ${(Math.asin(dir[1]) * 180 / Math.PI).toFixed(1).padStart(5)}°  fov ${a.fov.toFixed(0)}`);
  prev = a; prevDir = dir;
}
console.log(linhas.join('\n'));
console.log(`pior folga sobre o terreno: ${pior.folga.toFixed(2)} km (${(pior.folga / exag).toFixed(0)} m reais) em t=${pior.t.toFixed(2)} s, pos ${pior.pos}`);
console.log(`pior folga sobre a água: ${piorAgua.folga.toFixed(2)} km em t=${piorAgua.t.toFixed(2)} s`);
console.log(`velocidade máxima: ${vmax.v.toFixed(1)} km/s em t=${vmax.t.toFixed(2)} s · giro máximo do olhar: ${amax.a.toFixed(1)} °/s em t=${amax.t.toFixed(2)} s`);
if (pior.folga <= 0.1) { console.error('FALHA: câmera dentro do terreno (ou colada nele)'); process.exit(1); }
if (piorAgua.folga <= 0) { console.error('FALHA: câmera abaixo da água'); process.exit(1); }
