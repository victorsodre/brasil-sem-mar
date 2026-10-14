# AGENTS.md: armadilhas para quem mexe neste repositório

Leia `SPEC.md` antes de tudo: é o contrato entre CLI, terreno, página e captura, e tem os fatos medidos (não redescubra). Este arquivo é a lista do que já quebrou ou vai quebrar se você não souber.

## Regras da casa

- Uma pilha: Node 22 ou mais, ESM (`.mjs`), sem Python, sem build, sem chave de API. Dependências só as do `package.json` (`geotiff`, `pngjs`; dev: `playwright`, `three`). Precisa de algo a mais? Resolva com Node puro.
- Textos de interface e documentação em português do Brasil ("sério mesmo", nunca "seriamente"); identifiers em inglês. Markdown clássico: sem callouts, sem wikilinks, tabelas simples, linha em branco entre blocos.
- Nenhuma menção a empresa. Assinatura é "Victor Sodré · @ovictor".
- Three.js vendorizado em `web/vendor/three/` (versão exata, com licença). Nunca CDN.
- Cada fonte de dado tem ficha em `dados/fontes/` com URL, licença, texto de atribuição, chamadas registradas e onde quebra. Nunca inventar número nem fonte; o que não foi conferido fica marcado "a confirmar".
- CLI: `npx brasil-sem-mar <slug>` lê `lugares/<slug>/lugar.json`; `npx brasil-sem-mar --bbox N,S,O,L --slug <slug> --nome "Nome"` cria o lugar; `--ajuda` lista as opções (`--largura`, `--so-gmrt`, `--sem-mascara`, `--mresolution`, `--saida`, `--forcar`, `--silencioso`, `--timeout`).
- Testes: `npm test` (`node --test cli/*.test.mjs scripts/*.test.mjs`).

## O Mac é compartilhado com a esteira de vídeo

- A máquina roda a esteira de Shorts ao mesmo tempo (em 13/10/2026: carga 9 a 12 em 8 núcleos). Um processo pesado por vez, nunca laço de espera ativa, nunca `watch`, nunca captura de sequência longa fora do cadeado.
- Cadeado grande: `/tmp/ovictorlab-pesado.lock` (diretório criado com `mkdir` atômico, arquivo `pid` dentro). É da esteira. Só `captura/capture.mjs` o pega, pelo `pegarCadeado()` de `captura/comum.mjs`: se existe e o pid está vivo, espera (poll de 30 s, `--espera-max` em minutos, default 120); se o pid está morto, remove; solta ao fim, também em erro e SIGINT. Nunca apague esse diretório na mão com o pid vivo. Para testes, `BSM_LOCK_DIR` troca o caminho: um teste nunca pode ficar esperando a esteira de verdade.
- Um headless por vez na máquina inteira: mutex `/tmp/brasil-sem-mar-quadro.lock` (mesmo esquema `mkdir` mais `pid`; poll de 5 s, até 10 min; dono morto é removido). Vale também para a prévia de um quadro e para qualquer teste que abra o Chromium.
- Download sempre com cache em `lugares/<slug>/cache/` (gitignored). Nunca baixar o mesmo tile duas vezes; nunca baixar em laço sem necessidade.
- Ao terminar, confira com `ps` que não ficou servidor nem Chromium seu rodando.

## Headless e GPU

- Só o Chromium do Playwright 1.61.0, `chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })`, viewport 1080x1920, `deviceScaleFactor` 1. É o mesmo arranjo do `scripts/capture.mjs` do cristo-redentor, medido lá como `ANGLE Metal Renderer: AMD Radeon Pro Vega 56`.
- SwiftShader é proibido. Sem os args de GPU o Chromium headless cai em renderização por software, come os 8 núcleos e o fps não vale nada. Confira o renderizador (`WEBGL_debug_renderer_info`) no relatório: tem de dizer Metal.
- Nunca rodar WebGL vivo dentro do HTML da esteira (HyperFrames): ela roda SwiftShader por padrão. O terreno entra na esteira como sequência PNG com fundo preto, composta com `lighter` (preto some, luz soma).

## Determinismo da cena

