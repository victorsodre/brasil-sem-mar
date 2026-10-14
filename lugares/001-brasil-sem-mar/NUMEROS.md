# NUMEROS: 001 Brasil sem mar

Cada número que entra no vídeo, no post ou na página, com fonte primária e URL. Status: "verificado" = lido na fonte em 13/10/2026; "a confirmar" = ainda sem fonte primária lida. Número sem fonte primária não entra no vídeo. Bbox: 6 N a 34 S, 74,5 W a 28 W; exagero vertical declarado: 30x (era 40x; decidido em 14/10/2026, `DIARIO.md`); "só render": sem página interativa a 30 m (a terra é GMRT a ~1,9 km por nó), sem régua, o que sai é o MP4 da trilha de 10 s do `camera.json`.

| Número | Onde entra | Fonte | URL | Status |
|---|---|---|---|---|
| Cerca de 5,7 milhões de km² de mar sob jurisdição brasileira (Amazônia Azul), contando a plataforma continental estendida pleiteada na ONU | manchete do post 001 ("embaixo da água tem mais 5,7 milhões de km²") | MCTI, "Você sabe o que é a Amazônia Azul?", 27/08/2026 (atualizado 17/09/2026): "pode alcançar cerca de 5,7 milhões de quilômetros quadrados" | https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/noticias/noticias-julho-outubro-2026/voce-sabe-o-que-e-a-amazonia-azul-regiao-reune-biodiversidade-recursos-e-atividades-essenciais-para-o-brasil | verificado (fonte oficial do governo) |
| O mesmo 5,7 milhões de km² na Marinha | reforço da fonte | Agência Marinha, "Novo mapa do Brasil é expandido com 5,7 milhões de km² de área marítima" | https://www.agencia.marinha.mil.br/amazonia-azul/novo-mapa-do-brasil-e-expandido-com-57-milhoes-de-km2-de-area-maritima | a confirmar no texto (a página bloqueia leitura automática: HTTP 403 em 13/10/2026; só o título foi lido, pelo índice de busca) |
| ZEE: cerca de 3,6 milhões de km² | contexto | MCTI, mesma matéria: "Apenas a ZEE brasileira corresponde a aproximadamente 3,6 milhões de quilômetros quadrados" | mesma URL | verificado |
| "Quase outro Brasil" (área terrestre do país) | comparação no post | IBGE (área territorial oficial) | a anexar | a confirmar (não lido em 13/10) |
| Campos marítimos produziram 97,4 % do petróleo e 84,3 % do gás natural do Brasil em 2024 | "de onde sai a maior parte do petróleo" | ANP, Boletim da Produção de Petróleo e Gás Natural, dezembro de 2024 (consolidado 2024), seção "Origem da Produção": "Os campos marítimos produziram 97,4% do petróleo e 84,3% do gás natural." | https://www.gov.br/anp/pt-br/centrais-de-conteudo/publicacoes/boletins-anp/boletins/arquivos-bmppgn/2024/dezembro.pdf | verificado (PDF lido em 13/10/2026) |
| Pré-sal: 78,5 % do total produzido no país (dezembro de 2024); produção de 3,421 milhões de bbl/d no mês | contexto | mesmo boletim | mesma URL | verificado |
| 89 % (88,9 %) das exportações passam pelo mar (2023) | "é por ali que passam 89 % das exportações" | nenhuma fonte primária lida. Pistas: a Marinha fala em "95 % do comércio exterior" (texto indexado de página que bloqueia robô); a ATP diz que as exportações por via marítima somaram US$ 300,4 bilhões em 2023 (Portos e Navios, 17/01/2024, https://www.portosenavios.com.br/noticias/portos-e-logistica/balanca-comercial-por-via-maritima-cresceu-41-9-em-2023), e a Secex/IBGE dá o total de 2023 em US$ 339,67 bilhões, o que daria 88,4 % em valor, mas são recortes diferentes | a buscar no Comex Stat (MDIC), filtro por via de transporte, 2023, valor FOB: https://www.gov.br/mdic/pt-br/assuntos/comercio-exterior/estatisticas/base-de-dados-bruta | a confirmar (não usar "89 %" até fechar; o `lugar.json` já marca "a confirmar na Marinha") |
| Exagero vertical 30x | voz e descrição | `lugar.json` (40x até 14/10/2026; motivo no `DIARIO.md`) | arquivo local | declarado |

## O terreno (gerado pela CLI em 13/10/2026, 21h36)

| Número | Fonte | Status |
|---|---|---|
| Grade de saída 2048 x 1816 nós, 2.452,5 x 2.452,0 m por nó, 5.022,6 x 4.452,8 km | `terreno.json` | medido |
| GMRT `layer=topo` (terra e mar), pedido `mresolution=2452`, devolvido 2.648 x 2.402 a 1.899,3 x 1.855,3 m por nó, 25.461.566 bytes, 5.296 NaN no GeoTIFF | `terreno.json` (chamada registrada em `dados/fontes/gmrt.md`) | medido |
| Elevação de -8.079,2 m a 6.468,8 m dentro do bbox (o máximo está fora do Brasil: o bbox entra pelos Andes) | `terreno.json` | medido |
| Fração medida (multifeixe): não rodada (`mascara: false` no `lugar.json`; `pct_medido: null`) | `terreno.json` | a medir, se o lugar precisar |
| 0 nós preenchidos na grade de saída | `terreno.json` | medido |
| `terreno.png`: 6.115.265 bytes (orçamento: 10 MB) | arquivo | medido |

## Rótulo de conteúdo alterado ou sintético

Não, pelos três critérios do YouTube (https://support.google.com/youtube/answer/14328491): nenhuma pessoa real dizendo ou fazendo o que não fez; nenhuma filmagem real alterada; relevo neon calculado de DEM não é cena realista de algo que não aconteceu. Voz clonada do próprio autor é isenta. Música gerada por IA como foco principal (quarto caso do YouTube): não se aplica a esta peça.

## Fontes de dado da peça

Copernicus DEM GLO-30 não entra na 001 (`"terra": "gmrt"`); terra e mar vêm do GMRT (CC BY 4.0, Ryan et al. 2009), base GEBCO 2026. A costa e o relevo da terra são os do GMRT a ~1,9 km por nó: a 001 é só o país inteiro visto de longe. Textos de atribuição em `dados/fontes/`.
