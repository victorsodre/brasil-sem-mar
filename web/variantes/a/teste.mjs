#!/usr/bin/env node
// Teste de verdade da variante A: sobe o servidor estático, abre a página em
// Chromium headless com GPU (Metal), espera window.__bsm.ready, salva 6 quadros
// em quadros/, confere determinismo (setTime(8) duas vezes -> bytes iguais) e
// mede metrics(). Um headless por vez na máquina: mutex /tmp/brasil-sem-mar-quadro.lock.
//
// Uso: node web/variantes/a/teste.mjs [--porta 8781] [--lugar 002-vitoria-trindade] [--tempos 0,4,8,12,30,55] [--saida pasta]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../..');
const args = process.argv.slice(2);
const opt = (nome, def) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : def; };
const PORTA = Number(opt('--porta', 8781));
const LUGAR = opt('--lugar', '002-vitoria-trindade');
const TEMPOS = opt('--tempos', '0,4,8,12,30,55').split(',').map(Number);
const UI = args.includes('--ui');   // fumaça do modo interativo em vez dos quadros
const SAIDA = path.resolve(opt('--saida', path.join(AQUI, 'quadros')));
const LOCK = '/tmp/brasil-sem-mar-quadro.lock';
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

async function pegarMutex() {
  const limite = performance.now() + 10 * 60 * 1000;
  for (;;) {
    try { fs.mkdirSync(LOCK); fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid)); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let pid = NaN;
    try { pid = Number(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8').trim()); } catch { /* sem pid: trata como morto */ }
    if (Number.isFinite(pid) && pid > 0 && vivo(pid)) {
      if (performance.now() > limite) throw new Error('mutex ocupado por mais de 10 min: ' + LOCK);
      await dormir(5000);
      continue;
    }
    try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch { /* tenta de novo */ }
  }
}
function soltarMutex() { try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch { /* já solto */ } }

let servidor = null, browser = null;
async function limpar() {
  if (browser) { try { await browser.close(); } catch { /* já fechado */ } browser = null; }
  if (servidor) { try { servidor.kill('SIGTERM'); } catch { /* já morto */ } servidor = null; }
  soltarMutex();
}
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, async () => { await limpar(); process.exit(130); });

