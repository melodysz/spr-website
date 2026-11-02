const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ───────── Art stages scale to the viewport (designed at 1470px wide) ───────── */
function fitStages() {
  const s = Math.min(1, document.documentElement.clientWidth / 1470);
  document.documentElement.style.setProperty('--s', s);
}
addEventListener('resize', fitStages);
fitStages();

/* ───────── Smooth scroll (light: trackpad/wheel only, touch stays native) ───────── */
const lenis = !reduceMotion && window.Lenis ? new Lenis({ lerp: 0.24 }) : null;
if (lenis) requestAnimationFrame(function raf(t) { lenis.raf(t); requestAnimationFrame(raf); });
const NAV_H = () => $('#nav').offsetHeight;

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
    hovering = !!t?.closest('a, button, .has-letter, .cw-deco, .chip, .legend-item');
    el.classList.toggle('on-green', !!t?.closest('.footer, .founders, .bg-green, .btn-green'));
    dark = isDark(t);
    sqEl.style.mixBlendMode = dark ? cfg.darkBlend : cfg.blend;
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
  addEventListener('scroll', () => {
    showCoords();
    if (mx >= 0) updateUnder(document.elementFromPoint(mx, my)); // background under a still cursor changes while scrolling
  }, { passive: true });

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
    sqEl.style.mixBlendMode = dark ? cfg.darkBlend : cfg.blend;
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

