#!/usr/bin/env node
/**
 * Gera o site estático em ./_site para o GitHub Pages.
 *
 *  1. Copia os arquivos do site (index.html, sw.js, css/, js/, config.json, assets/) para _site/
 *  2. Lista as fotos/vídeos de assets/media (ordem alfabética). Um arquivo .md com o mesmo
 *     nome (ex.: promo.jpg + promo.md) define textos sobrepostos no formato do totem.
 *  3. Se INSTAGRAM_ACCESS_TOKEN estiver definido, baixa as últimas publicações do Instagram
 *     (Instagram API with Instagram Login) para _site/media/instagram/.
 *     - Só vão para o totem os posts com a hashtag de config.json (instagram.tag, padrão #totemgeri)
 *       na legenda ou em um comentário do próprio perfil.
 *     - Os textos sobrepostos vêm do Markdown do totem no comentário (preferência) ou na legenda.
 *  4. Escreve _site/media.json (o que a TV exibe) e _site/posts.json (catálogo para o editor).
 *
 * Uso local:   node scripts/build.mjs
 *              INSTAGRAM_ACCESS_TOKEN=xxx node scripts/build.mjs
 *
 * Se o token estiver definido e o Instagram falhar, o build FALHA de propósito:
 * assim o GitHub Pages mantém a última publicação boa.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TotemFormat = require(path.join(ROOT, 'js', 'format.js'));

const OUT = path.join(ROOT, '_site');
const MEDIA_DIR = path.join(ROOT, 'assets', 'media');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.m4v', '.mov']);
const STATIC_ENTRIES = ['index.html', 'sw.js', 'css', 'js', 'assets', 'config.json'];

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function walk(dir) {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function toUrlPath(absPath, base = ROOT) {
  return path.relative(base, absPath).split(path.sep).map(encodeURIComponent).join('/');
}

async function shortHash(file) {
  const buf = await fs.readFile(file);
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
}

// ---------------- assets/media ----------------

async function localItems(tag) {
  const files = (await walk(MEDIA_DIR)).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  const items = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const base = path.basename(f);
    if (base.startsWith('.') || base.startsWith('_')) continue; // ignora ocultos/rascunhos
    const type = IMAGE_EXT.has(ext) ? 'image' : VIDEO_EXT.has(ext) ? 'video' : null;
    if (!type) continue;

    // textos: foto.md ou foto.jpg.md ao lado do arquivo
    let overlays = [];
    for (const md of [f.slice(0, -ext.length) + '.md', f + '.md']) {
      if (await exists(md)) {
        overlays = TotemFormat.parse(await fs.readFile(md, 'utf8'), tag).overlays;
        break;
      }
    }
    // ?v=hash: se o arquivo for trocado mantendo o nome, a TV baixa a versão nova
    const item = { type, src: `${toUrlPath(f)}?v=${await shortHash(f)}`, origin: 'local' };
    if (overlays.length) item.overlays = overlays;
    items.push(item);
  }
  return items;
}

// ---------------- Instagram ----------------

const IG = 'https://graph.instagram.com';
const IG_FIELDS = 'id,media_type,media_url,thumbnail_url,permalink,timestamp,caption,comments_count,' +
  'children{id,media_type,media_url,thumbnail_url}';

async function igGet(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body.error ? `${body.error.type || ''} ${body.error.code || ''}: ${body.error.message}` : `HTTP ${res.status}`;
    throw new Error(`Instagram API -> ${msg}`);
  }
  return body;
}

function extFromType(contentType, fallback) {
  if (!contentType) return fallback;
  if (contentType.includes('mp4')) return '.mp4';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('heic')) return '.heic';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  return fallback;
}

async function download(url, destNoExt, fallbackExt) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download falhou (HTTP ${res.status}) ${url.slice(0, 80)}…`);
  const ext = extFromType(res.headers.get('content-type'), fallbackExt);
  const dest = destNoExt + ext;
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function shortcodeOf(post) {
  return TotemFormat.shortcodeFromUrl(post.permalink) || post.id;
}

/** Comentários do próprio perfil (mais recente primeiro). Requer instagram_business_manage_comments. */
async function ownComments(post, token, username, state) {
  if (!state.commentsOk || !post.comments_count) return [];
  try {
    const url = `${IG}/${post.id}/comments?fields=id,text,username,timestamp&limit=50&access_token=${encodeURIComponent(token)}`;
    const page = await igGet(url);
    return (page.data || [])
      .filter((c) => !username || (c.username || '').toLowerCase() === username.toLowerCase())
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  } catch (err) {
    console.warn(`  ! não foi possível ler comentários (${err.message}). ` +
      'Verifique a permissão instagram_business_manage_comments. Usando só as legendas.');
    state.commentsOk = false;
    return [];
  }
}

