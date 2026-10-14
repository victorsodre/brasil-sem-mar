# NUMEROS: 002 Cadeia Vitória-Trindade

Cada número que entra no vídeo, no post ou na página, com fonte primária e URL. Status: "verificado" = lido na fonte em 13/10/2026; "a confirmar" = ainda sem fonte primária lida. Número sem fonte primária não entra no vídeo. Bbox do lugar: 19,5 a 21,8 S, 41 a 28,5 W; exagero vertical declarado: 15x.

## A cadeia

| Número | Onde entra | Fonte | URL | Status |
|---|---|---|---|---|
| Topo do Banco Besnard a 30 m da superfície | manchete do post e do Short ("o topo de um dos montes fica a 30 m da superfície") | Pesquisa FAPESP, "As montanhas submersas do Brasil", Carlos Fioravanti, 07/02/2020, com base no levantamento do LEPLAC (Marinha): "o Banco Besnard, com 30 m, na cadeia Vitória-Trindade" | https://revistapesquisa.fapesp.br/as-montanhas-submersas-do-brasil/ | verificado |
| Banco Fernando de Almeida a 38 m da superfície | reserva (outro monte raso) | mesma matéria: "o Fernando de Almeida, a 38 m da superfície" | mesma URL | verificado (posição do banco em relação ao bbox: a confirmar) |
| Mais de 30 montes submarinos e dois grupos de ilhas oceânicas, todos vulcânicos | manchete ("mais de 30 montes submersos") | ((o))eco, "Cordilheira submarina de mil quilômetros de extensão é um hotspot de vida marinha", Evanildo da Silveira, 27/10/2019, sobre o projeto da Ufes, UVV e California Academy of Sciences: "Ela é formada por mais de 30 montes submarinos e dois grupos de ilhas oceânicas" | https://oeco.org.br/reportagens/cordilheira-submarina-de-mil-quilometros-de-extensao-e-um-hotspot-de-vida-marinha/ | verificado |
| Começa a 120 km da costa do Espírito Santo (monte Vitória) e termina a 1.160 km (Ilha da Trindade e Martin Vaz) | "de Vitória à Ilha da Trindade" | mesma matéria | mesma URL | verificado |
| Cerca de 1.200 km de extensão | manchete ("uma cordilheira submersa de ~1.200 km") | Tagliaro et al. 2024, Scientific Data 11, 1056: "the VTR seamount chain extends 1200 km offshore the Brazilian coast"; ((o))eco: 1.160 km; Fundação Grupo Boticário: Trindade "distante 1.140 quilômetros do continente" | https://doi.org/10.1038/s41597-024-03898-6 | verificado (as fontes variam de 1.140 a 1.200 km; "cerca de 1.200" é o arredondamento do paper) |
| Grade de 40 m da cadeia (CORE-VTRCC, 2021), sem multifeixe em menos de 200 m de profundidade (100 m na legenda da figura 2) | descrição ("a grade de 40 m não cobre o topo") | Tagliaro et al. 2024 e MGDS doi:10.26022/IEDA/331479 | `dados/fontes/core-vtrcc.md` | verificado; dado fora do repositório |

## Corais e pesca (frase de vida)

