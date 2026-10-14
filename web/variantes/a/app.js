// brasil-sem-mar — variante A, "contorno topográfico".
// O relevo como isolinhas neon finas sobre preto: terra em ciano, fundo do mar em
// violeta, a linha d'água atual mais grossa e clara. A superfície é quase preta
// (a profundidade aparece por oclusão), a água é um plano translúcido escuro com
// borda luminosa. Bloom sutil, névoa de profundidade, nada de grade.
//
// Contrato: window.__bsm = { ready, setTime, duration, setWater, getState, metrics }.
// Nada de Date.now / Math.random na cena: o relógio só anda por setTime(t).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const RAIZ = '../../../';
const params = new URLSearchParams(location.search);
const SLUG = params.get('lugar') || '002-vitoria-trindade';
const CAPTURA = params.get('capture') === '1';
const T_INICIAL = Number(params.get('t') || 0);
const DPR = CAPTURA ? 1 : Math.min(window.devicePixelRatio || 1, 2);
const MALHA_MAX = 1024;        // largura máxima da malha (vértices)
const TEXTURA_MAX = 2048;      // largura máxima da textura de altura
const TRIANGULOS_MAX = 1_000_000;

if (CAPTURA) document.body.classList.add('captura');

const $ = (id) => document.getElementById(id);
const mostrarErro = (msg) => { const el = $('erro'); el.textContent = msg; el.hidden = false; console.error(msg); };

// ---------------------------------------------------------------------------
// Terreno: Terrain-RGB -> Float32 (metros) via canvas 2D, reamostrado até 2048
// ---------------------------------------------------------------------------
async function decodificarTerrenoRGB(blob) {
  let fonte = null;
  try { fonte = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); } catch { fonte = null; }
  if (!fonte) {
    fonte = await new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => erro(new Error('não consegui decodificar terreno.png'));
      img.src = URL.createObjectURL(blob);
    });
  }
  const W = fonte.width, H = fonte.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(fonte, 0, 0);
  const px = cx.getImageData(0, 0, W, H).data;
  const alturas = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) alturas[i] = -10000 + ((px[p] << 16) | (px[p + 1] << 8) | px[p + 2]) * 0.1;
  if (fonte.close) fonte.close();
  return { alturas, largura: W, altura: H };
}

// Média por área (caixa) para caber no orçamento de textura.
function reamostrar(src, W, H, W2, H2) {
  const dst = new Float32Array(W2 * H2);
  const fx = W / W2, fy = H / H2;
  for (let j = 0; j < H2; j++) {
    const y0 = Math.floor(j * fy), y1 = Math.max(y0 + 1, Math.floor((j + 1) * fy));
    for (let i = 0; i < W2; i++) {
      const x0 = Math.floor(i * fx), x1 = Math.max(x0 + 1, Math.floor((i + 1) * fx));
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += src[y * W + x]; n++; }
      dst[j * W2 + i] = s / n;
    }
  }
  return dst;
}

// ---------------------------------------------------------------------------
// Shaders (GLSL ES 3.0). A altura é amostrada por B-spline bicúbica com texelFetch:
// sem depender de filtragem linear de textura float, e as isolinhas saem lisas.
// ---------------------------------------------------------------------------
const GLSL_ALTURA = /* glsl */`
uniform highp sampler2D uAltura;
uniform ivec2 uTam;
float texel(ivec2 p) { p = clamp(p, ivec2(0), uTam - 1); return texelFetch(uAltura, p, 0).r; }
float altura(vec2 uv) {
  vec2 p = uv * vec2(uTam) - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  ivec2 b = ivec2(i);
  float wy[4] = float[4](w0.y, w1.y, w2.y, w3.y);
  float h = 0.0;
  for (int j = 0; j < 4; j++) {
    int y = b.y - 1 + j;
    float r = w0.x * texel(ivec2(b.x - 1, y)) + w1.x * texel(ivec2(b.x, y)) + w2.x * texel(ivec2(b.x + 1, y)) + w3.x * texel(ivec2(b.x + 2, y));
    h += wy[j] * r;
  }
  return h;
}
float borda(vec2 uv) {
  return smoothstep(0.0, 0.03, uv.x) * smoothstep(0.0, 0.03, 1.0 - uv.x) * smoothstep(0.0, 0.10, uv.y) * smoothstep(0.0, 0.10, 1.0 - uv.y);
}
float nevoa(vec3 p, vec3 cam, float densidade) {
  float d = distance(p, cam) * densidade;
  return exp(-d * d);
}
`;

