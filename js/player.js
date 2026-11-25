/*
 * Totem Geri Cabeleireiros - player de slides de fotos e vídeos.
 *
 * Escrito em JavaScript "clássico" (sem módulos, sem optional chaining, sem async/await)
 * para rodar nos navegadores embutidos de Smart TVs mais antigas (Tizen/webOS/Android TV).
 *
 * Fonte das mídias: media.json (gerado pelo GitHub Action em scripts/build.mjs).
 * Configurações: padrão < config.json < localStorage (painel) < parâmetros da URL.
 */
(function () {
  'use strict';

  var DEFAULTS = {
    rotate: 0,          // 0 | 90 | 180 | 270
    duration: 8,        // segundos por foto
    maxVideo: 0,        // segundos máximos por vídeo (0 = inteiro)
    fit: 'contain',     // contain | cover
    source: 'all',      // all | instagram | local
    shuffle: false,
    footer: true,
    footerText: '@geri.cabeleireiros',
    sound: false,
    refreshMinutes: 30  // de quanto em quanto tempo procura mídias novas
  };
  var STORAGE_KEY = 'totemGeri.settings';

  var cfg = {};
  var siteCfg = {};
  var playlist = [];
  var index = -1;
  var timer = null;
  var activeLayer = 0;
  var layers = [document.getElementById('layerA'), document.getElementById('layerB')];
  var messageEl = document.getElementById('message');
  var lastManifestStamp = null;
  var pendingPlaylist = null;
  var failures = 0;

  // ---------------- utilidades ----------------

  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined && src[k] !== null) {
          target[k] = src[k];
        }
      }
    }
    return target;
  }

  function getJSON(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + (url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { cb(null, JSON.parse(xhr.responseText)); }
        catch (e) { cb(e); }
      } else {
        cb(new Error('HTTP ' + xhr.status + ' em ' + url));
      }
    };
    xhr.send();
  }

  function toBool(v) {
    if (typeof v === 'boolean') return v;
    return v === '1' || v === 'true' || v === 'sim' || v === 'yes';
  }

  function normalize(c) {
    var r = parseInt(c.rotate, 10);
    c.rotate = (r === 90 || r === 180 || r === 270) ? r : 0;
    c.duration = Math.max(2, parseFloat(c.duration) || DEFAULTS.duration);
    c.maxVideo = Math.max(0, parseFloat(c.maxVideo) || 0);
    c.fit = c.fit === 'cover' ? 'cover' : 'contain';
    c.source = (c.source === 'instagram' || c.source === 'local') ? c.source : 'all';
    c.shuffle = toBool(c.shuffle);
    c.footer = toBool(c.footer);
    c.sound = toBool(c.sound);
    c.refreshMinutes = Math.max(1, parseFloat(c.refreshMinutes) || DEFAULTS.refreshMinutes);
    return c;
  }

  function readStored() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function writeStored(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) { /* ignora */ }
  }

  function readUrlParams() {
    var out = {};
    var q = window.location.search.replace(/^\?/, '');
    if (!q) return out;
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var key = decodeURIComponent(kv[0] || '');
      var val = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      if (key && Object.prototype.hasOwnProperty.call(DEFAULTS, key)) out[key] = val;
    }
    // atalhos amigáveis
    if (out.rotate === 'vertical' || out.rotate === 'direita') out.rotate = 90;
    if (out.rotate === 'esquerda') out.rotate = 270;
    return out;
  }

  function buildConfig() {
    cfg = normalize(extend({}, DEFAULTS, siteCfg, readStored(), readUrlParams()));
  }

  function applyLayout() {
    var body = document.body;
    body.className = body.className
      .replace(/\brot-\d+\b/g, '')
      .replace(/\bfit-\w+\b/g, '')
      .replace(/\s+/g, ' ');
    body.className += ' rot-' + cfg.rotate + ' fit-' + cfg.fit;

    var footer = document.getElementById('footer');
    document.getElementById('footerText').textContent = cfg.footerText || '';
    footer.hidden = !(cfg.footer && cfg.footerText);
  }

  function showMessage(text) {
    messageEl.textContent = text;
    messageEl.className = text ? '' : 'hidden';
  }

  // ---------------- playlist ----------------

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildPlaylist(manifest) {
    var items = (manifest && manifest.items) || [];
    var list = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.src) continue;
      if (cfg.source !== 'all' && it.origin !== cfg.source) continue;
      list.push(it);
    }
    return cfg.shuffle ? shuffleArray(list) : list;
  }

  function loadManifest(initial) {
    getJSON('media.json', function (err, manifest) {
      if (err) {
        if (initial) {
          showMessage('Não foi possível carregar a lista de mídias. Tentando novamente…');
          setTimeout(function () { loadManifest(true); }, 30000);
        }
        return;
      }
      var stamp = manifest.generatedAt || JSON.stringify(manifest.items || []).length;
      if (!initial && stamp === lastManifestStamp) return;
      lastManifestStamp = stamp;

      var list = buildPlaylist(manifest);
      if (initial || playlist.length === 0) {
        playlist = list;
        index = -1;
        if (playlist.length === 0) {
          showMessage('Nenhuma foto ou vídeo encontrado.\nAdicione arquivos em assets/media ou configure o Instagram.');
          return;
        }
        showMessage('');
        next();
      } else {
        // troca a playlist quando terminar a volta atual, sem cortar a mídia em exibição
        pendingPlaylist = list;
      }
    });
  }

  // ---------------- exibição ----------------

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function scheduleNext(seconds) {
    clearTimer();
    timer = setTimeout(next, seconds * 1000);
  }

  function emptyLayer(layer) {
    var vids = layer.getElementsByTagName('video');
    for (var i = 0; i < vids.length; i++) {
      try { vids[i].pause(); vids[i].removeAttribute('src'); vids[i].load(); } catch (e) { /* ignora */ }
    }
    layer.innerHTML = '';
  }

  function swapTo(layer) {
    var old = layers[activeLayer];
    activeLayer = layers[0] === layer ? 0 : 1;
    layer.className = 'layer visible';
    old.className = 'layer';
    setTimeout(function () {
      if (layers[activeLayer] !== old) emptyLayer(old);
    }, 1200);
  }

  function next() {
    clearTimer();
    if (index + 1 >= playlist.length && pendingPlaylist) {
      playlist = pendingPlaylist;
      pendingPlaylist = null;
      index = -1;
    }
    if (!playlist.length) { loadManifest(true); return; }
    index = (index + 1) % playlist.length;
    if (index === 0 && cfg.shuffle && playlist.length > 2) shuffleArray(playlist);
    show(playlist[index]);
  }

  function onMediaError() {
    failures++;
    // se tudo estiver falhando (ex.: sem internet), espera um pouco antes de insistir
    scheduleNext(failures >= playlist.length ? 15 : 0.1);
  }

  function show(item) {
    var target = layers[activeLayer === 0 ? 1 : 0];
    emptyLayer(target);

    if (item.type === 'video') {
      var video = document.createElement('video');
      video.className = 'fg';
      video.muted = !cfg.sound;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'auto';
      if (item.poster) video.poster = item.poster;

      var started = false;
      video.onplaying = function () {
        if (started) return;
        started = true;
        failures = 0;
        swapTo(target);
        if (cfg.maxVideo > 0) scheduleNext(cfg.maxVideo);
        else scheduleNext(Math.max(item.duration || 0, 600)); // trava de segurança
      };
      video.onended = function () { next(); };
      video.onerror = onMediaError;
      target.appendChild(video);
      video.src = item.src;
      var p = video.play();
      if (p && p.catch) {
        p.catch(function () {
          // autoplay com som bloqueado: tenta de novo mudo
          if (!video.muted) {
            video.muted = true;
            var p2 = video.play();
            if (p2 && p2.catch) p2.catch(onMediaError);
          } else {
            onMediaError();
          }
        });
      }
      // se o vídeo não começar em 20s, pula
      timer = setTimeout(function () { if (!started) onMediaError(); }, 20000);
    } else {
      var img = new Image();
      img.onload = function () {
        failures = 0;
        if (cfg.fit === 'contain') {
          var bg = document.createElement('img');
          bg.className = 'bg';
          bg.src = item.src;
          target.appendChild(bg);
        }
        img.className = 'fg';
        target.appendChild(img);
        swapTo(target);
        scheduleNext(item.duration || cfg.duration);
      };
      img.onerror = onMediaError;
      img.src = item.src;
    }
  }

  // ---------------- painel de configuração ----------------

  var settingsEl = document.getElementById('settings');
  var fields = {
    rotate: document.getElementById('cfgRotate'),
    duration: document.getElementById('cfgDuration'),
    maxVideo: document.getElementById('cfgMaxVideo'),
    fit: document.getElementById('cfgFit'),
    source: document.getElementById('cfgSource'),
    shuffle: document.getElementById('cfgShuffle'),
    footer: document.getElementById('cfgFooter'),
    sound: document.getElementById('cfgSound')
  };

  function openSettings() {
    fields.rotate.value = String(cfg.rotate);
    fields.duration.value = cfg.duration;
    fields.maxVideo.value = cfg.maxVideo;
    fields.fit.value = cfg.fit;
    fields.source.value = cfg.source;
    fields.shuffle.checked = cfg.shuffle;
    fields.footer.checked = cfg.footer;
    fields.sound.checked = cfg.sound;
    settingsEl.hidden = false;
    fields.rotate.focus();
  }

  function closeSettings() {
    settingsEl.hidden = true;
  }

  function saveSettings() {
    writeStored({
      rotate: parseInt(fields.rotate.value, 10),
      duration: parseFloat(fields.duration.value),
      maxVideo: parseFloat(fields.maxVideo.value),
      fit: fields.fit.value,
      source: fields.source.value,
      shuffle: fields.shuffle.checked,
      footer: fields.footer.checked,
      sound: fields.sound.checked
    });
    // recarrega para aplicar tudo de forma limpa (parâmetros da URL continuam tendo prioridade)
    window.location.reload();
  }

  document.getElementById('cfgSave').onclick = saveSettings;
  document.getElementById('cfgCancel').onclick = closeSettings;
  document.getElementById('cfgReset').onclick = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignora */ }
    window.location.reload();
  };

  document.addEventListener('keydown', function (e) {
    var key = e.key || '';
    var code = e.keyCode;
    if (!settingsEl.hidden) {
      if (key === 'Escape' || (key === 'Backspace' && e.target.tagName !== 'INPUT') || code === 10009 /* Tizen Return */) {
        closeSettings();
        e.preventDefault();
      }
      return;
    }
    // "C", Enter/OK do controle remoto ou tecla de menu abre o painel
    if (key === 'c' || key === 'C' || key === 'Enter' || code === 13 || key === 'ContextMenu' || code === 18 /* webOS menu */) {
      openSettings();
      e.preventDefault();
    } else if (key === 'ArrowRight' || code === 39) {
      next();
    } else if (key === 'f' || key === 'F') {
      goFullscreen();
    }
  });

  document.addEventListener('dblclick', function () {
    if (settingsEl.hidden) openSettings();
  });

  // ---------------- tela cheia / tela sempre ligada ----------------

  function goFullscreen() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (fn && !(document.fullscreenElement || document.webkitFullscreenElement)) {
      try { var r = fn.call(el); if (r && r.catch) r.catch(function () {}); } catch (e) { /* ignora */ }
    }
  }
  document.addEventListener('click', function (e) {
    if (settingsEl.hidden) goFullscreen();
  });

  var wakeLock = null;
  function keepAwake() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    navigator.wakeLock.request('screen').then(function (l) {
      wakeLock = l;
      l.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* não suportado */ });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') keepAwake();
  });

  // ---------------- inicialização ----------------

  function start() {
    buildConfig();
    applyLayout();
    keepAwake();
    loadManifest(true);
    setInterval(function () { loadManifest(false); }, cfg.refreshMinutes * 60 * 1000);
    // recarrega a página uma vez por dia (de madrugada) para pegar atualizações do próprio site
    setInterval(function () {
      var h = new Date().getHours();
      if (h === 4 && performance.now() > 3600 * 1000) window.location.reload();
    }, 30 * 60 * 1000);
  }

  getJSON('config.json', function (err, data) {
    siteCfg = err ? {} : (data || {});
    start();
  });
})();
