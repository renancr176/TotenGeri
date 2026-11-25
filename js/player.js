/*
 * Totem Geri Cabeleireiros - tela inicial + player de slides.
 *
 * Escrito em JavaScript "clássico" (ES5: sem módulos, sem optional chaining, sem async/await)
 * para rodar nos navegadores embutidos de Smart TVs mais antigas (Tizen/webOS/Android TV).
 *
 * Fluxo: a página abre na tela inicial -> o usuário escolhe Horizontal ou Vertical ->
 * entra em tela cheia e começa a exibição. Esc/Voltar retorna à tela inicial.
 *
 * Configurações: DEFAULTS < config.json < opções salvas (localStorage) < parâmetros da URL.
 * URL: ?auto=1&rotate=90 inicia direto (útil como página inicial da TV);
 *      ?auto=resume retoma a última exibição.
 */
(function () {
  'use strict';

  var DEFAULTS = {
    duration: 8,        // segundos por foto
    maxVideo: 0,        // segundos máximos por vídeo (0 = inteiro)
    fit: 'contain',     // contain | cover
    source: 'all',      // all | instagram | local
    shuffle: false,
    sound: false,
    qr: true,
    qrUrl: 'https://www.instagram.com/geri.cabeleireiros',
    qrLabel: '@geri.cabeleireiros',
    refreshMinutes: 30
  };
  var OPTIONS_KEY = 'totemGeri.settings';
  var OPTION_FIELDS = ['duration', 'maxVideo', 'fit', 'source', 'shuffle', 'sound', 'qr'];

  var Offline = window.TotemOffline;
  var Overlay = window.TotemOverlay;

  var cfg = {};
  var siteCfg = {};
  var manifest = null;
  var playlist = [];
  var pendingPlaylist = null;
  var index = -1;
  var timer = null;
  var ticker = null;
  var refreshTimer = null;
  var current = null;      // { overlay, media, item }
  var activeLayer = 0;
  var failures = 0;
  var displaying = false;
  var enteredFullscreen = false;
  var lastManifestStamp = null;

  var stage = document.getElementById('stage');
  var layers = [document.getElementById('layerA'), document.getElementById('layerB')];
  var messageEl = document.getElementById('message');
  var toastEl = document.getElementById('toast');

  // ======================= utilidades =======================

  function $(id) { return document.getElementById(id); }

  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined && src[k] !== null) target[k] = src[k];
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
        try { cb(null, JSON.parse(xhr.responseText)); } catch (e) { cb(e); }
      } else {
        cb(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.onerror = function () { cb(new Error('rede')); };
    try { xhr.send(); } catch (e) { cb(e); }
  }

  function toBool(v) {
    if (typeof v === 'boolean') return v;
    return v === '1' || v === 'true' || v === 'sim' || v === 'yes' || v === 1;
  }

  function normalize(c) {
    c.duration = Math.max(2, parseFloat(c.duration) || DEFAULTS.duration);
    c.maxVideo = Math.max(0, parseFloat(c.maxVideo) || 0);
    c.fit = c.fit === 'cover' ? 'cover' : 'contain';
    c.source = (c.source === 'instagram' || c.source === 'local') ? c.source : 'all';
    c.shuffle = toBool(c.shuffle);
    c.sound = toBool(c.sound);
    c.qr = toBool(c.qr);
    c.refreshMinutes = Math.max(1, parseFloat(c.refreshMinutes) || DEFAULTS.refreshMinutes);
    return c;
  }

  function readStored() {
    try { return JSON.parse(localStorage.getItem(OPTIONS_KEY)) || {}; } catch (e) { return {}; }
  }

  function writeStored(obj) {
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(obj)); } catch (e) { /* ignora */ }
  }

  function urlParams() {
    var out = {};
    var q = window.location.search.replace(/^\?/, '');
    if (!q) return out;
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var key = decodeURIComponent(kv[0] || '');
      if (key) out[key] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    }
    return out;
  }

  function siteDefaults() {
    var s = {};
    for (var k in DEFAULTS) if (siteCfg[k] !== undefined) s[k] = siteCfg[k];
    if (siteCfg.qr && typeof siteCfg.qr === 'object') {
      s.qr = siteCfg.qr.enabled !== false;
      if (siteCfg.qr.url) s.qrUrl = siteCfg.qr.url;
      if (siteCfg.qr.label !== undefined) s.qrLabel = siteCfg.qr.label;
    }
    return s;
  }

  function buildConfig() {
    var params = urlParams();
    var fromUrl = {};
    for (var k in DEFAULTS) if (params[k] !== undefined) fromUrl[k] = params[k];
    cfg = normalize(extend({}, DEFAULTS, siteDefaults(), readStored(), fromUrl));
  }

  function rotationLabel(r) {
    if (r === 90) return 'vertical, girada para a direita';
    if (r === 270) return 'vertical, girada para a esquerda';
    if (r === 180) return 'horizontal invertida';
    return 'horizontal';
  }

  // ======================= tela inicial =======================

  function fillOptionsForm() {
    $('optDuration').value = cfg.duration;
    $('optMaxVideo').value = cfg.maxVideo;
    $('optFit').value = cfg.fit;
    $('optSource').value = cfg.source;
    $('optShuffle').checked = cfg.shuffle;
    $('optSound').checked = cfg.sound;
    $('optQr').checked = cfg.qr;
  }

  function saveOptionsForm() {
    var stored = readStored();
    stored.duration = parseFloat($('optDuration').value);
    stored.maxVideo = parseFloat($('optMaxVideo').value);
    stored.fit = $('optFit').value;
    stored.source = $('optSource').value;
    stored.shuffle = $('optShuffle').checked;
    stored.sound = $('optSound').checked;
    stored.qr = $('optQr').checked;
    writeStored(stored);
    buildConfig();
  }

  function selectedVerticalRotation() {
    var radios = document.getElementsByName('vdir');
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) return parseInt(radios[i].value, 10);
    return 90;
  }

  function updateHomeStatus() {
    var statusEl = $('status');
    var online = navigator.onLine !== false;
    var count = manifest && manifest.items ? countForSource(manifest.items) : 0;
    var txt;
    if (manifest) {
      txt = (online ? 'Online' : 'Sem internet') + ' · ' + count + (count === 1 ? ' mídia' : ' mídias') + ' para exibir';
      if (manifest.generatedAt) {
        var d = new Date(manifest.generatedAt);
        txt += ' · atualizado em ' + d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      txt = online ? 'Não foi possível carregar a lista de mídias.' : 'Sem internet e sem exibição salva neste aparelho.';
    }
    statusEl.textContent = txt;
    statusEl.className = 'status' + (online ? '' : ' offline');

    var session = Offline.getSession();
    var btn = $('btnResume');
    if (session && manifest) {
      btn.hidden = false;
      $('resumeInfo').textContent = '(' + rotationLabel(session.rotate) + (online ? '' : ' · modo offline') + ')';
      btn.className = 'resume' + (online ? '' : ' highlight');
    } else {
      btn.hidden = true;
    }
  }

  function countForSource(items) {
    var n = 0;
    for (var i = 0; i < items.length; i++) if (cfg.source === 'all' || items[i].origin === cfg.source) n++;
    return n;
  }

  function loadManifest(cb) {
    getJSON('media.json', function (err, data) {
      if (!err && data && data.items) {
        Offline.saveManifest(data);
        cb(data, true);
      } else {
        cb(Offline.getManifest(), false);
      }
    });
  }

  // ======================= exibição =======================

  function requestFullscreen() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (!fn) return;
    try {
      var r = fn.call(el);
      enteredFullscreen = true;
      if (r && r.then) r.then(function () { enteredFullscreen = true; }, function () { enteredFullscreen = false; });
    } catch (e) { enteredFullscreen = false; }
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  function exitFullscreen() {
    if (!isFullscreen()) return;
    var fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (fn) { try { var r = fn.call(document); if (r && r['catch']) r['catch'](function () {}); } catch (e) { /* ignora */ } }
  }

  function setBodyMode(rotate) {
    document.body.className = displaying
      ? 'mode-display rot-' + rotate + ' fit-' + cfg.fit
      : 'mode-home';
  }

  function renderQr() {
    var box = $('qr');
    if (!cfg.qr || !cfg.qrUrl || typeof window.qrcode !== 'function') { box.hidden = true; return; }
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(cfg.qrUrl);
      qr.make();
      $('qrCode').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      $('qrLabel').textContent = cfg.qrLabel || '';
      $('qrLabel').hidden = !cfg.qrLabel;
      box.hidden = false;
    } catch (e) {
      box.hidden = true;
    }
  }

  function showMessage(text) {
    messageEl.textContent = text;
    messageEl.className = text ? '' : 'hidden';
  }

  var toastTimer = null;
  function showToast(text, seconds) {
    toastEl.textContent = text;
    toastEl.className = 'toast';
    if (toastTimer) clearTimeout(toastTimer);
    if (seconds) toastTimer = setTimeout(function () { toastEl.className = 'toast hidden'; }, seconds * 1000);
  }

  function startDisplay(rotate, opts) {
    opts = opts || {};
    if (!opts.noFullscreen) requestFullscreen(); // precisa acontecer dentro do clique
    buildConfig();
    displaying = true;
    Offline.saveSession({ rotate: rotate, at: new Date().toISOString() });
    setBodyMode(rotate);
    renderQr();
    keepAwake();
    showMessage('Carregando…');

    loadManifest(function (data, online) {
      if (!displaying) return;
      manifest = data;
      if (!data) {
        showMessage('Sem internet e nenhuma exibição salva neste aparelho.\nConecte a TV à internet e tente de novo.');
        return;
      }
      lastManifestStamp = data.generatedAt;
      playlist = buildPlaylist(data);
      index = -1;
      if (!playlist.length) {
        showMessage('Nenhuma foto ou vídeo para exibir.\nAdicione #totemgeri nos posts do Instagram\nou arquivos em assets/media.');
        return;
      }
      showMessage('');
      next();
      if (!online) showToast('Modo offline - exibindo a última lista salva', 8);
      precacheWithToast(playlist);
    });

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refreshManifest, cfg.refreshMinutes * 60 * 1000);
  }

  function precacheWithToast(items) {
    Offline.precache(items, function (done, total) {
      if (done < total) showToast('Salvando para uso offline: ' + done + '/' + total);
      else showToast('Conteúdo salvo para uso offline ✓', 4);
    });
  }

  function stopDisplay() {
    displaying = false;
    clearTimer();
    stopTicker();
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    emptyLayer(layers[0]); emptyLayer(layers[1]);
    layers[0].className = 'layer'; layers[1].className = 'layer';
    current = null;
    releaseWakeLock();
    exitFullscreen();
    enteredFullscreen = false;
    setBodyMode(0);
    updateHomeStatus();
    setTimeout(function () { $('btnH').focus(); }, 50);
  }

  function refreshManifest() {
    getJSON('media.json', function (err, data) {
      if (err || !data || !data.items) return; // offline: segue com o que tem
      Offline.saveManifest(data);
      if (data.generatedAt === lastManifestStamp) return;
      lastManifestStamp = data.generatedAt;
      manifest = data;
      var list = buildPlaylist(data);
      if (!playlist.length) {
        playlist = list; index = -1;
        if (list.length) { showMessage(''); next(); }
      } else {
        pendingPlaylist = list; // entra ao fim da volta atual
      }
      precacheWithToast(list);
    });
  }

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildPlaylist(data) {
    var items = (data && data.items) || [];
    var list = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.src) continue;
      if (cfg.source !== 'all' && it.origin !== cfg.source) continue;
      list.push(it);
    }
    return cfg.shuffle ? shuffleArray(list) : list;
  }

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function scheduleNext(seconds) {
    clearTimer();
    timer = setTimeout(next, seconds * 1000);
  }

  function stopTicker() {
    if (ticker) { clearInterval(ticker); ticker = null; }
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
    if (!displaying) return;
    clearTimer();
    stopTicker();
    if (index + 1 >= playlist.length && pendingPlaylist) {
      playlist = pendingPlaylist;
      pendingPlaylist = null;
      index = -1;
    }
    if (!playlist.length) { showMessage('Nenhuma foto ou vídeo para exibir.'); return; }
    index = (index + 1) % playlist.length;
    if (index === 0 && cfg.shuffle && playlist.length > 2) shuffleArray(playlist);
    show(playlist[index]);
  }

  function onMediaError() {
    if (!displaying) return;
    failures++;
    // se tudo estiver falhando (ex.: sem internet e sem cache), espera antes de insistir
    scheduleNext(failures >= playlist.length ? 15 : 0.1);
  }

  function layoutCurrent() {
    if (!current || !current.overlay) return;
    var m = current.media;
    var w = m.naturalWidth || m.videoWidth;
    var h = m.naturalHeight || m.videoHeight;
    current.overlay.layout(Overlay.fitRect(stage.clientWidth, stage.clientHeight, w, h, cfg.fit));
  }

  function attachOverlay(target, media, item) {
    var ovs = item.overlays || [];
    if (!ovs.length) return null;
    var ov = Overlay.create(target, ovs);
    current = { overlay: ov, media: media, item: item };
    layoutCurrent();
    ov.update(0, 0);
    return ov;
  }

  function show(item) {
    var target = layers[activeLayer === 0 ? 1 : 0];
    emptyLayer(target);
    current = null;
    var src = Offline.resolve(item.src);

    if (item.type === 'video') {
      var video = document.createElement('video');
      video.className = 'fg';
      video.muted = !cfg.sound;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'auto';
      if (item.poster) video.poster = Offline.resolve(item.poster);

      var started = false;
      video.onplaying = function () {
        if (started) return;
        started = true;
        failures = 0;
        var ov = attachOverlay(target, video, item);
        swapTo(target);
        var total = video.duration && isFinite(video.duration) ? video.duration : 0;
        if (cfg.maxVideo > 0) {
          total = total ? Math.min(total, cfg.maxVideo) : cfg.maxVideo;
          scheduleNext(cfg.maxVideo);
        } else {
          scheduleNext(Math.max(total + 5, 30)); // trava de segurança caso "ended" não dispare
        }
        if (ov) {
          ticker = setInterval(function () { ov.update(video.currentTime, total); }, 100);
        }
      };
      video.onended = function () { next(); };
      video.onerror = onMediaError;
      target.appendChild(video);
      video.src = src;
      var p = video.play();
      if (p && p['catch']) {
        p['catch'](function () {
          // autoplay com som bloqueado: tenta de novo mudo
          if (!video.muted) {
            video.muted = true;
            var p2 = video.play();
            if (p2 && p2['catch']) p2['catch'](onMediaError);
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
        if (!displaying) return;
        failures = 0;
        if (cfg.fit === 'contain') {
          var bg = document.createElement('img');
          bg.className = 'bg';
          bg.src = src;
          target.appendChild(bg);
        }
        img.className = 'fg';
        target.appendChild(img);
        var ov = attachOverlay(target, img, item);
        swapTo(target);
        // a foto fica no ar o tempo configurado, ou mais se os textos precisarem
        var total = Math.max(cfg.duration, ov ? Overlay.minDuration(item.overlays) + 0.5 : 0);
        scheduleNext(total);
        if (ov) {
          var t0 = Date.now();
          ticker = setInterval(function () { ov.update((Date.now() - t0) / 1000, total); }, 100);
        }
      };
      img.onerror = onMediaError;
      img.src = src;
    }
  }

  // ======================= tela sempre ligada =======================

  var wakeLock = null;
  function keepAwake() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    navigator.wakeLock.request('screen').then(function (l) {
      wakeLock = l;
      l.addEventListener('release', function () { wakeLock = null; });
    })['catch'](function () { /* não suportado */ });
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignora */ } wakeLock = null; }
  }

  // ======================= eventos =======================

  function bindHome() {
    $('btnH').onclick = function () { startDisplay(0); };
    $('btnV').onclick = function () { startDisplay(selectedVerticalRotation()); };
    $('btnResume').onclick = function () {
      var s = Offline.getSession();
      startDisplay(s ? s.rotate : 0);
    };

    var radios = document.getElementsByName('vdir');
    for (var i = 0; i < radios.length; i++) {
      radios[i].onchange = function () {
        try { localStorage.setItem('totemGeri.vdir', this.value); } catch (e) { /* ignora */ }
      };
    }
    var savedDir = null;
    try { savedDir = localStorage.getItem('totemGeri.vdir'); } catch (e) { /* ignora */ }
    if (savedDir) for (var j = 0; j < radios.length; j++) radios[j].checked = radios[j].value === savedDir;

    var ids = ['optDuration', 'optMaxVideo', 'optFit', 'optSource', 'optShuffle', 'optSound', 'optQr'];
    for (var k = 0; k < ids.length; k++) {
      $(ids[k]).onchange = function () { saveOptionsForm(); updateHomeStatus(); };
    }
  }

  document.addEventListener('keydown', function (e) {
    if (!displaying) return;
    var key = e.key || '';
    var code = e.keyCode;
    if (key === 'Escape' || key === 'Backspace' || key === 'GoBack' || key === 'BrowserBack' ||
        code === 27 || code === 8 || code === 10009 /* Tizen */ || code === 461 /* webOS */) {
      e.preventDefault();
      stopDisplay();
    } else if (key === 'ArrowRight' || code === 39) {
      next();
    }
  });

  function onFullscreenChange() {
    // saiu da tela cheia (ex.: Esc no PC) -> volta para a tela inicial
    if (displaying && enteredFullscreen && !isFullscreen()) stopDisplay();
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // clique na exibição tenta (re)entrar em tela cheia, ex.: quando iniciou via ?auto=1
  stage.addEventListener('click', function () {
    if (displaying && !isFullscreen()) requestFullscreen();
  });

  window.addEventListener('resize', layoutCurrent);
  window.addEventListener('online', function () { if (!displaying) updateHomeStatus(); });
  window.addEventListener('offline', function () { if (!displaying) updateHomeStatus(); });
  document.addEventListener('visibilitychange', function () {
    if (displaying && document.visibilityState === 'visible') keepAwake();
  });

  // ======================= inicialização =======================

  function init() {
    buildConfig();
    fillOptionsForm();
    bindHome();
    Offline.register();

    loadManifest(function (data) {
      manifest = data;
      updateHomeStatus();
    });

    // início automático (para configurar como página inicial da TV)
    var params = urlParams();
    if (params.auto === 'resume') {
      var s = Offline.getSession();
      startDisplay(s ? s.rotate : 0, { noFullscreen: true });
    } else if (toBool(params.auto)) {
      var r = parseInt(params.rotate, 10);
      startDisplay(r === 90 || r === 180 || r === 270 ? r : 0, { noFullscreen: true });
    }
  }

  getJSON('config.json', function (err, data) {
    siteCfg = err ? {} : (data || {});
    window.TotemSiteConfig = siteCfg;
    init();
    if (window.TotemEditor) window.TotemEditor.init(siteCfg);
  });
})();
