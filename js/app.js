/* Country Guesser - name all 197 countries.
 *
 * Everything is client side. data/mapdata.js holds pre-projected SVG paths
 * (Equal Earth, baked at build time by build/build_map.py), so there is no
 * mapping library and no network traffic at all.
 */
(function () {
  'use strict';

  var DATA = window.MAP_DATA;
  var STRINGS = window.STRINGS || {};     // i18n/en.js, or whatever replaces it
  var NS = 'http://www.w3.org/2000/svg';
  var W = DATA.width;
  var H = DATA.height;
  var WRAP = DATA.wrap;          // extra width east of 180 deg, for Oceania
  var K_MIN = 1;
  var K_MAX = 600;        // deep enough to actually look at Vatican City
  var ZOOM_STEP = 2.2;    // per button press or key
  var POP_PIXELS = 5;     // how far a correct guess swells, on screen
  var POP_MAX = 0.1;      // ... but never more than a tenth of its size
  var POP_DRIFT = 10;     // ... and no outlying island moves further than this
  var DOT_PX = 2.6;              // locator dot radius, in screen pixels
  var DOT_LIMIT = 3;             // show a dot while the shape is thinner than this
  var FONT_PX = 11.5;            // country names, in screen pixels
  var QUESTION_PX = 13;          // ... and an unguessed country's question mark
  var HALO_PX = 3;               // the outline that keeps names off the land
  var STORE_KEY = 'country-guesser:progress:v1';
  var MODE_KEY = 'country-guesser:mode:v1';
  var REGION_KEY = 'country-guesser:region:v1';
  var OPTIONS_KEY = 'country-guesser:options:v2';
  var PICK_PX = 13;              // the ring round a picked country, on screen
  var PICK_SLACK = 16;           // open water round a marker that still counts
  var PICK_TIGHT = 9;            // ... but a marker over land has to be hit closer
  var TAP_SLOP = 6;              // further than this and it was a drag, not a tap
  var QUIZ_PAD = 10;             // map units of open country framed round the quiz
  var QUIZ_SHARE = 0.75;         // ... and three quarters of its own span again
  var QUIZ_K_MAX = 6;            // the closest the quiz camera ever comes
  var QUIZ_K_SEA = 3;            // ... and Oceania stays wider still
  var SEA_REGION = 'Oceania';    // ... that region, as the map data names it
  var SEA_WEST = DATA.views[SEA_REGION][0];   // ... and where the Pacific starts
  var QUIZ_PAUSE = 900;          // the tick gets its moment before the next one
  var SWALLOW_MS = 350;          // ... and a scored name's tail is eaten for this long
  var COUNT_FROM = 3;            // the countdown a run opens with
  var COUNT_STEP = 800;          // ... one number at a time
  var MIN_LIMIT = 120;           // no region is given less of a clock than this
  var LIMIT_STEP = 30;           // ... and every clock lands on a half minute
  var REGION_PACE = 2;           // ... and a region runs at half the world's pace
  var KIM_CUT = 5 * 60;          // Kim Mode: off the whole world's clock
  var KIM_SHARE = 2 / 3;         // ... and a region keeps this much of its own
  var KIM_MIN = 90;              // ... never less than this
  var HOME_FILL = 0.92;          // how much of the screen the region fills
  var BOO = '\ud83d\udc4e';      // an outdated name
  var TICK = ['\u2705', '\ud83c\udf89', '\ud83d\udc4f', '\ud83d\ude4c', '\ud83c\udf1f',
              '\ud83d\udcaf', '\ud83d\udc4d', '\ud83e\udd73']; // ... and one the quiz accepted
  var SOB = '\ud83d\ude2d';      // ... and the one wrong answer Hardcore allows
  var TEXAS = 'republic of texas'; // the easter egg, typed anywhere
  var TRASH = '\ud83d\uddd1\ufe0f'; // ... and a colonial name: straight to jail
  var STRUCK_PAUSE = 1100;       // ... which gets its moment before the results

  /* The games on offer: rules only. Every word a player reads lives in the
   * strings file under modes.<id>, and is reached through modeText().
   *
   * `pick` is the hard rule: a name only scores for the country you clicked
   * first. Every game carries its own clock, even where the number lands on
   * the same quarter of an hour as its neighbour's.
   *
   * `quiz` turns that round: the game chooses, lighting one unlabelled
   * country at a time and leaving no mark on the map as it goes.
   *
   * `limit` is the clock for the whole world. One region is given the same
   * seconds per country - see limitFor().
   *
   * `options` are the switches the splash offers under the games while this
   * one is chosen, each a checkbox worded under options.<name>. A switch is
   * one setting shared by every game that offers it, so Kim Mode stays on
   * from one game to the next; a game ignores any it does not list. */
  var MODES = {
    normal: { id: 'normal', pick: false, limit: 15 * 60, options: ['hardcore', 'kim'] },
    hard: { id: 'hard', pick: true, limit: 15 * 60, options: ['hardcore', 'kim'] },
    'name-that-country': {
      id: 'name-that-country', quiz: true, limit: 20 * 60,
      options: ['hardcore', 'kim', 'help']
    }
  };

  // ------------------------------------------------------------------ helpers
  function el(name) { return document.createElementNS(NS, name); }
  function $(id) { return document.getElementById(id); }

  function slug(text) { return text.toLowerCase().replace(/\s+/g, '-'); }

  /** One line of wording, by dotted key, with its {tokens} filled in.
   *
   * A missing key returns the key itself: a run with a half-translated file
   * should say which line is missing, not fall silently blank.
   */
  function t(key, vars) {
    var text = key.split('.').reduce(function (node, part) {
      return node && typeof node === 'object' ? node[part] : undefined;
    }, STRINGS);
    if (typeof text !== 'string') return key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      return vars[name] === undefined ? whole : vars[name];
    });
  }

  /** The clock a game gets over `count` countries, in seconds.
   *
   * A region is a smaller job than the world and starts from its share of
   * the world's clock - but it gets REGION_PACE times that, because a
   * region is slower going per country than the world is. A world run is
   * carried by the continents you can empty from memory, and a player who
   * never reaches them has no such run-up: Oceania alone is fourteen of the
   * hardest names on the map.
   *
   * The result lands on the half minute, so the splash can promise it
   * honestly, and never falls below MIN_LIMIT.
   *
   * Kim Mode, where the game has it on, takes KIM_CUT off the world and a
   * third off a region - still on the half minute, and with a floor of its
   * own, KIM_MIN, under the usual one.
   */
  function limitFor(game, count) {
    var share = (count / countries.length) * (scope ? REGION_PACE : 1);
    var want = Math.round((game.limit * share) / LIMIT_STEP) * LIMIT_STEP;
    var base = Math.max(MIN_LIMIT, want);
    if (!optionsFor(game.id).kim) return base;
    if (!scope) return base - KIM_CUT;
    return Math.max(KIM_MIN, Math.round((base * KIM_SHARE) / LIMIT_STEP) * LIMIT_STEP);
  }

  /** The regions holding countries in play. */
  function liveRegions() {
    return scope ? [scope] : DATA.regions;
  }

  /** Wording that belongs to the game being played. */
  function modeText(name, vars) {
    return t('modes.' + mode.id + '.' + name, vars);
  }

  /** Must a name match the one country lit up on the map? Hard mode and the
   * quiz both say yes, and differ only in who lit it. */
  function targeted() {
    return !!(mode.pick || mode.quiz);
  }

  function normalize(text) {
    return text.normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function overlaps(a, b) {
    return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  }

  function show(node, visible) {
    node.classList.toggle('hidden', !visible);
  }

  /** Restart the little pop, even if the element still carries the class.
   *
   * Two things keep it in proportion. The scale makes the country swell by
   * roughly POP_PIXELS on screen rather than by a flat percentage, and the
   * origin sits on the country's own middle rather than the centre of its
   * bounding box — for the United States that box stretches from Hawaii to
   * Wake Island, so scaling about it slid the country sideways.
   */
  function replay(node, fixed) {
    node.classList.remove('pop');
    var box = node.popBox || (node.popBox = node.getBBox());   // also reflows
    var scale = fixed;

    if (!scale) {
      var c = node.country;
      var anchor = node.anchor || { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      var span = (c ? c.span : Math.max(box.width, box.height)) || 0.001;

      // Furthest corner from the anchor: for the United States that is Wake
      // Island, and it should not go sailing off while the mainland breathes.
      var reach = Math.max(
        Math.abs(anchor.x - box.x), Math.abs(box.x + box.width - anchor.x),
        Math.abs(anchor.y - box.y), Math.abs(box.y + box.height - anchor.y), 0.001);

      scale = 1 + Math.min(POP_MAX, POP_PIXELS / (span * k), POP_DRIFT / (reach * k));

      if (node.anchor && box.width > 0 && box.height > 0) {
        node.style.transformOrigin =
          (((anchor.x - box.x) / box.width) * 100).toFixed(2) + '% ' +
          (((anchor.y - box.y) / box.height) * 100).toFixed(2) + '%';
      }
    }
    node.style.setProperty('--pop', scale.toFixed(4));
    node.classList.add('pop');
  }

  // -------------------------------------------------------------------- state
  var svg = $('map');
  var viewport = $('viewport');
  var input = $('guess');
  var hintEl = $('guess-hint');
  var tipEl = $('tip');
  var toastEl = $('toast');
  var sheet = $('sheet');

  var countries = DATA.countries.map(function (c) {
    return {
      id: c.id, name: c.name, region: c.region, answers: c.answers,
      area: c.area, bbox: c.bbox, d: c.d,
      d2: c.d2,
      old: c.old || [],
      span: Math.max(c.bbox[2] - c.bbox[0], c.bbox[3] - c.bbox[1], 0.5),
      anchors: [{ x: c.lx, y: c.ly, ir: c.ir, east: !!c.e }].concat(
        c.lx2 === undefined ? []
          : [{ x: c.lx2, y: c.ly2, ir: c.ir2 || c.ir, east: !c.e }]),
      found: false, inPlay: true, path: null, paths: []
    };
  });

  var byId = {};
  countries.forEach(function (c) { byId[c.id] = c; });

  var k = 1, tx = 0, ty = 0;     // viewport transform
  var mode = MODES.normal;
  var scope = null;              // the region in play, or null for the world
  var pool = countries;          // ... and the countries that region holds
  var limit = MODES.normal.limit;   // the clock this game and region get
  var selected = null;           // hard mode: the country waiting to be named
  var revealed = false;
  var foundCount = 0;
  var lastFound = null;
  var startedAt = null;
  var elapsed = 0;
  var over = false;              // run finished: won, gave up, or ran out
  var ended = null;              // how the finished run ended, for its results
  var struck = null;             // Hardcore: the wrong answer that ended it,
                                 // or the colonial name that jailed the run
  var queue = [];                // quiz: the countries still to come this pass
  var nextTimer = null;          // ... and the wait before the next one
  var swallowing = null;         // quiz: the tail of a name already scored
  var waiting = false;           // the splash is up: the run has not begun
  var countTimer = null;         // ... and the wait between 3, 2 and 1
  var ticker = null;
  var anim = null;

  // ------------------------------------------------------------------ drawing
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  $('frame').setAttribute('d', DATA.frame);
  $('frame-east').setAttribute('d', DATA.frameEast);
  $('territories').setAttribute('d', DATA.territories);
  $('territories-east').setAttribute('d', DATA.territoriesEast);

  DATA.graticule.forEach(function (d) {
    var p = el('path');
    p.setAttribute('d', d);
    $('graticule').appendChild(p);
  });
  DATA.graticuleEast.forEach(function (d) {
    var p = el('path');
    p.setAttribute('class', 'east');
    p.setAttribute('d', d);
    $('graticule').appendChild(p);
  });

  var lands = $('continents');
  var dots = $('dots');
  var labels = $('labels');

  DATA.regions.forEach(function (region) {
    [lands, dots].forEach(function (parent) {
      var g = el('g');
      g.setAttribute('data-region', region);
      g.style.setProperty('--region', 'var(--' + slug(region) + ')');
      parent.appendChild(g);
    });
  });

  function groupFor(parent, region) {
    return parent.querySelector('g[data-region="' + region + '"]');
  }

  countries.forEach(function (c) {
    [c.d, c.d2].forEach(function (shape, index) {
      if (!shape) return;
      var path = el('path');
      path.setAttribute('class', index ? 'country east' : 'country');
      path.addEventListener('animationend', function () {
        path.classList.remove('pop');
      });
      path.setAttribute('d', shape);
      path.country = c;
      path.anchor = c.anchors.filter(function (a) {
        return index ? a.east : !a.east;
      })[0] || c.anchors[0];
      groupFor(lands, c.region).appendChild(path);
      c.paths.push(path);
      if (!index) c.path = path;
    });
    c.anchors.forEach(function (a) {
      var dot = el('circle');
      dot.addEventListener('animationend', function () { dot.classList.remove('pop'); });
      dot.setAttribute('class', 'dot hidden');
      dot.setAttribute('cx', a.x);
      dot.setAttribute('cy', a.y);
      dot.setAttribute('r', DOT_PX);
      dot.country = c;
      groupFor(dots, c.region).appendChild(dot);

      var label = el('text');
      label.setAttribute('class', 'label hidden');
      label.textContent = c.name;
      labels.appendChild(label);

      a.dot = dot;
      a.label = label;
    });
  });

  // ------------------------------------------------------------------ viewport
  function clampView() {
    k = Math.max(K_MIN, Math.min(K_MAX, k));
    tx = Math.min(0, Math.max(W - k * (W + WRAP), tx));
    ty = Math.min(0, Math.max(H - k * H, ty));
  }

  function applyView() {
    viewport.setAttribute('transform', 'translate(' + tx + ' ' + ty + ') scale(' + k + ')');
    draw();
  }

  /** Screen pixels per SVG user unit (the viewBox is letterboxed to fit). */
  function unitScale() {
    var box = svg.getBoundingClientRect();
    return Math.min(box.width / W, box.height / H) || 1;
  }

  function toMap(clientX, clientY) {
    var ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function zoomAbout(point, factor) {
    var wx = (point.x - tx) / k;
    var wy = (point.y - ty) / k;
    k = Math.max(K_MIN, Math.min(K_MAX, k * factor));
    tx = point.x - wx * k;
    ty = point.y - wy * k;
    clampView();
    applyView();
  }

  function viewForBox(box, fill) {
    var bw = Math.max(box[2] - box[0], 1.5);
    var bh = Math.max(box[3] - box[1], 1.5);
    var want = Math.min(W / bw, H / bh) * (fill || 0.8);
    var target = { k: Math.max(K_MIN, Math.min(K_MAX, want)) };
    target.tx = W / 2 - ((box[0] + box[2]) / 2) * target.k;
    target.ty = H / 2 - ((box[1] + box[3]) / 2) * target.k;
    var save = [k, tx, ty];
    k = target.k; tx = target.tx; ty = target.ty;
    clampView();
    target = { k: k, tx: tx, ty: ty };
    k = save[0]; tx = save[1]; ty = save[2];
    return target;
  }

  /** Where the camera stands to look at everything in play: the region, or
   * the whole map. A run opens here, and the fit button comes back to it. */
  function homeView() {
    return scope ? viewForBox(DATA.views[scope], HOME_FILL) : { k: 1, tx: 0, ty: 0 };
  }

  function flyTo(target, ms) {
    var from = { k: k, tx: tx, ty: ty };
    var t0 = performance.now();
    var span = ms === undefined ? 520 : ms;
    if (anim) cancelAnimationFrame(anim);
    function step(now) {
      var u = Math.min(1, (now - t0) / span);
      var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      k = from.k + (target.k - from.k) * e;
      tx = from.tx + (target.tx - from.tx) * e;
      ty = from.ty + (target.ty - from.ty) * e;
      applyView();
      if (u < 1) anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
  }

  /** There with no journey: for boot, and for a region chosen behind the
   * splash, where there is nothing to watch the camera travel over. */
  function jumpTo(target) {
    if (anim) cancelAnimationFrame(anim);
    k = target.k; tx = target.tx; ty = target.ty;
    clampView();
    applyView();
  }

  // --------------------------------------------------------- labels and dots
  var pending = false;

  function draw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      render();
    });
  }

  function render() {
    $('zoom-readout').textContent =
      t('map.zoomLevel', { zoom: k < 10 ? k.toFixed(1) : Math.round(k) });

    // The Pacific continues east of 180 so Oceania holds together, but that
    // copy only appears once the view actually reaches past the date line.
    var showEast = (W - tx) / k > W + 0.5;
    svg.classList.toggle('no-east', !showEast);

    // One screen pixel, in map units. Everything a reader has to see is sized
    // through this, so a phone gets the same legible text a laptop does.
    var px = 1 / unitScale();
    var nameSize = FONT_PX * px;
    labels.style.fontSize = nameSize.toFixed(3) + 'px';
    labels.style.strokeWidth = (HALO_PX * px).toFixed(3) + 'px';

    // The fewer question marks a continent has left, the larger they get:
    // the last one standing among solved neighbours should be unmissable.
    var swell = {};
    liveRegions().forEach(function (region) {
      var all = pool.filter(function (c) { return c.region === region; });
      var got = all.filter(function (c) { return c.found; }).length;
      var share = all.length ? got / all.length : 0;
      swell[region] = 1 + 0.85 * share * share;
    });

    // Name That Country shows a country and nothing else: no names to read
    // off, and no question marks either, since a map full of them is a map of
    // what is left to ask. The names all come back when the run is over.
    var blind = mode.quiz && !revealed;

    var candidates = [];
    countries.forEach(function (c) {
      var named = c.found || revealed;
      c.anchors.forEach(function (a) {
        a.live = false;
        a.box = null;
        // Outside the chosen region: no dot, and above all no question mark.
        // A region game asks for its own countries and marks nothing else.
        if (!c.inPlay || (a.east && !showEast)) {    // or its copy east of 180
          show(a.dot, false);
          show(a.label, false);
          return;
        }
        var sx = a.x * k + tx;
        var sy = a.y * k + ty;
        var onScreen = sx > -40 && sx < W + 40 && sy > -24 && sy < H + 24;
        var small = a.ir * k < DOT_LIMIT * px;

        a.sx = sx;
        a.sy = sy;
        a.small = small;
        a.live = onScreen;

        show(a.dot, onScreen && small);
        if (onScreen && small) a.dot.setAttribute('r', (DOT_PX * px / k).toFixed(4));

        if (!onScreen || blind) {
          show(a.label, false);
          return;
        }
        // Named countries claim space first; everything still unguessed shows
        // a question mark in whatever room is left.
        candidates.push({
          c: c, a: a, sx: sx, sy: sy, named: named,
          off: small ? (DOT_PX + 4.5) * px : 0,
          priority: c === lastFound ? Infinity : c.area * (named ? 1000 : 1)
        });
      });
    });

    // A country drawn on both sides of the date line has two anchors; label
    // only the copy nearest the middle of the view, never both.
    var chosen = {};
    candidates.forEach(function (item) {
      item.dist = Math.abs(item.sx - W / 2) + Math.abs(item.sy - H / 2);
      var held = chosen[item.c.id];
      if (held && held.dist <= item.dist) {
        show(item.a.label, false);
        return;
      }
      if (held) show(held.a.label, false);
      chosen[item.c.id] = item;
    });

    // Biggest countries claim their label first; smaller ones appear as you
    // zoom in and space opens up.
    var shortlist = Object.keys(chosen).map(function (id) { return chosen[id]; });
    shortlist.sort(function (p, q) { return q.priority - p.priority; });

    var taken = [];
    shortlist.forEach(function (item) {
      var text = item.named ? item.c.name : '?';
      if (item.a.text !== text) {
        item.a.label.textContent = text;
        item.a.label.classList.toggle('unknown', !item.named);
        item.a.text = text;
        item.a.size = null;
      }
      var grow = item.named ? 1 : swell[item.c.region];
      var size = item.named ? nameSize : QUESTION_PX * grow * px;
      if (item.a.size !== size) {
        if (item.named) {
          item.a.label.style.fontSize = '';          // inherit the group size
          item.a.label.style.strokeWidth = '';
        } else {
          item.a.label.style.fontSize = size.toFixed(3) + 'px';
          item.a.label.style.strokeWidth = (HALO_PX * 1.15 * px).toFixed(3) + 'px';
        }
        item.a.size = size;
      }
      var half = item.named
        ? (item.c.name.length * size * 0.27) + 1.5 * px
        : size * 0.36;
      // Nudge names at the edge of the map inwards instead of cropping them.
      var cx = Math.max(half + 3, Math.min(W - half - 3, item.sx));
      var cy = item.sy - item.off;
      var box = [cx - half, cy - size * 0.62, cx + half, cy + size * 0.62];
      var clear = taken.every(function (other) { return !overlaps(other, box); });
      show(item.a.label, clear);
      if (!clear) return;
      taken.push(box);
      item.a.box = box;                    // the question mark is clickable here
      item.a.label.setAttribute('transform',
        'translate(' + item.a.x + ' ' + item.a.y + ') scale(' + 1 / k + ')');
      item.a.label.setAttribute('x', (cx - item.sx).toFixed(2));
      item.a.label.setAttribute('y', (size * 0.34 - item.off).toFixed(3));
    });

    drawPick(chosen, px);
  }

  /** Mark the picked country. `chosen` holds the anchor each country was
   * labelled at, which is the one the player is looking at; a country whose
   * label lost its place still needs the ring, so fall back to any anchor
   * currently on the map. The radius follows the shape but never drops below
   * PICK_PX, so a picked speck is as findable as a picked continent.
   */
  function drawPick(chosen, px) {
    var ring = $('pick-ring');
    var at = selected && chosen[selected.id] && chosen[selected.id].a;
    if (selected && !at) {
      selected.anchors.forEach(function (a) {
        if (!at && a.live) at = a;
      });
    }
    if (!at) {
      ring.classList.add('hidden');
      return;
    }
    var screenR = Math.max(PICK_PX, Math.min(52, (at.ir * k / px) * 1.35));
    ring.classList.remove('hidden');
    ring.setAttribute('cx', at.x);
    ring.setAttribute('cy', at.y);
    ring.setAttribute('r', (screenR * px / k).toFixed(4));
  }

  // --------------------------------------------------------- clock and scoring
  function startClock() {
    if (startedAt !== null || revealed) return;
    startedAt = Date.now();
    ticker = setInterval(tickClock, 500);
    flashClock();
  }

  /** Announce that the clock is now running, loudly. The remove-reflow-add
   * restarts the animation when a fresh run starts the clock again.
   */
  function flashClock() {
    var clock = $('clock');
    clock.classList.remove('start');
    void clock.offsetWidth;
    clock.classList.add('start');
  }

  $('clock').addEventListener('animationend', function () {
    $('clock').classList.remove('start');     // and with it the will-change
  });

  function spent() {
    return elapsed + (startedAt ? (Date.now() - startedAt) / 1000 : 0);
  }

  function clockText(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function tickClock() {
    var left = Math.max(0, limit - spent());
    var clock = $('clock');
    clock.textContent = clockText(left);
    clock.classList.toggle('low', left <= 60 && !over);
    if (left <= 0 && !over) timeUp();
  }

  function stopClock() {
    if (ticker) clearInterval(ticker);
    ticker = null;
    if (startedAt) elapsed += (Date.now() - startedAt) / 1000;
    startedAt = null;
    tickClock();
  }

  function accept(c, quiet, wording) {
    c.found = true;
    foundCount += 1;
    lastFound = c;
    // The quiz deals its countries out unlabelled, so nothing it asks about
    // may stay lit afterwards: a right answer pops where it stands and the
    // map goes straight back to blank. `quiet` is a run being restored from
    // storage, where in the quiz there would be nothing left to see anyway.
    var lasting = !mode.quiz;
    c.paths.forEach(function (path) {
      if (lasting) path.classList.add('found');
      if (lasting || !quiet) replay(path);
    });
    c.anchors.forEach(function (a) {
      if (lasting) a.dot.classList.add('found');
      if (lasting || !quiet) replay(a.dot, 1.45);   // dots are a fixed size already
    });
    $('score').textContent = foundCount;
    updatePanel();
    draw();
    if (quiet) return;
    if (c.old.indexOf(wording || lastAnswer) >= 0) shower(BOO, c.name);
    else if (mode.quiz) shower(TICK, c.name, 8);
    else toast(c);
    save();
    celebrate(c.region);
    if (foundCount === pool.length) finish();
  }

  /** A small show when the last country of a continent falls. */
  function celebrate(region) {
    if (over) return;
    var all = pool.filter(function (c) { return c.region === region; });
    if (!all.every(function (c) { return c.found; })) return;
    if (foundCount === pool.length) return;          // the finale handles this

    var row = rows[region];
    row.li.classList.remove('cheer');
    void row.li.offsetWidth;
    row.li.classList.add('cheer');

    var box = DATA.views[region];
    fireworks.cheer(toScreen((box[0] + box[2]) / 2, (box[1] + box[3]) / 2),
                    regionColour(region));
    hint(t('hint.regionComplete', { region: region, count: all.length }));
  }

  function regionColour(region) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--' + slug(region)).trim() || '#ffd93d';
  }

  /** Map units -> a point on the page, clamped to somewhere visible. */
  function toScreen(x, y) {
    var ctm = svg.getScreenCTM();
    var point = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
    if (ctm) {
      var p = new DOMPoint(x * k + tx, y * k + ty).matrixTransform(ctm);
      point = { x: p.x, y: p.y };
    }
    return {
      x: Math.max(80, Math.min(window.innerWidth - 80, point.x)),
      y: Math.max(80, Math.min(window.innerHeight - 120, point.y))
    };
  }

  function onScreen(c) {
    return c.anchors.some(function (a) {
      var sx = a.x * k + tx, sy = a.y * k + ty;
      return sx > 4 && sx < W - 4 && sy > 4 && sy < H - 4;
    });
  }

  var toastTimer = null;

  var showerTimer = null;

  /** A screen full of one emoji, with a name under it.
   *
   * Four verdicts use this. An outdated name gets booed, and told the name
   * it should have been; the quiz, which never leaves a country lit, ticks
   * the one just named so the answer lands somewhere; the wrong answer
   * that ends a Hardcore run is sobbed over, with what it should have been;
   * and a colonial name is binned, quoted back at the player.
   * With no emoji it is the name alone: Help Me? saying what was skipped.
   */
  function shower(emoji, name, count) {
    var layer = $('emoji');
    var faces = [].concat(emoji || []);           // one emoji, or a mix to draw from
    layer.textContent = '';
    for (var i = 0; faces.length && i < (count || 18); i++) {
      var face = document.createElement('span');
      face.className = 'emoji-pop';
      var pickFace = faces[Math.floor(Math.random() * faces.length)];
      if (typeof pickFace === 'function') face.appendChild(pickFace());
      else face.textContent = pickFace;
      face.style.left = (3 + Math.random() * 90).toFixed(1) + '%';
      face.style.top = (5 + Math.random() * 82).toFixed(1) + '%';
      face.style.fontSize = (26 + Math.random() * 36).toFixed(0) + 'px';
      face.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's';
      face.style.setProperty('--tilt', (Math.random() * 44 - 22).toFixed(1) + 'deg');
      layer.appendChild(face);
    }
    if (name) {
      var caption = document.createElement('b');
      caption.className = 'emoji-name';
      caption.textContent = name;
      layer.appendChild(caption);
    }

    clearTimeout(showerTimer);
    showerTimer = setTimeout(function () { layer.textContent = ''; }, 1800);
  }

  function toast(c) {
    toastEl.textContent = '';
    var text = document.createElement('span');
    text.textContent = t('map.found', { name: c.name });
    toastEl.appendChild(text);
    if (!onScreen(c)) {
      var go = document.createElement('button');
      go.type = 'button';
      go.textContent = t('map.showMe');
      go.addEventListener('click', function () {
        flyTo(viewForBox(framedBox(c), 0.55));
        toastEl.classList.remove('show');
      });
      toastEl.appendChild(go);
    }
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  // ------------------------------------------------------------------ guessing
  var index = {};
  countries.forEach(function (c) {
    c.answers.forEach(function (a) {
      if (!(a in index)) index[a] = c;
    });
  });

  // "niger" is a prefix of "nigeria", "dominica" of "dominican republic":
  // accepting those the instant they match would steal the longer answer, so
  // they are held briefly. The hold resolves as soon as the player moves on,
  // which keeps a fast typist from losing the guess altogether.
  var ambiguous = {};
  var allAnswers = Object.keys(index);
  allAnswers.forEach(function (a) {
    allAnswers.forEach(function (b) {
      if (b !== a && b.indexOf(a) === 0 && index[b] !== index[a]) ambiguous[a] = true;
    });
  });

  // Names so long dead that typing one ends the run, whatever the mode. A
  // real answer that begins one is held like "niger" is, or "us" would score
  // the United States before anyone could finish typing "ussr".
  var jail = {};
  (DATA.jail || []).forEach(function (j) { jail[j.name] = j; });
  var jailNames = Object.keys(jail);
  allAnswers.forEach(function (a) {
    jailNames.forEach(function (b) {
      if (b.indexOf(a) === 0) ambiguous[a] = true;
    });
  });

  var HOLD_MS = 700;
  var hold = null;        // { norm, raw, country, timer }
  var lastAnswer = '';    // the wording the player actually used

  function startsAnAnswer(text) {
    return allAnswers.concat(jailNames).some(function (a) { return a.indexOf(text) === 0; });
  }

  function cancelHold() {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold = null;
  }

  function commitHold() {
    if (!hold) return;
    var held = hold;
    cancelHold();
    // Keep whatever is in the box: "Guinea" then "Ghana" with no pause should
    // score both, and must not swallow the start of the second name.
    var raw = input.value;
    if (raw.indexOf(held.raw) === 0) {
      input.value = raw.slice(held.raw.length).replace(/^[\s,]+/, '');
    }
    if (!held.country.found) accept(held.country, false, held.norm);
  }

  function beginHold(country, text) {
    cancelHold();
    hold = {
      norm: text,
      raw: input.value,
      country: country,
      timer: setTimeout(commitHold, HOLD_MS)
    };
    hint(t('hint.holdFor', { name: country.name }));
  }

  function hint(text) {
    hintEl.textContent = text;
  }

  /** Runs on every keystroke. `force` means Enter: decide right now. */
  function tryGuess(force) {
    if (revealed) return;
    var text = normalize(input.value);
    lastAnswer = text;

    if (hold) {
      if (force) {
        var held = hold.country;
        var same = text === hold.norm;
        cancelHold();
        if (same) {
          input.value = '';
          accept(held);
          return;
        }
      } else if (text !== hold.norm && hold.norm.indexOf(text) === 0) {
        // One character gone means they are editing the word, so drop it. A
        // bigger jump means the box was replaced (select-all, then type), and
        // the completed name they typed should still count.
        if (hold.norm.length - text.length > 1) commitHold();
        else cancelHold();
      } else if (text.indexOf(hold.norm) === 0 && startsAnAnswer(text)) {
        clearTimeout(hold.timer);          // still typing a longer name
        hold.timer = setTimeout(commitHold, HOLD_MS);
      } else {
        commitHold();                      // moved on: bank the held guess
        text = normalize(input.value);
      }
    }

    if (!text || jailed(text)) return;
    var hit = index[text];
    if (!hit) return;

    // A real country, but not one this region asks for. Said plainly, and
    // the box is cleared: the name was right, the player just aimed wide.
    if (!hit.inPlay) {
      if (force && hardcore()) {
        strike(hit.name, 'results.struckOffRegion', { guess: hit.name, region: scope });
      } else if (force) {
        input.value = '';
        hint(t('hint.offRegion', { name: hit.name, region: scope }));
      }
      return;
    }
    if (hit.found) {
      if (force) {
        input.value = '';
        hint(t('hint.alreadyFound', { name: hit.name }));
      }
      return;
    }
    if (!force && ambiguous[text]) {
      beginHold(hit, text);
      return;
    }
    cancelHold();
    input.value = '';
    hint(t('hint.keepGoing'));
    accept(hit, false, text);
  }

  function wrong(message) {
    input.classList.remove('wrong');
    void input.offsetWidth;                // restart the shake
    input.classList.add('wrong');
    if (message) hint(message);
  }

  /** Hardcore is on for the game in play. */
  function hardcore() {
    return !!optionsFor(mode.id).hardcore;
  }

  /** Hardcore's one wrong answer: the run ends on it, and the results say
   * why. `caption` goes under the crying faces - the country that was being
   * asked for where there was one, or else what the player typed. `key` and
   * `vars` are the reason, kept as words-to-be rather than a sentence so a
   * finished run restored from storage can say it again. */
  function strike(caption, key, vars) {
    if (over) return;
    struck = { key: key, vars: vars };
    wrong();
    shower(SOB, caption);
    endRun('struck');
  }

  /** Whole years from an ISO date to today. */
  function yearsSince(iso) {
    var then = new Date(iso + 'T00:00:00');
    var now = new Date();
    var years = now.getFullYear() - then.getFullYear();
    if (now.getMonth() < then.getMonth() ||
        (now.getMonth() === then.getMonth() && now.getDate() < then.getDate())) years--;
    return years;
  }

  /** A name on the jail list ends the run on the spot, Hardcore or not, and
   * the results say how long it has been dead. True if it did. */
  function jailed(text) {
    var j = jail[text];
    if (!j || over) return false;
    struck = { key: 'jail.lines.' + j.id, vars: { years: yearsSince(j.since) }, jail: true };
    wrong();
    shower(TRASH, typed());
    endRun('jail');
    return true;
  }

  /** What the player typed, as they typed it, for quoting back at them. */
  function typed() {
    return input.value.trim();
  }

  // ------------------------------------------------------- hard mode: picking
  /** Light one country up as the one to name. Hard mode gets here by a click,
   * the quiz by dealing the next card.
   *
   * Nothing here may say the country's name: that is the answer.
   */
  function light(c) {
    clearPick();
    selected = c;
    c.paths.forEach(function (path) { path.classList.add('selected'); });
    c.anchors.forEach(function (a) {
      a.dot.classList.add('selected');
      a.label.classList.add('selected');
    });
    draw();
  }

  /** The player picks a country off the map and waits to be asked for it. */
  function choose(c) {
    if (selected === c) {
      input.focus();
      return;
    }
    bankPick();
    light(c);
    input.value = '';
    hint(t('hint.nameIt'));
    input.focus();
  }

  function clearPick(message) {
    if (selected) {
      selected.paths.forEach(function (path) { path.classList.remove('selected'); });
      selected.anchors.forEach(function (a) {
        a.dot.classList.remove('selected');
        a.label.classList.remove('selected');
      });
      selected = null;
      draw();
    }
    if (message) hint(message);
  }

  /** How far a click fell from a marker: its dot, or its question mark. */
  function markerGap(a, p) {
    var d = Math.hypot(p.x - a.sx, p.y - a.sy);
    if (a.box) {
      var bx = Math.min(Math.max(p.x, a.box[0]), a.box[2]);
      var by = Math.min(Math.max(p.y, a.box[1]), a.box[3]);
      d = Math.min(d, Math.hypot(p.x - bx, p.y - by));
    }
    return d;
  }

  /** Which country a click landed on.
   *
   * The browser answers for land, since the shapes are the hit targets. That
   * alone would make Nauru and Vatican City unclickable, so every unguessed
   * marker nearby counts as well, and a marker standing in for a shape too
   * small to aim at — the same test that decides to draw a dot — beats
   * whatever larger country lies underneath it. A big country's own question
   * mark never steals a click from its neighbours that way.
   *
   * How near is "nearby" depends on what the click landed on. An island in
   * open water gets a wide margin, because there is nothing else to hit. A
   * speck drawn on top of another country gets a narrow one, and even then
   * only wins if its marker is the nearer of the two: at world zoom nine
   * screen pixels reaches a long way into Italy, and a click on Italy's own
   * question mark is Italy's however close San Marino sits to it.
   */
  function pickAt(clientX, clientY, fallback) {
    var stack = [];
    Array.prototype.forEach.call(document.elementsFromPoint(clientX, clientY), function (node) {
      if (node.country && stack.indexOf(node.country) < 0) stack.push(node.country);
    });
    if (fallback && stack.indexOf(fallback) < 0) stack.push(fallback);

    // Land outside the chosen region is still land: it answers a click so
    // the player is told what they hit, but it never rivals a marker.
    var land = null, taken = null, outside = null;
    stack.forEach(function (c) {
      if (!c.inPlay) { if (!outside) outside = c; return; }
      if (!land && !c.found) land = c;
      if (!taken && c.found) taken = c;
    });

    var p = toMap(clientX, clientY);
    var px = 1 / unitScale();
    var slack = (land || outside ? PICK_TIGHT : PICK_SLACK) * px;
    var speck = null, marker = null, home = Infinity;

    countries.forEach(function (c) {
      if (c.found || !c.inPlay) return;
      c.anchors.forEach(function (a) {
        if (!a.live) return;
        var d = markerGap(a, p);
        if (c === land) {                 // measured, but not a rival to itself
          home = Math.min(home, d);
          return;
        }
        if (d > slack) return;
        if (!marker || d < marker.d) marker = { c: c, d: d };
        if (a.small && (!speck || d < speck.d)) speck = { c: c, d: d };
      });
    });

    if (speck && speck.d < home) return speck.c;
    return land || (marker && marker.c) || taken || outside;
  }

  function onTap(clientX, clientY, fallback) {
    if (!mode.pick || over) return;
    var c = pickAt(clientX, clientY, fallback);
    if (!c) {
      // Out of bounds: open water, or land that is nobody's country. Drops
      // the pick, the same as Escape does.
      if (selected) clearPick(t('hint.pickDropped'));
      else hint(modeText('hint'));
      return;
    }
    if (!c.inPlay) {
      hint(t('hint.offRegion', { name: c.name, region: scope }));
      return;
    }
    if (c.found) {
      hint(t('hint.alreadyFound', { name: c.name }));
      return;
    }
    choose(c);
  }

  /** Score a name typed but never confirmed, before the pick moves off it.
   *
   * Only an exact answer is banked: anything else is left in the box, since
   * half a name is not a guess and must not set the box shaking.
   */
  function bankPick() {
    if (!selected) return;
    if (selected.answers.indexOf(normalize(input.value)) >= 0) nameGuess(true);
  }

  /** A name only scores for the country that is lit up: the one the player
   * clicked in hard mode, the one the quiz dealt out in Name That Country. */
  function nameGuess(force) {
    // Still finishing a name that has already scored: whatever this was, it
    // was meant for a country that is no longer being asked about.
    if (swallowing) {
      input.value = '';
      swallowTail();
      return;
    }

    var text = normalize(input.value);
    lastAnswer = text;
    if (text && jailed(text)) return;

    if (!selected) {
      // The quiz has nothing lit for the moment between a right answer and
      // the next country flying in. Nothing typed into that gap can belong
      // to anything, so the box does not keep it, and the swallow is held
      // open while it keeps coming: letters left here would still be sitting
      // in front of the next country's name, and that answer - correctly
      // typed - would be the one refused.
      if (force && text) wrong(t(mode.quiz ? 'hint.nextComing' : 'hint.clickFirst'));
      if (mode.quiz) {
        input.value = '';
        if (text) swallowTail();
      }
      return;
    }
    if (!text) return;

    if (selected.answers.indexOf(text) >= 0) {
      // "niger" is a prefix of "nigeria", "dominica" of "dominican
      // republic", "guinea" of "guinea-bissau". The click already says which
      // country it is, so there is nothing to disambiguate - but in hard
      // mode do not score the short name under someone still typing the long
      // one. Enter decides there.
      //
      // THE QUIZ NEVER ASKS FOR ENTER. It deals one country at a time
      // against a clock and a player who has typed its name has answered:
      // making them reach for a key they have no reason to press would stall
      // every short name on the map. The cost is that "Nigeria" typed over a
      // lit Niger scores Niger at the fifth letter, and the "ia" still on
      // its way has to go somewhere that is not the box - see swallowTail().
      if (!force && ambiguous[text] && !mode.quiz) {
        hint(t('hint.enterToName'));
        return;
      }
      var c = selected;
      input.value = '';
      clearPick();
      // Nothing cheery here in the quiz: by the time it is read the next
      // country is up, and the line would be about the one before it.
      hint(mode.quiz ? modeText('hint') : t('hint.gotIt'));
      accept(c, false, text);
      if (mode.quiz) {
        swallowTail();
        advance(QUIZ_PAUSE);
      }
      return;
    }
    if (force && hardcore()) {
      strike(selected.name, index[text]
        ? (mode.quiz ? 'results.struckWrongShown' : 'results.struckWrongCountry')
        : (mode.quiz ? 'results.struckNotShown' : 'results.struckNotClicked'),
        { guess: index[text] ? index[text].name : typed(), answer: selected.name });
    } else if (force) {
      wrong(t(index[text]
        ? (mode.quiz ? 'hint.wrongShown' : 'hint.wrongCountry')
        : 'hint.notACountry'));
    }
  }

  // ------------------------------------------------ name that country: dealing
  /* The game deals instead of the player hunting: one country lit up, no
   * label on it, in random order over all of them. Nothing a player skips is
   * lost - the pass ends, and whatever was passed over comes round again. */

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    return list;
  }

  /** A fresh pass over every country still unnamed, in random order.
   *
   * `leaving` is the country just skipped. It belongs in this pass - that is
   * the promise skipping makes - but not at the front of it, or passing on
   * the last card of a pass would deal the same card straight back.
   */
  function refill(leaving) {
    queue = shuffle(pool.filter(function (c) { return !c.found; }));
    if (queue.length > 1 && queue[0] === leaving) {
      queue[0] = queue[1];
      queue[1] = leaving;
    }
  }

  /** The box to frame a country in, east of the date line for the Pacific.
   *
   * Oceania is drawn twice, and the camera always visits the Pacific copy.
   * A country's box follows its label, and Kiribati's label sits out at the
   * Line Islands - which on the map proper is the far western edge, half a
   * world away from the rest of Oceania with only Fiji's and New Zealand's
   * own wrapped scraps for company. When the label lands out there, the
   * frame moves to the copy that sits in the Pacific with its neighbours.
   */
  function framedBox(c) {
    var lead = c.anchors[0];
    var east = c.anchors[1];
    if (c.region !== SEA_REGION || lead.x >= SEA_WEST || !east || east.x <= lead.x) {
      return c.bbox;
    }
    var dx = east.x - lead.x;
    var dy = east.y - lead.y;
    return [c.bbox[0] + dx, c.bbox[1] + dy, c.bbox[2] + dx, c.bbox[3] + dy];
  }

  /** Where to stand to look at one country.
   *
   * The frame is the country plus a margin of whatever is around it, rather
   * than a fixed share of the country itself. Three quarters of Austria
   * again is no help in naming Austria - landlocked country looks like
   * landlocked country - while the same width of map round Monaco is the
   * Riviera, which is the whole answer. The margin grows with the country,
   * so Chile still arrives with South America behind it and a middling one
   * like Uzbekistan arrives with the Caspian and the Gulf to place it
   * against.
   *
   * However small the country, the camera comes no closer than QUIZ_K_MAX:
   * a margin set by the country's own size asks for a very deep view of a
   * very small one, and Monaco arrived filling the screen with the Riviera
   * magnified past the point of being recognisable.
   *
   * Oceania keeps a ceiling of its own, lower again: a Pacific island is
   * named from where it sits among Australia, New Zealand and its
   * neighbours, none of which are in shot at the zoom its size asks for.
   */
  function quizView(c) {
    var box = framedBox(c);
    var pad = QUIZ_PAD + QUIZ_SHARE * c.span;
    var view = viewForBox([box[0] - pad, box[1] - pad,
                           box[2] + pad, box[3] + pad], 1);
    var ceiling = c.region === SEA_REGION ? QUIZ_K_SEA : QUIZ_K_MAX;
    if (view.k <= ceiling) return view;
    // Stand back to the ceiling, over the middle of the country: a box the
    // size of the screen at that zoom is a view at that zoom.
    var halfW = W / (2 * ceiling);
    var halfH = H / (2 * ceiling);
    var cx = (box[0] + box[2]) / 2;
    var cy = (box[1] + box[3]) / 2;
    return viewForBox([cx - halfW, cy - halfH, cx + halfW, cy + halfH], 1);
  }

  /** Light the next country and fly to it. */
  function serve() {
    clearTimeout(nextTimer);
    if (over) return;
    var leaving = selected;
    clearPick();

    var next = queue.shift();
    while (next && next.found) next = queue.shift();     // named since it was dealt
    if (!next) {
      refill(leaving);
      next = queue.shift();
    }
    if (!next) return;              // all 197 named: accept() ended the run

    light(next);
    input.value = '';          // a short name may have scored mid-word
    flyTo(quizView(next));
    input.focus();
  }

  function advance(ms) {
    clearTimeout(nextTimer);
    nextTimer = setTimeout(serve, ms);
  }

  /* The letters still arriving for a name the quiz has already scored.
   *
   * A name scores the moment it matches, which for "niger", "guinea" and
   * "dominica" can be in the middle of a word: a player reading the map as
   * Nigeria types seven letters and the fifth one scores Niger. Those last
   * two letters have nothing left to name, and the box is the one place they
   * must not sit - the next country is dealt into that same box a moment
   * later, and "ia" in front of a correctly typed answer is what refused it.
   *
   * So the box is held empty while the word is still coming, and for a beat
   * after the last letter of it. The beat is what carries the swallow past
   * the next deal, since a player finishing a long name is still typing when
   * the next country lights up.
   */
  function swallowTail() {
    // Hardcore names nothing until Enter, so there is never a tail still
    // coming - and a swallow would eat the next answer of a quick player.
    if (hardcore()) return;
    clearTimeout(swallowing);
    swallowing = setTimeout(function () { swallowing = null; }, SWALLOW_MS);
  }

  function stopSwallowing() {
    clearTimeout(swallowing);
    swallowing = null;
  }

  function startQuiz() {
    refill(null);
    serve();
  }

  /** Pass on this one: it goes back in the hat for the end of the pass. */
  function skip() {
    if (!mode.quiz || over || !selected) return;
    stopSwallowing();
    input.value = '';
    var passed = selected;
    serve();
    // After serve(), which says nothing itself. Help Me? names the one passed
    // over, so it can be answered when it comes round again.
    if (optionsFor(mode.id).help) {
      hint(t('hint.skippedWas', { name: passed.name }));
      shower(null, passed.name);
    } else {
      hint(t('hint.skipped'));
    }
  }

  $('skip').addEventListener('click', skip);

  // --------------------------------------------------------- the guess box
  // Hardcore takes nothing as typed: every answer is the player's own call,
  // made with Enter, and so is every wrong one. Without this a name would
  // score itself the moment it was spelled right, and only a misspelling
  // would ever have to be submitted - and then judged.
  input.addEventListener('input', function () {
    if (normalize(input.value) === TEXAS) {
      input.value = '';
      texas();
      return;
    }
    if (hardcore()) return;
    if (targeted()) nameGuess(false);
    else tryGuess(false);
  });

  input.addEventListener('blur', function () {
    if (hardcore()) return;
    commitHold();
    bankPick();
  });

  $('guess-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    // An empty box in the quiz means "I do not know this one": Enter passes,
    // so a run never has to leave the keyboard for the Skip button.
    if (mode.quiz && !input.value.trim()) {
      skip();
      return;
    }
    if (targeted()) {
      nameGuess(true);
      return;
    }
    var before = foundCount;
    tryGuess(true);
    if (over || foundCount !== before || !typed()) return;
    if (hardcore()) {
      strike(typed(), 'results.struckNotACountry', { guess: typed() });
    } else {
      wrong(t('hint.notACountry'));
    }
  });

  // -------------------------------------------------------------------- panel
  var rows = {};

  DATA.regions.forEach(function (region) {
    var total = countries.filter(function (c) { return c.region === region; }).length;
    var li = document.createElement('li');
    li.style.setProperty('--region', 'var(--' + slug(region) + ')');
    li.innerHTML = '<i class="swatch"></i><span class="name"></span>' +
      '<span class="count"></span><span class="meter"><i></i></span>';
    li.querySelector('.name').textContent = region;
    li.addEventListener('click', function () {
      flyTo(viewForBox(DATA.views[region], 0.92));
    });
    $('regions').appendChild(li);
    rows[region] = { li: li, total: total, count: li.querySelector('.count'), bar: li.querySelector('.meter i') };
  });

  function updatePanel() {
    liveRegions().forEach(function (region) {
      var row = rows[region];
      var got = countries.filter(function (c) { return c.region === region && c.found; }).length;
      row.count.textContent = t('panel.count', { got: got, total: row.total });
      row.bar.style.width = (100 * got / row.total) + '%';
      row.li.classList.toggle('done', got === row.total);
    });
  }

  function listMissed() {
    var body = $('missed-body');
    body.textContent = '';
    liveRegions().forEach(function (region) {
      var missing = countries.filter(function (c) { return c.region === region && !c.found; });
      if (!missing.length) return;
      var head = document.createElement('h3');
      head.style.setProperty('--region', 'var(--' + slug(region) + ')');
      head.textContent = t('panel.regionCount', { region: region, count: missing.length });
      var ul = document.createElement('ul');
      missing.forEach(function (c) {
        var li = document.createElement('li');
        li.textContent = c.name;
        li.addEventListener('click', function () { flyTo(viewForBox(framedBox(c), 0.55)); });
        ul.appendChild(li);
      });
      body.appendChild(head);
      body.appendChild(ul);
    });
    $('missed').hidden = false;
  }

  // --------------------------------------------------------------- fireworks
  var fireworks = (function () {
    var canvas = $('fireworks');
    var ctx = canvas.getContext('2d');
    var sparks = [];
    var frame = null;
    var until = 0;
    var nextBurst = 0;
    var palette = null;

    function colours() {
      if (!palette) {
        palette = DATA.regions.map(function (r) {
          return getComputedStyle(document.documentElement)
            .getPropertyValue('--' + slug(r)).trim() || '#ffd166';
        });
      }
      return palette;
    }

    function calm() {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function fit() {
      // 1.5x is plenty for 2px sparks and a quarter of the fill cost of 3x.
      var dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
    }

    function shell(x, y, colour, size) {
      var count = size || (45 + Math.floor(Math.random() * 25));
      var power = 3 + Math.random() * 2;
      var squash = 0.8 + Math.random() * 0.4;
      for (var i = 0; i < count; i++) {
        var angle = (i / count) * Math.PI * 2 + Math.random() * 0.25;
        var speed = power * (0.45 + Math.random() * 0.8);
        sparks.push({
          x: x, y: y, px: x, py: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * squash,
          life: 1,
          fade: 0.011 + Math.random() * 0.009,
          colour: colour
        });
      }
    }

    function burst() {
      shell((0.12 + Math.random() * 0.76) * window.innerWidth,
            (0.1 + Math.random() * 0.5) * window.innerHeight,
            colours()[Math.floor(Math.random() * colours().length)]);
    }

    function step(now) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (now > nextBurst && now < until) {
        burst();
        if (Math.random() < 0.15) burst();        // the odd double, for the clatter
        nextBurst = now + 380 + Math.random() * 320;
      }

      // Group by colour: one stroke call per colour per frame instead of one
      // per spark, which is what made this crawl.
      var lanes = {};
      for (var i = sparks.length - 1; i >= 0; i--) {
        var s = sparks[i];
        s.px = s.x;
        s.py = s.y;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.035;                            // gravity
        s.vx *= 0.982;                            // drag
        s.vy *= 0.982;
        s.life -= s.fade;
        if (s.life <= 0 || s.y > window.innerHeight + 40) {
          sparks.splice(i, 1);
          continue;
        }
        var band = Math.max(1, Math.round(s.life * 4));   // 4 alpha steps
        var lane = s.colour + '|' + band;
        (lanes[lane] || (lanes[lane] = [])).push(s);
      }

      Object.keys(lanes).forEach(function (lane) {
        var group = lanes[lane];
        var parts = lane.split('|');
        ctx.globalAlpha = Math.min(1, (parseInt(parts[1], 10) - 0.5) / 4 + 0.12);
        ctx.strokeStyle = parts[0];
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (var j = 0; j < group.length; j++) {
          ctx.moveTo(group[j].px, group[j].py);
          ctx.lineTo(group[j].x, group[j].y);
        }
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      if (now < until || sparks.length) {
        frame = requestAnimationFrame(step);
      } else {
        stop();
      }
    }

    function run(ms) {
      fit();
      canvas.hidden = false;
      // The results sheet blurs everything behind it; re-blurring on every
      // animation frame is what actually stutters. Drop it while this runs.
      sheet.classList.add('plain');
      until = performance.now() + ms;
      if (!frame) frame = requestAnimationFrame(step);
    }

    function start() {
      if (calm()) return;
      nextBurst = 0;
      run(4200);
      for (var i = 0; i < 2; i++) burst();        // open with a volley
    }

    /** One modest shell over a spot on the page. */
    function cheer(at, colour) {
      if (calm()) return;
      if (!frame) run(0);
      shell(at.x, at.y, colour, 54);
      shell(at.x, at.y, '#ffffff', 10);
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      sparks.length = 0;
      until = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      canvas.hidden = true;
      sheet.classList.remove('plain');
    }

    window.addEventListener('resize', function () { if (frame) fit(); });
    return { start: start, cheer: cheer, stop: stop };
  })();

  // ------------------------------------------------------------------ endgame
  function markMissed() {
    pool.forEach(function (c) {
      if (c.found) return;
      c.paths.forEach(function (path) { path.classList.add('missed'); });
      c.anchors.forEach(function (a) {
        a.dot.classList.add('missed');
        a.label.classList.add('missed');
      });
    });
  }

  /** Ends the run. `how` is 'won', 'time', 'gave-up', 'struck' or 'jail' -
   * the last two being Hardcore's one wrong answer and a colonial name, both
   * set out in `struck`. */
  function endRun(how, restoring) {
    if (over) return;
    over = true;
    ended = how;
    $('results').hidden = false;
    stopClock();
    cancelHold();
    stopSwallowing();
    clearPick();
    input.disabled = true;
    // There is nothing left to skip and nothing left to give up on: the run
    // is over, and the player is looking at the finished map.
    $('skip').disabled = true;
    $('reveal').disabled = true;
    $('clock').classList.remove('low');

    tagOptions(true);
    if (how !== 'won') {
      revealed = true;
      markMissed();
      listMissed();
    }
    draw();
    save();

    if (how === 'won') {
      if (!restoring) fireworks.start();
      hint(t('hint.won', {
        total: pool.length, time: clockText(limit - spent())
      }));
    } else if (how === 'time') {
      hint(t('hint.timeUp', { count: foundCount, total: pool.length }));
    } else if (how === 'struck') {
      hint(t('hint.struck', { count: foundCount, total: pool.length }));
    } else if (how === 'jail') {
      hint(t('hint.jail', { count: foundCount, total: pool.length }));
    } else {
      hint(t('hint.gaveUp', { count: foundCount, total: pool.length }));
    }
    setTimeout(function () { showResults(how); },
      how === 'won' ? 900 : how === 'struck' || how === 'jail' ? STRUCK_PAUSE : 260);
  }

  function finish() { endRun('won'); }
  function timeUp() { endRun('time'); }

  /** Give up, or re-dress a finished run restored from storage. */
  function reveal(quiet) {
    if (quiet) {
      over = true;
      revealed = true;
      stopClock();
      clearPick();
      input.disabled = true;
      markMissed();
      listMissed();
      draw();
      return;
    }
    endRun('gave-up');
  }

  // ------------------------------------------------------------ results sheet
  function showResults(how) {
    var total = pool.length;
    var left = Math.max(0, limit - spent());

    $('sheet-title').textContent = t(how === 'won' ? 'results.wonTitle'
      : how === 'time' ? 'results.timeTitle'
        : how === 'struck' ? 'results.struckTitle'
          : how === 'jail' ? 'results.jailTitle' : 'results.endedTitle');

    // Hard mode found them as well as named them. Each ending has a line of
    // its own per game, rather than a sentence assembled from fragments that
    // no other language would want in that order.
    var pick = mode.pick ? 'Pick' : '';
    $('sheet-line').textContent = how === 'won'
      ? t('results.wonLine' + pick, { total: total, time: clockText(left) })
      : how === 'time'
        ? t('results.timeLine' + pick,
            { time: clockText(limit), count: foundCount })
        : how === 'struck' || how === 'jail'
          ? t(struck.key, struck.vars)
          : t('results.endedLine', { time: clockText(left) });
    // Hardcore's reason is about the answer; the rule it broke, and what it
    // cost, get a line of their own under it.
    var rule = $('sheet-rule');
    rule.hidden = how !== 'struck' && how !== 'jail';
    rule.textContent = how === 'struck' || how === 'jail'
      ? t(how === 'jail' ? 'results.jailRule' : 'results.struckRule',
          { time: clockText(left) }) : '';
    $('final-score').textContent = foundCount;

    $('final-percent').textContent =
      t('results.percent', { percent: fairShare(foundCount, total, 100) });

    var list = $('breakdown');
    list.textContent = '';
    liveRegions().forEach(function (region) {
      var all = countries.filter(function (c) { return c.region === region; });
      var got = all.filter(function (c) { return c.found; }).length;
      var li = document.createElement('li');
      li.style.setProperty('--region', 'var(--' + slug(region) + ')');
      li.innerHTML = '<i class="swatch"></i><span></span>' +
        '<span class="count"></span><span class="meter"><i></i></span>';
      li.querySelector('span').textContent = region;
      li.querySelector('.count').textContent =
        t('panel.count', { got: got, total: all.length });
      li.querySelector('.meter i').style.width = (100 * got / all.length) + '%';
      list.appendChild(li);
    });

    var body = $('sheet-missed-body');
    body.textContent = '';
    var missing = pool.filter(function (c) { return !c.found; });
    $('sheet-missed-title').textContent = missing.length
      ? t('results.missed', { count: missing.length }) : t('results.nothingMissed');
    liveRegions().forEach(function (region) {
      var gone = missing.filter(function (c) { return c.region === region; });
      if (!gone.length) return;
      var head = document.createElement('h4');
      head.style.setProperty('--region', 'var(--' + slug(region) + ')');
      head.textContent = t('panel.regionCount', { region: region, count: gone.length });
      var ul = document.createElement('ul');
      gone.forEach(function (c) {
        var li = document.createElement('li');
        li.textContent = c.name;
        ul.appendChild(li);
      });
      body.appendChild(head);
      body.appendChild(ul);
    });

    sheet.hidden = false;
    $('sheet-again').focus();
  }

  /** `got` of `total` out of `steps`, rounded towards the truth: one country
   * short should not read as full, nor one found as none. */
  function fairShare(got, total, steps) {
    var share = Math.round((steps * got) / total);
    if (share === steps && got < total) share = steps - 1;
    if (share === 0 && got > 0) share = 1;
    return share;
  }

  /** The run as a few lines of text and emoji, to paste into a chat. */
  function shareText() {
    var on = optionsFor(mode.id);
    var tags = [scope || t('world')].concat(Object.keys(on).map(function (name) {
      return t('options.' + name + '.badge');
    }));
    var lines = [
      t('share.head', { mode: modeText('title') }),
      tags.join(' · '),
      t('share.score', {
        verdict: t('share.verdict.' + ended), count: foundCount, total: pool.length,
        percent: fairShare(foundCount, pool.length, 100),
        time: clockText(Math.min(limit, spent()))
      }),
      ''
    ];
    liveRegions().forEach(function (region) {
      var all = countries.filter(function (c) { return c.region === region; });
      var got = all.filter(function (c) { return c.found; }).length;
      var filled = fairShare(got, all.length, 10);
      var bar = '';
      for (var i = 0; i < 10; i++) bar += t(i < filled ? 'share.filled' : 'share.empty');
      lines.push(t('share.region', { bar: bar, region: region, got: got, total: all.length }));
    });
    // Opened straight off the disk there is no address worth passing on.
    if (/^https?:/.test(location.protocol)) lines.push('', location.href.split('#')[0]);
    return lines.join('\n');
  }

  /** Phones get the share sheet; everything else gets the clipboard. */
  function shareScore() {
    var text = shareText();
    var button = $('sheet-share');
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && navigator.share) {
      navigator.share({ text: text }).catch(function () { /* dismissed */ });
      return;
    }
    copyText(text).then(function () { flash(button, 'share.copied'); },
                        function () { flash(button, 'share.failed'); });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return oldCopy(text); });
    }
    return oldCopy(text);
  }

  /** For browsers that keep the clipboard API from a page opened off disk. */
  function oldCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { /* refused */ }
    document.body.removeChild(area);
    return ok ? Promise.resolve() : Promise.reject();
  }

  var flashTimer = null;
  function flash(button, key) {
    button.textContent = t(key);
    button.classList.add('done');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      button.textContent = t('share.button');
      button.classList.remove('done');
    }, 1800);
  }

  function hideResults() {
    sheet.hidden = true;
    fireworks.stop();
  }

  $('sheet-close').addEventListener('click', hideResults);
  $('sheet-share').addEventListener('click', shareScore);
  $('results').addEventListener('click', function () {
    if (over && ended) showResults(ended);
  });
  $('sheet-again').addEventListener('click', function () {
    hideResults();
    reset();
  });
  sheet.addEventListener('click', function (ev) {
    if (ev.target === sheet) hideResults();
  });

  // -------------------------------------------------------------------- reset
  function reset() {
    cancelHold();
    stopSwallowing();
    clearPick();
    clearTimeout(nextTimer);
    queue = [];
    clearTimeout(showerTimer);
    $('emoji').textContent = '';
    hideResults();
    revealed = false;
    over = false;
    ended = null;
    $('results').hidden = true;
    struck = null;
    tagOptions(false);
    foundCount = 0;
    lastFound = null;
    elapsed = 0;
    stopClock();
    input.disabled = false;
    input.value = '';
    countries.forEach(function (c) {
      c.found = false;
      c.paths.forEach(function (path) {
        path.classList.remove('found', 'missed', 'pop');
      });
      c.anchors.forEach(function (a) {
        a.dot.classList.remove('found', 'missed', 'pop');
        a.label.classList.remove('missed');
      });
    });
    $('score').textContent = '0';
    $('missed').hidden = true;
    hint(modeText('hint'));
    updatePanel();
    draw();
    try { localStorage.removeItem(STORE_KEY); } catch (err) { /* private mode */ }
    arm();
  }

  $('reveal').addEventListener('click', function () {
    if (!over) reveal();
  });
  $('reset').addEventListener('click', reset);

  window.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (!cheats.hidden) hideCheats();
    else if (!sheet.hidden) hideResults();
    else if (selected && !mode.quiz) clearPick(t('hint.pickDropped'));
  });

  // ------------------------------------------------------------------ storage
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        mode: mode.id,
        region: scope || '',
        found: countries.filter(function (c) { return c.found; }).map(function (c) { return c.id; }),
        elapsed: Math.round(elapsed + (startedAt ? (Date.now() - startedAt) / 1000 : 0)),
        revealed: revealed || over,
        ended: ended,
        struck: struck
      }));
    } catch (err) { /* private mode: progress just will not persist */ }
  }

  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (err) { return; }
    if (!raw) return;
    var saved;
    try { saved = JSON.parse(raw); } catch (err) { return; }
    // Progress belongs to the game it was made in, over the same countries.
    if ((saved.mode || 'normal') !== mode.id) return;
    if ((saved.region || '') !== (scope || '')) return;
    (saved.found || []).forEach(function (id) {
      if (byId[id] && !byId[id].found) accept(byId[id], true);
    });
    elapsed = saved.elapsed || 0;
    tickClock();
    if (saved.struck && saved.struck.key) {
      struck = saved.struck;
      endRun(struck.jail ? 'jail' : 'struck');
    } else if (saved.revealed) endRun(saved.ended || 'gave-up', true);
    else if (foundCount) hint(t('hint.restored', { count: foundCount }));
  }

  // ------------------------------------------------------------------- input
  svg.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    var step = ev.deltaMode === 1 ? ev.deltaY * 0.1 : ev.deltaY * 0.0048;
    zoomAbout(toMap(ev.clientX, ev.clientY), Math.exp(-step));
  }, { passive: false });

  var touches = new Map();
  var dragFrom = null;
  var pinchFrom = null;
  var tapFrom = null;      // a press that has not yet turned into a drag

  function pinchState() {
    var pts = Array.from(touches.values());
    var dx = pts[0].x - pts[1].x;
    var dy = pts[0].y - pts[1].y;
    return {
      dist: Math.max(1, Math.hypot(dx, dy)),
      mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
    };
  }

  svg.addEventListener('pointerdown', function (ev) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    svg.setPointerCapture(ev.pointerId);
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 1) {
      dragFrom = { x: ev.clientX, y: ev.clientY };
      // The path under the press, kept because pointer capture retargets
      // every later event in this gesture to the svg itself.
      tapFrom = { x: ev.clientX, y: ev.clientY, hit: ev.target.country || null };
      svg.classList.add('dragging');
    } else if (touches.size === 2) {
      dragFrom = null;
      tapFrom = null;                 // two fingers: a pinch, never a tap
      pinchFrom = pinchState();
    }
  });

  svg.addEventListener('pointermove', function (ev) {
    if (!touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (tapFrom && Math.hypot(ev.clientX - tapFrom.x, ev.clientY - tapFrom.y) > TAP_SLOP) {
      tapFrom = null;                 // the hand moved: this is a pan
    }

    if (touches.size === 2 && pinchFrom) {
      var now = pinchState();
      zoomAbout(toMap(now.mid.x, now.mid.y), now.dist / pinchFrom.dist);
      pinchFrom = now;
      return;
    }
    if (dragFrom) {
      var s = unitScale();
      tx += (ev.clientX - dragFrom.x) / s;
      ty += (ev.clientY - dragFrom.y) / s;
      dragFrom = { x: ev.clientX, y: ev.clientY };
      clampView();
      applyView();
    }
  });

  function endPointer(ev) {
    touches.delete(ev.pointerId);
    if (touches.size < 2) pinchFrom = null;
    if (touches.size === 0) {
      dragFrom = null;
      svg.classList.remove('dragging');
    } else if (touches.size === 1) {
      var only = Array.from(touches.values())[0];
      dragFrom = { x: only.x, y: only.y };
    }
  }

  svg.addEventListener('pointerup', function (ev) {
    var tap = tapFrom;
    tapFrom = null;
    endPointer(ev);
    if (tap && !touches.size) onTap(ev.clientX, ev.clientY, tap.hit);
  });

  svg.addEventListener('pointercancel', function (ev) {
    tapFrom = null;
    endPointer(ev);
  });

  svg.addEventListener('dblclick', function (ev) {
    zoomAbout(toMap(ev.clientX, ev.clientY), 2.4);
  });

  $('zoom-in').addEventListener('click', function () {
    zoomAbout({ x: W / 2, y: H / 2 }, ZOOM_STEP);
  });
  $('zoom-out').addEventListener('click', function () {
    zoomAbout({ x: W / 2, y: H / 2 }, 1 / ZOOM_STEP);
  });
  $('zoom-fit').addEventListener('click', function () {
    flyTo(homeView());
  });

  // hover readout: only for countries the player has already earned
  function describe(ev) {
    var c = ev.target.country;
    // The quiz gives no names away, on the map or under the pointer.
    if (!c || (mode.quiz && !revealed) || !(c.found || revealed)) {
      tipEl.hidden = true;
      return;
    }
    var stage = $('stage').getBoundingClientRect();
    tipEl.textContent = c.name;
    tipEl.style.left = (ev.clientX - stage.left) + 'px';
    tipEl.style.top = (ev.clientY - stage.top) + 'px';
    tipEl.hidden = false;
  }

  svg.addEventListener('pointermove', function (ev) {
    if (dragFrom || touches.size) { tipEl.hidden = true; return; }
    describe(ev);
  });
  svg.addEventListener('pointerleave', function () { tipEl.hidden = true; });

  window.addEventListener('resize', draw);
  window.addEventListener('orientationchange', draw);

  window.addEventListener('keydown', function (ev) {
    if (ev.target === input) return;
    if (ev.key === '+' || ev.key === '=') zoomAbout({ x: W / 2, y: H / 2 }, ZOOM_STEP);
    else if (ev.key === '-') zoomAbout({ x: W / 2, y: H / 2 }, 1 / ZOOM_STEP);
    else if (ev.key === '0') flyTo(homeView());
    else if (ev.key.length === 1) input.focus();
  });

  // ------------------------------------------------------------------ splash
  /* Every run opens behind a splash, and the splash is where the run is
   * set up: which part of the world is in play, and which of the games is
   * played over it. There is no other way in.
   * Holding the run here is what makes the countdown mean anything: the
   * clock is idle, the quiz has dealt nothing and the guess box is shut, so
   * the three seconds are free. They are also the only warning: the clock
   * starts on zero, not on the first thing the player types.
   */
  var splash = $('splash');
  var countEl = $('countdown');
  var games = $('games');
  var scopes = $('scopes');
  var optionsEl = $('options');
  var startEl = $('splash-start');
  var chosen = null;             // the game tile pressed, not yet started
  var settings = loadOptions();  // { <option>: true }, shared by every game

  /** The regions to choose between, the whole world first. '' is the world:
   * region names themselves come from the map data, not the strings file. */
  var SCOPES = [''].concat(DATA.regions);

  /** What to call the countries in play. */
  function scopeName(name) {
    return name || t('world');
  }

  /** The region row. Built fresh on every arm(), because the one in play is
   * marked here and the games under it are priced by its size. */
  function listScopes() {
    scopes.textContent = '';
    SCOPES.forEach(function (name) {
      var li = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'scope';
      button.textContent = scopeName(name);
      // Pressed, not just styled: the row is a set of choices, one of which
      // is already made, and a reader on the outside of it should hear that.
      button.setAttribute('aria-pressed', String(name === (scope || '')));
      button.addEventListener('click', function () { chooseScope(name); });
      li.appendChild(button);
      scopes.appendChild(li);
    });
  }

  /** The games, as tiles. Rebuilt on every arm(): the clock each one offers
   * follows the region in play, and which one carries a restored run moves
   * with the run itself. A tile only chooses: the options under the row are
   * that game's, and Start is what sets it going. */
  function listGames() {
    games.textContent = '';
    Object.keys(MODES).forEach(function (id) {
      var game = MODES[id];
      // A run restored from storage belongs to one game, and is picked up
      // by that game alone. Starting any other throws it away.
      var resume = id === mode.id && foundCount > 0;
      var li = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = resume ? 'game resume' : 'game';
      button.setAttribute('data-game', id);
      button.innerHTML = '<span class="game-name"></span>' +
        '<span class="game-hint"></span>' +
        '<span class="game-meta"><span class="game-limit"></span>' +
        '<span class="game-found"></span></span>';
      button.querySelector('.game-name').textContent = t('modes.' + id + '.title');
      button.querySelector('.game-hint').textContent = t('modes.' + id + '.hint');
      button.querySelector('.game-limit').textContent =
        t('splash.limit', { time: clockText(limitFor(game, pool.length)) });
      if (resume) {
        button.querySelector('.game-found').textContent =
          t('splash.found', { count: foundCount });
      }
      button.addEventListener('click', function () {
        // Help Me? gives answers away, so it is never carried in: coming
        // back to the quiz from another tile finds it off again.
        if (id !== chosen && settings.help) setOption('help', false);
        chooseTile(id);
      });
      li.appendChild(button);
      games.appendChild(li);
    });
    chooseTile(chosen);
  }

  /** Press one game tile: its options come up under the row, and Start
   * reads Resume if that is the game holding a restored run. Nothing is
   * thrown away until Start - looking at another game's options is free. */
  function chooseTile(id) {
    chosen = MODES[id] ? id : mode.id;
    Array.prototype.forEach.call(games.querySelectorAll('.game'), function (button) {
      button.setAttribute('aria-pressed',
        String(button.getAttribute('data-game') === chosen));
    });
    listOptions();
    startEl.textContent =
      t(chosen === mode.id && foundCount > 0 ? 'splash.resume' : 'splash.start');
  }

  /** The chosen game's switches, one checkbox each. */
  function listOptions() {
    optionsEl.textContent = '';
    var names = MODES[chosen].options || [];
    names.forEach(function (name) {
      var label = document.createElement('label');
      label.className = 'option';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!optionsFor(chosen)[name];
      box.addEventListener('change', function () {
        setOption(name, box.checked);
        priceGames();
      });
      label.appendChild(box);
      label.insertAdjacentHTML('beforeend',
        '<span class="option-name"></span><span class="option-hint" role="tooltip"></span>');
      label.querySelector('.option-name').textContent = t('options.' + name + '.label');
      label.querySelector('.option-hint').textContent = t('options.' + name + '.hint');
      optionsEl.appendChild(label);
    });
    optionsEl.hidden = !names.length;
  }

  /** Every tile's clock again: Kim Mode takes time off all of them. */
  function priceGames() {
    Object.keys(MODES).forEach(function (id) {
      var tile = games.querySelector('[data-game="' + id + '"] .game-limit');
      if (tile) tile.textContent =
        t('splash.limit', { time: clockText(limitFor(MODES[id], pool.length)) });
    });
  }

  startEl.addEventListener('click', function () { chooseGame(chosen); });

  /* The options, kept between visits. */
  function loadOptions() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) || 'null'); } catch (err) { /* private mode */ }
    return saved && typeof saved === 'object' ? saved : {};
  }

  /** The options game `id` is played with: the shared settings, less any
   * switch that game does not offer. */
  function optionsFor(id) {
    var on = {};
    (MODES[id].options || []).forEach(function (name) {
      if (settings[name]) on[name] = true;
    });
    return on;
  }

  /** The badges in the header and on the results naming the options this
   * run is played with. `on` false puts them all away, between runs. */
  function tagOptions(on) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-option]'), function (badge) {
      badge.hidden = !on || !optionsFor(mode.id)[badge.getAttribute('data-option')];
    });
  }

  function setOption(name, on) {
    settings[name] = on;
    remember(OPTIONS_KEY, JSON.stringify(settings));
  }

  // ------------------------------------------------------------ sweaty table
  /* Every answer the game takes for each country, for players who want to
   * know whether "DRC" will do before they bet a Hardcore run on it. The
   * outdated names are left off - they only earn a thumbs down - and the
   * jail names were never answers to begin with. */
  var cheats = $('cheats');
  // Answers arrive lowercased; these words go back to capitals for the table.
  var INITIALISMS = ['bih', 'car', 'dprk', 'dr', 'drc', 'fsm', 'ksa', 'nz', 'pdr',
                     'png', 'prc', 'roc', 'rok', 'rsa', 'uae', 'uk', 'us', 'usa'];
  var SMALL_WORDS = ['and', 'of', 'the'];

  function dressAnswer(answer) {
    return answer.split(' ').map(function (word, i) {
      if (INITIALISMS.indexOf(word) >= 0) return word.toUpperCase();
      if (i > 0 && SMALL_WORDS.indexOf(word) >= 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  function listCheats() {
    var body = $('cheats-rows');
    if (body.firstChild) return;
    countries.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    }).forEach(function (c) {
      var own = normalize(c.name);
      var others = c.answers.filter(function (a) {
        return a !== own && c.old.indexOf(a) < 0;
      }).map(dressAnswer);
      var row = document.createElement('tr');
      var name = document.createElement('td');
      name.textContent = c.name;
      var also = document.createElement('td');
      also.textContent = others.length ? others.join(', ') : t('sweaty.none');
      if (!others.length) also.className = 'none';
      row.appendChild(name);
      row.appendChild(also);
      body.appendChild(row);
    });
  }

  function showCheats() {
    if (!waiting || splash.classList.contains('counting')) return;
    listCheats();
    cheats.hidden = false;
    $('cheats-close').focus();
  }

  function hideCheats() {
    cheats.hidden = true;
    $('sweaty').focus();
  }

  $('sweaty').addEventListener('click', showCheats);
  $('cheats-close').addEventListener('click', hideCheats);
  cheats.addEventListener('click', function (ev) {
    if (ev.target === cheats) hideCheats();
  });

  // ------------------------------------------------------------- easter egg
  /* "Republic of Texas", typed anywhere - the guess box, the splash, the
   * finished map - showers sad cowboys. It is never a wrong answer, not even
   * in Hardcore: the box is emptied before it can be judged. Keys typed
   * outside the box are kept in a short tail and checked as they come. */
  var tail = '';

  function sadCowboy() {
    var cowboy = document.importNode($('sad-cowboy').content, true);
    cowboy.querySelector('.sob').textContent = SOB;
    return cowboy;
  }

  function texas() {
    tail = '';
    shower([sadCowboy]);
  }

  window.addEventListener('keydown', function (ev) {
    if (ev.target === input || ev.key.length !== 1 || ev.ctrlKey || ev.metaKey) return;
    // Mid-phrase, a space is a word break, not a press of the focused
    // button: on the splash that would be Start.
    if (ev.key === ' ' && /(^|[^a-z])republic( of)?$/.test(tail.toLowerCase())) {
      ev.preventDefault();
    }
    tail = (tail + ev.key).slice(-TEXAS.length - 8);
    if (normalize(tail).slice(-TEXAS.length) === TEXAS) texas();
  });

  /** Hold the run at the splash until the player picks a game. */
  function arm() {
    clearTimeout(countTimer);
    waiting = true;
    input.disabled = true;
    // Nothing is lit to skip, and nothing yet to give up on.
    $('skip').disabled = true;
    $('reveal').disabled = true;
    countEl.textContent = '';
    splash.classList.remove('counting');
    listScopes();
    listGames();
    splash.hidden = false;
    startEl.focus();
  }

  /** 3, 2, 1. The class comes off and goes back on so each number animates. */
  function countIn(n) {
    if (n <= 0) {
      splash.hidden = true;
      splash.classList.remove('counting');
      countEl.textContent = '';
      launch();
      return;
    }
    countEl.classList.remove('tick');
    void countEl.offsetWidth;
    countEl.textContent = t('splash.count', { n: n });
    countEl.classList.add('tick');
    countTimer = setTimeout(function () { countIn(n - 1); }, COUNT_STEP);
  }

  function begin() {
    if (!waiting || splash.classList.contains('counting')) return;
    splash.classList.add('counting');
    countIn(COUNT_FROM);
  }

  /** Into the game: the clock runs, the quiz deals its first country, and
   * the box takes a name. */
  function launch() {
    waiting = false;
    input.disabled = false;
    $('skip').disabled = false;
    $('reveal').disabled = false;
    // The clock is priced again: the options were set on the splash after
    // the page was dressed for this game.
    limit = limitFor(mode, pool.length);
    tagOptions(true);
    if (hardcore()) hint(t('hint.hardcore'));
    startClock();
    if (mode.quiz) startQuiz();
    input.focus();
  }

  // ------------------------------------------------------ games and regions
  /** A game tile on the splash: switch games unless the page is already
   * dressed for that one, then count in. */
  function chooseGame(id) {
    if (!waiting || !MODES[id] || splash.classList.contains('counting')) return;
    if (id !== mode.id) {
      mode = MODES[id];
      applyScope();                  // throws the run away, and re-arms
    }
    begin();
  }

  /** A region button on the splash. Nothing starts: the row is still up, now
   * showing a different set of countries and what each game asks of it. */
  function chooseScope(name) {
    if (!waiting || splash.classList.contains('counting')) return;
    var next = DATA.views[name] ? name : null;
    if (next === scope) return;
    scope = next;
    applyScope();
  }

  /** Dress the page for the game and the region now chosen.
   *
   * `keep` is for boot, where there is no run to throw away yet; every other
   * change of either starts a fresh one, because the two together decide
   * what is being asked and how long there is to answer.
   */
  function applyScope(keep) {
    pool = scope
      ? countries.filter(function (c) { return c.region === scope; })
      : countries;
    countries.forEach(function (c) {
      c.inPlay = !scope || c.region === scope;
      c.paths.forEach(function (path) { path.classList.toggle('out', !c.inPlay); });
    });
    limit = limitFor(mode, pool.length);

    document.body.classList.toggle('picking', !!mode.pick);
    document.body.classList.toggle('quiz', !!mode.quiz);
    translateStatic();                       // "/ 197" counts this pool now
    $('headline').textContent = modeText('headline', { total: pool.length });
    input.placeholder = modeText('placeholder');
    $('scope-tag').textContent = scopeName(scope);
    $('sheet-mode').textContent = modeText('title');
    $('sheet-mode').classList.toggle('hard', mode.pick);
    $('sheet-scope').textContent = scopeName(scope);
    $('zoom-fit').setAttribute('title',
      scope ? t('map.zoomRegion', { region: scope }) : t('map.zoomFit'));

    // The continents panel lists what is in play and nothing else.
    DATA.regions.forEach(function (region) {
      rows[region].li.hidden = !!scope && region !== scope;
    });

    remember(MODE_KEY, mode.id);
    remember(REGION_KEY, scope || '');

    // Straight there at boot; from the splash the map is behind a blur, so
    // the camera is simply standing where the run will open before it lifts.
    jumpTo(homeView());

    if (keep) {
      hint(modeText('hint'));
      tickClock();
    } else {
      reset();
    }
  }

  /* The game and region last played, so a restored run and the splash agree
   * on which countries it belongs to. */
  function remember(key, value) {
    try { localStorage.setItem(key, value); } catch (err) { /* private mode */ }
  }

  function savedMode() {
    try { return localStorage.getItem(MODE_KEY) || 'normal'; } catch (err) { return 'normal'; }
  }

  function savedScope() {
    try { return localStorage.getItem(REGION_KEY) || ''; } catch (err) { return ''; }
  }

  /* Wording the markup ships empty: data-t sets an element's text, and
   * data-t-<attr> sets one attribute, so <title>, the aria labels and the
   * zoom tooltips all come from the same file as everything else. */
  var T_ATTRS = ['title', 'placeholder', 'aria-label'];

  /* Re-run whenever the pool changes: "/ 197" in the header and "of 197
   * countries" on the results sheet are static markup with a {total} in it. */
  function translateStatic() {
    var vars = { total: pool.length };
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (node) {
      node.textContent = t(node.getAttribute('data-t'), vars);
    });
    T_ATTRS.forEach(function (name) {
      var mark = 'data-t-' + name;
      Array.prototype.forEach.call(document.querySelectorAll('[' + mark + ']'), function (node) {
        node.setAttribute(name, t(node.getAttribute(mark), vars));
      });
    });
    document.documentElement.lang = STRINGS.lang || 'en';
  }

  // --------------------------------------------------------------------- boot
  mode = MODES[savedMode()] || MODES.normal;
  scope = DATA.views[savedScope()] ? savedScope() : null;
  applyScope(true);          // also places the camera, and the first wording
  updatePanel();
  restore();
  tickClock();
  if (!over) arm();          // a run restored as finished keeps its results

  // Handle for the console (and for whatever drives region games later).
  window.CountryGuesser = {
    countries: countries,
    views: DATA.views,
    viewForBox: viewForBox,
    flyTo: flyTo,
    showRegion: function (region, ms) { flyTo(viewForBox(DATA.views[region], 0.92), ms); },
    showCountry: function (id, ms) { flyTo(viewForBox(framedBox(byId[id]), 0.55), ms); },
    quizView: function (c) { return quizView(c.bbox ? c : byId[c]); },
    guess: function (text) {
      input.value = text;
      if (targeted()) nameGuess(true); else tryGuess(true);
      return foundCount;
    },
    pick: function (id) {
      if (byId[id] && byId[id].inPlay) choose(byId[id]);
      return byId[id];
    },
    skip: skip,
    start: function (id) { if (id) chooseGame(id); else begin(); },
    get waiting() { return waiting; },
    setMode: function (id) { if (MODES[id]) { mode = MODES[id]; applyScope(); } return mode.id; },
    setRegion: function (name) {
      var next = DATA.views[name] ? name : null;
      if (next !== scope) { scope = next; applyScope(); }
      return scope;
    },
    modes: Object.keys(MODES),
    regions: DATA.regions,
    get mode() { return mode.id; },
    get region() { return scope; },
    get inPlay() { return pool.length; },
    get picked() { return selected && selected.id; },
    reveal: reveal,
    reset: reset,
    get score() { return foundCount; },
    get view() { return { k: k, tx: tx, ty: ty }; }
  };
})();
