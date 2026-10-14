// Brasil sem mar: a cena (Three.js, módulo). Superfície sólida quase preta (azul-petróleo)
// sombreada por normal e luz rasante; arestas e contornos neon (ciano na terra, violeta no
// fundo do mar); água como plano escuro e translúcido (o relevo submerso aparece fraco por
// baixo), com reflexo planar sutil, linha de costa luminosa e horizonte que se dissolve
// (sem borda dura); bloom médio; névoa de profundidade; fundo preto puro (a esteira
// compõe em "lighter"). Régua: Cristo Redentor (30 m) sobre o terreno em regua.lon/lat.
// Contrato: window.__bsm (SPEC.md). Nada de Date.now/Math.random/performance.now na cena:
// o quadro é função pura de t (e do nível d'água) e só muda por setTime(t).
//
// URL: index.html?lugar=<slug>&t=<s>&capture=1[&camada=1]
//   capture=1  sem UI, sem animação automática, dpr 1, fundo #000, sem órbita.
//   camada=1   albedo da superfície reduzido (linhas mantidas): versão para a esteira
//              compor em "lighter" por cima de um clipe, sem o corpo azul do relevo
//              sujar o vídeo de fundo.
// lugar.json pode trazer nevoa_por_km (1/km; padrão LOOK.nevoa): um lugar de 5.000 km
// precisa enxergar a 500 km, um de 1.300 km não.
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
  cristo: [1.0, 0.86, 0.62],             // branco quente: estátua iluminada, o único acento fora do ciano/violeta
  albedoMar: [0.035, 0.090, 0.150],     // azul-petróleo, lido quase preto no contra
  albedoTerra: [0.010, 0.040, 0.045],  // metade do mar: terra acima d'água (morro da régua, costa, Trindade) fica silhueta escura com borda neon; a 0,08 o morro de um nó era um cone liso ciano no primeiro quadro
  luz: [-0.80, 0.22, 0.40],             // direção DE ONDE vem a luz (rasante, de oés-sudoeste)
  nevoa: 0.0022,                        // 1/km; ~23 % de névoa a 230 km (padrão; lugar.json: nevoa_por_km)
  contornoMar: 1000, contornoTerra: 100, // metros; só em encosta suave (na parede, dez linhas paralelas liam como papel pautado)
  contornoPeso: 0.07,                   // intensidade das isolinhas (era 0,15: a forma fica com silhueta e crista)
  extincaoM: 150,                       // coluna d'água (m) em que o relevo submerso cai a 1/e: a -50 m sobra um véu, a -700 m nada
  bloom: { forca: 0.85, raio: 0.55, limiar: 0.45 },
  exposicao: 1.0,
  albedoCamada: 0.35,                   // camada=1: corpo do relevo e base da água a 35 %
};

// ---------------------------------------------------------------- URL e modos
const url = new URL(location.href);
const slug = url.searchParams.get('lugar') || '002-vitoria-trindade';
const CAPTURA = url.searchParams.get('capture') === '1';
const CAMADA = url.searchParams.get('camada') === '1';
const tInicial = Number.isFinite(Number(url.searchParams.get('t'))) ? Number(url.searchParams.get('t')) : 0; // ?t=abc não vira NaN na câmera
const BASE = './';                       // fetch resolve contra o documento (index.html na raiz)
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

// Convenção de texel, igual à da CLI ("nó = centro de célula") e à do shader (uv * uTexSize - 0,5):
// o centro do texel i fica em u = (i + 0,5) / w. Mapear por (w - 1) deslocava meio texel (318 m na 002).
const prender = (x, m) => Math.min(Math.max(x, 0), m);

// reamostra (bilinear) para caber no orçamento de textura (≤ 2048 de largura)
function reamostrar(src, w2) {
  const h2 = Math.max(2, Math.round(src.h * w2 / src.w));
  const out = new Float32Array(w2 * h2);
  for (let j = 0; j < h2; j++) {
    const fy = prender((j + 0.5) * src.h / h2 - 0.5, src.h - 1), y0 = Math.floor(fy), y1 = Math.min(src.h - 1, y0 + 1), ty = fy - y0;
    for (let i = 0; i < w2; i++) {
      const fx = prender((i + 0.5) * src.w / w2 - 0.5, src.w - 1), x0 = Math.floor(fx), x1 = Math.min(src.w - 1, x0 + 1), tx = fx - x0;
      const a = src.alt[y0 * src.w + x0], b = src.alt[y0 * src.w + x1], c = src.alt[y1 * src.w + x0], e = src.alt[y1 * src.w + x1];
      out[j * w2 + i] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    }
  }
  return { w: w2, h: h2, alt: out, mn: src.mn, mx: src.mx };
}

