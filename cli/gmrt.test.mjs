// Testes offline do gmrt.mjs e da rede: URL do GridServer, mresolution, validação de GeoTIFF, erros em português.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { urlGridServer, mresolutionPadrao, validarGeoTiff, metrosPorNoDoRaster } from './gmrt.mjs';
import { descreverErroRede, ErroHttp, tentar, hashCurto, emParalelo } from './rede.mjs';

const BBOX_002 = { norte: -19.5, sul: -21.8, oeste: -41.0, leste: -28.5 };

test('URL exata do GridServer', () => {
  assert.equal(
    urlGridServer({ bbox: BBOX_002, layer: 'topo', mresolution: 636 }),
    'https://www.gmrt.org/services/GridServer?north=-19.5&south=-21.8&west=-41&east=-28.5&layer=topo&format=geotiff&mresolution=636',
  );
  assert.equal(
    urlGridServer({ bbox: BBOX_002, layer: 'topo-mask' }),
    'https://www.gmrt.org/services/GridServer?north=-19.5&south=-21.8&west=-41&east=-28.5&layer=topo-mask&format=geotiff',
  );
  assert.throws(() => urlGridServer({ bbox: BBOX_002, layer: 'xyz' }), /layer/);
  assert.throws(() => urlGridServer({ bbox: BBOX_002, mresolution: 0 }), /mresolution/);
  assert.throws(() => urlGridServer({ bbox: { norte: 1, sul: 2, oeste: 0, leste: 1 } }), /bbox inválido/);
});

test('mresolution padrão = largura do bbox em metros / largura em nós', () => {
  const m = mresolutionPadrao(BBOX_002, 2048);
  const esperado = Math.round(12.5 * 111.32 * Math.cos(-20.65 * Math.PI / 180) * 1000 / 2048);
  assert.equal(m, esperado);
  assert.ok(m >= 630 && m <= 640, `002 pede ~636 m/nó (veio ${m})`);
  const b = mresolutionPadrao({ norte: 6.0, sul: -34.0, oeste: -74.5, leste: -28.0 }, 2048);
  assert.ok(b >= 2440 && b <= 2460, `Brasil pede ~2452 m/nó (veio ${b})`);
});

test('validação do GeoTIFF: assinatura TIFF ou mensagem do servidor', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsm-'));
  const ok = path.join(dir, 'ok.tif');
  fs.writeFileSync(ok, Buffer.from([0x49, 0x49, 42, 0, 8, 0, 0, 0, 0, 0, 0, 0]));
  assert.equal(validarGeoTiff(ok), null);
  const mm = path.join(dir, 'mm.tif');
  fs.writeFileSync(mm, Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 0]));
  assert.equal(validarGeoTiff(mm), null);
  const ruim = path.join(dir, 'ruim.tif');
  fs.writeFileSync(ruim, '<html><body>GridServer error: bbox too large</body></html>');
  assert.match(validarGeoTiff(ruim), /não devolveu GeoTIFF/);
  assert.match(validarGeoTiff(ruim), /bbox too large/);
  const vazio = path.join(dir, 'vazio.tif');
  fs.writeFileSync(vazio, '');
  assert.match(validarGeoTiff(vazio), /vazio/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('metros por nó do raster devolvido', () => {
  const r = { res: [0.004396075357958539, -0.004119261541329252], bbox: { norte: -19.49, sul: -21.80 } };
  const m = metrosPorNoDoRaster(r);
  assert.ok(Math.abs(m.x - 458) < 2, `x=${m.x}`);
  assert.ok(Math.abs(m.y - 459) < 2, `y=${m.y}`);
});

test('erros de rede em português', () => {
  const url = 'https://www.gmrt.org/services/GridServer?x=1';
  assert.match(descreverErroRede(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }), url), /sem rede ou DNS/);
  assert.match(descreverErroRede(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), url), /fora do ar ou sem rede/);
  const to = new Error('x'); to.name = 'TimeoutError';
  assert.match(descreverErroRede(to, url), /tempo esgotado/);
  assert.match(descreverErroRede(new Error('qualquer coisa'), url), /falha de rede em www.gmrt.org/);
  const e = new ErroHttp(503, url, 'Service Unavailable');
  assert.equal(e.status, 503);
  assert.match(e.message, /HTTP 503/);
});

test('tentar: repete em erro de rede e 5xx, não em 404', async () => {
  let n = 0;
  const r = await tentar(async () => { n++; if (n < 2) throw new Error('falha de rede'); return 'ok'; }, { tentativas: 2, esperaMs: 1 });
  assert.equal(r, 'ok');
  assert.equal(n, 2);
  n = 0;
  await assert.rejects(tentar(async () => { n++; throw new ErroHttp(404, 'u'); }, { tentativas: 2, esperaMs: 1 }), /HTTP 404/);
  assert.equal(n, 1, '404 não repete');
  n = 0;
  await assert.rejects(tentar(async () => { n++; throw new ErroHttp(503, 'u'); }, { tentativas: 2, esperaMs: 1 }), /HTTP 503/);
  assert.equal(n, 2, '503 repete e desiste na segunda');
});

test('hash curto e paralelismo limitado', async () => {
  assert.equal(hashCurto('a').length, 12);
  assert.notEqual(hashCurto('a'), hashCurto('b'));
  let emVoo = 0, pico = 0;
  const r = await emParalelo([1, 2, 3, 4, 5, 6, 7], 3, async (x) => {
    emVoo++; pico = Math.max(pico, emVoo);
    await new Promise((res) => setTimeout(res, 5));
    emVoo--;
    return x * 2;
  });
  assert.deepEqual(r, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(pico <= 3 && pico >= 2, `pico ${pico}`);
});
