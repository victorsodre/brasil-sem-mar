# DIARIO: 001 Brasil sem mar

Uma entrada por dia de trabalho: o que foi construído, o que quebrou, o que foi medido. É a única fonte dos posts "build com agentes": número de diário sai daqui, nunca é ilustrativo.

## 14/10/2026

Câmera e MP4 do post de lançamento no X ("Tirei o mar do Brasil inteiro"): 10 s, 9:16, 30 fps. O terreno da 001 já existia (CLI de 13/10: GMRT a 2.452 m por nó, 2048 x 1816, elevação de -8.079,2 m a 6.468,8 m). Trabalho entre 14h06 (primeira prévia) e 14h19 (MP4), em cinco rodadas de prévia (`captura/saida/001-brasil-sem-mar/r1` a `r5`, quatro ou cinco quadros cada) e uma captura de sequência.

Construído:

- `camera.json`: 5 keyframes (0, 1, 5, 9 e 10 s), duração 10 s. Câmera no Atlântico a 120 m de altura real, 400 km a leste-sudeste de Vitória (21,70 S, 36,85 W), olhando para oés-noroeste com o horizonte a 40 % da altura (inclinação de 6 graus para baixo, fov vertical 55). No primeiro segundo a água fica em 0 m e a câmera quase não se mexe (3,4 km): só a costa do Espírito Santo no quadro, com o cone do Caparaó à esquerda (x = 31 %) e o relevo submerso fraco através da água. De 1 s a 9 s a água desce de 0 a -6.300 m em dois tempos: lenta até -1.800 m aos 5 s (plataforma seca aos 2 s, talude de 3 a 5 s) e rápida depois (planície abissal seca perto de 8 s). A câmera avança devagar para noroeste (55 km em 10 s, 5,7 a 7,5 km/s), sobe de 120 m para 950 m reais e gira 7 graus para a direita; o primeiro banco da cadeia Vitória-Trindade entra pela direita como mesa violeta e termina a 125 km, em x = 79 %.
- `lugar.json`: `exagero_vertical` 40 → 30 e `nivel_minimo_m` -6000 → -6300 (motivos abaixo). Nada mais mudou.
- `captura/saida/001-brasil-sem-mar/001-brasil-sem-mar-0s-10s.mp4` (gitignored): 1080 x 1920, h264 High, yuv420p, 300 quadros, 10,000 s, 5.435.410 bytes (4,35 Mb/s), com `relatorio.json` e os 300 PNG (563 KB a 909 KB, 217 MB).

Medido (coordenadas de cena em km, origem no centro do bbox, +x leste, +z sul; alturas do `terreno.png`, GMRT a 1,9 km por nó):

| O quê | Onde | Valor |
|---|---|---|
| Vitória (costa) | 40,30 W, 20,32 S | x 1.183, z 704, 12 m |
| Caparaó (máximo do GMRT na caixa 42,2 a 41,5 W, 20,7 a 20,2 S) | 41,79 W, 20,44 S | 2.430 m |
| Borda da plataforma na latitude da cadeia | 39,9 W, 20,6 S | -240 m; a 40,3 W ainda -59 m, a 39,8 W já -1.374 m |
| Topo do primeiro banco da cadeia (Besnard, pela posição; nome a confirmar) | 38,09 W, 20,66 S | -2,6 m (nó mais alto); -75 m no eixo 20,6 S |
| Topo do segundo (monte Vitória, pela posição; a confirmar) | 37,57 W, 20,64 S | -20 m |
| Outros topos no eixo 20,6 S | 35,85 W; 34,75 W; 31,79 W | -435 m; -60 m; -374 m (20,71 S) |
| Planície ao sul da cadeia (36 a 32 W, 23 a 21,5 S) | | -3.816 m a -5.035 m |
| Talude íngreme | 22,5 S | -200 m a -2.000 m em 70 km (bacia de Campos); em 21,3 S é rampa de 300 km até -3.400 m |
| Elevação do Rio Grande (topo) | 36,80 W, 30,73 S | -583 m; 1.100 km ao sul da cadeia |
| Ponto mais fundo do lado atlântico (lon > 50 W) | 28,76 W, 13,53 S | -6.237,9 m |
| Ponto mais fundo da caixa (fossa do Atacama, Pacífico) | 71,33 W, 23,39 S | -8.079,2 m |

