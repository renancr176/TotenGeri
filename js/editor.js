/*
 * Editor de textos para os posts (usado pelo cliente no celular/PC).
 * Gera o "Markdown do Totem" (ver js/format.js) para colar no comentário do post.
 * Usa o mesmo renderizador da TV (js/overlay.js), então a pré-visualização é fiel.
 */
(function () {
  'use strict';

  var F = window.TotemFormat;
  var Overlay = window.TotemOverlay;

  var tag = F.DEFAULT_TAG;
  var imageDuration = 8;

  var state = {
    post: null,        // { media: [{type, src}], shortcode }
    slide: 0,
    overlays: [],
    sel: null,         // overlay selecionado (objeto)
    playing: false
  };

  var mediaEl = null;
  var mediaSize = { w: 0, h: 0 };
  var renderer = null;
  var visible = [];
  var raf = null;
  var objectUrl = null;

  function $(id) { return document.getElementById(id); }

  function msg(text, isError) {
    var el = $('edMsg');
    el.textContent = text || '';
    el.className = 'ed-msg' + (isError ? ' error' : '');
  }

  function getJSON(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?_=' + Date.now(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { cb(null, JSON.parse(xhr.responseText)); } catch (e) { cb(e); }
      } else cb(new Error('HTTP ' + xhr.status));
    };
    xhr.onerror = function () { cb(new Error('rede')); };
    xhr.send();
  }

  function isCarousel() {
    return state.post && state.post.media.length > 1;
  }

  // ---------------- carregar mídia ----------------

  function loadFromUrl() {
    var url = $('edUrl').value.trim();
    var code = F.shortcodeFromUrl(url);
    if (!code) { msg('URL inválida. Use o link do post, ex.: https://www.instagram.com/p/ABC123/', true); return; }
    msg('Procurando o post…');
    getJSON('posts.json', function (err, data) {
      if (err || !data || !data.posts) {
        msg('O Instagram ainda não está conectado ao totem. Use "Escolher foto/vídeo do aparelho" com o mesmo arquivo do post.', true);
        return;
      }
      var post = null;
      for (var i = 0; i < data.posts.length; i++) if (data.posts[i].shortcode === code) post = data.posts[i];
      if (!post) {
        msg('Post não encontrado. Posts novos aparecem aqui em até 1 hora. Enquanto isso, use "Escolher foto/vídeo do aparelho".', true);
        return;
      }
      setPost({ media: post.media, shortcode: code }, post.overlays || []);
      msg((post.tagged ? 'Post carregado (já marcado com ' + tag + ').' : 'Post carregado.') +
        (post.overlays && post.overlays.length ? ' Textos existentes foram carregados.' : ''));
    });
  }

  function loadFromFile(file) {
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    var type = /^video\//.test(file.type) ? 'video' : 'image';
    setPost({ media: [{ type: type, src: objectUrl }], shortcode: null }, state.overlays);
    msg('Arquivo carregado: ' + file.name);
  }

  function setPost(post, overlays) {
    stopPreview();
    state.post = post;
    state.overlays = overlays || [];
    state.sel = state.overlays[0] || null;
    renderSlides();
    showSlide(0);
    $('edAdd').disabled = false;
    $('edPlay').disabled = false;
  }

  function renderSlides() {
    var box = $('edSlides');
    box.innerHTML = '';
    if (!isCarousel()) return;
    for (var i = 0; i < state.post.media.length; i++) {
      (function (i) {
        var m = state.post.media[i];
        var b = document.createElement('button');
        b.type = 'button';
        b.className = i === state.slide ? 'active' : '';
        var img = document.createElement('img');
        img.src = m.type === 'video' ? (m.poster || '') : m.src;
        img.alt = '';
        b.appendChild(img);
        var n = document.createElement('span');
        n.textContent = (i + 1) + (m.type === 'video' ? ' ▶' : '');
        b.appendChild(n);
        b.onclick = function () { stopPreview(); showSlide(i); };
        box.appendChild(b);
      })(i);
    }
  }

  function showSlide(i) {
    state.slide = i;
    var slides = $('edSlides').children;
    for (var k = 0; k < slides.length; k++) slides[k].className = k === i ? 'active' : '';

    var m = state.post.media[i];
    var preview = $('edPreview');
    preview.innerHTML = '';
    renderer = null;

    if (m.type === 'video') {
      mediaEl = document.createElement('video');
      mediaEl.muted = true;
      mediaEl.setAttribute('playsinline', '');
      mediaEl.preload = 'auto';
      mediaEl.onloadedmetadata = function () {
        mediaSize = { w: mediaEl.videoWidth, h: mediaEl.videoHeight };
        try { mediaEl.currentTime = 0.1; } catch (e) { /* ignora */ }
        afterMediaReady();
      };
      mediaEl.onended = function () { stopPreview(); };
    } else {
      mediaEl = document.createElement('img');
      mediaEl.onload = function () {
        mediaSize = { w: mediaEl.naturalWidth, h: mediaEl.naturalHeight };
        afterMediaReady();
      };
    }
    mediaEl.onerror = function () { msg('Não foi possível abrir esta mídia neste navegador.', true); };
    preview.appendChild(mediaEl);
    mediaEl.src = m.src;
  }

  function afterMediaReady() {
    renderer = Overlay.create($('edPreview'), []);
    sizePreview();
    render();
  }

  function previewRect() {
    var p = $('edPreview');
    return { left: 0, top: 0, width: p.clientWidth, height: p.clientHeight };
  }

  function sizePreview() {
    if (!mediaSize.w) return;
    var wrapW = $('edPreviewWrap').clientWidth;
    var maxH = Math.min(window.innerHeight * 0.72, 720);
    var aspect = mediaSize.w / mediaSize.h;
    var w = Math.min(wrapW, maxH * aspect);
    var h = w / aspect;
    var p = $('edPreview');
    p.style.width = Math.round(w) + 'px';
    p.style.height = Math.round(h) + 'px';
    if (renderer) renderer.layout(previewRect());
  }

  // ---------------- renderização ----------------

  function computeVisible() {
    visible = isCarousel() ? F.forSlide(state.overlays, state.slide + 1) : state.overlays.slice();
  }

  function render() {
    computeVisible();
    if (state.sel && visible.indexOf(state.sel) < 0) state.sel = visible[0] || null;
    if (renderer) {
      renderer.setOverlays(visible);
      renderer.layout(previewRect());
      if (!state.playing) renderer.showStatic(visible.indexOf(state.sel));
    }
    renderList();
    renderProps();
    renderOutput();
  }

  /** Atualiza só o estilo/posição (mais leve, usado ao arrastar e digitar). */
  function refreshStyles() {
    if (!renderer) return;
    for (var i = 0; i < renderer.items.length; i++) {
      renderer.items[i].inner.textContent = renderer.items[i].o.text;
    }
    renderer.layout(previewRect());
    renderOutput();
  }

  function renderList() {
    var list = $('edList');
    list.innerHTML = '';
    if (!visible.length) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = state.post ? 'Nenhum texto neste ' + (isCarousel() ? 'slide' : 'post') + '. Toque em "+ Texto".' : '';
      list.appendChild(p);
      return;
    }
    for (var i = 0; i < visible.length; i++) {
      (function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = o === state.sel ? 'active' : '';
        b.textContent = (o.text || '(vazio)').replace(/\n/g, ' ') + '  ·  ' + o.t0 + 's' + (o.t1 !== null ? '–' + o.t1 + 's' : '+');
        b.onclick = function () { select(o); };
        list.appendChild(b);
      })(visible[i]);
    }
  }

  function select(o) {
    state.sel = o;
    if (renderer && !state.playing) renderer.showStatic(visible.indexOf(o));
    renderList();
    renderProps();
  }

  // ---------------- propriedades ----------------

  function renderProps() {
    var o = state.sel;
    $('edProps').disabled = !o;
    $('pAllSlidesWrap').hidden = !isCarousel();
    if (!o) return;
    $('pText').value = o.text;
    $('pSize').value = o.s;
    $('pSizeOut').textContent = o.s;
    $('pColor').value = '#' + (F.hex(o.c) || 'ffffff');
    $('pBold').checked = !!o.b;
    $('pOutline').checked = !!F.hex(o.o);
    $('pOutlineColor').value = '#' + (F.hex(o.o) || '000000');
    $('pOutlineW').value = o.w;
    $('pShadow').checked = !!o.sh;
    $('pBand').checked = !!F.hex(o.bg);
    $('pBandColor').value = '#' + (F.hex(o.bg) || '000000');
    $('pIn').value = o.fin;
    $('pOut').value = o.fout;
    $('pT0').value = o.t0;
    $('pT1').value = o.t1 === null ? '' : o.t1;
    $('pX').value = Math.round(o.x);
    $('pY').value = Math.round(o.y);
    $('pAllSlides').checked = !o.n;
  }

  function readProps() {
    var o = state.sel;
    if (!o) return;
    o.text = $('pText').value;
    o.s = parseFloat($('pSize').value) || 8;
    $('pSizeOut').textContent = o.s;
    o.c = $('pColor').value.replace('#', '');
    o.b = $('pBold').checked;
    o.o = $('pOutline').checked ? $('pOutlineColor').value.replace('#', '') : '';
    o.w = parseFloat($('pOutlineW').value) || 3;
    o.sh = $('pShadow').checked;
    o.bg = $('pBand').checked ? $('pBandColor').value.replace('#', '') : '';
    o.fin = $('pIn').value;
    o.fout = $('pOut').value;
    o.t0 = Math.max(0, parseFloat($('pT0').value) || 0);
    var t1 = parseFloat($('pT1').value);
    o.t1 = isNaN(t1) || t1 <= o.t0 ? null : t1;
    o.x = clamp(parseFloat($('pX').value), 0, 100, 50);
    o.y = clamp(parseFloat($('pY').value), 0, 100, 50);
    if (isCarousel()) o.n = $('pAllSlides').checked ? null : state.slide + 1;
  }

  function clamp(v, min, max, def) {
    if (isNaN(v)) return def;
    return Math.max(min, Math.min(max, v));
  }

  function bindProps() {
    var light = ['pText', 'pSize', 'pColor', 'pOutlineColor', 'pOutlineW', 'pBandColor', 'pX', 'pY'];
    var heavy = ['pBold', 'pOutline', 'pShadow', 'pBand', 'pIn', 'pOut', 'pT0', 'pT1', 'pAllSlides'];
    for (var i = 0; i < light.length; i++) {
      $(light[i]).addEventListener('input', function () { readProps(); refreshStyles(); renderListLabelsSoon(); });
    }
    for (var j = 0; j < heavy.length; j++) {
      $(heavy[j]).addEventListener('change', function () { readProps(); render(); });
    }
    // ao mudar a cor da borda/faixa, liga a opção automaticamente
    $('pOutlineColor').addEventListener('input', function () { $('pOutline').checked = true; readProps(); refreshStyles(); });
    $('pBandColor').addEventListener('input', function () { $('pBand').checked = true; readProps(); refreshStyles(); });

    $('pCenter').onclick = function () { if (!state.sel) return; state.sel.x = 50; state.sel.y = 50; render(); };
    $('pDup').onclick = function () {
      if (!state.sel) return;
      var copy = F.newOverlay(state.sel);
      copy.y = Math.min(95, copy.y + 10);
      state.overlays.push(copy);
      state.sel = copy;
      render();
    };
    $('pDel').onclick = function () {
      if (!state.sel) return;
      var i = state.overlays.indexOf(state.sel);
      if (i >= 0) state.overlays.splice(i, 1);
      state.sel = null;
      render();
    };
  }

  var listTimer = null;
  function renderListLabelsSoon() {
    if (listTimer) clearTimeout(listTimer);
    listTimer = setTimeout(renderList, 250);
  }

  function addText() {
    var o = F.newOverlay({ text: 'Seu texto aqui', s: 6, b: true, sh: true, n: isCarousel() ? state.slide + 1 : null });
    state.overlays.push(o);
    state.sel = o;
    render();
    var ta = $('pText');
    ta.focus();
    try { ta.select(); } catch (e) { /* ignora */ }
  }

  // ---------------- arrastar ----------------

  function bindDrag() {
    var preview = $('edPreview');
    var drag = null;

    preview.addEventListener('pointerdown', function (e) {
      if (state.playing || !renderer) return;
      var el = e.target;
      while (el && el !== preview && !(typeof el.className === 'string' && /(^|\s)ov(\s|$)/.test(el.className))) el = el.parentNode;
      if (!el || el === preview) return;
      var idx = Array.prototype.indexOf.call(renderer.box.children, el);
      var o = visible[idx];
      if (!o) return;
      select(o);
      drag = { o: o, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, id: e.pointerId };
      try { preview.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      preview.className = 'ed-preview dragging';
      e.preventDefault();
    });

    preview.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var r = previewRect();
      drag.o.x = Math.round(clamp(drag.ox + (e.clientX - drag.sx) / r.width * 100, 0, 100, 50) * 10) / 10;
      drag.o.y = Math.round(clamp(drag.oy + (e.clientY - drag.sy) / r.height * 100, 0, 100, 50) * 10) / 10;
      renderer.layout(r);
      $('pX').value = Math.round(drag.o.x);
      $('pY').value = Math.round(drag.o.y);
    });

    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      preview.className = 'ed-preview';
      renderOutput();
    }
    preview.addEventListener('pointerup', end);
    preview.addEventListener('pointercancel', end);
  }

  // ---------------- pré-visualização ----------------

  function playPreview() {
    if (state.playing) { stopPreview(); return; }
    if (!renderer || !mediaEl) return;
    state.playing = true;
    $('edPlay').textContent = '■ Parar';
    renderer.setOverlays(visible);
    renderer.layout(previewRect());
    renderer.update(0, 0);

    if (mediaEl.tagName === 'VIDEO') {
      mediaEl.currentTime = 0;
      var p = mediaEl.play();
      if (p && p['catch']) p['catch'](function () {});
      var loopV = function () {
        if (!state.playing) return;
        var total = mediaEl.duration || 0;
        renderer.update(mediaEl.currentTime, total);
        $('edTime').textContent = mediaEl.currentTime.toFixed(1) + 's / ' + total.toFixed(1) + 's';
        raf = requestAnimationFrame(loopV);
      };
      raf = requestAnimationFrame(loopV);
    } else {
      var total = Math.max(imageDuration, Overlay.minDuration(visible) + 0.5);
      var start = Date.now();
      var loopI = function () {
        if (!state.playing) return;
        var t = (Date.now() - start) / 1000;
        renderer.update(t, total);
        $('edTime').textContent = t.toFixed(1) + 's / ' + total.toFixed(1) + 's';
        if (t >= total) { stopPreview(); return; }
        raf = requestAnimationFrame(loopI);
      };
      raf = requestAnimationFrame(loopI);
    }
  }

  function stopPreview() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    var was = state.playing;
    state.playing = false;
    $('edPlay').textContent = '▶ Pré-visualizar';
    $('edTime').textContent = '';
    if (mediaEl && mediaEl.tagName === 'VIDEO') { try { mediaEl.pause(); } catch (e) { /* ignora */ } }
    if (was && renderer) renderer.showStatic(visible.indexOf(state.sel));
  }

  // ---------------- saída Markdown ----------------

  function renderOutput() {
    $('edOut').value = F.serialize(state.overlays, tag);
    $('edCopyMsg').textContent = '';
  }

  function copyOutput() {
    var text = $('edOut').value;
    var done = function () {
      var n = text.length;
      $('edCopyMsg').textContent = 'Copiado! (' + n + ' caracteres' + (n > 2200 ? ' - ATENÇÃO: o Instagram aceita no máximo 2.200' : '') + ')';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) && done(); });
    } else if (legacyCopy(text)) {
      done();
    }
  }

  function legacyCopy(text) {
    var ta = $('edOut');
    ta.focus();
    ta.select();
    try { return document.execCommand('copy'); } catch (e) { return false; }
  }

  function importOutput() {
    var parsed = F.parse($('edOut').value, tag);
    if (!parsed.overlays.length) { $('edCopyMsg').textContent = 'Nenhum texto encontrado no Markdown.'; return; }
    state.overlays = parsed.overlays;
    state.sel = null;
    render();
    $('edCopyMsg').textContent = parsed.overlays.length + ' texto(s) carregado(s).';
  }

  // ---------------- init ----------------

  function fillEffects(select) {
    for (var i = 0; i < F.EFFECTS.length; i++) {
      var opt = document.createElement('option');
      opt.value = F.EFFECTS[i].id;
      opt.textContent = F.EFFECTS[i].label;
      select.appendChild(opt);
    }
  }

  function init(siteCfg) {
    siteCfg = siteCfg || {};
    if (siteCfg.instagram && siteCfg.instagram.tag) tag = siteCfg.instagram.tag;
    if (siteCfg.duration) imageDuration = parseFloat(siteCfg.duration) || 8;
    $('tagHint1').textContent = tag;
    $('tagHint2').textContent = tag;

    fillEffects($('pIn'));
    fillEffects($('pOut'));
    bindProps();
    bindDrag();

    $('edLoadUrl').onclick = loadFromUrl;
    $('edUrl').addEventListener('keydown', function (e) { if (e.key === 'Enter') loadFromUrl(); });
    $('edFile').onchange = function () { loadFromFile(this.files && this.files[0]); this.value = ''; };
    $('edAdd').onclick = addText;
    $('edPlay').onclick = playPreview;
    $('edCopy').onclick = copyOutput;
    $('edImport').onclick = importOutput;
    window.addEventListener('resize', sizePreview);
    renderOutput();
  }

  window.TotemEditor = { init: init };
})();
