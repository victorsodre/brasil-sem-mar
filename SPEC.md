# SPEC: brasil-sem-mar v1 (contrato entre módulos)

Objetivo: `npx brasil-sem-mar <lugar>` baixa dado aberto (Copernicus DEM na terra, GMRT no mar), grava um terreno por lugar; a página Three.js desenha o relevo em neon sobre preto e "esvazia" a água; a captura headless exporta sequência PNG 1080x1920 e MP4 determinísticos para a esteira de Shorts e para o X.

Uma pilha só: Node 22 ou mais, ESM (`.mjs`), sem Python, sem etapa de build, sem chave de API. Dependências: `geotiff` 2.1.3, `pngjs` 7.0.0; dev: `playwright` 1.61.0, `three` 0.185.1 (vendorizado em `web/vendor/three/`, importmap como no cristo-redentor; nunca CDN).

Regras: UI e textos em português do Brasil; identifiers em inglês; sem menção a empresa; sem `Date.now`/`Math.random` na cena; nada de laço pesado no Mac (download com cache, um headless por vez); cada fonte com licença e atribuição.


## Layout

```
brasil-sem-mar/
├── index.html            # a página (raiz, para a URL ficar limpa no GitHub Pages)
├── web/
│   ├── app.js            # cena Three.js (módulo), expõe window.__bsm
│   ├── style.css
│   └── vendor/three/     # three.module.min.js, three.core.min.js, addons/ (já vendorizado)
├── cli/
│   ├── index.mjs         # bin: npx brasil-sem-mar <slug> [opções]
│   ├── copernicus.mjs    # tiles COG via HTTP range (geotiff fromUrl) + overviews
│   ├── gmrt.mjs          # GridServer GeoTIFF por bbox (+ topo-mask)
│   ├── terrain.mjs       # grade comum, fusão terra/mar, Terrain-RGB, terreno.json
│   └── *.test.mjs
├── captura/
│   ├── capture.mjs       # sequência PNG + MP4 determinísticos (Metal), cadeado
│   └── quadro.mjs        # um quadro só (prévia rápida)
├── scripts/serve.mjs     # servidor estático sem dependências (porta 8765)
├── regua/cristo-web.glb  # régua: Cristo Redentor, 30 m (CC BY 4.0, Parlin Sitorus, Sketchfab)
├── dados/fontes/*.md     # cada fonte: URL, licença, texto de atribuição, chamadas registradas, onde quebra
└── lugares/<slug>/
    ├── lugar.json        # entrada (à mão)
    ├── terreno.png       # saída da CLI (Terrain-RGB)
    ├── terreno.json      # saída da CLI (metadados e proveniência)
    ├── camera.json       # trilha de câmera determinística
    ├── NUMEROS.md · PROVA-INEDITA.md · DIARIO.md
    └── cache/            # dado bruto baixado (gitignored)
```


## lugar.json (entrada)

```json
{
  "slug": "002-vitoria-trindade",
  "nome": "Cadeia Vitória-Trindade",
  "bbox": { "norte": -19.5, "sul": -21.8, "oeste": -41.0, "leste": -28.5 },
  "exagero_vertical": 15,
  "largura_max_nos": 2048,
  "terra": "copernicus",
  "mar": "gmrt",
  "mascara": true,
  "nivel_minimo_m": -5500,
  "regua": { "lon": -40.29, "lat": -20.32 },
  "clipe_referencia": "texto livre",
  "frase_de_vida": "texto livre"
}
```

- `terra`: `copernicus` (GLO-30 por tile, overviews) ou `gmrt` (o GMRT também traz terra, mais grosseira). `mar`: sempre `gmrt` na v1.
- `largura_max_nos`: largura da grade de saída; a altura sai da proporção do bbox em km.
- `mresolution` (opcional): metros por nó pedidos ao GridServer; default = largura do bbox em metros / `largura_max_nos`. O GridServer devolve o nível mais próximo (medido: pedido 600 devolveu 458 m/nó, 2847x561, 6,4 MB para a 002; sem o parâmetro devolve ~1,8 km/nó, 713x141).
- `mascara`: baixa `layer=topo-mask` e grava a fração de nós com medição direta (NaN = interpolado). Na caixa do Banco Besnard deu 0 % medido.


