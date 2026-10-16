/* Country Guesser - name all 197 countries.
 *
 * Everything is client side. data/mapdata.js holds pre-projected SVG paths
 * (Equal Earth, baked at build time by build/build_map.py), so there is no
 * mapping library and no network traffic at all.
 */
(function () {
  'use strict';

  var DATA = window.MAP_DATA;
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
  var DOT_PX = 2.4;              // locator dot radius, in screen units
  var DOT_LIMIT = 2.7;           // show a dot while the shape is thinner than this
  var FONT = 9;                  // must match .label font-size
  var STORE_KEY = 'country-guesser:progress:v1';
  var TIME_LIMIT = 15 * 60;      // the full-world game is a 15 minute run

  // ------------------------------------------------------------------ helpers
  function el(name) { return document.createElementNS(NS, name); }
  function $(id) { return document.getElementById(id); }

  function slug(text) { return text.toLowerCase().replace(/\s+/g, '-'); }

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

  var countries = DATA.countries.map(function (c) {
    return {
      id: c.id, name: c.name, region: c.region, answers: c.answers,
      area: c.area, bbox: c.bbox, d: c.d,
      d2: c.d2,
      span: Math.max(c.bbox[2] - c.bbox[0], c.bbox[3] - c.bbox[1], 0.5),
      anchors: [{ x: c.lx, y: c.ly, ir: c.ir, east: !!c.e }].concat(
        c.lx2 === undefined ? []
          : [{ x: c.lx2, y: c.ly2, ir: c.ir2 || c.ir, east: !c.e }]),
      found: false, path: null, paths: []
    };
  });

  var byId = {};
  countries.forEach(function (c) { byId[c.id] = c; });

  var k = 1, tx = 0, ty = 0;     // viewport transform
  var revealed = false;
  var foundCount = 0;
  var lastFound = null;
  var startedAt = null;
  var elapsed = 0;
  var over = false;              // run finished: won, gave up, or ran out
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
    $('zoom-readout').textContent = (k < 10 ? k.toFixed(1) : Math.round(k)) + '×';

    // The Pacific continues east of 180 so Oceania holds together, but that
    // copy only appears once the view actually reaches past the date line.
    var showEast = (W - tx) / k > W + 0.5;
    svg.classList.toggle('no-east', !showEast);

    var candidates = [];
    countries.forEach(function (c) {
      var named = c.found || revealed;
      c.anchors.forEach(function (a) {
        if (a.east && !showEast) {          // its copy east of 180 is hidden
          show(a.dot, false);
          show(a.label, false);
          return;
        }
        var sx = a.x * k + tx;
        var sy = a.y * k + ty;
        var onScreen = sx > -40 && sx < W + 40 && sy > -24 && sy < H + 24;
        var small = a.ir * k < DOT_LIMIT;

        show(a.dot, onScreen && small);
        if (onScreen && small) a.dot.setAttribute('r', DOT_PX / k);

        if (!onScreen) {
          show(a.label, false);
          return;
        }
        // Named countries claim space first; everything still unguessed shows
        // a question mark in whatever room is left.
        candidates.push({
          c: c, a: a, sx: sx, sy: sy, named: named,
          off: small ? DOT_PX + 4 : 0,
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
      }
      var half = item.named ? (item.c.name.length * FONT * 0.27) + 1.5 : 3.2;
      // Nudge names at the edge of the map inwards instead of cropping them.
      var cx = Math.max(half + 3, Math.min(W - half - 3, item.sx));
      var cy = item.sy - item.off;
      var box = [cx - half, cy - FONT * 0.62, cx + half, cy + FONT * 0.62];
      var clear = taken.every(function (other) { return !overlaps(other, box); });
      show(item.a.label, clear);
      if (!clear) return;
      taken.push(box);
      item.a.label.setAttribute('transform',
        'translate(' + item.a.x + ' ' + item.a.y + ') scale(' + 1 / k + ')');
      item.a.label.setAttribute('x', (cx - item.sx).toFixed(2));
      item.a.label.setAttribute('y', (FONT * 0.34 - item.off).toFixed(2));
    });
  }

  // --------------------------------------------------------- clock and scoring
  function startClock() {
    if (startedAt !== null || revealed) return;
    startedAt = Date.now();
    ticker = setInterval(tickClock, 500);
  }

  function spent() {
    return elapsed + (startedAt ? (Date.now() - startedAt) / 1000 : 0);
  }

  function clockText(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function tickClock() {
    var left = Math.max(0, TIME_LIMIT - spent());
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

  function accept(c, quiet) {
    c.found = true;
    foundCount += 1;
    lastFound = c;
    c.paths.forEach(function (path) {
      path.classList.add('found');
      replay(path);
    });
    c.anchors.forEach(function (a) {
      a.dot.classList.add('found');
      replay(a.dot, 1.45);        // dots are a fixed size on screen already
    });
    $('score').textContent = foundCount;
    updatePanel();
    draw();
    if (quiet) return;
    toast(c);
    save();
    if (foundCount === countries.length) finish();
  }

  function onScreen(c) {
    return c.anchors.some(function (a) {
      var sx = a.x * k + tx, sy = a.y * k + ty;
      return sx > 4 && sx < W - 4 && sy > 4 && sy < H - 4;
    });
  }

  var toastTimer = null;

  function toast(c) {
    toastEl.textContent = '';
    var text = document.createElement('span');
    text.textContent = '\u2713 ' + c.name;
    toastEl.appendChild(text);
    if (!onScreen(c)) {
      var go = document.createElement('button');
      go.type = 'button';
      go.textContent = 'Show me';
      go.addEventListener('click', function () {
        flyTo(viewForBox(c.bbox, 0.55));
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

  var HOLD_MS = 700;
  var hold = null;        // { norm, raw, country, timer }

  function startsAnAnswer(text) {
    return allAnswers.some(function (a) { return a.indexOf(text) === 0; });
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
    if (!held.country.found) accept(held.country);
  }

  function beginHold(country, text) {
    cancelHold();
    hold = {
      norm: text,
      raw: input.value,
      country: country,
      timer: setTimeout(commitHold, HOLD_MS)
    };
    hint('Press Enter for ' + country.name + ', or keep typing.');
  }

  function hint(text) {
    hintEl.textContent = text;
  }

  /** Runs on every keystroke. `force` means Enter: decide right now. */
  function tryGuess(force) {
    if (revealed) return;
    var text = normalize(input.value);

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

    if (!text) return;
    var hit = index[text];
    if (!hit) return;

    if (hit.found) {
      if (force) {
        input.value = '';
        hint('Already found ' + hit.name + '.');
      }
      return;
    }
    if (!force && ambiguous[text]) {
      beginHold(hit, text);
      return;
    }
    cancelHold();
    input.value = '';
    hint(foundCount + 1 === countries.length ? 'That is all of them.' : 'Keep going.');
    accept(hit);
  }

  input.addEventListener('input', function () {
    startClock();
    tryGuess(false);
  });

  input.addEventListener('blur', commitHold);

  $('guess-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var before = foundCount;
    tryGuess(true);
    if (foundCount === before && input.value.trim()) {
      input.classList.remove('wrong');
      void input.offsetWidth;
      input.classList.add('wrong');
      hint('Not a country on the list \u2014 or already found.');
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
    DATA.regions.forEach(function (region) {
      var row = rows[region];
      var got = countries.filter(function (c) { return c.region === region && c.found; }).length;
      row.count.textContent = got + ' / ' + row.total;
      row.bar.style.width = (100 * got / row.total) + '%';
      row.li.classList.toggle('done', got === row.total);
    });
  }

  function listMissed() {
    var body = $('missed-body');
    body.textContent = '';
    DATA.regions.forEach(function (region) {
      var missing = countries.filter(function (c) { return c.region === region && !c.found; });
      if (!missing.length) return;
      var head = document.createElement('h3');
      head.style.setProperty('--region', 'var(--' + slug(region) + ')');
      head.textContent = region + ' (' + missing.length + ')';
      var ul = document.createElement('ul');
      missing.forEach(function (c) {
        var li = document.createElement('li');
        li.textContent = c.name;
        li.addEventListener('click', function () { flyTo(viewForBox(c.bbox, 0.55)); });
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
    var palette = DATA.regions.map(function (r) {
      return getComputedStyle(document.documentElement)
        .getPropertyValue('--' + slug(r)).trim() || '#ffd166';
    });

    function calm() {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function fit() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function burst() {
      var x = (0.15 + Math.random() * 0.7) * window.innerWidth;
      var y = (0.12 + Math.random() * 0.45) * window.innerHeight;
      var colour = palette[Math.floor(Math.random() * palette.length)];
      var count = 46 + Math.floor(Math.random() * 26);
      var power = 2.2 + Math.random() * 2.4;
      for (var i = 0; i < count; i++) {
        var angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
        var speed = power * (0.55 + Math.random() * 0.75);
        sparks.push({
          x: x, y: y, px: x, py: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1, fade: 0.012 + Math.random() * 0.012,
          colour: colour
        });
      }
    }

    function step(now) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (now > nextBurst && now < until) {
        burst();
        nextBurst = now + 280 + Math.random() * 420;
      }
      for (var i = sparks.length - 1; i >= 0; i--) {
        var s = sparks[i];
        s.px = s.x;
        s.py = s.y;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.045;              // gravity
        s.vx *= 0.985;              // drag
        s.vy *= 0.985;
        s.life -= s.fade;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, Math.min(1, s.life));
        ctx.strokeStyle = s.colour;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.px, s.py);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (now < until || sparks.length) {
        frame = requestAnimationFrame(step);
      } else {
        stop();
      }
    }

    function start(ms) {
      if (calm()) return;
      fit();
      canvas.hidden = false;
      until = performance.now() + (ms || 5200);
      nextBurst = 0;
      if (!frame) frame = requestAnimationFrame(step);
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      sparks.length = 0;
      until = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      canvas.hidden = true;
    }

    window.addEventListener('resize', function () { if (frame) fit(); });
    return { start: start, stop: stop };
  })();

  // ------------------------------------------------------------------ endgame
  function markMissed() {
    countries.forEach(function (c) {
      if (c.found) return;
      c.paths.forEach(function (path) { path.classList.add('missed'); });
      c.anchors.forEach(function (a) {
        a.dot.classList.add('missed');
        a.label.classList.add('missed');
      });
    });
  }

  /** Ends the run. `how` is 'won', 'time' or 'gave-up'. */
  function endRun(how) {
    if (over) return;
    over = true;
    stopClock();
    cancelHold();
    input.disabled = true;
    $('clock').classList.remove('low');

    if (how !== 'won') {
      revealed = true;
      markMissed();
      listMissed();
    }
    draw();
    save();

    if (how === 'won') {
      fireworks.start();
      hint('All ' + countries.length + ', with ' + clockText(TIME_LIMIT - spent()) + ' to spare.');
    } else if (how === 'time') {
      hint('Time. You named ' + foundCount + ' of ' + countries.length + '.');
    } else {
      hint('You named ' + foundCount + ' of ' + countries.length + '. The rest are in red.');
    }
    setTimeout(function () { showResults(how); }, how === 'won' ? 900 : 260);
  }

  function finish() { endRun('won'); }
  function timeUp() { endRun('time'); }

  /** Give up, or re-dress a finished run restored from storage. */
  function reveal(quiet) {
    if (quiet) {
      over = true;
      revealed = true;
      stopClock();
      input.disabled = true;
      markMissed();
      listMissed();
      draw();
      return;
    }
    endRun('gave-up');
  }

  // ------------------------------------------------------------ results sheet
  var sheet = $('sheet');

  function showResults(how) {
    var total = countries.length;
    var left = Math.max(0, TIME_LIMIT - spent());

    $('sheet-title').textContent = how === 'won' ? 'Every last one.'
      : how === 'time' ? "Time's up." : 'Run ended.';
    $('sheet-line').textContent = how === 'won'
      ? 'All ' + total + ' countries with ' + clockText(left) + ' left on the clock.'
      : how === 'time' ? 'Fifteen minutes, ' + foundCount + ' named.'
        : 'You stopped with ' + clockText(left) + ' still on the clock.';
    $('final-score').textContent = foundCount;

    // Round towards the truth: one country short should not read as 100%.
    var share = (100 * foundCount) / total;
    var percent = Math.round(share);
    if (percent === 100 && foundCount < total) percent = 99;
    if (percent === 0 && foundCount > 0) percent = 1;
    $('final-percent').textContent = percent + '%';

    var list = $('breakdown');
    list.textContent = '';
    DATA.regions.forEach(function (region) {
      var all = countries.filter(function (c) { return c.region === region; });
      var got = all.filter(function (c) { return c.found; }).length;
      var li = document.createElement('li');
      li.style.setProperty('--region', 'var(--' + slug(region) + ')');
      li.innerHTML = '<i class="swatch"></i><span></span>' +
        '<span class="count"></span><span class="meter"><i></i></span>';
      li.querySelector('span').textContent = region;
      li.querySelector('.count').textContent = got + ' / ' + all.length;
      li.querySelector('.meter i').style.width = (100 * got / all.length) + '%';
      list.appendChild(li);
    });

    var body = $('sheet-missed-body');
    body.textContent = '';
    var missing = countries.filter(function (c) { return !c.found; });
    $('sheet-missed-title').textContent = missing.length
      ? 'Missed (' + missing.length + ')' : 'Nothing missed';
    DATA.regions.forEach(function (region) {
      var gone = missing.filter(function (c) { return c.region === region; });
      if (!gone.length) return;
      var head = document.createElement('h4');
      head.style.setProperty('--region', 'var(--' + slug(region) + ')');
      head.textContent = region + ' (' + gone.length + ')';
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

  function hideResults() {
    sheet.hidden = true;
    fireworks.stop();
  }

  $('sheet-close').addEventListener('click', hideResults);
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
    hideResults();
    revealed = false;
    over = false;
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
    hint('Correct guesses fill in and get a label');
    updatePanel();
    draw();
    try { localStorage.removeItem(STORE_KEY); } catch (err) { /* private mode */ }
    input.focus();
  }

  $('reveal').addEventListener('click', function () {
    if (!over) reveal();
  });
  $('reset').addEventListener('click', reset);

  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !sheet.hidden) hideResults();
  });

  // ------------------------------------------------------------------ storage
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        found: countries.filter(function (c) { return c.found; }).map(function (c) { return c.id; }),
        elapsed: Math.round(elapsed + (startedAt ? (Date.now() - startedAt) / 1000 : 0)),
        revealed: revealed || over
      }));
    } catch (err) { /* private mode: progress just will not persist */ }
  }

  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (err) { return; }
    if (!raw) return;
    var saved;
    try { saved = JSON.parse(raw); } catch (err) { return; }
    (saved.found || []).forEach(function (id) {
      if (byId[id] && !byId[id].found) accept(byId[id], true);
    });
    elapsed = saved.elapsed || 0;
    tickClock();
    if (saved.revealed) reveal();
    else if (foundCount) hint('Picked up where you left off — ' + foundCount + ' found.');
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
      svg.classList.add('dragging');
    } else if (touches.size === 2) {
      dragFrom = null;
      pinchFrom = pinchState();
    }
  });

  svg.addEventListener('pointermove', function (ev) {
    if (!touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

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

  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

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
    flyTo({ k: 1, tx: 0, ty: 0 });
  });

  // hover readout: only for countries the player has already earned
  function describe(ev) {
    var c = ev.target.country;
    if (!c || !(c.found || revealed)) {
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

  window.addEventListener('keydown', function (ev) {
    if (ev.target === input) return;
    if (ev.key === '+' || ev.key === '=') zoomAbout({ x: W / 2, y: H / 2 }, ZOOM_STEP);
    else if (ev.key === '-') zoomAbout({ x: W / 2, y: H / 2 }, 1 / ZOOM_STEP);
    else if (ev.key === '0') flyTo({ k: 1, tx: 0, ty: 0 });
    else if (ev.key.length === 1) input.focus();
  });

  // --------------------------------------------------------------------- boot
  $('total').textContent = countries.length;
  Array.prototype.forEach.call(document.querySelectorAll('.total-echo'), function (node) {
    node.textContent = countries.length;
  });
  updatePanel();
  clampView();
  applyView();
  restore();
  tickClock();
  input.focus();

  // Handle for the console (and for whatever drives region games later).
  window.CountryGuesser = {
    countries: countries,
    views: DATA.views,
    viewForBox: viewForBox,
    flyTo: flyTo,
    showRegion: function (region, ms) { flyTo(viewForBox(DATA.views[region], 0.92), ms); },
    showCountry: function (id, ms) { flyTo(viewForBox(byId[id].bbox, 0.55), ms); },
    guess: function (text) { input.value = text; tryGuess(true); return foundCount; },
    reveal: reveal,
    reset: reset,
    get score() { return foundCount; },
    get view() { return { k: k, tx: tx, ty: ty }; }
  };
})();
