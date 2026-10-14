# ONDE-QUEBRA.md: o que não fica bonito, e por quê

Lista honesta. Cada item diz o que aparece na tela, de onde vem e o que já foi medido. Quando um lugar novo expõe uma quebra nova, ela entra aqui e no `DIARIO.md` do lugar.

## 1. Emendas de tile (Copernicus)

O Copernicus DEM vem em tiles de 1 grau por 1 grau, cada um, um COG com seus próprios overviews. Dois tiles vizinhos lidos em níveis de overview diferentes não casam na borda: aparece um degrau ou uma costura reta na linha do grau. Regra: um lugar usa o mesmo nível de overview em todos os tiles (a 002 usou o overview 3 nos 6 tiles de terra), e a reamostragem para a grade comum é feita depois da fusão, não tile a tile. Os overviews não têm transformação afim própria (fato medido em 13/10/2026): posicionar pelo bbox da imagem 0 e a largura do overview, senão o tile anda meio pixel e a costura vira um muro.

## 2. Costa grosseira do GEBCO

No mar, onde não há multifeixe, o GMRT devolve a base GEBCO (15 segundos de arco, cerca de 450 m por nó). A linha de costa dessa base não bate com a do Copernicus a 30 m: há praia que vira plataforma e enseada que some. A fusão resolve com uma regra simples (Copernicus acima de 0,5 m vence; senão `min(gmrt, 0)`), mas na grade de saída da 002 (636 m por nó; o GMRT veio a 458 m e o Copernicus a 247 m, os dois reamostrados) a costa de Vitória é um serrilhado de meio quilômetro. Com `mresolution` menor e grade maior fica melhor no mar, nunca melhor que a base onde ela é GEBCO.

## 3. Medido x interpolado

A camada `topo-mask` do GridServer diz, nó a nó, o que é multifeixe (valor) e o que é interpolado (NaN). No bbox inteiro da 002, 8,4 % dos nós de mar têm multifeixe (66.900 de 792.363 nós com elevação até 0 m; `terreno.json` de 13/10/2026). Na caixa do Banco Besnard (20,2 a 21,0 S, 38,9 a 37,6 W; 594 x 391 = 232.254 nós) deu 0 %. Então a forma do topo do Besnard no render é a forma suave do GEBCO, não a do monte. O número (30 m) é da Marinha, pelo LEPLAC, via Pesquisa FAPESP. Na GMRT 4.4.0 (agosto de 2025) só 11,9 % do oceano do mundo está mapeado a cerca de 100 m por nó. A fração medida de cada lugar vai em `terreno.json` e na descrição do vídeo, e a frase "a forma é do GEBCO, o número é da Marinha" vai na voz quando for o caso.

## 4. PNG em degraus

Heightmap de 16 bits em PNG carregado pelo navegador como imagem vira 8 bits: 256 degraus entre o fundo e o topo; na cadeia Vitória-Trindade (de -5.369 m a 1.847 m) cada degrau teria 28 m, e o terreno vira escadaria. Por isso o terreno é Terrain-RGB (passo de 0,1 m, três canais de 8 bits) ou Float32 por `fetch`. Mesmo assim, se a textura entrar com filtro linear ou mipmap, os canais se misturam na borda do 256 e aparecem picos. Gate: histograma de um quadro parado sem degraus.

## 5. Exagero honesto

Sem exagero vertical o relevo some: a cadeia tem 1.300 km de largura e 7 km de altura total. A 002 usa 15x, a 001 usa 30x (era 40x; decidido em 14/10/2026, `lugares/001-brasil-sem-mar/DIARIO.md`). O exagero multiplica todas as alturas pelo mesmo fator, então a proporção entre feições se mantém, mas a inclinação não: um talude de 2 graus a 15x parece uma parede de 28 graus. A régua (Cristo, 30 m) entra no mesmo fator vezes `regua.escala`: a 15x com escala 1,5 (002) ela tem 675 m de "altura visual", e isso é dito na página e na voz. A frase do exagero vai na voz e na descrição de todo vídeo. Nunca duas escalas no mesmo quadro.

## 6. NaN do GridServer

`layer=topo` traz NaN esparsos mesmo onde há dado (fato medido): 5.694 no GeoTIFF da 002 e 5.296 no da 001 (campo `nan` de cada fonte em `terreno.json`). A CLI preenche pelo vizinho válido antes de reamostrar e conta o que sobrou na grade de saída em `nodata_preenchidos` (0 nas duas). Preenchimento é invenção local de poucos nós; se a contagem passar de 1 % dos nós, o lugar não sai sem olhar onde estão.

## 7. Limite de 2 GB e o país inteiro

O GridServer aceita até 2 GB por pedido, cerca de 20 por 20 graus a 100 m por nó. O bbox da 001 (6 N a 34 S, 74,5 W a 28 W) tem 40 por 46,5 graus: só cabe a cerca de 2 km por nó. Medido em 13/10/2026: pedido `mresolution=2452`, o servidor devolveu 2.648 x 2.402 nós a 1.899 x 1.855 m por nó (25.461.566 bytes); a grade de saída ficou em 2048 x 1816 a 2.452 m por nó. Por isso a 001 é render-only, sem página interativa a 30 m, e a costa dela é a do GEBCO. O bbox entra pelos Andes: o máximo de 6.468,8 m está fora do Brasil, e a câmera não vai até lá.

## 8. GitHub Pages: 10 MB por lugar e a banda