function alturaEm(ter, u, v) { // bilinear no array JS, u/v em [0,1]
  const fx = prender(u * ter.w - 0.5, ter.w - 1), fy = prender(v * ter.h - 0.5, ter.h - 1);
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
  // clamp anti-ringing: a Catmull-Rom passa dos nós (medido na 001: nó mais alto -2,6 m,
  // interpolado +36 m, e o topo do banco ganhava um ponto ciano de "terra"); a altura fica
  // entre o mínimo e o máximo dos quatro texels centrais; as derivadas só sombreiam, seguem sem clamp
  float hC = dot(wy, hv);
  float lo = min(min(r1.y, r1.z), min(r2.y, r2.z));
  float hi = max(max(r1.y, r1.z), max(r2.y, r2.z));
  return vec3(clamp(hC, lo, hi), dot(wy, dv), dot(dy, hv));
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
uniform float uContourPeso;
uniform float uExtincao; // m de coluna d'água para o relevo submerso cair a 1/e
uniform float uAlbMul;   // 1 normal; camada=1 reduz o corpo (as linhas ficam)
uniform vec4 uDbg;       // x: linha d'água, y: rim+cristas, z: contornos, w: corpo
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
  // abs, não max: a malha é mais grossa que o heightmap e, num morro de um nó, a normal
  // bicúbica do fragmento aponta para longe da câmera num triângulo que ainda é frontal;
  // com max() o ndv ia a zero e a face inteira virava "silhueta" (lençol ciano no bloom)
  float ndv = abs(dot(n, V));
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
  float queda = 1.0 / (1.0 + dist * 0.003);
  // teto em fwNdv: perto de um morro de um nó só as normais oscilam, fwidth(ndv) explode
  // e a "linha de 2 px" virava o morro inteiro em ciano saturado (lençol branco no bloom);
  // 0,02 (era 0,06): com 0,06 a silhueta pintava borrões violeta largos nas escarpas (23 a 29 s)
  float fwNdv = clamp(fwidth(ndv) * 2.0, 0.004, 0.02);
  float silhueta = (1.0 - smoothstep(0.0, fwNdv, ndv)) * smoothstep(0.01, 0.1, slope);
  // max(…, 0.0): |n·V| passa de 1 por arredondamento e pow de base negativa é indefinido no GLSL
  float rimSuave = pow(max(1.0 - ndv, 0.0), 4.0) * smoothstep(0.015, 0.22, slope) * 0.12;
  float rim = (silhueta * 0.5 + rimSuave) * (0.4 + 0.6 * topo) * queda;

  // cristas: curvatura convexa (laplaciano negativo) com stencil que cresce com a distância
  float k = clamp(dist * 0.012, 1.5, 7.0);
  float hL = alturaBL(p - vec2(k, 0.0)), hR = alturaBL(p + vec2(k, 0.0)), hU = alturaBL(p - vec2(0.0, k)), hD = alturaBL(p + vec2(0.0, k));
  float lap = hL + hR + hU + hD - 4.0 * h;
  float crest = smoothstep(0.0, 1.0, -lap / (k * k) / uCrest) * (0.3 + 0.7 * topo) * queda;
  // crista só onde a encosta é suave (topo de serra, borda de mesa): num morro de um nó a
  // bicúbica vira um sino com laplaciano negativo em toda a encosta íngreme e o morro inteiro
  // acendia em ciano (cone de plástico atrás do Cristo); a mesma queda das isolinhas
  crest *= 1.0 - smoothstep(0.35, 0.6, slope);
  // relevo em escala larga (m por texel): planície costeira e plataforma rasa (0 a 4 m
  // em dezenas de km) não ganham linha d'água: nelas a isolinha é fractal e vira chapa
  float gradK = length(vec2(hR - hL, hD - hU)) / (2.0 * k);
  float relevo = smoothstep(2.0, 8.0, gradK);
  // aresta só onde há relevo de verdade: lomba de 10 m na plataforma (exagerada 15x)
  // virava mancha violeta vista de raspão
  rim *= smoothstep(3.0, 12.0, gradK);

  // contornos finos com antialias por fwidth; somem quando ficam densos (moiré) e nas paredes
  // (uma escarpa com dez isolinhas paralelas lia como papel pautado, "mapa bonito"; a forma
  // fica por conta da silhueta e da crista, que é o traço do canal)
  float interval = mix(uContourSea, uContourLand, land);
  float fw = max(fwidth(h), 1e-3);
  float c = h / interval;
  float dC = (0.5 - abs(fract(c) - 0.5)) * interval;
  float lineW = clamp(fw * 1.1, 0.4, interval * 0.08);
  float contour = (1.0 - smoothstep(lineW * 0.5, lineW * 1.5, dC)) * (1.0 - smoothstep(0.10, 0.30, fw / interval));
  contour *= 1.0 - smoothstep(0.35, 0.6, slope);

  // linha d'água atual: largura só em espaço de tela (~1,5 px), só em encosta com relevo
  float dw = h - uWater;
  // teto de 8 m: longe e de raspão um pixel cobre dezenas de metros de altura e a "linha"
  // de 1,5 px cobriria o platô inteiro de um banco a -10/-60 m (chapa branca no horizonte);
  // onde o pixel não resolve a linha (fw acima de 8 a 30 m) ela some, em vez de cintilar
  float lw = clamp(fwidth(dw) * 1.5, 0.05, 8.0);
  float encosta = smoothstep(0.003, 0.03, slope) * relevo;
  float wline = (1.0 - smoothstep(lw * 0.5, lw * 1.5, abs(dw))) * encosta;
  // e some perto demais da câmera: a 2-3 s um segmento branco no canto inferior competia com o herói
  wline *= (1.0 - smoothstep(8.0, 30.0, fw)) / (1.0 + dist * 0.004) * smoothstep(2.0, 8.0, dist);
  float under = 1.0 - smoothstep(-40.0, 0.0, dw);
  // extinção pela coluna d'água: o relevo submerso escurece com a profundidade (a -50 m sobra
  // um véu, a -700 m não sobra nada). Sem isso os montes a -20/-145 m já apareciam no
  // horizonte em t = 0 como ilhas e o esvaziamento não revelava nada.
  float extincao = exp(-max(-dw, 0.0) / uExtincao);
  // véu das águas rasas: a plataforma e o topo dos montes aparecem fracos por baixo
  // da água (some quando o nível desce e o chão fica seco)
  float raso = extincao * under;

  col *= uDbg.w * uAlbMul;
  col += vec3(0.02, 0.07, 0.10) * raso * uDbg.w * uAlbMul;
  col += neon * (min(rim + crest * 0.45, 1.2) * uDbg.y + contour * uContourPeso * uDbg.z);
  vec3 corAgua = mix(uCyan, vec3(1.0), 0.45);
  col += corAgua * wline * 0.45 * uDbg.x;
  col *= mix(1.0, extincao, under);

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
uniform float uAlbMul;
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
  float fres = 0.03 + 0.97 * pow(max(1.0 - ndv, 0.0), 5.0);
  // rasante (menos de ~2,5 graus): só o reflexo e o halo se apagam. A água em si NÃO se dissolve
  // no horizonte: quando dissolvia, os montes submersos a 150 km apareciam em t = 0 como uma
  // fileira de ilhas, e o esvaziamento não tinha o que revelar. O plano termina longe, na névoa.
  float rasante = smoothstep(0.0, 0.045, ndv);
  // reflexo planar sutil, com uma ondulação mínima e determinística (só depende de t)
  vec2 ruv = vRef.xy / max(vRef.w, 1e-4);
  vec2 ond = vec2(sin(vWorld.x * 0.9 + vWorld.z * 0.4 + uTime * 0.9), cos(vWorld.z * 1.1 - vWorld.x * 0.3 + uTime * 0.7)) * 0.0010;
  vec3 refl = texture(uRefl, clamp(ruv + ond, 0.0, 1.0)).rgb;
  // base escura e constante: um brilho de Fresnel aqui tinha pico ~1 grau abaixo do nível do
  // olho e desenhava uma reta fina atravessando o quadro inteiro no horizonte
  vec3 base = vec3(0.008, 0.022, 0.050);
  vec3 col = base * uAlbMul * uDbg.w + refl * (0.18 + 0.30 * fres) * rasante * uDbg.x;
  // linha de costa luminosa: onde o terreno está logo abaixo da superfície
  vec2 uvT = vWorld.xz / uKm + 0.5;
  vec2 pT = clamp(uvT, 0.0, 1.0) * uTexSize - 0.5;
  float hT = alturaBL(pT);
  float gradK = length(vec2(alturaBL(pT + vec2(2.0, 0.0)) - alturaBL(pT - vec2(2.0, 0.0)), alturaBL(pT + vec2(0.0, 2.0)) - alturaBL(pT - vec2(0.0, 2.0)))) / 4.0;
  float relevo = smoothstep(2.0, 8.0, gradK);    // sem borda luminosa em planície rasa
  float depth = uWater - hT;                      // coluna d'água aqui (m)
  // largura só em espaço de tela (~2 px): um piso em metros fazia a baía rasa de 2 a 5 m
  // ao lado do Cristo virar lençol branco. Teto de 12 m: de raspão um pixel cobre centenas de
  // metros de profundidade e a "costa" subia a escarpa inteira da plataforma, a 40 e a 59 km,
  // como duas retas atravessando o quadro no horizonte.
  float fwd = min(max(fwidth(depth) * 2.0, 0.3), 12.0);
  float edge = (1.0 - smoothstep(0.0, fwd, depth)) * step(0.05, depth);   // 5 cm: baía plana a 0 m fica fora
  float halo = exp(-max(depth, 0.0) / (3.0 * fwd)) * 0.10 * step(0.05, depth) * (1.0 - smoothstep(12.0, 30.0, depth)) * rasante;
  col += mix(uCyan, vec3(1.0), 0.35) * (edge * 0.7 + halo) * relevo / (1.0 + dist * 0.004) * uDbg.y;
  if (uDbg.z > 0.5) { outColor = vec4(refl, 1.0); return; }
  // translúcida de cima (o relevo raso aparece por baixo), quase opaca no rasante (Fresnel):
  // 0,51 olhando para baixo, 0,92 no horizonte
  float alpha = 0.50 + 0.42 * fres;
  alpha = max(alpha, edge * relevo * 0.9);
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
  float rim = pow(max(1.0 - max(dot(n, V), 0.0), 0.0), 2.5);
  // corpo visível (estátua iluminada) mais um rim que acende no bloom; acima disso vira bolha
  vec3 col = uCor * (0.05 + ndl * 0.25 + rim * 1.0);
  float fog = 1.0 - exp(-pow(dist * uFog, 2.0));
  outColor = vec4(col * (1.0 - fog), 1.0);
}
`;

// ---------------------------------------------------------------- cena
async function iniciar() {
  // sem relógio aqui: o tempo até ready quem mede é a captura (pronto_ms), de fora da página
  const [lugar, meta] = await Promise.all([carregarJson(dirLugar + 'lugar.json'), carregarJson(dirLugar + 'terreno.json')]);
  const exagero = lugar.exagero_vertical ?? 15;
  const exag = exagero / 1000; // km por metro
  const nivelMin = lugar.nivel_minimo_m ?? -6000;

  // escala da cena: tudo vem do terreno.json (bbox) e do lugar.json (exagero), nunca de número fixo
  const bb = meta.bbox;
  const latC = (bb.norte + bb.sul) / 2;
  const kmW = (bb.leste - bb.oeste) * 111.32 * Math.cos(latC * Math.PI / 180);
  const kmH = (bb.norte - bb.sul) * 111.32;
  // névoa por lugar (1/km): padrão LOOK.nevoa; a 001 (5.000 km de largura) precisa ver a 500 km
  const nevoa = Number.isFinite(lugar.nevoa_por_km) && lugar.nevoa_por_km > 0 ? lugar.nevoa_por_km : LOOK.nevoa;
  const alcance = 4 / nevoa;   // km em que a névoa chega a 100 % (1 - exp(-16)); o plano d'água termina além disso

  // terreno
  let ter = await carregarTerreno(dirLugar + 'terreno.png');
  if (Number.isFinite(meta.elev_min_m) && (Math.abs(ter.mn - meta.elev_min_m) > 1 || Math.abs(ter.mx - meta.elev_max_m) > 1)) {
    console.warn(`terreno decodificado min/max ${ter.mn.toFixed(1)}/${ter.mx.toFixed(1)} difere do terreno.json ${meta.elev_min_m}/${meta.elev_max_m}`);
  }
  if (ter.w > 2048) ter = reamostrar(ter, 2048);

  // trilha: sempre lugares/<slug>/camera.json; sem o arquivo, uma órbita baixa padrão
  // (raio dentro da névoa e altura pela elevação máxima, não pela largura da caixa)
  let trilhaJson = null;
  let trilhaPadraoUsada = false;
  try { trilhaJson = await carregarJson(dirLugar + 'camera.json'); } catch (e) {
    console.warn(`sem camera.json em lugares/${slug}/ (${e?.message || e}); uso a trilha padrão`);
    trilhaJson = trilhaPadrao(kmW, kmH, nivelMin, { nevoa, yTopo: Math.max(ter.mx, 0) * exag });
    trilhaPadraoUsada = true;
  }
  const trilha = prepararTrilha(trilhaJson);

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
  // near 0,3 km (era 0,05): a trilha nunca chega a menos de 0,78 km do relevo e o near curto
  // demais gastava a precisão do depth (24 bits) onde não havia nada; far cobre o plano d'água
  // inteiro (dimensionado pela névoa) com folga
  const meioAguaW = Math.max(kmW * 1.5, alcance), meioAguaH = Math.max(kmH * 3, alcance);
  const far = Math.max(4000, 1.2 * Math.hypot(meioAguaW + kmW / 2, meioAguaH + kmH / 2));
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.3, far);

  // textura de altura (R32F, nearest: a filtragem é bicúbica no shader)
  const texAlt = new THREE.DataTexture(ter.alt, ter.w, ter.h, THREE.RedFormat, THREE.FloatType);
  texAlt.magFilter = THREE.NearestFilter; texAlt.minFilter = THREE.NearestFilter;
  texAlt.generateMipmaps = false; texAlt.wrapS = THREE.ClampToEdgeWrapping; texAlt.wrapT = THREE.ClampToEdgeWrapping;
  texAlt.colorSpace = THREE.NoColorSpace; texAlt.needsUpdate = true;

  // malha: até 1024 de largura e ~1 M de triângulos. Grade tensorial (lista de colunas x lista
  // de linhas, uma malha só, sem emenda): uniforme no lugar inteiro e, perto da régua (o herói
  // da abertura), mais fina que o texel, com o passo crescendo em progressão geométrica até o
  // passo base. Sem isso um morro de um nó só (636 m) a 1 km do Cristo era uma pirâmide de
  // quatro faces na frente da câmera: a luz é bicúbica no fragmento, mas a silhueta é a dos vértices.
  const segX = Math.min(1024, ter.w - 1);
  let segZ = Math.max(8, Math.round(segX * kmH / kmW));
  segZ = Math.min(segZ, Math.floor(1e6 / (2 * segX)));
  const reguaUv = lugar.regua && Number.isFinite(lugar.regua.lon) && Number.isFinite(lugar.regua.lat)
    ? [(lugar.regua.lon - bb.oeste) / (bb.leste - bb.oeste), (bb.norte - lugar.regua.lat) / (bb.norte - bb.sul)]
    : null;
  function eixo(n, texeis, centro) {
    const base = Array.from({ length: n + 1 }, (_, i) => i / n);
    if (centro === null || !(centro > 0 && centro < 1)) return base;
    const passoBase = 1 / n;
    const passoFino = 1 / (texeis * 4);          // um quarto de texel
    if (passoFino >= passoBase) return base;
    const extras = [centro];
    for (const sinal of [-1, 1]) {
      let u = centro, p = passoFino;
      while (p < passoBase) { u += sinal * p; if (u <= 0 || u >= 1) break; extras.push(u); p *= 1.18; }
    }
    const todos = base.concat(extras).sort((a, b) => a - b);
    const saida = [0];
    for (const u of todos) if (u < 1 && u - saida[saida.length - 1] >= passoFino * 0.5) saida.push(u);
    if (1 - saida[saida.length - 1] < passoFino * 0.5) saida[saida.length - 1] = 1; else saida.push(1);
    return saida;
  }
  function construirGrade(us, vs) {
    const nx = us.length, nz = vs.length;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) {
      const v = vs[j];
      for (let i = 0; i < nx; i++) {
        const u = us[i], o = j * nx + i;
        pos[o * 3] = (u - 0.5) * kmW; pos[o * 3 + 1] = 0; pos[o * 3 + 2] = (v - 0.5) * kmH;
        uv[o * 2] = u; uv[o * 2 + 1] = v;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
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
    return { geo: g, nx, nz, triangulos: (nx - 1) * (nz - 1) * 2 };
  }
  const grade = construirGrade(eixo(segX, ter.w, reguaUv ? reguaUv[0] : null), eixo(segZ, ter.h, reguaUv ? reguaUv[1] : null));
  // reflexo planar: a mesma superfície com um quarto dos segmentos (o reflexo é sutil, a meia
  // resolução e borrado; desenhar a malha cheia duas vezes por quadro dobrava os triângulos)
  const gradeRefl = construirGrade(eixo(Math.max(8, segX >> 2), ter.w, null), eixo(Math.max(8, segZ >> 2), ter.h, null));

  const albMul = CAMADA ? LOOK.albedoCamada : 1.0;
  const luz = new THREE.Vector3(...LOOK.luz).normalize();
  const matTerreno = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VS_TERRENO, fragmentShader: FS_TERRENO,
    uniforms: {
      uAlt: { value: texAlt }, uTexSize: { value: new THREE.Vector2(ter.w, ter.h) }, uExag: { value: exag },
      uKm: { value: new THREE.Vector2(kmW, kmH) }, uWater: { value: 0 }, uLight: { value: luz }, uFog: { value: nevoa },
      uCyan: { value: new THREE.Vector3(...LOOK.ciano) }, uViolet: { value: new THREE.Vector3(...LOOK.violeta) },
      uAlbMar: { value: new THREE.Vector3(...LOOK.albedoMar) }, uAlbTerra: { value: new THREE.Vector3(...LOOK.albedoTerra) },
      uContourSea: { value: LOOK.contornoMar }, uContourLand: { value: LOOK.contornoTerra }, uCrest: { value: 400.0 },
      uContourPeso: { value: LOOK.contornoPeso }, uExtincao: { value: LOOK.extincaoM },
      uAlbMul: { value: albMul }, uDbg: { value: new THREE.Vector4(1, 1, 1, 1) },
    },
    side: THREE.FrontSide,
  });
  const terreno = new THREE.Mesh(grade.geo, matTerreno);
  terreno.frustumCulled = false;
  scene.add(terreno);
  const terrenoRefl = new THREE.Mesh(gradeRefl.geo, matTerreno);
  terrenoRefl.frustumCulled = false;
  terrenoRefl.visible = false;   // só entra na passagem do espelho
  scene.add(terrenoRefl);

  // água: plano translúcido com reflexo planar (render-to-texture, câmera espelhada).
  // O plano vai até onde a névoa chega a 100 % (alcance), em qualquer tamanho de lugar: antes
  // media 3 x 6 vezes a caixa e, numa caixa de 21 km, acabava a 31 km da câmera como uma reta.
  const reflRT = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(W * dpr / 2)), Math.max(2, Math.floor(H * dpr / 2)), {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
  });
  const matAgua = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VS_AGUA, fragmentShader: FS_AGUA,
    uniforms: {
      uAlt: { value: texAlt }, uTexSize: { value: new THREE.Vector2(ter.w, ter.h) }, uRefl: { value: reflRT.texture },
      uTexMatrix: { value: new THREE.Matrix4() }, uKm: { value: new THREE.Vector2(kmW, kmH) }, uWater: { value: 0 },
      uFog: { value: nevoa }, uTime: { value: 0 }, uCyan: { value: new THREE.Vector3(...LOOK.ciano) },
      uAlbMul: { value: albMul }, uDbg: { value: new THREE.Vector4(1, 1, 0, 1) },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const agua = new THREE.Mesh(new THREE.PlaneGeometry(meioAguaW * 2, meioAguaH * 2), matAgua);
  agua.rotation.x = -Math.PI / 2;
  agua.renderOrder = 10;
  agua.frustumCulled = false;
  scene.add(agua);

  // régua: Cristo Redentor (30 m, base em y = 0) sobre o terreno em regua.lon/lat,
  // com a escala do relevo (exagero) vezes regua.escala (declarado no lugar.json)
  let regua = null;
  const escalaRegua = Number(lugar.regua?.escala) || 1;
  if (lugar.regua && Number.isFinite(lugar.regua.lon) && Number.isFinite(lugar.regua.lat)) {
    try {
      const g = await carregarRegua(`${BASE}regua/cristo-web.glb`);
      const mat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: VS_REGUA, fragmentShader: FS_REGUA,
        uniforms: { uLight: { value: luz }, uCor: { value: new THREE.Vector3(...LOOK.cristo) }, uFog: { value: nevoa } },
      });
      regua = new THREE.Mesh(g, mat);
      const u = (lugar.regua.lon - bb.oeste) / (bb.leste - bb.oeste), v = (bb.norte - lugar.regua.lat) / (bb.norte - bb.sul);
      const hR = Math.max(0, alturaEm(ter, u, v));   // nunca abaixo do mar
      regua.scale.setScalar(exag * escalaRegua);
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
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0; pm.elements[14] = clip.w;
    const aguaVisivel = agua.visible;   // o diagnóstico pode ter escondido a água; não religar
    const terrenoVisivel = terreno.visible;
    agua.visible = false;
    terreno.visible = false; terrenoRefl.visible = terrenoVisivel;   // malha grossa só no espelho
    renderer.setRenderTarget(reflRT);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(null);
    terreno.visible = terrenoVisivel; terrenoRefl.visible = false;
    agua.visible = aguaVisivel;
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
  // renderizador WebGL de verdade (AGENTS.md: a captura tem de dizer Metal, nunca SwiftShader)
  const renderizador = (() => {
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch { return null; }
  })();
  bsm.metrics = () => ({
    calls: ultimas.calls, triangles: ultimas.triangles, segmentos: [grade.nx - 1, grade.nz - 1], triangulos_malha: grade.triangulos,
    triangulos_reflexo: gradeRefl.triangulos, textura: [ter.w, ter.h],
    dpr, largura: W, altura: H, camada: CAMADA, regua_escala: regua ? escalaRegua : null,
    nevoa_por_km: nevoa, trilha_padrao: trilhaPadraoUsada, renderizador,
  });

  // ---- interativo
  let controls = null;
  let sincronizarUi = () => {};   // a UI só existe fora do modo captura; é chamada depois do primeiro quadro
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
    // créditos: montados com nós do DOM (os textos vêm do terreno.json; nada de HTML por string)
    const vistos = new Set();
    const fontes = (meta.fontes || []).map((f) => {
      const id = String(f.id || '');
      if (id.startsWith('gmrt')) return vistos.has('gmrt') ? null : (vistos.add('gmrt'), { rotulo: 'GMRT', href: 'https://www.gmrt.org/', resto: ' (Ryan et al. 2009), CC BY 4.0' });
      if (id.startsWith('copernicus')) return vistos.has('cop') ? null : (vistos.add('cop'), { rotulo: 'Copernicus DEM GLO-30', href: 'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM', resto: ' (ESA/Airbus), uso livre com atribuição' });
      return { rotulo: id, href: null, resto: f.licenca ? `, ${String(f.licenca)}` : '' };
    }).filter(Boolean);
    const fmtX = (v) => v.toLocaleString('pt-BR');
    const escalaTxt = escalaRegua === 1
      ? `30 m reais na mesma escala do relevo (${exagero}x)`
      : `30 m reais, desenhado ${fmtX(escalaRegua)}x maior que a escala do relevo (${exagero}x) para aparecer na tela`;
    const texto = (s) => document.createTextNode(s);
    const link = (href, rotulo) => { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = rotulo; return a; };
    const creditos = $('creditos');
    creditos.textContent = '';
    const detalhes = document.createElement('details');
    const resumo = document.createElement('summary');
    resumo.append(texto('Relevo: '));
    if (!fontes.length) resumo.append(texto('fonte não declarada'));
    fontes.forEach((f, i) => {
      if (i) resumo.append(texto(' · '));
      resumo.append(f.href ? link(f.href, f.rotulo) : texto(f.rotulo));
      resumo.append(texto(f.resto));
    });
    if (meta.fixture) { resumo.append(texto(' · ')); const em = document.createElement('em'); em.textContent = 'dados provisórios'; resumo.append(em); }
    resumo.append(document.createElement('br'));
    if (regua) {
      resumo.append(texto('Régua: '));
      resumo.append(link('https://sketchfab.com/3d-models/christ-the-redeemer-cristo-redentor-157dbdb9d8654651a5e5c9af7b412398', 'Cristo Redentor'));
      resumo.append(texto(' por Parlin Sitorus (Sketchfab), '));
      resumo.append(link('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0'));
      resumo.append(texto(` · ${escalaTxt}`));
    } else {
      resumo.append(texto('Sem régua neste lugar'));
    }
    resumo.append(texto(' · Código: MIT · '));
    const mais = document.createElement('span'); mais.className = 'mais'; mais.textContent = 'fontes e licenças';
    resumo.append(mais);
    detalhes.append(resumo);
    // o texto exato de atribuição de cada fonte (terreno.json), inteiro, abre no toque/clique
    const fontesCheias = document.createElement('div');
    fontesCheias.className = 'fontes';
    for (const f of meta.fontes || []) {
      if (!f.atribuicao) continue;
      const p = document.createElement('p');
      p.textContent = `${f.id}: ${f.atribuicao}${f.licenca ? ` (${f.licenca})` : ''}`;
      fontesCheias.append(p);
    }
    if (regua) {
      const p = document.createElement('p');
      p.textContent = 'Régua: "Christ the Redeemer (Cristo Redentor)" por Parlin Sitorus, CC BY 4.0 (malha simplificada, rotação para Y-up, escala para 30 m).';
      fontesCheias.append(p);
    }
    detalhes.append(fontesCheias);
    creditos.append(detalhes);
    creditos.title = (meta.fontes || []).map((f) => `${f.id}: ${f.atribuicao || ''}`.trim()).filter((s) => !s.endsWith(':')).join('\n');
    // a barra de controles fica acima dos créditos, com a altura medida (no celular eles se sobrepunham)
    const reservarRodape = () => ui.style.setProperty('--creditos-h', `${Math.ceil(creditos.getBoundingClientRect().height)}px`);
    detalhes.addEventListener('toggle', reservarRodape);
    reservarRodape();
    // dica de uso: texto para toque ou para mouse
    const toque = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    $('dica').textContent = toque ? 'arraste para orbitar · pince para aproximar' : 'arraste para orbitar · roda do mouse para aproximar';
    const bReproduzir = $('reproduzir'), sTempo = $('tempo'), oTempo = $('tempo-val'), sAgua = $('agua'), oAgua = $('agua-val');
    sTempo.max = String(trilha.duracao); sAgua.min = String(nivelMin);
    const fmtM = (m) => `${Math.round(m).toLocaleString('pt-BR')} m`;
    const atualizarUi = () => {
      sTempo.value = String(estado.t); oTempo.value = `${estado.t.toFixed(1)} s / ${trilha.duracao} s`;
      sAgua.value = String(estado.nivel_agua_m); oAgua.value = fmtM(estado.nivel_agua_m);
    };
    sincronizarUi = atualizarUi;
    // o botão "Reproduzir" avança t de fora da cena (relógio do navegador só aqui, nunca no quadro)
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
    window.addEventListener('resize', () => { redimensionar(); desenhar(); reservarRodape(); });
    controls.enabled = true;
    atualizarUi();
    setTimeout(() => $('dica').classList.add('off'), 9000);
  }

  // primeiro quadro (e a UI sincronizada com ele: um deep link ?t=12 mostrava a cena em 12 s
  // com os sliders em 0 s / 0 m)
  aplicarTempo(tInicial);
  desenhar();
  sincronizarUi();
  await proximoQuadro();
  const info = {
    slug, textura: [ter.w, ter.h], segmentos: [grade.nx - 1, grade.nz - 1], triangulos: grade.triangulos, triangulos_reflexo: gradeRefl.triangulos,
    regua: regua ? { altura_terreno_m: regua.userData.altura_terreno_m, escala: escalaRegua } : null,
    camada: CAMADA, nevoa_por_km: nevoa, trilha_padrao: trilhaPadraoUsada, renderizador,
    elev: [ter.mn, ter.mx], km: [kmW, kmH],
  };
  console.log('brasil-sem-mar pronto', JSON.stringify(info));
  return info;
}

iniciar().then(resolveReady).catch((e) => { avisar(`Não deu para montar a cena: ${e?.message || e}`); rejectReady(e); });
