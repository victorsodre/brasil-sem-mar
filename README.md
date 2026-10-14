# brasil-sem-mar

Não é sobre países sem litoral. É o Brasil com o mar tirado: o relevo real de cada lugar, acima e abaixo da água, em 3D neon no navegador.

`npx brasil-sem-mar <lugar>` baixa dado aberto (Copernicus DEM na terra, GMRT no mar), grava um terreno por lugar, e a página Three.js desenha o relevo em traço neon sobre preto e "esvazia" a água. Um comando, sem chave de API, uma pilha só (Node 22 ou mais, sem Python, sem build). A captura headless exporta sequência PNG 1080x1920 e MP4 determinísticos, para Shorts e para o X.

A tese é "Brasil com nome, número e fonte": cada lugar leva `NUMEROS.md` (cada número com fonte primária e URL), `PROVA-INEDITA.md` (o que já existe em vídeo sobre ele) e `DIARIO.md` (o que foi construído e o que quebrou, com data).

## Lugares

| Lugar | Vídeo | Código | Demo | Notas |
|---|---|---|---|---|
| 001 Brasil sem mar (o país inteiro, só render) | em breve | [lugares/001-brasil-sem-mar](lugares/001-brasil-sem-mar/) | em breve | [NUMEROS](lugares/001-brasil-sem-mar/NUMEROS.md) |
| 002 Cadeia Vitória-Trindade | em breve | [lugares/002-vitoria-trindade](lugares/002-vitoria-trindade/) | em breve | [NUMEROS](lugares/002-vitoria-trindade/NUMEROS.md) · [PROVA-INEDITA](lugares/002-vitoria-trindade/PROVA-INEDITA.md) · [DIARIO](lugares/002-vitoria-trindade/DIARIO.md) |

Demo = a página no GitHub Pages (`https://victorsodre.github.io/brasil-sem-mar/index.html?lugar=<slug>`), ainda não publicada. Os terrenos da 001 e da 002 que estão no repositório foram gerados pela CLI em 13/10/2026; o `terreno.json` de cada um guarda a proveniência (URL exata de cada chamada, bytes, sha256, resolução devolvida, fração medida).

## Usar em 30 segundos

```sh
git clone https://github.com/victorsodre/brasil-sem-mar && cd brasil-sem-mar
npm install
npx brasil-sem-mar 002-vitoria-trindade   # baixa Copernicus + GMRT, grava lugares/002-vitoria-trindade/terreno.png
npm run serve                              # http://127.0.0.1:8765/
```

Abra `http://127.0.0.1:8765/index.html?lugar=002-vitoria-trindade`. O botão "Reproduzir" roda a trilha de câmera, o slider "Esvaziar" desce o nível d'água, o mouse orbita. Deep link por tempo: `index.html?lugar=002-vitoria-trindade&t=12`.

Captura (precisa do Chromium do Playwright: `npx playwright install chromium`; o MP4 precisa de `ffmpeg` no PATH):

```sh
node captura/quadro.mjs 002-vitoria-trindade --t 12             # um quadro só (t = 12 s), prévia rápida
node captura/capture.mjs 002-vitoria-trindade --de 0 --ate 10   # sequência PNG + MP4, 30 fps, 1080x1920
```

A saída vai para `captura/saida/<slug>/`: `q_000001.png` em diante, `<slug>-0s-10s.mp4` e `relatorio.json`. A captura é determinística: o mesmo `t` dá o mesmo quadro, byte a byte (o relatório grava a diferença entre duas rodadas de 3 quadros; tem de ser 0). Fundo preto puro, sem texto: a esteira de vídeo compõe a sequência como camada de luz.

## Criar um lugar novo

1. Crie `lugares/<slug>/lugar.json` (modelo: `lugares/002-vitoria-trindade/lugar.json`; todos os campos no `SPEC.md`): `nome`, `bbox` (norte, sul, oeste, leste, em graus), `exagero_vertical`, `terra` (`copernicus` ou `gmrt`), `mar` (`gmrt`), `mascara`, `regua` (lon, lat do Cristo) e a `frase_de_vida`, com fonte.
2. Ou passe a caixa direto, e a CLI grava o `lugar.json` com os defaults do `SPEC.md`: `npx brasil-sem-mar --bbox <norte>,<sul>,<oeste>,<leste> --slug 003-meu-lugar --nome "Meu lugar"`. Opções (`--largura`, `--so-gmrt`, `--sem-mascara`, `--mresolution`, `--saida`, `--forcar`, `--timeout`): `npx brasil-sem-mar --ajuda`.
3. `npx brasil-sem-mar 003-meu-lugar` baixa (com cache em `lugares/<slug>/cache/`, fora do git), funde terra e mar, e grava `terreno.png` (Terrain-RGB) e `terreno.json` (proveniência: URL exata de cada chamada, bytes, sha256, licença, fração medida x interpolada).
4. Escreva `camera.json` (trilha de 61 s por keyframes), `NUMEROS.md`, `PROVA-INEDITA.md` e `DIARIO.md`.
5. Orçamento por lugar: 10 MB no GitHub Pages, textura até 2048, até 1 milhão de triângulos, 30 fps num celular.

