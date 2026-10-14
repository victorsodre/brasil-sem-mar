# Cristo Redentor (régua de 30 m)

A régua da v1 é o Cristo Redentor: 30 m de altura reais, base em y = 0, posicionado em `regua.lon/lat` do `lugar.json` sobre o terreno e desenhado na mesma escala exagerada da cena (`exagero_vertical/1000 * regua.escala`). Arquivo: `regua/cristo-web.glb`.

## URL, licença e atribuição

> "Christ the Redeemer (Cristo Redentor)" por Parlin Sitorus, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
> Fonte: https://sketchfab.com/3d-models/christ-the-redeemer-cristo-redentor-157dbdb9d8654651a5e5c9af7b412398

Alterações feitas (no projeto cristo-redentor, de onde o arquivo veio, com o mesmo sha256): vértices soldados (de 186.966 triângulos do STL original para 93.483 vértices), rotação de Z-up para Y-up, escala para 30 m de altura (a envergadura ficou em 28,81 m; o monumento real tem 28 m, 3 % de diferença), base apoiada em y = 0 e centrada em x/z, material PBR de esteatita, normais suaves recalculadas. `cristo-web.glb` tem 70.000 triângulos e 1.681.264 bytes, sem compressão Draco (carrega só com `GLTFLoader`). A escultura digital é de Parlin Sitorus; nada da cena do cristo-redentor (pedestal, mirante, terreno) entra aqui.

O crédito CC BY aparece na página, no canto inferior esquerdo, sempre, fora do modo captura (que é só o terreno sobre preto). Nas descrições de vídeo que mostrem a régua, o crédito vai junto com os das fontes de dado.

## Chamadas registradas

Nenhuma chamada de rede: o arquivo é local. Verificação de 13/10/2026: sha256 `320b4e8063501b821f68ab5ef2504d6fe9563bcf86e70145ec47d284ca3786c1`, idêntico ao `cristo-web.glb` do cristo-redentor.

## Onde quebra

- Escala: a régua obedece ao exagero vertical da cena. A 15x o Cristo tem 450 m de "altura visual"; a 40x, 1.200 m. Isso é dito na voz. Nunca duas escalas no mesmo quadro.
- Posição: `regua.lon/lat` precisa cair sobre terreno acima da água no tempo em que a régua aparece; sobre o mar, a base fica dentro da água e a régua perde sentido.
- Peso: 1,7 MB no orçamento de 10 MB do lugar. A versão Draco (144 KB) existe no cristo-redentor, mas exige `DRACOLoader` e o decoder; fica para quando o orçamento apertar.
- Maracanã e pessoa de 1,75 m são v2.