/* ───────── Crossword ───────── */
(function crossword() {
  const stage = $('#crossword');
  const COLS = 19, ROWS = 12;
  const x = c => 38 + 73.39 * c;
  const y = r => 85 + 73.39 * r;

  const words = [
    { w: 'EXPLORE', c: 2, r: 1, down: true },
    { w: 'POLICY', c: 1, r: 5 },
    { w: 'COMMUNITY', c: 6, r: 3 },
    { w: 'JUSTICE', c: 10, r: 2, down: true },
    { w: 'ADVOCACY', c: 4, r: 7 },
    { w: 'EDUCATE', c: 10, r: 8 },
    { w: 'RESEARCH', c: 14, r: 4, down: true },
  ];
  const fills = {
    '2,0': 'lavender', '9,1': 'lime', '15,1': 'lavender', '18,2': 'lime', '1,4': 'green', '16,4': 'teal',
    '8,5': 'teal', '7,8': 'lavender', '3,9': 'lime', '0,10': 'teal', '17,10': 'green', '4,11': 'teal',
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
      cell.el.classList.add(word.down ? 'tg' : 'tp', 'has-letter');
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

  // Fill the screen: scale the 1470×1010 crossword to fit the viewport below the nav bar
  function fitToScreen() {
    const navH = $('#nav').offsetHeight, margin = 24;
    const cs = Math.min(innerWidth / 1470, (innerHeight - navH - margin * 2) / 1010);
    const section = stage.closest('.crossword');
    section.style.setProperty('--cs', cs);
    section.style.setProperty('--cw-top', `calc(50% + ${navH / 2}px)`);
  }
  addEventListener('resize', fitToScreen);
  fitToScreen();

  // Stars + stickers (draggable)
  const decos = [
    { src: 'star1.svg', cx: 108.5, cy: 795.5, w: 181, h: 181, rot: 12.49, inset: '0 0.76% 3.02% 0.76%' },
    { src: 'star3.svg', cx: 365.56, cy: 218.88, w: 81.251, h: 81.251, rot: -9.13, inset: '0 2.45% 9.55% 2.45%' },
    { src: 'star4.svg', cx: 420.39, cy: 167.84, w: 81.251, h: 81.251, rot: 13.19, inset: '0 2.45% 9.55% 2.45%' },
    { src: 'star5.svg', cx: 460.82, cy: 323.82, w: 81.251, h: 81.251, rot: 6.79, inset: '0 2.45% 9.55% 2.45%' },
    { src: 'star2.svg', cx: 1173.95, cy: 230.84, w: 204.495, h: 204.495, rot: 12.49, inset: '0 2.45%' },
    { src: 'sticker62.png', cx: 1156.97, cy: 221.73, w: 90.029, h: 86.057, rot: 31.99, sticker: true },
    { src: 'sticker60.png', cx: 1253.85, cy: 336.67, w: 70.643, h: 61.665, rot: -43.33, sticker: true },
    { src: 'sticker63.png', cx: 318.48, cy: 824.53, w: 80.315, h: 76.926, rot: 21.56, sticker: true, flipY: true },
  ];
  let topZ = 10;
  decos.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cw-deco' + (d.sticker ? ' sticker' : '');
    Object.assign(el.style, { left: d.cx - d.w / 2 + 'px', top: d.cy - d.h / 2 + 'px', width: d.w + 'px', height: d.h + 'px' });
    const imgStyle = d.sticker
      ? `inset:0; width:100%; height:100%; object-fit:cover;${d.flipY ? ' transform:scaleY(-1);' : ''}`
      : `inset:${d.inset}`;
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
      const s = stage.getBoundingClientRect().width / 1470; // crossword has its own fit-to-screen scale
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

  function tick(now) {
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
  requestAnimationFrame(tick);
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
(function missionParallax() {
  const section = $('.mission'), img = $('.mission-bg img');
  if (!section || reduceMotion) return;
  function update() {
    const r = section.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    // -1 when the section enters at the bottom, +1 when it leaves at the top
    const p = (innerHeight / 2 - (r.top + r.height / 2)) / (innerHeight / 2 + r.height / 2);
    img.style.transform = `translateY(${p * r.height * 0.15}px)`;
  }
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
})();

/* ───────── Intro animation (experimental) ─────────
   1. dark screen, lime counter 0→100%
   2. the counter becomes "think" (same spot), then each word of the trail fades in lower down
   3. the page glides down after each word while the dark lifts to lilac, then the gradient
   4. camera lands on the photo, words turn white, scrolling unlocks */
const intro = (function () {
  const el = $('#intro'), stage = $('#intro-stage'), count = $('#intro-count');

  // [word, right edge x, top y, font size, colour, asterisk?] — positions from the Figma "Hero" frame
  const TRAIL = [
    ['think', 764, 26, 40, '#2fdbb2'],
    ['*', 707, 75, 96, '#b3f00d', true],
    ['wonder', 705, 150, 32, '#ddd2fa'],
    ['*', 668, 205, 72.192, '#dafe7a', true],
    ['explore', 853, 212, 40, '#b3f00d'],
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
  const FIRST = { x: 722, y: 50.5 }; // centre of the first "think"

  // Hero title: split into letters (kept inside word wrappers so lines only break between words)
  const title = $('.intro-title', el);
  let letterIndex = 0;
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
          l.style.setProperty('--i', letterIndex++);
          word.append(l);
        }
        frag.append(word);
      }
      child.replaceWith(frag);
    }
  })(title);

  // Scramble-in: each letter flashes a block cursor (░▒▓), cycles random characters, then settles — left to right.
  // The scramble glyph floats over the letter's real spot, so the title never jitters in width.
  const letters = $$('.tt-ch', title).map(l => { const g = document.createElement('span'); g.className = 'tt-sc'; l.append(g); return { l, g, ch: l.firstChild.textContent }; });
  const SCRAMBLE_PRESETS = {
    // in use: letters pop in at random, each flicking through a few faint characters
    light: { order: 'random', spread: 900, cursor: 0, cycle: 170, tick: 55, chars: 'abcdefghijklmnopqrstuvwxyz', glyphOpacity: 0.55 },
    // saved for later: left to right, block cursor ░▒▓█ then a longer scramble
    intense: { order: 'sequential', stagger: 45, cursor: 90, cycle: 320, tick: 50, chars: 'abcdefghijklmnopqrstuvwxyz#%&*?01', cursorChars: '░▒▓█', glyphOpacity: 1 },
  };
  const SCRAMBLE = SCRAMBLE_PRESETS.light;
  let scrambleToken = 0;
  function hideTitle() { scrambleToken++; letters.forEach(({ l, g }) => { l.classList.remove('set'); g.textContent = ''; }); }
  function settleTitle() { scrambleToken++; letters.forEach(({ l, g }) => { l.classList.add('set'); g.textContent = ''; }); }
  function scrambleTitle() {
    if (reduceMotion) return settleTitle();
    const my = ++scrambleToken, t0 = performance.now();
    const rand = (i, step) => { const x = Math.sin(i * 127.1 + step * 311.7 + my * 17.3) * 43758.5453; return x - Math.floor(x); };
    // start times: evenly spread but shuffled (random order), or one after another
    const starts = letters.map((_, i) => SCRAMBLE.order === 'random' ? i / (letters.length - 1) * SCRAMBLE.spread : i * SCRAMBLE.stagger);
    if (SCRAMBLE.order === 'random') for (let i = starts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [starts[i], starts[j]] = [starts[j], starts[i]]; }
    letters.forEach(({ g }) => { g.style.opacity = SCRAMBLE.glyphOpacity; });
    requestAnimationFrame(function step(now) {
      if (my !== scrambleToken) return;
      let pending = false;
      letters.forEach(({ l, g }, i) => {
        if (l.classList.contains('set')) return;
        const t = now - t0 - starts[i];
        if (t < 0) { pending = true; return; }
        if (t < SCRAMBLE.cursor) {
          g.textContent = SCRAMBLE.cursorChars[Math.min(3, Math.floor(t / SCRAMBLE.cursor * 4))];
        } else if (t < SCRAMBLE.cursor + SCRAMBLE.cycle) {
          const k = Math.floor((t - SCRAMBLE.cursor) / SCRAMBLE.tick);
          g.textContent = SCRAMBLE.chars[Math.floor(rand(i, k) * SCRAMBLE.chars.length)];
        } else {
          g.textContent = ''; l.classList.add('set'); return;
        }
        pending = true;
      });
      if (pending) requestAnimationFrame(step);
    });
  }

  // Space above the trail. While the intro plays it's big enough for the first "think" to land exactly where the
  // counter sits (screen centre); afterwards it shrinks to a little breathing room above the hero.
  const TOP_ROOM = 160; // stage px of space kept above the trail after the intro
  let lead = 0, collapsed = false;
  function layout() {
    const s = scale();
    lead = collapsed ? TOP_ROOM * s : Math.max(TOP_ROOM * s, innerHeight / 2 - FIRST.y * s);
    el.style.setProperty('--lead', lead + 'px');
    count.style.left = `calc(50% + ${(FIRST.x - 735) * s}px)`;
    if (speckReady) { sizeSpeckles(); drawSpeckles(); }
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
        const k = (devicePixelRatio || 1) * scale(); // crisp on retina, drawn in stage px
        canvas.width = Math.max(1, Math.round(w * k));
        canvas.height = Math.max(1, Math.round(h * k));
        ctx.setTransform(k, 0, 0, k, 0, 0);
        const n = Math.round(w * h / SPECKLE_AREA);
        dots = Array.from({ length: n }, newDot);
      },
      churn() { for (let i = 0; i < dots.length; i++) if (Math.random() < SPECKLE_CHURN) dots[i] = newDot(); },
      // depth: whether to soften dots near the top of the screen
      draw(depth) {
        ctx.clearRect(0, 0, w, h);
        const s = scale(), top = canvas.getBoundingClientRect().top;
        for (const dot of dots) {
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
        ctx.globalAlpha = 1;
      },
    };
  }
  const heroSpeckles = speckleField($('.intro-speckles', el), () => 1470, () => 1300);
  const leadSpeckles = speckleField($('.intro-speckles-lead', el), () => innerWidth / scale(), () => lead / scale());
  let speckReady = true, depthOn = true;
  function sizeSpeckles() { heroSpeckles.size(); leadSpeckles.size(); }
  function drawSpeckles() { heroSpeckles.draw(depthOn); leadSpeckles.draw(depthOn); }
  function churnSpeckles() { heroSpeckles.churn(); leadSpeckles.churn(); drawSpeckles(); }
  const softPhoto = $('.intro-photo-soft', el);
  function blurWords() {
    const s = scale();
    const blurEl = (node, px) => { node.style.filter = px > 0.2 ? `blur(${px.toFixed(1)}px)` : ''; };
    for (const w of words) {
      if (!w.el.classList.contains('on')) continue;
      const r = w.el.getBoundingClientRect();
      blurEl(w.el, depthOn ? depthAt(r.top + r.height / 2) / s : 0);
    }
    // title letters blur individually, like the words
    for (const { l } of letters) {
      const r = l.getBoundingClientRect();
      blurEl(l, depthOn && r.top < innerHeight * DEPTH_ZONE ? depthAt(r.top + r.height / 2) / s : 0);
    }
    // photo: the softened copy fades in toward the top of the screen (mask measured in the photo's own px)
    const pr = softPhoto.getBoundingClientRect();
    if (!depthOn || pr.top > innerHeight * DEPTH_ZONE) softPhoto.style.setProperty('--soft-mask', 'linear-gradient(transparent, transparent)');
    else {
      const a = (-pr.top) / s, b = (innerHeight * DEPTH_ZONE - pr.top) / s;
      softPhoto.style.setProperty('--soft-mask', `linear-gradient(to bottom, #000 ${a.toFixed(1)}px, transparent ${b.toFixed(1)}px)`);
    }
  }
  addEventListener('resize', layout);
  layout();

  let lastSpeck = 0, lastScroll = -1;
  const photo = $('.intro-photo:not(.intro-photo-soft)', el), PHOTO_PARALLAX = 0.1;
  requestAnimationFrame(function fx(now) {
    requestAnimationFrame(fx);
    if (!document.body.classList.contains('intro-on')) return;
    const visible = document.body.classList.contains('intro-visible');
    const wantDepth = visible || playing; // the nav bar slides in when the intro leaves → blur off
    if (wantDepth !== depthOn) { depthOn = wantDepth; blurWords(); drawSpeckles(); }
    if (!visible) return;
    const moved = scrollY !== lastScroll;
    lastScroll = scrollY;
    if (!reduceMotion && now - lastSpeck > SPECKLE_TICK) { lastSpeck = now; churnSpeckles(); }
    else if (moved) drawSpeckles(); // blur follows the dots as the page moves
    if (moved || playing) blurWords();
    // Photo parallax: lines up with Figma when the camera lands; drifts slightly slower than the page around that
    if (!reduceMotion) photo.style.transform = softPhoto.style.transform = `translateY(${(scrollY - endY()) * PHOTO_PARALLAX / scale()}px)`;
  });

  const endY = () => Math.max(0, el.offsetTop + el.offsetHeight - innerHeight);
  const cameraFor = cy => Math.max(0, Math.min(endY(), el.offsetTop + lead + cy * scale() - innerHeight / 2));
  const jumpTo = y => lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y);

  // Word pacing: first gap → last gap (ms)
  const GAP_SLOW = 480, GAP_FAST = 55;
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
    const p = bezierY(i / (words.length - 1), 0, 0, 0.58, 1);
    SCHEDULE.push(SCHEDULE[i - 1] + GAP_SLOW - (GAP_SLOW - GAP_FAST) * p);
  }

  // Camera: one continuous move from the top to the photo, on its own clock.
  // Its ease-in-out curve is fitted each play so it tracks where the words appear,
  // without ever snapping to a word.
  const LANDING = 1700; // ms the camera keeps travelling after the last word, easing onto the photo
  let playing = false, token = 0, cam = null;

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
    scrollTo(0, cam.end * bezierY(u, cam.x1, 0, cam.x2, 1));
  });

  function lock(on) {
    document.documentElement.classList.toggle('intro-lock', on);
    if (on) lenis?.stop(); else lenis?.start();
  }
  function collapseLead() {
    const before = lead;
    collapsed = true;
    layout();
    const removed = before - lead;
    if (removed > 0 && scrollY > 0) jumpTo(Math.max(0, scrollY - removed)); // keep the same view, no jump
  }
  function showAll() {
    words.forEach(w => w.el.classList.add('on'));
    count.classList.add('gone');
    el.classList.add('revealed', 'whiten');
    settleTitle();
    collapseLead();
  }
  function finish() {
    playing = false;
    lock(false);
    el.classList.remove('playing');
    el.classList.add('done');
    collapseLead();
  }

  async function play() {
    const my = ++token, alive = () => my === token;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    el.classList.remove('revealed', 'whiten', 'done');
    hideTitle();
    words.forEach(w => { w.el.classList.remove('on'); w.el.style.filter = ''; });
    count.classList.remove('gone');
    count.textContent = '0%';
    collapsed = false;
    layout();
    jumpTo(0);
    cam = null;
    lock(true);
    playing = true;
    el.classList.add('playing');

    // 1. counter 0 → 100% (eases in and out)
    const t0 = performance.now(), DUR = 1500;
    await new Promise(done => requestAnimationFrame(function step(now) {
      if (!alive()) return done();
      const p = Math.min(1, (now - t0) / DUR);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      count.textContent = Math.round(e * 100) + '%';
      p < 1 ? requestAnimationFrame(step) : done();
    }));
    await wait(200); if (!alive()) return;

    // 2–3. counter turns into "think", then the trail meanders down on a steady, quickening beat,
    //       while the camera glides down on its own accelerating curve
    count.classList.add('gone');
    el.classList.add('revealed');
    const start = performance.now();
    cam = { ...fitCamera(), start };
    for (let i = 0; i < words.length; i++) {
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
  $('#intro-replay').addEventListener('click', () => {
    if (location.hash.replace(/^#\/?/, '')) location.hash = '#/';
    requestAnimationFrame(play);
  });

  // Nav hides while the intro is on screen
  new IntersectionObserver(([e]) => document.body.classList.toggle('intro-visible', e.isIntersecting),
    { rootMargin: '-80px 0px 0px 0px' }).observe(el);
  introHook = page => {
    document.body.classList.toggle('intro-on', page === 'home');
    if (page !== 'home') skip();
  };

  return { play, showAll };
})();

route();
if (document.querySelector('.page.active')?.dataset.page === 'home' && !reduceMotion) intro.play();
else intro.showAll();
