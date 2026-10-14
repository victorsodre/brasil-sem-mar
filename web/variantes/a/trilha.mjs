#!/usr/bin/env node
// Gera camera.json (61 s, 30 fps) da variante A para a Cadeia Vitória-Trindade.
//
// A trilha é uma spline Catmull-Rom centrípeta por pontos de passagem escolhidos
// sobre o relevo medido (picos.mjs + perfis): começa ao nível do mar perto de
// Vitória olhando para leste; nos primeiros 12 s a água esvazia enquanto a câmera
// avança devagar até a borda da plataforma; depois mergulha no corredor entre os
// dois bancos do Besnard, costeia o guyot de Vitória pelo norte, cruza entre Davis
// e Dogaressa, passa Columbia a 17 km e termina de frente para a Ilha da Trindade.
//
// O tempo é mapeado por comprimento de arco com um perfil de velocidade suave
// (sem cortes, sem solavancos); os keyframes saem a cada 1 s e a página interpola.
// A água tem keyframes só em t=0, t=1 e t=12 (smoothstep entre eles).
//
// Uso: node web/variantes/a/trilha.mjs [--verificar]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../..');
const SLUG = '002-vitoria-trindade';
const DURACAO = 61, FPS = 30;

const dir = path.join(RAIZ, 'lugares', SLUG);
const lugar = JSON.parse(fs.readFileSync(path.join(dir, 'lugar.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'terreno.json'), 'utf8'));
const escalaY = lugar.exagero_vertical / 1000;
const nivelMin = lugar.nivel_minimo_m;
const bb = meta.bbox;
const latC = (bb.norte + bb.sul) / 2;
const kmW = (bb.leste - bb.oeste) * 111.32 * Math.cos(latC * Math.PI / 180);
const kmH = (bb.norte - bb.sul) * 111.32;

// Pontos de passagem da câmera (km da cena: +x leste, +z sul, +y cima).
// Alturas em y já com exagero (y = m * 0.015): -15 = 1000 m de profundidade.
const POS = [
  [-582.0, 1.6, -36.6],   // t=0: ao nível do mar, atrás da régua (Cristo em -577.1, -36.4), morros da costa à direita
  [-577.0, 2.2, -38.8],   // desvia para o norte dos morros de 64 e 122 m da costa
  [-566.0, 3.6, -40.5],   // sobe devagar: de cima a plataforma e o fundo além da borda aparecem
  [-548.0, 6.5, -41.5],   // t≈12: perto da borda da plataforma (x≈-535)
  [-526.0, 5.0, -42.0],   // cruza a borda ainda alto
  [-498.0, -6.0, -43.5],  // mergulho no talude
  [-470.0, -14.0, -45.0],
  [-400.0, -16.0, -45.0],
  [-330.0, -15.0, -46.0], // portal entre os dois bancos do Besnard
  [-260.0, -15.0, -46.0],
  [-200.0, -15.0, -46.0], // monte de -53 m a 17 km à direita
  [-130.0, -15.0, -42.0],
  [-60.0, -15.0, -34.0],
  [0.0, -14.0, -32.0],    // guyot de Vitória (topo -18 m) a 12 km à direita
  [60.0, -14.0, -12.0],
  [120.0, -14.0, 2.0],    // entre Davis (81, 27) e Dogaressa (114, 24)
  [200.0, -14.0, 0.0],
  [280.0, -13.0, -8.0],
  [330.0, -12.0, -10.0],  // Columbia (304, 9; topo -10 m) a 19 km à direita
  [420.0, -10.0, -14.0],
  [490.0, -7.0, -16.0],
  [515.0, -6.0, -16.5],   // t=61: de frente para Trindade (565.6, 7.1, -15.1)
];
// Para onde a câmera olha (mesmo número de pontos; amostrado no mesmo parâmetro).
const ALVO = [
  [-520.0, -2.5, -37.0],
  [-512.0, -5.5, -39.5],
  [-500.0, -9.0, -41.0],
  [-470.0, -8.0, -43.5],
  [-455.0, -12.0, -44.5],
  [-430.0, -16.0, -45.0],
  [-390.0, -17.0, -45.0],
  [-320.0, -13.0, -46.0],
  [-250.0, -12.0, -46.0],
  [-190.0, -10.0, -40.0],
  [-120.0, -10.0, -36.0],
  [-50.0, -10.0, -28.0],
  [10.0, -8.0, -14.0],
  [70.0, -8.0, 6.0],
  [130.0, -8.0, 10.0],
  [200.0, -8.0, 4.0],
  [280.0, -6.0, -2.0],
  [310.0, -4.0, 4.0],
  [400.0, -6.0, -8.0],
  [500.0, -3.0, -14.0],
  [560.0, 0.0, -15.0],
  [565.6, 2.0, -15.1],
];
if (POS.length !== ALVO.length) throw new Error('POS e ALVO precisam ter o mesmo número de pontos');

// Perfil de velocidade (km/s) ao longo do tempo: devagar no início, cruzeiro, freio no fim.
const suave = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const perfil = (t, V) => {
  if (t < 1.5) return 0.4 + (3.0 - 0.4) * suave(0, 1.5, t);
  if (t < 11) return 3.0;
  if (t < 17) return 3.0 + (V - 3.0) * suave(11, 17, t);
  if (t < 53) return V;
  if (t < 60) return V + (1.5 - V) * suave(53, 60, t);
  return 1.5 + (0.8 - 1.5) * suave(60, 61, t);
};

// Catmull-Rom centrípeta por segmento (Barry-Goldman), igual à da página.
function cr(p0, p1, p2, p3, u) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const t0 = 0, t1 = t0 + Math.max(Math.sqrt(d(p0, p1)), 1e-4), t2 = t1 + Math.max(Math.sqrt(d(p1, p2)), 1e-4), t3 = t2 + Math.max(Math.sqrt(d(p2, p3)), 1e-4);
  const t = t1 + (t2 - t1) * u, out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const a1 = (t1 - t) / (t1 - t0) * p0[k] + (t - t0) / (t1 - t0) * p1[k];
    const a2 = (t2 - t) / (t2 - t1) * p1[k] + (t - t1) / (t2 - t1) * p2[k];
    const a3 = (t3 - t) / (t3 - t2) * p2[k] + (t - t2) / (t3 - t2) * p3[k];
    const b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2;
    const b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
    out[k] = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2;
  }
  return out;
}
function spline(pts, s) {  // s em [0,1] sobre os segmentos
  const n = pts.length - 1;
  const x = Math.min(n - 1e-9, Math.max(0, s * n));
  const i = Math.floor(x), u = x - i;
  return cr(pts[Math.max(i - 1, 0)], pts[i], pts[i + 1], pts[Math.min(i + 2, n)], u);
}

// Tabela de comprimento de arco da spline de posição
const AMOSTRAS = 20000;
const arco = new Float64Array(AMOSTRAS + 1);
let prev = spline(POS, 0);
for (let i = 1; i <= AMOSTRAS; i++) {
  const p = spline(POS, i / AMOSTRAS);
  arco[i] = arco[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
  prev = p;
}
const comprimento = arco[AMOSTRAS];
const sDeArco = (L) => {
  let lo = 0, hi = AMOSTRAS;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arco[m] < L) lo = m + 1; else hi = m; }
  if (lo === 0) return 0;
  const f = (L - arco[lo - 1]) / Math.max(1e-9, arco[lo] - arco[lo - 1]);
  return (lo - 1 + f) / AMOSTRAS;
};

