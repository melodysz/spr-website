const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Don't let the browser restore the old scroll position on reload: it lands after the page loads, mid-intro
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
// Lag test switches (press P): effects switched off here, remembered in this browser until switched back on
const PERF_OFF = new Set((() => { try { return JSON.parse(localStorage.getItem('spr-perf-off') || '[]'); } catch { return []; } })());
const perfOff = key => PERF_OFF.has(key);
PERF_OFF.forEach(k => document.documentElement.classList.add('perf-off-' + k));

/* ───────── Art stages scale to the viewport (designed at 1470px wide) ───────── */
function fitStages() {
  const s = Math.min(1, document.documentElement.clientWidth / 1470);
  document.documentElement.style.setProperty('--s', s);
}
addEventListener('resize', fitStages);
fitStages();

/* ───────── Smooth scroll (light: trackpad/wheel only, touch stays native) ───────── */
const lenis = !reduceMotion && window.Lenis && !perfOff('smooth') ? new Lenis({ lerp: 0.24 }) : null;
if (lenis) requestAnimationFrame(function raf(t) { lenis.raf(t); requestAnimationFrame(raf); });
const NAV_H = () => { const nav = $('#nav'); return nav.offsetHeight + parseFloat(getComputedStyle(nav).top); }; // the floating bar + its gap from the top

/* ───────── Custom cursor: full-screen crosshair + square (mouse/trackpad only) ───────── */
(function cursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  // Performance: the lines and square live on small canvases that are only REDRAWN on the boil beat (or when their
  // look changes). Moving the mouse just slides them with transforms, which is nearly free.
  const el = $('#cursor'), xy = $('.cx-xy', el);
  const vCan = $('.cx-v', el), hCan = $('.cx-h', el), vCtx = vCan.getContext('2d'), hCtx = hCan.getContext('2d');
  // The square has its own layer so it can use a different blend mode on dark backgrounds
  const sqEl = $('#cursor-sq'), sqCanvas = $('canvas', sqEl), sqCtx = sqCanvas.getContext('2d');
  document.documentElement.classList.add('has-cursor');
  let mx = -1, my = -1, hovering = false, down = false, dark = false, dirty = true;
  let size = 0, seed = 1, lastBoil = 0;
  const LINE_PAD = 12;      // room either side of each line for the hand-drawn wobble
  let SQ = 80;              // square canvas size (css px), grows if the square is set very large

  function setCanvas(c, x, w, h) {
    const dpr = devicePixelRatio || 1;
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function resize() {
    setCanvas(vCan, vCtx, LINE_PAD * 2, innerHeight);
    setCanvas(hCan, hCtx, innerWidth, LINE_PAD * 2);
    SQ = Math.max(80, Math.ceil((cfg?.csq || 10) * 1.85 + 30));
    setCanvas(sqCanvas, sqCtx, SQ, SQ);
    dirty = true;
  }

  // Lines + square are hand-drawn with rough.js; a new seed every 150ms makes them "boil"
  const rough_ = window.rough;
  const rcV = rough_ ? rough_.canvas(vCan) : null, rcH = rough_ ? rough_.canvas(hCan) : null, rcSq = rough_ ? rough_.canvas(sqCanvas) : null;
  function line(rc, ctx, x1, y1, x2, y2, o) {
    if (rc) return rc.line(x1, y1, x2, y2, o);
    ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeWidth;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function square(x, y, s, o, fill) {
    if (rcSq) return rcSq.rectangle(x, y, s, s, { ...o, fill: fill ? o.stroke : undefined, fillStyle: 'solid' });
    sqCtx.strokeStyle = sqCtx.fillStyle = o.stroke; sqCtx.lineWidth = o.strokeWidth;
    if (fill) sqCtx.fillRect(x, y, s, s);
    sqCtx.strokeRect(x, y, s, s);
  }

  // Is the spot under the cursor dark? Uses the nearest solid background colour (photo cards count as dark)
  function isDark(t) {
    if (t?.closest('.reel-card, [data-dark]')) return true;
    for (let n = t; n && n !== document.documentElement; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (!m || (m.length === 4 && +m[3] < 0.5)) continue;
      const [r, g, b] = m.map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.4;
    }
    return false;
  }
  let under = null; // element currently under the cursor
  function updateUnder(t) {
    under = t;
    hovering = !!t?.closest('a, button, .has-letter, .cw-deco, .star-layer .star, .chip, .legend-item');
    el.classList.toggle('on-green', !!t?.closest('.footer, .founders, .bg-green, .btn-green'));
    dark = isDark(t);
    sqCanvas.style.mixBlendMode = dark ? cfg.darkBlend : cfg.blend;
    dirty = true;
  }

  let stroke = null; // cached cursor colour (re-read only when it can change)
  function draw() {
    const W = innerWidth, H = innerHeight;
    vCtx.clearRect(0, 0, LINE_PAD * 2, H);
    hCtx.clearRect(0, 0, W, LINE_PAD * 2);
    sqCtx.clearRect(0, 0, SQ, SQ);
    if (mx < 0) return;
    stroke = getComputedStyle(el).getPropertyValue('--cc').trim() || cfg.color;
    const base = { stroke, roughness: cfg.boil, seed, disableMultiStroke: true };
    vCtx.globalAlpha = hCtx.globalAlpha = cfg.cop / 100;
    line(rcV, vCtx, LINE_PAD, 0, LINE_PAD, H, { ...base, strokeWidth: cfg.cw, bowing: 0.15 });
    line(rcH, hCtx, 0, LINE_PAD, W, LINE_PAD, { ...base, strokeWidth: cfg.cw, bowing: 0.15 });
    vCtx.globalAlpha = hCtx.globalAlpha = 1;
    if (cfg.sq !== 'none' && size > 0.5) {
      square(SQ / 2 - size / 2, SQ / 2 - size / 2, size, { ...base, strokeWidth: cfg.cb, maxRandomnessOffset: 1, bowing: 0.5 }, cfg.sq === 'filled' || down);
    }
  }
  function place() {
    vCan.style.transform = `translateX(${mx - LINE_PAD}px)`;
    hCan.style.transform = `translateY(${my - LINE_PAD}px)`;
    sqCanvas.style.transform = `translate(${mx - SQ / 2}px, ${my - SQ / 2}px)`;
    xy.style.transform = `translate(${mx}px, ${my}px)`;
  }
  let lastFrame = performance.now(), frame = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (perfOff('cursor')) return;
    const dt = Math.min(0.05, (t - lastFrame) / 1000);
    lastFrame = t;
    // Re-check what's under a still cursor every few frames (the page can move underneath it)
    if (mx >= 0 && ++frame % 3 === 0) {
      const now = document.elementFromPoint(mx, my);
      if (now !== under) updateUnder(now);
    }
    const target = cfg.sq === 'none' ? 0 : cfg.csq * (hovering ? 1.85 : 1);
    if (Math.abs(target - size) > 0.05) { size += (target - size) * (1 - Math.exp(-dt * 35)); dirty = true; } // ~70ms to settle
    else if (size !== target) { size = target; dirty = true; }
    if (cfg.boil > 0 && !reduceMotion && t - lastBoil > 150) { lastBoil = t; seed = seed % 9999 + 1; dirty = true; }
    if (dirty) { dirty = false; draw(); }
  }

  // Page coordinates (include scroll), so the numbers also tick while scrolling
  function showCoords() {
    if (mx < 0) return;
    const pad = n => String(Math.round(n)).padStart(4, '0');
    xy.textContent = `X ${pad(mx + scrollX)}\nY ${pad(my + scrollY)}`;
  }
  addEventListener('scroll', showCoords, { passive: true }); // (what's under the cursor is re-checked in the loop)

  // Position: use the lowest-latency event the browser offers; moving only slides the canvases
  function move(e) {
    if (e.pointerType !== 'mouse') return;
    const first = mx < 0;
    mx = e.clientX; my = e.clientY;
    place();
    el.classList.toggle('flip-x', mx > innerWidth - 90);
    el.classList.toggle('flip-y', my > innerHeight - 50);
    showCoords();
    if (first) { el.classList.add('visible'); sqEl.classList.add('visible'); dirty = true; }
  }
  if ('onpointerrawupdate' in window) addEventListener('pointerrawupdate', move);
  addEventListener('pointermove', e => {
    move(e);
    el.classList.add('visible'); sqEl.classList.add('visible');
    updateUnder(e.target instanceof Element ? e.target : null);
  });
  document.addEventListener('pointerleave', () => { el.classList.remove('visible'); sqEl.classList.remove('visible'); });
  addEventListener('pointerdown', () => { down = true; dirty = true; });
  addEventListener('pointerup', () => { down = false; dirty = true; });

  /* Playground: live-tweak colour, blend mode, sizes */
  const DEFAULTS = { color: '#00d37f', blend: 'multiply', cw: 0.5, cop: 100, csq: 10, cb: 1.5, sq: 'filled', swap: true, xy: true, boil: 0.6, darkBlend: 'screen' };
  const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
    'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
  let cfg = { ...DEFAULTS };
  try { cfg = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('spr-cursor') || '{}') }; } catch {}

  const pg = $('#pg');
  $('#pg-blends').innerHTML = $('#pg-dark-blends').innerHTML = BLENDS.map(b => `<button data-v="${b}">${b.replace('-', ' ')}</button>`).join('');

  function apply() {
    el.style.setProperty('--user-c', cfg.color);
    resize(); // square canvas size follows the square-size setting
    el.style.setProperty('--blend', cfg.blend);
    sqCanvas.style.mixBlendMode = dark ? cfg.darkBlend : cfg.blend;
    $$('#pg-dark-blends button').forEach(b => b.classList.toggle('on', b.dataset.v === cfg.darkBlend));
    $('#pg-dark-name').textContent = '· ' + cfg.darkBlend;
    el.style.setProperty('--cw', cfg.cw + 'px');
    el.style.setProperty('--cop', cfg.cop / 100);
    el.style.setProperty('--csq', cfg.csq + 'px');
    el.style.setProperty('--cb', cfg.cb + 'px');
    el.classList.toggle('swap-green', cfg.swap);
    dirty = true;
    el.classList.toggle('no-xy', !cfg.xy);
    $('#pg-xy').checked = cfg.xy;

    let matched = false;
    $$('#pg-colors button').forEach(b => { const on = b.dataset.v === cfg.color; b.classList.toggle('on', on); matched ||= on; });
    $('.pg-custom').classList.toggle('on', !matched);
    $('.pg-custom').style.background = matched ? '' : cfg.color;
    $('#pg-color').value = cfg.color;
    $$('#pg-blends button').forEach(b => b.classList.toggle('on', b.dataset.v === cfg.blend));
    $$('#pg-sq button').forEach(b => b.classList.toggle('on', b.dataset.v === cfg.sq));
    $('#pg-blend-name').textContent = '· ' + cfg.blend;
    for (const k of ['cw', 'cop', 'csq', 'cb', 'boil']) {
      $('#pg-' + k).value = cfg[k];
      $(`#pg-${k}-v`).textContent = k === 'cop' ? cfg[k] + '%' : k === 'boil' ? (cfg[k] ? cfg[k] : 'off') : cfg[k] + 'px';
    }
    $('#pg-swap').checked = cfg.swap;
    try { localStorage.setItem('spr-cursor', JSON.stringify(cfg)); } catch {}
  }
  const set = patch => { cfg = { ...cfg, ...patch }; apply(); };

  $('#pg-colors').addEventListener('click', e => { const b = e.target.closest('button'); if (b) set({ color: b.dataset.v }); });
  $('#pg-color').addEventListener('input', e => set({ color: e.target.value }));
  $('#pg-blends').addEventListener('click', e => { const b = e.target.closest('button'); if (b) set({ blend: b.dataset.v }); });
  $('#pg-dark-blends').addEventListener('click', e => { const b = e.target.closest('button'); if (b) set({ darkBlend: b.dataset.v }); });
  $('#pg-sq').addEventListener('click', e => { const b = e.target.closest('button'); if (b) set({ sq: b.dataset.v }); });
  for (const k of ['cw', 'cop', 'csq', 'cb', 'boil']) $('#pg-' + k).addEventListener('input', e => set({ [k]: +e.target.value }));
  $('#pg-swap').addEventListener('change', e => set({ swap: e.target.checked }));
  $('#pg-xy').addEventListener('change', e => set({ xy: e.target.checked }));
  $('#pg-reset').addEventListener('click', () => set({ ...DEFAULTS }));
  $('#pg-copy').addEventListener('click', () => {
    const text = `Cursor: colour ${cfg.color} · blend ${cfg.blend} (square on dark: ${cfg.darkBlend}) · lines ${cfg.cw}px at ${cfg.cop}% · square ${cfg.csq}px ${cfg.sq}, ${cfg.cb}px border · coordinates ${cfg.xy ? 'on' : 'off'} · boil ${cfg.boil} · navy over green: ${cfg.swap ? 'on' : 'off'}`;
    navigator.clipboard?.writeText(text);
    const btn = $('#pg-copy'); btn.textContent = 'Copied ✓';
    setTimeout(() => btn.textContent = 'Copy settings', 1400);
  });

  const toggle = open => {
    pg.classList.toggle('open', open);
    $('#pg-toggle').style.display = open ? 'none' : '';
  };
  $('#pg-toggle').addEventListener('click', () => toggle(true));
  $('#pg-close').addEventListener('click', () => toggle(false));
  addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'c' || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea')) return;
    toggle(!pg.classList.contains('open'));
  });
  addEventListener('resize', resize);
  apply();
  requestAnimationFrame(loop);
})();

