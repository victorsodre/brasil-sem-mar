#!/usr/bin/env node
// Confere a trilha de câmera (camera.json) contra o terreno, sem abrir navegador: a 30 fps,
// para cada quadro, a folga da câmera sobre o relevo e sobre a água, a velocidade, o giro do
// olhar, o horizonte (% do topo) e, quando o lugar tem régua, onde o Cristo cai na tela.
// Mesma matemática da página (web/trilha.js; projeção com o fov vertical do camera.json).
//
// Uso: node scripts/trilha-check.mjs <slug> [--camera lugares/<slug>/camera.json] [--passo 2] [--largura 1080] [--altura 1920]
// Sai com 1 se a câmera entra no terreno (folga ≤ 0,1 km) ou fica abaixo da água.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { prepararTrilha } from '../web/trilha.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (nome, def) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : def; };
const slug = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!slug || args.includes('--ajuda') || args.includes('-h')) {
  console.log('uso: node scripts/trilha-check.mjs <slug> [--camera lugares/<slug>/camera.json] [--passo 2] [--largura 1080] [--altura 1920]');
  process.exit(slug ? 0 : 1);
}
const dir = path.join(RAIZ, 'lugares', slug);
const camPath = path.resolve(RAIZ, opt('--camera', path.join(dir, 'camera.json')));
const PASSO_S = Number(opt('--passo', 2));
const ASPECT = Number(opt('--largura', 1080)) / Number(opt('--altura', 1920));

const meta = JSON.parse(fs.readFileSync(path.join(dir, 'terreno.json'), 'utf8'));
const lugar = JSON.parse(fs.readFileSync(path.join(dir, 'lugar.json'), 'utf8'));
const exag = (lugar.exagero_vertical ?? 15) / 1000;
const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'terreno.png')));
const W = png.width, H = png.height, h = new Float32Array(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += 4) h[i] = -10000 + (png.data[p] * 65536 + png.data[p + 1] * 256 + png.data[p + 2]) * 0.1;
const bb = meta.bbox, latC = (bb.norte + bb.sul) / 2;
const kmW = (bb.leste - bb.oeste) * 111.32 * Math.cos(latC * Math.PI / 180), kmH = (bb.norte - bb.sul) * 111.32;
const prender = (x, m) => Math.min(Math.max(x, 0), m);

// bilinear em metros, nó = centro de célula (mesma convenção da CLI e do shader); fora do bbox: borda
export function alturaM(x, z) {
  const fx = prender((x / kmW + 0.5) * W - 0.5, W - 1), fy = prender((z / kmH + 0.5) * H - 0.5, H - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
  return (h[y0 * W + x0] * (1 - tx) + h[y0 * W + x1] * tx) * (1 - ty) + (h[y1 * W + x0] * (1 - tx) + h[y1 * W + x1] * tx) * ty;
}
// folga mínima numa vizinhança (near plane de 0,3 km e malha mais grossa que o heightmap)
function folgaKm(pos, raioKm = 0.6) {
  let mx = -Infinity;
  for (let dz = -raioKm; dz <= raioKm; dz += raioKm / 2) for (let dx = -raioKm; dx <= raioKm; dx += raioKm / 2) {
    const v = alturaM(pos[0] + dx, pos[2] + dz) * exag; if (v > mx) mx = v;
  }
  return pos[1] - mx;
}
// projeção de um ponto da cena na tela (% da largura e da altura, a partir do canto superior esquerdo)
function projetar(pos, alvo, fov, P) {
  const f = [alvo[0] - pos[0], alvo[1] - pos[1], alvo[2] - pos[2]]; const lf = Math.hypot(...f); f[0] /= lf; f[1] /= lf; f[2] /= lf;
  const up = [0, 1, 0];
  const r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]]; const lr = Math.hypot(...r) || 1; r[0] /= lr; r[1] /= lr; r[2] /= lr;
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [P[0] - pos[0], P[1] - pos[1], P[2] - pos[2]];
  const zc = d[0] * f[0] + d[1] * f[1] + d[2] * f[2], xc = d[0] * r[0] + d[1] * r[1] + d[2] * r[2], yc = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const tv = Math.tan(fov / 2 * Math.PI / 180), th = tv * ASPECT;
  return { x: 50 + 50 * (xc / zc) / th, y: 50 - 50 * (yc / zc) / tv, dist: Math.hypot(...d), atras: zc <= 0 };
}

const regua = lugar.regua && Number.isFinite(lugar.regua.lon) && Number.isFinite(lugar.regua.lat)
  ? (() => {
    const u = (lugar.regua.lon - bb.oeste) / (bb.leste - bb.oeste), v = (bb.norte - lugar.regua.lat) / (bb.norte - bb.sul);
    const x = (u - 0.5) * kmW, z = (v - 0.5) * kmH, hR = Math.max(0, alturaM(x, z));
    const escala = Number(lugar.regua.escala) || 1;
    return { x, z, base: hR * exag, topo: hR * exag + 30 * exag * escala };
  })()
  : null;

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
  if (q % Math.round(fps * PASSO_S) === 0) {
    const pitch = Math.asin(dir[1]) * 180 / Math.PI;
    const horizonte = 50 + 50 * Math.tan(pitch * Math.PI / 180) / Math.tan(a.fov / 2 * Math.PI / 180);
    let cristo = '';
    if (regua) {
      const base = projetar(a.pos, a.alvo, a.fov, [regua.x, regua.base, regua.z]);
      const topo = projetar(a.pos, a.alvo, a.fov, [regua.x, regua.topo, regua.z]);
      cristo = base.atras ? '  Cristo atrás' : `  Cristo x ${base.x.toFixed(0).padStart(4)} %  base y ${base.y.toFixed(0).padStart(4)} %  topo y ${topo.y.toFixed(0).padStart(4)} %  a ${base.dist.toFixed(1).padStart(6)} km`;
    }
    const vel = prev ? Math.hypot(a.pos[0] - prev.pos[0], a.pos[1] - prev.pos[1], a.pos[2] - prev.pos[2]) * fps : 0;
    linhas.push(`t=${t.toFixed(0).padStart(2)}s  pos ${a.pos.map((v) => v.toFixed(1).padStart(7)).join(' ')}  folga ${folga.toFixed(1).padStart(6)} km (${(folga / exag).toFixed(0).padStart(5)} m)  água ${a.nivel_agua_m.toFixed(0).padStart(6)} m  pitch ${pitch.toFixed(1).padStart(5)}°  horizonte ${horizonte.toFixed(0).padStart(3)} %  fov ${a.fov.toFixed(0)}  vel ${vel.toFixed(1).padStart(5)} km/s${cristo}`);
  }
  prev = a; prevDir = dir;
}
console.log(linhas.join('\n'));
console.log(`pior folga sobre o terreno: ${pior.folga.toFixed(2)} km (${(pior.folga / exag).toFixed(0)} m reais) em t=${pior.t.toFixed(2)} s, pos ${pior.pos}`);
console.log(`pior folga sobre a água: ${piorAgua.folga.toFixed(2)} km em t=${piorAgua.t.toFixed(2)} s`);
console.log(`velocidade máxima: ${vmax.v.toFixed(1)} km/s em t=${vmax.t.toFixed(2)} s · giro máximo do olhar: ${amax.a.toFixed(1)} °/s em t=${amax.t.toFixed(2)} s`);
if (pior.folga <= 0.1) { console.error('FALHA: câmera dentro do terreno (ou colada nele)'); process.exit(1); }
if (piorAgua.folga <= 0) { console.error('FALHA: câmera abaixo da água'); process.exit(1); }