const TERRENO_VS = /* glsl */`
${GLSL_ALTURA}
uniform float uEscalaY;
uniform vec2 uKm;              // largura e altura do terreno em km
out vec2 vUv;
out vec3 vPos;
out float vInclinacao;         // |gradiente| em metros por km, suave por triângulo
void main() {
  vUv = uv;
  vec3 p = position;
  float h = altura(uv);
  p.y = h * uEscalaY;
  vec2 du = 1.0 / vec2(uTam);
  float hx = altura(uv + vec2(du.x, 0.0)), hy = altura(uv + vec2(0.0, du.y));
  vInclinacao = length(vec2((hx - h) / (du.x * uKm.x), (hy - h) / (du.y * uKm.y)));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const TERRENO_FS = /* glsl */`
${GLSL_ALTURA}
uniform float uAgua;             // nível d'água atual (m)
uniform float uMarMenor, uMarMaior, uTerraMenor, uTerraMaior;   // intervalos das isolinhas (m)
uniform float uLargura;          // largura da linha fina (px)
uniform vec3 uCorTerra, uCorTerraAlta, uCorMarRaso, uCorMarFundo, uCorAgua, uCorMarSub;
uniform float uNevoa;            // densidade da névoa (1/km)
uniform float uPreenchimento;    // brilho da superfície (quase preto)
uniform float uPxAng;            // tamanho angular de um pixel (rad)
in vec2 vUv;
in vec3 vPos;
in float vInclinacao;
out vec4 fragColor;

// Isolinhas a cada dh metros: cobertura antialiasada por fwidth e, onde as linhas
// ficariam mais densas que o pixel (moiré), troca pela cobertura média (brilho liso).
float isolinhas(float h, float dh, float dhPx, float w, float mediaMax) {
  float f = h / dh;
  float d = dhPx / dh;
  float dist = abs(fract(f + 0.5) - 0.5);
  float px = dist / max(d, 1e-6);
  float cobertura = 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, px);
  float media = min(w * d, mediaMax);
  return mix(cobertura, media, smoothstep(0.14, 0.40, d));
}
// Uma linha só, no nível h0, com largura w px.
float linhaNivel(float h, float h0, float dhPx, float w) {
  float px = abs(h - h0) / max(dhPx, 1e-6);
  return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, px);
}