// Acha V tal que a distância percorrida em 61 s = comprimento da spline
const distancia = (V) => { let s = 0; const dt = 1 / 600; for (let t = 0; t < DURACAO; t += dt) s += perfil(t + dt / 2, V) * dt; return s; };
let lo = 1, hi = 200;
for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (distancia(m) < comprimento) lo = m; else hi = m; }
const V = (lo + hi) / 2;

// Posição e alvo no tempo t
const DT = 1 / 600;
const arcoNoTempo = new Float64Array(Math.round(DURACAO / DT) + 1);
for (let i = 1; i < arcoNoTempo.length; i++) arcoNoTempo[i] = arcoNoTempo[i - 1] + perfil((i - 0.5) * DT, V) * DT;
const estadoEm = (t) => {
  const i = Math.min(arcoNoTempo.length - 1, t / DT);
  const i0 = Math.floor(i), f = i - i0;
  const L = arcoNoTempo[i0] + (arcoNoTempo[Math.min(i0 + 1, arcoNoTempo.length - 1)] - arcoNoTempo[i0]) * f;
  const s = sDeArco(Math.min(L, comprimento));
  return { pos: spline(POS, s), alvo: spline(ALVO, s) };
};

// Keyframes a cada 1 s; água em t=0 (0 m), t=1 (0 m) e t=12 (nível mínimo)
const r = (v) => Math.round(v * 1000) / 1000;
const keyframes = [];
for (let t = 0; t <= DURACAO; t += 1) {
  const e = estadoEm(t);
  const k = { t, pos: e.pos.map(r), alvo: e.alvo.map(r) };
  if (t === 0) { k.nivel_agua_m = 0; k.fov = 50; }
  if (t === 1) k.nivel_agua_m = 0;
  if (t === 12) k.nivel_agua_m = nivelMin;
  if (t === DURACAO) k.fov = 50;
  keyframes.push(k);
}
const saida = {
  lugar: SLUG,
  duracao_s: DURACAO,
  fps: FPS,
  nota: 'Gerado por web/variantes/a/trilha.mjs: pos e alvo por Catmull-Rom centrípeta; água e fov com smoothstep entre os keyframes que os definem. Unidades em km da cena (SPEC), y com exagero vertical.',
  velocidade_cruzeiro_km_s: r(V),
  comprimento_km: r(comprimento),
  keyframes,
};
fs.writeFileSync(path.join(AQUI, 'camera.json'), JSON.stringify(saida, null, 1).replace(/\[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, '[$1, $2, $3]') + '\n');
console.log(`camera.json: ${keyframes.length} keyframes, ${DURACAO} s, spline de ${comprimento.toFixed(1)} km, cruzeiro ${V.toFixed(2)} km/s`);

// Verificação: folga da câmera sobre o relevo (amostra bilinear do heightmap), a cada 0,1 s
if (process.argv.includes('--verificar')) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'terreno.png')));
  const W = png.width, H = png.height;
  const h = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) h[i] = -10000 + ((png.data[p] << 16) | (png.data[p + 1] << 8) | png.data[p + 2]) * 0.1;
  const alturaEm = (x, z) => {
    const u = (x + kmW / 2) / kmW * W - 0.5, v = (z + kmH / 2) / kmH * H - 0.5;
    const x0 = Math.min(W - 2, Math.max(0, Math.floor(u))), y0 = Math.min(H - 2, Math.max(0, Math.floor(v)));
    const fx = Math.min(1, Math.max(0, u - x0)), fy = Math.min(1, Math.max(0, v - y0));
    const a = h[y0 * W + x0], b = h[y0 * W + x0 + 1], c = h[(y0 + 1) * W + x0], d = h[(y0 + 1) * W + x0 + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  // Fase 1 (até 12 s) a câmera está ao nível do mar de propósito: exige-se só 0,3 km; depois, 2,5 km.
  let pior = Infinity, piorT = 0, vMax = 0, vMin = Infinity, falhou = false;
  let anterior = estadoEm(0).pos;
  for (let t = 0; t <= DURACAO; t += 0.1) {
    const e = estadoEm(t);
    const folga = e.pos[1] - alturaEm(e.pos[0], e.pos[2]) * escalaY;
    if (folga < pior) { pior = folga; piorT = t; }
    if (folga < (t < 12 ? 0.3 : 2.5)) falhou = true;
    const vel = Math.hypot(e.pos[0] - anterior[0], e.pos[1] - anterior[1], e.pos[2] - anterior[2]) / 0.1;
    if (t > 0) { vMax = Math.max(vMax, vel); vMin = Math.min(vMin, vel); }
    anterior = e.pos;
    if (Math.abs(t - Math.round(t)) < 1e-6 && Math.round(t) % 5 === 0) console.log(`  t=${String(Math.round(t)).padStart(2)} s  pos ${e.pos.map((v) => v.toFixed(1)).join(', ')}  relevo ${(alturaEm(e.pos[0], e.pos[2])).toFixed(0)} m  folga ${folga.toFixed(1)} km  vel ${vel.toFixed(1)} km/s`);
  }
  console.log(`folga mínima ${pior.toFixed(2)} km (cena) em t=${piorT.toFixed(1)} s; velocidade de ${vMin.toFixed(2)} a ${vMax.toFixed(2)} km/s`);
  if (falhou) { console.error('FOLGA INSUFICIENTE: a câmera chega perto demais do relevo'); process.exit(1); }
}
