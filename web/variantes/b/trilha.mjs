#!/usr/bin/env node
// Gera camera.json (61 s, 30 fps) da variante B a partir dos picos de picos.mjs.
//
// Trilha em três atos, sem corte:
//  1. 0–12 s: ao nível do mar logo depois da quebra da plataforma (perto de Vitória),
//     olhando para leste; a água esvazia até nivel_minimo_m e a câmera desce junto
//     com ela (3 km acima da superfície), limitada pelo fundo local com folga: os
//     montes emergem acima da linha do olho e o horizonte fica baixo.
//  2. 12–50 s: voa baixo (ALT_VOO abaixo do nível do mar) por um corredor entre os montes,
//     achado por programação dinâmica (custo de subida + atração à cadeia + curva), olhando
//     para um herói por vez (picos escolhidos por proeminência com espaçamento mínimo),
//     com passagem de bastão suave para o próximo.
//  3. 50–61 s: freia, sobe um pouco e termina olhando para a Ilha da Trindade inteira.
//
// Keyframes a cada 1 s (pos/alvo em km, SPEC); a página interpola por Catmull-Rom
// centrípeta. Água: além do nivel_agua_m por keyframe (contrato), a faixa "agua"
// é a descida contínua (smoothstep de 0 a nivel_minimo_m entre 0 e 10,5 s), para a
// descida não pulsar a cada keyframe. Tudo determinístico (nada de Date/Math.random).
//
// Uso: node web/variantes/b/trilha.mjs [slug]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerTerreno, geo, achaPicos } from './picos.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..', '..');
const slug = process.argv[2] || '002-vitoria-trindade';

const lugar = JSON.parse(fs.readFileSync(path.join(RAIZ, 'lugares', slug, 'lugar.json'), 'utf8'));
const T = lerTerreno(slug);
const g = geo(T.meta);
const EXAG = lugar.exagero_vertical;
const yDe = (m) => m * EXAG / 1000;
const DUR = 61, FPS = 30;
const AGUA_ATE_S = 10.5;          // a água chega ao mínimo aqui (o post do X usa 0–10 s)
const ALT_VOO = -25.0;            // km (cena) no voo: ≈ 1 670 m de profundidade real, abaixo dos cumes
const ACIMA_DA_AGUA = 3.0;        // km acima da superfície durante a descida
const FOLGA = 6.0;                // km mínimos acima do fundo (máximo local)
const ALT_FIM = -14.0;            // km no último quadro (a ilha inteira cabe no fov)
const ESPACO_HEROIS = 75;         // km mínimos entre heróis da rota

const smooth = (a, b, t) => { const u = Math.min(Math.max((t - a) / (b - a), 0), 1); return u * u * (3 - 2 * u); };

// Altura do relevo (m) em x,z da cena, bilinear.
function alturaEm(x, z) {
  const u = x / T.meta.km.largura + 0.5, v = z / T.meta.km.altura + 0.5;
  const px = Math.min(Math.max(u * T.W - 0.5, 0), T.W - 1), py = Math.min(Math.max(v * T.H - 0.5, 0), T.H - 1);
  const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j;
  const i1 = Math.min(i + 1, T.W - 1), j1 = Math.min(j + 1, T.H - 1);
  const h = T.h;
  return (h[j * T.W + i] * (1 - fx) + h[j * T.W + i1] * fx) * (1 - fy) + (h[j1 * T.W + i] * (1 - fx) + h[j1 * T.W + i1] * fx) * fy;
}
// Fundo "suavizado" para a folga: máximo numa vizinhança de ±raio km (a câmera não raspa em nada).
function fundoMaxEm(x, z, raio = 12) {
  let m = -Infinity;
  for (let dx = -raio; dx <= raio; dx += 3) for (let dz = -raio; dz <= raio; dz += 3) m = Math.max(m, alturaEm(x + dx, z + dz));
  return yDe(m);
}