void main() {
  float h = altura(vUv);
  float dhPx = fwidth(h);
  bool terra = h > 0.0;
  float menor = terra ? uTerraMenor : uMarMenor;
  float maior = terra ? uTerraMaior : uMarMaior;

  // suplementar (só sobrevive onde é plano), menor (textura fraca), maior (estrutura)
  float lFino = isolinhas(h, menor * 0.10, dhPx, uLargura * 0.8, 0.0) * 0.07;
  float lSup = isolinhas(h, menor * 0.25, dhPx, uLargura * 0.9, 0.0) * 0.10;
  float lMenor = isolinhas(h, menor, dhPx, uLargura, 0.12) * 0.24;
  float lMaior = isolinhas(h, maior, dhPx, uLargura * 1.4, 0.30) * 0.9;
  float linhas = max(max(lFino, lSup), max(lMenor, lMaior));
  // Linha d'água e linha do nível zero: largura em pixels. Em área plana fwidth(h)
  // vai a zero e uma linha viraria região (mancha): aí a linha some de propósito.
  // fwidth(h) é ruidoso entre quads em terreno quase plano (viraria tracinhos): a largura da
  // linha usa, no mínimo, a estimativa lisa por vértice (inclinação x pegada do pixel no chão)
  float kmPorPx = distance(vPos, cameraPosition) * uPxAng;
  float dhLinha = max(dhPx, vInclinacao * kmPorPx);
  float guarda = smoothstep(5.0, 18.0, vInclinacao);   // some abaixo de ~5 m/km (plataforma plana)

  vec3 cor;
  if (terra) cor = mix(uCorTerra, uCorTerraAlta, smoothstep(300.0, 1800.0, h));
  else cor = mix(uCorMarRaso, uCorMarFundo, smoothstep(0.0, 4500.0, -h));

  // debaixo d'água as linhas ficam mais fracas e mais azuis
  float sub = smoothstep(0.0, 500.0, uAgua - h);
  cor = mix(cor, uCorMarSub, 0.5 * sub);
  float c = linhas * (1.0 - 0.6 * sub);

  // linha d'água atual: mais grossa, mais clara, com halo
  float lAgua = linhaNivel(h, uAgua, dhLinha, uLargura * 2.0) * guarda;
  // halo só em pixels e só em encosta (em terreno plano viraria mancha)
  float halo = exp(-abs(h - uAgua) / dhLinha / 10.0) * 0.18 * smoothstep(0.3, 3.0, dhPx) * guarda;
  // onde o mar estava (0 m): uma linha fantasma fina, depois que a água baixa
  float lZero = linhaNivel(h, 0.0, dhLinha, uLargura * 0.9) * 0.5 * guarda * smoothstep(-40.0, -400.0, uAgua) * (1.0 - sub);

  vec3 saida = cor * c + uCorAgua * (lAgua + halo) + vec3(0.9, 1.0, 1.0) * lZero;
  saida += cor * uPreenchimento;
  saida *= borda(vUv) * nevoa(vPos, cameraPosition, uNevoa);
  fragColor = vec4(saida, 1.0);
}
`;

const AGUA_VS = /* glsl */`
out vec2 vUv;
out vec3 vPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const AGUA_FS = /* glsl */`
${GLSL_ALTURA}
uniform float uAgua;
uniform vec3 uCorAgua, uCorAguaFundo;
uniform float uNevoa;
uniform float uOpacidade;
uniform vec2 uKm;
in vec2 vUv;
in vec3 vPos;
out vec4 fragColor;
void main() {
  float h = altura(vUv);
  float prof = uAgua - h;               // metros de água neste ponto
  if (prof <= 0.0) discard;
  // inclinação do fundo (m/km), lisa: em terraço plano o brilho de raso viraria tracinhos
  vec2 du = 1.0 / vec2(uTam);
  float inclinacao = length(vec2((altura(vUv + vec2(du.x, 0.0)) - h) / (du.x * uKm.x), (altura(vUv + vec2(0.0, du.y)) - h) / (du.y * uKm.y)));
  float raso = exp(-prof / 6.0) * smoothstep(5.0, 18.0, inclinacao);   // borda luminosa só junto ao terreno (6 m) e em encosta
  float b = borda(vUv);
  float n = nevoa(vPos, cameraPosition, uNevoa);
  vec3 cor = uCorAguaFundo * 0.4 + uCorAgua * raso * 0.22;
  float alfa = mix(uOpacidade, 0.5, raso) * b;
  fragColor = vec4(cor * n * b, alfa);
}
`;

