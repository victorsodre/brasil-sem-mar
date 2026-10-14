#!/usr/bin/env node
// Prova da variante B: sobe o servidor estático, abre a página em modo captura num
// Chromium com GPU de verdade (Metal), espera window.__bsm.ready, grava os quadros
// pedidos em quadros/tNN.png, confere determinismo (setTime(8) duas vezes → bytes
// iguais) e mede metrics(). Um headless por vez na máquina: mutex por mkdir.
//
// Uso: node web/variantes/b/prova.mjs [--porta 8782] [--lugar 002-vitoria-trindade] [--tempos 0,4,8,12,30,55] [--saida quadros] [--sem-servidor] [--extras]
// --extras: na mesma sessão, também prova o modo interativo (UI, botão, slider, órbita → quadros/ui.png),
// o parâmetro t da URL, setWater e a régua do Cristo de perto (quadros/regua.png).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..', '..');
const args = process.argv.slice(2);
const opt = (nome, def) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : def; };
const PORTA = Number(opt('--porta', 8782));
const LUGAR = opt('--lugar', '002-vitoria-trindade');
const TEMPOS = opt('--tempos', '0,4,8,12,30,55').split(',').map(Number);
const SEM_SERVIDOR = args.includes('--sem-servidor');
const EXTRAS = args.includes('--extras');
const SAIDA = path.resolve(opt('--saida', path.join(AQUI, 'quadros')));
const LOCK = '/tmp/brasil-sem-mar-quadro.lock';
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

async function pegarMutex() {
  const limite = Date.now() + 10 * 60 * 1000;
  for (;;) {
    try { fs.mkdirSync(LOCK); fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid)); return; }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
    let pid = NaN;
    try { pid = Number(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8').trim()); } catch {}
    if (!Number.isFinite(pid) || !vivo(pid)) { fs.rmSync(LOCK, { recursive: true, force: true }); continue; }
    if (Date.now() > limite) throw new Error(`mutex ${LOCK} ocupado pelo pid ${pid} há mais de 10 min`);
    console.log(`headless ocupado (pid ${pid}); espero 5 s`);
    await dormir(5000);
  }
}
function soltarMutex() { try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch {} }

let servidor = null, browser = null;
async function limpar() {
  if (browser) { try { await browser.close(); } catch {} browser = null; }
  if (servidor) { try { servidor.kill('SIGTERM'); } catch {} servidor = null; }
  soltarMutex();
}
process.on('SIGINT', async () => { await limpar(); process.exit(130); });
process.on('SIGTERM', async () => { await limpar(); process.exit(143); });