async function principal() {
  fs.mkdirSync(SAIDA, { recursive: true });
  servidor = spawn(process.execPath, [path.join(RAIZ, 'scripts/serve.mjs'), '--porta', String(PORTA)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, erro) => {
    servidor.stdout.on('data', (d) => { if (String(d).includes('http://')) ok(); });
    servidor.on('exit', (c) => erro(new Error('servidor saiu com código ' + c)));
    setTimeout(() => ok(), 3000);
  });

  await pegarMutex();
  browser = await chromium.launch({ channel: 'chromium', args: GPU_ARGS });
  const contexto = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const page = await contexto.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erros.push(`${m.type()}: ${m.text()}`); });

  if (UI) { await testarUI(page, `http://127.0.0.1:${PORTA}/web/variantes/a/index.html?lugar=${LUGAR}`, erros); return; }
  const url = `http://127.0.0.1:${PORTA}/web/variantes/a/index.html?lugar=${LUGAR}&capture=1`;
  const inicio = performance.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bsm && window.__bsm.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__bsm.ready);
  const tempoReady = Math.round(performance.now() - inicio);
  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const d = c && c.getExtension('WEBGL_debug_renderer_info');
    return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'desconhecido';
  });
  console.log(`ready em ${tempoReady} ms (até a Promise resolver, inclui carregar a página) · GPU: ${gpu}`);

  const relatorio = { url, tempo_ready_ms: tempoReady, gpu, quadros: [], erros };
  for (const t of TEMPOS) {
    const t1 = performance.now();
    await page.evaluate((t) => window.__bsm.setTime(t), t);
    const nome = `t${String(t).padStart(2, '0')}.png`;
    await page.screenshot({ path: path.join(SAIDA, nome), type: 'png' });
    const estado = await page.evaluate(() => window.__bsm.getState());
    const ms = Math.round(performance.now() - t1);
    relatorio.quadros.push({ t, arquivo: nome, ms, estado });
    console.log(`  ${nome}  ${ms} ms  água ${Math.round(estado.nivel_agua_m)} m  pos ${estado.pos.map((v) => v.toFixed(1)).join(', ')}`);
  }

  // determinismo: setTime(8) duas vezes, com outro tempo no meio
  await page.evaluate(() => window.__bsm.setTime(8));
  const a = await page.screenshot({ type: 'png' });
  await page.evaluate(() => window.__bsm.setTime(30));
  await page.evaluate(() => window.__bsm.setTime(8));
  const b = await page.screenshot({ type: 'png' });
  relatorio.determinismo = { bytes_a: a.length, bytes_b: b.length, iguais: a.equals(b) };
  console.log(`determinismo: ${a.equals(b) ? 'OK, bytes iguais' : 'FALHOU, bytes diferentes'} (${a.length} bytes)`);

  // tempo de um quadro (média de 5 setTime consecutivos)
  const tq = await page.evaluate(async () => {
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) await window.__bsm.setTime(20 + i * 0.5);
    return (performance.now() - t0) / 5;
  });
  relatorio.ms_por_quadro = Math.round(tq * 10) / 10;
  relatorio.metrics = await page.evaluate(() => window.__bsm.metrics());
  relatorio.duration = await page.evaluate(() => window.__bsm.duration());
  console.log(`metrics: ${JSON.stringify(relatorio.metrics)} · duração ${relatorio.duration} s · ${relatorio.ms_por_quadro} ms por quadro (setTime + rAF)`);
  if (erros.length) console.log('avisos/erros da página:\n  ' + erros.join('\n  '));
  fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify(relatorio, null, 2) + '\n');
}

// Modo interativo: controles visíveis, Reproduzir anda o relógio, Esvaziar muda a água, órbita solta a câmera.
async function testarUI(page, url, erros) {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bsm && window.__bsm.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__bsm.ready);
  const visiveis = await page.evaluate(() => ({
    nome: document.getElementById('nome').textContent,
    exagero: document.getElementById('exagero').textContent,
    controles: !document.getElementById('controles').hidden,
    creditos: document.getElementById('creditos').textContent,
    botao: document.getElementById('reproduzir').textContent,
  }));
  console.log('UI:', JSON.stringify(visiveis));
  await page.click('#reproduzir');
  await dormir(1500);
  const depoisPlay = await page.evaluate(() => ({ t: window.__bsm.getState().t, botao: document.getElementById('reproduzir').textContent }));
  await page.click('#reproduzir');
  const slider = await page.$('#esvaziar');
  await slider.evaluate((el) => { el.value = '500'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await dormir(200);
  const depoisAgua = await page.evaluate(() => window.__bsm.getState().nivel_agua_m);
  const antesOrbita = await page.evaluate(() => window.__bsm.getState().pos);
  await page.mouse.move(540, 900); await page.mouse.down(); await page.mouse.move(700, 950, { steps: 8 }); await page.mouse.up();
  await dormir(200);
  const depoisOrbita = await page.evaluate(() => window.__bsm.getState().pos);
  await page.screenshot({ path: path.join(SAIDA, 'ui.png'), type: 'png' });
  console.log(`Reproduzir: t=${depoisPlay.t.toFixed(2)} s após 1,5 s, botão "${depoisPlay.botao}" · Esvaziar 50 %: água ${Math.round(depoisAgua)} m · órbita moveu a câmera: ${antesOrbita.some((v, i) => Math.abs(v - depoisOrbita[i]) > 1e-6)}`);
  if (erros.length) console.log('avisos/erros da página:\n  ' + erros.join('\n  '));
}

principal().then(limpar, async (e) => { console.error('FALHOU: ' + (e && e.stack || e)); await limpar(); process.exit(1); });
