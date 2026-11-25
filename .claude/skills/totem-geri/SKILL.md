---
name: totem-geri
description: Manutenção e evolução do projeto Totem Geri Cabeleireiros (repositório TotenGeri) - página estática no GitHub Pages com tela inicial (botões Horizontal/Vertical), slideshow em tela cheia de fotos e vídeos numa TV/totem da barbearia, QR code, modo offline (Service Worker), editor de textos sobrepostos que gera "Markdown do totem" para comentários do Instagram, e sincronização com o Instagram @geri.cabeleireiros (#totemgeri) via GitHub Actions. Use SEMPRE que o usuário falar em totem, toten, Geri, barbearia do Geri, slideshow da TV, orientação vertical/rotação, textos sobrepostos, efeitos, editor, Markdown do post, #totemgeri, QR code, offline/cache, mídias do Instagram, media.json, posts.json, config.json, token do Instagram ou deploy no Pages deste projeto - mesmo em tarefas pequenas, pois há decisões não óbvias no código.
---

# Totem Geri Cabeleireiros

Página estática no GitHub Pages (`https://renancr176.github.io/TotenGeri/`) que roda numa Smart TV usada como totem. Cliente: barbearia **Geri Cabeleireiros**, Instagram `@geri.cabeleireiros`.

## Fluxo do usuário

1. **Tela inicial** (`#home`): botões **Horizontal** e **Vertical** (com escolha "TV girada para direita (90) / esquerda (270)"), botão **Retomar última exibição** (aparece quando há sessão salva e fica destacado quando está offline) e "Opções da exibição" (salvas no localStorage).
2. O clique chama `requestFullscreen()` **de forma síncrona dentro do handler** (exigência dos navegadores) e entra em `body.mode-display rot-N fit-X`.
3. Exibição: foto por `duration` (12 s; o usuário achou 8 s rápido demais) ou mais, se os textos precisarem (`TotemOverlay.minDuration + 0.5`). Vídeo passa inteiro (`maxVideo=0`). QR code no canto inferior direito do stage. Esc/Backspace/10009 (Tizen)/461 (webOS) voltam ao início. Sair da tela cheia também volta, mas só se ela foi de fato ativada.
4. **Editor** (`#editor`, mesma página, usado no celular): carrega o post pela URL (busca em `posts.json` pelo shortcode) ou por um arquivo local. Permite adicionar textos, arrastá-los (pointer events), ajustar propriedades, pré-visualizar e copiar o Markdown.
5. `?auto=1&rotate=90` ou `?auto=resume` iniciam direto, sem tela cheia (para usar como página inicial da TV).

## Arquitetura (por que é assim)

- **Sem backend.** Tudo que é "servidor" roda no GitHub Actions (`deploy.yml`: push na main + cron de hora em hora `17 * * * *`).
- **Instagram não pode ser lido pelo navegador** (bloqueio/CORS, e a Basic Display API foi desligada em 04/12/2024). `scripts/build.mjs` usa a **Instagram API with Instagram Login** (`graph.instagram.com`) com o secret `INSTAGRAM_ACCESS_TOKEN`, **baixa** as mídias (as URLs do CDN expiram) para `_site/media/instagram/` e gera:
  - `media.json`: o que a TV exibe. Só posts **marcados** com `instagram.tag` (`#totemgeri`) na legenda ou em um **comentário do próprio perfil**, quando `requireTag` está ativo. Carrosséis viram um item por slide, com `overlays` filtrados por `n`.
  - `posts.json`: catálogo de **todos** os posts recentes (marcados ou não) para o editor.
  - Textos: o comentário do próprio perfil mais recente com tag/overlays tem prioridade sobre a legenda.
  - Comentários exigem a permissão `instagram_business_manage_comments`. Se falhar, o build avisa e usa só as legendas.
  - Não pedir o campo `shortcode` na API: ele é derivado do `permalink` (um campo inválido derruba a chamada inteira).
  - Se o token existe e o Instagram falha, o build **falha de propósito**, para o Pages manter o último deploy bom.
  - `refresh-instagram-token.yml` renova o token (60 dias) nos dias 1 e 15 via secret `GH_PAT`.
- **`assets/media/`**: fonte manual. O build varre a pasta, que fica em ordem alfabética numérica (ignora `_*` e `.*`), acrescenta `?v=<sha1>` ao src (cache offline invalida quando o arquivo é trocado) e lê textos de um `.md` com o mesmo nome (`foto.md` ou `foto.jpg.md`).
- `_site/` é gerado e fica no `.gitignore`.

## Formato "Markdown do totem" (`js/format.js`, UMD: navegador + `require` no build)

```
#totemgeri
[Corte + Barba](x=50 y=20 s=8 r=-8 f=bebas c=ffffff b=1 i=1 o=000000 w=3 sh=1 bg=e0a526 in=slide-down out=fade t=0-6 n=2)
```
- x/y: centro em % da **mídia**. s: fonte em % da **altura da mídia**. Assim o texto fica igual em qualquer tela.
- `r`: rotação em graus (-180..180), aplicada no `.ov` junto com o translate. Os efeitos animam o `.ov-t` interno, então não conflitam. `f`: id da fonte (`FONTS` em format.js; uma fonte desconhecida vira `sans`). `i=1`: itálico.
- Cores **sem `#`**, senão o Instagram cria hashtags. Valores padrão são omitidos na serialização.
- `t=1.5` vai de 1.5 s até o fim; `t=1-6` vai de 1 a 6 s. `n` é o slide do carrossel (sem `n` = todos).
- Texto: `\n` quebra a linha, `\]`, `\[` e `\\` escapam. Links `[x](http…)` são ignorados.
- Efeitos (`EFFECTS`): none, fade, slide-up/down/left/right, pop, zoom, bounce, flip, blur. Cada um tem `fx-in-*`/`fx-out-*` em `css/style.css`, com keyframes padrão e `-webkit-`, duração 0.7 s = `TotemOverlay.FX_DURATION`.
- Para adicionar uma propriedade: `DEFAULTS`, `parseParams`, `serializeOverlay` (format.js), `styleItem` (overlay.js), campo no `#edProps` + `renderProps`/`readProps`/`bindProps` (editor.js), README.

## Renderização dos textos (`js/overlay.js`)

- Compartilhada entre TV e editor, para a pré-visualização ser fiel.
- `.ov-box` é posicionado sobre o retângulo real da mídia (`fitRect` contain/cover) dentro do stage, que no modo vertical já está girado.
- `.ov` usa `white-space: pre` de propósito. Elementos absolutos em `left:50%` só teriam metade da largura e quebrariam o texto sozinhos. As quebras de linha são só as que o usuário digitar.
- Fases: `before` → `in` (animação de entrada) → `out` (nos últimos 0.7 s) → `after`. `showStatic()` é o modo de edição.
- No player, um `setInterval` de 100 ms sincroniza os textos com `video.currentTime` ou com o tempo decorrido da foto.

## Fontes

- Ficam em `assets/fonts/*.woff2` (Fontsource, subconjunto latin, licença OFL), com `@font-face` em `css/fonts.css` (família "Totem X", `font-display: block`). Também estão em `SHELL_FILES` do `sw.js`, para funcionarem offline. Negrito usa 700/800 quando existe; nas outras fontes o navegador sintetiza. O itálico é sempre sintetizado.
- Para adicionar uma fonte: baixe `https://cdn.jsdelivr.net/npm/@fontsource/<nome>@5/files/<nome>-latin-<peso>-normal.woff2`, crie o @font-face, acrescente em `FONTS` e em `SHELL_FILES`, e troque a versão de `SHELL_CACHE`.

## Editor: arrastar e girar

- `showStatic()` (editor.js) coloca a alça `.ed-rot` dentro do `.ov` selecionado, então ela gira junto. No pointerdown sobre a alça, o editor calcula o ângulo em relação ao centro do texto (`getBoundingClientRect`, que não muda com a rotação), com ímã de 4° em múltiplos de 45°.
- Negrito e itálico são botões `label.toggle`. O estado visual usa a classe `on` (via `syncToggles`), e não `:has()`, por compatibilidade.

## Offline

- `sw.js`: arquivos do site em **rede primeiro**, com o cache como reserva (chave sem `?query`, porque `media.json?_=timestamp`). Mídias (`/assets/media/`, `/media/instagram/`) em **cache primeiro** (`totem-media-v1`), com respostas **206 para requisições Range** (necessário para vídeo).
- `js/offline.js`: ao iniciar a exibição, `precache()` baixa tudo sequencialmente para o Cache Storage (toast "Salvando para uso offline x/y") e remove o que saiu da playlist. Sem Service Worker, usa blob URLs em memória (limite de 400 MB). Também guarda `lastSession` (rotação) e `lastManifest` no localStorage.
- Ao mudar a lista de arquivos do site, atualize `SHELL_FILES` em `sw.js`. Ao mudar a estratégia de cache, troque a versão (`-v1`).

## Compatibilidade

- `player.js`, `overlay.js`, `format.js` e `offline.js` são **ES5** (IIFE, `var`, XHR, `['catch']`) para TVs Tizen/webOS antigas. No CSS da exibição, evitar `inset`, `min()`/`clamp()`, `aspect-ratio` e `gap`. O editor roda em celular e pode ser um pouco mais moderno (usa pointer events).
- QR code: `js/vendor/qrcode.js` (qrcode-generator 1.4.4, MIT), embutido no projeto para funcionar offline.

## Comandos e testes

```bash
node scripts/build.mjs            # gera _site/ (Node 18+, CI usa 22)
npx serve _site                   # testar localmente
for f in js/*.js sw.js; do node --check $f; done
```
Teste de navegador: puppeteer-core com o Chrome instalado (`C:/Program Files/Google/Chrome/Application/chrome.exe`), servindo `_site` num servidor estático local. Os pontos que valem verificar: botões H/V, Esc, QR, fases do overlay, arrastar no editor, `setOfflineMode(true)` + reload + "Retomar".

## Fluxo de trabalho combinado com o usuário

- Pode **commitar e dar push direto na `main`** após cada alteração (autorizado).
- Skills do projeto ficam em `.claude/skills/` **dentro do repositório**. Atualize esta skill quando surgirem decisões novas.
- Documentação, interface e commits em **português**.
- O `gh` CLI não está instalado na máquina do usuário. Passos no GitHub (Pages, secrets) são feitos pela interface web (README).
- Pendente do lado do cliente: converter o Instagram em conta Profissional e gerar o token.