/* ───────── Router (#/about, #/members …) ───────── */
let pendingCard = null;
let introHook = null; // set by the intro module; told about every page change

function route() {
  const name = location.hash.replace(/^#\/?/, '') || 'home';
  const pages = $$('.page');
  const target = pages.find(p => p.dataset.page === name) || pages[0];
  pages.forEach(p => p.classList.toggle('active', p === target));
  introHook?.(target.dataset.page);
  $$('.nav-links a[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === target.dataset.page));
  $('#nav').classList.remove('open');
  closeModal();

  if (pendingCard) {
    const card = $('#init-' + pendingCard);
    pendingCard = null;
    lenis ? lenis.scrollTo(0, { immediate: true }) : scrollTo(0, 0);
    requestAnimationFrame(() => {
      const offset = -(innerHeight - card.offsetHeight) / 2;
      lenis ? lenis.scrollTo(card, { offset, duration: 1.1 }) : card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    });
  } else {
    lenis ? lenis.scrollTo(0, { immediate: true }) : scrollTo(0, 0);
  }
}
addEventListener('hashchange', route);

$('#nav-toggle').addEventListener('click', () => {
  const open = $('#nav').classList.toggle('open');
  $('#nav-toggle').setAttribute('aria-expanded', open);
});

/* Stage-space pointer helper (stages are CSS-scaled) */
const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;

/* ───────── Crossword (Figma "Intro" 100:722) ───────── */
(function crossword() {
  const stage = $('#crossword');
  // 19 × 14 cells, 46.14px apart, from (638, 139); the last column runs off the right edge like the design
  const COLS = 19, ROWS = 14, STEP = 46.14;
  const x = c => 638 + STEP * c;
  const y = r => 139 + STEP * r;

  const words = [
    { w: 'EXPLORE', c: 2, r: 2, down: true },
    { w: 'POLICY', c: 1, r: 6 },
    { w: 'COMMUNITY', c: 6, r: 4 },
    { w: 'JUSTICE', c: 10, r: 3, down: true },
    { w: 'ADVOCACY', c: 4, r: 8 },
    { w: 'EDUCATE', c: 10, r: 9 },
    { w: 'RESEARCH', c: 14, r: 5, down: true },
  ];
  // decorative cells (the word cells get their lime/green as their letters drop in)
  const fills = {
    '0,1': 'cream', '10,1': 'cream', '15,1': 'cream', '2,1': 'lavender', '1,2': 'cream', '6,2': 'cream', '9,2': 'lavender',
    '11,2': 'cream', '14,2': 'cream', '15,2': 'lavender', '12,3': 'cream', '17,3': 'cream', '18,3': 'lavender',
    '0,4': 'cream', '3,4': 'cream', '1,5': 'green', '12,5': 'cream', '16,5': 'teal', '18,5': 'cream', '8,6': 'teal',
    '0,7': 'cream', '11,7': 'cream', '17,7': 'cream', '7,9': 'lavender', '17,9': 'cream', '0,10': 'cream', '3,10': 'lavender',
    '0,11': 'teal', '15,11': 'cream', '17,11': 'green', '4,12': 'teal',
  };

  const cells = {};
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el = document.createElement('div');
      el.className = 'cw-cell';
      el.style.left = x(c) + 'px';
      el.style.top = y(r) + 'px';
      if (fills[`${c},${r}`]) el.style.background = `var(--${fills[`${c},${r}`]})`;
      stage.appendChild(el);
      cells[`${c},${r}`] = { el, words: [] };
    }
  }

  words.forEach((word, wi) => {
    word.cells = [...word.w].map((ch, i) => {
      const key = word.down ? `${word.c},${word.r + i}` : `${word.c + i},${word.r}`;
      const cell = cells[key];
      cell.el.classList.add(word.down ? 'wd' : 'wa', 'has-letter');
      if (!cell.el.firstChild) cell.el.innerHTML = `<span class="ch">${ch}</span>`;
      cell.words.push(wi);
      return cell;
    });
  });

  // Hover a letter → highlight its word(s)
  Object.values(cells).filter(c => c.words.length).forEach(cell => {
    cell.el.addEventListener('mouseenter', () => cell.words.forEach(wi => words[wi].cells.forEach(c => c.el.classList.add('hl'))));
    cell.el.addEventListener('mouseleave', () => $$('.cw-cell.hl', stage).forEach(el => el.classList.remove('hl')));
  });

  // Letters drop in word by word when the section scrolls into view
  const io = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    words.forEach((word, wi) => word.cells.forEach((cell, i) => {
      setTimeout(() => cell.el.classList.add('shown'), reduceMotion ? 0 : wi * 320 + i * 55);
    }));
  }, { threshold: 0.25 });
  io.observe(stage);

  // Stickers (draggable)
  const decos = [
    { src: 'sticker62.png', cx: 1341.47, cy: 270.66, w: 56.599, h: 54.102, rot: 31.99 },
    { src: 'sticker60.png', cx: 1402.37, cy: 342.92, w: 44.411, h: 38.767, rot: -43.33 },
    { src: 'sticker63.png', cx: 814.34, cy: 649.63, w: 50.492, h: 48.361, rot: 21.56, flipY: true },
  ];
  let topZ = 10;
  decos.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cw-deco';
    Object.assign(el.style, { left: d.cx - d.w / 2 + 'px', top: d.cy - d.h / 2 + 'px', width: d.w + 'px', height: d.h + 'px' });
    const imgStyle = `inset:0; width:100%; height:100%; object-fit:cover;${d.flipY ? ' transform:scaleY(-1);' : ''}`;
    el.innerHTML = `<div class="rot" style="rotate:${d.rot}deg"><img src="assets/${d.src}" alt="" draggable="false" style="${imgStyle}"></div>`;
    stage.appendChild(el);

    let start = null, pos = { x: 0, y: 0 };
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      el.style.zIndex = ++topZ;
      start = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    });
    el.addEventListener('pointermove', e => {
      if (!start) return;
      const s = stage.getBoundingClientRect().width / 1470;
      pos = { x: start.px + (e.clientX - start.x) / s, y: start.py + (e.clientY - start.y) / s };
      el.style.translate = `${pos.x}px ${pos.y}px`;
    });
    el.addEventListener('pointerup', () => { start = null; });
  });
})();

/* ───────── "Four ways we show up": rotating View-Master reel ───────── */
(function reel() {
  const stage = $('#reel-stage');
  const reelEl = $('#reel');
  const CENTER = { x: 735.6, y: 1290.6 };
  const R = 775;                      // radius of the reel's windows
  const STEP = 360 / 14;              // the reel has 14 windows
  const FIRST = -41.8;                // window angle of card 01 in the design

  const impacts = {
    1: { title: 'Community-<br>Building', bg: '', imgs: [
      '<img src="assets/impact1a.png" alt="" style="left:-16.89%; top:-52.3%; width:127.51%; height:170.26%">',
      '<img class="cover" src="assets/impact1b.png" alt="">'] },
    2: { title: 'Grassroots<br>Advocacy', bg: 'var(--lime)', imgs: ['<img class="cover" src="assets/impact2.png" alt="">'] },
    3: { title: 'Science Policy<br>Education', bg: 'var(--lavender)', imgs: ['<img src="assets/impact3.png" alt="" style="left:.2%; top:-17.35%; width:100%; height:177.98%">'] },
    4: { title: 'Research Skills<br>Development', bg: 'var(--teal)', imgs: ['<img src="assets/impact4.png" alt="" style="left:-.1%; top:-37.32%; width:100%; height:160.48%">'] },
  };
  // 14 windows: the 4 impacts three times, with an SPR* card between runs
  const seq = [1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4];

  seq.forEach((n, j) => {
    const card = document.createElement('div');
    const a = FIRST + STEP * j;
    card.style.transform = `rotate(${a}deg) translateY(-${R}px) translate(-50%, -50%)`;
    if (n === 0) {
      card.className = 'reel-card spr';
      card.innerHTML = '<p class="mono semi">SPR</p><p class="big">*</p>';
    } else {
      const imp = impacts[n];
      card.className = 'reel-card';
      card.innerHTML = `<div class="bgs" style="background:${imp.bg || 'transparent'}">${imp.imgs.join('')}<div class="grad"></div></div>
        <p class="mono semi">0${n}</p><p class="h3">${imp.title}</p>`;
      $$('img', card).forEach(img => img.draggable = false);
    }
    reelEl.appendChild(card);
  });

  // Motion: constant slow spin; slows on hover; drag to fling it
  const BASE = reduceMotion ? 0 : 3;  // degrees per second (~2 min per turn)
  const HOVER = reduceMotion ? 0 : 0.8;
  let angle = 0, speed = BASE, hovering = false, drag = null, last = performance.now();

  const centerOnScreen = () => {
    const r = stage.getBoundingClientRect(), s = scale();
    return { x: r.left + CENTER.x * s, y: r.top + CENTER.y * s };
  };
  const pointerAngle = e => { const c = centerOnScreen(); return Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI; };

  stage.addEventListener('pointerenter', () => hovering = true);
  stage.addEventListener('pointerleave', () => hovering = false);
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
    drag = { last: pointerAngle(e), t: performance.now(), v: 0 };
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const a = pointerAngle(e), now = performance.now();
    let d = a - drag.last;
    if (d > 180) d -= 360; if (d < -180) d += 360;
    angle += d;
    drag.v = d / Math.max(1, now - drag.t) * 1000;
    drag.last = a; drag.t = now;
  });
  const endDrag = () => {
    if (!drag) return;
    speed = Math.max(-240, Math.min(240, drag.v));
    drag = null;
    stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // Only turns while the section is on screen: a transform written every frame keeps the browser repainting the
  // whole time the page is open, which made long sessions stutter (it picks up where it left off)
  let onScreen = false, running = false;
  function tick(now) {
    if (!onScreen) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!drag) {
      const target = hovering ? HOVER : BASE;
      speed += (target - speed) * (1 - Math.exp(-dt * 1.6));
      angle += speed * dt;
    }
    reelEl.style.transform = `rotate(${angle}deg)`;
    requestAnimationFrame(tick);
  }
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting && e.intersectionRect.height > 0; // touching the screen edge doesn't count
    if (onScreen && !running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  }, { threshold: [0, 0.01] }).observe(stage);
})();