## terreno.png e terreno.json (saída da CLI)

- `terreno.png`: Terrain-RGB (codificação Mapbox): `h = -10000 + (R*65536 + G*256 + B) * 0.1`, 8 bits por canal, RGB sem alpha, linha 0 = norte, coluna 0 = oeste, grade regular em graus (lat/lon). Codificar com `v = Math.round((h + 10000) / 0.1)`.
- NaN e nodata (`-32767` no Copernicus) preenchidos pelo vizinho válido mais próximo; contagem gravada.
- `terreno.json`:

```json
{
  "slug": "002-vitoria-trindade",
  "largura": 2048, "altura": 377,
  "bbox": { "norte": -19.5, "sul": -21.8, "oeste": -41.0, "leste": -28.5 },
  "graus_por_no": { "lon": 0.0061, "lat": 0.0061 },
  "metros_por_no": { "x": 639, "y": 675 },
  "km": { "largura": 1308.2, "altura": 254.6 },
  "elev_min_m": -5369.3, "elev_max_m": 1812.3,
  "fontes": [
    { "id": "copernicus-glo30", "url": "...", "tiles": ["Copernicus_DSM_COG_10_S21_00_W041_00_DEM"], "overview": 3, "licenca": "...", "atribuicao": "...", "obtido_em": "2026-10-13T21:40:00-03:00", "bytes": 0, "sha256": "..." },
    { "id": "gmrt", "url": "chamada exata", "licenca": "CC BY 4.0", "atribuicao": "Ryan et al. 2009", "obtido_em": "...", "bytes": 0, "sha256": "..." }
  ],
  "mascara": { "pct_medido": 0.0, "nos": 0 },
  "nodata_preenchidos": 0,
  "fixture": false,
  "gerado_por": "brasil-sem-mar 0.1.0",
  "gerado_em": "ISO 8601"
}
```


## Cena: coordenadas e escala

- Unidades em km. Origem no centro do bbox. `+x` = leste, `+z` = sul, `+y` = cima.
- `x = (lon - lon_c) * 111.32 * cos(lat_c)`, `z = (lat_c - lat) * 111.32`, `y = elev_m * exagero_vertical / 1000`.
- A malha é mais grossa que o heightmap (até 1024 de largura, até 1 M de triângulos); o detalhe (linhas de contorno) vem do fragment shader amostrando a textura de altura em resolução cheia. Textura até 2048.
- Régua: `regua/cristo-web.glb` tem 30 m de altura reais, base em y=0; na cena entra com escala `exagero_vertical/1000 * fator_visivel` declarado em `lugar.json` (`regua.escala`, default 1), posicionado em `regua.lon/lat` sobre o terreno. Crédito CC BY visível no canto inferior esquerdo da página, sempre (fora do modo captura).


## camera.json (entrada, por lugar)

```json
{
  "duracao_s": 61, "fps": 30,
  "keyframes": [
    { "t": 0,  "pos": [x, y, z], "alvo": [x, y, z], "nivel_agua_m": 0,     "fov": 50 },
    { "t": 12, "pos": [x, y, z], "alvo": [x, y, z], "nivel_agua_m": -5500, "fov": 50 }
  ]
}
```

Posições e alvos interpolados por Catmull-Rom (centrípeta) no tempo; nível d'água e fov lineares com suavização (smoothstep) entre keyframes. Tudo determinístico: mesmo `t`, mesmo quadro.


## API da página (`window.__bsm`)