async function subirServidor() {
  servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts', 'serve.mjs'), '--porta', String(PORTA)], { stdio: ['ignore', 'pipe', 'pipe'] });
  servidor.stderr.on('data', (d) => process.stderr.write('[serve] ' + d));
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORTA}/package.json`); if (r.ok) return; } catch {}
    await dormir(100);
  }
  throw new Error('servidor não respondeu');
}

async function principal() {
  fs.mkdirSync(SAIDA, { recursive: true });
  await pegarMutex();
  const relatorio = { lugar: LUGAR, porta: PORTA, tempos: TEMPOS, quadros: [], erros: [] };
  try {
    if (!SEM_SERVIDOR) await subirServidor();
    const t0 = Date.now();
    browser = await chromium.launch({ channel: 'chromium', args: GPU_ARGS });
    const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', (e) => relatorio.erros.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') relatorio.erros.push(`${m.type()}: ${m.text()}`); });
    const url = `http://127.0.0.1:${PORTA}/web/variantes/b/index.html?lugar=${LUGAR}&capture=1`;
    const tNav = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__bsm && window.__bsm.ready, null, { timeout: 120000 });
    const pronto = await page.evaluate(() => window.__bsm.ready);
    relatorio.ready = { ...pronto, ms_desde_goto: Date.now() - tNav, ms_desde_launch: Date.now() - t0 };
    relatorio.gpu = await page.evaluate(() => {
      const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : 'sem webgl2');
    });
    for (const t of TEMPOS) {
      const ini = Date.now();
      await page.evaluate((tt) => window.__bsm.setTime(tt), t);
      const nome = `t${String(t).padStart(2, '0')}.png`;
      const buf = await page.screenshot({ type: 'png', fullPage: false });
      fs.writeFileSync(path.join(SAIDA, nome), buf);
      const estado = await page.evaluate(() => window.__bsm.getState());
      relatorio.quadros.push({ t, arquivo: nome, bytes: buf.length, ms: Date.now() - ini, estado });
    }
    // determinismo: setTime(8) duas vezes, bytes iguais
    await page.evaluate(() => window.__bsm.setTime(8));
    const a = await page.screenshot({ type: 'png' });
    await page.evaluate(() => window.__bsm.setTime(30));
    await page.evaluate(() => window.__bsm.setTime(8));
    const b = await page.screenshot({ type: 'png' });
    relatorio.determinismo = { bytes_iguais: a.equals(b), bytes_a: a.length, bytes_b: b.length };
    relatorio.metrics = await page.evaluate(() => window.__bsm.metrics());
    relatorio.duration = await page.evaluate(() => window.__bsm.duration());
    // tempo de um setTime (média de 5 em t=30)
    relatorio.ms_por_quadro = await page.evaluate(async () => {
      const t0 = performance.now(); for (let i = 0; i < 5; i++) await window.__bsm.setTime(30 + i * 0.1); return (performance.now() - t0) / 5;
    });
    if (EXTRAS) {
      const ex = {};
      // parâmetro t da URL + setWater
      await page.goto(`http://127.0.0.1:${PORTA}/web/variantes/b/index.html?lugar=${LUGAR}&capture=1&t=30`, { waitUntil: 'load', timeout: 120000 });
      await page.evaluate(() => window.__bsm.ready);
      ex.t_url = (await page.evaluate(() => window.__bsm.getState())).t;
      await page.evaluate(() => window.__bsm.setWater(-1200));
      ex.setWater = (await page.evaluate(() => window.__bsm.getState())).nivel_agua_m;
      // régua de perto (override pos/alvo só para prévia)
      const lugar = await (await fetch(`http://127.0.0.1:${PORTA}/lugares/${LUGAR}/lugar.json`)).json();
      const terreno = await (await fetch(`http://127.0.0.1:${PORTA}/lugares/${LUGAR}/terreno.json`)).json();
      if (lugar.regua) {
        const bb = terreno.bbox, lonC = (bb.oeste + bb.leste) / 2, latC = (bb.norte + bb.sul) / 2;
        const x = (lugar.regua.lon - lonC) * 111.32 * Math.cos(latC * Math.PI / 180), z = (latC - lugar.regua.lat) * 111.32;
        const pos = [x - 1.1, 0.42, z + 0.9].map((v) => v.toFixed(3)).join(','), alvo = [x, 0.22, z].map((v) => v.toFixed(3)).join(',');
        await page.goto(`http://127.0.0.1:${PORTA}/web/variantes/b/index.html?lugar=${LUGAR}&capture=1&t=0&pos=${pos}&alvo=${alvo}`, { waitUntil: 'load', timeout: 120000 });
        await page.evaluate(() => window.__bsm.ready);
        fs.writeFileSync(path.join(SAIDA, 'regua.png'), await page.screenshot({ type: 'png' }));
        ex.regua = { pos, alvo, metrics: await page.evaluate(() => window.__bsm.metrics()) };
      }
      // modo interativo: UI, botão, slider, órbita
      await page.goto(`http://127.0.0.1:${PORTA}/web/variantes/b/index.html?lugar=${LUGAR}&t=4`, { waitUntil: 'load', timeout: 120000 });
      await page.evaluate(() => window.__bsm.ready);
      ex.ui = await page.evaluate(() => ({
        nome: document.getElementById('nome').textContent, exagero: document.getElementById('exagero').textContent,
        creditos: document.getElementById('creditos').innerText, botao: document.getElementById('reproduzir').textContent,
        agua_min: document.getElementById('agua').min, tempo_max: document.getElementById('tempo').max, dpr: window.devicePixelRatio,
      }));
      await page.click('#reproduzir');
      await dormir(1200);
      ex.tocando = await page.evaluate(() => ({ botao: document.getElementById('reproduzir').textContent, t: window.__bsm.getState().t }));
      await page.click('#reproduzir');
      const antes = await page.evaluate(() => window.__bsm.getState());
      await page.mouse.move(540, 700); await page.mouse.down(); await page.mouse.move(640, 760, { steps: 8 }); await page.mouse.up();
      const depois = await page.evaluate(() => window.__bsm.getState());
      ex.orbita_mexeu = antes.pos.some((v, i) => Math.abs(v - depois.pos[i]) > 1e-6);
      await page.evaluate(() => { const s = document.getElementById('agua'); s.value = '-900'; s.dispatchEvent(new Event('input', { bubbles: true })); });
      ex.slider_agua = (await page.evaluate(() => window.__bsm.getState())).nivel_agua_m;
      fs.writeFileSync(path.join(SAIDA, 'ui.png'), await page.screenshot({ type: 'png' }));
      relatorio.extras = ex;
    }
  } finally {
    await limpar();
  }
  fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify(relatorio, null, 2) + '\n');
  console.log(JSON.stringify(relatorio, null, 2));
}

principal().catch(async (e) => { console.error('prova falhou:', e); await limpar(); process.exit(1); });