- Nada de `Date.now`, `performance.now` nem `Math.random` dentro da cena. A cena não lê relógio nenhum: o quadro é função pura de `t` (e do nível d'água) e só muda por `window.__bsm.setTime(t)`. O botão "Reproduzir" do modo interativo avança `t` de fora, chamando `setTime`; em modo captura não há laço de animação. A captura prova isso capturando 3 quadros duas vezes e comparando os bytes; a diferença tem de ser 0.
- `capture=1` na URL: sem UI, sem animação automática, fundo preto puro `#000`, sem controles de órbita, `devicePixelRatio` 1.
- Câmera por `camera.json`: Catmull-Rom centrípeta para posição e alvo; nível d'água e fov lineares com smoothstep. Mesmo `t`, mesmo quadro, em qualquer máquina.

## Heightmap

- PNG de 16 bits carregado via `<img>` ou `TextureLoader` vira 8 bits no navegador: 256 degraus de altura. Por isso o terreno é Terrain-RGB (codificação Mapbox, 8 bits por canal, passo de 0,1 m): `h = -10000 + (R*65536 + G*256 + B) * 0.1`, codificado com `v = Math.round((h + 10000) / 0.1)`. Alternativa aceita: `.bin` Float32 lido por `fetch` para `DataTexture`. Nunca PNG de 16 bits.
- A textura de altura é dado, não cor: sem `SRGBColorSpace`, sem mipmaps, filtro `NearestFilter` (ou decodifique para Float32 no JavaScript antes de subir). Filtro linear entre canais R, G e B produz picos falsos nas bordas de 256 e 65.536.
- Linha 0 é o norte, coluna 0 é o oeste, grade regular em graus (lat/lon). A malha é mais grossa que o heightmap (até 1024 de largura); o detalhe vem do fragment shader amostrando a textura em resolução cheia.
- NaN e nodata (`-32767` no Copernicus) são preenchidos pelo vizinho válido mais próximo, e a contagem vai em `terreno.json` (`nodata_preenchidos`; os NaN de cada GeoTIFF do GMRT ficam no campo `nan` da fonte: 5.694 na 002, 5.296 na 001; na grade de saída de 13/10/2026 sobrou 0).

## Copernicus DEM GLO-30 (terra)

- `https://copernicus-dem-30m.s3.amazonaws.com/<tile>/<tile>.tif`, nome `Copernicus_DSM_COG_10_S21_00_W041_00_DEM`: a latitude e a longitude do nome são o canto sul-oeste do tile de 1 grau. Float32, 3600x3600 por grau, COG com DEFLATE e predictor 3.
- Tiles só de oceano não existem: HTTP 404 é normal, não é erro. O readme do bucket diz que em área de oceano vale altura zero. Dentro de um tile que existe, o oceano já é 0.
- Os overviews do COG (4 níveis: 3600, 1800, 900, 450 nós por grau, ~31, 62, 124, 247 m por nó) não têm transformação afim própria: use o bbox da imagem 0 e a largura do overview para posicionar. Ler o overview 2 (900x900) de um tile levou 3,8 s.
- `tileList.txt` na raiz do bucket lista os 26.450 tiles (1.238 dentro do bbox do Brasil). Use a lista para saber o que existe antes de pedir. Na 002, 33 dos 39 tiles do bbox eram só oceano; os 6 de terra foram lidos no overview 3 (450 nós por grau, ~247 m por nó) porque a grade de saída é de 636 m por nó: os 30 m só aparecem em caixa pequena.
- É um DSM (superfície): árvores e prédios estão na altura. Em cidade e mata o "chão" é o topo do dossel.
- Licença exige o aviso exato do artigo 6(b) para dado adaptado (texto em `dados/fontes/copernicus.md`). Versão do bucket da AWS: a confirmar no readme/STAC.

## GMRT GridServer (mar)

- `https://www.gmrt.org/services/GridServer?north=&south=&west=&east=&layer=topo&format=geotiff[&mresolution=N]`. Float32, inclui terra (mais grosseira que o Copernicus). Até 2 GB por pedido (cerca de 20 por 20 graus a 100 m por nó).
- Sem `mresolution`, o servidor devolve ~1,8 km por nó (a cadeia inteira, 41 a 28,5 W, saiu 713x141). E `mresolution` é aproximado: pedido 600 e pedido 636 devolveram 458 m por nó (2847x561, 6,4 MB); pedido 245 devolveu 244,6 m por nó (5.690x1.119, 25,5 MB em NetCDF); pedido 2.452 (001) devolveu 1.899 x 1.855 m por nó (2.648x2.402, 25,5 MB). Grave o que voltou, não o que pediu.
- `layer=topo` tem NaN esparsos: preencher. `layer=topo-mask` é outra coisa: NaN = interpolado da base GEBCO, valor = medido por multifeixe. A fração medida vai em `terreno.json`. Na caixa do Banco Besnard (20,2 a 21,0 S, 38,9 a 37,6 W) deu 0 % medido em 594x391 nós.
- Pés x metros: Copernicus e GMRT estão em metros; não há conversão entre os dois. Carta náutica antiga, dado americano (NOAA) e fonte de mergulho vêm em pés ou braças; se entrar fonte nova, converta e registre. O datum vertical também difere (Copernicus: geoide EGM2008; GMRT/GEBCO: nível médio do mar aproximado); para este uso a diferença é de poucos metros, mas não some altura de um com profundidade do outro sem saber disso.
- Fusão terra/mar (`cli/terrain.mjs`, testada): Copernicus acima de 0,5 m vence; senão `min(gmrt, 0)`.

## Página (index.html)

- O `importmap` tem de vir antes de qualquer `<link rel="modulepreload">`. Com o preload antes, a resolução de módulo começa sem o mapa e `three` não resolve; no cristo-redentor, sob CPU estrangulada, isso quebrava a página em 100 % das vezes.
- Exagero vertical: `y = elev_m * exagero_vertical / 1000` (unidades em km; origem no centro do bbox; `+x` leste, `+z` sul, `+y` cima). A régua do Cristo (30 m reais, base em y = 0) entra com o mesmo fator (`exagero_vertical/1000 * regua.escala`). Nunca misture escala real e exagerada no mesmo quadro.
- Orçamento de celular: até 1 M de triângulos, textura até 2048, 30 fps com CPU 4x mais lenta, 10 MB por lugar.
- Crédito CC BY do Cristo visível no canto inferior esquerdo, sempre, fora do modo captura. Textos em português.

## Git e posse

- Quem commita é o orquestrador. Construtores paralelos mexem só nos arquivos do próprio papel; não "arrumam" o resto.
- `.gitignore` já exclui `node_modules/`, `lugares/*/cache/`, `captura/saida/`, `*.tif`, `*.tiff`, `*.nc`. Dado bruto nunca entra no git; `terreno.png` entra (orçamento de 10 MB por lugar).
