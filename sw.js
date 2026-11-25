/*
 * Service Worker do Totem - permite que a TV continue exibindo sem internet.
 *
 * - Arquivos do site (html, css, js, config.json, media.json, posts.json):
 *   "rede primeiro"; se a rede falhar, usa a cópia em cache (última exibição).
 * - Fotos e vídeos (assets/media/ e media/instagram/): "cache primeiro".
 *   O player baixa tudo para o cache ao entrar no modo de exibição (js/offline.js).
 * - Suporta requisições com Range (vídeos) servindo respostas 206 a partir do cache.
 */
var SHELL_CACHE = 'totem-shell-v1';
var MEDIA_CACHE = 'totem-media-v1';
var SHELL_FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/format.js',
  'js/overlay.js',
  'js/offline.js',
  'js/player.js',
  'js/editor.js',
  'js/vendor/qrcode.js',
  'config.json',
  'media.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      // falha individual não impede a instalação
      return Promise.all(SHELL_FILES.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL_CACHE && k !== MEDIA_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isMedia(url) {
  return url.pathname.indexOf('/assets/media/') >= 0 || url.pathname.indexOf('/media/instagram/') >= 0;
}

function stripSearch(url) {
  return url.origin + url.pathname;
}

function rangeResponse(request, response) {
  var range = request.headers.get('range');
  if (!range) return Promise.resolve(response);
  return response.blob().then(function (blob) {
    var size = blob.size;
    var m = /bytes=(\d*)-(\d*)/.exec(range);
    var start, end;
    if (!m) return new Response(blob, { status: 200, headers: response.headers });
    if (m[1] === '') { // sufixo: últimos N bytes
      start = Math.max(0, size - parseInt(m[2], 10));
      end = size - 1;
    } else {
      start = parseInt(m[1], 10);
      end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
    }
    if (start >= size) {
      return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    }
    return new Response(blob.slice(start, end + 1), {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': response.headers.get('content-type') || blob.type || 'application/octet-stream',
        'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes'
      }
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isMedia(url)) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then(function (cache) {
        return cache.match(req.url, { ignoreVary: true }).then(function (hit) {
          if (hit) return rangeResponse(req, hit);
          // não está no cache: busca na rede (sem guardar respostas parciais)
          return fetch(req).then(function (res) {
            if (res.ok && res.status === 200 && !req.headers.get('range')) {
              cache.put(req.url, res.clone()).catch(function () {});
            }
            return res;
          });
        });
      })
    );
    return;
  }

  // arquivos do site: rede primeiro, cache como reserva (chave sem ?query)
  var key = stripSearch(url);
  event.respondWith(
    fetch(req).then(function (res) {
      if (res.ok && res.status === 200) {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (cache) { cache.put(key, copy); });
      }
      return res;
    }).catch(function () {
      return caches.open(SHELL_CACHE).then(function (cache) {
        return cache.match(key).then(function (hit) {
          if (hit) return hit;
          if (req.mode === 'navigate') {
            return cache.match(url.origin + url.pathname.replace(/[^\/]*$/, '')).then(function (idx) {
              return idx || cache.match(url.origin + url.pathname.replace(/[^\/]*$/, '') + 'index.html');
            });
          }
          return Response.error();
        });
      });
    })
  );
});
