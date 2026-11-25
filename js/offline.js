/*
 * Suporte offline do totem.
 *  - Registra o Service Worker (sw.js).
 *  - Baixa todas as mídias da exibição para o Cache Storage (fica no disco da TV,
 *    sobrevive a reinícios). Sem Service Worker, guarda em memória (blob URLs).
 *  - Guarda a última sessão (orientação) e a última lista de mídias no localStorage.
 * ES5.
 */
(function (root) {
  'use strict';

  var MEDIA_CACHE = 'totem-media-v1';
  var MEMORY_LIMIT = 400 * 1024 * 1024; // 400 MB quando não há Service Worker
  var KEY_SESSION = 'totemGeri.lastSession';
  var KEY_MANIFEST = 'totemGeri.lastManifest';

  var swActive = false;
  var memory = {};      // url absoluta -> blob URL
  var memoryBytes = 0;
  var running = false;

  function abs(src) {
    var a = document.createElement('a');
    a.href = src;
    return a.href;
  }

  function register() {
    if (!('serviceWorker' in navigator)) return;
    var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!secure) return;
    navigator.serviceWorker.register('sw.js').then(function () {
      swActive = true;
    }).catch(function () { swActive = false; });
    if (navigator.serviceWorker.controller) swActive = true;
  }

  function useCacheStorage() {
    return swActive && typeof caches !== 'undefined';
  }

  function urlsOf(items) {
    var list = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].src) list.push(abs(items[i].src));
      if (items[i].poster) list.push(abs(items[i].poster));
    }
    return list;
  }

  /**
   * Baixa todas as mídias da playlist em segundo plano, uma de cada vez.
   * onProgress(feitos, total) é opcional.
   */
  function precache(items, onProgress) {
    if (running) return;
    running = true;
    var urls = urlsOf(items);
    var done = 0;
    var progress = function () { if (onProgress) onProgress(done, urls.length); };

    if (useCacheStorage()) {
      caches.open(MEDIA_CACHE).then(function (cache) {
        var i = 0;
        function step() {
          if (i >= urls.length) return cleanup(cache);
          var url = urls[i++];
          cache.match(url).then(function (hit) {
            if (hit) return;
            return fetch(url).then(function (res) {
              if (res.ok && res.status === 200) return cache.put(url, res);
            });
          }).catch(function () { /* offline ou erro: tenta na próxima vez */ })
            .then(function () { done++; progress(); step(); });
        }
        function cleanup(c) {
          // remove do cache o que saiu da playlist
          c.keys().then(function (reqs) {
            var wanted = {};
            for (var k = 0; k < urls.length; k++) wanted[urls[k]] = true;
            for (var r = 0; r < reqs.length; r++) if (!wanted[reqs[r].url]) c['delete'](reqs[r]);
          });
          running = false;
        }
        step();
      }).catch(function () { running = false; });
      return;
    }

    // sem Service Worker: cache em memória
    var j = 0;
    function memStep() {
      if (j >= urls.length || memoryBytes > MEMORY_LIMIT) { running = false; return; }
      var url = urls[j++];
      if (memory[url]) { done++; progress(); memStep(); return; }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.onload = function () {
        if (xhr.status === 200 && xhr.response) {
          memoryBytes += xhr.response.size || 0;
          memory[url] = URL.createObjectURL(xhr.response);
        }
        done++; progress(); memStep();
      };
      xhr.onerror = function () { done++; progress(); memStep(); };
      xhr.send();
    }
    memStep();
  }

  /** Endereço a usar para exibir a mídia (blob em memória, se houver). */
  function resolve(src) {
    if (!src) return src;
    return memory[abs(src)] || src;
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* cheio ou bloqueado */ }
  }

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  root.TotemOffline = {
    register: register,
    precache: precache,
    resolve: resolve,
    saveSession: function (s) { save(KEY_SESSION, s); },
    getSession: function () { return load(KEY_SESSION); },
    saveManifest: function (m) { save(KEY_MANIFEST, m); },
    getManifest: function () { return load(KEY_MANIFEST); }
  };
})(this);
