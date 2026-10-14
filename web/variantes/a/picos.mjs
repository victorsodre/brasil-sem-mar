#!/usr/bin/env node
// Lista os picos submarinos (máximos locais abaixo de 0 m) de um lugar, pela
// proeminência topográfica exata na grade, e as ilhas (picos acima de 0 m).
// Serve para desenhar a trilha de câmera: a câmera passa pelos montes de verdade.
//
// Uso: node web/variantes/a/picos.mjs [slug] [--n 10] [--min-proeminencia 300] [--json]
//
// Método: as células são visitadas da mais alta para a mais baixa (ordenação
// por contagem no valor inteiro do Terrain-RGB, exato). Cada célula sem vizinho
// já visitado abre um pico; quando uma célula une dois componentes, o pico mais
// baixo ganha proeminência = altura do pico - altura da célula (o colo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--')) || '002-vitoria-trindade';
const opt = (nome, def) => { const i = args.indexOf(nome); return i >= 0 ? Number(args[i + 1]) : def; };
const N = opt('--n', 10);
const MIN_PROM = opt('--min-proeminencia', 300);
const JSON_SO = args.includes('--json');

const dir = path.join(RAIZ, 'lugares', slug);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'terreno.json'), 'utf8'));
const lugar = JSON.parse(fs.readFileSync(path.join(dir, 'lugar.json'), 'utf8'));
const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'terreno.png')));
const W = png.width, H = png.height;
if (W !== meta.largura || H !== meta.altura) throw new Error(`terreno.png ${W}x${H} difere do terreno.json ${meta.largura}x${meta.altura}`);

// Valor inteiro do Terrain-RGB (0,1 m por unidade); altura em metros = -10000 + v * 0.1
const v = new Uint32Array(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += 4) v[i] = (png.data[p] << 16) | (png.data[p + 1] << 8) | png.data[p + 2];
const alturaM = (i) => -10000 + v[i] * 0.1;

// Ordenação por contagem (descendente em altura)
let vMin = 0xffffff, vMax = 0;
for (let i = 0; i < v.length; i++) { if (v[i] < vMin) vMin = v[i]; if (v[i] > vMax) vMax = v[i]; }
const faixa = vMax - vMin + 1;
const cont = new Uint32Array(faixa + 1);
for (let i = 0; i < v.length; i++) cont[vMax - v[i] + 1]++;
for (let k = 1; k <= faixa; k++) cont[k] += cont[k - 1];
const ordem = new Uint32Array(v.length);
for (let i = 0; i < v.length; i++) ordem[cont[vMax - v[i]]++] = i;

// Union-find com o pico de cada componente
const pai = new Int32Array(W * H).fill(-1);          // -1 = ainda não visitada
const picoDe = new Int32Array(W * H);                // índice do pico mais alto do componente (na raiz)
const proeminencia = new Map();                      // picoIdx -> metros
const colDe = new Map();                             // picoIdx -> índice da célula do colo
const achar = (i) => { while (pai[i] !== i) { pai[i] = pai[pai[i]]; i = pai[i]; } return i; };
const viz = new Int32Array(8);
for (let k = 0; k < ordem.length; k++) {
  const i = ordem[k];
  const x = i % W, y = (i - x) / W;
  let n = 0;
  if (x > 0) viz[n++] = i - 1;
  if (x < W - 1) viz[n++] = i + 1;
  if (y > 0) { viz[n++] = i - W; if (x > 0) viz[n++] = i - W - 1; if (x < W - 1) viz[n++] = i - W + 1; }
  if (y < H - 1) { viz[n++] = i + W; if (x > 0) viz[n++] = i + W - 1; if (x < W - 1) viz[n++] = i + W + 1; }
  pai[i] = i; picoDe[i] = i;
  let raiz = i;
  for (let j = 0; j < n; j++) {
    const o = viz[j];
    if (pai[o] < 0) continue;                        // mais baixa, ainda não visitada
    const ro = achar(o);
    if (ro === raiz) continue;
    // une: o pico mais alto fica; o mais baixo recebe a proeminência aqui (colo = célula i)
    const pa = picoDe[raiz], pb = picoDe[ro];
    const alto = v[pa] >= v[pb] ? pa : pb, baixo = alto === pa ? pb : pa;
    if (baixo !== i && !proeminencia.has(baixo)) { proeminencia.set(baixo, (v[baixo] - v[i]) * 0.1); colDe.set(baixo, i); }
    pai[ro] = raiz; picoDe[raiz] = alto;
  }
}
// o pico global: proeminência = altura - mínimo do terreno
for (let i = 0; i < v.length; i++) if (pai[i] === i && !proeminencia.has(picoDe[i])) proeminencia.set(picoDe[i], (v[picoDe[i]] - vMin) * 0.1);