/* ───────── "What we do": sticker clock, hands follow the labels ───────── */
(function clock() {
  const PIVOT = { x: 752, y: 380 };
  const long = $('#hand-long'), short = $('#hand-short');
  let aLong = -45.65, aShort = -87.68, pointing = false, ticks = 0;
  const render = () => { long.style.rotate = aLong + 'deg'; short.style.rotate = aShort + 'deg'; };

  $$('.clock-label').forEach(label => {
    const cx = parseFloat(label.style.left) + 57.5, cy = parseFloat(label.style.top) + 24;
    const pointAt = Math.atan2(cy - PIVOT.y, cx - PIVOT.x) * 180 / Math.PI;
    // Hovering a label swings the hour (short) hand to it; the minute hand keeps ticking
    label.addEventListener('pointerenter', () => {
      pointing = true;
      short.classList.add('pointing');
      aShort += ((pointAt - aShort) % 360 + 540) % 360 - 180; // shortest way round
      render();
    });
    label.addEventListener('pointerleave', () => { pointing = false; short.classList.remove('pointing'); });
    label.addEventListener('click', () => { pendingCard = label.dataset.card; });
  });

  // Second-hand style: jump 6° once a second; the short hand jumps every 12 ticks
  if (!reduceMotion) setInterval(() => {
    aLong += 6;
    if (++ticks % 12 === 0 && !pointing) aShort += 6;
    render();
  }, 1000);
  render();
})();

/* ───────── Members + bio modal ───────── */
const members = [
  { first: 'Sabrielle', name: 'Sabrielle Jahangir', role: 'Executive Coordinator', pron: 'she/her', year: 'Senior', major: 'Neuroscience', bio: [
    'I am the Executive Coordinator of SPR, and also one of the founding members (along with Esther Fadaka, Maya Hoffman, and Matthew Adjodha). I am a Neuroscience student at the University of Maryland, and am super interested in studying psilocybin (magic mushrooms), its therapeutic benefits, and its role in philosophical conversations about consciousness. I currently volunteer at UMD’s Language and Music Cognition Lab, and have also worked in a protein biology lab through the Department of Microbiology.',
    'SPR is important to me because I believe that any kind of social issue or systemic inequality can be examined by critiquing how science is conducted, and how science-related policy is implemented. I also believe that STEM education needs to foster a sense of servitude in budding scientists with equal rigor to the technical training it provides; SPR aims to do just that.',
    'Beyond SPR, I’m a member of 17 For Peace and Justice, an environmental justice organization, as well as Terrapin Record Label, a student music club. My hobbies include running, meditating, and reading. I also sing and play guitar, often with my band, Albatross.'] },
  { first: 'Ku', name: 'Ku Li', role: 'Marketing Coordinator', pron: 'no pronouns', year: 'Senior', major: 'Social Data Science · Minors: Survey Methodology, Demography', bio: [
    "I am a senior majoring in Social Data Science and minoring in Survey Methodology and Demography. I'm currently SPR's Marketing Coordinator. I hope to pursue a career in academia to better understand how to effectively design technological interventions for and with marginalized communities of color.",
    "I joined SPR last year to connect with other social justice-oriented scientists and learn more about what's happening with science policy in the wake of the administration's attacks on research. I enjoy drawing, playing video games, reading comics, and attending local shows in my free time."] },
  { first: 'Matt', name: 'Matt Carr', role: 'Finance Coordinator', pron: 'he/him', year: 'Junior', major: 'Environmental Science & Technology', bio: [
    'I am an Environmental Science and Technology major with a concentration in Soil and Watershed Science. I aim to work in improving the sustainability of agriculture, and reducing the impact of climate change on global food systems. I enjoy listening to new music, collecting DVDs, and meeting new people.'] },
  { first: 'Chloe', name: 'Chloe Cartwright', role: 'Programming Coordinator', pron: 'she/her', year: 'Senior', major: 'Psychology / Public Health Practice', bio: [
    'I am a senior Psychology and Public Health Practice double-major and a Programming Coordinator at SPR. My research interests lie in translational research, neuroimaging, and psychiatric illnesses, specifically schizophrenia and schizoaffective disorder. My previous experience working in medical research and seeing the ways policy affected our research projects encouraged me to get involved with SPR.',
    "In SPR I've found opportunities to advance my knowledge of science advocacy and work with my peers to encourage political literacy among aspiring scientists. My favorite part of SPR is collaborating with a diverse group of students from various disciplines! Outside of SPR I enjoy running, live music, and making delicious plant-based meals."] },
  { first: 'Enguun', name: 'Enguun Chinbat', role: 'Programming Coordinator', pron: '[ pronouns ]', year: 'Junior', major: 'Physiology & Neurobiology · Minor: Human Development', bio: [
    'Hi! I am a junior physiology and neurobiology major with a minor in human development on the pre-med track, with aspirations to become an oncologist. My background includes being a research assistant, a medical assistant, and a team leader for the Maryland Mentor Corp. And most importantly, being the programming coordinator for SPR.',
    "I joined SPR to advocate for more accessibility in research for every population of people and I can't wait to meet the people and researchers that SPR will bring together. Outside of school, I have a large collection of plants that I diligently take care of and I love thrifting!"] },
  { first: 'Daniel', name: 'Daniel Tellez-Fenner', role: 'Programming Coordinator', pron: 'he/him', year: 'Junior', major: 'Cell Biology & Molecular Genetics', bio: [
    'Hi! My name is Daniel Tellez-Fenner and I am a Junior in SPR! In the future I hope to become a physician scientist where I bridge medicine with research. I love the outdoors, music and science! I have a passion for research as it encourages creativity, problem solving, and community to develop science that improves society.',
    "But science cannot be useful to a community unless everyone has access to the new information that could be used for innovation. Knowledge is one of the greatest gifts to have as it can be used to improve yourself, others, and your community. Which is why I joined SPR because we advocate for public access to research in hopes that it's used to improve society. Research is not only found in biomedical sciences but a large range of fields. Providing research to all areas of science or information is a necessity in order to improve all parts of communities."] },
  { first: 'Yashita', name: 'Yashita Thalla', role: 'Recruitment Coordinator', pron: 'she/her', year: 'Sophomore', major: 'Neurobiology & Physiology · Minor: Human Development', bio: [
    'I am a rising sophomore studying Neurobiology & Physiology, aspiring to become a physician in the future. Other than my passion for healthcare, I am deeply interested in healthcare policy, research, and scientific literacy. I have prior experience in leading workshops and a high school club related to increasing STEM engagement among women and I conduct research at the National Cancer Institute and a Cognition & Development lab on campus.',
    'I hope to continue making an impact on increasing science knowledge and addressing the gap between civic engagement and science policy in her surrounding community through her work with SPR. Outside of SPR, I am also on the Maryland Dhoom dance team and love to read, travel, and hike!'] },
  { first: 'Jaron', name: 'Jaron [ last name ]', role: 'Recruitment Coordinator', pron: 'he/him', year: 'Sophomore', major: 'Neuroscience', bio: [
    "I'm Jaron, a second year neuroscience student at UMD originally from Baltimore, Maryland. I have a strong interest in neurology, health equity, and health policy and I'm currently working towards a career in medicine. Outside of my academic and professional interests, I enjoy playing video games and Tennis."] },
];

$('#member-grid').innerHTML = members.map((m, i) => `
  <button class="member" data-i="${i}">
    <div class="ph mono">[ headshot ]</div>
    <div class="info">
      <p class="mono-s c-green">${m.role}</p>
      <p class="h4 c-white">${m.name}</p>
      <div class="meta mono-s"><span class="c-lavender">${m.pron}</span><span class="c-muted">·</span><span class="c-lavender">${m.year}</span></div>
      <p class="body-s c-muted">${m.major}</p>
      <p class="bio">${m.bio[0]}</p>
      <p class="mono-s c-lime more">Read more +</p>
    </div>
  </button>`).join('');

const modal = $('#modal');
let current = 0;

function fillModal(i) {
  current = (i + members.length) % members.length;
  const m = members[current];
  $('#m-role').textContent = m.role;
  $('#m-name').textContent = m.name;
  $('#m-pron').textContent = m.pron;
  $('#m-year').textContent = m.year;
  $('#m-major').textContent = m.major;
  $('#m-bio').innerHTML = m.bio.map(p => `<p>${p}</p>`).join('');
  $('#m-prev').textContent = '← ' + members[(current - 1 + members.length) % members.length].first;
  $('#m-next').textContent = members[(current + 1) % members.length].first + ' →';
  const details = $('#modal-details');
  details.classList.remove('swap'); void details.offsetWidth; details.classList.add('swap');
  details.scrollTop = 0;
}
function openModal(i) {
  fillModal(i);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  lenis?.stop();
  $('#m-close').focus();
}
function closeModal() {
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  lenis?.start();
}
$$('.member').forEach(b => b.addEventListener('click', () => openModal(+b.dataset.i)));
$('#m-close').addEventListener('click', closeModal);
$('#m-prev').addEventListener('click', () => fillModal(current - 1));
$('#m-next').addEventListener('click', () => fillModal(current + 1));
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
addEventListener('keydown', e => {
  if (!modal.classList.contains('open')) return;
  if (e.key === 'Escape') closeModal();
  if (e.key === 'ArrowLeft') fillModal(current - 1);
  if (e.key === 'ArrowRight') fillModal(current + 1);
});

/* ───────── Events calendar ───────── */
(function calendar() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  const TYPES = {
    gbm: { label: 'GBM', cls: 'bg-green' },
    journal: { label: 'Journal Club', cls: 'bg-lime' },
    speaker: { label: 'Guest Speaker', cls: 'bg-lavender' },
  };

  // Placeholder schedule: Tuesdays alternate GBM / Journal Club, guest speaker on the 3rd Thursday
  function eventsFor(year, month) {
    const out = {};
    const days = new Date(year, month + 1, 0).getDate();
    let tue = 0, thu = 0;
    for (let d = 1; d <= days; d++) {
      const wd = new Date(year, month, d).getDay();
      if (wd === 2) out[d] = tue++ % 2 === 0 ? 'gbm' : 'journal';
      if (wd === 4 && ++thu === 3) out[d] = 'speaker';
    }
    return out;
  }

  function render() {
    const y = view.getFullYear(), m = view.getMonth();
    $('#cal-title').textContent = view.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const offset = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const evs = eventsFor(y, m);
    const total = Math.ceil((offset + days) / 7) * 7;
    let html = '';
    for (let i = 0; i < total; i++) {
      if (i % 7 === 0) html += '<div class="cal-week">';
      const d = i - offset + 1;
      if (d < 1 || d > days) {
        html += '<div class="cal-day outside"></div>';
      } else {
        const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
        const t = evs[d];
        html += `<div class="cal-day${isToday ? ' today' : ''}"><span class="n mono-s">${d}</span>${t ? `<span class="chip mono-s ${TYPES[t].cls}" data-type="${t}">${TYPES[t].label}</span>` : ''}</div>`;
      }
      if (i % 7 === 6) html += '</div>';
    }
    $('#cal-grid').innerHTML = html;
  }

  // "Up next" — first upcoming date of each event type
  const upcoming = {};
  for (let k = 0; k < 3 && Object.keys(upcoming).length < 3; k++) {
    const y = today.getFullYear(), m = today.getMonth() + k;
    const evs = eventsFor(y, m);
    Object.keys(evs).map(Number).sort((a, b) => a - b).forEach(d => {
      const date = new Date(y, m, d);
      if (date >= today && !upcoming[evs[d]]) upcoming[evs[d]] = date;
    });
  }
  $$('.up-item').forEach(item => {
    const date = upcoming[item.dataset.type];
    if (date) $('[data-when]', item).textContent = date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · [ Time ]';
  });

  $('#cal-prev').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
  $('#cal-next').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
  $('#cal-today').addEventListener('click', () => { view = new Date(today.getFullYear(), today.getMonth(), 1); render(); });
  $('#cal-grid').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const item = $(`.up-item[data-type="${chip.dataset.type}"]`);
    item.classList.remove('pulse'); void item.offsetWidth; item.classList.add('pulse');
    if (innerWidth < 1100) lenis ? lenis.scrollTo(item, { offset: -NAV_H() - 24 }) : item.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  render();
})();

/* ───────── Initiatives legend: hover an impact to spotlight its cards ───────── */
$$('#legend .legend-item').forEach(item => {
  const grid = $('#init-grid');
  item.addEventListener('pointerenter', () => {
    grid.classList.add('filtering');
    $$('.init-card', grid).forEach(c => c.classList.toggle('match', c.dataset.c === item.dataset.c));
  });
  item.addEventListener('pointerleave', () => grid.classList.remove('filtering'));
});

