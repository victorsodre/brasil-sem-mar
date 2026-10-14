#!/usr/bin/env node
// Acha os picos submarinos de um lugar no heightmap (terreno.png, Terrain-RGB):
// máximos locais abaixo de 0 m, ordenados por proeminência (altura do cume acima
// do colo mais alto que o liga a terreno mais alto — o mesmo critério usado para
// montanhas). Lista lon/lat/profundidade dos N maiores e grava picos.json ao lado.
//
// Uso: node web/variantes/c/picos.mjs [slug] [--n 10] [--prominencia-min 300] [--raio-km 3]
// Saída: tabela no terminal + web/variantes/c/picos.json (lon, lat, profundidade_m,
// proeminencia_m, altura_sobre_fundo_m, col, lin, cena {x, z} em km como no SPEC).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..', '..');
const args = process.argv.slice(2);
const opt = (nome, def) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : def; };
const slug = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true) || '002-vitoria-trindade';
const N = Number(opt('--n', 10));
const PROM_MIN = Number(opt('--prominencia-min', 300));
const RAIO_KM = Number(opt('--raio-km', 3));

const dir = path.join(RAIZ, 'lugares', slug);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'terreno.json'), 'utf8'));
const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'terreno.png')));
const W = png.width, H = png.height, N_CELULAS = W * H;
if (W !== meta.largura || H !== meta.altura) {
  console.warn(`aviso: terreno.json diz ${meta.largura}x${meta.altura}, o PNG tem ${W}x${H}; uso o PNG`);
}

// Terrain-RGB → Float32 (metros)
const h = new Float32Array(N_CELULAS);
for (let i = 0, p = 0; i < N_CELULAS; i++, p += 4) {
  h[i] = -10000 + (png.data[p] * 65536 + png.data[p + 1] * 256 + png.data[p + 2]) * 0.1;
}

const bb = meta.bbox;
const lonDe = (col) => bb.oeste + (col / (W - 1)) * (bb.leste - bb.oeste);
const latDe = (lin) => bb.norte - (lin / (H - 1)) * (bb.norte - bb.sul);
const lonC = (bb.oeste + bb.leste) / 2, latC = (bb.norte + bb.sul) / 2;
const cena = (lon, lat) => ({
  x: +((lon - lonC) * 111.32 * Math.cos(latC * Math.PI / 180)).toFixed(2),
  z: +((latC - lat) * 111.32).toFixed(2),
});

// 1) candidatos: máximos locais estritos numa janela de raio r nós, abaixo de 0 m
const mpn = meta.metros_por_no || { x: 500, y: 500 };
const rx = Math.max(2, Math.round(RAIO_KM * 1000 / mpn.x));
const ry = Math.max(2, Math.round(RAIO_KM * 1000 / mpn.y));
const candidatos = [];
for (let lin = ry; lin < H - ry; lin++) {
  for (let col = rx; col < W - rx; col++) {
    const v = h[lin * W + col];
    if (v >= 0) continue;
    let ehMax = true;
    for (let dy = -ry; dy <= ry && ehMax; dy++) {
      const base = (lin + dy) * W;
      for (let dx = -rx; dx <= rx; dx++) {
        if (dx === 0 && dy === 0) continue;
        const u = h[base + col + dx];
        if (u > v || (u === v && (dy < 0 || (dy === 0 && dx < 0)))) { ehMax = false; break; }
      }
    }
    if (ehMax) candidatos.push({ i: lin * W + col, h: v });
  }
}
candidatos.sort((a, b) => b.h - a.h);

// 2) proeminência por inundação com heap de máximo: expande sempre a célula mais
//    alta da fronteira; ao alcançar célula mais alta que o pico, o ponto mais baixo
//    já visitado é o colo (key col). Se a inundação esgota o mapa, o colo é o mínimo.
class HeapMax {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] >= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop() {
    const k = this.k, v = this.v, key = k[0], val = v[0], lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < k.length && k[l] > k[m]) m = l;
        if (r < k.length && k[r] > k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return [key, val];
  }
}
const visitado = new Uint8Array(N_CELULAS);
let marca = 0; // usamos valores crescentes para não zerar o array a cada pico
const marcas = new Uint32Array(N_CELULAS);
function proeminencia(i0, h0) {
  marca++;
  const heap = new HeapMax();
  heap.push(h0, i0); marcas[i0] = marca;
  let maisBaixo = h0;
  while (heap.size) {
    const [hv, i] = heap.pop();
    if (hv > h0) return h0 - maisBaixo;
    if (hv < maisBaixo) maisBaixo = hv;
    const col = i % W, lin = (i - col) / W;
    if (col > 0) { const j = i - 1; if (marcas[j] !== marca) { marcas[j] = marca; heap.push(h[j], j); } }
    if (col < W - 1) { const j = i + 1; if (marcas[j] !== marca) { marcas[j] = marca; heap.push(h[j], j); } }
    if (lin > 0) { const j = i - W; if (marcas[j] !== marca) { marcas[j] = marca; heap.push(h[j], j); } }
    if (lin < H - 1) { const j = i + W; if (marcas[j] !== marca) { marcas[j] = marca; heap.push(h[j], j); } }
  }
  return h0 - maisBaixo; // pico mais alto da sua "ilha" dentro do mapa
}
void visitado;

