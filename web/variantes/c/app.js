// Brasil sem mar — variante C: "superfície escura com arestas".
// Superfície sólida quase preta (azul-petróleo) sombreada por normal e luz rasante;
// arestas e contornos neon (ciano na terra, violeta no fundo do mar); rim light nos
// topos; água como plano translúcido com reflexo planar sutil e borda luminosa;
// bloom médio-forte; névoa de profundidade; fundo preto puro (a esteira compõe em
// "lighter"). Contrato: window.__bsm (SPEC.md). Sem Date.now/Math.random na cena.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { prepararTrilha, trilhaPadrao } from './trilha.js';

// ---------------------------------------------------------------- parâmetros de look
const LOOK = {
  ciano: [0.22, 0.92, 1.0],
  violeta: [0.58, 0.30, 1.0],
  laranja: [1.0, 0.56, 0.18],
  albedoMar: [0.035, 0.090, 0.150],     // azul-petróleo, lido quase preto no contra
  albedoTerra: [0.025, 0.105, 0.115],
  luz: [-0.80, 0.22, 0.40],             // direção DE ONDE vem a luz (rasante, de oés-sudoeste)
  nevoa: 0.0022,                        // 1/km; ~23 % de névoa a 230 km
  contornoMar: 500, contornoTerra: 100, // metros
  bloom: { forca: 0.85, raio: 0.55, limiar: 0.35 },
  exposicao: 1.0,
};

// ---------------------------------------------------------------- URL e modos
const url = new URL(location.href);
const slug = url.searchParams.get('lugar') || '002-vitoria-trindade';
const CAPTURA = url.searchParams.get('capture') === '1';
const tInicial = Number(url.searchParams.get('t') || 0);
const BASE = '../../../';
const dirLugar = `${BASE}lugares/${slug}/`;

const $ = (id) => document.getElementById(id);
const canvas = $('cena');

// ---------------------------------------------------------------- __bsm (contrato)
let resolveReady, rejectReady;
const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
const bsm = {
  ready,
  setTime: async () => {},
  duration: () => 0,
  setWater: () => {},
  getState: () => ({ t: 0, nivel_agua_m: 0, pos: [0, 0, 0], alvo: [0, 0, 0] }),
  metrics: () => ({ calls: 0, triangles: 0 }),
};
window.__bsm = bsm;

function avisar(msg) {
  console.error(msg);
  const el = $('aviso');
  if (el && !CAPTURA) { el.textContent = msg; el.hidden = false; }
}

// ---------------------------------------------------------------- carga de dados
async function carregarJson(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`não achei ${u} (HTTP ${r.status})`);
  return r.json();
}

// Terrain-RGB → Float32 (metros) via canvas, sem conversão de cor nem premultiplicação
async function carregarTerreno(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`não achei ${u} (HTTP ${r.status})`);
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const w = bmp.width, h = bmp.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const d = ctx.getImageData(0, 0, w, h).data;
  const alt = new Float32Array(w * h);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const v = -10000 + (d[p] * 65536 + d[p + 1] * 256 + d[p + 2]) * 0.1;
    alt[i] = v;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { w, h, alt, mn, mx };
}