/* ───────── Contact form (prototype only) ───────── */
$$('.pick').forEach(p => p.addEventListener('click', () => p.classList.toggle('on')));
$('#contact-form').addEventListener('submit', e => {
  e.preventDefault();
  $('#send-btn').innerHTML = 'Sent <span class="arr">✓</span>';
  $('#sent-note').textContent = 'Thanks! (Prototype — nothing was actually sent.)';
});

/* ───────── "Who we are" photo parallax: the taller image drifts slower than the page ───────── */
/* ───────── Mission: speckles in the sky only, plus a parallax drift (Figma "Mission" 152:3867) ───────── */
(function mission() {
  const section = $('.mission');
  if (!section) return;
  const scene = $('.mission-scene', section), photo = $('.mission-photo', section), canvas = $('.mission-speckles', section);
  const ctx = canvas.getContext('2d');
  // canvas covers the whole photo (taller screens show more sky above the stage); same dot recipe as the hero
  const W = 1470, TOP = -474, H = 862 - TOP;
  const PHOTO = { x: -154, y: -474, w: 1778, h: 1336 };
  const COLORS = ['#c6f221', '#dafe7a', '#00d37f', '#2fdbb2', '#8cebd7', '#c5b6f1', '#ddd2fa', '#ffffff'];
  const AREA = 735, TICK = 240, CHURN = 0.33;
  const SPECKLES_ON = false; // hidden for now (her call, 2026-11-03) — flip to true to bring the sky speckles back
  canvas.hidden = !SPECKLES_ON;

  // Sky test: is the photo bright orange at this spot? The dark land, the red ridge and the turbines aren't.
  let isSky = () => false;
  function readSky() {
    const k = 4, c = document.createElement('canvas');
    c.width = Math.round(PHOTO.w / k); c.height = Math.round(PHOTO.h / k);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(photo, 0, 0, c.width, c.height);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    isSky = (x, y) => {
      const u = Math.floor((x - PHOTO.x) / k), v = Math.floor((y - PHOTO.y) / k);
      if (u < 0 || v < 0 || u >= c.width || v >= c.height) return false;
      const i = (v * c.width + u) * 4;
      return px[i] > 170 && px[i + 1] > 70;
    };
  }
  // a dot somewhere in the sky (null if a few tries all land on the ground)
  function newDot() {
    for (let t = 0; t < 12; t++) {
      const d = 1 + Math.random() * 1.6, x = Math.random() * (W - d), y = TOP + Math.random() * (H - d);
      if (isSky(x + d / 2, y + d / 2)) return { x, y, d, a: 0.35 + Math.random() * 0.65, c: COLORS[Math.floor(Math.random() * COLORS.length)] };
    }
    return null;
  }
  let dots = [];
  function size() {
    const k = Math.min(devicePixelRatio || 1, 1.5) * Math.min(1, document.documentElement.clientWidth / 1470);
    canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
    ctx.setTransform(k, 0, 0, k, 0, -TOP * k);
  }
  function draw() {
    ctx.clearRect(0, TOP, W, H);
    for (const p of dots) { ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.d, p.d); }
    ctx.globalAlpha = 1;
  }
  function start() {
    readSky();
    dots = Array.from({ length: Math.round(W * H / AREA) }, newDot).filter(Boolean);
    size(); draw();
    addEventListener('resize', () => { size(); draw(); });
    if (reduceMotion) return;
    // shimmer like the hero: every beat about a third of the dots hop to a new spot in the sky (only while on screen)
    let visible = false;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(section);
    setInterval(() => {
      if (!visible) return;
      dots = dots.map(p => Math.random() < CHURN ? newDot() || p : p);
      draw();
    }, TICK);
  }
  if (SPECKLES_ON) { if (photo.complete && photo.naturalWidth) start(); else photo.addEventListener('load', start, { once: true }); }

  // Constellation over the turbines: the line draws in from the left as you scroll down to the section (tied to
  // scroll, like the hero's line) between dots that are already there; it boils
  // (re-drawn through slightly nudged points every 150ms) while on screen and you're not scrolling.
  (function line() {
    const svg = $('.mission-line svg', section), poly = $('.m-line', svg);
    // the Figma line's points, reversed so it draws from its left end (the svg is rotated 114.91°)
    const PTS = [[368.494, 876.694], [310.425, 699.816], [275.749, 698.541], [272.761, 576.956], [154.314, 452.841],
      [165.237, 356.877], [127.84, 280.676], [38.669, 128.933], [6.178, 5.675]];
    const dots = PTS.map(([x, y]) => {
      const d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      d.setAttribute('class', 'm-dot'); d.setAttribute('r', 6.06);
      svg.append(d);
      return d;
    });
    const cum = [0];
    for (let i = 1; i < PTS.length; i++) cum.push(cum[i - 1] + Math.hypot(PTS[i][0] - PTS[i - 1][0], PTS[i][1] - PTS[i - 1][1]));
    const len = cum[cum.length - 1];
    let drawn = -1, jitterLen = len;
    function boil() {
      const j = () => (Math.random() - 0.5) * 1.6; // ±0.8px, same as the hero
      const out = [];
      for (let i = 0; i < PTS.length; i++) {
        const [x, y] = PTS[i];
        out.push([x + j(), y + j()]);
        if (i === PTS.length - 1) break;
        const [x2, y2] = PTS[i + 1], l = Math.hypot(x2 - x, y2 - y), n = Math.max(1, Math.floor(l / 40));
        const nx = -(y2 - y) / l, ny = (x2 - x) / l;
        for (let k = 1; k < n; k++) { const f = k / n, o = j() * 0.9; out.push([x + (x2 - x) * f + nx * o, y + (y2 - y) * f + ny * o]); }
      }
      poly.setAttribute('points', out.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' '));
      jitterLen = poly.getTotalLength();
      poly.style.strokeDasharray = jitterLen;
      poly.style.strokeDashoffset = jitterLen * (1 - Math.max(0, drawn) / len);
      dots.forEach((d, i) => { d.setAttribute('cx', (PTS[i][0] + j() * 0.6).toFixed(1)); d.setAttribute('cy', (PTS[i][1] + j() * 0.6).toFixed(1)); });
    }
    // each tag belongs to its nearest dot. Dot positions in the scene, worked out from the Figma layout: the svg sits
    // 1px up-left inside a 372.775 × 879.926 box rotated 114.91° about its centre, centred at (784.58, 393.87)
    const tags = $$('.mission-tag', section);
    const A = 114.91 * Math.PI / 180, cos = Math.cos(A), sin = Math.sin(A);
    const dotXY = PTS.map(([x, y]) => { const vx = x - 1 - 186.39, vy = y - 1 - 439.96; return [784.58 + vx * cos - vy * sin, 393.87 + vx * sin + vy * cos]; });
    const tagDot = tags.map(t => {
      const tx = parseFloat(t.style.left) + 10, ty = parseFloat(t.style.top) + 6; // Figma tag centre (≈ 20 × 12px)
      let best = 0;
      dotXY.forEach(([x, y], i) => { if (Math.hypot(x - tx, y - ty) < Math.hypot(dotXY[best][0] - tx, dotXY[best][1] - ty)) best = i; });
      // each label sits 9px off its dot, on the side Figma put it
      const [dx, dy] = dotXY[best];
      t.style.left = dx + (tx >= dx ? 9 : -9) + 'px';
      t.style.top = dy + (ty >= dy ? 9 : -9) + 'px';
      t.classList.toggle('flip-x', tx < dx); t.classList.toggle('flip-y', ty < dy);
      return best;
    });
    // labels read out the dot's position on the page, like the cursor's coordinates (they tick as the scene drifts)
    const pad = n => String(Math.round(n)).padStart(4, '0');
    function label() {
      const r = scene.getBoundingClientRect(), k = r.width / 1470;
      tags.forEach((t, i) => {
        const [x, y] = dotXY[tagDot[i]], text = `X ${pad(r.left + scrollX + x * k)}\nY ${pad(r.top + scrollY + y * k)}`;
        if (t.textContent !== text) t.textContent = text;
      });
    }
    function draw(p) {
      const l = Math.max(0, Math.min(1, p)) * len;
      if (Math.abs(l - drawn) < 0.5) return;
      drawn = l;
      poly.style.strokeDashoffset = jitterLen * (1 - l / len);
    }
    boil();
    // progress: starts when the section's top is 40% of the way down the screen, done when it reaches the top
    const progress = () => { const r = section.getBoundingClientRect(); return (innerHeight * 0.4 - r.top) / (innerHeight * 0.4); };
    draw(reduceMotion ? 1 : progress());
    label();
    if (reduceMotion) { $('.mission-boil', section).pauseAnimations(); return; }
    let lastScroll = 0, visible = false;
    // labels update on the next frame, after the drift (below) has moved the scene for this scroll
    let labelQueued = false;
    const queueLabel = () => { if (!labelQueued) { labelQueued = true; requestAnimationFrame(() => { labelQueued = false; label(); }); } };
    // the tags' boil (an SVG animation) pauses while scrolling and whenever the section is off screen
    const tagBoil = $('.mission-boil', section);
    let still = null;
    addEventListener('scroll', () => {
      lastScroll = performance.now(); draw(progress()); queueLabel();
      if (!visible) return;
      section.classList.add('scrolling');
      clearTimeout(still);
      still = setTimeout(() => section.classList.remove('scrolling'), 180);
    }, { passive: true });
    addEventListener('resize', () => { draw(progress()); queueLabel(); });
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && e.intersectionRect.height > 0;
      if (visible) tagBoil.unpauseAnimations(); else tagBoil.pauseAnimations();
    }, { threshold: [0, 0.01] }).observe(section);
    setInterval(() => { if (visible && performance.now() - lastScroll > 180) boil(); }, 150);
  })();

  // Parallax: the scene drifts down a little as the section passes (the photo has room above, not below)
  if (reduceMotion) return;
  function drift() {
    const r = section.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const p = (innerHeight / 2 - (r.top + r.height / 2)) / (innerHeight / 2 + r.height / 2); // -1 → +1
    scene.style.transform = `translateY(${Math.max(0, Math.min(2, p + 1)) * 45}px)`;
  }
  addEventListener('scroll', drift, { passive: true });
  addEventListener('resize', drift);
  drift();
})();

/* ───────── Intro animation (experimental) ─────────
   1. dark screen, lime counter 0→100%
   2. the counter becomes "think" (same spot), then each word of the trail fades in lower down
   3. the page glides down after each word while the dark lifts to lilac, then the gradient
   4. camera lands on the photo, words turn white, scrolling unlocks */