async function instagramData(token, igCfg, tag) {
  const limit = Number(igCfg.limit) || 30;
  const requireTag = igCfg.requireTag !== false;
  const includeVideos = igCfg.includeVideos !== false;
  const outDir = path.join(OUT, 'media', 'instagram');
  await fs.mkdir(outDir, { recursive: true });

  const me = await igGet(`${IG}/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
  console.log(`  Instagram: conta @${me.username}`);

  // 1) coleta as publicações (com paginação)
  const posts = [];
  let url = `${IG}/me/media?fields=${encodeURIComponent(IG_FIELDS)}` +
    `&limit=${Math.min(limit, 50)}&access_token=${encodeURIComponent(token)}`;
  while (url && posts.length < limit) {
    const page = await igGet(url);
    posts.push(...(page.data || []));
    url = page.paging && page.paging.next;
  }

  const state = { commentsOk: igCfg.readComments !== false };
  const items = [];   // vai para media.json (totem)
  const catalog = []; // vai para posts.json (editor)

  for (const post of posts.slice(0, limit)) {
    // 2) marcação e textos: comentário do próprio perfil tem prioridade sobre a legenda
    const fromCaption = TotemFormat.parse(post.caption || '', tag);
    let tagged = fromCaption.tagged;
    let overlays = fromCaption.overlays;
    for (const c of await ownComments(post, token, me.username, state)) {
      const parsed = TotemFormat.parse(c.text || '', tag);
      if (parsed.tagged) tagged = true;
      if (parsed.overlays.length || parsed.tagged) { overlays = parsed.overlays.length ? parsed.overlays : overlays; break; }
    }

    // 3) baixa as mídias (carrossel = vários slides)
    const parts = post.media_type === 'CAROUSEL_ALBUM'
      ? ((post.children && post.children.data) || [])
      : [post];
    const media = [];
    for (let i = 0; i < parts.length; i++) {
      const m = parts[i];
      if (!m.media_url) continue; // vídeos com música protegida podem vir sem media_url
      const isVideo = m.media_type === 'VIDEO';
      try {
        const file = await download(m.media_url, path.join(outDir, m.id), isVideo ? '.mp4' : '.jpg');
        const entry = { type: isVideo ? 'video' : 'image', src: toUrlPath(file, OUT), slide: i + 1 };
        if (isVideo && m.thumbnail_url) {
          try {
            const thumb = await download(m.thumbnail_url, path.join(outDir, m.id + '_thumb'), '.jpg');
            entry.poster = toUrlPath(thumb, OUT);
          } catch { /* capa é opcional */ }
        }
        media.push(entry);
      } catch (err) {
        console.warn(`  ! ${err.message}`);
      }
    }

    catalog.push({
      shortcode: shortcodeOf(post),
      permalink: post.permalink,
      timestamp: post.timestamp,
      caption: (post.caption || '').slice(0, 140),
      tagged,
      overlays,
      media: media.map(({ type, src, poster }) => (poster ? { type, src, poster } : { type, src }))
    });

    if (requireTag && !tagged) continue;
    for (const m of media) {
      if (m.type === 'video' && !includeVideos) continue;
      const item = { type: m.type, src: m.src, origin: 'instagram', permalink: post.permalink, timestamp: post.timestamp };
      if (m.poster) item.poster = m.poster;
      const ovs = TotemFormat.forSlide(overlays, m.slide);
      if (ovs.length) item.overlays = ovs;
      items.push(item);
    }
  }

  const shown = new Set(items.map((i) => i.permalink)).size;
  console.log(`  Instagram: ${posts.length} publicações, ${shown} marcadas com ${tag} -> ${items.length} mídias no totem`);
  return { items, catalog };
}

// ---------------- main ----------------

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  for (const entry of STATIC_ENTRIES) {
    const src = path.join(ROOT, entry);
    if (await exists(src)) await fs.cp(src, path.join(OUT, entry), { recursive: true });
  }
  await fs.writeFile(path.join(OUT, '.nojekyll'), '');

  const siteCfg = JSON.parse(await fs.readFile(path.join(ROOT, 'config.json'), 'utf8').catch(() => '{}'));
  const igCfg = siteCfg.instagram || {};
  const tag = igCfg.tag || TotemFormat.DEFAULT_TAG;

  const local = await localItems(tag);
  console.log(`  assets/media: ${local.length} mídias`);

  let instagram = { items: [], catalog: [] };
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (token && igCfg.enabled !== false) {
    instagram = await instagramData(token, igCfg, tag);
  } else {
    console.log('  Instagram: desativado (sem INSTAGRAM_ACCESS_TOKEN ou instagram.enabled = false)');
  }

  const order = siteCfg.order === 'local-first'
    ? [...local, ...instagram.items]
    : [...instagram.items, ...local];
  const generatedAt = new Date().toISOString();
  await fs.writeFile(path.join(OUT, 'media.json'),
    JSON.stringify({ generatedAt, count: order.length, items: order }, null, 2));
  if (instagram.catalog.length) {
    await fs.writeFile(path.join(OUT, 'posts.json'),
      JSON.stringify({ generatedAt, tag, posts: instagram.catalog }, null, 2));
  }
  console.log(`  media.json: ${order.length} itens`);
}

main().catch((err) => {
  console.error('ERRO no build:', err.message);
  process.exit(1);
});