// reamostra (bilinear) para caber no orçamento de textura (≤ 2048 de largura)
function reamostrar(src, w2) {
  const h2 = Math.max(2, Math.round(src.h * w2 / src.w));
  const out = new Float32Array(w2 * h2);
  for (let j = 0; j < h2; j++) {
    const fy = (j / (h2 - 1)) * (src.h - 1), y0 = Math.floor(fy), y1 = Math.min(src.h - 1, y0 + 1), ty = fy - y0;
    for (let i = 0; i < w2; i++) {
      const fx = (i / (w2 - 1)) * (src.w - 1), x0 = Math.floor(fx), x1 = Math.min(src.w - 1, x0 + 1), tx = fx - x0;
      const a = src.alt[y0 * src.w + x0], b = src.alt[y0 * src.w + x1], c = src.alt[y1 * src.w + x0], e = src.alt[y1 * src.w + x1];
      out[j * w2 + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    }
  }
  return { w: w2, h: h2, alt: out, mn: src.mn, mx: src.mx };
}

function alturaEm(ter, u, v) { // bilinear no array JS, u/v em [0,1]
  const fx = Math.min(Math.max(u, 0), 1) * (ter.w - 1), fy = Math.min(Math.max(v, 0), 1) * (ter.h - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(ter.w - 1, x0 + 1), y1 = Math.min(ter.h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const a = ter.alt[y0 * ter.w + x0], b = ter.alt[y0 * ter.w + x1], c = ter.alt[y1 * ter.w + x0], e = ter.alt[y1 * ter.w + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
}

// GLB mínimo (uma malha, sem Draco, sem textura) para quando o GLTFLoader não carrega
function parseGlbSimples(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('não é GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), tipo = dv.getUint32(off + 4, true);
    if (tipo === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (tipo === 0x004e4942) bin = buf.slice(off + 8, off + 8 + len);
    off += 8 + len;
  }
  const acessor = (idx) => {
    const a = json.accessors[idx], bv = json.bufferViews[a.bufferView];
    const comp = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    if (bv.byteStride && bv.byteStride !== n * comp.BYTES_PER_ELEMENT) throw new Error('GLB com stride');
    return { arr: new comp(bin, start, a.count * n), n };
  };
  const prim = json.meshes[0].primitives[0];
  const g = new THREE.BufferGeometry();
  const pos = acessor(prim.attributes.POSITION);
  g.setAttribute('position', new THREE.BufferAttribute(pos.arr, pos.n));
  if (prim.attributes.NORMAL !== undefined) { const nr = acessor(prim.attributes.NORMAL); g.setAttribute('normal', new THREE.BufferAttribute(nr.arr, nr.n)); }
  else g.computeVertexNormals();
  if (prim.indices !== undefined) { const ix = acessor(prim.indices); g.setIndex(new THREE.BufferAttribute(ix.arr, 1)); }
  return g;
}

async function carregarRegua(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`não achei ${u} (HTTP ${r.status})`);
  const buf = await r.arrayBuffer();
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
    let geo = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
    if (!geo) throw new Error('GLB sem malha');
    return geo;
  } catch (e) {
    console.warn('GLTFLoader indisponível, usando parser mínimo:', e?.message || e);
    return parseGlbSimples(buf);
  }
}

// ---------------------------------------------------------------- shaders
const GLSL_ALTURA = /* glsl */`
uniform sampler2D uAlt;
uniform vec2 uTexSize;
float fetchH(ivec2 c) {
  c = clamp(c, ivec2(0), ivec2(uTexSize) - 1);
  return texelFetch(uAlt, c, 0).r;
}
vec4 linha4(ivec2 b, int j) {
  return vec4(fetchH(b + ivec2(-1, j)), fetchH(b + ivec2(0, j)), fetchH(b + ivec2(1, j)), fetchH(b + ivec2(2, j)));
}
vec4 crW(float t) { float t2 = t * t, t3 = t2 * t; return vec4(-0.5*t3 + t2 - 0.5*t, 1.5*t3 - 2.5*t2 + 1.0, -1.5*t3 + 2.0*t2 + 0.5*t, 0.5*t3 - 0.5*t2); }
vec4 crD(float t) { float t2 = t * t; return vec4(-1.5*t2 + 2.0*t - 0.5, 4.5*t2 - 5.0*t, -4.5*t2 + 4.0*t + 0.5, 1.5*t2 - t); }
// Catmull-Rom bicúbica: (altura, d/dpx, d/dpy) em coordenadas de texel (centros em inteiros)
vec3 alturaCR(vec2 p) {
  vec2 f = floor(p); vec2 t = p - f; ivec2 b = ivec2(f);
  vec4 wx = crW(t.x), wy = crW(t.y), dx = crD(t.x), dy = crD(t.y);
  vec4 r0 = linha4(b, -1), r1 = linha4(b, 0), r2 = linha4(b, 1), r3 = linha4(b, 2);
  vec4 hv = vec4(dot(wx, r0), dot(wx, r1), dot(wx, r2), dot(wx, r3));
  vec4 dv = vec4(dot(dx, r0), dot(dx, r1), dot(dx, r2), dot(dx, r3));
  return vec3(dot(wy, hv), dot(wy, dv), dot(dy, hv));
}
// bilinear manual (4 taps) para o stencil largo da curvatura
float alturaBL(vec2 p) {
  vec2 f = floor(p); vec2 t = p - f; ivec2 b = ivec2(f);
  float a = fetchH(b), c = fetchH(b + ivec2(1, 0)), d = fetchH(b + ivec2(0, 1)), e = fetchH(b + ivec2(1, 1));
  return mix(mix(a, c, t.x), mix(d, e, t.x), t.y);
}
`;

const VS_TERRENO = /* glsl */`
${GLSL_ALTURA}
uniform float uExag;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  float h = alturaCR(uv * uTexSize - 0.5).x;
  vec3 p = vec3(position.x, h * uExag, position.z);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS_TERRENO = /* glsl */`
${GLSL_ALTURA}
uniform float uExag;
uniform vec2 uKm;
uniform float uWater;
uniform vec3 uLight;
uniform float uFog;
uniform vec3 uCyan, uViolet, uAlbMar, uAlbTerra;
uniform float uContourSea, uContourLand;
uniform float uCrest;
uniform vec4 uDbg;   // x: linha d'água/maré, y: rim+cristas, z: contornos, w: corpo
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;

void main() {
  vec2 p = vUv * uTexSize - 0.5;
  vec3 s = alturaCR(p);
  float h = s.x;
  vec2 texelKm = uKm / uTexSize;
  vec3 n = normalize(vec3(-s.y / texelKm.x * uExag, 1.0, -s.z / texelKm.y * uExag));
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-4);
  float ndl = dot(n, uLight);
  float ndv = max(dot(n, V), 0.0);
  float land = smoothstep(0.0, 20.0, h);     // 0 m exato ainda é fundo do mar (artefato de fusão)
  vec3 neon = mix(uViolet, uCyan, land);

  // superfície: quase preta no contra, forma pela luz rasante; preenchimento violeta no contra
  vec3 albedo = mix(uAlbMar, uAlbTerra, land);
  float wrap = max(ndl * 0.85 + 0.15, 0.0);
  vec3 col = albedo * (wrap * 1.1 + 0.03);
  col += vec3(0.05, 0.02, 0.09) * max(dot(n, vec3(-uLight.x, uLight.y, -uLight.z)), 0.0) * 0.35;

  // inclinação e "topo" (altura relativa ao relevo)
  float slope = clamp(1.0 - n.y, 0.0, 1.0);
  float topo = smoothstep(-3000.0, 100.0, h);

  // arestas: a silhueta é detectada em espaço de tela (onde n·v cruza zero), fica
  // com ~2 px de largura em qualquer distância; um rim suave e fraco dá volume.
  // Uma encosta inteira em ângulo rasante NÃO vira chapa (era o defeito da v1).
  float queda = 1.0 / (1.0 + dist * 0.003);
  float fwNdv = max(fwidth(ndv) * 2.0, 0.004);
  float silhueta = (1.0 - smoothstep(0.0, fwNdv, ndv)) * smoothstep(0.01, 0.1, slope);
  float rimSuave = pow(1.0 - ndv, 4.0) * smoothstep(0.015, 0.22, slope) * 0.12;
  float rim = (silhueta * 0.9 + rimSuave) * (0.4 + 0.6 * topo) * queda;

  // cristas: curvatura convexa (laplaciano negativo) com stencil que cresce com a distância
  float k = clamp(dist * 0.012, 1.5, 7.0);
  float hL = alturaBL(p - vec2(k, 0.0)), hR = alturaBL(p + vec2(k, 0.0)), hU = alturaBL(p - vec2(0.0, k)), hD = alturaBL(p + vec2(0.0, k));
  float lap = hL + hR + hU + hD - 4.0 * h;
  float crest = smoothstep(0.0, 1.0, -lap / (k * k) / uCrest) * (0.3 + 0.7 * topo) * queda;
  // relevo em escala larga (m por texel): planície costeira e plataforma rasa (0 a 4 m
  // em dezenas de km) não ganham linha d'água — nelas a isolinha é fractal e vira chapa
  float gradK = length(vec2(hR - hL, hD - hU)) / (2.0 * k);
  float relevo = smoothstep(2.0, 8.0, gradK);

  // contornos finos com antialias por fwidth; somem quando ficam densos (moiré)
  float interval = mix(uContourSea, uContourLand, land);
  float fw = max(fwidth(h), 1e-3);
  float c = h / interval;
  float dC = (0.5 - abs(fract(c) - 0.5)) * interval;
  float lineW = clamp(fw * 1.1, 0.4, interval * 0.08);
  float contour = (1.0 - smoothstep(lineW * 0.5, lineW * 1.5, dC)) * (1.0 - smoothstep(0.10, 0.30, fw / interval));

  // linha d'água atual: traço forte + halo
  float dw = h - uWater;
  // largura da linha em metros limitada por distância: perto, costa plana e ruidosa
  // em ângulo rasante não vira chapa branca; longe, a linha nos montes continua legível
  // linha d'água: largura só em espaço de tela (~1,5 px), sem mínimo em metros —
  // senão a planície costeira a 1–10 m acende em manchas quando o nível está em 0
  float lw = max(fwidth(dw) * 1.5, 0.05);
  float encosta = smoothstep(0.003, 0.03, slope) * relevo;   // platô plano no nível não é linha
  float wline = (1.0 - smoothstep(lw * 0.5, lw * 1.5, abs(dw))) * encosta;
  float under = smoothstep(0.0, -40.0, dw);

  col *= uDbg.w;
  col += neon * (min(rim + crest * 0.45, 1.2) * uDbg.y + contour * 0.15 * uDbg.z);
  vec3 corAgua = mix(uCyan, vec3(1.0), 0.45);
  col += corAgua * wline * 1.1 * uDbg.x;
  col *= mix(1.0, 0.6, under);

  float fog = 1.0 - exp(-pow(dist * uFog, 2.0));
  col *= (1.0 - fog);
  outColor = vec4(col, 1.0);
}
`;

const VS_AGUA = /* glsl */`
uniform mat4 uTexMatrix;
out vec3 vWorld;
out vec4 vRef;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vRef = uTexMatrix * w;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FS_AGUA = /* glsl */`
${GLSL_ALTURA}
uniform sampler2D uRefl;
uniform vec2 uKm;
uniform float uWater;
uniform float uFog;
uniform float uTime;
uniform vec3 uCyan;
uniform vec4 uDbg;   // x: reflexo, y: borda+halo, z: mostrar só o reflexo, w: base
in vec3 vWorld;
in vec4 vRef;
out vec4 outColor;
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-4);
  float ndv = abs(V.y);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  // reflexo planar sutil, com uma ondulação mínima e determinística
  vec2 ruv = vRef.xy / max(vRef.w, 1e-4);
  vec2 ond = vec2(sin(vWorld.x * 0.9 + vWorld.z * 0.4 + uTime * 0.9), cos(vWorld.z * 1.1 - vWorld.x * 0.3 + uTime * 0.7)) * 0.0022;
  vec3 refl = texture(uRefl, clamp(ruv + ond, 0.0, 1.0)).rgb;
  vec3 base = vec3(0.006, 0.018, 0.040) + vec3(0.03, 0.10, 0.14) * fres;   // sheen rasante: a superfície existe no quadro zero
  vec3 col = base * uDbg.w + refl * (0.15 + 0.35 * fres) * uDbg.x;
  // borda luminosa: onde o terreno está logo abaixo da superfície
  vec2 uvT = vWorld.xz / uKm + 0.5;
  vec2 pT = clamp(uvT, 0.0, 1.0) * uTexSize - 0.5;
  float hT = alturaBL(pT);
  float gradK = length(vec2(alturaBL(pT + vec2(2.0, 0.0)) - alturaBL(pT - vec2(2.0, 0.0)), alturaBL(pT + vec2(0.0, 2.0)) - alturaBL(pT - vec2(0.0, 2.0)))) / 4.0;
  float relevo = smoothstep(2.0, 8.0, gradK);    // sem borda luminosa em planície rasa
  float depth = uWater - hT;                      // coluna d'água aqui (m)
  float fwd = clamp(fwidth(depth) * 2.0, 0.5, 1.5 + dist * 0.25);   // ~2 px na costa; em ângulo rasante não vira faixa
  float edge = (1.0 - smoothstep(0.0, fwd, depth)) * step(0.05, depth);   // 5 cm: baía plana a 0 m fica fora
  float halo = exp(-max(depth, 0.0) / 12.0) * 0.15 * step(0.05, depth);
  col += mix(uCyan, vec3(1.0), 0.35) * (edge * 1.0 + halo) * relevo * uDbg.y;
  if (uDbg.z > 0.5) { outColor = vec4(refl, 1.0); return; }
  float alpha = 0.72 + 0.26 * fres;
  alpha = max(alpha, edge * 0.95);
  float fog = 1.0 - exp(-pow(dist * uFog, 2.0));
  col *= (1.0 - fog);
  alpha *= (1.0 - fog);
  outColor = vec4(col, alpha);
}
`;

const VS_REGUA = /* glsl */`
out vec3 vN;
out vec3 vWorld;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FS_REGUA = /* glsl */`
uniform vec3 uLight;
uniform vec3 uCor;
uniform float uFog;
in vec3 vN;
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-4);
  float ndl = max(dot(n, uLight), 0.0);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  vec3 col = vec3(0.02, 0.018, 0.015) + uCor * (ndl * 0.25 + rim * 1.6);
  float fog = 1.0 - exp(-pow(dist * uFog, 2.0));
  outColor = vec4(col * (1.0 - fog), 1.0);
}
`;

// ---------------------------------------------------------------- cena
async function iniciar() {
  const t0 = performance.now();
  const [lugar, meta] = await Promise.all([carregarJson(dirLugar + 'lugar.json'), carregarJson(dirLugar + 'terreno.json')]);
  const exagero = lugar.exagero_vertical ?? 15;
  const exag = exagero / 1000; // km por metro
  const nivelMin = lugar.nivel_minimo_m ?? -6000;

  // trilha: a da variante (./camera.json) se for deste lugar; senão a do lugar; senão a padrão
  const bb = meta.bbox;
  const latC = (bb.norte + bb.sul) / 2;
  const kmW = (bb.leste - bb.oeste) * 111.32 * Math.cos(latC * Math.PI / 180);
  const kmH = (bb.norte - bb.sul) * 111.32;
  let trilhaJson = null;
  try { const c = await carregarJson('./camera.json'); if (!c.lugar || c.lugar === slug) trilhaJson = c; } catch { /* sem camera.json aqui */ }
  if (!trilhaJson) { try { trilhaJson = await carregarJson(dirLugar + 'camera.json'); } catch { trilhaJson = trilhaPadrao(kmW, kmH, nivelMin); } }
  const trilha = prepararTrilha(trilhaJson);

  // terreno
  let ter = await carregarTerreno(dirLugar + 'terreno.png');
  if (Number.isFinite(meta.elev_min_m) && (Math.abs(ter.mn - meta.elev_min_m) > 1 || Math.abs(ter.mx - meta.elev_max_m) > 1)) {
    console.warn(`terreno decodificado min/max ${ter.mn.toFixed(1)}/${ter.mx.toFixed(1)} difere do terreno.json ${meta.elev_min_m}/${meta.elev_max_m}`);
  }
  if (ter.w > 2048) ter = reamostrar(ter, 2048);

  // renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURA });
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.exposicao;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;
  const dpr = CAPTURA ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  const tamanho = () => ({ w: Math.max(1, Math.floor(window.innerWidth)), h: Math.max(1, Math.floor(window.innerHeight)) });
  let { w: W, h: H } = tamanho();
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 4000);

  // textura de altura (R32F, nearest: a filtragem é bicúbica no shader)
  const texAlt = new THREE.DataTexture(ter.alt, ter.w, ter.h, THREE.RedFormat, THREE.FloatType);
  texAlt.magFilter = THREE.NearestFilter; texAlt.minFilter = THREE.NearestFilter;
  texAlt.generateMipmaps = false; texAlt.wrapS = THREE.ClampToEdgeWrapping; texAlt.wrapT = THREE.ClampToEdgeWrapping;
  texAlt.colorSpace = THREE.NoColorSpace; texAlt.needsUpdate = true;

  // malha: até 1024 de largura, ≤ 1 M de triângulos
  const segX = Math.min(1024, ter.w - 1);
  let segZ = Math.max(8, Math.round(segX * kmH / kmW));
  segZ = Math.min(segZ, Math.floor(1e6 / (2 * segX)));
  const geo = (() => {
    const nx = segX + 1, nz = segZ + 1;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) {
      const v = j / segZ;
      for (let i = 0; i < nx; i++) {
        const u = i / segX, o = j * nx + i;
        pos[o * 3] = (u - 0.5) * kmW; pos[o * 3 + 1] = 0; pos[o * 3 + 2] = (v - 0.5) * kmH;
        uv[o * 2] = u; uv[o * 2 + 1] = v;
      }
    }
    const idx = new Uint32Array(segX * segZ * 6);
    let q = 0;
    for (let j = 0; j < segZ; j++) for (let i = 0; i < segX; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const yMin = ter.mn * exag, yMax = ter.mx * exag;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-kmW / 2, yMin, -kmH / 2), new THREE.Vector3(kmW / 2, yMax, kmH / 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (yMin + yMax) / 2, 0), Math.hypot(kmW / 2, (yMax - yMin) / 2, kmH / 2));
    return g;
  })();

  const luz = new THREE.Vector3(...LOOK.luz).normalize();
  const matTerreno = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VS_TERRENO, fragmentShader: FS_TERRENO,
    uniforms: {
      uAlt: { value: texAlt }, uTexSize: { value: new THREE.Vector2(ter.w, ter.h) }, uExag: { value: exag },
      uKm: { value: new THREE.Vector2(kmW, kmH) }, uWater: { value: 0 }, uLight: { value: luz }, uFog: { value: LOOK.nevoa },
      uCyan: { value: new THREE.Vector3(...LOOK.ciano) }, uViolet: { value: new THREE.Vector3(...LOOK.violeta) },
      uAlbMar: { value: new THREE.Vector3(...LOOK.albedoMar) }, uAlbTerra: { value: new THREE.Vector3(...LOOK.albedoTerra) },
      uContourSea: { value: LOOK.contornoMar }, uContourLand: { value: LOOK.contornoTerra }, uCrest: { value: 400.0 }, uDbg: { value: new THREE.Vector4(1, 1, 1, 1) },
    },
    side: THREE.FrontSide,
  });
  const terreno = new THREE.Mesh(geo, matTerreno);
  terreno.frustumCulled = false;
  scene.add(terreno);

  // água: plano translúcido com reflexo planar (render-to-texture, câmera espelhada)
  const reflRT = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(W * dpr / 2)), Math.max(2, Math.floor(H * dpr / 2)), {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
  });
  const matAgua = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VS_AGUA, fragmentShader: FS_AGUA,
    uniforms: {
      uAlt: { value: texAlt }, uTexSize: { value: new THREE.Vector2(ter.w, ter.h) }, uRefl: { value: reflRT.texture },
      uTexMatrix: { value: new THREE.Matrix4() }, uKm: { value: new THREE.Vector2(kmW, kmH) }, uWater: { value: 0 },
      uFog: { value: LOOK.nevoa }, uTime: { value: 0 }, uCyan: { value: new THREE.Vector3(...LOOK.ciano) },
      uDbg: { value: new THREE.Vector4(1, 1, 0, 1) },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const agua = new THREE.Mesh(new THREE.PlaneGeometry(kmW * 3, kmH * 6), matAgua);
  agua.rotation.x = -Math.PI / 2;
  agua.renderOrder = 10;
  agua.frustumCulled = false;
  scene.add(agua);

  // régua: Cristo Redentor (30 m, base em y = 0) sobre o terreno em regua.lon/lat
  let regua = null;
  if (lugar.regua && Number.isFinite(lugar.regua.lon)) {
    try {
      const g = await carregarRegua(`${BASE}regua/cristo-web.glb`);
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: VS_REGUA, fragmentShader: FS_REGUA,
        uniforms: { uLight: { value: luz }, uCor: { value: new THREE.Vector3(...LOOK.laranja) }, uFog: { value: LOOK.nevoa } },
      });
      regua = new THREE.Mesh(g, mat);
      const u = (lugar.regua.lon - bb.oeste) / (bb.leste - bb.oeste), v = (bb.norte - lugar.regua.lat) / (bb.norte - bb.sul);
      const hR = alturaEm(ter, u, v);
      const s = exag * (lugar.regua.escala ?? 1);
      regua.scale.setScalar(s);
      regua.position.set((u - 0.5) * kmW, hR * exag, (v - 0.5) * kmH);
      regua.rotation.y = Math.PI / 2; // o GLB olha para +z; aqui olha para o leste (+x)
      scene.add(regua);
      regua.userData.altura_terreno_m = hR;
    } catch (e) { console.warn('régua não carregou:', e?.message || e); }
  }

  // composição: render → bloom → saída (tone mapping + sRGB)
  const alvoRT = new THREE.WebGLRenderTarget(W * dpr, H * dpr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, alvoRT);
  composer.setPixelRatio(dpr);
  composer.setSize(W, H);
  const passRender = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W * dpr, H * dpr), LOOK.bloom.forca, LOOK.bloom.raio, LOOK.bloom.limiar);
  composer.addPass(passRender);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // espelho (como o Reflector dos addons, sem o objeto)
  const mirrorCam = new THREE.PerspectiveCamera();
  const tmp = {
    plano: new THREE.Plane(), normal: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(), alvo: new THREE.Vector3(),
    rot: new THREE.Matrix4(), olhar: new THREE.Vector3(), clip: new THREE.Vector4(), q: new THREE.Vector4(),
    texMat: new THREE.Matrix4(), posEsp: new THREE.Vector3(), posCam: new THREE.Vector3(),
  };
  function renderReflexo() {
    const { normal, v, alvo, rot, olhar, clip, q, texMat, posEsp, posCam, plano } = tmp;
    posEsp.set(0, agua.position.y, 0);
    posCam.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(camera.matrixWorld);
    v.subVectors(posEsp, posCam);
    if (v.dot(normal) > 0) { // câmera abaixo da água: sem reflexo
      renderer.setRenderTarget(reflRT); renderer.clear(); renderer.setRenderTarget(null); return;
    }
    v.reflect(normal).negate().add(posEsp);
    olhar.set(0, 0, -1).applyMatrix4(rot).add(posCam);
    alvo.subVectors(posEsp, olhar).reflect(normal).negate().add(posEsp);
    mirrorCam.position.copy(v);
    mirrorCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    mirrorCam.lookAt(alvo);
    mirrorCam.near = camera.near; mirrorCam.far = camera.far;
    mirrorCam.updateMatrixWorld();
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texMat.multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
    matAgua.uniforms.uTexMatrix.value.copy(texMat);
    // plano de corte oblíquo: só o que está acima da água entra no reflexo
    plano.setFromNormalAndCoplanarPoint(normal, posEsp).applyMatrix4(mirrorCam.matrixWorldInverse);
    clip.set(plano.normal.x, plano.normal.y, plano.normal.z, plano.constant);
    const pm = mirrorCam.projectionMatrix;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0 - 0.0; pm.elements[14] = clip.w;
    agua.visible = false;
    renderer.setRenderTarget(reflRT);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(null);
    agua.visible = true;
  }

  // estado
  const estado = { t: 0, nivel_agua_m: 0, pos: [0, 0, 0], alvo: [0, 0, 0], fov: 50, manual: false };
  const alvoVec = new THREE.Vector3();
  let ultimas = { calls: 0, triangles: 0 };

  function aplicarAgua(m) {
    estado.nivel_agua_m = m;
    agua.position.y = m * exag;
    matTerreno.uniforms.uWater.value = m;
    matAgua.uniforms.uWater.value = m;
  }
  function desenhar() {
    renderer.info.reset();
    camera.updateMatrixWorld();
    renderReflexo();
    composer.render();
    ultimas = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }
  function aplicarTempo(t) {
    const a = trilha.amostrar(t);
    estado.t = t; estado.pos = a.pos; estado.alvo = a.alvo; estado.fov = a.fov;
    camera.position.set(a.pos[0], a.pos[1], a.pos[2]);
    alvoVec.set(a.alvo[0], a.alvo[1], a.alvo[2]);
    camera.lookAt(alvoVec);
    if (camera.fov !== a.fov) { camera.fov = a.fov; camera.updateProjectionMatrix(); }
    aplicarAgua(a.nivel_agua_m);
    matAgua.uniforms.uTime.value = t;
    if (controls) { controls.target.copy(alvoVec); }
  }
  const proximoQuadro = () => new Promise((res) => requestAnimationFrame(() => res()));

  function redimensionar() {
    const s = tamanho();
    if (s.w === W && s.h === H) return;
    W = s.w; H = s.h;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    bloom.setSize(W * dpr, H * dpr);
    reflRT.setSize(Math.max(2, Math.floor(W * dpr / 2)), Math.max(2, Math.floor(H * dpr / 2)));
  }

  // ---- contrato
  bsm.duration = () => trilha.duracao;
  bsm.setTime = async (t) => {
    estado.manual = false;
    aplicarTempo(Number(t) || 0);
    desenhar();
    await proximoQuadro();
  };
  bsm.setWater = (m) => { aplicarAgua(Number(m) || 0); desenhar(); };
  bsm.getState = () => ({
    t: estado.t, nivel_agua_m: estado.nivel_agua_m,
    pos: [camera.position.x, camera.position.y, camera.position.z],
    alvo: controls && controls.enabled ? controls.target.toArray() : estado.alvo.slice(),
  });
  // diagnóstico (fora do contrato): liga/desliga camadas e redesenha
  bsm._debug = (f = {}) => {
    matTerreno.uniforms.uDbg.value.set(f.linha === false ? 0 : 1, f.arestas === false ? 0 : 1, f.contornos === false ? 0 : 1, f.corpo === false ? 0 : 1);
    matAgua.uniforms.uDbg.value.set(f.reflexo === false ? 0 : 1, f.borda === false ? 0 : 1, f.mostrarReflexo ? 1 : 0, f.baseAgua === false ? 0 : 1);
    agua.visible = f.agua !== false;
    if (regua) regua.visible = f.regua !== false;
    bloom.enabled = f.bloom !== false;
    desenhar();
    return proximoQuadro();
  };
  bsm.metrics = () => ({ calls: ultimas.calls, triangles: ultimas.triangles, segmentos: [segX, segZ], textura: [ter.w, ter.h], dpr, largura: W, altura: H });

  // ---- interativo
  let controls = null;
  if (!CAPTURA) {
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false; controls.enabled = false;
    controls.minDistance = 0.5; controls.maxDistance = Math.max(kmW, kmH) * 2;
    controls.maxPolarAngle = Math.PI * 0.95;
    montarUi();
  }

  function montarUi() {
    const ui = $('ui'); ui.hidden = false;
    $('nome').textContent = lugar.nome || slug;
    $('sub').textContent = `relevo acima e abaixo do mar · exagero vertical ${exagero}x · ${Math.round(kmW)} km de largura`;
    const vistos = new Set();
    const fontes = (meta.fontes || []).map((f) => {
      const id = String(f.id || '');
      if (id.startsWith('gmrt')) return vistos.has('gmrt') ? null : (vistos.add('gmrt'), 'GMRT (Ryan et al. 2009), CC BY 4.0');
      if (id.startsWith('copernicus')) return vistos.has('cop') ? null : (vistos.add('cop'), 'Copernicus DEM GLO-30 (ESA/Airbus), uso livre com atribuição');
      return `${id}${f.licenca ? `, ${f.licenca}` : ''}`;
    }).filter(Boolean);
    $('creditos').innerHTML = `Relevo: ${fontes.join(' · ') || 'fonte não declarada'}${meta.fixture ? ' · <em>dados provisórios</em>' : ''}<br>` +
      `Régua: <a href="https://sketchfab.com/3d-models/cristo-redentor" target="_blank" rel="noopener">Cristo Redentor</a> por Parlin Sitorus (Sketchfab), CC BY 4.0 · 30 m reais, escala ${exagero}x` +
      ` · Código: MIT`;
    const bReproduzir = $('reproduzir'), sTempo = $('tempo'), oTempo = $('tempo-val'), sAgua = $('agua'), oAgua = $('agua-val');
    sTempo.max = String(trilha.duracao); sAgua.min = String(nivelMin);
    const fmtM = (m) => `${Math.round(m).toLocaleString('pt-BR')} m`;
    const atualizarUi = () => {
      sTempo.value = String(estado.t); oTempo.value = `${estado.t.toFixed(1)} s / ${trilha.duracao} s`;
      sAgua.value = String(estado.nivel_agua_m); oAgua.value = fmtM(estado.nivel_agua_m);
    };
    let tocando = false, ultimoTs = null;
    const laco = (ts) => {
      if (!tocando) return;
      if (ultimoTs !== null) {
        const dt = Math.min(0.1, (ts - ultimoTs) / 1000);
        let t = estado.t + dt;
        if (t >= trilha.duracao) { t = trilha.duracao; tocando = false; bReproduzir.textContent = 'Reproduzir'; }
        aplicarTempo(t); desenhar(); atualizarUi();
      }
      ultimoTs = ts;
      if (tocando) requestAnimationFrame(laco);
    };
    const tocar = () => {
      if (estado.t >= trilha.duracao) estado.t = 0;
      tocando = true; ultimoTs = null; estado.manual = false; controls.enabled = false;
      bReproduzir.textContent = 'Pausar'; requestAnimationFrame(laco);
    };
    const pausar = () => { tocando = false; bReproduzir.textContent = 'Reproduzir'; controls.enabled = true; };
    bReproduzir.addEventListener('click', () => (tocando ? pausar() : tocar()));
    sTempo.addEventListener('input', () => { if (tocando) pausar(); aplicarTempo(Number(sTempo.value)); desenhar(); atualizarUi(); });
    sAgua.addEventListener('input', () => { if (tocando) pausar(); estado.manual = true; aplicarAgua(Number(sAgua.value)); desenhar(); atualizarUi(); });
    controls.addEventListener('change', () => { if (!tocando) desenhar(); });
    canvas.addEventListener('pointerdown', () => { if (tocando) pausar(); $('dica').classList.add('off'); }, { passive: true });
    window.addEventListener('resize', () => { redimensionar(); desenhar(); });
    controls.enabled = true;
    atualizarUi();
    setTimeout(() => $('dica').classList.add('off'), 9000);
  }

  // primeiro quadro
  aplicarTempo(tInicial);
  desenhar();
  await proximoQuadro();
  const info = {
    slug, textura: [ter.w, ter.h], segmentos: [segX, segZ], triangulos: segX * segZ * 2,
    regua: regua ? { altura_terreno_m: regua.userData.altura_terreno_m } : null, ready_ms: Math.round(performance.now() - t0),
    elev: [ter.mn, ter.mx], km: [kmW, kmH],
  };
  console.log('brasil-sem-mar C pronto', JSON.stringify(info));
  return info;
}

iniciar().then(resolveReady).catch((e) => { avisar(`Não deu para montar a cena: ${e?.message || e}`); rejectReady(e); });
