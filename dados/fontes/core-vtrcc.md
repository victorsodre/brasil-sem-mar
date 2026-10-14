# CORE-VTRCC: grade de 40 m da cadeia Vitória-Trindade (fora do repositório)

Batimetria multifeixe do cruzeiro CORE-VTRCC (NHo Cruzeiro do Sul, 18/10 a 06/11/2021, ecobatímetro Kongsberg EM-122 a 12 kHz) ao longo da cadeia Vitória-Trindade, processada e gradeada a 40 m. É o único dado de alta resolução público da cadeia que achamos; não está no repositório porque não tem download direto confirmado. O slot existe para quando chegar.

## URLs

| O quê | URL |
|---|---|
| Grade (DOI) | https://doi.org/10.26022/IEDA/331479 (redireciona para https://www.marine-geo.org/doi/10.26022/IEDA/331479) |
| Página de arquivos no MGDS | https://www.marine-geo.org/tools/files/31479 |
| Multifeixe processado (origem da grade) | https://doi.org/10.26022/IEDA/331478 |
| Paper (DOI) | https://doi.org/10.1038/s41597-024-03898-6 |
| Paper em acesso aberto (Europe PMC, PMC11436874; a página humana devolveu 403 a robô em 13/10/2026, a API respondeu) | https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11436874/fullTextXML |

## Licença e atribuição

Grade: CC BY 4.0 (página do MGDS, lida em 13/10/2026). Citação na forma do MGDS:

> Tagliaro, Gabriel, et al. (2024), Processed gridded bathymetry data for the CORE-VTRCC cruise (2021). Marine Geoscience Data System (MGDS). doi:10.26022/IEDA/331479

Paper (artigo em CC BY-NC-ND 4.0; o dado, não o artigo, é CC BY 4.0):

> Tagliaro, G. et al. (2024). CORE-VTRCC Cruise Report: Geophysical Acquisition and Seafloor Sampling along the Vitória-Trindade Ridge. Scientific Data 11, 1056 (27/09/2024). doi:10.1038/s41597-024-03898-6. PMC11436874.

Autor correspondente: Gabriel Tagliaro, Instituto Oceanográfico da Universidade de São Paulo.

## Fatos do paper e do MGDS (lidos em 13/10/2026)

- Grade a 40 m de resolução horizontal, em coordenadas geográficas, formato ESRI ASCII grid (MGDS). O paper não repete o "40 m"; o único 40 no texto é a frequência de ping.
- "multibeam bathymetry was not performed in water depths shallower than 200 m" (texto); a legenda da figura 2 diz "<100 m". Ou seja: o topo do Banco Besnard (30 m) não está na grade. (O Banco Fernando de Almeida, a 38 m, fica "na região da cadeia montanhosa de Fernando de Noronha" segundo a Pesquisa FAPESP: fora da cadeia Vitória-Trindade e fora deste lugar.)
- "the VTR seamount chain extends 1200 km offshore the Brazilian coast".
- O dado "is freely available at the Marine Geoscience Data System" (agradecimentos); grades "in format ESRI ASCII (10.26022/IEDA/331479)".
- Como obter: a página de arquivos do MGDS tem os botões "Download Selected File(s)" e "Request Selected File(s)" ("Request a DVD or and FTP session"). Na leitura automática de 13/10/2026 a lista de arquivos de grade veio vazia; o crítico de construção da nota de 13/10 registrou 404 no link de dados. Caminho que resta: "Request" no MGDS (DVD ou FTP) ou e-mail ao autor correspondente. Documentos de apoio listados na página: `readme_VTRCC.txt`, `Methodology_Report_VTRCC.pdf`.

## Chamadas registradas

| Quando | O quê | Resultado |
|---|---|---|
| 13/10/2026 (nota, crítico) | link de dados do MGDS | 404; página só oferece Request por DVD ou FTP |
| 13/10/2026, 21h | https://www.marine-geo.org/doi/10.26022/IEDA/331479 | HTTP 200; CC BY 4.0; 40 m; ESRI ASCII; botão "Download Data" sem URL no texto |
| 13/10/2026, 21h | https://www.marine-geo.org/tools/files/31479 | lista de arquivos de grade vazia; botões Download e Request (DVD/FTP) |
| 13/10/2026, 21h | Europe PMC, PMC11436874 (texto completo) | 200 m no texto, 100 m na legenda da figura 2; 1200 km |

## Onde quebra

- Não cobre acima de 100 a 200 m de profundidade: os topos rasos da cadeia continuam sendo forma do GEBCO mesmo com a grade.
- Pedido por DVD/FTP: quando chegar, converter de ESRI ASCII para GeoTIFF com Node puro (sem GDAL no repositório) e registrar bytes e sha256 em `terreno.json`.
- 40 m por nó na cadeia inteira (1.300 x 260 km) é muito mais que a textura de 2048: entra reamostrada; a resolução cheia serve para recortes (um monte por lugar).
- Enquanto não estiver no repositório, nenhum post diz "dado de 40 m".