Névoa da cena (`LOOK.nevoa` = 0,0022 por km, fator `1 - exp(-(d x 0,0022)^2)`): 18 % a 200 km, 35 % a 300 km, 54 % a 400 km, 63 % a 455 km, 78 % a 556 km, 99 % a 1.000 km. Esse número é fixo no `web/app.js`, não vem do `lugar.json`.

Captura (`node captura/capture.mjs 001-brasil-sem-mar --de 0 --ate 10`): cadeados pegos em 1 ms (esteira parada); Chromium 149.0.7827.55 com `--use-angle=metal`; página carregada em 138 ms, cena pronta em 479 ms; 300 quadros em 97,7 s (323 ms por quadro na média: 1,8 ms de `setTime`, 321 ms de screenshot; p95 413 ms, máximo 720 ms); determinismo: quadros 1, 150 e 300 recapturados em página nova, 0 bytes diferentes (1,5 s); ffmpeg 5,2 s; total 106,1 s; 0 erros de página; 17 draw calls, 1.998.864 triângulos (malha 1024 x 488), textura 2048 x 1816.

Decidido, e por quê:

- Exagero 30x (era 40x declarado). A 40x (rodada r1) a costa vira um herói forte, mas um monte de 4.000 m fica com 160 km de altura e proporção 3:1: o monte Vitória a 112 km ocupava metade do quadro já debaixo d'água, como cortina roxa, e o talude em t = 9 parecia parede de barragem. A 25x (r2 e r3) os montes viraram mesas no olhar aprovado da 002, mas a costa a 445 km, com 62 % de névoa, ficou escura demais para herói. A 30x com a câmera 40 km mais perto (r4, r5) a costa volta a ler (Caparaó com 72,9 km de altura: 8,0 graus acima do horizonte a 519 km, 7,5 graus a 556 km em t = 0) e o banco mais próximo fica com 120 km de altura a 125 km. É o compromisso entre "relevo continental invisível" e "ridículo".
- `nivel_minimo_m` -6.300. O ponto mais fundo do lado atlântico da caixa é -6.238 m, então -6.300 seca todo o mar do lado do Brasil. A fossa do Atacama (-8.079 m) fica com 1.800 m de água: é Pacífico, está a 4.000 km da câmera, nunca entra no quadro, e "tirei o mar do Brasil" não precisa secar o Chile. -8.100 secaria tudo, mas não muda nada no vídeo.
- Câmera ao sul da cadeia (130 km do eixo em t = 0, 70 km no fim), e não sobre ela. Na latitude da cadeia os dois primeiros bancos ficam a 110 e 170 km, à frente e à direita, e a 25x ou mais qualquer um deles a menos de 200 km domina o quadro vertical (fov horizontal de só 33 graus no 9:16). Ao sul, em t = 0 só a encosta do primeiro banco aparece submersa na borda direita; a deriva para noroeste com giro de 7 graus traz o banco para x = 79 % no fim e deixa o segundo passar fora do quadro.
- Esvaziamento em dois tempos (0 → -1.800 m de 1 a 5 s; -1.800 → -6.300 m de 5 a 9 s, Hermite monótona): com um smoothstep só, a planície já estava seca aos 6 s e sobravam 3 s sem nada mudando. Nível por segundo: 0, 0, -161, -579, -1.157, -1.800, -2.865, -4.371, -5.717, -6.300, -6.300.

Quebrou ou não deu:

