/*
 * Formato "Markdown do Totem" - compartilhado entre o editor (navegador),
 * o player (TV) e o build (Node, via require).
 *
 * Exemplo de comentário/legenda no Instagram:
 *
 *   #totemgeri
 *   [Corte + Barba](x=50 y=20 s=8 c=ffffff b=1 o=000000 w=3 in=slide-down out=fade t=0-6)
 *   [Só R$ 60](x=50 y=80 s=10 c=e0a526 in=pop out=pop t=1.5)
 *
 * - A hashtag (#totemgeri) marca o post para aparecer no totem.
 * - Cada [texto](parâmetros) é um texto sobreposto. Parâmetros (todos opcionais):
 *     x, y   posição do centro do texto em % da mídia (0-100)       padrão 50 50
 *     s      tamanho da fonte em % da altura da mídia              padrão 8
 *     c      cor do texto (hex sem #, para não virar hashtag)      padrão ffffff
 *     b=1    negrito
 *     o, w   cor e espessura (1-10) da borda do texto              sem borda
 *     sh=1   sombra
 *     bg     cor de uma faixa de fundo atrás do texto (hex)         sem faixa
 *     in,out efeito de entrada/saída (ver EFFECTS)                  fade
 *     t      tempo em segundos: "1.5" (de 1.5s até o fim) ou "1-6"  do início ao fim
 *     n      número do slide no carrossel (1, 2, ...)              todos
 * - No texto: \n = quebra de linha, \] e \\ escapam caracteres.
 *
 * Escrito em ES5 (roda em TVs antigas).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TotemFormat = api;
})(this, function () {
  'use strict';

  var DEFAULT_TAG = '#totemgeri';

  var EFFECTS = [
    { id: 'none', label: 'Nenhum' },
    { id: 'fade', label: 'Esmaecer (fade)' },
    { id: 'slide-up', label: 'Deslizar para cima' },
    { id: 'slide-down', label: 'Deslizar para baixo' },
    { id: 'slide-left', label: 'Deslizar para a esquerda' },
    { id: 'slide-right', label: 'Deslizar para a direita' },
    { id: 'pop', label: 'Pop (estoura)' },
    { id: 'zoom', label: 'Zoom' },
    { id: 'bounce', label: 'Quicar' },
    { id: 'flip', label: 'Girar (flip)' },
    { id: 'blur', label: 'Desfocar' }
  ];

  var DEFAULTS = {
    text: '',
    x: 50, y: 50, s: 8,
    c: 'ffffff', b: false,
    o: '', w: 3,
    sh: false, bg: '',
    fin: 'fade', fout: 'fade',
    t0: 0, t1: null,
    n: null
  };

  function isEffect(id) {
    for (var i = 0; i < EFFECTS.length; i++) if (EFFECTS[i].id === id) return true;
    return false;
  }

  function hex(v) {
    v = String(v || '').replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(v)) v = v.charAt(0) + v.charAt(0) + v.charAt(1) + v.charAt(1) + v.charAt(2) + v.charAt(2);
    return /^[0-9a-f]{6}$/.test(v) ? v : '';
  }

  function num(v, def, min, max) {
    var n = parseFloat(v);
    if (isNaN(n)) return def;
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    return Math.round(n * 100) / 100;
  }

  function clone(o) {
    var r = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k];
    return r;
  }

  function newOverlay(props) {
    var o = clone(DEFAULTS);
    if (props) for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) o[k] = props[k];
    return o;
  }

  function unescapeText(s) {
    return s.replace(/\\(n|\\|\]|\[)/g, function (_, ch) { return ch === 'n' ? '\n' : ch; });
  }

  function escapeText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\[/g, '\\[').replace(/\r?\n/g, '\\n');
  }

  function parseParams(str, o) {
    var tokens = str.split(/[\s;,]+/);
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (!tok) continue;
      var eq = tok.indexOf('=');
      var key = (eq < 0 ? tok : tok.slice(0, eq)).toLowerCase();
      var val = eq < 0 ? '1' : tok.slice(eq + 1);
      switch (key) {
        case 'x': o.x = num(val, 50, 0, 100); break;
        case 'y': o.y = num(val, 50, 0, 100); break;
        case 's': o.s = num(val, 8, 1, 50); break;
        case 'c': o.c = hex(val) || 'ffffff'; break;
        case 'b': o.b = val !== '0'; break;
        case 'o': o.o = hex(val); break;
        case 'w': o.w = num(val, 3, 1, 10); break;
        case 'sh': o.sh = val !== '0'; break;
        case 'bg': o.bg = hex(val); break;
        case 'in': o.fin = isEffect(val) ? val : 'fade'; break;
        case 'out': o.fout = isEffect(val) ? val : 'fade'; break;
        case 'n': o.n = Math.max(1, parseInt(val, 10) || 1); break;
        case 't':
          var parts = val.split('-');
          o.t0 = num(parts[0], 0, 0);
          o.t1 = parts.length > 1 && parts[1] !== '' ? num(parts[1], null, 0) : null;
          if (o.t1 !== null && o.t1 <= o.t0) o.t1 = null;
          break;
      }
    }
    return o;
  }

  /**
   * Lê um texto (legenda ou comentário) e devolve
   * { tagged: bool, overlays: [ ... ] }
   */
  function parse(text, tag) {
    tag = (tag || DEFAULT_TAG).toLowerCase();
    text = String(text || '');
    var result = { tagged: text.toLowerCase().indexOf(tag) >= 0, overlays: [] };
    var re = /\[((?:\\.|[^\]\\])*)\]\(([^)]*)\)/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var params = m[2];
      // ignora links normais (http...) que não são do totem
      if (/^\s*(https?:|www\.)/i.test(params)) continue;
      var o = newOverlay({ text: unescapeText(m[1]) });
      parseParams(params, o);
      if (o.text.replace(/\s/g, '') !== '') result.overlays.push(o);
    }
    return result;
  }

  function fmt(n) {
    return String(Math.round(n * 100) / 100);
  }

  /** Gera a linha [texto](params) de um overlay, omitindo valores padrão. */
  function serializeOverlay(o) {
    var p = [];
    p.push('x=' + fmt(o.x));
    p.push('y=' + fmt(o.y));
    if (o.s !== DEFAULTS.s) p.push('s=' + fmt(o.s));
    if (hex(o.c) && hex(o.c) !== 'ffffff') p.push('c=' + hex(o.c));
    if (o.b) p.push('b=1');
    if (hex(o.o)) { p.push('o=' + hex(o.o)); if (o.w !== DEFAULTS.w) p.push('w=' + fmt(o.w)); }
    if (o.sh) p.push('sh=1');
    if (hex(o.bg)) p.push('bg=' + hex(o.bg));
    if (o.fin !== 'fade') p.push('in=' + o.fin);
    if (o.fout !== 'fade') p.push('out=' + o.fout);
    if (o.t0 > 0 || o.t1 !== null) p.push('t=' + fmt(o.t0 || 0) + (o.t1 !== null ? '-' + fmt(o.t1) : ''));
    if (o.n) p.push('n=' + o.n);
    return '[' + escapeText(o.text) + '](' + p.join(' ') + ')';
  }

  /** Gera o texto completo para colar no comentário/legenda do post. */
  function serialize(overlays, tag) {
    var lines = [tag || DEFAULT_TAG];
    for (var i = 0; i < overlays.length; i++) {
      if (String(overlays[i].text).replace(/\s/g, '') !== '') lines.push(serializeOverlay(overlays[i]));
    }
    return lines.join('\n');
  }

  /** Overlays que valem para o slide `index` (1-based) de um carrossel. */
  function forSlide(overlays, index) {
    var out = [];
    for (var i = 0; i < (overlays || []).length; i++) {
      var o = overlays[i];
      if (!o.n || o.n === index) out.push(o);
    }
    return out;
  }

  /** Extrai o shortcode de uma URL de post/reel do Instagram. */
  function shortcodeFromUrl(url) {
    var m = /instagram\.com\/(?:[^\/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i.exec(String(url || ''));
    return m ? m[1] : null;
  }

  return {
    DEFAULT_TAG: DEFAULT_TAG,
    EFFECTS: EFFECTS,
    DEFAULTS: DEFAULTS,
    newOverlay: newOverlay,
    parse: parse,
    serialize: serialize,
    serializeOverlay: serializeOverlay,
    forSlide: forSlide,
    shortcodeFromUrl: shortcodeFromUrl,
    hex: hex
  };
});