Lugar sem virada, sem frase de vida com fonte, ou com pauta igual a viral recente, não entra na fila de Shorts: vira post e pôster. Qual lugar você quer ver sem mar? Abra uma issue; um `lugar.json` aceito por PR é um lugar novo no placar.

## O que já existe

"Tirar a água" não é novo. Antes de clonar, saiba o que já tem (URLs conferidas em 13/10/2026):

| O quê | Quem, quando | O que faz | URL |
|---|---|---|---|
| Draining the Oceans | NASA SVS, 01/06/2008 (Horace Mitchell); versão de 11/09/2020; remake em 4K de James O'Donoghue, 12/12/2019 | o planeta com o mar descendo 10 m por quadro (ETOPO) | https://svs.gsfc.nasa.gov/3487 · https://svs.gsfc.nasa.gov/4823 · https://www.youtube.com/watch?v=-uOwv_Krqk8 |
| Drain the Oceans | National Geographic, desde 28/05/2018; 6 temporadas, 63 episódios | série de TV: naufrágios e cidades submersas com o mar "drenado" em CGI | https://en.wikipedia.org/wiki/Drain_the_Oceans (a página oficial da Nat Geo redireciona para natgeotv.com) |
| Google Earth 5.0 | Google, 02/02/2009 | fundo do mar em 3D no globo, base GEBCO_08 a 30 segundos de arco | https://gebco.net/news_and_media/gebco_08_google.html |
| earth-drained | snapidapp, 06/10/2026 | globo three.js com os oceanos removidos; ETOPO a 10 minutos de arco (~18 km por nó); MIT | https://github.com/snapidapp/earth-drained |
| Seascape | Open Waters | tiles de batimetria aberta (GEBCO 2026 mais fontes regionais), CC BY 4.0; para o Brasil registra "closed / request-only, no open hi-res source exists" | https://github.com/openwatersio/seascape |
| OpenZenith DEM | aliasfox (Hugging Face) | pirâmide global z0 a z8 em Terrarium: Copernicus GLO-30 mais GEBCO 2025; MIT | https://huggingface.co/datasets/aliasfox/openzenith-dem |
| bopen/elevation | B-Open | CLI `eio clip` que baixa e recorta SRTM, Copernicus GLO-30 e GLO-90 e Mapzen; Apache-2.0 | https://github.com/bopen/elevation |

A diferença deste repositório não é "ninguém fez 3D do fundo do mar". É o Brasil com nome, número e fonte: a margem brasileira com as feições que o LEPLAC batizou (Banco Besnard, Canal Vema, Platô de Santa Catarina, Elevação do Rio Grande), cada uma num lugar com `lugar.json` forkável, número com fonte primária, prova de ineditismo registrada, e a câmera ao nível do mar, nunca vista de mapa. Nenhum projeto acima serve a margem brasileira em alta resolução, e o Seascape escreve que no Brasil não existe fonte aberta de alta resolução. Aqui o mar também vem do GEBCO (pela base do GMRT) onde não há multifeixe, e isso fica dito.

## Honestidade na tela

- O exagero vertical é declarado por lugar no `lugar.json` (001: 40x; 002: 15x) e dito na voz e na descrição de cada vídeo: "aqui está quinze vezes mais alto que o real, senão não dá para ver". A régua (Cristo Redentor, 30 m) entra na mesma escala exagerada, nunca em escala ambígua.
- Medido x interpolado: a camada `topo-mask` do GMRT diz, nó a nó, o que é multifeixe (valor) e o que é interpolado da base GEBCO (NaN). A fração vai no `terreno.json` (`mascara.pct_medido`) e na descrição. No bbox inteiro da 002, 8,4 % dos nós de mar são medidos (66.900 de 792.363); na caixa do Banco Besnard deu 0 %: a forma do topo no render é a do GEBCO; a profundidade de 30 m é da Marinha (LEPLAC, via Pesquisa FAPESP).
- A resolução real de cada fonte vai no `terreno.json` e na descrição: na 002 a terra do Copernicus entrou no overview 3 (cerca de 247 m por nó) e o mar do GMRT a 458 m, os dois reamostrados para 636 m por nó; os 30 m só aparecem em caixa pequena. A 001 é só GMRT, a cerca de 1,9 km por nó.
- A grade de 40 m da cadeia (CORE-VTRCC) ainda não está no repositório, e mesmo quando chegar não cobre topos acima de 100 a 200 m de profundidade (o próprio paper diz). O lançamento não promete esse dado.
- Nada de leito de rio, fundo de represa ou costa inventados: só o que está no DEM e no GMRT. O que quebra está em `ONDE-QUEBRA.md`.

