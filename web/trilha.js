// trilha.js — interpolação determinística da trilha de câmera (sem three, roda no
// navegador e no Node). Posições e alvos: Catmull-Rom centrípeta por todos os
// keyframes, com o tempo mapeado ao parâmetro da curva por Hermite monótona
// (Fritsch–Carlson, extremos em repouso): cada keyframe é atingido no seu `t`
// e a velocidade é contínua, sem solavanco. Nível d'água e fov: Hermite monótona
// com extremos em repouso — com dois keyframes é exatamente o smoothstep do SPEC.

function hermiteMonotona(xs, ys) {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const d = new Array(n - 1), m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] === 0 || d[i] === 0 || Math.sign(d[i - 1]) !== Math.sign(d[i])) { m[i] = 0; continue; }
    const h1 = xs[i] - xs[i - 1], h2 = xs[i + 1] - xs[i];
    m[i] = 3 * (h1 + h2) / ((2 * h2 + h1) / d[i - 1] + (h2 + 2 * h1) / d[i]);
  }
  m[0] = 0; m[n - 1] = 0; // extremos em repouso
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x >= xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (x - xs[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i]
         + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// Catmull-Rom não uniforme (Barry–Goldman) com nós centrípetos (alpha = 0,5)
function curvaCentripeta(pontos) {
  const n = pontos.length;
  if (n === 1) return { nos: [0], em: () => pontos[0].slice() };
  const P = [add(pontos[0], sub(pontos[0], pontos[1])), ...pontos, add(pontos[n - 1], sub(pontos[n - 1], pontos[n - 2]))];
  const nos = [0];
  for (let i = 1; i < n; i++) nos.push(nos[i - 1] + Math.sqrt(Math.max(len(sub(pontos[i], pontos[i - 1])), 1e-6)));
  const tramo = (i) => {
    const p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3];
    const t0 = 0, t1 = Math.sqrt(Math.max(len(sub(p1, p0)), 1e-6)), t2 = t1 + Math.sqrt(Math.max(len(sub(p2, p1)), 1e-6)), t3 = t2 + Math.sqrt(Math.max(len(sub(p3, p2)), 1e-6));
    return (s) => {
      const t = t1 + s * (t2 - t1);
      const A1 = add(mul(p0, (t1 - t) / (t1 - t0)), mul(p1, (t - t0) / (t1 - t0)));
      const A2 = add(mul(p1, (t2 - t) / (t2 - t1)), mul(p2, (t - t1) / (t2 - t1)));
      const A3 = add(mul(p2, (t3 - t) / (t3 - t2)), mul(p3, (t - t2) / (t3 - t2)));
      const B1 = add(mul(A1, (t2 - t) / (t2 - t0)), mul(A2, (t - t0) / (t2 - t0)));
      const B2 = add(mul(A2, (t3 - t) / (t3 - t1)), mul(A3, (t - t1) / (t3 - t1)));
      return add(mul(B1, (t2 - t) / (t2 - t1)), mul(B2, (t - t1) / (t2 - t1)));
    };
  };
  const tramos = []; for (let i = 0; i < n - 1; i++) tramos.push(tramo(i));
  return {
    nos,
    em: (u) => {
      if (u <= 0) return pontos[0].slice();
      if (u >= nos[n - 1]) return pontos[n - 1].slice();
      let i = 0; while (i < n - 2 && u >= nos[i + 1]) i++;
      return tramos[i]((u - nos[i]) / (nos[i + 1] - nos[i]));
    },
  };
}

export function prepararTrilha(trilha) {
  const ks = [...trilha.keyframes].sort((a, b) => a.t - b.t);
  const ts = ks.map((k) => k.t);
  const cPos = curvaCentripeta(ks.map((k) => k.pos));
  const cAlvo = curvaCentripeta(ks.map((k) => k.alvo));
  const uPos = hermiteMonotona(ts, cPos.nos);
  const uAlvo = hermiteMonotona(ts, cAlvo.nos);
  // nível d'água e fov: só os keyframes que declaram o campo viram nós da curva
  const curvaCampo = (campo, padrao) => {
    const sel = ks.filter((k) => Number.isFinite(k[campo]));
    if (!sel.length) return () => padrao;
    return hermiteMonotona(sel.map((k) => k.t), sel.map((k) => k[campo]));
  };
  const agua = curvaCampo('nivel_agua_m', 0);
  const fov = curvaCampo('fov', 50);
  const duracao = trilha.duracao_s ?? ts[ts.length - 1];
  return {
    duracao, fps: trilha.fps ?? 30, keyframes: ks,
    amostrar: (t) => ({
      t, pos: cPos.em(uPos(t)), alvo: cAlvo.em(uAlvo(t)), nivel_agua_m: agua(t), fov: fov(t),
    }),
  };
}

// trilha padrão quando o lugar não tem camera.json: órbita baixa e lenta
export function trilhaPadrao(kmW, kmH, nivelMin) {
  const r = Math.max(kmW, kmH) * 0.6, y = Math.max(kmW, kmH) * 0.08;
  const ks = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2 * 0.75 - Math.PI / 2;
    ks.push({ t: i * 7.5, pos: [Math.cos(a) * r, y, Math.sin(a) * r], alvo: [0, -y * 0.3, 0], nivel_agua_m: i < 2 ? 0 : nivelMin, fov: 50 });
  }
  return { duracao_s: 60, fps: 30, keyframes: ks };
}