// Picos (10 maiores por proeminência) e cume de Trindade (máximo no terço leste).
const picos = achaPicos(T, { n: 10, minProm: 200 }).map((p) => {
  const lon = g.lonDe(p.i, T.W), lat = g.latDe(p.j, T.H);
  return { x: g.xDe(lon), z: g.zDe(lat), y: yDe(p.elev_m), elev_m: p.elev_m, prom_m: p.prom_m, lon, lat };
});
let cume = { h: -Infinity, i: 0, j: 0 };
for (let j = 0; j < T.H; j++) for (let i = Math.floor(T.W * 0.66); i < T.W; i++) {
  const v = T.h[j * T.W + i]; if (v > cume.h) cume = { h: v, i, j };
}
const trindade = { x: g.xDe(g.lonDe(cume.i, T.W)), z: g.zDe(g.latDe(cume.j, T.H)), y: yDe(cume.h), elev_m: cume.h };

// Régua (Cristo) e partida: 18 km a leste da quebra da plataforma (primeiro ponto abaixo de
// -1000 m indo para leste da régua). A régua fica atrás da câmera.
const regua = lugar.regua ? { x: g.xDe(lugar.regua.lon), z: g.zDe(lugar.regua.lat) } : { x: -T.meta.km.largura * 0.45, z: 0 };
let quebra = regua.x;
while (quebra < T.meta.km.largura * 0.45 && alturaEm(quebra, regua.z) > -1000) quebra += 1;
const P0 = { x: quebra + 18, z: regua.z };
const FIM = { x: trindade.x - 92, z: trindade.z + 10 };   // a ilha inteira (≈70 km de altura na cena) cabe no fov de 50°

// Heróis da rota: picos a leste da partida e a oeste da ilha, escolhidos por proeminência
// com espaçamento mínimo em x (para a lane não ziguezaguear), depois em ordem de x.
const candidatos = picos.filter((p) => p.x > P0.x + 60 && p.x < FIM.x - 20).sort((a, b) => b.prom_m - a.prom_m);
const herois = [];
for (const p of candidatos) if (!herois.some((h) => Math.abs(h.x - p.x) < ESPACO_HEROIS)) herois.push(p);
herois.sort((a, b) => a.x - b.x);
const rota = picos.filter((p) => p.x > P0.x + 20 && p.x < trindade.x - 30).sort((a, b) => a.x - b.x);  // todos, para o alvo

// Lane em (x, z): corredor entre os montes por programação dinâmica. Passo de 10 km em x;
// candidatos de z a cada 5 km num corredor em volta da cadeia. Custo = subida acima de
// ALT_VOO ao quadrado + atração à linha da cadeia (kernel dos picos) + penalidade de curva.
// Depois média móvel de ±20 km e reamostragem por arco.
const zCadeia = (x) => { let sz = 0, sw = 0; for (const p of picos) { const w = Math.exp(-(((x - p.x) / 120) ** 2)); sz += w * p.z; sw += w; } return sw > 0 ? sz / sw : 0; };
const PASSO_X = 10, PASSO_Z = 5;
const xs = []; for (let x = P0.x; x < FIM.x; x += PASSO_X) xs.push(x); xs.push(FIM.x);
const zs = []; for (let z = -T.meta.km.altura * 0.45; z <= T.meta.km.altura * 0.45; z += PASSO_Z) zs.push(z);
const custoLocal = (x, z) => { const sub = Math.max(0, fundoMaxEm(x, z, 12) + FOLGA - ALT_VOO); return 0.5 * sub * sub + 0.004 * (z - zCadeia(x)) ** 2; };
const NZ = zs.length, NX = xs.length;
const acum = new Float64Array(NX * NZ).fill(Infinity), de = new Int32Array(NX * NZ).fill(-1);
const iz0 = zs.reduce((b, z, i) => Math.abs(z - P0.z) < Math.abs(zs[b] - P0.z) ? i : b, 0);
const izF = zs.reduce((b, z, i) => Math.abs(z - FIM.z) < Math.abs(zs[b] - FIM.z) ? i : b, 0);
acum[iz0] = 0;
const MAX_DZ = 3;   // até 15 km de desvio por 10 km (≈ 56°)
for (let ix = 1; ix < NX; ix++) {
  for (let iz = 0; iz < NZ; iz++) {
    const c = custoLocal(xs[ix], zs[iz]);
    let melhor = Infinity, melhorDe = -1;
    for (let d = -MAX_DZ; d <= MAX_DZ; d++) {
      const jz = iz + d; if (jz < 0 || jz >= NZ) continue;
      const v = acum[(ix - 1) * NZ + jz] + c + 0.6 * d * d;
      if (v < melhor) { melhor = v; melhorDe = jz; }
    }
    acum[ix * NZ + iz] = melhor; de[ix * NZ + iz] = melhorDe;
  }
}
const caminho = new Array(NX);
let izAtual = izF;
for (let ix = NX - 1; ix >= 0; ix--) { caminho[ix] = { x: xs[ix], z: zs[izAtual] }; izAtual = de[ix * NZ + izAtual] >= 0 ? de[ix * NZ + izAtual] : izAtual; }
caminho[0].z = P0.z; caminho[NX - 1].z = FIM.z;
const custoCaminho = acum[(NX - 1) * NZ + izF];
// média móvel de ±2 passos (±20 km) no z, mantendo as pontas; depois amostragem fina por arco
const zLiso = caminho.map((p, i) => { let sz = 0, n = 0; for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < NX) { sz += caminho[j].z; n++; } } return sz / n; });
zLiso[0] = P0.z; zLiso[NX - 1] = FIM.z;
const amostras = [];   // lane densa: {x, z, s}
{
  let s = 0, prev = null;
  for (let i = 0; i < NX - 1; i++) {
    const passos = Math.ceil((xs[i + 1] - xs[i]) / 0.25);
    for (let k = (i === 0 ? 0 : 1); k <= passos; k++) {
      const f = k / passos, fs = f * f * (3 - 2 * f);
      const q = { x: xs[i] + (xs[i + 1] - xs[i]) * f, z: zLiso[i] + (zLiso[i + 1] - zLiso[i]) * fs };
      if (prev) s += Math.hypot(q.x - prev.x, q.z - prev.z);
      amostras.push({ x: q.x, z: q.z, s });
      prev = q;
    }
  }
}
const L = amostras[amostras.length - 1].s;
function posNoArco(s) {
  s = Math.min(Math.max(s, 0), L);
  let lo = 0, hi = amostras.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (amostras[mid].s <= s) lo = mid; else hi = mid; }
  const a = amostras[lo], b = amostras[hi], f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
}