const bb = meta.bbox;
const lonC = (bb.oeste + bb.leste) / 2, latC = (bb.norte + bb.sul) / 2;
const kmPorGrauX = 111.32 * Math.cos(latC * Math.PI / 180);
const descreve = (i) => {
  const x = i % W, y = (i - x) / W;
  const lon = bb.oeste + (x + 0.5) * meta.graus_por_no.lon;
  const lat = bb.norte - (y + 0.5) * meta.graus_por_no.lat;
  const h = alturaM(i);
  return {
    col: x, lin: y, lon: +lon.toFixed(4), lat: +lat.toFixed(4), altura_m: +h.toFixed(1),
    proeminencia_m: +proeminencia.get(i).toFixed(1),
    cena_km: { x: +((lon - lonC) * kmPorGrauX).toFixed(2), y: +(h * lugar.exagero_vertical / 1000).toFixed(3), z: +((latC - lat) * 111.32).toFixed(2) },
  };
};

const todos = [...proeminencia.keys()];
const submarinos = todos.filter((i) => alturaM(i) < 0 && proeminencia.get(i) >= MIN_PROM)
  .sort((a, b) => proeminencia.get(b) - proeminencia.get(a)).slice(0, N).map(descreve);
const ilhas = todos.filter((i) => alturaM(i) > 0 && proeminencia.get(i) >= MIN_PROM)
  .sort((a, b) => v[b] - v[a]).map(descreve);
// ilhas = picos acima do mar cercados de fundo oceânico: o colo tem de estar abaixo de 0 m
const ilhasOceanicas = todos.filter((i) => alturaM(i) > 0 && colDe.has(i) && alturaM(colDe.get(i)) < -500 && proeminencia.get(i) >= MIN_PROM)
  .sort((a, b) => v[b] - v[a]).map(descreve);

const saida = {
  slug, largura: W, altura: H, elev_min_m: +alturaM(ordem[ordem.length - 1]).toFixed(1), elev_max_m: +alturaM(ordem[0]).toFixed(1),
  picos_submarinos: submarinos, ilhas_oceanicas: ilhasOceanicas, continente: ilhas.slice(0, 3),
};
if (JSON_SO) { console.log(JSON.stringify(saida, null, 2)); }
else {
  console.log(`${slug}: ${W}x${H}, de ${saida.elev_min_m} m a ${saida.elev_max_m} m, ${todos.length} máximos locais`);
  console.log(`\n${N} picos submarinos mais proeminentes (proeminência >= ${MIN_PROM} m), de oeste para leste:`);
  for (const p of [...submarinos].sort((a, b) => a.lon - b.lon)) console.log(`  lon ${p.lon.toFixed(3)}  lat ${p.lat.toFixed(3)}  topo ${p.altura_m} m  proem ${p.proeminencia_m} m  cena x ${p.cena_km.x} y ${p.cena_km.y} z ${p.cena_km.z}`);
  console.log('\nilhas oceânicas (colo abaixo de -500 m):');
  for (const p of ilhasOceanicas) console.log(`  lon ${p.lon.toFixed(3)}  lat ${p.lat.toFixed(3)}  topo ${p.altura_m} m  proem ${p.proeminencia_m} m  cena x ${p.cena_km.x} y ${p.cena_km.y} z ${p.cena_km.z}`);
  console.log('\nmais altos do continente:');
  for (const p of ilhas.slice(0, 3)) console.log(`  lon ${p.lon.toFixed(3)}  lat ${p.lat.toFixed(3)}  topo ${p.altura_m} m  proem ${p.proeminencia_m} m`);
}
