# Variante C — superfície escura com arestas

Cena Three.js da direção C: superfície sólida azul-petróleo quase preta, sombreada por normal e luz rasante; arestas neon (ciano na terra, violeta no fundo do mar) detectadas em espaço de tela; linha d'água como traço; água como plano translúcido com reflexo planar sutil e borda luminosa; bloom médio-forte; névoa de profundidade; fundo preto puro.

## Arquivos

- `index.html` — página (importmap para `web/vendor/three`, mais o shim de `SkeletonUtils.js` que o GLTFLoader vendorizado importa e não foi copiado).
- `app.js` — cena e contrato `window.__bsm` (ready, setTime, duration, setWater, getState, metrics). `capture=1` tira a UI, fixa dpr 1 e fundo `#000`.
- `trilha.js` — interpolação da câmera: Catmull-Rom centrípeta nas posições e alvos, tempo mapeado por Hermite monótona; nível d'água e fov por Hermite monótona com extremos em repouso (com dois keyframes é o smoothstep do SPEC).
- `camera.json` — trilha da 002 (61 s, 30 fps). Começa na quebra da plataforma, 50 km a leste de Vitória; 0 a 12 s a água esvazia e o Banco de Vitória sai da água; depois voo baixo pela planície abissal, ao sul da cadeia, até a Ilha da Trindade.
- `picos.mjs` — acha os picos submarinos no heightmap (máximos locais abaixo de 0 m, proeminência por inundação com heap). Grava `picos.json`.
- `trilha-check.mjs` — confere a trilha contra o terreno a 30 fps: folga mínima, velocidade, giro do olhar. Sai com erro se a câmera entra no relevo.
- `quadros.mjs` — teste de verdade: sobe o servidor, pega o mutex `/tmp/brasil-sem-mar-quadro.lock`, abre o Chromium com Metal, grava os quadros, confere determinismo, mede metrics e ready, mata tudo ao fim. `--interativo` testa botão, slider e órbita; `--debug` grava camadas isoladas.
- `quadros/` — t00, t04, t08, t12, t30, t55 (1080x1920) e `relatorio.json`.

## Como rodar

```
node web/variantes/c/picos.mjs 002-vitoria-trindade
node web/variantes/c/trilha-check.mjs 002-vitoria-trindade
node web/variantes/c/quadros.mjs --porta 8783 --interativo
node scripts/serve.mjs --porta 8783   # e abrir /web/variantes/c/index.html?lugar=002-vitoria-trindade
```

## Como o detalhe é desenhado

A malha tem 1024 x 201 segmentos (411 648 triângulos). A altura de cada vértice e de cada fragmento vem da mesma textura R32F (Terrain-RGB decodificado em Float32 pelo canvas, nunca PNG de 16 bits por img), amostrada com Catmull-Rom bicúbica; a normal sai da derivada analítica da bicúbica, por isso não há facetas nem degraus da malha.

## O que mudou durante a revisão dos quadros

1. O rim por `pow(1 - n·v, 3)` virava uma chapa branca em qualquer encosta vista de raspão. Trocado por detecção de silhueta em espaço de tela (`fwidth(n·v)`), que dá ~2 px em qualquer distância, mais um rim suave fraco só para volume.
2. A faixa de "maré" acima da linha d'água e o mínimo de largura em metros faziam a planície costeira (1 a 10 m) acender em manchas quando o nível estava em 0. A linha agora tem largura só em espaço de tela (~1,5 px) e só onde há encosta e relevo em escala larga; a faixa saiu.
3. A borda luminosa da água segue a mesma regra (largura em tela, nada em planície rasa, nada a 0 m exato).
4. Abertura: começava em Vitória, a 70 m sobre a baía; a plataforma de 50 km escondia a água esvaziando. Agora começa na quebra da plataforma, de onde o Banco de Vitória (200 km adiante) emerge conforme a água desce.
5. Trilha: o primeiro traçado passava pelo norte da cadeia e cruzava o relevo em três pontos (pior folga -2,4 km); o atual vai pelo sul, com folga mínima de 1,3 km (88 m reais) e giro máximo do olhar de 14 graus/s.
6. Bloom de 1,05 para 0,85 e limiar 0,35; névoa 0,0022/km; contornos a 500 m no mar e 100 m na terra; crista (curvatura) reduzida para não manchar o fundo rugoso.

## Pendências

- O GLTFLoader vendorizado importa `utils/SkeletonUtils.js`, que não está em `web/vendor/three/addons/`. O importmap desta variante aponta para `shim-skeleton-utils.js`; a página raiz (fora da minha posse) vai precisar do mesmo shim ou do arquivo vendorizado.
- A trilha foi desenhada sobre o `terreno.png` gerado pela CLI em 13/10 (2048 x 403). Se a CLI mudar o bbox ou a fusão, rodar `trilha-check.mjs` de novo.
- Velocidade máxima de 35,7 km/s no voo (t = 57 s): lento o bastante na tela porque os montes estão a 100 km ou mais; se a direção quiser mais lento, basta esticar os keyframes finais.
