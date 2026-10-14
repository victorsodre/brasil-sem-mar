#!/usr/bin/env node
// Picos submarinos de um lugar: máximos locais abaixo de 0 m, ordenados por
// proeminência topográfica (altura do cume acima do colo que o liga a terreno
// mais alto). A proeminência sai exata na grade: as células entram em ordem
// decrescente de altura num union-find; quando uma célula funde dois grupos,
// o pico mais baixo ganha proeminência = cume - altura da célula (o colo).
//
// Uso: node web/variantes/b/picos.mjs [slug] [--n 10] [--min-prom 200] [--json]
// Sem Python, sem dependência além do pngjs do package.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..', '..');

export function lerTerreno(slug) {
  const pasta = path.join(RAIZ, 'lugares', slug);
  const meta = JSON.parse(fs.readFileSync(path.join(pasta, 'terreno.json'), 'utf8'));
  const png = PNG.sync.read(fs.readFileSync(path.join(pasta, 'terreno.png')));
  const W = png.width, H = png.height, d = png.data;
  if (W !== meta.largura || H !== meta.altura) {
    throw new Error(`terreno.png ${W}x${H} não bate com terreno.json ${meta.largura}x${meta.altura}`);
  }
  const h = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) h[i] = -10000 + (d[i * 4] * 65536 + d[i * 4 + 1] * 256 + d[i * 4 + 2]) * 0.1;
  return { W, H, h, meta };
}

// Mesmas fórmulas do SPEC (seção "Cena: coordenadas e escala").
export function geo(meta) {
  const bb = meta.bbox;
  const lonC = (bb.oeste + bb.leste) / 2, latC = (bb.norte + bb.sul) / 2;
  const kmLon = 111.32 * Math.cos(latC * Math.PI / 180), kmLat = 111.32;
  return {
    lonC, latC, kmLon, kmLat,
    lonDe: (i, W) => bb.oeste + (i + 0.5) / W * (bb.leste - bb.oeste),
    latDe: (j, H) => bb.norte - (j + 0.5) / H * (bb.norte - bb.sul),
    xDe: (lon) => (lon - lonC) * kmLon,
    zDe: (lat) => (latC - lat) * kmLat,
  };
}

export function achaPicos({ W, H, h }, { n = 10, minProm = 200, soSubmarinos = true } = {}) {
  const N = W * H;
  // Ordena por altura decrescente sem comparador: chave = altura (0,1 m) << 21 | índice.
  if (N >= 1 << 21) throw new Error('grade maior que 2^21 células; use largura_max_nos 2048');
  const chave = new Float64Array(N);
  for (let i = 0; i < N; i++) chave[i] = Math.round((h[i] + 10000) * 10) * 2097152 + i;
  chave.sort();
  const parent = new Int32Array(N).fill(-1);   // -1 = ainda fora
  const peakOf = new Int32Array(N);             // pico (célula mais alta) da raiz
  const prom = new Float32Array(N).fill(NaN);   // proeminência de cada pico
  const colo = new Int32Array(N).fill(-1);      // célula do colo de cada pico
  const paiPico = new Int32Array(N).fill(-1);   // pico mais alto a que se liga
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const picos = [];
  for (let k = N - 1; k >= 0; k--) {
    const c = chave[k] % 2097152;
    const x = c % W, y = (c - x) / W;
    parent[c] = c; peakOf[c] = c;
    let novo = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const v = ny * W + nx;
      if (parent[v] < 0) continue;            // vizinho mais baixo, ainda não entrou
      novo = false;
      const ra = find(c), rb = find(v);
      if (ra === rb) continue;
      const pa = peakOf[ra], pb = peakOf[rb];
      // o pico mais baixo morre aqui: proeminência = cume - colo (altura desta célula)
      const alto = h[pa] >= h[pb] ? ra : rb, baixo = alto === ra ? rb : ra;
      const pBaixo = peakOf[baixo];
      if (pBaixo !== c) { prom[pBaixo] = h[pBaixo] - h[c]; colo[pBaixo] = c; paiPico[pBaixo] = peakOf[alto]; }
      parent[baixo] = alto;
    }
    if (novo) picos.push(c);
  }
  let hMin = Infinity; for (let i = 0; i < N; i++) if (h[i] < hMin) hMin = h[i];
  const lista = [];
  for (const p of picos) {
    const pr = Number.isNaN(prom[p]) ? h[p] - hMin : prom[p];   // o máximo global nunca funde
    if (pr < minProm) continue;
    if (soSubmarinos && h[p] >= 0) continue;
    lista.push({ idx: p, i: p % W, j: Math.floor(p / W), elev_m: h[p], prom_m: pr, colo_m: h[p] - pr, pai: paiPico[p] });
  }
  lista.sort((a, b) => b.prom_m - a.prom_m);
  return lista.slice(0, n);
}

export function listaPicos(slug, opt = {}) {
  const T = lerTerreno(slug);
  const g = geo(T.meta);
  return achaPicos(T, opt).map((p, k) => {
    const lon = g.lonDe(p.i, T.W), lat = g.latDe(p.j, T.H);
    return {
      ordem: k + 1, lon: +lon.toFixed(4), lat: +lat.toFixed(4),
      profundidade_m: +p.elev_m.toFixed(1), proeminencia_m: +p.prom_m.toFixed(1), colo_m: +p.colo_m.toFixed(1),
      x_km: +g.xDe(lon).toFixed(1), z_km: +g.zDe(lat).toFixed(1), i: p.i, j: p.j,
    };
  });
}

const ehPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ehPrincipal) {
  const args = process.argv.slice(2);
  const opt = (nome, def) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : def; };
  const slug = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a) && args[args.indexOf(a) - 1]?.startsWith('--') !== true) || '002-vitoria-trindade';
  const n = Number(opt('--n', 10)), minProm = Number(opt('--min-prom', 200));
  const t0 = performance.now();
  const lista = listaPicos(slug, { n, minProm });
  if (args.includes('--json')) { console.log(JSON.stringify(lista, null, 2)); }
  else {
    console.log(`picos submarinos de ${slug} (${n} maiores por proeminência, mínimo ${minProm} m) — ${(performance.now() - t0).toFixed(0)} ms`);
    console.log('ordem  lon        lat        cume (m)   proem. (m)  colo (m)    x (km)   z (km)');
    for (const p of lista) {
      console.log(`${String(p.ordem).padStart(5)}  ${p.lon.toFixed(4).padStart(9)}  ${p.lat.toFixed(4).padStart(9)}  ${p.profundidade_m.toFixed(1).padStart(8)}  ${p.proeminencia_m.toFixed(1).padStart(10)}  ${p.colo_m.toFixed(1).padStart(8)}  ${p.x_km.toFixed(1).padStart(8)}  ${p.z_km.toFixed(1).padStart(7)}`);
    }
  }
}
