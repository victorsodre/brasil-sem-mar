# Captura determinística

Exporta a cena da página (`window.__bsm`) como sequência PNG no tamanho do Short e como MP4, sempre pelo relógio da cena (`setTime(t)`), nunca pelo relógio de parede. Mesmo `t`, mesmo quadro: o próprio comando prova isso recapturando 3 quadros numa página nova e comparando os bytes.

Uma pilha só: Node 22+, Playwright 1.61.0 (Chromium com Metal) e `ffmpeg` no PATH. Sem build, sem chave.


## Arquivos

| Arquivo | O que faz |
|---------|-----------|
| `capture.mjs` | sequência `q_000001.png...`, MP4 e `relatorio.json`; pega o cadeado da máquina e o mutex do headless |
| `quadro.mjs` | um quadro só (prévia rápida); só o mutex do headless |
| `comum.mjs` | peças compartilhadas: argumentos, cadeados, servidor, navegador, espera da cena |
| `comum.test.mjs` | testes dos cadeados, argumentos e URL (`node --test captura/comum.test.mjs`, sem navegador) |
| `stub/index.html` | página mínima com a API `window.__bsm` (quadrado neon que anda com `t`) para testar a captura sem a cena de verdade |
| `saida/` | o que sai (gitignored) |


## Uso

```
node captura/capture.mjs <slug> [--fps 30] [--de 0] [--ate 10] [--largura 1080] [--altura 1920]
                                [--saida captura/saida/<slug>] [--url ...] [--espera-max 120] [--timeout 180]
node captura/quadro.mjs  <slug> [--t 0] [--largura 1080] [--altura 1920] [--saida arquivo.png] [--url ...] [--timeout 180]
```

- `--de` e `--ate` em segundos; o intervalo é meio-aberto: `--de 0 --ate 1 --fps 10` dá 10 quadros (t = 0,0 a 0,9), e segmentos emendam sem repetir quadro. `--ate fim` vai até `window.__bsm.duration()`.
- `--url` aponta para uma variante: um caminho dentro do repo (`/captura/stub/index.html`, servido pelo `scripts/serve.mjs` que o comando sobe sozinho numa porta livre) ou um `http(s)://...` de um servidor já no ar (aí nenhum servidor é aberto). Sem `--url`, a página é `/index.html`. Os parâmetros `lugar=<slug>` (se não vier na URL), `t=<de>` e `capture=1` entram sempre.
- `--t` do `quadro.mjs` aceita lista (`0,12,30`); aí `--saida` é uma pasta e sai um `quadro-<t>s.png` por tempo.
- Viewport 1080x1920 com `deviceScaleFactor` 1; `--largura` e `--altura` têm de ser pares (yuv420p).
- Saída do `capture.mjs`: `q_000001.png` em diante, `<slug>-<de>s-<ate>s.mp4` e `relatorio.json`. Quadros `q_*.png` antigos na pasta são apagados antes (senão o ffmpeg emendaria a sequência velha).
- Código de saída: 0 tudo certo; 2 quando o determinismo falhou, o MP4 não bate com o pedido ou a página registrou erro (no `quadro.mjs`); 1 erro de execução.

Exemplos:

```
node captura/quadro.mjs 002-vitoria-trindade --t 12
node captura/capture.mjs 002-vitoria-trindade --de 0 --ate fim
node captura/capture.mjs 002-vitoria-trindade --de 0 --ate 1 --fps 10 --url http://127.0.0.1:8765/
```


## Chromium

`chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })`: GPU de verdade, nunca SwiftShader. Playwright não trata SIGINT por conta própria aqui (`handleSIGINT: false`): o comando fecha navegador, servidor e cadeados na ordem certa e sai com 130.

Erros da página (`pageerror`, `console.error`, requisição que falhou, HTTP 4xx/5xx) vão para `erros_pagina` no relatório e para o terminal. O `favicon.ico` que o Chromium pede sozinho é ignorado.


## Cadeados

Dois diretórios em `/tmp`, cada um com um arquivo `pid` dentro. `mkdir` é atômico, por isso serve de cadeado.

| Cadeado | Quem usa | Espera |
|---------|----------|--------|
| `/tmp/ovictorlab-pesado.lock` | esteira dos Shorts (`produzir.py`) e `capture.mjs` | poll de 30 s, `--espera-max` minutos (default 120) |
| `/tmp/brasil-sem-mar-quadro.lock` | `capture.mjs` e `quadro.mjs` (um headless por vez na máquina) | poll de 5 s, até 10 min |

Regras, iguais ao `pesado()` do `produzir.py`: se o diretório existe e o `pid` está vivo, espera; se o `pid` morreu, confirma 1 s depois e remove; diretório sem `pid` há mais de 1 min é resto de processo que caiu e também sai. Ao fim, em erro e em SIGINT/SIGTERM o comando remove só o cadeado cujo `pid` é o dele. O `capture.mjs` pega primeiro o da máquina, depois o mutex; o `quadro.mjs` só o mutex.

`BSM_LOCK_DIR=/tmp/bsm-teste.lock` troca o caminho do cadeado da máquina. É SÓ para testes: um teste nunca pode ficar esperando a esteira de verdade terminar um render. Nunca use a variável para pular a fila num render de verdade.


## relatorio.json

Campos principais: `quadros`, `fps`, `de`, `ate`, `duracao_s`, `url`, `tempos_ms` (`carga_pagina`, `cena_pronta`, `sequencia`, `ffmpeg`, `total` e `por_quadro` com média, mediana, p95 e máximo de `set_time` e `screenshot`), `lista` (um registro por quadro: `t`, arquivo, tempos, bytes, sha256), `determinismo` (`quadros` recapturados, `bytes_diferentes`, `ok`, `comparacoes` com `pixels_diferentes` quando os bytes diferem), `metrics` e `estado_final` da cena, `erros_pagina`, `mp4` (comando do ffmpeg, bytes, `ffprobe` com largura, altura, quadros, pix_fmt e duração), `cadeado` (caminhos, `de_teste`, quanto esperou) e `ambiente` (Node, Chromium).


## Teste

```
node --test scripts/serve.test.mjs captura/comum.test.mjs
node captura/quadro.mjs stub --t 5 --url /captura/stub/index.html
BSM_LOCK_DIR=/tmp/bsm-teste.lock node captura/capture.mjs stub --url /captura/stub/index.html --de 0 --ate 1 --fps 10
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=width,height,nb_read_frames -of default=nw=1 captura/saida/stub/stub-0s-1s.mp4
```

Esperado: 1080x1920, 10 quadros, `determinismo.bytes_diferentes` = 0 no `relatorio.json`, nenhum diretório em `/tmp/bsm-teste.lock` nem `/tmp/brasil-sem-mar-quadro.lock` depois.
