---
name: totem-geri
description: Manutenção e evolução do projeto Totem Geri Cabeleireiros (repositório TotenGeri) - página estática no GitHub Pages que exibe slideshow de fotos e vídeos numa TV/totem da barbearia, com orientação horizontal/vertical e sincronização com o Instagram @geri.cabeleireiros via GitHub Actions. Use SEMPRE que o usuário falar em totem, toten, Geri, barbearia do Geri, slideshow da TV, orientação vertical/rotação, mídias do Instagram, media.json, config.json, token do Instagram ou deploy no Pages deste projeto - mesmo em tarefas pequenas, pois há decisões não óbvias no código.
---

# Totem Geri Cabeleireiros

Página web estática publicada no GitHub Pages (`https://renancr176.github.io/TotenGeri/`) que roda em loop numa Smart TV usada como totem. Cliente: barbearia **Geri Cabeleireiros**, Instagram `@geri.cabeleireiros`.

## Arquitetura (por que é assim)

- **Sem backend.** O GitHub Pages só serve arquivos. Toda lógica "de servidor" roda no GitHub Actions no momento do build.
- **Instagram não pode ser lido direto do navegador**: bloqueio de scraping/CORS, e a Basic Display API foi descontinuada em 04/12/2024. Por isso:
  - `scripts/build.mjs` usa a **Instagram API with Instagram Login** (`graph.instagram.com/me/media`) com o secret `INSTAGRAM_ACCESS_TOKEN`, **baixa** os arquivos (as URLs do CDN do Instagram expiram) para `_site/media/instagram/` e gera `_site/media.json`.
  - O workflow `deploy.yml` roda em push na `main`, **a cada hora** (cron `17 * * * *`) e manualmente.
  - Se o token existe e o Instagram falha, o build **falha de propósito**, para o Pages manter o último deploy bom.
  - `refresh-instagram-token.yml` renova o token (válido 60 dias) nos dias 1 e 15 e regrava o secret via `gh secret set` usando o secret `GH_PAT` (fine-grained PAT com *Secrets: read/write*).
  - Exige conta Instagram **Profissional** (Empresa/Criador). O app Meta pode ficar em modo desenvolvimento.
- **Pasta `assets/media/`** é a fonte manual. O GitHub Pages não lista diretórios, então o build varre a pasta e escreve no `media.json`. Ordem alfabética (numérica), arquivos começando com `_` ou `.` são ignorados.
- O diretório `_site/` é gerado e fica no `.gitignore`. Nunca commitar.

## Player (`js/player.js`)

- **JavaScript ES5 de propósito** (IIFE, `var`, XHR, sem módulos, sem `?.`, sem async/await), para rodar em navegadores antigos de TVs Tizen/webOS. Manter esse estilo. No CSS, evitar `inset`, `min()`/`clamp()`, `aspect-ratio` e `gap` em flex (exceto no painel, que é só um extra).
- Configuração em camadas: `DEFAULTS` < `config.json` < `localStorage` (painel na TV) < **parâmetros da URL**. Uma chave nova precisa ir em `DEFAULTS`, em `normalize()`, no `config.json` e, se for editável, no painel (`index.html` + `openSettings`/`saveSettings`), além do README.
- **Rotação**: a TV física fica deitada, mas continua enviando sinal 16:9. A classe `body.rot-90|180|270` gira o `#stage` com `transform`, trocando largura e altura (`100vh` x `100vw`). `rotate=90` é TV girada no sentido horário. Se aparecer de cabeça para baixo, o certo é 270.
- Duas camadas (`#layerA`/`#layerB`) com crossfade de opacidade. A próxima mídia só aparece depois de carregar (`onload`/`onplaying`).
- Vídeos começam **mudos** (autoplay com som é bloqueado). Se o `play()` com som falhar, tenta de novo mudo. Há uma trava de 20 s para vídeo que não inicia e um limite de 600 s.
- Fotos no modo `contain` ganham um fundo desfocado (`.bg`) com a mesma imagem.
- `media.json` é recarregado a cada `refreshMinutes`. A nova playlist entra **ao fim da volta atual**. A página faz um reload diário às 4h.
- Painel de configuração: Enter/OK, tecla C, tecla de menu ou duplo clique. Esc/Backspace/Return (10009 no Tizen) fecha.

## Comandos

```bash
node scripts/build.mjs            # gera _site/ (precisa de Node 18+, CI usa 22)
npx serve _site                   # testar localmente
node --check js/player.js         # checagem de sintaxe
```

## Fluxo de trabalho combinado com o usuário

- Pode **commitar e dar push direto na `main`** automaticamente após cada alteração (o usuário autorizou).
- Toda skill criada para este projeto fica em `.claude/skills/` **dentro do repositório**. Atualize esta skill quando surgirem decisões novas.
- Documentação e mensagens de commit em **português**.
- O `gh` CLI não está instalado na máquina do usuário. Passos no GitHub (ativar Pages, secrets) são feitos pela interface web e estão descritos no README.

## Checklist ao alterar

1. Manter a compatibilidade ES5 no `player.js`.
2. Rodar `node --check js/player.js` e `node scripts/build.mjs`.
3. Atualizar o README (tabela de parâmetros) e esta skill se mudar o comportamento.
4. Commit em português e push.
