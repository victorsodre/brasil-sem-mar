// brasil-sem-mar — variante B, "varredura e pontos".
// O relevo como pontos de luz (mais densos onde a encosta é íngreme), linhas de
// contorno esparsas, uma linha de varredura no nível d'água com rastro curto,
// terra em ciano, fundo do mar em violeta e magenta, montes submarinos como
// heróis mais brilhantes, névoa de profundidade forte e bloom médio.
// Fundo preto puro e só luz: a esteira compõe este quadro com "lighter".
//
// Contrato (SPEC.md): window.__bsm = { ready, setTime, duration, setWater, getState, metrics }.
// Relógio só por setTime: nada de Date.now nem Math.random na cena.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';   // cópia local: o vendor comum não tem SkeletonUtils.js (ver vendor/LEIA-ME.md)
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const T_INICIO = performance.now();
const params = new URLSearchParams(location.search);
const SLUG = params.get('lugar') || '002-vitoria-trindade';
const CAPTURE = params.get('capture') === '1';
const T_URL = Number(params.get('t') || 0);
const lerVec = (nome) => { const v = (params.get(nome) || '').split(',').map(Number); return v.length === 3 && v.every(Number.isFinite) ? v : null; };
const POS_URL = lerVec('pos'), ALVO_URL = lerVec('alvo');     // prévia: câmera fixa, fora da trilha (água continua pelo tempo)
const RAIZ = '../../../';                       // raiz do repo a partir de web/variantes/b/
const MALHA_MAX = 1024;                         // largura máxima da malha (SPEC)
const TEXTURA_MAX = 2048;                       // largura máxima da textura de altura (SPEC)
const TRIANGULOS_MAX = 1000000;                 // orçamento da malha (SPEC: ≤ 1 M)
const PONTOS_MAX = 450000;                      // orçamento dos pontos de luz

// ---------------------------------------------------------------------------
// Estado e API pública (criada já, antes de qualquer carga, para o headless ver)
// ---------------------------------------------------------------------------
const estado = {
  t: T_URL, aguaManual: null, nivelAgua: 0, pos: new THREE.Vector3(), alvo: new THREE.Vector3(),
  pronto: false, readyMs: null, pontos: 0, malha: null, textura: null, tocando: false,
};
let resolverPronto, rejeitarPronto;
const ready = new Promise((res, rej) => { resolverPronto = res; rejeitarPronto = rej; });
let trilha = null;
let render = () => {};
let aplicarAgua = () => {};
let renderer = null;

const proximoQuadro = () => new Promise((r) => requestAnimationFrame(() => r()));

window.__bsm = {
  ready,
  duration: () => (trilha ? trilha.duracao_s : 0),
  async setTime(t) {
    estado.aguaManual = null;
    aplicarTrilha(Math.min(Math.max(Number(t) || 0, 0), trilha ? trilha.duracao_s : 0));
    render();
    await proximoQuadro();
  },
  setWater(m) {
    estado.aguaManual = Number(m);
    aplicarAgua(estado.aguaManual);
    render();
  },
  getState: () => ({
    t: estado.t, nivel_agua_m: estado.nivelAgua,
    pos: [estado.pos.x, estado.pos.y, estado.pos.z], alvo: [estado.alvo.x, estado.alvo.y, estado.alvo.z],
  }),
  metrics: () => {
    const r = renderer ? renderer.info.render : { calls: 0, triangles: 0, points: 0, lines: 0 };
    return {
      calls: r.calls, triangles: r.triangles, points: r.points, lines: r.lines,
      pontos_gerados: estado.pontos, malha: estado.malha, textura: estado.textura, ready_ms: estado.readyMs,
      memoria: renderer ? { geometrias: renderer.info.memory.geometries, texturas: renderer.info.memory.textures } : null,
    };
  },
};

// ---------------------------------------------------------------------------
// Carga de dados
// ---------------------------------------------------------------------------
async function carregarJson(url, opcional = false) {
  const r = await fetch(url);
  if (!r.ok) { if (opcional) return null; throw new Error(`não achei ${url} (${r.status})`); }
  return r.json();
}

function carregarImagem(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`não consegui abrir ${url}`));
    img.src = url;
  });
}

// Terrain-RGB (Mapbox): h = -10000 + (R*65536 + G*256 + B) * 0.1. Decodificado em
// Float32 via canvas 2D: o navegador nunca vê isto como PNG de 16 bits.
function decodificarTerrainRGB(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  const h = new Float32Array(W * H);
  for (let i = 0, n = W * H; i < n; i++) h[i] = -10000 + (d[i * 4] * 65536 + d[i * 4 + 1] * 256 + d[i * 4 + 2]) * 0.1;
  return { W, H, h };
}