- A Elevação do Rio Grande não aparece neste clipe. Está a 1.100 km da cadeia e a 1.200 km da costa mais próxima; com a névoa fixa de 0,0022 por km (99 % a 1.000 km), a regra de nunca ver de mapa e o fov horizontal de 33 graus, não há um quadro baixo que tenha costa, cadeia e Elevação. Fica para um segundo clipe da 001 (câmera sobre o platô de São Paulo olhando para o sul) ou para a névoa virar parâmetro por lugar.
- A costa a 400 km está com 54 % de névoa: o herói lê, mas é escuro. Proposta para a cena, não aplicada aqui (a cena não é deste papel): `nevoa_por_km` opcional no `lugar.json`, lido pelo `app.js` no lugar de `LOOK.nevoa`; para a 001, 0,0014 daria 27 % a 400 km e 47 % a 570 km.
- Um ponto ciano brilhante no topo do primeiro banco (visível de 3 s em diante): o nó mais alto ali é -2,6 m, e a Catmull-Rom bicúbica do shader passa de +36 m nessa vizinhança (overshoot de 38,8 m, medido com a mesma fórmula do GLSL); `land = smoothstep(0, 20, h)` então pinta o ponto de terra. É dado mais interpolação, não a câmera. Conserto é um clamp anti-ringing em `alturaCR` (proposto nos avisos da entrega).
- Os montes têm facetas verticais: a malha é 1024 x 488 segmentos (4,9 x 9,1 km) pelo orçamento de 1 M de triângulos, enquanto os texels têm 2,45 km. As linhas vêm da textura, a silhueta vem da malha.
- A serra atrás da costa é o GMRT a 1,9 km por nó (a 001 não usa Copernicus): lê como massa recortada com contornos, sem a forma fina da Serra do Mar. Vale para esta escala.
- Os nomes dos bancos (Besnard, Vitória, Jaseur, Davis, Columbia) foram atribuídos pela posição; nenhum foi conferido em fonte primária hoje. No vídeo não entra nome nenhum.

Ferramentas de apoio (fora do repositório, no scratchpad da sessão): `t001.mjs` (amostrador do `terreno.png` em coordenadas de cena, mapas ASCII por faixa de profundidade, perfis) e `gerar-camera-001.mjs` (keyframes em lon/lat/altura real/rumo/inclinação, projeção dos marcos na tela com distância e névoa, gravação do `camera.json` e do `lugar.json`). Se forem úteis para a 002 ou para os próximos lugares, vale trazê-los para `scripts/`.

## 14/10/2026 (tarde): a cena mudou, o MP4 ficou velho

Nota do corretor da revisão da 002 (detalhe em `lugares/002-vitoria-trindade/DIARIO.md`): os dois avisos desta entrega entraram em `web/app.js`. O clamp anti-ringing na Catmull-Rom (aviso 2) está no `alturaCR` e tira o ponto ciano do topo do banco; `nevoa_por_km` (aviso 1) é lido do `lugar.json`, mas não foi posto no `lugar.json` da 001 (0,0014 é a sugestão desta entrada; sem recaptura não dá para julgar a costa). A água também mudou (alpha por Fresnel, 0,9 no rasante; relevo submerso se extingue com a profundidade): o relevo submerso que aparecia "fraco através da água" em t = 0 agora fica escondido até a água descer. O reflexo passou a usar uma malha com um quarto dos segmentos (62.464 triângulos; a 001 desenha 1.061.904 por quadro no total, antes passava de 2 milhões). Dois quadros conferidos com a cena nova (`captura/saida/001-brasil-sem-mar/rev/`, t = 0 e 6 s): a costa continua legível em t = 0 e o banco em t = 6; o `camera.json` não mudou. O MP4 de 10 s desta entrada foi capturado com a cena de antes: recapturar (106 s) antes de postar, de preferência decidindo o `nevoa_por_km`. O `terreno.json` foi regravado do cache em 14/10 (citação exata do GMRT, campo `clampados`); o `terreno.png` é byte a byte o mesmo.

## 14/10/2026, tarde: névoa por lugar aplicada

`nevoa_por_km: 0,0014` no `lugar.json` (o valor sugerido na entrada anterior: 27 % de névoa a 400 km em vez de 54 %). Quadros 0, 3, 6 e 9 s olhados ao lado dos de névoa padrão: a costa no horizonte fica um pouco mais legível, mas o quadro continua escuro e o herói é uma faixa fina no horizonte. Fica registrado como limite da 001 com câmera baixa e névoa só; a decisão (segundo clipe do platô olhando para o sul, ou câmera alta aceitando leitura de mapa no post de lançamento do X) é do Victor. MP4 recapturado com a cena nova (crista só em encosta suave, albedo da terra pela metade, clamp anti-ringing, água por Fresnel com extinção).