- URL: `index.html?lugar=<slug>&t=<s>&capture=1`. Com `capture=1`: sem UI, sem animação automática, fundo preto puro, `devicePixelRatio` 1, sem controles de órbita.
- `window.__bsm.ready`: Promise que resolve depois de terreno e régua carregados e do primeiro quadro desenhado.
- `window.__bsm.setTime(t)`: desenha o quadro no tempo `t` (segundos) pelos keyframes; devolve Promise que resolve após o render.
- `window.__bsm.duration()`: segundos. `window.__bsm.setWater(m)`; `window.__bsm.getState()` (`{t, nivel_agua_m, pos, alvo}`); `window.__bsm.metrics()` (`{calls, triangles}`).
- Modo interativo (sem `capture=1`): botão "Reproduzir", slider "Esvaziar" (nível d'água), órbita com o mouse, nome do lugar, exagero declarado, créditos das fontes e do Cristo. Textos em português.


## Estilo (o que a página desenha)

- Fundo preto puro `#000`: a esteira compõe com `lighter` (preto some, luz soma). Nada de grade, eixos, legendas ou texto no quadro em modo captura.
- Terreno em traço neon: linhas de contorno (intervalo configurável, por exemplo 100 m no mar e 50 m na terra) com antialias por `fwidth`; terra em ciano, fundo do mar em violeta/magenta, linha da água atual mais forte; brilho por `UnrealBloomPass` (addons já vendorizados); névoa de profundidade para dar escala.
- Água: superfície translúcida escura com borda luminosa onde cruza o terreno; "esvaziar" = o nível desce (keyframes ou slider).
- Câmera baixa, perto do nível do mar; um herói por vez; nada de vista de mapa (zenital). Movimento lento e contínuo.
- Celular: até 1 M de triângulos, textura até 2048, 30 fps com CPU 4x mais lenta; orçamento de 10 MB por lugar.


## Captura (`captura/capture.mjs`)

- `node captura/capture.mjs <slug> [--fps 30] [--de 0] [--ate 10] [--largura 1080] [--altura 1920] [--saida captura/saida/<slug>]`.
- Playwright `chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })` (igual ao `scripts/capture.mjs` do cristo-redentor), viewport 1080x1920, `deviceScaleFactor` 1, um headless por vez.
- Cadeado da máquina: diretório `/tmp/ovictorlab-pesado.lock` com arquivo `pid`. Antes de capturar sequência: se existir e o pid estiver vivo, espera (poll de 30 s, `--espera-max` em minutos, default 120); se o pid estiver morto, remove; cria o próprio com `mkdir` (atômico) e `pid`; remove ao fim, inclusive em erro e SIGINT. `quadro.mjs` (um quadro, prévia) não precisa do cadeado grande, mas usa um mutex próprio `/tmp/brasil-sem-mar-quadro.lock` para nunca haver dois headless ao mesmo tempo.
- Quadros `q_000001.png` em diante, fundo preto; MP4 com `ffmpeg -framerate <fps> -i q_%06d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart <slug>-<de>s-<ate>s.mp4`.
- Determinismo: captura 3 quadros duas vezes e compara os bytes (diferença tem de ser 0); grava `relatorio.json` (quadros, tempo, diff, métricas da cena).
- Sobe o `scripts/serve.mjs` sozinho numa porta livre se não houver servidor.


## Testes (`node --test`)

Codificar/decodificar Terrain-RGB (ida e volta com erro < 0,1 m); bbox → lista de tiles Copernicus (nomes `Copernicus_DSM_COG_10_S21_00_W041_00_DEM`: canto sul-oeste do tile); fusão terra/mar (Copernicus > 0,5 m vence; senão `min(gmrt, 0)`); interpolação da câmera; servidor estático.


## Fatos medidos em 13/10/2026 (para não redescobrir)

- Copernicus GLO-30: `https://copernicus-dem-30m.s3.amazonaws.com/<tile>/<tile>.tif`, Float32, 3600x3600 por grau, 4 níveis (3600, 1800, 900, 450 → ~31, 62, 124, 247 m/nó), oceano = 0, tiles só de oceano não existem (HTTP 404). `tileList.txt` na raiz do bucket lista os 26.450 tiles (1.238 no bbox do Brasil). Overviews não têm transformação afim: use o bbox da imagem 0 e a largura do overview. Ler o overview 2 (900x900) de um tile levou 3,8 s.
- GMRT GridServer: `https://www.gmrt.org/services/GridServer?north=&south=&west=&east=&layer=topo&format=geotiff[&mresolution=N]`, Float32, inclui terra; NaN esparsos (preencher). `layer=topo-mask`: NaN = interpolado, valor = medido. Até 2 GB por pedido. Citação: Ryan et al. 2009, CC BY 4.0.
- `/tmp/ovictorlab-pesado.lock` existia às 21h04 de 13/10 (esteira renderizando o ep279 a 60 fps; carga 9 a 12 em 8 núcleos).
