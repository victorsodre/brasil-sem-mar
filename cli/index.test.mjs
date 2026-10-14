// Testes offline da CLI: opções, --bbox, defaults do lugar.json, leitura e erros de lugar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, parseBboxTexto, lugarPadrao, lerLugar, raizDosLugares, AJUDA } from './index.mjs';

test('opções da linha de comando', () => {
  const o = parseArgs(['002-vitoria-trindade', '--largura', '1024', '--so-gmrt', '--sem-mascara', '--saida', '/tmp/x', '--forcar', '--silencioso', '--timeout', '3']);
  assert.deepEqual(o._, ['002-vitoria-trindade']);
  assert.equal(o.largura, 1024);
  assert.equal(o.soGmrt, true);
  assert.equal(o.semMascara, true);
  assert.equal(o.saida, '/tmp/x');
  assert.equal(o.forcar, true);
  assert.equal(o.silencioso, true);
  assert.equal(o.timeoutMin, 3);
  assert.equal(parseArgs(['-h']).ajuda, true);
  assert.throws(() => parseArgs(['--largura']), /precisa de um valor/);
  assert.throws(() => parseArgs(['--largura', '1']), /inteiro >= 2/);
  assert.throws(() => parseArgs(['--xyz']), /opção desconhecida/);
  assert.throws(() => parseArgs(['--mresolution', 'abc']), /mresolution/);
  const b = parseArgs(['--bbox', '-19.5,-21.8,-41,-28.5', '--slug', 'teste-x', '--nome', 'Teste X']);
  assert.equal(b.bbox, '-19.5,-21.8,-41,-28.5');
  assert.equal(b.slug, 'teste-x');
  assert.equal(b.nome, 'Teste X');
  assert.match(AJUDA, /npx brasil-sem-mar <slug>/);
});

test('--bbox N,S,O,L vira bbox validado', () => {
  assert.deepEqual(parseBboxTexto('-19.5, -21.8, -41, -28.5'), { norte: -19.5, sul: -21.8, oeste: -41, leste: -28.5 });
  assert.throws(() => parseBboxTexto('1,2,3'), /4 números/);
  assert.throws(() => parseBboxTexto('a,b,c,d'), /4 números/);
  assert.throws(() => parseBboxTexto('-21.8,-19.5,-41,-28.5'), /norte .* maior que sul/);
});

test('lugar.json com defaults do SPEC', () => {
  const l = lugarPadrao({ slug: 'teste-x', nome: 'Teste X', bbox: { norte: 1, sul: 0, oeste: 0, leste: 1 } });
  assert.equal(l.slug, 'teste-x');
  assert.equal(l.nome, 'Teste X');
  assert.equal(l.exagero_vertical, 15);
  assert.equal(l.largura_max_nos, 2048);
  assert.equal(l.terra, 'copernicus');
  assert.equal(l.mar, 'gmrt');
  assert.equal(l.mascara, true);
  assert.equal(l.nivel_minimo_m, -5500);
  assert.equal(l.regua, null);
  assert.equal(lugarPadrao({ slug: 's', bbox: { norte: 1, sul: 0, oeste: 0, leste: 1 } }).nome, 's');
});

test('lerLugar: lê, valida e explica o que falta', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'bsm-'));
  fs.mkdirSync(path.join(raiz, 'lugares', 'ok-1'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'lugares', 'ok-1', 'lugar.json'), JSON.stringify({ slug: 'ok-1', nome: 'Ok', bbox: { norte: 1, sul: 0, oeste: 0, leste: 1 }, terra: 'gmrt' }));
  const l = lerLugar(raiz, 'ok-1');
  assert.equal(l.largura_max_nos, 2048, 'default quando falta');
  assert.equal(l.terra, 'gmrt');
  assert.equal(l.pasta, path.join(raiz, 'lugares', 'ok-1'));
  assert.throws(() => lerLugar(raiz, 'nao-existe'), /lugar não encontrado/);
  assert.throws(() => lerLugar(raiz, 'Maiusculo'), /slug inválido/);
  fs.mkdirSync(path.join(raiz, 'lugares', 'ruim-1'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'lugares', 'ruim-1', 'lugar.json'), '{ nao é json');
  assert.throws(() => lerLugar(raiz, 'ruim-1'), /lugar.json inválido/);
  fs.writeFileSync(path.join(raiz, 'lugares', 'ruim-1', 'lugar.json'), JSON.stringify({ slug: 'ruim-1', bbox: { norte: 0, sul: 1, oeste: 0, leste: 1 } }));
  assert.throws(() => lerLugar(raiz, 'ruim-1'), /bbox inválido/);
  fs.writeFileSync(path.join(raiz, 'lugares', 'ruim-1', 'lugar.json'), JSON.stringify({ slug: 'outro', bbox: { norte: 1, sul: 0, oeste: 0, leste: 1 } }));
  assert.throws(() => lerLugar(raiz, 'ruim-1'), /slug "outro"/);
  fs.writeFileSync(path.join(raiz, 'lugares', 'ruim-1', 'lugar.json'), JSON.stringify({ slug: 'ruim-1', bbox: { norte: 1, sul: 0, oeste: 0, leste: 1 }, terra: 'srtm' }));
  assert.throws(() => lerLugar(raiz, 'ruim-1'), /terra desconhecida/);
  assert.equal(raizDosLugares(raiz), raiz);
  fs.rmSync(raiz, { recursive: true, force: true });
});
