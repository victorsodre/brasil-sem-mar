# DIARIO: 002 Cadeia Vitória-Trindade

Uma entrada por dia de trabalho: o que foi construído, o que quebrou, o que foi medido. É a única fonte dos posts "build com agentes": número de diário sai daqui, nunca é ilustrativo.

## 13/10/2026

Dia zero. A recomendação do projeto saiu às 18h (nota na wiki, 30 agentes); Victor aprovou e o repositório local nasceu às 21h06, com seis construtores em paralelo (CLI, página, captura, documentação, variantes). Esta entrada foi fechada às 21h40, com a página ainda em construção.

Construído, em ordem:

- 21h06: `SPEC.md` (contrato entre módulos, 10,5 KB), `package.json` (Node 22+, `geotiff` 2.1.3, `pngjs` 7.0.0; dev `playwright` 1.61.0, `three` 0.185.1), `LICENSE` (MIT), `.gitignore` (cache, saída de captura, `*.tif`, `*.nc`), `web/vendor/three/` vendorizado (three.module.min.js 365.552 bytes, three.core.min.js 385.386 bytes, addons), `regua/cristo-web.glb` (1.681.264 bytes, 70.000 triângulos, CC BY 4.0, Parlin Sitorus; sha256 idêntico ao do cristo-redentor), `scripts/serve.mjs` (servidor estático sem dependência, porta 8765).
- 21h12: `lugar.json` da 001 e da 002 (bbox 19,5 a 21,8 S, 41 a 28,5 W; exagero 15x; régua em 40,29 W, 20,32 S) e uma fixture provisória do terreno da 002, só GMRT (2847 x 561, 2.149.091 bytes), para a página não esperar a CLI. Commit `d310af4` (scaffold) às 21h15.
- 21h20 a 21h34: `cli/` (index, copernicus, gmrt, terrain, rede, conferir, com testes), `captura/` (capture.mjs, quadro.mjs, comum.mjs com os dois cadeados e os args de GPU, stub com a API `window.__bsm`, testes, README), `web/variantes/{a,b,c}` (variantes da página em avaliação), `scripts/serve.test.mjs`.
- 21h34 a 21h36: a CLI rodou de verdade. 002: GMRT `topo` e `topo-mask` com `mresolution=636` (devolvido 458 m por nó, 2847 x 561, 6.393.522 bytes cada), Copernicus no overview 3 em 6 tiles de terra (1.798.779 bytes; 33 tiles do bbox só de oceano, 404), grade de saída 2048 x 403 a 636 m por nó, `terreno.png` de 1.175.983 bytes, `fixture: false`. 001: GMRT com `mresolution=2452` (devolvido 2.648 x 2.402 a 1.899 x 1.855 m por nó, 25.461.566 bytes), grade de saída 2048 x 1816 a 2.452 m por nó, `terreno.png` de 6.115.265 bytes.
- 21h35: documentação: README (PT e EN), AGENTS.md, ONDE-QUEBRA.md, fichas de fontes, NUMEROS da 001 e da 002, PROVA-INEDITA e este diário.

Medido (chamadas registradas em `dados/fontes/`):

- GMRT GridServer para a cadeia inteira: sem `mresolution`, 713 x 141 nós a ~1,8 km por nó (às 18h a mesma caixa deu 712 x 141 a 1.957 m por nó, 402 KB; a diferença de uma coluna ficou registrada). Pedido 600, devolvido 458 m por nó (fixture); pedido 636, devolvido 457,9 x 458,6 (CLI); pedido 245, devolvido 244,6 (5.690 x 1.119, 25,5 MB em NetCDF). O parâmetro é aproximado: o servidor devolve o nível que tem.
- `topo-mask` no bbox inteiro da 002: 8,4 % dos nós de mar com multifeixe (66.900 de 792.363). Na caixa do Banco Besnard (20,2 a 21,0 S, 38,9 a 37,6 W): 594 x 391 = 232.254 nós, todos NaN. A forma do topo do Besnard é do GEBCO.
- Copernicus GLO-30: tile da Trindade (S21/W030) público, HTTP 200 (149.742 bytes às 18h; 131.073 bytes no overview 3 às 21h35). Overview 2 (900 x 900) lido em 3,8 s por HTTP range. `tileList.txt`: 26.450 tiles, 1.238 no bbox do Brasil. Nos 6 tiles de terra da 002, 0 nós nodata.
- Elevação da 002: de -5.369,1 m a 1.847,1 m (a fixture só com GMRT dava 1.812,3 m de máximo: a terra do Copernicus é mais alta que a do GMRT). 5.694 NaN no GeoTIFF do GMRT, 0 nós preenchidos na grade de saída.
- Mac: o cadeado da esteira `/tmp/ovictorlab-pesado.lock` existia às 21h04 (ep279 renderizando a 60 fps); carga 9 a 12 em 8 núcleos; às 21h24, `uptime` deu 8,99, 9,91 e 10,69.