const intro = (function () {
  const el = $('#intro'), stage = $('#intro-words-stage'), count = $('#intro-count'), stack = $('#intro-stack');

  // [word, right edge x, top y, font size, colour, asterisk?] — positions from the Figma "Hero" frame
  const TRAIL = [
    ['think', 800, 52, 40, '#2fdbb2'],
    ['*', 707, 75, 96, '#b3f00d', true],
    ['wonder', 705, 150, 32, '#ddd2fa'],
    ['*', 640, 182, 72.192, '#dafe7a', true],
    ['explore', 778, 208, 40, '#b3f00d'],
    ['discover', 848, 265, 32, '#2fdbb2'],
    ['investigate', 958, 304, 40, '#8cebd7'],
    ['*', 972, 360.83, 80, '#dafe7a', true],
    ['research', 905, 373, 40, '#2fdbb2'],
    ['ponder', 874, 433, 32, '#ddd2fa'],
    ['think', 764, 460, 40, '#b3f00d'],
    ['*', 758, 527.6, 96, '#2fdbb2', true],
    ['imagine', 707, 566, 40, '#8cebd7'],
    ['experiment', 853, 639, 40, '#ddd2fa'],
    ['science', 968, 664, 32, '#8cebd7'],
    ['explore', 926, 696, 40, '#dafe7a'],
    ['think', 1010, 745, 40, '#8cebd7'],
    ['*', 1064.76, 785, 80.64, '#b3f00d', true],
    ['research', 1120, 841, 40, '#ddd2fa'],
    ['investigate', 1049, 910, 32, '#dafe7a'],
  ];
  const words = TRAIL.map(([text, x, y, size, color, star]) => {
    const w = document.createElement('p');
    w.className = 'tw' + (star ? ' g' : '');
    w.innerHTML = `<span class="boil">${text}</span>`;
    Object.assign(w.style, { left: x + 'px', top: y + 'px', fontSize: size + 'px' });
    w.style.setProperty('--c', color);
    stage.appendChild(w);
    return { el: w, star, cy: y + size * 0.61 };
  });
  const FIRST = { x: 758, y: 76.5 }; // centre of the first "think"

  // Constellation line: revealed by camera progress (0 → 1), so it's drawn as the camera travels, not word by word.
  // Boil: every 150ms the line is re-drawn through slightly nudged points (hand-drawn wobble, no costly filter).
  // A pre-blurred copy sits on top and fades in toward the top of the screen (depth blur, like the photo).
  const cSvg = $('.intro-constellation', el), cLine = $('.c-line', cSvg);
  const cPts = cLine.dataset.points.trim().split(/\s+/).map(p => p.split(',').map(Number));
  // the first dot sits centred just under the opening "think" (measured, since the word's width depends on the font)
  const FIRST_DOT_GAP = 6;
  const firstDotSpot = () => { const w = words[0].el, [, right, top] = TRAIL[0]; return [right - w.offsetWidth / 2, top + w.offsetHeight + FIRST_DOT_GAP]; };
  cPts[0] = firstDotSpot();
  // crop both svgs to the line (+ room for the dots and blur) so the masks cover as little as possible
  const C_PAD = 24, xs = cPts.map(p => p[0]), ys = cPts.map(p => p[1]);
  const cBox = { x: Math.min(...xs) - C_PAD, y: Math.min(...ys) - C_PAD, w: Math.max(...xs) - Math.min(...xs) + C_PAD * 2, h: Math.max(...ys) - Math.min(...ys) + C_PAD * 2 };
  cSvg.setAttribute('viewBox', `${cBox.x} ${cBox.y} ${cBox.w} ${cBox.h}`);
  cSvg.setAttribute('width', cBox.w); cSvg.setAttribute('height', cBox.h);
  Object.assign(cSvg.style, { left: cBox.x + 'px', top: cBox.y + 'px' });
  stage.append(cSvg); // after the words, so the line draws on top of them
  const cSoft = cSvg.cloneNode(true);
  cSoft.classList.add('soft');
  $('defs', cSvg).remove();
  $('g', cSoft).setAttribute('filter', 'url(#c-soft)');
  cSvg.after(cSoft);
  const cSoftLine = $('.c-line', cSoft);
  const cDots = cPts.map(([x, y]) => [cSvg, cSoft].map(svg => {
    const d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    d.setAttribute('class', 'c-dot'); d.setAttribute('cx', x); d.setAttribute('cy', y); d.setAttribute('r', 5);
    $('g', svg).append(d);
    return d;
  }));
  const cCum = [0];
  let cLen = 0;
  function measureLine() {
    for (let i = 1; i < cPts.length; i++) cCum[i] = cCum[i - 1] + Math.hypot(cPts[i][0] - cPts[i - 1][0], cPts[i][1] - cPts[i - 1][1]);
    cLen = cCum[cCum.length - 1];
  }
  measureLine();
  let cDrawn = 0, cJitterLen = cLen, cSoftLen = cLen;
  // the blurred copy doesn't wobble (it can't be seen under the blur, and re-blurring it every tick is costly)
  function setSoftLine() {
    cSoftLine.setAttribute('points', cPts.map(p => p.join(',')).join(' '));
    cSoftLen = cSoftLine.getTotalLength();
    cSoftLine.style.strokeDasharray = cSoftLen;
    cSoftLine.style.strokeDashoffset = cSoftLen * (1 - cDrawn / cLen);
    cDots.forEach(([, d], i) => { d.setAttribute('cx', cPts[i][0]); d.setAttribute('cy', cPts[i][1]); });
  }
  // re-centre the first dot once the real font has loaded (the word may have changed width)
  document.fonts.ready.then(() => { const prog = cDrawn / cLen; cPts[0] = firstDotSpot(); measureLine(); setSoftLine(); boilLine(); drawLine(prog, true); });
  function boilLine() {
    const j = () => (Math.random() - 0.5) * 1.6; // ±0.8px
    const out = [];
    for (let i = 0; i < cPts.length; i++) {
      const [x, y] = cPts[i];
      out.push([x + j(), y + j()]);
      if (i === cPts.length - 1) break;
      // a few in-between points along each segment, each nudged sideways a touch
      const [x2, y2] = cPts[i + 1], len = Math.hypot(x2 - x, y2 - y), n = Math.max(1, Math.floor(len / 40));
      const nx = -(y2 - y) / len, ny = (x2 - x) / len;
      for (let k = 1; k < n; k++) { const f = k / n, o = j() * 0.9; out.push([x + (x2 - x) * f + nx * o, y + (y2 - y) * f + ny * o]); }
    }
    cLine.setAttribute('points', out.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' '));
    cJitterLen = cLine.getTotalLength();
    cLine.style.strokeDasharray = cJitterLen;
    cLine.style.strokeDashoffset = cJitterLen * (1 - cDrawn / cLen);
    cDots.forEach(([d], i) => { d.setAttribute('cx', (cPts[i][0] + j() * 0.6).toFixed(1)); d.setAttribute('cy', (cPts[i][1] + j() * 0.6).toFixed(1)); });
  }
  function drawLine(progress, force) {
    const len = Math.max(0, Math.min(1, progress)) * cLen;
    if (!force && Math.abs(len - cDrawn) < 0.5 && len !== 0 && len !== cLen) return;
    cDrawn = len;
    cLine.style.strokeDashoffset = cJitterLen * (1 - len / cLen);
    cSoftLine.style.strokeDashoffset = cSoftLen * (1 - len / cLen);
    cDots.forEach((pair, i) => pair.forEach(d => d.classList.toggle('on', len >= cCum[i] - 0.5 && (len > 0 || i === 0))));
  }
  setSoftLine();
  boilLine();
  drawLine(0);
  if (!reduceMotion) setInterval(() => { if (document.body.classList.contains('intro-visible') && !el.classList.contains('scrolling') && !el.classList.contains('no-line') && !perfOff('line')) boilLine(); }, 150);

  // Letter scramble, shared by the hero title and the opening "think". Letters are wrapped (inside word wrappers so
  // lines only break between words); the scramble glyph floats over each letter's real spot, so nothing jitters.
  const SCRAMBLE_PRESETS = {
    // in use: letters pop in at random, each flicking through a few faint characters
    light: { order: 'random', spread: 900, cursor: 0, cycle: 170, tick: 55, chars: 'abcdefghijklmnopqrstuvwxyz', glyphOpacity: 0.55 },
    // the opening "think": same feel, a touch slower since it's alone on screen
    // all letters scramble together at full strength, then lock in one by one (random order)
    think: { order: 'random', together: true, spread: 520, cursor: 0, cycle: 560, tick: 60, chars: 'abcdefghijklmnopqrstuvwxyz', glyphOpacity: 1 },
    // saved for later: left to right, block cursor ░▒▓█ then a longer scramble
    intense: { order: 'sequential', stagger: 45, cursor: 90, cycle: 320, tick: 50, chars: 'abcdefghijklmnopqrstuvwxyz#%&*?01', cursorChars: '░▒▓█', glyphOpacity: 1 },
  };
  function makeScrambler(root) {
    (function splitLetters(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 1) { splitLetters(child); continue; }
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(part); continue; }
          const word = document.createElement('span');
          word.className = 'tt-word';
          for (const ch of part) {
            const l = document.createElement('span');
            l.className = 'tt-ch';
            l.textContent = ch;
            word.append(l);
          }
          frag.append(word);
        }
        child.replaceWith(frag);
      }
    })(root);
    const letters = $$('.tt-ch', root).map(l => { const g = document.createElement('span'); g.className = 'tt-sc'; l.append(g); return { l, g }; });
    let token = 0;
    const hide = () => { token++; letters.forEach(({ l, g }) => { l.classList.remove('set'); g.textContent = ''; }); };
    const settle = () => { token++; letters.forEach(({ l, g }) => { l.classList.add('set'); g.textContent = ''; }); };
    const duration = P => (P.order === 'random' ? P.spread : (letters.length - 1) * P.stagger) + P.cursor + P.cycle; // same for `together`
    function play(P) {
      if (reduceMotion) return settle();
      const my = ++token;
      // scramble time only moves forward with frames that actually get drawn (≤ 34ms per frame), so if the browser is
      // busy (e.g. a fresh, uncached load) the scramble plays a little slower instead of finishing unseen
      let clock = 0, lastFrame = null;
      const rand = (i, step) => { const x = Math.sin(i * 127.1 + step * 311.7 + my * 17.3) * 43758.5453; return x - Math.floor(x); };
      // start times: evenly spread but shuffled (random order), or one after another
      const starts = letters.map((_, i) => P.order === 'random' ? (letters.length > 1 ? i / (letters.length - 1) : 0) * P.spread : i * P.stagger);
      if (P.order === 'random') for (let i = starts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [starts[i], starts[j]] = [starts[j], starts[i]]; }
      letters.forEach(({ g }) => { g.style.opacity = P.glyphOpacity; });
      requestAnimationFrame(function step(frameTime) {
        if (my !== token) return;
        clock += lastFrame === null ? 0 : Math.min(34, frameTime - lastFrame);
        lastFrame = frameTime;
        const now = clock, t0 = 0;
        let pending = false;
        letters.forEach(({ l, g }, i) => {
          if (l.classList.contains('set')) return;
          // together: every letter starts scrambling at once and keeps going until its own (shuffled) lock-in time
          const t = P.together ? now - t0 : now - t0 - starts[i];
          const cycleEnd = P.together ? P.cycle + starts[i] : P.cycle;
          if (t < 0) { pending = true; return; }
          if (t < P.cursor) {
            g.textContent = P.cursorChars[Math.min(3, Math.floor(t / P.cursor * 4))];
          } else if (t < P.cursor + cycleEnd) {
            const k = Math.floor((t - P.cursor) / P.tick);
            g.textContent = P.chars[Math.floor(rand(i, k) * P.chars.length)];
          } else {
            g.textContent = ''; l.classList.add('set'); return;
          }
          pending = true;
        });
        if (pending) requestAnimationFrame(step);
      });
    }
    return { letters, hide, settle, play, duration };
  }

  const title = $('.intro-title', el);
  const titleScr = makeScrambler(title);
  const titleWords = $$('.tt-word', title);
  const hideTitle = titleScr.hide, settleTitle = titleScr.settle, scrambleTitle = () => titleScr.play(SCRAMBLE_PRESETS.light);
  // the opening "think" scrambles in on the dark screen instead of fading in
  words[0].el.classList.add('no-in');
  const thinkScr = makeScrambler($('.boil', words[0].el));

  // Space above the trail. While the intro plays it's big enough for the first "think" to land exactly where the
  // counter sits (screen centre); afterwards it shrinks to a little breathing room above the hero.
  const TOP_ROOM = 100; // stage px of space kept above the trail after the intro
  let lead = 0, collapsed = false;
  function layout() {
    const s = scale();
    lead = Math.round(collapsed ? TOP_ROOM * s : Math.max(TOP_ROOM * s, innerHeight / 2 - FIRST.y * s)); // whole px keeps the sections below on whole pixels
    el.style.setProperty('--lead', lead + 'px');
    // continue the hero gradient's slope upward through the space above it (no flat band, no line where it starts)
    const up = lead / s, top = [159, 144, 203].map((v, k) => Math.round(Math.max(0, Math.min(255, v - [-19, 37, 6][k] / 748 * up))));
    el.style.setProperty('--lead-top', `rgb(${top.join(',')})`);
    count.style.left = stack.style.left = `calc(50% + ${(FIRST.x - 735) * s}px)`;
    if (speckReady) { sizeSpeckles(); drawSpeckles(true); }
  }

  // Flickering speckles: dots in the trail's colours over the gradient. Every ~quarter second about a third
  // of them hop to a new spot, so the field shimmers gently instead of reshuffling all at once.
  // Two canvases with the same density: one inside the hero (under the photo) and one over the space above it.
  const SPECKLE_COLORS = ['#c6f221', '#dafe7a', '#00d37f', '#2fdbb2', '#8cebd7', '#c5b6f1', '#ddd2fa', '#ffffff'];
  const SPECKLE_AREA = 735, SPECKLE_TICK = 240, SPECKLE_CHURN = 0.33; // one dot per 735 stage-px²
  // Depth blur (drawn per element, so nothing has to re-blur the whole background):
  // 0 below 30% of the screen, growing to ~6px at the top edge. Off once the nav bar has slid in.
  const DEPTH_ZONE = 0.30, DEPTH_MAX = 6;
  const depthAt = screenY => { const b = Math.max(0, Math.min(1.2, (DEPTH_ZONE - screenY / innerHeight) / DEPTH_ZONE)); return b * b * DEPTH_MAX; };

  // Soft dot sprites (one per colour) used for speckles in the blurred zone
  const sprites = Object.fromEntries(SPECKLE_COLORS.map(c => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const g = cv.getContext('2d'), grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, c); grad.addColorStop(1, c + '00');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    return [c, cv];
  }));

  function speckleField(canvas, stageW, stageH) {
    const ctx = canvas.getContext('2d');
    let w = stageW(), h = stageH(), dots = [];
    const newDot = () => ({ x: Math.random() * w, y: Math.random() * h, d: 1 + Math.random() * 1.6,
      a: 0.35 + Math.random() * 0.65, c: SPECKLE_COLORS[Math.floor(Math.random() * SPECKLE_COLORS.length)] });
    return {
      size() {
        w = stageW(); h = stageH();
        const k = Math.min(devicePixelRatio || 1, 1.5) * scale(); // drawn in stage px; ≤1.5× resolution is plenty for tiny dots
        canvas.width = Math.max(1, Math.round(w * k));
        canvas.height = Math.max(1, Math.round(h * k));
        ctx.setTransform(k, 0, 0, k, 0, 0);
        const n = Math.round(w * h / SPECKLE_AREA);
        dots = Array.from({ length: n }, newDot);
      },
      churn() { for (let i = 0; i < dots.length; i++) if (Math.random() < SPECKLE_CHURN) dots[i] = newDot(); },
      // depth: whether to soften dots near the top of the screen. Without `force`, it skips the redraw unless the
      // blur zone has moved over this canvas by a few px (most scroll frames change nothing visible here).
      // On scroll it only redraws the band that's in (or just left) the blur zone; the rest of the canvas stays as is.
      blurred: false, lastTop: null, band: null,
      draw(depth, force) {
        const s = scale(), r = canvas.getBoundingClientRect(), top = r.top, zone = innerHeight * DEPTH_ZONE;
        const inZone = depth && top < zone && r.bottom > 0; // entirely off the top of the screen → nothing to update
        if (!force && !inZone && !this.blurred) return;
        if (!force && inZone && this.lastTop !== null && Math.abs(top - this.lastTop) < 4) return;
        // band in stage px: from the screen's top edge to the bottom of the zone, plus wherever it was last time
        // (dots leaving the zone turn sharp again), padded by the largest soft dot
        const now = [-top / s, (zone - top) / s], pad = 3 + DEPTH_MAX * 1.44 / s;
        let y0 = 0, y1 = h;
        if (!force) { // when nothing is blurred yet the canvas is all sharp, so only the new band needs drawing
          const was = this.blurred && this.band ? this.band : now;
          y0 = Math.max(0, Math.min(now[0], was[0]) - pad); y1 = Math.min(h, Math.max(now[1], was[1]) + pad);
        }
        this.lastTop = top;
        this.blurred = inZone;
        this.band = inZone ? now : null;
        if (y1 <= y0) return;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, y0, w, y1 - y0); ctx.clip();
        ctx.clearRect(0, y0, w, y1 - y0);
        for (const dot of dots) {
          if (dot.y + dot.d + pad < y0 || dot.y - pad > y1) continue;
          const blur = depth ? depthAt(top + dot.y * s) / s : 0; // in stage px
          if (blur < 0.3) {
            ctx.globalAlpha = dot.a; ctx.fillStyle = dot.c; ctx.fillRect(dot.x, dot.y, dot.d, dot.d);
          } else {
            // a soft, larger, fainter dot keeps roughly the same amount of colour as the sharp one
            const r = dot.d / 2 + blur;
            ctx.globalAlpha = Math.min(dot.a, dot.a * (dot.d * dot.d) / (r * r) * 2.2);
            ctx.drawImage(sprites[dot.c], dot.x + dot.d / 2 - r, dot.y + dot.d / 2 - r, r * 2, r * 2);
          }
        }
        ctx.restore();
      },
    };
  }
  const heroSpeckles = speckleField($('.intro-speckles', el), () => 1470, () => 1300);
  const leadSpeckles = speckleField($('.intro-speckles-lead', el), () => innerWidth / scale(), () => lead / scale());
  let speckReady = true, depthOn = true;
  function sizeSpeckles() { heroSpeckles.size(); leadSpeckles.size(); }
  function drawSpeckles(force) { if (perfOff('speckles')) return; heroSpeckles.draw(depthOn, force); leadSpeckles.draw(depthOn, force); }
  function churnSpeckles() { heroSpeckles.churn(); leadSpeckles.churn(); drawSpeckles(true); }
  const softPhoto = $('.intro-photo-soft', el);
  // Bake the softened photo once (canvas blur) so the browser doesn't re-blur it every frame
  // resolves once the photo is decoded and its soft copy baked (the intro waits for this)
  const photoReady = (async function bakeSoftPhoto() {
    const src = $('img.intro-photo', el), ctx = softPhoto.getContext('2d');
    if (!(src.complete && src.naturalWidth)) await new Promise(r => src.addEventListener('load', r, { once: true }));
    try { await src.decode(); } catch {}
    const canBlur = typeof ctx.filter === 'string';
    if (canBlur) ctx.filter = 'blur(6px)'; else softPhoto.classList.add('css-blur');
    ctx.drawImage(src, 0, 0, softPhoto.width, softPhoto.height);
  })();
  let lastMask = '', lastCMask = '', titleBlurred = false;
  function blurWords() {
    const s = scale(), zone = innerHeight * DEPTH_ZONE;
    // read every position first (reading between writes would force the page to re-layout each time)
    const shown = words.filter(w => w.el.classList.contains('on'));
    const wordRects = shown.map(w => w.el.getBoundingClientRect());
    const titleRect = title.getBoundingClientRect();
    const doTitle = depthOn && titleRect.top < zone || titleBlurred;
    const titleRects = doTitle ? titleWords.map(w => w.getBoundingClientRect()) : null;
    const pr = softPhoto.getBoundingClientRect(), cr = cSvg.getBoundingClientRect();
    // then write, only where the (quarter-pixel-rounded) blur actually changed
    // a GPU filter on an element with its own layer (will-change in style.css): changing the amount while scrolling
    // needs no redrawing, so it can't hold up the scroll (a redrawn text-shadow blur stuttered with smooth scroll on)
    const setBlur = (node, px) => {
      const v = px > 0.3 && !perfOff('textBlur') ? Math.round(px * 2) / 2 : 0; // half-pixel steps
      if (node._blur === v) return;
      node._blur = v;
      node.style.filter = v ? `blur(${v}px)` : '';
    };
    shown.forEach((w, i) => {
      const r = wordRects[i], px = depthOn && r.bottom > -40 ? depthAt(r.top + r.height / 2) / s : 0; // fully off the top → no blur (it's re-applied before it comes back)
      setBlur(w.el, px);
      w.el.classList.toggle('blurry', px > 0.6); // the boil wobble pauses where it can't be seen anyway
    });
    // title: blurred a whole word at a time (4 layers rather than ~30 letters)
    if (doTitle) {
      titleBlurred = false;
      titleWords.forEach((w, i) => {
        const r = titleRects[i], px = depthOn && r.top < zone && r.bottom > -40 ? depthAt(r.top + r.height / 2) / s : 0;
        if (px > 0.2) titleBlurred = true;
        setBlur(w, px);
      });
    }
    // photo: the softened copy fades in toward the top of the screen (mask in the photo's own px, 4px steps)
    // only bother once the visible part of the photo (people + grass start ~210px into the image) reaches the
    // blur zone; above that it's transparent sky, so re-masking it every frame would be wasted work
    const PHOTO_CONTENT_TOP = 210;
    const step = v => Math.round(v / 12) * 12; // masks move in 12px steps (the soft gradient hides it)
    let mask = 'linear-gradient(transparent, transparent)';
    if (depthOn && pr.top + PHOTO_CONTENT_TOP * s < zone) {
      mask = `linear-gradient(to bottom, #000 ${step(-pr.top / s)}px, transparent ${step((zone - pr.top) / s)}px)`;
    }
    if (mask !== lastMask) { lastMask = mask; softPhoto.style.setProperty('--soft-mask', mask); }
    // constellation line: crossfade sharp → pre-blurred copy toward the top of the screen. The middle stop follows
    // the words' blur curve (a quarter of full blur halfway up the zone). Only while part of the line is in the zone.
    let cMask = 'none';
    if (depthOn && !el.classList.contains('no-line') && cr.top < zone && cr.bottom > 0) {
      const a = step(-cr.top / s), b = step((zone - cr.top) / s), m = (a + b) / 2;
      cMask = `${a}px|${m}px|${b}px`;
    }
    if (cMask !== lastCMask) {
      lastCMask = cMask;
      const on = cMask !== 'none', [a, m, b] = cMask.split('|');
      cSvg.style.setProperty('--c-mask', on ? `linear-gradient(to bottom, transparent ${a}, rgba(0,0,0,.75) ${m}, #000 ${b})` : 'none');
      cSoft.style.setProperty('--c-mask', on ? `linear-gradient(to bottom, #000 ${a}, rgba(0,0,0,.25) ${m}, transparent ${b})` : 'none');
      cSoft.classList.toggle('on', on);
    }
  }
  addEventListener('resize', layout);
  layout();

  let lastSpeck = 0, lastScroll = -1, scrollStill = null;
  const photo = $('img.intro-photo', el), PHOTO_PARALLAX = -0.07; // negative = moves faster than the page
  requestAnimationFrame(function fx(now) {
    requestAnimationFrame(fx);
    if (!document.body.classList.contains('intro-on')) return;
    const visible = document.body.classList.contains('intro-visible');
    const wantDepth = visible || playing; // blur off once the hero has scrolled away
    if (wantDepth !== depthOn) { depthOn = wantDepth; blurWords(); drawSpeckles(); }
    if (!visible) return;
    const moved = scrollY !== lastScroll;
    lastScroll = scrollY;
    const userScrolling = el.classList.contains('scrolling');
    if (!reduceMotion && !userScrolling && now - lastSpeck > SPECKLE_TICK) { lastSpeck = now; churnSpeckles(); } // pauses while you scroll; blur zone re-applied each beat
    // pause the word/line wobble while you scroll (the motion hides it anyway); it resumes as soon as you stop
    if (moved && !playing) {
      el.classList.add('scrolling');
      clearTimeout(scrollStill);
      scrollStill = setTimeout(() => el.classList.remove('scrolling'), 180);
    }
    if (moved || playing) { blurWords(); drawSpeckles(); } // speckles: only the strip in the blur zone, and only every few px
    // Photo parallax: lines up with Figma when the camera lands; moves a little faster than the page around that
    if (!reduceMotion && !perfOff('parallax')) photo.style.transform = softPhoto.style.transform = `translateY(${(scrollY - endY()) * PHOTO_PARALLAX / scale()}px)`;
  });

  // exact bottom of the hero (sub-pixel), rounded down so the next section never peeks in at the bottom
  const endY = () => Math.max(0, Math.floor(el.getBoundingClientRect().bottom + scrollY - innerHeight));
  const cameraFor = cy => Math.max(0, Math.min(endY(), el.offsetTop + lead + cy * scale() - innerHeight / 2));
  const jumpTo = y => lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y);

  // Word pacing: first gap → last gap (ms)
  const GAP_SLOW = 400, GAP_FAST = 35;
  // y on a CSS-style cubic-bezier(x1, y1, x2, y2) at progress x (solved by bisection)
  function bezierY(x, x1, y1, x2, y2) {
    const at = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; at(t, x1, x2) < x ? lo = t : hi = t; }
    return at(t, y1, y2);
  }

  // Steady beat: every item's start time comes from the same ease-out curve, measured from one clock
  const SCHEDULE = [0];
  for (let i = 1; i < words.length; i++) {
    const p = bezierY(i / (words.length - 1), 0, 0, 0.25, 1); // strong ease-out: picks up speed early
    SCHEDULE.push(SCHEDULE[i - 1] + GAP_SLOW - (GAP_SLOW - GAP_FAST) * p);
  }

  // Camera: one continuous move from the top to the photo, on its own clock.
  // Its ease-in-out curve is fitted each play so it tracks where the words appear,
  // without ever snapping to a word.
  const LANDING = 1700; // ms the camera keeps travelling after the last word, easing onto the photo
  let playing = false, token = 0, cam = null, countMode = 'off';
  const LILAC_SWEEP = 1800; // ms for the dark → lilac gradient to rise
  const DARK_HOLD = 450;    // ms of plain dark screen before "think" starts unscrambling
  const pageReady = Promise.all([
    document.readyState === 'complete' ? null : new Promise(r => addEventListener('load', r, { once: true })),
    document.fonts ? document.fonts.ready : null,
  ]);

  function fitCamera() {
    const T = SCHEDULE[SCHEDULE.length - 1] + LANDING, end = endY();
    const keys = words.map((w, i) => [SCHEDULE[i] / T, cameraFor(w.cy)]);
    let best = { x1: 0.5, x2: 0.5, err: Infinity };
    for (let x1 = 0.05; x1 < 1; x1 += 0.05) {
      for (let x2 = 0.05; x2 <= 0.45; x2 += 0.05) { // x2 ≤ .45 keeps the ease-out long, so it glides to a stop
        let err = 0;
        for (const [u, y] of keys) err += (end * bezierY(u, x1, 0, x2, 1) - y) ** 2;
        if (err < best.err) best = { x1, x2, err };
      }
    }
    return { T, end, x1: best.x1, x2: best.x2 };
  }

  requestAnimationFrame(function camLoop(now) {
    requestAnimationFrame(camLoop);
    if (!playing || !cam) return;
    const u = Math.min(1, (now - cam.start) / cam.T);
    const travel = bezierY(u, cam.x1, 0, cam.x2, 1);
    scrollTo(0, cam.end * travel);
    drawLine(travel);
  });

  function lock(on) {
    document.documentElement.classList.toggle('intro-lock', on);
    if (on) lenis?.stop(); else lenis?.start();
  }
  function collapseLead() {
    const before = lead, atEnd = Math.abs(scrollY - endY()) < 3;
    collapsed = true;
    layout();
    const removed = before - lead;
    if (removed > 0 && scrollY > 0) jumpTo(atEnd ? endY() : Math.max(0, Math.round(scrollY - removed))); // keep the same view, no jump
  }
  function showAll() {
    words.forEach(w => w.el.classList.add('on'));
    count.classList.add('gone');
    stack.classList.add('gone');
    el.classList.add('revealed', 'lilac', 'whiten');
    settleTitle();
    thinkScr.settle();
    drawLine(1);
    collapseLead();
  }
  function finish() {
    playing = false;
    lock(false);
    el.classList.remove('playing');
    el.classList.add('done');
    collapseLead();
    requestAnimationFrame(() => { if (Math.abs(scrollY - endY()) < 40) jumpTo(endY()); }); // settle exactly on the hero's bottom edge
  }

  async function play() {
    const my = ++token, alive = () => my === token;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    el.classList.remove('revealed', 'lilac', 'whiten', 'done');
    hideTitle();
    thinkScr.hide();
    drawLine(0);
    words.forEach(w => { w.el.classList.remove('on'); w.el.style.filter = ''; w.el._blur = 0; });
    count.classList.remove('gone');
    count.textContent = '0%';
    stack.replaceChildren();
    stack.classList.remove('gone');
    count.style.visibility = countMode === 'swap' ? '' : 'hidden';
    collapsed = false;
    layout();
    jumpTo(0);
    cam = null;
    lock(true);
    playing = true;
    el.classList.add('playing');
    // let the page finish loading (photo, fonts) so the opening isn't missed, then hold on the dark screen a moment
    await Promise.race([Promise.all([pageReady, photoReady]), wait(8000)]); if (!alive()) return;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // two drawn frames on the dark screen first
    layout();
    jumpTo(0); // re-anchor at the top right before the opening (in case anything scrolled the page while loading)
    await wait(DARK_HOLD); if (!alive()) return;

    // 1. counter 0 → 100%; its colour blends white → lime → green along the way
    const STOPS = [[255, 255, 255], [0xc6, 0xf2, 0x21], [0x00, 0xd3, 0x7f]];
    const counterColor = p => {
      const f = p * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(f)), t = f - i;
      const c = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * t));
      return `rgb(${c.join(',')})`;
    };
    const ease = p => p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    const HOLD_ZERO = 700; // 0% lingers this long before the count gets going
    let t0 = performance.now();
    const DUR = countMode === 'stack' ? 1800 : 1500;
    if (countMode === 'off') {
      // no percentages: go straight to the montage
    } else if (countMode === 'swap') {
      // "swap": one number counting up in place
      count.style.color = counterColor(0);
      count.textContent = '0%';
      await wait(HOLD_ZERO); if (!alive()) return;
      t0 = performance.now();
      await new Promise(done => requestAnimationFrame(function step(now) {
        if (!alive()) return done();
        const p = Math.min(1, (now - t0) / DUR), e = ease(p);
        count.textContent = Math.round(e * 100) + '%';
        count.style.color = counterColor(e);
        p < 1 ? requestAnimationFrame(step) : done();
      }));
    } else {
      // "stack": ~13 uneven jumps; each new number arrives in the centre and pushes the earlier ones up
      const N = 13, weights = Array.from({ length: N - 1 }, () => 0.4 + Math.random());
      const total = weights.reduce((a, b) => a + b, 0);
      const values = [0];
      weights.forEach(w => values.push(Math.min(100, values[values.length - 1] + w / total * 100)));
      const ints = values.map((v, i) => i === N - 1 ? 100 : Math.round(v)).filter((v, i, arr) => i === 0 || v > arr[i - 1]);
      const entries = [];
      for (let i = 0; i < ints.length; i++) {
        await wait(t0 + (i ? HOLD_ZERO : 0) + DUR * ease(i / (ints.length - 1)) - performance.now()); if (!alive()) return;
        const p = document.createElement('p');
        p.textContent = ints[i] + '%';
        p.style.color = counterColor(ints[i] / 100);
        stack.append(p);
        entries.push(p);
        p.getBoundingClientRect(); // start the new number just below centre, then slide everything up
        entries.forEach((e, j) => {
          const k = entries.length - 1 - j;
          e.style.setProperty('--k', k);
          e.style.setProperty('--o', [1, 0.5, 0.28, 0.15, 0.07][k] ?? 0);
          e.style.setProperty('--bl', (k * 0.8) + 'px');
        });
        while (entries.length > 7) entries.shift().remove();
      }
    }
    if (countMode !== 'off') { await wait(200); if (!alive()) return; }

    // 2–3. counter turns into "think", then the trail meanders down on a steady, quickening beat,
    //       while the camera glides down on its own accelerating curve
    count.classList.add('gone');
    stack.classList.add('gone');
    // "think" unscrambles alone on the dark screen…
    words[0].el.style.setProperty('--tt-color', 'rgb(255,255,255)'); // starts white
    words[0].el.classList.add('on');
    thinkScr.play(SCRAMBLE_PRESETS.think);
    // its colour travels white → neon lime → its own green as it unscrambles (frame-driven, like the scramble)
    (function tintThink() {
      const STOPS = [[255, 255, 255], [0xc6, 0xf2, 0x21], [0x2f, 0xdb, 0xb2]];
      const D = thinkScr.duration(SCRAMBLE_PRESETS.think), w = words[0].el;
      let clock = 0, last = null;
      requestAnimationFrame(function step(ft) {
        if (!alive()) return w.style.removeProperty('--tt-color');
        clock += last === null ? 0 : Math.min(34, ft - last); last = ft;
        const p = Math.min(1, clock / D), f = p * 2, i = Math.min(1, Math.floor(f)), t = f - i;
        const c = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * t));
        w.style.setProperty('--tt-color', `rgb(${c.join(',')})`);
        if (p < 1) requestAnimationFrame(step); else w.style.removeProperty('--tt-color');
      });
    })();
    await wait(thinkScr.duration(SCRAMBLE_PRESETS.think) + 300); if (!alive()) return;
    // …then the dark gives way to lilac as a rising gradient, and the trail + camera get going
    el.classList.add('lilac');
    setTimeout(() => alive() && el.classList.add('revealed'), LILAC_SWEEP);
    const start = performance.now();
    cam = { ...fitCamera(), start };
    for (let i = 1; i < words.length; i++) {
      await wait(start + SCHEDULE[i] - performance.now()); if (!alive()) return;
      words[i].el.classList.add('on');
    }

    // the title types itself in as the camera lands
    setTimeout(() => alive() && scrambleTitle(), 250);

    // 4. camera finishes easing onto the photo, then scrolling is handed back
    await wait(start + cam.T - performance.now() + 150); if (!alive()) return;
    finish();
  }

  function skip() {
    if (!playing) return;
    token++;
    showAll();
    finish();
    jumpTo(endY());
  }
  // Dev control: percentage style — "stack" (numbers push up) or "swap" (one number in place)
  const countBtn = $('#intro-count-toggle');
  const COUNT_MODES = ['off', 'stack', 'swap']; // off = no percentages, the intro opens straight on "think"
  const setCountMode = mode => {
    countMode = mode;
    countBtn.textContent = '% Style: ' + mode;
    try { localStorage.setItem('spr-intro-count-v2', mode); } catch {}
  };
  try { const saved = localStorage.getItem('spr-intro-count-v2'); countMode = COUNT_MODES.includes(saved) ? saved : 'off'; } catch {}
  setCountMode(countMode);
  countBtn.addEventListener('click', () => setCountMode(COUNT_MODES[(COUNT_MODES.indexOf(countMode) + 1) % COUNT_MODES.length]));

  // Dev control: show/hide the constellation line (remembered in this browser)
  const lineBtn = $('#intro-line-toggle');
  const setLine = on => {
    el.classList.toggle('no-line', !on);
    lineBtn.textContent = on ? '◇ Line: on' : '◇ Line: off';
    try { localStorage.setItem('spr-intro-line', on ? '1' : '0'); } catch {}
  };
  let lineOn = true;
  try { lineOn = localStorage.getItem('spr-intro-line') !== '0'; } catch {}
  setLine(lineOn);
  lineBtn.addEventListener('click', () => { lineOn = !lineOn; setLine(lineOn); });

  // On the homepage the floating nav starts at the top of the section after the hero (style.css pushes it down
  // by the hero's height), so it keeps the hero's height up to date
  new ResizeObserver(() => document.documentElement.style.setProperty('--intro-h', el.offsetHeight + 'px')).observe(el);
  // intro-visible: the hero is on screen (its depth blur and wobble only run then)
  // (the word wobble is an SVG animation; it's paused while the hero is off screen so it isn't re-rendered for nothing)
  const boilSvg = $('#boil', el).ownerSVGElement;
  new IntersectionObserver(([e]) => {
    // (merely touching the screen edge counts as "intersecting"; that kept the hero effects running out of sight)
    const on = e.isIntersecting && e.intersectionRect.height > 0;
    document.body.classList.toggle('intro-visible', on);
    if (on) boilSvg.unpauseAnimations(); else boilSvg.pauseAnimations();
  }, { threshold: [0, 0.01] }).observe(el);
  introHook = page => {
    document.body.classList.toggle('intro-on', page === 'home');
    if (page !== 'home') skip();
  };

  return { play, showAll };
})();

