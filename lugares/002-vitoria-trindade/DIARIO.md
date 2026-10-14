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
