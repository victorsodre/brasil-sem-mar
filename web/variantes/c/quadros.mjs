#!/usr/bin/env node
// Teste de verdade da variante C: sobe o servidor estático (se a porta estiver
// livre), pega o mutex de headless, abre o Chromium do Playwright com GPU Metal,
// espera window.__bsm.ready, grava os quadros pedidos, confere determinismo
// (mesmo t duas vezes → bytes iguais), mede metrics() e o tempo de ready, e mata
// tudo o que subiu (também em erro e SIGINT).
//
// Uso: node web/variantes/c/quadros.mjs [--porta 8783] [--lugar 002-vitoria-trindade]
//      [--tempos 0,4,8,12,30,55] [--saida web/variantes/c/quadros] [--largura 1080] [--altura 1920]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..', '..');
const args = process.argv.slice(2);
const opt = (nome, def) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : def; };
const PORTA = Number(opt('--porta', 8783));
const LUGAR = opt('--lugar', '002-vitoria-trindade');
const TEMPOS = String(opt('--tempos', '0,4,8,12,30,55')).split(',').map(Number);
const SAIDA = path.resolve(RAIZ, opt('--saida', path.join(AQUI, 'quadros')));
const LARG = Number(opt('--largura', 1080)), ALT = Number(opt('--altura', 1920));
const LOCK = '/tmp/brasil-sem-mar-quadro.lock';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function vivo(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
async function pegarMutex() {
  const fim = Date.now() + 10 * 60 * 1000;
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid));
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = NaN;
      try { pid = Number(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8').trim()); } catch { /* sem pid */ }
      if (Number.isFinite(pid) && pid !== process.pid && vivo(pid)) {
        if (Date.now() > fim) throw new Error(`mutex ${LOCK} ocupado pelo pid ${pid} há mais de 10 min`);
        console.log(`  mutex ocupado (pid ${pid}); espero 5 s`);
        await dormir(5000);
      } else {
        console.log(`  mutex com pid morto (${pid}); removo`);
        try { fs.unlinkSync(path.join(LOCK, 'pid')); } catch { /* já foi */ }
        try { fs.rmdirSync(LOCK); } catch { /* já foi */ }
      }
    }
  }
}
function soltarMutex() {
  try { const pid = Number(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8').trim()); if (pid !== process.pid) return; } catch { return; }
  try { fs.unlinkSync(path.join(LOCK, 'pid')); } catch { /* ok */ }
  try { fs.rmdirSync(LOCK); } catch { /* ok */ }
}

async function portaResponde() {
  try { const r = await fetch(`http://127.0.0.1:${PORTA}/package.json`, { method: 'HEAD' }); return r.ok; } catch { return false; }
}

let servidor = null, browser = null;
async function limpar() {
  if (browser) { try { await browser.close(); } catch { /* ok */ } browser = null; }
  if (servidor) { try { servidor.kill('SIGTERM'); } catch { /* ok */ } servidor = null; }
  soltarMutex();
}
process.on('SIGINT', async () => { await limpar(); process.exit(130); });
process.on('SIGTERM', async () => { await limpar(); process.exit(143); });

const relatorio = { lugar: LUGAR, porta: PORTA, viewport: [LARG, ALT], quadros: [], erros: [] };
try {
  if (!(await portaResponde())) {
    servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'serve.mjs'), '--porta', String(PORTA)], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] });
    servidor.stdout.on('data', (d) => process.stdout.write('  [serve] ' + d));
    servidor.stderr.on('data', (d) => process.stderr.write('  [serve] ' + d));
    for (let i = 0; i < 50 && !(await portaResponde()); i++) await dormir(100);
    if (!(await portaResponde())) throw new Error('servidor não subiu');
    console.log(`servidor em 127.0.0.1:${PORTA} (pid ${servidor.pid})`);
  } else console.log(`servidor já respondia em 127.0.0.1:${PORTA}; não subo outro`);

  await pegarMutex();
  console.log('mutex ok');
  browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: LARG, height: ALT }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => relatorio.erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') relatorio.erros.push(`${m.type()}: ${m.text()}`); });
  const url = `http://127.0.0.1:${PORTA}/web/variantes/c/index.html?lugar=${LUGAR}&capture=1`;
  const t0 = performance.now();
  await page.goto(url, { waitUntil: 'load' });
  const info = await page.evaluate(() => window.__bsm.ready, null);
  relatorio.ready_ms = Math.round(performance.now() - t0);
  relatorio.info = info;
  console.log(`ready em ${relatorio.ready_ms} ms (na página: ${info.ready_ms} ms) · textura ${info.textura.join('x')} · malha ${info.segmentos.join('x')} = ${info.triangulos.toLocaleString('pt-BR')} tri`);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/d';
  });
  relatorio.gpu = gpu;
  console.log(`GPU: ${gpu}`);
  if (/swiftshader/i.test(gpu)) throw new Error('SwiftShader: sem GPU de verdade');

  fs.mkdirSync(SAIDA, { recursive: true });
  for (const t of TEMPOS) {
    const ta = performance.now();
    await page.evaluate((tt) => window.__bsm.setTime(tt), t);
    const tb = performance.now();
    const nome = `t${String(t).padStart(2, '0')}.png`;
    const png = await page.screenshot({ path: path.join(SAIDA, nome), type: 'png' });
    const m = await page.evaluate(() => window.__bsm.metrics());
    const st = await page.evaluate(() => window.__bsm.getState());
    relatorio.quadros.push({ t, arquivo: nome, bytes: png.length, setTime_ms: Math.round(tb - ta), metrics: m, estado: st });
    console.log(`  t=${String(t).padStart(2)} s → ${nome} ${(png.length / 1024).toFixed(0)} KB · setTime ${Math.round(tb - ta)} ms · ${m.calls} draw calls · ${m.triangles.toLocaleString('pt-BR')} tri · água ${Math.round(st.nivel_agua_m)} m`);
  }

  if (args.includes('--debug')) {
    const tDbg = Number(opt('--debug-t', 0));
    const variantes = { semagua: { agua: false }, semreflexo: { reflexo: false }, semlinha: { linha: false }, semborda: { borda: false },
      semarestas: { arestas: false }, semcontornos: { contornos: false }, semregua: { regua: false }, sembloom: { bloom: false },
      socorpo: { linha: false, arestas: false, contornos: false, reflexo: false, borda: false }, soreflexo: { mostrarReflexo: true },
      soarestas: { linha: false, contornos: false, reflexo: false, borda: false }, solinha: { arestas: false, contornos: false, reflexo: false, borda: false },
      soborda: { linha: false, arestas: false, contornos: false, reflexo: false }, soreflexoagua: { linha: false, arestas: false, contornos: false, borda: false } };
    const so = String(opt('--debug-so', '')).split(',').filter(Boolean);
    const lista = so.length ? Object.fromEntries(so.map((k) => [k, variantes[k]])) : variantes;
    for (const [nome, f] of Object.entries(lista)) {
      await page.evaluate((tt) => window.__bsm.setTime(tt), tDbg);
      await page.evaluate((ff) => window.__bsm._debug(ff), f);
      await page.screenshot({ path: path.join(SAIDA, `dbg-t${tDbg}-${nome}.png`), type: 'png' });
    }
    await page.evaluate(() => window.__bsm._debug({}));
    console.log('diagnóstico gravado: ' + Object.keys(variantes).join(', '));
  }

  // determinismo: t=8 duas vezes, com um quadro diferente no meio
  await page.evaluate(() => window.__bsm.setTime(8));
  const a = await page.screenshot({ type: 'png' });
  await page.evaluate(() => window.__bsm.setTime(30));
  await page.evaluate(() => window.__bsm.setTime(8));
  const b = await page.screenshot({ type: 'png' });
  let diff = 0;
  if (a.length !== b.length) diff = Math.abs(a.length - b.length);
  else for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  relatorio.determinismo = { bytes_diferentes: diff, igual: diff === 0 };
  console.log(`determinismo: setTime(8) duas vezes → ${diff === 0 ? 'bytes iguais' : diff + ' bytes diferentes'}`);
  if (args.includes('--interativo')) {
    const pg2 = await context.newPage();
    await pg2.setViewportSize({ width: 1280, height: 720 });
    pg2.on('pageerror', (e) => relatorio.erros.push('interativo: ' + String(e)));
    await pg2.goto(`http://127.0.0.1:${PORTA}/web/variantes/c/index.html?lugar=${LUGAR}`, { waitUntil: 'load' });
    await pg2.evaluate(() => window.__bsm.ready);
    const ui = await pg2.evaluate(() => ({
      nome: document.getElementById('nome').textContent, sub: document.getElementById('sub').textContent,
      creditos: document.getElementById('creditos').textContent, botao: document.getElementById('reproduzir').textContent,
      uiVisivel: !document.getElementById('ui').hidden,
    }));
    await pg2.screenshot({ path: path.join(SAIDA, 'interativo-inicio.png') });
    await pg2.click('#reproduzir');
    await dormir(1500);
    const t1 = await pg2.evaluate(() => window.__bsm.getState().t);
    const botao2 = await pg2.evaluate(() => document.getElementById('reproduzir').textContent);
    await pg2.click('#reproduzir'); // pausa
    await pg2.evaluate(() => { const s = document.getElementById('agua'); s.value = '-2500'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    const agua = await pg2.evaluate(() => window.__bsm.getState().nivel_agua_m);
    const antes = await pg2.evaluate(() => window.__bsm.getState().pos);
    await pg2.mouse.move(640, 360); await pg2.mouse.down(); await pg2.mouse.move(700, 380, { steps: 8 }); await pg2.mouse.up();
    await dormir(200);
    const depois = await pg2.evaluate(() => [window.__bsm.getState().pos, window.__bsm.getState().t]);
    await pg2.screenshot({ path: path.join(SAIDA, 'interativo-orbita.png') });
    relatorio.interativo = { ui, t_apos_1500ms: t1, botao_tocando: botao2, agua_slider: agua, orbita_moveu: JSON.stringify(antes) !== JSON.stringify(depois[0]) };
    console.log(`interativo: "${ui.nome}" · botão "${ui.botao}"→"${botao2}" · t após 1,5 s = ${t1.toFixed(2)} s · slider água → ${agua} m · órbita moveu: ${relatorio.interativo.orbita_moveu}`);
    console.log('  créditos: ' + ui.creditos);
    await pg2.close();
  }
  relatorio.erros.length ? console.log('erros/avisos da página:\n  ' + relatorio.erros.join('\n  ')) : console.log('sem erros na página');
  fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify(relatorio, null, 2) + '\n');
  console.log(`relatório em ${path.relative(RAIZ, path.join(SAIDA, 'relatorio.json'))}`);
} catch (e) {
  console.error('FALHA:', e?.stack || e);
  process.exitCode = 1;
} finally {
  await limpar();
}