// Perfil de velocidade (km/s): devagar na descida, rampa suave, cruzeiro V, freio final.
function perfil(t, V) {
  if (t <= 12) return 3.0 + 3.0 * smooth(0, 12, t);                 // 3 → 6 km/s
  const rampa = smooth(12, 26, t), freio = smooth(50, 61, t);
  return 6.0 + (V - 6.0) * rampa - (V - 2.4) * freio;               // sobe até V, desce até 2,4
}
function distancia(V) { let s = 0; const dt = 1 / 240; for (let t = 0; t < DUR; t += dt) s += perfil(t + dt / 2, V) * dt; return s; }
let lo = 6, hi = 80; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (distancia(mid) < L) lo = mid; else hi = mid; }
const V = (lo + hi) / 2;
const arcos = new Map();
{ let s = 0; const dt = 1 / 240; for (let t = 0; t <= DUR + 1e-9; t += dt) { arcos.set(Math.round(t * 240), s); s += perfil(t + dt / 2, V) * dt; } }
const arcoEm = (t) => arcos.get(Math.round(t * 240)) ?? L;

const aguaEm = (t) => lugar.nivel_minimo_m * smooth(0, AGUA_ATE_S, t);

// Altitude: elevador com a água (ato 1), subida até ALT_VOO (ato 2), 3 km no fim; sempre ≥ fundo + folga;
// depois uma média móvel de ±1,5 s para não ter quina onde a folga assume.
const PASSO = 0.1;
const bruto = [];
for (let t = 0; t <= DUR + 1e-9; t += PASSO) {
  const { x, z } = posNoArco(arcoEm(t));
  const elevador = yDe(aguaEm(t)) + ACIMA_DA_AGUA;
  const voo = elevador + (ALT_VOO - elevador) * smooth(8, 16, t);
  const base = voo + (ALT_FIM - voo) * smooth(49, 61, t);
  bruto.push({ t, x, z, y: Math.max(base, fundoMaxEm(x, z) + FOLGA) });
}
const JANELA = Math.round(1.5 / PASSO);
const ySuave = bruto.map((_, i) => {
  let s = 0, n = 0;
  for (let k = -JANELA; k <= JANELA; k++) { const j = i + k; if (j >= 0 && j < bruto.length) { s += bruto[j].y; n++; } }
  return s / n;
});