// altura do cume sobre o fundo ao redor (mínimo num raio de 40 km) — o quanto o monte "sobe"
function alturaSobreFundo(i0, h0) {
  const col0 = i0 % W, lin0 = (i0 - col0) / W;
  const rxx = Math.round(40000 / mpn.x), ryy = Math.round(40000 / mpn.y);
  let mn = h0;
  for (let lin = Math.max(0, lin0 - ryy); lin <= Math.min(H - 1, lin0 + ryy); lin++) {
    const base = lin * W;
    for (let col = Math.max(0, col0 - rxx); col <= Math.min(W - 1, col0 + rxx); col++) {
      const v = h[base + col]; if (v < mn) mn = v;
    }
  }
  return h0 - mn;
}

const t0 = performance.now();
const picos = [];
for (const c of candidatos) {
  // poda barata: se o cume não sobe nem PROM_MIN acima do fundo em 40 km, não é monte
  const sobe = alturaSobreFundo(c.i, c.h);
  if (sobe < PROM_MIN) continue;
  const prom = proeminencia(c.i, c.h);
  if (prom < PROM_MIN) continue;
  const col = c.i % W, lin = (c.i - col) / W;
  const lon = lonDe(col), lat = latDe(lin);
  picos.push({
    lon: +lon.toFixed(4), lat: +lat.toFixed(4), profundidade_m: +c.h.toFixed(1),
    proeminencia_m: +prom.toFixed(0), altura_sobre_fundo_m: +sobe.toFixed(0), col, lin, cena: cena(lon, lat),
  });
}
picos.sort((a, b) => b.proeminencia_m - a.proeminencia_m);
const top = picos.slice(0, N);

console.log(`${slug}: ${W}x${H} nós, ${candidatos.length} máximos locais abaixo de 0 m, ${picos.length} com proeminência ≥ ${PROM_MIN} m (${(performance.now() - t0).toFixed(0)} ms)`);
console.log('#   lon        lat       profund.  proemin.  sobe   cena x    cena z');
top.forEach((p, k) => console.log(
  `${String(k + 1).padStart(2)}  ${p.lon.toFixed(4).padStart(9)}  ${p.lat.toFixed(4).padStart(8)}  ${p.profundidade_m.toFixed(0).padStart(7)} m  ${String(p.proeminencia_m).padStart(6)} m  ${String(p.altura_sobre_fundo_m).padStart(5)}  ${String(p.cena.x).padStart(8)}  ${String(p.cena.z).padStart(8)}`));

// a ilha (máximo acima de 0 m na metade leste), para a trilha terminar nela
let iIlha = -1, hIlha = -1e9;
for (let lin = 0; lin < H; lin++) for (let col = (W * 0.6) | 0; col < W; col++) { const v = h[lin * W + col]; if (v > hIlha) { hIlha = v; iIlha = lin * W + col; } }
const ilha = iIlha >= 0 ? { lon: +lonDe(iIlha % W).toFixed(4), lat: +latDe(Math.floor(iIlha / W)).toFixed(4), altura_m: +hIlha.toFixed(1), cena: cena(lonDe(iIlha % W), latDe(Math.floor(iIlha / W))) } : null;
if (ilha) console.log(`ilha mais alta no leste: lon ${ilha.lon} lat ${ilha.lat} ${ilha.altura_m} m  cena ${ilha.cena.x}, ${ilha.cena.z}`);

fs.writeFileSync(path.join(AQUI, 'picos.json'), JSON.stringify({
  slug, largura: W, altura: H, bbox: bb, criterio: { prominencia_min_m: PROM_MIN, raio_km: RAIO_KM, abaixo_de_m: 0 },
  picos: top, ilha_leste: ilha,
}, null, 2) + '\n');
console.log(`gravado ${path.relative(RAIZ, path.join(AQUI, 'picos.json'))}`);