const REGUA_VS = /* glsl */`
out vec3 vN;
out vec3 vV;
out vec3 vPos;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const REGUA_FS = /* glsl */`
uniform vec3 uCor;
uniform float uNevoa;
in vec3 vN;
in vec3 vV;
in vec3 vPos;
out vec4 fragColor;
void main() {
  float r = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(r, 2.2);
  float d = distance(vPos, cameraPosition) * uNevoa;
  vec3 c = uCor * (0.03 + 1.2 * rim) * exp(-d * d);
  fragColor = vec4(c, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Trilha de câmera: Catmull-Rom centrípeta (pos, alvo); água e fov com smoothstep
// entre os keyframes que definem cada propriedade.
// ---------------------------------------------------------------------------
function catmullRomCentripeta(p0, p1, p2, p3, u, saida) {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const t0 = 0;
  const t1 = t0 + Math.max(Math.sqrt(dist(p0, p1)), 1e-4);
  const t2 = t1 + Math.max(Math.sqrt(dist(p1, p2)), 1e-4);
  const t3 = t2 + Math.max(Math.sqrt(dist(p2, p3)), 1e-4);
  const t = t1 + (t2 - t1) * u;
  for (let k = 0; k < 3; k++) {
    const a1 = (t1 - t) / (t1 - t0) * p0[k] + (t - t0) / (t1 - t0) * p1[k];
    const a2 = (t2 - t) / (t2 - t1) * p1[k] + (t - t1) / (t2 - t1) * p2[k];
    const a3 = (t3 - t) / (t3 - t2) * p2[k] + (t - t2) / (t3 - t2) * p3[k];
    const b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2;
    const b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
    saida[k] = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2;
  }
  return saida;
}
const smoothstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

class Trilha {
  constructor(json) {
    this.duracao = Number(json.duracao_s) || 61;
    this.fps = Number(json.fps) || 30;
    this.kf = [...json.keyframes].sort((a, b) => a.t - b.t);
    if (this.kf.length === 0) throw new Error('camera.json sem keyframes');
    this.agua = this.kf.filter((k) => k.nivel_agua_m !== undefined).map((k) => [k.t, k.nivel_agua_m]);
    this.fov = this.kf.filter((k) => k.fov !== undefined).map((k) => [k.t, k.fov]);
  }
  _vetor(campo, t, saida) {
    const kf = this.kf, n = kf.length;
    if (n === 1 || t <= kf[0].t) return Object.assign(saida, kf[0][campo]);
    if (t >= kf[n - 1].t) return Object.assign(saida, kf[n - 1][campo]);
    let i = 0;
    while (i < n - 2 && t >= kf[i + 1].t) i++;
    const u = (t - kf[i].t) / (kf[i + 1].t - kf[i].t);
    const p0 = kf[Math.max(i - 1, 0)][campo], p1 = kf[i][campo], p2 = kf[i + 1][campo], p3 = kf[Math.min(i + 2, n - 1)][campo];
    return catmullRomCentripeta(p0, p1, p2, p3, u, saida);
  }
  _escalar(lista, t, padrao) {
    if (lista.length === 0) return padrao;
    if (t <= lista[0][0]) return lista[0][1];
    if (t >= lista[lista.length - 1][0]) return lista[lista.length - 1][1];
    let i = 0;
    while (i < lista.length - 2 && t >= lista[i + 1][0]) i++;
    const [ta, va] = lista[i], [tb, vb] = lista[i + 1];
    return va + (vb - va) * smoothstep(ta, tb, t);
  }
  em(t) {
    return {
      pos: this._vetor('pos', t, [0, 0, 0]),
      alvo: this._vetor('alvo', t, [0, 0, 0]),
      nivel_agua_m: this._escalar(this.agua, t, 0),
      fov: this._escalar(this.fov, t, 50),
    };
  }
}

// Trilha automática quando o lugar não tem camera.json: uma passagem baixa de oeste a leste.
function trilhaPadrao(kmW, kmH, escalaY, nivelMin) {
  const y = 4, z = 0;
  return new Trilha({
    duracao_s: 61, fps: 30,
    keyframes: [
      { t: 0, pos: [-kmW * 0.45, y, z + kmH * 0.15], alvo: [-kmW * 0.2, nivelMin * escalaY * 0.3, z], nivel_agua_m: 0, fov: 50 },
      { t: 12, pos: [-kmW * 0.35, y, z + kmH * 0.12], alvo: [-kmW * 0.05, nivelMin * escalaY * 0.3, z], nivel_agua_m: nivelMin },
      { t: 61, pos: [kmW * 0.4, y, z + kmH * 0.1], alvo: [kmW * 0.48, 0, z], fov: 50 },
    ],
  });
}

// ---------------------------------------------------------------------------
// Cena
// ---------------------------------------------------------------------------
async function iniciar() {
  const t0 = performance.now();
  const canvas = $('cena');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;

  // --- dados ---------------------------------------------------------------
  const base = `${RAIZ}lugares/${SLUG}/`;
  const [lugar, meta, blob] = await Promise.all([
    fetch(base + 'lugar.json').then((r) => { if (!r.ok) throw new Error('lugar.json não encontrado para ' + SLUG); return r.json(); }),
    fetch(base + 'terreno.json').then((r) => { if (!r.ok) throw new Error('terreno.json não encontrado para ' + SLUG); return r.json(); }),
    fetch(base + 'terreno.png').then((r) => { if (!r.ok) throw new Error('terreno.png não encontrado para ' + SLUG); return r.blob(); }),
  ]);
  const bruto = await decodificarTerrenoRGB(blob);
  if (bruto.largura !== meta.largura || bruto.altura !== meta.altura) console.warn(`terreno.png ${bruto.largura}x${bruto.altura} difere do terreno.json ${meta.largura}x${meta.altura}; uso o PNG`);

  let texW = bruto.largura, texH = bruto.altura, dados = bruto.alturas;
  if (texW > TEXTURA_MAX) {
    const W2 = TEXTURA_MAX, H2 = Math.max(2, Math.round(texH * W2 / texW));
    dados = reamostrar(dados, texW, texH, W2, H2);
    texW = W2; texH = H2;
  }
  const textura = new THREE.DataTexture(dados, texW, texH, THREE.RedFormat, THREE.FloatType);
  textura.minFilter = THREE.NearestFilter;
  textura.magFilter = THREE.NearestFilter;
  textura.generateMipmaps = false;
  textura.wrapS = textura.wrapT = THREE.ClampToEdgeWrapping;
  textura.flipY = false;
  textura.unpackAlignment = 4;
  textura.needsUpdate = true;

  // --- escala (SPEC: km, origem no centro do bbox, +x leste, +z sul, +y cima) ---
  const bb = meta.bbox;
  const lonC = (bb.oeste + bb.leste) / 2, latC = (bb.norte + bb.sul) / 2;
  const kmPorGrauX = 111.32 * Math.cos(latC * Math.PI / 180);
  const kmW = (bb.leste - bb.oeste) * kmPorGrauX;
  const kmH = (bb.norte - bb.sul) * 111.32;
  const exagero = Number(lugar.exagero_vertical) || 15;
  const escalaY = exagero / 1000;
  const nivelMin = Number(lugar.nivel_minimo_m ?? -6000);
  const cena_xz = (lon, lat) => [(lon - lonC) * kmPorGrauX, (latC - lat) * 111.32];

  // --- malha do terreno ----------------------------------------------------
  const segW = Math.min(MALHA_MAX, texW);
  let segH = Math.max(2, Math.round(segW * kmH / kmW));
  while (segW * segH * 2 > TRIANGULOS_MAX) segH = Math.floor(segH * 0.9);
  const geometria = (() => {
    const nv = (segW + 1) * (segH + 1);
    const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    let k = 0;
    for (let j = 0; j <= segH; j++) {
      const v = j / segH;
      for (let i = 0; i <= segW; i++, k++) {
        const u = i / segW;
        pos[k * 3] = -kmW / 2 + u * kmW; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = -kmH / 2 + v * kmH;   // v=0 é o norte (linha 0)
        uv[k * 2] = u; uv[k * 2 + 1] = v;
      }
    }
    const idx = new Uint32Array(segW * segH * 6);
    let q = 0;
    for (let j = 0; j < segH; j++) for (let i = 0; i < segW; i++) {
      const a = j * (segW + 1) + i, b = a + 1, c = a + segW + 1, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b;
      idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.hypot(kmW, kmH, 20000 * escalaY));
    return g;
  })();

  const comuns = {
    uAltura: { value: textura },
    uTam: { value: new Int32Array([texW, texH]) },
    uAgua: { value: 0 },
    uNevoa: { value: 0.0042 },
  };
  const matTerreno = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: TERRENO_VS,
    fragmentShader: TERRENO_FS,
    side: THREE.DoubleSide,
    uniforms: {
      uAltura: comuns.uAltura, uTam: comuns.uTam, uAgua: comuns.uAgua, uNevoa: comuns.uNevoa,
      uEscalaY: { value: escalaY },
      uKm: { value: new THREE.Vector2(kmW, kmH) },
      uMarMenor: { value: 100 }, uMarMaior: { value: 500 },
      uTerraMenor: { value: 50 }, uTerraMaior: { value: 250 },
      uLargura: { value: 1.35 },
      uPreenchimento: { value: 0.006 },
      uPxAng: { value: 0.001 },
      uCorTerra: { value: new THREE.Color(0.20, 0.92, 1.0) },
      uCorTerraAlta: { value: new THREE.Color(0.85, 1.0, 1.0) },
      uCorMarRaso: { value: new THREE.Color(0.82, 0.42, 1.0) },
      uCorMarFundo: { value: new THREE.Color(0.40, 0.26, 1.0) },
      uCorMarSub: { value: new THREE.Color(0.25, 0.35, 1.0) },
      uCorAgua: { value: new THREE.Color(0.80, 1.0, 1.0) },
    },
  });
  const terreno = new THREE.Mesh(geometria, matTerreno);
  terreno.frustumCulled = false;

  // --- água ------------------------------------------------------------------
  const geoAgua = (() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([-kmW / 2, 0, -kmH / 2, kmW / 2, 0, -kmH / 2, -kmW / 2, 0, kmH / 2, kmW / 2, 0, kmH / 2]);
    const uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    return g;
  })();
  const matAgua = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: AGUA_VS,
    fragmentShader: AGUA_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uAltura: comuns.uAltura, uTam: comuns.uTam, uAgua: comuns.uAgua, uNevoa: comuns.uNevoa,
      uOpacidade: { value: 0.72 },
      uKm: { value: new THREE.Vector2(kmW, kmH) },
      uCorAgua: { value: new THREE.Color(0.55, 0.95, 1.0) },
      uCorAguaFundo: { value: new THREE.Color(0.03, 0.05, 0.16) },
    },
  });
  const agua = new THREE.Mesh(geoAgua, matAgua);
  agua.renderOrder = 2;
  agua.frustumCulled = false;

  // --- régua: Cristo Redentor, 30 m, base em y=0 ----------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.add(terreno, agua);
  let regua = null;
  if (lugar.regua && Number.isFinite(lugar.regua.lon) && Number.isFinite(lugar.regua.lat)) {
    try {
      const gltf = await new GLTFLoader().loadAsync(`${RAIZ}regua/cristo-web.glb`);
      const matRegua = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: REGUA_VS, fragmentShader: REGUA_FS,
        uniforms: { uCor: { value: new THREE.Color(0.85, 1.0, 1.0) }, uNevoa: comuns.uNevoa },
      });
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals();
        o.material = matRegua;
        o.frustumCulled = true;
      });
      const [rx, rz] = cena_xz(lugar.regua.lon, lugar.regua.lat);
      // altura do terreno no ponto (amostra bilinear na textura), nunca abaixo do mar
      const u = (rx + kmW / 2) / kmW, v = (rz + kmH / 2) / kmH;
      const cx = Math.min(texW - 1, Math.max(0, Math.round(u * texW - 0.5))), cy = Math.min(texH - 1, Math.max(0, Math.round(v * texH - 0.5)));
      const hRegua = Math.max(0, dados[cy * texW + cx]);
      const escala = escalaY * (Number(lugar.regua.escala) || 1);
      regua = gltf.scene;
      regua.scale.setScalar(escala);
      regua.position.set(rx, hRegua * escalaY, rz);
      regua.rotation.y = Math.PI / 2;    // de frente para o mar (leste)
      scene.add(regua);
    } catch (e) { console.warn('régua não carregou: ' + e.message); }
  }

  // --- câmera e pós ----------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(50, 1, 0.2, 5000);
  const composer = new EffectComposer(renderer);
  const passeCena = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.4, 0.1);
  const saida = new OutputPass();
  composer.addPass(passeCena); composer.addPass(bloom); composer.addPass(saida);

  function redimensionar() {
    const w = CAPTURA ? (window.innerWidth || 1080) : window.innerWidth;
    const h = CAPTURA ? (window.innerHeight || 1920) : window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  redimensionar();

  // --- trilha ----------------------------------------------------------------
  async function carregarTrilha() {
    const tenta = async (url) => { try { const r = await fetch(url); if (!r.ok) return null; return await r.json(); } catch { return null; } };
    const propria = params.get('camera');
    if (propria) { const j = await tenta(propria); if (j) return new Trilha(j); }
    const local = await tenta('./camera.json');
    if (local && (!local.lugar || local.lugar === SLUG)) return new Trilha(local);
    const doLugar = await tenta(base + 'camera.json');
    if (doLugar) return new Trilha(doLugar);
    return trilhaPadrao(kmW, kmH, escalaY, nivelMin);
  }
  const trilha = await carregarTrilha();

  // --- estado e render -------------------------------------------------------
  const estado = { t: 0, nivel_agua_m: 0, pos: [0, 0, 0], alvo: [0, 0, 0], livre: false };
  const alvoV = new THREE.Vector3();
  let aguaManual = null;

  function aplicarAgua(m) {
    estado.nivel_agua_m = m;
    comuns.uAgua.value = m;
    agua.position.y = m * escalaY;
  }
  function desenhar() {
    matTerreno.uniforms.uPxAng.value = 2 * Math.tan(camera.fov * Math.PI / 360) / renderer.domElement.height;
    renderer.info.reset();
    composer.render();
  }
  const proximoQuadro = () => new Promise((ok) => {
    let feito = false;
    requestAnimationFrame(() => { feito = true; ok(); });
    setTimeout(() => { if (!feito) ok(); }, 300);
  });

  async function setTime(t) {
    t = Math.min(trilha.duracao, Math.max(0, Number(t) || 0));
    const q = trilha.em(t);
    estado.t = t;
    aguaManual = null;
    if (!estado.livre) {
      camera.position.set(q.pos[0], q.pos[1], q.pos[2]);
      alvoV.set(q.alvo[0], q.alvo[1], q.alvo[2]);
      camera.lookAt(alvoV);
      estado.pos = q.pos; estado.alvo = q.alvo;
      if (controles) controles.target.copy(alvoV);
    }
    if (camera.fov !== q.fov) { camera.fov = q.fov; camera.updateProjectionMatrix(); }
    aplicarAgua(q.nivel_agua_m);
    atualizarUI();
    desenhar();
    await proximoQuadro();
  }
  async function setWater(m) {
    aguaManual = Number(m);
    aplicarAgua(aguaManual);
    atualizarUI();
    desenhar();
    await proximoQuadro();
  }

  // --- interface (só fora do modo captura) -----------------------------------
  let controles = null;
  let tocando = false, inicioToque = 0, tInicioToque = 0, quadroPedido = 0;
  const ui = CAPTURA ? null : {
    nome: $('nome'), exagero: $('exagero'), controles: $('controles'), reproduzir: $('reproduzir'),
    esvaziar: $('esvaziar'), tempo: $('tempo'), relogio: $('relogio'), creditos: $('creditos'),
  };
  function atualizarUI() {
    if (!ui) return;
    const nivel = aguaManual ?? estado.nivel_agua_m;
    ui.esvaziar.value = String(Math.round(1000 * Math.min(1, Math.max(0, nivel / nivelMin))));
    ui.tempo.value = String(Math.round(estado.t * 1000));
    ui.relogio.value = `${estado.t.toFixed(1).replace('.', ',')} s · ${Math.round(nivel)} m`;
  }
  if (ui) {
    ui.nome.textContent = lugar.nome || SLUG;
    ui.exagero.textContent = `Relevo em quilômetros, exagero vertical ${exagero}x · ${meta.km ? `${Math.round(meta.km.largura)} km por ${Math.round(meta.km.altura)} km` : ''}`;
    // Créditos curtos (o texto completo de cada fonte fica no title, e no terreno.json)
    const nomes = { gmrt: 'GMRT (Ryan et al. 2009, CC BY 4.0)', 'gmrt-topo-mask': null, 'copernicus-glo30': 'Copernicus DEM GLO-30 (ESA/Airbus, uso livre com atribuição)' };
    const fontes = (meta.fontes || []).map((f) => (f.id in nomes ? nomes[f.id] : `${f.id}${f.licenca && f.licenca.length < 24 ? ` (${f.licenca})` : ''}`)).filter(Boolean);
    const linhas = [];
    if (fontes.length) linhas.push(`Relevo: ${[...new Set(fontes)].join(' · ')}${meta.fixture ? ' · dado provisório' : ''}`);
    if (regua) linhas.push('Régua: Cristo Redentor (30 m), modelo 3D de Parlin Sitorus via Sketchfab, CC BY 4.0');
    ui.creditos.title = (meta.fontes || []).map((f) => `${f.id}: ${f.atribuicao || ''} ${f.licenca || ''}`.trim()).join('\n');
    ui.creditos.innerHTML = linhas.map((l) => `<div>${l.replace(/</g, '&lt;')}</div>`).join('');
    ui.creditos.hidden = false;
    ui.controles.hidden = false;
    ui.tempo.max = String(Math.round(trilha.duracao * 1000));

    controles = new OrbitControls(camera, canvas);
    controles.enableDamping = false;
    controles.enablePan = true;
    controles.screenSpacePanning = true;
    controles.minDistance = 0.5;
    controles.maxDistance = 4000;
    controles.addEventListener('start', () => { pausar(); estado.livre = true; });
    controles.addEventListener('change', () => { estado.pos = camera.position.toArray(); estado.alvo = controles.target.toArray(); desenhar(); });

    const laco = (agora) => {
      if (!tocando) return;
      const t = tInicioToque + (agora - inicioToque) / 1000;
      if (t >= trilha.duracao) { setTime(trilha.duracao); pausar(); return; }
      setTime(t);
      quadroPedido = requestAnimationFrame(laco);
    };
    const tocar = () => {
      estado.livre = false;
      tocando = true;
      ui.reproduzir.textContent = 'Pausar';
      tInicioToque = estado.t >= trilha.duracao - 0.05 ? 0 : estado.t;
      quadroPedido = requestAnimationFrame((agora) => { inicioToque = agora; laco(agora); });
    };
    const pausar = () => {
      if (!tocando) return;
      tocando = false;
      cancelAnimationFrame(quadroPedido);
      ui.reproduzir.textContent = 'Reproduzir';
    };
    ui.reproduzir.addEventListener('click', () => (tocando ? pausar() : tocar()));
    ui.esvaziar.addEventListener('input', () => { pausar(); setWater(nivelMin * Number(ui.esvaziar.value) / 1000); });
    ui.tempo.addEventListener('input', () => { pausar(); estado.livre = false; setTime(Number(ui.tempo.value) / 1000); });
    window.addEventListener('resize', () => { redimensionar(); desenhar(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pausar(); });
  }

  // --- primeiro quadro -------------------------------------------------------
  await setTime(T_INICIAL);
  const tempoReady = performance.now() - t0;

  const api = {
    setTime,
    setWater,
    duration: () => trilha.duracao,
    getState: () => ({ t: estado.t, nivel_agua_m: aguaManual ?? estado.nivel_agua_m, pos: [...camera.position.toArray()], alvo: estado.livre ? [...controles.target.toArray()] : [...estado.alvo] }),
    metrics: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      malha: [segW + 1, segH + 1],
      textura: [texW, texH],
      quadro: [renderer.domElement.width, renderer.domElement.height],
      tempo_ready_ms: Math.round(tempoReady),
    }),
  };
  return api;
}

let resolverReady, rejeitarReady;
window.__bsm = {
  ready: new Promise((ok, erro) => { resolverReady = ok; rejeitarReady = erro; }),
  setTime: async () => { throw new Error('cena ainda carregando'); },
  setWater: async () => { throw new Error('cena ainda carregando'); },
  duration: () => 61,
  getState: () => ({ t: 0, nivel_agua_m: 0, pos: [0, 0, 0], alvo: [0, 0, 0] }),
  metrics: () => ({ calls: 0, triangles: 0 }),
};
iniciar().then((api) => {
  Object.assign(window.__bsm, api);
  resolverReady(true);
}).catch((e) => {
  mostrarErro('Não consegui montar a cena: ' + (e && e.message ? e.message : e));
  rejeitarReady(e);
});