// Reduz a grade para no máximo maxW de largura (média de 2x2 amostras bilineares por nó).
function reduzir(grade, maxW) {
  if (grade.W <= maxW) return grade;
  const { W, H, h } = grade;
  const nw = maxW, nh = Math.max(2, Math.round(H * maxW / W));
  const out = new Float32Array(nw * nh);
  const bil = (px, py) => {
    px = Math.min(Math.max(px, 0), W - 1); py = Math.min(Math.max(py, 0), H - 1);
    const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j;
    const i1 = Math.min(i + 1, W - 1), j1 = Math.min(j + 1, H - 1);
    return (h[j * W + i] * (1 - fx) + h[j * W + i1] * fx) * (1 - fy) + (h[j1 * W + i] * (1 - fx) + h[j1 * W + i1] * fx) * fy;
  };
  const sx = W / nw, sy = H / nh;
  for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
    const cx = (i + 0.5) * sx - 0.5, cy = (j + 0.5) * sy - 0.5;
    out[j * nw + i] = 0.25 * (bil(cx - sx * 0.25, cy - sy * 0.25) + bil(cx + sx * 0.25, cy - sy * 0.25) + bil(cx - sx * 0.25, cy + sy * 0.25) + bil(cx + sx * 0.25, cy + sy * 0.25));
  }
  return { W: nw, H: nh, h: out };
}

// Proeminência local = altura menos a média numa janela larga (box blur separável, O(n)).
function proeminencia(grade, raioNos) {
  const { W, H, h } = grade;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  const r = Math.max(1, raioNos);
  for (let j = 0; j < H; j++) {
    let soma = 0, n = 0;
    for (let i = -r; i <= r; i++) { if (i >= 0 && i < W) { soma += h[j * W + i]; n++; } }
    for (let i = 0; i < W; i++) {
      tmp[j * W + i] = soma / n;
      const fora = i - r, dentro = i + r + 1;
      if (fora >= 0) { soma -= h[j * W + fora]; n--; }
      if (dentro < W) { soma += h[j * W + dentro]; n++; }
    }
  }
  for (let i = 0; i < W; i++) {
    let soma = 0, n = 0;
    for (let j = -r; j <= r; j++) { if (j >= 0 && j < H) { soma += tmp[j * W + i]; n++; } }
    for (let j = 0; j < H; j++) {
      out[j * W + i] = h[j * W + i] - soma / n;
      const fora = j - r, dentro = j + r + 1;
      if (fora >= 0) { soma -= tmp[fora * W + i]; n--; }
      if (dentro < H) { soma += tmp[dentro * W + i]; n++; }
    }
  }
  return out;
}

// Hash inteiro determinístico em [0,1): a "aleatoriedade" dos pontos vem daqui, nunca de Math.random.
function hash(i, j, k) {
  let x = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k + 1, 1274126177)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const suave = (a, b, x) => { const u = Math.min(Math.max((x - a) / (b - a), 0), 1); return u * u * (3 - 2 * u); };

// Altura da textura em uv, igualzinha à hpBil do shader (texelFetch com clamp + bilinear).
function alturaUv(grade, u, v) {
  const { W, H, h } = grade;
  const px = u * W - 0.5, py = v * H - 0.5;
  const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j;
  const at = (ii, jj) => h[Math.min(Math.max(jj, 0), H - 1) * W + Math.min(Math.max(ii, 0), W - 1)];
  return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
}

// Pontos de luz: até 2 por nó da textura, com densidade pelo declive (na escala da cena, com o
// exagero) e jitter dentro do nó. A altura de cada ponto é a da SUPERFÍCIE DA MALHA naquele lugar
// (vértices com a mesma amostragem do vertex shader, interpolação planar no triângulo do quad):
// assim a malha, mais grossa que a textura, nunca esconde um ponto no teste de profundidade.
function gerarPontos(grade, prom, km, yPorM, nx, nz) {
  const { W, H, h } = grade;
  const kmx = km.largura / W, kmz = km.altura / H;
  const vert = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) vert[j * (nx + 1) + i] = alturaUv(grade, i / nx, j / nz);
  const alturaMalha = (u, v) => {
    const gx = Math.min(u * nx, nx - 1e-6), gz = Math.min(v * nz, nz - 1e-6);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fy = gz - j;
    const ha = vert[j * (nx + 1) + i], hb = vert[j * (nx + 1) + i + 1], hc = vert[(j + 1) * (nx + 1) + i], hd = vert[(j + 1) * (nx + 1) + i + 1];
    // índices da malha: (a, c, b) cobre fx + fy <= 1; (b, c, d) o resto
    return fx + fy <= 1 ? ha + (hb - ha) * fx + (hc - ha) * fy : hd + (hb - hd) * (1 - fy) + (hc - hd) * (1 - fx);
  };
  const densidade = new Float32Array(W * H);
  let esperado = 0;
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const o = j * W + i;
      const dx = (h[o + 1] - h[o - 1]) / (2 * kmx) * yPorM, dz = (h[o + W] - h[o - W]) / (2 * kmz) * yPorM;
      const declive = Math.sqrt(dx * dx + dz * dz);                 // km por km na cena
      densidade[o] = 0.012 + 1.5 * suave(0.12, 1.5, declive);
      esperado += densidade[o];
    }
  }
  const fator = Math.min(1, PONTOS_MAX / Math.max(esperado, 1));  // orçamento: lugares grandes ficam mais ralos
  const pos = [], meta = [];
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const o = j * W + i;
      const dens = densidade[o] * fator;
      for (let k = 0; k < 2; k++) {
        if (hash(i, j, k) >= dens - k) continue;
        const u = (i + hash(i, j, k + 2)) / W, v = (j + hash(i, j, k + 4)) / H;
        const hh = alturaMalha(u, v);
        pos.push((u - 0.5) * km.largura, hh * yPorM, (v - 0.5) * km.altura);
        meta.push(h[o], prom[o]);
      }
    }
  }
  return { pos: new Float32Array(pos), meta: new Float32Array(meta), n: pos.length / 3 };
}

