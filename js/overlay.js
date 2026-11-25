/*
 * Renderizador dos textos sobrepostos - usado pelo player (TV) e pelo editor,
 * para que a pré-visualização seja idêntica ao que aparece no totem.
 * Depende de TotemFormat (js/format.js). ES5.
 */
(function (root) {
  'use strict';

  var FX_DURATION = 0.7; // segundos de cada efeito de entrada/saída (igual ao CSS)

  function rgba(hex, a) {
    hex = root.TotemFormat.hex(hex) || '000000';
    return 'rgba(' + parseInt(hex.substr(0, 2), 16) + ',' + parseInt(hex.substr(2, 2), 16) + ',' +
      parseInt(hex.substr(4, 2), 16) + ',' + a + ')';
  }

  /** Retângulo ocupado pela mídia (mw x mh) dentro do container (cw x ch). */
  function fitRect(cw, ch, mw, mh, mode) {
    if (!mw || !mh) return { left: 0, top: 0, width: cw, height: ch };
    var scale = mode === 'cover' ? Math.max(cw / mw, ch / mh) : Math.min(cw / mw, ch / mh);
    var w = mw * scale, h = mh * scale;
    return { left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h };
  }

  function Overlay(container, overlays) {
    this.box = document.createElement('div');
    this.box.className = 'ov-box';
    this.items = [];
    this.rect = null;
    container.appendChild(this.box);
    this.setOverlays(overlays || []);
  }

  Overlay.prototype.setOverlays = function (overlays) {
    this.box.innerHTML = '';
    this.items = [];
    for (var i = 0; i < overlays.length; i++) {
      var o = overlays[i];
      var el = document.createElement('div');
      el.className = 'ov p-before';
      var inner = document.createElement('div');
      inner.className = 'ov-t';
      inner.textContent = o.text;
      el.appendChild(inner);
      this.box.appendChild(el);
      this.items.push({ o: o, el: el, inner: inner, phase: 'before' });
    }
    if (this.rect) this.layout(this.rect);
  };

  /** Posiciona a caixa sobre a mídia e recalcula tamanhos de fonte. */
  Overlay.prototype.layout = function (rect) {
    this.rect = rect;
    var s = this.box.style;
    s.left = rect.left + 'px';
    s.top = rect.top + 'px';
    s.width = rect.width + 'px';
    s.height = rect.height + 'px';
    for (var i = 0; i < this.items.length; i++) this.styleItem(this.items[i]);
  };

  Overlay.prototype.styleItem = function (it) {
    var o = it.o;
    var h = this.rect ? this.rect.height : 500;
    var fontPx = Math.max(6, (o.s / 100) * h);
    var es = it.el.style;
    es.left = o.x + '%';
    es.top = o.y + '%';
    // rotação no .ov (os efeitos animam o .ov-t interno, então não conflitam)
    var tr = 'translate(-50%, -50%)' + (o.r ? ' rotate(' + o.r + 'deg)' : '');
    es.transform = tr;
    es.webkitTransform = tr;
    var s = it.inner.style;
    s.fontSize = fontPx + 'px';
    s.fontFamily = root.TotemFormat.font(o.f).css;
    s.fontStyle = o.i ? 'italic' : 'normal';
    s.color = '#' + (root.TotemFormat.hex(o.c) || 'ffffff');
    s.fontWeight = o.b ? '800' : '400';
    var stroke = root.TotemFormat.hex(o.o);
    if (stroke) {
      var w = (o.w * fontPx / 40).toFixed(2) + 'px #' + stroke;
      s.webkitTextStroke = w;
      s.textStroke = w;
    } else {
      s.webkitTextStroke = '';
      s.textStroke = '';
    }
    s.textShadow = o.sh ? '0 0.06em 0.18em rgba(0,0,0,0.85), 0 0 0.5em rgba(0,0,0,0.5)' : '';
    if (root.TotemFormat.hex(o.bg)) {
      s.backgroundColor = rgba(o.bg, 0.7);
      s.padding = '0.12em 0.45em';
      s.borderRadius = '0.18em';
    } else {
      s.backgroundColor = '';
      s.padding = '';
      s.borderRadius = '';
    }
  };

  Overlay.prototype.setPhase = function (it, phase) {
    if (it.phase === phase) return;
    it.phase = phase;
    var o = it.o;
    it.el.className = 'ov p-' + phase;
    if (phase === 'in') it.inner.className = 'ov-t fx-in-' + o.fin;
    else if (phase === 'out') it.inner.className = 'ov-t fx-out-' + o.fout;
    else it.inner.className = 'ov-t';
  };

  /**
   * Atualiza a visibilidade/efeitos para o instante t (segundos desde o início da mídia).
   * total = duração total da mídia (para textos "até o fim").
   */
  Overlay.prototype.update = function (t, total) {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      var start = it.o.t0 || 0;
      var end = it.o.t1 !== null && it.o.t1 !== undefined ? it.o.t1 : total;
      var phase;
      if (t < start) phase = 'before';
      else if (end && t >= end) phase = 'after';
      else if (end && t >= end - FX_DURATION && it.o.fout !== 'none') phase = 'out';
      else phase = 'in';
      this.setPhase(it, phase);
    }
  };

  /** Mostra todos os textos parados (modo edição). */
  Overlay.prototype.showStatic = function (selectedIndex) {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      it.phase = 'static';
      it.el.className = 'ov p-static' + (i === selectedIndex ? ' selected' : '');
      it.inner.className = 'ov-t';
    }
  };

  Overlay.prototype.destroy = function () {
    if (this.box.parentNode) this.box.parentNode.removeChild(this.box);
    this.items = [];
  };

  /** Duração mínima para que todos os textos terminem de aparecer. */
  function minDuration(overlays) {
    var max = 0;
    for (var i = 0; i < (overlays || []).length; i++) {
      var o = overlays[i];
      var end = o.t1 !== null && o.t1 !== undefined ? o.t1 : (o.t0 || 0) + 3;
      if (end > max) max = end;
    }
    return max;
  }

  root.TotemOverlay = {
    FX_DURATION: FX_DURATION,
    fitRect: fitRect,
    create: function (container, overlays) { return new Overlay(container, overlays); },
    minDuration: minDuration
  };
})(this);