Quebrou ou não deu:

- Os overviews do COG do Copernicus não têm transformação afim: posicionar pelo bbox da imagem 0 e a largura do overview, senão o tile anda.
- Tiles só de oceano do Copernicus não existem (HTTP 404): 33 dos 39 tiles do bbox da 002. A CLI trata como zero.
- `layer=topo` do GMRT traz NaN esparsos mesmo onde há dado (5.694 na 002, 5.296 na 001).
- A grade de 40 m do CORE-VTRCC não tem download direto confirmado: o crítico registrou 404 no link de dados às 18h; às 21h a página de arquivos do MGDS mostrou os botões "Download" e "Request" (DVD ou FTP) com a lista de grades vazia. E o paper diz que não há multifeixe em menos de 200 m: o topo do Besnard não está nela.
- A Marinha e a ANP bloqueiam leitura automática (HTTP 403 e "conteúdo restrito"); o 5,7 milhões de km² fechou pelo MCTI (gov.br) e o 97,4 % do petróleo pelo PDF do boletim da ANP.
- "89 % das exportações por mar" não achou fonte primária: fica "a confirmar" no NUMEROS da 001.
- O `terreno.json` gravou, para o Copernicus, o aviso 6(a) da licença (dado como está); como o dado é adaptado, a descrição e o README usam o 6(b) ("produced using Copernicus WorldDEM-30 ..."). A CLI precisa trocar o texto.
- Gemini TTS: HTTP 402 (crédito pré-pago acabou), segundo a nota de 18h; não reconferido. Sem recarga, a peça sai muda.
- Nada da 002 foi renderizado nem capturado hoje: `index.html` e `web/app.js` ainda não existiam às 21h40. O primeiro quadro é tarefa do dia 4 (17/10).

## 13/10/2026 (noite): integração da cena

Segunda entrada do dia. A previsão da entrada anterior (primeiro quadro só em 17/10) caiu: o primeiro quadro da 002 saiu às 22h31, da cena integrada na raiz. Esta entrada cobre das 22h20 (cadeado da esteira livre) até o fim das capturas.

Três variantes da página foram construídas em paralelo na onda 1 e avaliadas pelos quadros t00, t04, t08, t12, t30 e t55 de cada uma: A ("contorno topográfico", isolinhas neon), B ("pontos") e C ("superfície escura com arestas"). Decisão de 13/10/2026: a C é a base. A A caiu pelo olhar de pilha de linhas; a B ficou escura e ruidosa. Dois enxertos vieram da A para a C: a abertura com o Cristo na costa de Vitória como herói e régua, e a água translúcida com o relevo submerso visível por baixo. A e B ficam no histórico do git (commit `46a7b3f`); a pasta `web/variantes/` foi apagada ao fim desta entrada.

Construído, em ordem:

- 22h29: `index.html` na raiz (importmap `three` → `./web/vendor/three/`; o `SkeletonUtils.js` que o GLTFLoader importa está vendorizado em `addons/utils/`, então o shim das variantes saiu), `web/app.js`, `web/style.css`, `web/trilha.js`, `scripts/picos.mjs` (genérico: `node scripts/picos.mjs <slug>`, tabela no terminal e JSON em `captura/saida/<slug>/picos.json`; na 002, 44 picos com proeminência de 300 m ou mais, o maior com 4.179 m). A página lê sempre `lugares/<slug>/camera.json` (sem camera.json de variante) e tira tudo do `terreno.json` e do `lugar.json`.
- 22h33: `cli/copernicus.mjs` com o aviso 6(b) da licença ("produced using Copernicus WorldDEM-30 ...") mais a frase 6(c) de não responsabilidade; CLI rodada do cache em 0,7 s, `terreno.png` idêntico byte a byte (sha256 `058646de…9a0d65c`), `terreno.json` com o texto novo. `package.json`: `npm test` passou a incluir `captura/*.test.mjs` (43 testes, todos verdes).
- 22h31 a 22h45: cinco rodadas de quadros (`captura/quadro.mjs`, um headless por vez), um diagnóstico por camadas e a trilha nova (abaixo).
- 22h45: modo interativo conferido em headless 1280x720: UI, créditos (CC BY do Cristo no canto inferior esquerdo, com a nota da escala), botão Reproduzir (t avançou 1,42 s em 1,5 s), slider Esvaziar (-2.500 m) e órbita, zero erros de página.
- 22h46: captura 0 a 12 s (post do X); 22h47: captura 0 a 61 s em seguida (números no fim).

Trilha (`lugares/002-vitoria-trindade/camera.json`, 16 keyframes): abertura com a câmera 3,2 km a oeste do Cristo e 1,15 km acima (77 m reais), 6 graus para baixo, horizonte a 40 % da altura; água em 0 m até 2 s, só a câmera se aproximando do Cristo; de 2 a 12 s a água esvazia (Hermite monótona, extremos em repouso) enquanto a câmera sobe para 8 km e avança 35 km, até enxergar por cima da borda do talude o Banco de Vitória e a cadeia; de 12 a 16 s mergulha pelo talude e de t = 27 s em diante os keyframes da C ficaram intocados (t30 e t55 iguais aos da C). Conferida contra o terreno a 30 fps: folga mínima 0,78 km (52 m reais) em t = 3,4 s, velocidade máxima 35,7 km/s em t = 57 s, giro máximo do olhar 13,9 graus/s. Lição da costa: de uma câmera baixa em Vitória, a plataforma de 45 km esconde a linha d'água do esvaziamento (o talude fica a 50 km e desce de -50 m para -700 m); o que se vê é a plataforma secar e a cadeia subir por cima da borda, e por isso a câmera sobe muito mais do que avança.

Régua: `regua.escala` passou de 1 para 1,5 no `lugar.json`. O Cristo está desenhado 1,5 vezes maior que a escala exagerada do relevo (30 m x 15 = 450 m na cena viram 675 m; ~380 px no quadro, cabeça a 54 % e base a 74 % da altura). O crédito da página diz isso e a voz do Short tem de dizer também. Com escala 1 o herói tinha 210 px e não segurava o primeiro segundo.

`camada=1` (parâmetro de URL, só para a esteira): albedo do corpo do relevo e da base da água a 35 % (`uAlbMul`), linhas, arestas, costa e Cristo intactos. É a versão para compor em "lighter" por cima do clipe sem o corpo azul do relevo sujar o vídeo de fundo. Conferido em t = 0 e t = 12.

O que quebrou nas rodadas de quadros, e a causa de cada um:

