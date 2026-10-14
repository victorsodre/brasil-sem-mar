#!/usr/bin/env node
// Servidor estático sem dependências, para a página, a captura e o dev local.
// Uso: node scripts/serve.mjs [--porta 8765] [--raiz .]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (nome, def) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : def; };
const RAIZ = path.resolve(opt('--raiz', path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));
const PORTA = Number(opt('--porta', process.env.PORT || 8765));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

export function criarServidor(raiz = RAIZ) {
  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const abs = path.normalize(path.join(raiz, rel));
      if (!abs.startsWith(raiz + path.sep) && abs !== raiz) { res.writeHead(403); res.end('fora da raiz'); return; }
      fs.stat(abs, (err, st) => {
        if (err || !st.isFile()) {
          if (!err && st.isDirectory()) { res.writeHead(301, { Location: url.pathname + '/' }); res.end(); return; }
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('não achei ' + rel); return;
        }
        const tipo = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': st.size, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(abs).pipe(res);
      });
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
}

const ehPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ehPrincipal) {
  const srv = criarServidor();
  srv.listen(PORTA, '127.0.0.1', () => console.log(`brasil-sem-mar: http://127.0.0.1:${PORTA}/  (raiz ${RAIZ})`));
  const sair = () => srv.close(() => process.exit(0));
  process.on('SIGINT', sair); process.on('SIGTERM', sair);
}
