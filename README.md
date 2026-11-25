# Totem Geri Cabeleireiros

Página web estática (GitHub Pages) que exibe, em tela cheia, um slideshow de fotos e vídeos numa TV usada como totem na barbearia **Geri Cabeleireiros** ([@geri.cabeleireiros](https://www.instagram.com/geri.cabeleireiros)).

- Fotos e vídeos vêm de **duas fontes**, que podem ser usadas juntas:
  1. a pasta [`assets/media/`](assets/media/) do repositório (envio manual);
  2. o **Instagram** do cliente, sincronizado automaticamente **a cada hora** pelo GitHub Actions.
- Funciona com a **TV na horizontal ou deitada de lado (vertical)**: a página gira o conteúdo, então não é preciso mexer na configuração da TV.
- Transição suave, fundo desfocado em fotos com proporção diferente da tela, vídeos tocam até o fim (mudos por padrão, porque as TVs bloqueiam autoplay com som).
- A página procura mídias novas a cada 30 minutos, sem precisar recarregar a TV.

## Endereço

Depois de publicado: `https://renancr176.github.io/TotenGeri/`

| Situação da TV | URL |
|---|---|
| TV normal (horizontal) | `.../TotenGeri/` |
| TV deitada, girada **para a direita** (sentido horário) | `.../TotenGeri/?rotate=90` |
| TV deitada, girada **para a esquerda** (anti-horário) | `.../TotenGeri/?rotate=270` |

Se a imagem aparecer de cabeça para baixo, troque `90` por `270` (ou o contrário).

### Outros parâmetros de URL

| Parâmetro | Valores | Padrão |
|---|---|---|
| `rotate` | `0`, `90`, `180`, `270` | `0` |
| `duration` | segundos de cada foto | `8` |
| `maxVideo` | máximo de segundos por vídeo (`0` = inteiro) | `0` |
| `fit` | `contain` (mostra inteiro) / `cover` (preenche, corta bordas) | `contain` |
| `source` | `all` / `instagram` / `local` | `all` |
| `shuffle` | `1` para ordem aleatória | `0` |
| `footer` | `0` para esconder o rodapé com o @ | `1` |
| `sound` | `1` para tentar tocar com som | `0` |

Exemplo: `https://renancr176.github.io/TotenGeri/?rotate=90&duration=10&shuffle=1`

### Painel de configuração na própria TV

Aperte **OK/Enter** no controle remoto (ou a tecla **C**, ou dê duplo clique) para abrir o painel. As escolhas ficam salvas no navegador da TV. Os parâmetros da URL sempre têm prioridade.

Outras teclas: **→** pula para a próxima mídia; **F** ou clique entra em tela cheia.

## Como adicionar fotos e vídeos manualmente

1. No GitHub, abra a pasta `assets/media` → **Add file** → **Upload files**.
2. Arraste as fotos (`.jpg`, `.png`, `.webp`…) e vídeos (`.mp4` H.264 é o mais compatível com TVs).
3. Clique em **Commit changes**. Em ~1 minuto o site é republicado.

Dicas:
- A ordem é alfabética. Use prefixos como `01-`, `02-`… para controlar a sequência.
- Arquivos cujo nome começa com `_` são ignorados (útil para "desligar" uma mídia sem apagar).
- Prefira fotos de até ~3 MB e vídeos curtos (até ~50 MB). O GitHub recusa arquivos acima de 100 MB.
- Para apagar, abra o arquivo no GitHub → menu `…` → **Delete file**.

## Configuração única (dono do repositório)

### 1. Ativar o GitHub Pages
**Settings → Pages → Build and deployment → Source: _GitHub Actions_.**
Depois, em **Actions**, rode o workflow *Publicar totem no GitHub Pages* (ou faça qualquer push).

### 2. (Opcional, recomendado) Conectar o Instagram

O Instagram não permite que uma página estática leia o perfil diretamente. Usamos a API oficial
(**Instagram API with Instagram Login**). O GitHub Action baixa as mídias e as publica junto com o site,
e o token fica guardado em segredo, nunca aparece na página.

Pré-requisitos:
- A conta **@geri.cabeleireiros** precisa ser **Profissional** (Empresa ou Criador de conteúdo). No app do Instagram: *Configurações → Tipo de conta e ferramentas → Mudar para conta profissional* (grátis).

Passo a passo para gerar o token:
1. Acesse <https://developers.facebook.com/apps> com uma conta Facebook de desenvolvedor → **Criar app** → caso de uso *"Gerenciar mensagens e conteúdo no Instagram"* (tipo **Empresa**).
2. No app, vá em **Instagram → Configuração da API com login do Instagram**.
3. Em *"Gerar tokens de acesso"*, clique em **Adicionar conta**, entre com o login do **@geri.cabeleireiros** e autorize. Se pedir, adicione a conta em *Funções do app → Testadores do Instagram* e aceite o convite no Instagram (*Configurações → Apps e sites*).
4. Clique em **Gerar token** e copie o valor. É um token **longo**, válido por 60 dias.
5. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Nome: `INSTAGRAM_ACCESS_TOKEN`
   - Valor: o token copiado.
6. Rode o workflow *Publicar totem no GitHub Pages* manualmente para testar.

O app pode continuar em **modo de desenvolvimento**. Não é preciso passar pela revisão da Meta, porque só a própria conta do cliente é lida.

### 3. Renovação automática do token (para não expirar em 60 dias)

1. Crie um **Fine-grained personal access token** em <https://github.com/settings/personal-access-tokens>
   com acesso **apenas a este repositório** e permissão **Secrets: Read and write**.
2. Salve-o como secret `GH_PAT` neste repositório.

O workflow *Renovar token do Instagram* roda nos dias 1 e 15 de cada mês e atualiza o `INSTAGRAM_ACCESS_TOKEN` sozinho.

### Controlando o que vai do Instagram para a TV

Em [`config.json`](config.json), bloco `instagram`:
- `limit`: quantas publicações recentes usar (padrão 30). Carrosséis contam como 1 publicação, mas todas as fotos entram.
- `includeVideos`: `false` para ignorar Reels/vídeos.
- `excludeTag`: posts com essa hashtag na legenda **não** vão para a TV (padrão `#naototem`).
- `enabled`: `false` desliga o Instagram mesmo com o token configurado.

`order`: `instagram-first` (padrão) ou `local-first`.

## Rodando localmente

```bash
node scripts/build.mjs           # gera ./_site (Node 18+)
npx serve _site                  # ou: python -m http.server -d _site
```

Com Instagram: `INSTAGRAM_ACCESS_TOKEN=... node scripts/build.mjs`.

## Estrutura

```
index.html                  página do player
css/style.css               layout, rotação e painel
js/player.js                lógica do slideshow (JS compatível com TVs antigas)
config.json                 configurações padrão do totem e do Instagram
assets/media/               fotos/vídeos enviados manualmente
scripts/build.mjs           monta _site/ e media.json (local + Instagram)
.github/workflows/          deploy no Pages (push + a cada hora) e renovação do token
.claude/skills/totem-geri/  skill do Claude Code com o conhecimento do projeto
```

## Dicas para a TV

- Use o navegador da própria Smart TV ou um TV Box/Chromecast/Fire TV com navegador, abrindo a URL acima.
- Desative o **descanso de tela / economia de energia** da TV. A página pede *Wake Lock* quando o navegador suporta, mas muitas TVs ignoram.
- Se a TV tiver opção de "página inicial" ou "abrir ao ligar" no navegador, configure a URL do totem.