// Grade de malha: largura ≤ MALHA_MAX, altura pela proporção em km; y vem do vertex shader.
function geometriaGrade(nx, nz, km) {
  const geo = new THREE.BufferGeometry();
  const nv = (nx + 1) * (nz + 1);
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  let p = 0, q = 0;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / nz;
    pos[p++] = (u - 0.5) * km.largura; pos[p++] = 0; pos[p++] = (v - 0.5) * km.altura;
    uv[q++] = u; uv[q++] = v;
  }
  const idx = new Uint32Array(nx * nz * 6);
  let k = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.hypot(km.largura, km.altura, 200));
  return geo;
}

// ---------------------------------------------------------------------------
// Shaders (GLSL ES 3.0 via three; texelFetch na textura de altura em resolução cheia)
// ---------------------------------------------------------------------------
const GLSL_COMUM = /* glsl */`
  uniform sampler2D uH;        // R = altura (m), G = proeminência (m)
  uniform ivec2 uN;            // nós da textura
  uniform float uYPorM;        // km de cena por metro (exagero / 1000)
  uniform float uAgua;         // nível d'água (m)
  uniform float uNevoa;        // 1 / km
  uniform vec3 uCam;
  uniform vec2 uKmPorNo;       // km por nó da textura (x, z)
  vec2 hpAt(ivec2 p) { p = clamp(p, ivec2(0), uN - 1); return texelFetch(uH, p, 0).rg; }
  // declive na escala da cena (km por km, com o exagero): plano abissal ≈ 0,1; encosta ≈ 1; monte ≈ 3
  float declive(vec2 uv) {
    ivec2 i = ivec2(floor(uv * vec2(uN)));
    float dx = (hpAt(i + ivec2(1, 0)).x - hpAt(i - ivec2(1, 0)).x) / (2.0 * uKmPorNo.x) * uYPorM;
    float dz = (hpAt(i + ivec2(0, 1)).x - hpAt(i - ivec2(0, 1)).x) / (2.0 * uKmPorNo.y) * uYPorM;
    return length(vec2(dx, dz));
  }
  vec2 hpBil(vec2 uv) {
    vec2 p = uv * vec2(uN) - 0.5;
    vec2 f = fract(p);
    ivec2 i = ivec2(floor(p));
    return mix(mix(hpAt(i), hpAt(i + ivec2(1, 0)), f.x), mix(hpAt(i + ivec2(0, 1)), hpAt(i + ivec2(1, 1)), f.x), f.y);
  }
  float nevoa(float dist) { float d = dist * uNevoa; return exp(-d * d); }
  // bordas do bbox somem suavemente (o mundo não acaba numa reta)
  float borda(vec2 uv) { return smoothstep(0.0, 0.035, uv.x) * smoothstep(1.0, 0.965, uv.x) * smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.88, uv.y); }
  vec3 corDe(float h, float prom) {
    vec3 ciano = vec3(0.30, 0.95, 1.00);
    vec3 violeta = vec3(0.52, 0.30, 1.00);
    vec3 magenta = vec3(1.00, 0.26, 0.78);
    vec3 mar = mix(violeta, magenta, smoothstep(-2200.0, -4300.0, h));
    vec3 c = mix(mar, ciano, smoothstep(-60.0, 40.0, h));
    float heroi = smoothstep(500.0, 1900.0, prom) * (1.0 - step(0.0, h));
    c = mix(c, vec3(0.85, 0.95, 1.0), heroi * 0.35) * (1.0 + heroi * 0.6);
    return c;
  }
`;