/* ───────── Click anywhere to place a star sticker ─────────
   Random sticker, size and angle; its colour follows the star colour panel (press S). Clicks on links, buttons, form
   fields, the draggable stickers, open panels and dev UI do their normal thing instead. Placed stars can be dragged
   around; they stay on the page you placed them on (until you change page). */
(function clickStars() {
  const STICKERS = ['sticker62.png', 'sticker63.png']; // not sticker60: its halftone dots are chunkier than the other two
  const SKIP = 'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable], .cw-deco, .star, .modal, .pg, .perf-panel, [data-dev-ui], #doubletake';
  const SITE_COLORS = [['#00d37f', 'Green'], ['#c6f221', 'Lime'], ['#c5b6f1', 'Lavender'], ['#014751', 'Teal'], ['#1a1a32', 'Navy'], ['#fdfbef', 'Cream']];

  // Colour settings (remembered in this browser). mode: 'original' = the PNGs as they are, 'any' = a random hue,
  // 'palette' = tinted with a random pick from the colours switched on.
  const DEFAULTS = { mode: 'palette', on: ['none', '#00d37f', '#c6f221', '#c5b6f1'], custom: [] }; // her pick, 2026-11-03
  let cfg = DEFAULTS;
  try { cfg = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('spr-star-colors') || '{}') }; } catch {}
  const save = () => { try { localStorage.setItem('spr-star-colors', JSON.stringify(cfg)); } catch {} };
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // A star: the PNG, plus (palette mode) a colour layer cut to its shape. The PNG is turned grey and multiplied by the
  // colour, so the halftone dots and shading stay but everything reads in that colour.
  function makeStar(size) {
    const star = document.createElement('span');
    star.className = 'star';
    const src = 'assets/' + pick(STICKERS);
    star.innerHTML = `<img src="${src}" alt="" draggable="false">`;
    const color = cfg.mode === 'palette' && cfg.on.length ? pick(cfg.on) : null; // 'none' = the PNG's own colours
    if (color && color !== 'none') {
      star.classList.add('tinted');
      const tint = document.createElement('i');
      tint.style.setProperty('--m', `url("${src}")`);
      tint.style.background = color;
      star.append(tint);
    } else if (cfg.mode === 'any') $('img', star).style.filter = `hue-rotate(${Math.round(Math.random() * 360)}deg)`;
    Object.assign(star.style, { width: size + 'px', height: size + 'px' });
    star.style.setProperty('--r', Math.round(Math.random() * 360 - 180) + 'deg');
    return star;
  }

  const layer = document.createElement('div');
  layer.className = 'star-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  let down = null;
  addEventListener('pointerdown', e => { down = e.button === 0 ? [e.clientX, e.clientY] : null; });
  addEventListener('click', e => {
    if (e.button !== 0 || e.defaultPrevented || e.target.closest?.(SKIP)) return;
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; // a drag or text selection, not a click
    if (String(getSelection()).length) return;
    const size = 32 + Math.random() * 58; // 32–90px
    const star = makeStar(size);
    Object.assign(star.style, { left: e.pageX - size / 2 + 'px', top: e.pageY - size / 2 + 'px' });
    layer.append(star);
  });
  addEventListener('hashchange', () => layer.replaceChildren());

  // Drag placed stars around (the one you grab comes to the front; clicking a star never spawns another)
  let drag = null, topZ = 1;
  layer.addEventListener('pointerdown', e => {
    const star = e.target.closest('.star');
    if (!star || e.button !== 0) return;
    e.preventDefault();
    star.setPointerCapture(e.pointerId);
    star.style.zIndex = ++topZ;
    star.classList.add('dragging');
    drag = { star, x: e.pageX, y: e.pageY, left: parseFloat(star.style.left), top: parseFloat(star.style.top) };
  });
  layer.addEventListener('pointermove', e => {
    if (!drag) return;
    drag.star.style.left = drag.left + e.pageX - drag.x + 'px';
    drag.star.style.top = drag.top + e.pageY - drag.y + 'px';
  });
  const drop = () => { if (drag) { drag.star.classList.remove('dragging'); drag = null; } };
  layer.addEventListener('pointerup', drop);
  layer.addEventListener('pointercancel', drop);

  // Star colour panel (press S)
  const panel = document.createElement('aside');
  panel.className = 'pg star-pg';
  panel.setAttribute('data-dev-ui', '');
  panel.setAttribute('data-lenis-prevent', '');
  panel.setAttribute('aria-label', 'Star colours');
  panel.innerHTML = `
    <div class="pg-head"><p class="mono semi c-lime">Star colours</p><button class="mono-s pg-x" data-act="close">Close ✕</button></div>
    <div class="pg-row"><p class="mono-s c-muted">Colours come from</p>
      <div class="pg-chips" data-mode-chips>
        <button data-mode="original">Original PNGs</button><button data-mode="any">Any colour</button><button data-mode="palette">My palette</button>
      </div>
    </div>
    <div class="pg-row" data-palette-row><p class="mono-s c-muted">Palette · click to switch a colour on/off</p>
      <div class="pg-swatches" data-swatches></div>
      <p class="mono-s c-muted star-pg-note">Add your own with the rainbow square. Custom colours can be removed with ✕.</p>
    </div>
    <div class="pg-row"><p class="mono-s c-muted">Preview</p><div class="star-pg-preview" data-preview></div></div>
    <div class="pg-foot"><button class="mono-s pg-x" data-act="clear">Clear stars on this page</button><button class="mono-s pg-x" data-act="copy">Copy settings</button></div>`;
  document.body.append(panel);

  function render() {
    $$('[data-mode]', panel).forEach(b => b.classList.toggle('on', b.dataset.mode === cfg.mode));
    $('[data-palette-row]', panel).classList.toggle('dim', cfg.mode !== 'palette');
    const sw = $('[data-swatches]', panel);
    sw.innerHTML = [['none', 'No colour (the original PNG)'], ...SITE_COLORS, ...cfg.custom.map(c => [c, 'Custom ' + c])].map(([c, name]) =>
      `<span class="star-sw"><button data-c="${c}" style="--sw:${c}" title="${name}" class="${c === 'none' ? 'star-sw-none ' : ''}${cfg.on.includes(c) ? 'on' : ''}"></button>${cfg.custom.includes(c) ? `<button class="star-sw-x" data-remove="${c}" title="Remove">✕</button>` : ''}</span>`
    ).join('') + '<label class="pg-custom" title="Add a colour"><input type="color" value="#ff6b4a" data-add></label>';
    const prev = $('[data-preview]', panel);
    prev.replaceChildren(...Array.from({ length: 7 }, () => makeStar(36)));
  }
  panel.addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.mode) { cfg = { ...cfg, mode: t.dataset.mode }; }
    else if (t.dataset.c) { cfg = { ...cfg, mode: 'palette', on: cfg.on.includes(t.dataset.c) ? cfg.on.filter(c => c !== t.dataset.c) : [...cfg.on, t.dataset.c] }; }
    else if (t.dataset.remove) { const c = t.dataset.remove; cfg = { ...cfg, custom: cfg.custom.filter(x => x !== c), on: cfg.on.filter(x => x !== c) }; }
    else if (t.dataset.act === 'close') return panel.classList.remove('open');
    else if (t.dataset.act === 'clear') return layer.replaceChildren();
    else if (t.dataset.act === 'copy') {
      const names = Object.fromEntries(SITE_COLORS);
      names.none = 'no colour (original PNG)';
      navigator.clipboard?.writeText(`Star colours: ${cfg.mode === 'palette' ? 'palette of ' + cfg.on.map(c => c === 'none' ? names.none : names[c] ? `${names[c]} ${c}` : c).join(', ') : cfg.mode === 'any' ? 'any colour (random hue)' : 'original PNG colours'}`);
      t.textContent = 'Copied ✓'; setTimeout(() => { t.textContent = 'Copy settings'; }, 1200);
      return;
    }
    else if (t.closest('[data-preview]')) { /* click the preview to re-roll */ }
    else return;
    save(); render();
  });
  panel.addEventListener('change', e => {
    if (!e.target.matches('[data-add]')) return;
    const c = e.target.value.toLowerCase();
    if (!SITE_COLORS.some(([x]) => x === c) && !cfg.custom.includes(c)) cfg = { ...cfg, custom: [...cfg.custom, c] };
    cfg = { ...cfg, mode: 'palette', on: cfg.on.includes(c) ? cfg.on : [...cfg.on, c] };
    save(); render();
  });
  addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 's' || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea')) return;
    if (panel.classList.toggle('open')) render();
  });
})();