Limites publicados (https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits, lidos em 13/10/2026): site de até 1 GB, banda com limite brando de 100 GB por mês, 10 builds por hora. O orçamento é 10 MB por lugar: a 002 tem 1.175.983 bytes (2048 x 403) e a 001 tem 6.115.265 bytes (2048 x 1816). A conta do crítico na nota de 13/10: um Reel com 197 mil views e 1 % de cliques são 1.970 visitas; a 10 MB por lugar, 20 GB no mês; a 20 MB, 40 GB. Passou de 100 GB, plano B é CDN.

## 9. Grade de 40 m que ainda não chegou

A grade CORE-VTRCC (40 m, CC BY 4.0, MGDS) não tem download direto confirmado: a página do MGDS mostra os botões "Download" e "Request" (DVD ou FTP), a lista de arquivos de grade veio vazia na leitura automática de 13/10/2026 e o crítico da nota registrou 404 no link de dados. E o paper diz que o multifeixe não foi feito em menos de 200 m de profundidade (100 m na legenda da figura 2): o topo do Besnard não está nela. O slot existe em `dados/fontes/core-vtrcc.md`; o lançamento não promete esse dado.

## 10. Terra a 247 m por nó, não a 30 m

Para uma caixa de 1.300 km a CLI lê o Copernicus no overview 3 (450 nós por grau, cerca de 247 m por nó) e reamostra para a grade de saída (636 m por nó na 002): a serra do Espírito Santo entra suavizada, não a 30 m. Os 30 m só aparecem em lugar pequeno (caixa de 40 km, overview 0). Na 001 nem Copernicus há: a terra é a do GMRT, mais grosseira ainda. A resolução real de cada fonte fica em `terreno.json` (`overview`, `metros_por_no_devolvido`) e vai na descrição.

## 11. v2: estrada que afunda

Fora da v1, registrado para não esquecer: linha de OSM (estrada, costa) drapeada sobre heightmap grosseiro afunda no terreno onde a malha corta a linha. Precisa de offset por normal ou de reamostragem da linha na grade. Só entra com loader, licença (ODbL) e esta quebra fechada.

## 12. Morro de um nó só vira cone

Na 002 um texel (636 m) à entrada da baía de Vitória tem 122 m (texel 118/144 do `terreno.png`; pela posição, o Morro do Moreno, nome a confirmar). A 15x são 1,8 km de altura numa base de 1,9 km: um cone. Com a malha uniforme de 1024 segmentos (um vértice a cada dois texels, em meio texel) ele era uma pirâmide de quatro faces planas, com 1 km de altura, atrás do Cristo (apontado na revisão visual de 14/10/2026). A malha ficou mais fina que o texel perto da régua (passo de um quarto de texel crescendo em progressão geométrica até o passo base; grade tensorial, uma malha só, sem emenda) e o cone saiu liso, com a altura certa. A régua foi para o topo desse morro: ao lado dele, o Cristo (675 m) sumia atrás do espigão; em cima, o morro é o pedestal (a ideia aprovada da variante A: "Cristo luminoso num morro"). É o dado, não é invenção; a honestidade está em dizer o exagero.

## 13. A plataforma esconde a linha d'água

De uma câmera baixa na costa, a plataforma de 45 km esconde a linha d'água do esvaziamento: o talude fica a 50 km e desce de -50 m para -700 m, e a água some atrás da borda. O que se vê é a plataforma secar e a cadeia subir por cima da borda. Por isso a abertura da 002 sobe muito mais do que avança (20 km de altura aos 12 s) e só então olha para baixo.

## 14. Água rasante e montes submersos

Até 14/10/2026 a água se dissolvia no ângulo rasante (para o plano não acabar numa reta) e o relevo submerso só escurecia 40 %: os topos dos bancos a -20/-145 m, 150 km adiante, já apareciam em t = 0 como uma fileira de ilhas, e o esvaziamento não tinha o que revelar. Agora o alpha é por Fresnel (0,5 olhando para baixo, 0,9 no rasante), o relevo submerso se extingue com a profundidade (1/e a 150 m: a -50 m sobra um véu, a -700 m nada) e o plano d'água vai até onde a névoa chega a 100 %. Medido: nenhum monte no horizonte em t = 0; os topos rompem a superfície entre 3 e 4 s.

## 15. Duas retas no horizonte

A borda luminosa da água (onde o terreno está logo abaixo da superfície) tinha largura só em espaço de tela, sem teto em metros: de raspão, um pixel cobre centenas de metros de profundidade, e a "costa" subia a escarpa inteira da plataforma, a 40 e a 59 km, como duas retas atravessando o quadro inteiro no horizonte de t = 0 (medidas na revisão visual: luma 82 a 119 contra 30 a 46 nas linhas vizinhas). Teto de 12 m na largura e halo só até 30 m de profundidade: as retas sumiram.

## 16. Isolinhas na parede

Dez isolinhas de 500 m paralelas numa escarpa liam como papel pautado, "mapa bonito" em vez de traço. As isolinhas ficaram em 1.000 m no mar e 100 m na terra, só em encosta suave (somem acima de ~35 graus exagerados) e mais fracas; a forma fica com a silhueta e a crista.

## 17. Reflexo planar e o orçamento

O reflexo planar redesenhava a malha inteira numa segunda passagem: os triângulos dobravam (823.312 na 002; a 001 passaria de 2 milhões). Agora a passagem do espelho usa uma malha com um quarto dos segmentos (25.600 triângulos na 002, 62.464 na 001). As silhueta refletidas ficam mais grossas, o que não aparece: o reflexo é sutil, a meia resolução e borrado. A GPU de um celular de verdade continua sem medir.