const VS_RELEVO = /* glsl */`
  ${GLSL_COMUM}
  varying vec2 vUv; varying vec3 vPos;
  void main() {
    vUv = uv;
    vec2 hp = hpBil(uv);
    vec3 p = vec3(position.x, hp.x * uYPorM, position.z);
    vPos = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FS_RELEVO = /* glsl */`
  ${GLSL_COMUM}
  uniform float uLinhas;       // força das linhas de contorno
  uniform float uVarredura;    // força da linha de varredura
  varying vec2 vUv; varying vec3 vPos;
  void main() {
    vec2 hp = hpBil(vUv);
    float h = hp.x, prom = hp.y;
    float dpx = fwidth(h);                                    // metros por pixel
    float dist = distance(vPos, uCam);
    float fog = nevoa(dist) * borda(vUv);
    // linhas de contorno esparsas: 500 m no mar, 200 m na terra
    float intervalo = h < 0.0 ? 500.0 : 200.0;
    float c = abs(fract(h / intervalo) - 0.5) * intervalo;    // fase deslocada: nunca há linha em 0 m (o nível do mar é da água)
    float w = max(dpx * 1.1, 0.8);
    float linha = 1.0 - smoothstep(0.0, w, c);
    float densas = 1.0 - smoothstep(0.06, 0.28, dpx / intervalo);   // some onde ficariam densas (moiré)
    // varredura: a linha do nível atual, com rastro curto logo acima (o que acabou de secar)
    float s = h - uAgua;
    float ws = max(dpx * 1.6, 1.5);
    float decl = declive(vUv);
    float ingreme = smoothstep(0.1, 0.6, decl);
    linha *= 1.0 - smoothstep(3.5, 6.0, decl);                 // em paredão extremo a linha vira zigue-zague: some
    linha *= smoothstep(0.015, 0.06, decl);                     // em chão plano a "linha" encheria polígonos inteiros: some
    float perto = 0.15 + 0.85 * smoothstep(6.0, 45.0, dist);   // perto da câmera a linha ocuparia área demais
    float varredura = (1.0 - smoothstep(0.0, ws, abs(s))) * (0.08 + 0.92 * ingreme) * perto;   // chão plano no nível da água não vira placa acesa
    float rastro = s > 0.0 ? exp(-s / 240.0) * (1.0 - smoothstep(0.0, 0.25, dpx / 240.0)) * (0.12 + 0.88 * ingreme) * perto : 0.0;
    vec3 cor = corDe(h, prom);
    vec3 rgb = cor * linha * densas * uLinhas + vec3(1.0, 1.0, 1.0) * varredura * uVarredura + mix(cor, vec3(1.0), 0.3) * rastro * 0.45;
    gl_FragColor = vec4(rgb * fog, 1.0);
  }
`;

const VS_PONTOS = /* glsl */`
  ${GLSL_COMUM}
  attribute vec2 aMeta;        // altura (m), proeminência (m)
  uniform float uTamKm;        // tamanho do ponto em km (antes da perspectiva)
  uniform float uEscalaPx;     // altura do viewport / (2 tan(fov/2))
  uniform vec2 uKm;            // largura e altura do bbox em km
  varying vec3 vCor; varying float vA;
  void main() {
    vec3 p = position;
    vec3 d = uCam - p;
    float dist = length(d);
    p += d / max(dist, 0.001) * min(0.25, dist * 0.02);      // folga para a câmera (os pontos já estão sobre a malha)
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = uTamKm * uEscalaPx / max(-mv.z, 0.01);
    gl_PointSize = clamp(px, 1.3, 4.0);
    float cobertura = clamp(px / 1.3, 0.0, 1.0);
    cobertura *= cobertura;
    cobertura *= 1.0 / max(1.0, px / 2.6);                     // ponto grande perto da câmera não vira bokeh
    vec2 uv = position.xz / uKm + 0.5;
    float fog = nevoa(dist) * borda(uv);
    float s = aMeta.x - uAgua;
    float rastro = s > 0.0 ? exp(-s / 350.0) : 0.0;
    vCor = corDe(aMeta.x, aMeta.y) + vec3(0.6) * rastro * (0.3 + 0.7 * smoothstep(6.0, 45.0, dist));
    vA = fog * cobertura;
  }
`;

const FS_PONTOS = /* glsl */`
  uniform float uBrilho;
  varying vec3 vCor; varying float vA;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    if (r2 > 1.0) discard;
    float a = 1.0 - r2;
    a *= a;
    gl_FragColor = vec4(vCor * (a * vA * uBrilho), 1.0);
  }
`;

const VS_AGUA = /* glsl */`
  varying vec2 vUv; varying vec3 vPos;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;