// Alvo: UM herói por vez. O herói atual é o primeiro ainda 30 km à frente; quando a câmera entra na
// janela [x_herói - 110, x_herói - 30], o alvo passa suavemente (smoothstep) para o herói seguinte.
// O último "herói" é Trindade (meio da ilha, para ela caber inteira).
const alvos = [...herois.map((h) => ({ x: h.x, y: h.y - 2, z: h.z })), { x: trindade.x, y: -20, z: trindade.z }];
function alvoEm(t, pos) {
  let k = alvos.findIndex((a) => a.x > pos.x + 30);
  if (k < 0) k = alvos.length - 1;
  const a = alvos[k], b = alvos[Math.min(k + 1, alvos.length - 1)];
  const f = k < alvos.length - 1 ? smooth(a.x - 110, a.x - 30, pos.x) : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
}

const keyframes = [];
let folgaMin = Infinity;
for (let t = 0; t <= DUR; t += 1) {
  const i = Math.round(t / PASSO);
  const { x, z } = bruto[i];
  const y = ySuave[i];
  const pos = { x, y, z };
  const alvo = alvoEm(t, pos);
  folgaMin = Math.min(folgaMin, y - yDe(alturaEm(x, z)));
  keyframes.push({ t, pos: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], alvo: [+alvo.x.toFixed(2), +alvo.y.toFixed(2), +alvo.z.toFixed(2)], nivel_agua_m: +aguaEm(t).toFixed(1), fov: 50 });
}

const saida = {
  slug, duracao_s: DUR, fps: FPS,
  nota: 'Gerado por web/variantes/b/trilha.mjs a partir de picos.mjs. Posições e alvos em km (SPEC). A faixa "agua" é a descida contínua (smoothstep entre as duas marcas); nivel_agua_m por keyframe é a mesma curva amostrada, para leitores que só conhecem o contrato.',
  agua: [{ t: 0, m: 0 }, { t: AGUA_ATE_S, m: lugar.nivel_minimo_m }],
  herois: herois.map((p) => ({ lon: +p.lon.toFixed(4), lat: +p.lat.toFixed(4), cume_m: +p.elev_m.toFixed(1), proeminencia_m: +p.prom_m.toFixed(1), x_km: +p.x.toFixed(1), z_km: +p.z.toFixed(1) })),
  picos: rota.map((p) => ({ lon: +p.lon.toFixed(4), lat: +p.lat.toFixed(4), cume_m: +p.elev_m.toFixed(1), proeminencia_m: +p.prom_m.toFixed(1), x_km: +p.x.toFixed(1), z_km: +p.z.toFixed(1) })),
  trindade: { x_km: +trindade.x.toFixed(1), z_km: +trindade.z.toFixed(1), cume_m: +trindade.elev_m.toFixed(1) },
  keyframes,
};
// O lugar padrão da página grava camera.json; outros gravam camera-<slug>.json (nunca sobrescrevem a 002).
const arquivoSaida = slug === '002-vitoria-trindade' ? 'camera.json' : `camera-${slug}.json`;
fs.writeFileSync(path.join(AQUI, arquivoSaida), JSON.stringify(saida, null, 1).replace(/\[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, '[$1, $2, $3]') + '\n');
console.log(`${arquivoSaida}: ${keyframes.length} keyframes, lane ${L.toFixed(0)} km (custo do corredor ${custoCaminho.toFixed(1)}), cruzeiro ${V.toFixed(1)} km/s, folga mínima sobre o relevo ${folgaMin.toFixed(2)} km`);
console.log('corredor z por x:', caminho.filter((_, i) => i % 5 === 0).map((p) => `${p.x.toFixed(0)}:${p.z.toFixed(0)}`).join(' '));
console.log('heróis da lane (oeste → leste):', herois.map((p) => `${p.x.toFixed(0)}/${p.z.toFixed(0)} (${p.elev_m.toFixed(0)} m, prom ${p.prom_m.toFixed(0)})`).join('  '));
console.log('quebra da plataforma x:', quebra.toFixed(0), ' início:', P0, ' fim:', FIM, ' Trindade:', trindade);
for (const k of keyframes.filter((k) => [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 55, 61].includes(k.t))) console.log(JSON.stringify(k));