| Número | Onde entra | Fonte | URL | Status |
|---|---|---|---|---|
| "Os pesquisadores encontraram âncoras, vestígios de armadilhas e outros indícios de pesca nos montes submarinos recém-mapeados" | frase de vida ("a pesca comercial já deixou âncora e armadilha nesses corais") | Fundação Grupo Boticário, nota de imprensa sobre o artigo na revista Coral Reefs que batizou as "Colinas Coralinas" (expedições de 2011 e 2019 ao Banco Davis; coordenação de Hudson Pinheiro, USP e California Academy of Sciences) | https://fundacaogrupoboticario.org.br/wp-content/uploads/2024/12/Pesquisadores-descobrem-grandes-extensoes-de-recifes-de-coral-em-montes-submarinos-da-Cadeia-Vitoria-Trindade-1.pdf | verificado na nota de imprensa; citação completa do artigo na Coral Reefs (autores, ano, DOI) a confirmar antes de ir para a descrição |
| Colinas Coralinas: estruturas de algas coralinas com 60 a 70 m de altura e cume a 17 m de profundidade (Banco Davis) | reserva | mesma nota | mesma URL | verificado na nota de imprensa |
| 104 espécies de peixes no Banco Davis, 89 recifais | reserva | mesma nota | mesma URL | verificado na nota de imprensa |
| Projeto "Corais entre Manuel Luís e Vitória-Trindade": R$ 16,36 milhões do BNDES (não reembolsável) + R$ 16,65 milhões de contrapartida do ICMBio = R$ 33,01 milhões, 36 meses, executado pela Fest com a Ufes; o professor Alex Cardoso Bastos coordena a frente de mapeamento | gancho de atualidade ("os montes vão ser mapeados por três anos com R$ 33 milhões") | A Gazeta, "Corais e montes submarinos vão ser mapeados de Vitória à Ilha de Trindade", 28/08/2026; Movimento Econômico, 28/08/2026; página BNDES Corais (lista o projeto e a proponente Fest) | https://www.agazeta.com.br/atitude-sustentavel/corais-e-montes-submarinos-vao-ser-mapeados-de-vitoria-a-ilha-de-trindade-0826 · https://movimentoeconomico.com.br/meio-ambiente/2026/08/28/bndes-destina-r-25-milhoes-para-recuperar-corais-em-oito-estados-do-nordeste/ · https://www.bndes.gov.br/wps/portal/site/home/onde-atuamos/meio-ambiente/bndes-azul/bndes-corais | verificado |
| "O peixe que chega a Vitória nasce nesses montes" | saiu do roteiro | sem fonte | — | descartado (nota de 13/10) |

## O terreno (gerado pela CLI em 13/10/2026, 21h35)

| Número | Fonte | Status |
|---|---|---|
| Grade de saída 2048 x 403 nós, 635,8 x 635,3 m por nó, 1.302,1 x 256,0 km | `terreno.json` | medido |
| Mar: GMRT `layer=topo`, pedido `mresolution=636`, devolvido 2847 x 561 a 457,9 x 458,6 m por nó, 6.393.522 bytes, 5.694 NaN no GeoTIFF | `terreno.json` (chamada registrada em `dados/fontes/gmrt.md`) | medido |
| Terra: Copernicus GLO-30 no overview 3 (450 nós por grau, cerca de 247 m por nó), 6 tiles de terra, 33 tiles do bbox só de oceano (404), 1.798.779 bytes | `terreno.json` (chamada registrada em `dados/fontes/copernicus.md`) | medido |
| Elevação de -5.369,1 m a 1.847,1 m dentro do bbox | `terreno.json` | medido |
| 8,4 % dos nós de mar com multifeixe (66.900 de 792.363 nós com elevação até 0 m); o resto é base GEBCO interpolada | `terreno.json` (`mascara`, de `layer=topo-mask`) | medido |
| Na caixa do Banco Besnard (20,2 a 21,0 S, 38,9 a 37,6 W): 0 % medido em 232.254 nós | nota de 13/10/2026 (18h) | medido |
| 0 nós preenchidos na grade de saída (`nodata_preenchidos`) | `terreno.json` | medido |
| `terreno.png`: 1.175.983 bytes (orçamento: 10 MB) | arquivo | medido |

Honestidade na tela: a forma do topo do Besnard no render é a do GEBCO (0 % medido na caixa dele; 8,4 % no bbox inteiro); o número de 30 m é da Marinha via FAPESP. A terra está a 247 m por nó reamostrada para 636 m, não a 30 m. O exagero de 15x é dito na voz.

## Rótulo de conteúdo alterado ou sintético

Não, pelos três critérios do YouTube (https://support.google.com/youtube/answer/14328491): nenhuma pessoa real dizendo ou fazendo o que não fez; nenhuma filmagem real alterada; relevo neon calculado de DEM não é cena realista de algo que não aconteceu. Voz clonada do próprio autor é isenta. Música gerada por IA como foco principal (quarto caso do YouTube): não se aplica a esta peça.

## Fontes de dado da peça

Copernicus DEM GLO-30 na terra (dado adaptado: vale o aviso 6(b) da licença da ESA, "produced using Copernicus WorldDEM-30 ..."), GMRT no mar (CC BY 4.0, Ryan et al. 2009) sobre base GEBCO 2026, Cristo Redentor de Parlin Sitorus (CC BY 4.0) como régua. Textos de atribuição em `dados/fontes/`; o `terreno.json` guarda a URL exata, os bytes e o sha256 de cada chamada.
