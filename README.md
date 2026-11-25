# Totem Geri Cabeleireiros

Página web estática (GitHub Pages) que exibe, em tela cheia, um slideshow de fotos e vídeos numa TV usada como totem na barbearia **Geri Cabeleireiros** ([@geri.cabeleireiros](https://www.instagram.com/geri.cabeleireiros)).

**Endereço:** `https://renancr176.github.io/TotenGeri/`

## Como funciona

1. A página abre numa **tela inicial** com dois botões: **Horizontal** (TV normal) e **Vertical** (TV deitada de lado). Ao escolher, a página entra em **tela cheia**, sem as bordas do navegador, e começa a exibição.
   - No modo vertical, a página gira o conteúdo, então não é preciso mexer na TV. Se a imagem ficar de cabeça para baixo, troque a opção "girada para a direita/esquerda".
   - **Fotos** ficam 8 segundos na tela (ou mais, se os textos dela precisarem). **Vídeos** passam inteiros e depois trocam.
   - Um **QR code** pequeno no canto inferior direito leva ao Instagram da barbearia.
   - **Esc / Voltar** no controle retorna à tela inicial. **→** pula para a próxima mídia.
2. Abaixo dos botões fica o **Editor de textos para os posts**, que o cliente usa no celular. Veja a seção abaixo.
3. **Funciona offline**: ao entrar na exibição, todas as fotos e vídeos são salvos no aparelho (Service Worker + Cache Storage). Se a internet cair, o totem continua rodando. Se a TV for reiniciada sem internet, a tela inicial mostra o botão **⟲ Retomar última exibição**.

## De onde vêm as fotos e vídeos

- **Instagram** (automático, a cada hora): entram **somente os posts marcados com `#totemgeri`** na legenda ou em um comentário do próprio perfil. Posts sem a marcação ficam só no Instagram.
- **Pasta [`assets/media/`](assets/media/)** (manual): todos os arquivos da pasta entram.

## Editor de textos (para o cliente)

1. Cole a URL do post (ex.: `https://www.instagram.com/p/ABC123/`) e toque em **Carregar**. Também dá para **escolher a foto/vídeo do aparelho**, útil antes de publicar ou enquanto o post ainda não sincronizou (até 1 h).
2. Toque em **+ Texto**, digite e **arraste o texto** até a posição desejada. Para **girar**, arraste a bolinha **⟳**
   acima do texto (ela "gruda" em 0°, 45°, 90°…) ou use o controle de rotação. Dá para ajustar:
   **fonte** (10 opções, de moderna e condensada a manuscrita e pincel), tamanho, cor, **negrito**, **itálico**,
   borda (cor e espessura), sombra, faixa de fundo,
   **tempo** (aparece aos X s, some aos Y s) e **efeito de entrada e saída**
   (fade, deslizar para cima/baixo/esquerda/direita, pop, zoom, quicar, flip, desfocar).
   Em carrosséis, cada texto pode valer para um slide ou para todos.
3. Toque em **▶ Pré-visualizar** para ver exatamente como vai ficar na TV.
4. Toque em **📋 Copiar** e cole o texto como **comentário** no post (ou na legenda).

Para exibir um post **sem textos**, basta comentar `#totemgeri`.
Para **tirar** um post do totem, apague o comentário (ou a hashtag da legenda).

### Formato gerado ("Markdown do totem")

```
#totemgeri
[Corte + Barba](x=50 y=20 s=8 r=-8 f=bebas b=1 i=1 o=000000 w=3 in=slide-down out=fade t=0-6)
[Só R$ 60](x=50 y=80 s=10 c=e0a526 in=pop out=pop t=1.5)
```

Cada `[texto](parâmetros)` é um texto sobreposto. As cores vão sem `#` para o Instagram não transformá-las em hashtag. A referência completa dos parâmetros está em [js/format.js](js/format.js).
O botão **Carregar textos do Markdown acima** permite colar um Markdown já existente para editar.

## Adicionar fotos e vídeos manualmente

1. No GitHub, abra a pasta `assets/media` → **Add file** → **Upload files**.
2. Envie fotos (`.jpg`, `.png`, `.webp`…) e vídeos (`.mp4` H.264 é o mais compatível com TVs).
3. **Commit changes**. Em cerca de 1 minuto o site é republicado.

- A ordem é alfabética. Use prefixos `01-`, `02-`…
- Arquivos que começam com `_` são ignorados.
- **Textos em arquivos locais:** crie um `.md` com o mesmo nome do arquivo (ex.: `promo.jpg` + `promo.md`) contendo o Markdown gerado pelo editor (use "Escolher foto/vídeo do aparelho").
- Prefira fotos de até ~3 MB e vídeos de até ~50 MB. O GitHub recusa arquivos acima de 100 MB.

## Configuração única (dono do repositório)

### 1. Ativar o GitHub Pages
**Settings → Pages → Build and deployment → Source: _GitHub Actions_.** Depois rode o workflow *Publicar totem no GitHub Pages* em **Actions**.

### 2. Conectar o Instagram

A conta **@geri.cabeleireiros** precisa ser **Profissional** (Empresa ou Criador de conteúdo, grátis). No app: *Configurações → Tipo de conta e ferramentas → Mudar para conta profissional*.

1. Em <https://developers.facebook.com/apps>, **Criar app** → caso de uso *"Gerenciar mensagens e conteúdo no Instagram"* (tipo **Empresa**).
2. No app: **Instagram → Configuração da API com login do Instagram**.
3. Em **Permissões**, garanta `instagram_business_basic` e **`instagram_business_manage_comments`**. A segunda é necessária para ler os comentários com `#totemgeri`. Sem ela, só a legenda é lida.
4. Em *Gerar tokens de acesso*, **Adicionar conta**, entre com o @geri.cabeleireiros e autorize. Se pedir, adicione a conta em *Funções do app → Testadores do Instagram* e aceite o convite no Instagram (*Configurações → Apps e sites*).
5. **Gerar token**, copie o valor (token longo, 60 dias).
6. No GitHub: **Settings → Secrets and variables → Actions → New repository secret** com nome `INSTAGRAM_ACCESS_TOKEN`.
7. Rode o workflow de publicação manualmente para testar. O log mostra quantos posts foram marcados.

O app pode ficar em **modo de desenvolvimento**, porque só a própria conta do cliente é lida.

### 3. Renovação automática do token

Crie um **Fine-grained personal access token** em <https://github.com/settings/personal-access-tokens> com acesso **apenas a este repositório** e permissão **Secrets: Read and write**. Salve-o como secret `GH_PAT`. O workflow *Renovar token do Instagram* renova o token nos dias 1 e 15 de cada mês.

### Ajustes em [`config.json`](config.json)

| Chave | Descrição | Padrão |
|---|---|---|
| `duration` | segundos de cada foto | `8` |
| `maxVideo` | máximo de segundos por vídeo (`0` = inteiro) | `0` |
| `fit` | `contain` (inteiro, fundo desfocado) / `cover` (preenche) | `contain` |
| `source` | `all` / `instagram` / `local` | `all` |
| `shuffle`, `sound` | ordem aleatória / som nos vídeos | `false` |
| `refreshMinutes` | de quanto em quanto tempo a TV procura mídias novas | `30` |
| `order` | `instagram-first` / `local-first` | `instagram-first` |
| `qr.enabled`, `qr.url`, `qr.label` | QR code no canto | Instagram do cliente |
| `instagram.tag` | hashtag que marca os posts | `#totemgeri` |
| `instagram.requireTag` | `false` = exibe todos os posts recentes | `true` |
| `instagram.readComments` | ler comentários do perfil | `true` |
| `instagram.limit` | quantos posts recentes verificar | `30` |
| `instagram.includeVideos` | incluir vídeos/Reels | `true` |

As opções de exibição também podem ser mudadas na própria TV em **Opções da exibição** (ficam salvas no navegador da TV).

### Iniciar automaticamente (página inicial da TV)

Se o navegador da TV permitir definir uma página inicial, use:
- `.../TotenGeri/?auto=resume`: retoma a última orientação usada;
- `.../TotenGeri/?auto=1&rotate=90`: vertical (`0` horizontal, `90`/`270` vertical).

Sem o clique no botão, o navegador não permite tela cheia automática. Muitos navegadores de TV já abrem sem bordas. Se não, um clique (OK) na tela ativa a tela cheia.

## Rodando localmente

```bash
node scripts/build.mjs           # gera ./_site (Node 18+)
npx serve _site                  # ou: python -m http.server -d _site
```

O Service Worker funciona em `localhost` e em HTTPS (GitHub Pages).

## Estrutura

```
index.html                  tela inicial, editor e área de exibição
sw.js                       Service Worker (offline)
css/style.css               layout, rotação, efeitos dos textos
css/fonts.css               @font-face das fontes dos textos
assets/fonts/               fontes .woff2 locais (OFL, via Fontsource) - funcionam offline
js/format.js                formato "Markdown do totem" (usado no navegador e no build)
js/overlay.js               renderização dos textos (TV e pré-visualização do editor)
js/offline.js               cache das mídias e última sessão
js/player.js                tela inicial + slideshow
js/editor.js                editor de textos
js/vendor/qrcode.js         gerador de QR code (MIT, Kazuhiko Arase)
config.json                 configurações
assets/media/               fotos/vídeos manuais (+ .md com textos)
scripts/build.mjs           monta _site/, media.json e posts.json
.github/workflows/          deploy (push + de hora em hora) e renovação do token
.claude/skills/totem-geri/  skill do Claude Code com o conhecimento do projeto
```

## Dicas para a TV

- Desative o **descanso de tela / economia de energia**. A página pede *Wake Lock*, mas muitas TVs ignoram.
- Abra a exibição pelo menos uma vez com internet, para salvar o conteúdo offline.