const FS_AGUA = /* glsl */`
  ${GLSL_COMUM}
  varying vec2 vUv; varying vec3 vPos;
  void main() {
    vec2 hp = hpBil(vUv);
    float profundidade = uAgua - hp.x;                        // metros de água aqui
    float dpx = fwidth(hp.x);
    float ingreme = smoothstep(0.1, 0.6, declive(vUv));
    float beirada = exp(-max(profundidade, 0.0) / max(14.0, dpx * 1.5)) * (1.0 - smoothstep(0.0, 0.5, dpx / 40.0)) * (0.08 + 0.92 * ingreme);
    float dist = distance(vPos, uCam);
    float fog = nevoa(dist) * borda(vUv);
    float rasante = abs((uCam.y - vPos.y) / max(dist, 0.001));  // 1 olhando de cima, 0 no horizonte
    float perto = 0.15 + 0.85 * smoothstep(6.0, 45.0, dist);
    vec3 superficie = vec3(0.004, 0.010, 0.028) * (0.25 + 0.75 * smoothstep(0.0, 0.35, rasante));  // some no horizonte
    vec3 rgb = (superficie + vec3(0.75, 0.97, 1.0) * beirada * 0.7 * perto) * fog;
    gl_FragColor = vec4(rgb, 0.78);                           // escurece o que está debaixo d'água
  }
`;

