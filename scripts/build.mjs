#!/usr/bin/env node
/**
 * Gera o site estático em ./_site para o GitHub Pages.
 *
 *  1. Copia index.html, css/, js/, config.json e assets/ para _site/
 *  2. Lista as fotos/vídeos de assets/media (ordem alfabética do caminho)
 *  3. Se INSTAGRAM_ACCESS_TOKEN estiver definido, baixa as últimas publicações
 *     do Instagram (Instagram API with Instagram Login) para _site/media/instagram/
 *  4. Escreve _site/media.json, lido pelo player (js/player.js)
 *
 * Uso local:   node scripts/build.mjs        (sem token = só a pasta assets/media)
 *              INSTAGRAM_ACCESS_TOKEN=xxx node scripts/build.mjs
 *
 * Se o token estiver definido e o Instagram falhar, o build FALHA de propósito:
 * assim o GitHub Pages mantém a última publicação boa em vez de publicar sem os posts.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const MEDIA_DIR = path.join(ROOT, 'assets', 'media');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.m4v', '.mov']);
const STATIC_ENTRIES = ['index.html', 'css', 'js', 'assets', 'config.json'];

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

function toUrlPath(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).map(encodeURIComponent).join('/');
}

async function localItems() {
  const files = (await walk(MEDIA_DIR)).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  const items = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const base = path.basename(f);
    if (base.startsWith('.') || base.startsWith('_')) continue; // ignora ocultos/rascunhos
    if (IMAGE_EXT.has(ext)) items.push({ type: 'image', src: toUrlPath(f), origin: 'local' });
    else if (VIDEO_EXT.has(ext)) items.push({ type: 'video', src: toUrlPath(f), origin: 'local' });
  }
  return items;
}

// ---------------- Instagram ----------------

const IG_FIELDS = 'id,media_type,media_url,thumbnail_url,permalink,timestamp,caption,' +
  'children{id,media_type,media_url,thumbnail_url}';

async function igGet(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body.error ? `${body.error.type}: ${body.error.message}` : `HTTP ${res.status}`;
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

async function instagramItems(token, igCfg) {
  const limit = Number(igCfg.limit) || 30;
  const excludeTag = (igCfg.excludeTag || '').toLowerCase();
  const includeVideos = igCfg.includeVideos !== false;
  const outDir = path.join(OUT, 'media', 'instagram');
  await fs.mkdir(outDir, { recursive: true });

  // 1) coleta as publicações (com paginação)
  const posts = [];
  let url = `https://graph.instagram.com/me/media?fields=${encodeURIComponent(IG_FIELDS)}` +
    `&limit=${Math.min(limit, 50)}&access_token=${encodeURIComponent(token)}`;
  while (url && posts.length < limit) {
    const page = await igGet(url);
    posts.push(...(page.data || []));
    url = page.paging && page.paging.next;
  }

  // 2) expande carrosséis e baixa os arquivos
  const items = [];
  for (const post of posts.slice(0, limit)) {
    const caption = (post.caption || '').toLowerCase();
    if (excludeTag && caption.includes(excludeTag)) {
      console.log(`  - pulando ${post.permalink} (contém ${excludeTag})`);
      continue;
    }
    const parts = post.media_type === 'CAROUSEL_ALBUM'
      ? ((post.children && post.children.data) || [])
      : [post];

    for (const m of parts) {
      if (!m.media_url) continue; // vídeos com música protegida podem vir sem media_url
      const isVideo = m.media_type === 'VIDEO';
      if (isVideo && !includeVideos) continue;
      try {
        const file = await download(m.media_url, path.join(outDir, m.id), isVideo ? '.mp4' : '.jpg');
        const item = {
          type: isVideo ? 'video' : 'image',
          src: path.relative(OUT, file).split(path.sep).join('/'),
          origin: 'instagram',
          permalink: post.permalink,
          timestamp: post.timestamp
        };
        if (isVideo && m.thumbnail_url) {
          try {
            const thumb = await download(m.thumbnail_url, path.join(outDir, m.id + '_thumb'), '.jpg');
            item.poster = path.relative(OUT, thumb).split(path.sep).join('/');
          } catch { /* capa é opcional */ }
        }
        items.push(item);
      } catch (err) {
        console.warn(`  ! ${err.message}`);
      }
    }
  }
  console.log(`  Instagram: ${posts.length} publicações -> ${items.length} mídias`);
  return items;
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

  const local = await localItems();
  console.log(`  assets/media: ${local.length} mídias`);

  let instagram = [];
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (token && igCfg.enabled !== false) {
    instagram = await instagramItems(token, igCfg);
  } else {
    console.log('  Instagram: desativado (sem INSTAGRAM_ACCESS_TOKEN ou instagram.enabled = false)');
  }

  const order = siteCfg.order === 'local-first' ? [...local, ...instagram] : [...instagram, ...local];
  const manifest = { generatedAt: new Date().toISOString(), count: order.length, items: order };
  await fs.writeFile(path.join(OUT, 'media.json'), JSON.stringify(manifest, null, 2));
  console.log(`  media.json: ${order.length} itens`);
}

main().catch((err) => {
  console.error('ERRO no build:', err.message);
  process.exit(1);
});