## Fontes e licenças

O código é MIT (`LICENSE`). Os dados e o modelo têm licenças próprias; a atribuição vai neste README, na página e em toda descrição de vídeo. Cada fonte tem ficha em `dados/fontes/` com URL, licença, texto de atribuição, chamadas registradas e onde quebra.

### Copernicus DEM GLO-30 (terra)

Bucket público `copernicus-dem-30m` na AWS, sem conta. Licença da ESA: "Licence for Copernicus DEM instance COP-DEM-GLO-30-F Global 30m Full, Free & Open". Como o dado é reamostrado e recodificado, vale o aviso do artigo 6(b):

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.

O artigo 6(c) exige esta frase em qualquer aviso de distribuição: "The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30". Ficha: `dados/fontes/copernicus.md`.

### GMRT (mar)

GridServer da Global Multi-Resolution Topography, CC BY 4.0. Citação exigida: Ryan, W. B. F., S.M. Carbotte, J. Coplan, S. O'Hara, A. Melkonian, R. Arko, R.A. Weissel, V. Ferrini, A. Goodwillie, F. Nitsche, J. Bonczkowski, and R. Zemsky (2009), Global Multi-Resolution Topography (GMRT) synthesis data set, Geochem. Geophys. Geosyst., 10, Q03014, doi:10.1029/2008GC002332. Não serve para navegação. Ficha: `dados/fontes/gmrt.md`.

### GEBCO (base do GMRT onde não há multifeixe)

GEBCO_2026 Grid, domínio público ("The GEBCO Grid is placed in the public domain and may be used free of charge"). Citação: GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid - a continuous terrain model for oceans and land at 15 arc-second intervals. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa. Ficha: `dados/fontes/gebco.md`.

### CORE-VTRCC (grade de 40 m da cadeia; fora do repositório)

Tagliaro, Gabriel, et al. (2024), Processed gridded bathymetry data for the CORE-VTRCC cruise (2021), Marine Geoscience Data System, doi:10.26022/IEDA/331479, CC BY 4.0. Paper: Tagliaro et al. (2024), CORE-VTRCC Cruise Report, Scientific Data 11, 1056, doi:10.1038/s41597-024-03898-6. Só por pedido no MGDS. Ficha: `dados/fontes/core-vtrcc.md`.

### Cristo Redentor (régua de 30 m)

"Christ the Redeemer (Cristo Redentor)" por Parlin Sitorus, CC BY 4.0, https://sketchfab.com/3d-models/christ-the-redeemer-cristo-redentor-157dbdb9d8654651a5e5c9af7b412398. Alterações: malha simplificada, vértices soldados, rotação para Y-up, escala para 30 m. O crédito aparece na página, no canto inferior esquerdo, sempre. Ficha: `dados/fontes/cristo.md`.

### three.js

MIT, versão 0.185.1 (r185), vendorizada em `web/vendor/three/` com a licença. Nunca CDN.

## Rótulo de conteúdo alterado ou sintético

Pelos três critérios do YouTube (https://support.google.com/youtube/answer/14328491) o rótulo é "não": nenhuma pessoa real aparece dizendo ou fazendo o que não fez; nenhuma filmagem de evento ou lugar real é alterada; o relevo neon calculado de um DEM não é uma cena realista de algo que não aconteceu. A voz clonada do próprio autor está na lista do que não precisa de rótulo ("Cloning one's own voice to create voice overs or dubs"). O YouTube lista um quarto caso, música gerada por IA como foco principal do vídeo; cada peça registra no `NUMEROS.md` que isso não se aplica a ela.

## Para quem for mexer no código

`AGENTS.md` tem as armadilhas (PNG de 16 bits, overviews sem transformação afim, GridServer sem `mresolution`, tiles de oceano 404, SwiftShader, um headless por vez, cadeado da esteira, determinismo). `SPEC.md` é o contrato entre os módulos. `ONDE-QUEBRA.md` é a lista do que não fica bonito e por quê. Testes: `npm test`. Conferência de um terreno contra o GeoTIFF do GMRT que ficou no cache, em 20 pontos fixos: `node cli/conferir.mjs <slug>`.

por Victor Sodré · @ovictor