const VS_REGUA = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying vec3 vPos;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz; vPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FS_REGUA = /* glsl */`
  uniform float uNevoa; uniform vec3 uCam;
  varying vec3 vN; varying vec3 vV; varying vec3 vPos;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    float d = distance(vPos, uCam) * uNevoa;
    vec3 c = vec3(0.85, 1.0, 1.0) * (0.04 + 0.7 * f) * exp(-d * d);
    gl_FragColor = vec4(c, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Trilha de câmera: Catmull-Rom centrípeta no tempo (pos e alvo), smoothstep para água e fov
// ---------------------------------------------------------------------------
function cubicPoly() {
  let c0 = 0, c1 = 0, c2 = 0, c3 = 0;
  return {
    init(x0, x1, t0, t1) { c0 = x0; c1 = t0; c2 = -3 * x0 + 3 * x1 - 2 * t0 - t1; c3 = 2 * x0 - 2 * x1 + t0 + t1; },
    initNaoUniforme(x0, x1, x2, x3, dt0, dt1, dt2) {
      let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
      let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
      t1 *= dt1; t2 *= dt1;
      this.init(x1, x2, t1, t2);
    },
    calc(t) { const t2 = t * t, t3 = t2 * t; return c0 + c1 * t + c2 * t2 + c3 * t3; },
  };
}
const polis = { x: cubicPoly(), y: cubicPoly(), z: cubicPoly() };
const vTmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

function catmullRomNoTempo(keys, campo, t, saida) {
  const n = keys.length;
  if (n === 1) return saida.fromArray(keys[0][campo]);
  let i = 0;
  while (i < n - 2 && t >= keys[i + 1].t) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const u = Math.min(Math.max((t - k1.t) / Math.max(k2.t - k1.t, 1e-6), 0), 1);
  const p1 = vTmp[1].fromArray(k1[campo]), p2 = vTmp[2].fromArray(k2[campo]);
  const p0 = i > 0 ? vTmp[0].fromArray(keys[i - 1][campo]) : vTmp[0].copy(p1).sub(p2).add(p1);
  const p3 = i + 2 < n ? vTmp[3].fromArray(keys[i + 2][campo]) : vTmp[3].copy(p2).sub(p1).add(p2);
  // centrípeta: espaçamento dos nós = distância^0,5
  let dt0 = Math.pow(p0.distanceToSquared(p1), 0.25), dt1 = Math.pow(p1.distanceToSquared(p2), 0.25), dt2 = Math.pow(p2.distanceToSquared(p3), 0.25);
  if (dt1 < 1e-4) dt1 = 1.0;
  if (dt0 < 1e-4) dt0 = dt1;
  if (dt2 < 1e-4) dt2 = dt1;
  polis.x.initNaoUniforme(p0.x, p1.x, p2.x, p3.x, dt0, dt1, dt2);
  polis.y.initNaoUniforme(p0.y, p1.y, p2.y, p3.y, dt0, dt1, dt2);
  polis.z.initNaoUniforme(p0.z, p1.z, p2.z, p3.z, dt0, dt1, dt2);
  return saida.set(polis.x.calc(u), polis.y.calc(u), polis.z.calc(u));
}

function escalarNoTempo(keys, campo, t, padrao) {
  const n = keys.length;
  if (t <= keys[0].t) return keys[0][campo] ?? padrao;
  if (t >= keys[n - 1].t) return keys[n - 1][campo] ?? padrao;
  let i = 0;
  while (i < n - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i][campo] ?? padrao, b = keys[i + 1][campo] ?? padrao;
  return a + (b - a) * suave(keys[i].t, keys[i + 1].t, t);
}

function nivelAguaEm(t) {
  if (trilha.agua && trilha.agua.length) return escalarNoTempo(trilha.agua, 'm', t, 0);
  return escalarNoTempo(trilha.keyframes, 'nivel_agua_m', t, 0);
}

let camera = null, controles = null;
function aplicarTrilha(t) {
  estado.t = t;
  if (!trilha || !camera) return;
  catmullRomNoTempo(trilha.keyframes, 'pos', t, estado.pos);
  catmullRomNoTempo(trilha.keyframes, 'alvo', t, estado.alvo);
  if (POS_URL && ALVO_URL) { estado.pos.fromArray(POS_URL); estado.alvo.fromArray(ALVO_URL); }
  camera.position.copy(estado.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(estado.alvo);
  const fov = escalarNoTempo(trilha.keyframes, 'fov', t, 50);
  if (fov !== camera.fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (controles) controles.target.copy(estado.alvo);
  aplicarAgua(nivelAguaEm(t));
}

// Trilha padrão quando o lugar não tem camera.json: parada sobre o centro, água descendo em 12 s.
function trilhaPadrao(km, nivelMinimo) {
  const p = [-km.largura * 0.3, 2.0, km.altura * 0.1];
  return {
    duracao_s: 61, fps: 30, agua: [{ t: 0, m: 0 }, { t: 10.5, m: nivelMinimo }],
    keyframes: [
      { t: 0, pos: p, alvo: [p[0] + 120, -2, p[2]], nivel_agua_m: 0, fov: 50 },
      { t: 61, pos: [p[0] + 120, 3.5, p[2]], alvo: [p[0] + 260, -6, p[2]], nivel_agua_m: nivelMinimo, fov: 50 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Montagem da cena
// ---------------------------------------------------------------------------
function mostrarErro(e) {
  console.error(e);
  const el = document.getElementById('erro');
  if (el) { el.textContent = 'Deu erro: ' + (e && e.message ? e.message : String(e)); el.hidden = false; }
}

async function iniciar() {
  if (CAPTURE) document.body.classList.add('capture');
  const canvas = document.getElementById('cena');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false;
  const dpr = CAPTURE ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const pastaLugar = `${RAIZ}lugares/${SLUG}/`;
  // trilha: ./camera.json (se o slug bater) → ./camera-<slug>.json → lugares/<slug>/camera.json → padrão
  const [lugar, terreno, trilhaLocal] = await Promise.all([
    carregarJson(pastaLugar + 'lugar.json'),
    carregarJson(pastaLugar + 'terreno.json'),
    carregarJson('./camera.json', true),
  ]);
  trilha = (trilhaLocal && trilhaLocal.slug === SLUG) ? trilhaLocal : null;
  if (!trilha) { const t = await carregarJson(`./camera-${SLUG}.json`, true); if (t && t.slug === SLUG) trilha = t; }
  if (!trilha) trilha = await carregarJson(pastaLugar + 'camera.json', true);
  const EXAG = lugar.exagero_vertical;
  const yPorM = EXAG / 1000;
  const km = terreno.km;
  if (!trilha) trilha = trilhaPadrao(km, lugar.nivel_minimo_m);
  trilha.keyframes.sort((a, b) => a.t - b.t);

  // terreno → Float32 → (≤ 2048) → proeminência → DataTexture RG32F
  const img = await carregarImagem(pastaLugar + 'terreno.png');
  if (img.naturalWidth !== terreno.largura || img.naturalHeight !== terreno.altura) {
    console.warn(`terreno.png ${img.naturalWidth}x${img.naturalHeight} difere de terreno.json ${terreno.largura}x${terreno.altura}; uso a imagem`);
  }
  let grade = decodificarTerrainRGB(img);
  let hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < grade.h.length; i++) { const v = grade.h[i]; if (v < hMin) hMin = v; if (v > hMax) hMax = v; }
  if (Math.abs(hMin - terreno.elev_min_m) > 1 || Math.abs(hMax - terreno.elev_max_m) > 1) {
    console.warn(`decodificação suspeita: min/max ${hMin.toFixed(1)}/${hMax.toFixed(1)} vs terreno.json ${terreno.elev_min_m}/${terreno.elev_max_m}`);
  }
  grade = reduzir(grade, TEXTURA_MAX);
  const kmPorNo = km.largura / grade.W;
  const prom = proeminencia(grade, Math.round(28 / kmPorNo));
  const rg = new Float32Array(grade.W * grade.H * 2);
  for (let i = 0; i < grade.h.length; i++) { rg[i * 2] = grade.h[i]; rg[i * 2 + 1] = prom[i]; }
  const texAltura = new THREE.DataTexture(rg, grade.W, grade.H, THREE.RGFormat, THREE.FloatType);
  texAltura.magFilter = THREE.NearestFilter; texAltura.minFilter = THREE.NearestFilter;
  texAltura.generateMipmaps = false; texAltura.wrapS = THREE.ClampToEdgeWrapping; texAltura.wrapT = THREE.ClampToEdgeWrapping;
  texAltura.needsUpdate = true;
  estado.textura = { largura: grade.W, altura: grade.H };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 4000);

  const uniformesComuns = {
    uH: { value: texAltura }, uN: { value: new THREE.Vector2(grade.W, grade.H) }, uYPorM: { value: yPorM },
    uAgua: { value: 0 }, uNevoa: { value: 1 / 270 }, uCam: { value: camera.position },
  };
  // uN é ivec2 no shader: three envia Vector2 como vec2; declaro como array de inteiros
  const uN = { value: [grade.W, grade.H] };
  const uKmPorNo = { value: new THREE.Vector2(km.largura / grade.W, km.altura / grade.H) };
  const base = () => ({ uH: uniformesComuns.uH, uN, uYPorM: uniformesComuns.uYPorM, uAgua: uniformesComuns.uAgua, uNevoa: uniformesComuns.uNevoa, uCam: uniformesComuns.uCam, uKmPorNo });

  // malha do relevo
  let nx = Math.min(MALHA_MAX, grade.W), nz = Math.max(2, Math.round(nx * km.altura / km.largura));
  if (nx * nz * 2 > TRIANGULOS_MAX) {                         // bbox quase quadrado: reduz os dois eixos
    const f = Math.sqrt(TRIANGULOS_MAX / (nx * nz * 2));
    nx = Math.max(2, Math.floor(nx * f)); nz = Math.max(2, Math.floor(nz * f));
  }
  const relevo = new THREE.Mesh(geometriaGrade(nx, nz, km), new THREE.ShaderMaterial({
    uniforms: { ...base(), uLinhas: { value: 0.26 }, uVarredura: { value: 1.0 } },
    vertexShader: VS_RELEVO, fragmentShader: FS_RELEVO, side: THREE.DoubleSide,
  }));
  relevo.frustumCulled = false;
  scene.add(relevo);
  estado.malha = { largura: nx + 1, altura: nz + 1, triangulos: nx * nz * 2 };

  // pontos de luz
  const pontos = gerarPontos(grade, prom, km, yPorM, nx, nz);
  const geoPontos = new THREE.BufferGeometry();
  geoPontos.setAttribute('position', new THREE.BufferAttribute(pontos.pos, 3));
  geoPontos.setAttribute('aMeta', new THREE.BufferAttribute(pontos.meta, 2));
  geoPontos.boundingSphere = relevo.geometry.boundingSphere.clone();
  const matPontos = new THREE.ShaderMaterial({
    uniforms: { ...base(), uTamKm: { value: 0.14 }, uEscalaPx: { value: 1000 }, uKm: { value: new THREE.Vector2(km.largura, km.altura) }, uBrilho: { value: 0.9 } },
    vertexShader: VS_PONTOS, fragmentShader: FS_PONTOS,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true,
  });
  const nuvem = new THREE.Points(geoPontos, matPontos);
  nuvem.frustumCulled = false; nuvem.renderOrder = 1;
  scene.add(nuvem);
  estado.pontos = pontos.n;

  // água: plano escuro translúcido no nível atual, beirada luminosa onde cruza o relevo
  const agua = new THREE.Mesh(geometriaGrade(1, 1, km), new THREE.ShaderMaterial({
    uniforms: base(), vertexShader: VS_AGUA, fragmentShader: FS_AGUA,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
  }));
  agua.frustumCulled = false; agua.renderOrder = 2;
  scene.add(agua);

  aplicarAgua = (m) => {
    estado.nivelAgua = m;
    uniformesComuns.uAgua.value = m;
    agua.position.y = m * yPorM;
  };

  // régua: Cristo Redentor, 30 m reais, base em y=0, escala exagero/1000 * fator declarado
  let regua = null;
  if (lugar.regua && lugar.regua.lon != null) {
    const gltf = await new GLTFLoader().loadAsync(RAIZ + 'regua/cristo-web.glb');
    regua = gltf.scene;
    const matRegua = new THREE.ShaderMaterial({ uniforms: { uNevoa: uniformesComuns.uNevoa, uCam: uniformesComuns.uCam }, vertexShader: VS_REGUA, fragmentShader: FS_REGUA });
    regua.traverse((o) => { if (o.isMesh) { o.material = matRegua; o.frustumCulled = true; } });
    const bb = terreno.bbox;
    const lonC = (bb.oeste + bb.leste) / 2, latC = (bb.norte + bb.sul) / 2;
    const x = (lugar.regua.lon - lonC) * 111.32 * Math.cos(latC * Math.PI / 180);
    const z = (latC - lugar.regua.lat) * 111.32;
    const u = x / km.largura + 0.5, v = z / km.altura + 0.5;
    const i = Math.min(Math.max(Math.round(u * grade.W - 0.5), 0), grade.W - 1), j = Math.min(Math.max(Math.round(v * grade.H - 0.5), 0), grade.H - 1);
    const h = Math.max(grade.h[j * grade.W + i], 0);        // nunca abaixo do mar (na fixture GMRT a costa sai a -14 m)
    regua.position.set(x, h * yPorM, z);
    regua.scale.setScalar(yPorM * (lugar.regua.escala ?? 1));
    regua.rotation.y = -Math.PI / 2;                           // de frente para o leste, como a câmera que chega
    scene.add(regua);
  }

  // pós: bloom médio + saída sRGB
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr), 0.65, 0.5, 0.22);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const ajustarTamanho = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    matPontos.uniforms.uEscalaPx.value = (h * dpr) / (2 * Math.tan(camera.fov * Math.PI / 360));
  };
  ajustarTamanho();

  render = () => {
    matPontos.uniforms.uEscalaPx.value = (renderer.domElement.height) / (2 * Math.tan(camera.fov * Math.PI / 360));
    renderer.info.reset();
    composer.render();
  };

  // modo interativo
  if (!CAPTURE) {
    controles = new OrbitControls(camera, canvas);
    controles.enableDamping = false;
    controles.addEventListener('start', () => { estado.tocando = false; atualizarBotao(); });
    controles.addEventListener('change', () => { estado.pos.copy(camera.position); estado.alvo.copy(controles.target); render(); });
    montarUi(lugar, terreno, trilha);
    window.addEventListener('resize', () => { ajustarTamanho(); render(); });
  }

  aplicarTrilha(Math.min(Math.max(T_URL, 0), trilha.duracao_s));
  render();
  await proximoQuadro();
  estado.readyMs = Math.round(performance.now() - T_INICIO);
  estado.pronto = true;
  resolverPronto({ ready_ms: estado.readyMs, pontos: estado.pontos, malha: estado.malha, textura: estado.textura });
}

// ---------------------------------------------------------------------------
// UI (só fora do modo captura)
// ---------------------------------------------------------------------------
let atualizarBotao = () => {};
function montarUi(lugar, terreno, trilhaAtual) {
  const ui = document.getElementById('ui');
  ui.hidden = false;
  document.getElementById('nome').textContent = lugar.nome;
  document.getElementById('exagero').textContent = `relevo real, exagero vertical ${lugar.exagero_vertical}× · ${terreno.km.largura.toFixed(0)} × ${terreno.km.altura.toFixed(0)} km`;
  const creditos = document.getElementById('creditos');
  const vistos = new Set();
  const fontes = (terreno.fontes || []).map((f) => `Relevo: ${f.atribuicao || f.id} — ${f.licenca || 'licença não informada'}`)
    .filter((txt) => { if (vistos.has(txt)) return false; vistos.add(txt); return true; })   // GMRT topo e topo-mask têm a mesma atribuição
    .map((txt) => `<p>${txt}</p>`).join('');
  creditos.innerHTML = fontes + '<p>Régua de 30 m: Cristo Redentor, modelo de Parlin Sitorus (Sketchfab), CC BY 4.0.</p>' + (terreno.fixture ? '<p>Terreno provisório (fixture): só GMRT, sem Copernicus na terra.</p>' : '');

  const botao = document.getElementById('reproduzir');
  const tempo = document.getElementById('tempo'), tempoValor = document.getElementById('tempo-valor');
  const aguaIn = document.getElementById('agua'), aguaValor = document.getElementById('agua-valor');
  tempo.max = String(trilhaAtual.duracao_s);
  aguaIn.min = String(lugar.nivel_minimo_m);
  const mostrarTempo = () => { tempo.value = String(estado.t); tempoValor.textContent = `${estado.t.toFixed(1)} s`; };
  const mostrarAgua = () => { aguaIn.value = String(Math.round(estado.nivelAgua)); aguaValor.textContent = `${Math.round(estado.nivelAgua)} m`; };
  atualizarBotao = () => { botao.textContent = estado.tocando ? 'Pausar' : 'Reproduzir'; if (controles) controles.enabled = !estado.tocando; };

  let inicioRaf = null;
  const laco = (ts) => {
    if (!estado.tocando) return;
    if (inicioRaf === null) inicioRaf = ts - estado.t * 1000;
    const t = (ts - inicioRaf) / 1000;                         // relógio do rAF só para avançar t; a cena só vê setTime
    if (t >= trilhaAtual.duracao_s) { estado.tocando = false; aplicarTrilha(trilhaAtual.duracao_s); render(); mostrarTempo(); mostrarAgua(); atualizarBotao(); return; }
    aplicarTrilha(t); render(); mostrarTempo(); mostrarAgua();
    requestAnimationFrame(laco);
  };
  botao.addEventListener('click', () => {
    estado.tocando = !estado.tocando;
    inicioRaf = null;
    if (estado.t >= trilhaAtual.duracao_s - 0.05) estado.t = 0;
    atualizarBotao();
    if (estado.tocando) requestAnimationFrame(laco);
  });
  tempo.addEventListener('input', () => { estado.tocando = false; atualizarBotao(); aplicarTrilha(Number(tempo.value)); render(); mostrarTempo(); mostrarAgua(); });
  aguaIn.addEventListener('input', () => { estado.tocando = false; atualizarBotao(); window.__bsm.setWater(Number(aguaIn.value)); mostrarAgua(); });
  mostrarTempo(); mostrarAgua(); atualizarBotao();
}

iniciar().catch((e) => { mostrarErro(e); rejeitarPronto(e); });