- Rodada 1: Cristo virou bolha branca (corpo + rim a 1,4 saturavam e o bloom de raio 0,55 fazia halo de 200 px); a baía de 2 a 5 m ao lado do Cristo virou lençol branco (a borda luminosa da água tinha piso de largura em metros, `1.5 + dist x 0.25`, e o halo de 12 m cobria a baía); os topos das mesas no horizonte ficaram brancos (a linha d'água de 1,5 px cobria o platô inteiro a -10/-60 m quando um pixel cobre dezenas de metros de altura); manchas violeta na plataforma (silhueta em lombas de 10 m exageradas 15x). Consertos: corpo 0,05 + 0,25 ndl e rim 1,0 no Cristo; borda e halo da água só em espaço de tela (~2 px); linha d'água com teto de 8 m e fade onde o pixel não a resolve; aresta só onde há relevo de escala larga.
- Rodada 2: o lençol branco à direita do Cristo continuou, e apareceu uma reta fina atravessando o quadro no horizonte. Diagnóstico por camadas (script no scratchpad em cima de `captura/comum.mjs` e `window.__bsm._debug`): desligar as arestas apagava o lençol, e ele aparecia também dentro da textura do reflexo; a reta era a banda de Fresnel da água, com pico ~1 grau abaixo do nível do olho. O diagnóstico ainda mostrou um bug do próprio diagnóstico: `renderReflexo` religava a água depois do espelho e anulava o `agua: false`.
- Rodada 3: teto em `fwidth(ndv)` não resolveu. Causa real: `ndv = max(dot(n, V), 0)`. A malha (1024) é mais grossa que o heightmap (2048); num morro de um nó só a normal bicúbica do fragmento aponta para longe da câmera num triângulo que ainda é frontal, `ndv` vai a zero e a silhueta vira 1 na face inteira. `abs(dot(n, V))` resolveu na rodada 4. Base da água ficou constante (sem Fresnel), e a reta sumiu.
- Rodada 5: albedo da terra 25 % mais escuro (o morro de 33 m a 1 km do Cristo, um nó só a 636 m, aparece como pirâmide escura à direita do herói; é o dado, não erro). Quadros finais: herói legível no primeiro segundo, horizonte a 41,7 %, água com o relevo por baixo e sem reta dura, cadeia aparecendo no esvaziamento, t30 e t55 com o look da C.

Medido (Chromium 149.0.7827.55 do Playwright, ANGLE Metal, Radeon Pro Vega 56, 1080x1920, dpr 1):

- Cena pronta (`window.__bsm.ready`): 368 a 917 ms por abertura de página (carga da página 130 a 150 ms).
- Por quadro: `setTime` 1,2 a 3 ms (mediana 1,5; um pico de 45,6 ms no primeiro quadro), screenshot PNG 111 a 503 ms (média 193, mediana 196, p95 287). O screenshot do Playwright é o custo; o render não é.
- Draw calls: 19 com o Cristo em quadro, 17 sem (é culled). Triângulos: 963.312 com o Cristo (823.312 sem: a malha de 1024 x 201 = 411.648, desenhada duas vezes por causa do reflexo planar). Textura de altura 2048 x 403 (R32F).
- Captura 0 a 12 s: 360 quadros em 77,8 s (sequência 70,7 s, ffmpeg 4,4 s); determinismo 0 bytes diferentes em 3 quadros recapturados numa página nova (1, 180 e 360); MP4 `captura/saida/002-vitoria-trindade/x-0-12/002-vitoria-trindade-0s-12s.mp4`, 4.232.475 bytes, 1080x1920, 30 fps, 12,00 s, h264 yuv420p crf 18.
- Mac: cadeado `/tmp/ovictorlab-pesado.lock` livre às 22h20 (a esteira tinha terminado); carga 4,7 no início e 6,7 durante a captura longa; nunca dois headless ao mesmo tempo; servidor e Chromium fechados ao fim de cada comando (conferido com `ps`).

- Captura 0 a 61 s (o Short inteiro): 1.830 quadros em 461,0 s no total (sequência 436,2 s, ffmpeg 22,1 s); por quadro, setTime mediana 1,4 ms e screenshot média 235, mediana 260, p95 324, máximo 480 ms (os quadros do voo pela cadeia são os mais pesados); determinismo 0 bytes diferentes em 3 quadros recapturados numa página nova (1, 915, 1830); MP4 `captura/saida/002-vitoria-trindade/short-0-61/002-vitoria-trindade-0s-61s.mp4`, 27.153.950 bytes, 1080x1920, 30/1 fps, 61,00 s, h264 yuv420p, 1.830 quadros; erros de página: 0. Três quadros do MP4 conferidos com `ffmpeg -ss` em 1, 30 e 55 s (`captura/saida/002-vitoria-trindade/short-0-61/conferencia/`).
- Depois das capturas saiu o único `performance.now` que restava na página (só media `ready_ms`; a captura mede isso de fora). O quadro t = 0 recapturado com o código final ficou byte a byte igual do `q_000001.png` da captura curta.
- `web/variantes/` apagada (29 arquivos rastreados; A, B e C seguem no commit `46a7b3f`). Entrada fechada às 22h56.