/* ───────── Lag test panel (press P) ─────────
   Switch effects off one at a time while scrolling past a laggy spot; the meter counts frames that came late. */
(function perfPanel() {
  const SWITCHES = [
    ['smooth', 'Smooth scroll', 'reloads the page'],
    ['cursor', 'Custom cursor'],
    ['speckles', 'Hero speckles'],
    ['photo', 'Hero photo'],
    ['photoBlur', 'Photo’s top blur'],
    ['parallax', 'Photo parallax'],
    ['textBlur', 'Word + title blur'],
    ['wobble', 'Word wobble'],
    ['line', 'Constellation line'],
    ['lineBlur', 'Line’s top blur'],
    ['navFrost', 'Nav frosted glass'],
    ['crossword', 'Crossword section'],
  ];
  const panel = document.createElement('div');
  panel.className = 'perf-panel';
  panel.setAttribute('data-dev-ui', '');
  panel.innerHTML = `<div class="perf-head mono-s"><span>Lag test · P to close</span><button class="perf-reset mono-s">All on</button></div>
    <div class="perf-meter mono-s">Scroll to measure…</div>
    <div class="perf-list">${SWITCHES.map(([k, label, note]) => `<label class="mono-s"><input type="checkbox" data-k="${k}" ${perfOff(k) ? '' : 'checked'}> ${label}${note ? ` <i>(${note})</i>` : ''}</label>`).join('')}</div>`;
  document.body.append(panel);
  const save = () => { try { localStorage.setItem('spr-perf-off', JSON.stringify([...PERF_OFF])); } catch {} };
  function set(k, on) {
    on ? PERF_OFF.delete(k) : PERF_OFF.add(k);
    document.documentElement.classList.toggle('perf-off-' + k, !on);
    save();
    if (k === 'smooth') location.reload();
    if (k === 'cursor') document.documentElement.classList.toggle('has-cursor', on);
  }
  panel.addEventListener('change', e => { const k = e.target.dataset.k; if (k) set(k, e.target.checked); });
  $('.perf-reset', panel).addEventListener('click', () => {
    const reload = PERF_OFF.has('smooth');
    [...PERF_OFF].forEach(k => set(k, true));
    $$('input', panel).forEach(i => { i.checked = true; });
    if (reload) location.reload();
  });
  if (perfOff('cursor')) document.documentElement.classList.remove('has-cursor');

  // Meter: the screen's frame time is the shortest gap seen; a frame counts as late if it took 1.5× that or more
  let open = false, last = 0, base = 1000, gaps = [];
  function tick(t) {
    if (!open) return;
    if (last) {
      const g = t - last;
      base = Math.min(base, g);
      gaps.push([t, g]);
      gaps = gaps.filter(([at]) => t - at < 3000);
    }
    last = t;
    if (gaps.length % 10 === 0) {
      const late = gaps.filter(([, g]) => g > base * 1.5), worst = Math.max(0, ...gaps.map(([, g]) => g));
      $('.perf-meter', panel).innerHTML = `Screen: ${Math.round(1000 / base)} fps<br>Late frames (last 3s): <b>${late.length}</b> · worst ${Math.round(worst)}ms`;
    }
    requestAnimationFrame(tick);
  }
  addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'p' || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea')) return;
    open = panel.classList.toggle('open');
    if (open) { last = 0; gaps = []; requestAnimationFrame(tick); }
  });
})();

/* ───────── Shift + H hides all dev UI (dev buttons and panels), remembered in this browser ─────────
   doubletake has the same shortcut; when its overlay is on the page, it handles the key instead. */
(function hideDevUI() {
  const KEY = 'spr-hide-dev';
  const set = on => { document.documentElement.classList.toggle('hide-dev', on); try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {} };
  try { if (localStorage.getItem(KEY) === '1') document.documentElement.classList.add('hide-dev'); } catch {}
  addEventListener('keydown', e => {
    if (e.key !== 'H' || !e.shiftKey || e.repeat || e.metaKey || e.ctrlKey || e.target.closest?.('input, textarea')) return;
    if (document.getElementById('doubletake')) return;
    set(!document.documentElement.classList.contains('hide-dev'));
  });
})();

route();
if (document.querySelector('.page.active')?.dataset.page === 'home' && !reduceMotion) intro.play();
else intro.showAll();
