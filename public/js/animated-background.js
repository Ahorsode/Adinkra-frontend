// <AnimatedBackground>: a decorative, image-only animated background.
//
//   const bg = AnimatedBackground(el, { images, interval, fadeDuration, kenBurns, parallax, ... });
//   bg.destroy();
//
// Motion is CSS transforms and opacity only (styles in app.css, "Animated background"):
//   - Ken Burns: slow scale + drift per slide, alternating zoom in / zoom out.
//   - Crossfade: two stacked layers; the next image is swapped in only once it has
//     downloaded and decoded.
//   - Parallax: mouse-driven on desktop, scroll-driven (or off) on touch devices.
// It pauses when the tab is hidden or the element is scrolled out of view, shows a
// single still image for prefers-reduced-motion, and a single low-res image for
// Save-Data / 2G connections.

import manifest from './hero-images.js';

const IMG_BASE = '/img/hero/';
const TALL_MEDIA = '(orientation: portrait)';
const WIDE_MEDIA = '(orientation: landscape)';
const MQ = {
  // Narrow screens, plus phones held in landscape (short + touch).
  phone: '(max-width: 639.98px), (max-height: 480px) and (pointer: coarse)',
  tablet: '(min-width: 640px) and (max-width: 1023.98px)',
  finePointer: '(hover: hover) and (pointer: fine)',
  reduceMotion: '(prefers-reduced-motion: reduce)',
  reduceData: '(prefers-reduced-data: reduce)',
};

export const DEFAULTS = {
  images: [],
  interval: 7000,
  fadeDuration: 1500,
  firstFadeDuration: 700,
  preloadLead: 2500,
  kenBurns: true,
  kenBurnsDuration: 15000,
  parallax: true,
  breakpoints: {
    desktop: { slides: 5, scale: 1.12, parallax: 30, parallaxMode: 'pointer' },
    tablet: { slides: 4, scale: 1.09, parallax: 15, parallaxMode: 'auto' },
    phone: { slides: 3, scale: 1.06, parallax: 14, parallaxMode: 'scroll' },
  },
  /** Element whose bottom edge the dark text scrim must extend past (e.g. the headline block). */
  scrimTarget: null,
  /** Called once, when the first image has loaded (or failed). */
  onReady: null,
};

// ---------- Image sources ----------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const matches = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;

/** Save-Data, 2G, or prefers-reduced-data: serve one static low-res image. */
export function prefersLiteBackground() {
  const c = navigator.connection;
  return Boolean(c && (c.saveData || /2g$/.test(c.effectiveType || ''))) || matches(MQ.reduceData);
}

function lookup(slug, kind) {
  const entry = manifest[slug];
  if (!entry) throw new Error(`AnimatedBackground: unknown image "${slug}". Add it to scripts/build-hero-images.mjs and run npm run images.`);
  const fallback = kind === 'wide' ? 'tall' : 'wide';
  const k = entry[kind] ? kind : fallback;
  return { slug, kind: k, ...entry[k] };
}

/** A slide is either "slug" or { wide: "slug", tall: "slug" }. */
function crops(slide) {
  const s = typeof slide === 'string' ? { wide: slide, tall: slide } : slide;
  const wide = lookup(s.wide || s.tall, 'wide');
  const tall = lookup(s.tall || s.wide, 'tall');
  const same = wide.slug === tall.slug && wide.kind === tall.kind;
  return { wide, tall: same ? null : tall };
}

const srcset = (c, ext, lite) => (lite ? c.widths.slice(0, 1) : c.widths)
  .map((w) => `${IMG_BASE}${c.slug}-${c.kind}-${w}.${ext} ${w}w`).join(', ');

/** "62% 55%" -> transform-origin kept 20–80% so the Ken Burns drift never exposes an edge. */
const origin = (pos) => pos.split(' ').map((p) => `${clamp(parseFloat(p), 20, 80)}%`).join(' ');

function buildPicture(slide, { lite, priority }) {
  const { wide, tall } = crops(slide);
  const pic = document.createElement('picture');
  const source = (c, ext, type, media) => {
    const s = document.createElement('source');
    s.type = type;
    s.srcset = srcset(c, ext, lite);
    s.sizes = '100vw';
    if (media) s.media = media;
    pic.append(s);
  };
  if (tall) {
    source(tall, 'avif', 'image/avif', TALL_MEDIA);
    source(tall, 'webp', 'image/webp', TALL_MEDIA);
    source(tall, 'jpg', 'image/jpeg', TALL_MEDIA);
  }
  source(wide, 'avif', 'image/avif');
  source(wide, 'webp', 'image/webp');

  const img = document.createElement('img');
  img.className = 'abg-img';
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'eager'; // only ever created right before it is needed
  img.draggable = false;
  img.fetchPriority = priority ? 'high' : 'low';
  pic.append(img); // inside <picture> before any src is set, so only the chosen source is fetched
  img.sizes = '100vw';
  img.srcset = srcset(wide, 'jpg', lite);
  img.src = `${IMG_BASE}${wide.slug}-${wide.kind}-${lite ? wide.widths[0] : wide.widths.filter((w) => w <= 1024).pop() || wide.widths[0]}.jpg`;
  const t = tall || wide;
  img.style.cssText = `--pos-wide:${wide.pos};--pos-tall:${t.pos};--origin-wide:${origin(wide.pos)};--origin-tall:${origin(t.pos)}`;

  const ready = new Promise((resolve) => {
    const done = (ok) => {
      if (!ok) return resolve(false);
      // Decode off the main thread before the swap so the crossfade never stutters.
      // decode() can stall while the page isn't rendering (e.g. a background tab), so cap the wait.
      const decoded = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
      Promise.race([decoded, new Promise((r) => setTimeout(r, 250))]).then(() => resolve(true));
    };
    if (img.complete && img.naturalWidth) done(true);
    else {
      img.addEventListener('load', () => done(true), { once: true });
      img.addEventListener('error', () => done(false), { once: true });
    }
  });
  return { pic, img, ready };
}

/**
 * Starts downloading the first slide before the page that shows it has rendered.
 * Uses the same srcset/sizes as the <picture>, so the browser reuses the response.
 */
export function preloadAnimatedBackground(images) {
  if (!images?.length) return;
  const lite = prefersLiteBackground();
  const { wide, tall } = crops(images[0]);
  const add = (c, media) => {
    const l = document.createElement('link');
    l.rel = 'preload';
    l.as = 'image';
    l.type = 'image/avif';
    l.setAttribute('imagesrcset', srcset(c, 'avif', lite));
    l.setAttribute('imagesizes', '100vw');
    l.setAttribute('fetchpriority', 'high');
    if (media) l.media = media;
    document.head.append(l);
  };
  if (tall) {
    add(tall, TALL_MEDIA);
    add(wide, WIDE_MEDIA);
  } else add(wide);
}

// ---------- Component ----------

export function AnimatedBackground(root, options = {}) {
  const o = { ...DEFAULTS, ...options, breakpoints: { ...DEFAULTS.breakpoints, ...options.breakpoints } };
  const mqls = Object.fromEntries(Object.entries(MQ).map(([k, q]) => [k, matchMedia(q)]));
  let instance = null;
  let readyFired = false;
  const onReady = () => {
    if (readyFired) return;
    readyFired = true;
    o.onReady?.();
  };

  const rebuild = () => {
    instance?.teardown();
    instance = mount(root, o, mqls, onReady);
  };
  const motionChanged = () => rebuild();
  mqls.reduceMotion.addEventListener('change', motionChanged);
  rebuild();

  return {
    destroy() {
      mqls.reduceMotion.removeEventListener('change', motionChanged);
      instance?.teardown();
      instance = null;
      root.replaceChildren();
      root.classList.remove('is-ready', 'is-paused', 'is-static');
    },
  };
}

function mount(root, o, mqls, onReady) {
  const slides = o.images;
  const lite = prefersLiteBackground();
  const still = lite || mqls.reduceMotion.matches || slides.length < 2;
  const cleanups = [];
  let dead = false;
  const timeouts = new Set();
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  const timeout = (fn, ms) => {
    const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
  };

  root.classList.add('abg');
  root.classList.toggle('is-static', still);
  root.classList.remove('is-ready', 'is-paused');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<div class="abg-stage"><div class="abg-layer" data-state="idle"></div><div class="abg-layer" data-state="idle"></div></div><div class="abg-overlay"></div>';
  const stage = root.querySelector('.abg-stage');
  let [front, back] = root.querySelectorAll('.abg-layer');

  const mode = () => (mqls.phone.matches ? 'phone' : mqls.tablet.matches ? 'tablet' : 'desktop');
  const bp = () => o.breakpoints[mode()];

  // ---- CSS variables from config ----
  function applyVars() {
    const b = bp();
    const scale = o.kenBurns && !still ? b.scale : 1;
    const drift = (scale - 1) * 18; // % of the image; stays inside the zoom margin (see origin())
    const s = root.style;
    s.setProperty('--abg-scale', String(scale));
    s.setProperty('--abg-dx', `${drift.toFixed(2)}%`);
    s.setProperty('--abg-dy', `${(drift / 2).toFixed(2)}%`);
    s.setProperty('--abg-kb', `${o.kenBurnsDuration}ms`);
    s.setProperty('--abg-fade', `${o.fadeDuration}ms`);
    s.setProperty('--abg-fade-first', `${o.firstFadeDuration}ms`);
  }

  // ---- Scrim follows the headline so text always sits on the dark band ----
  if (o.scrimTarget && 'ResizeObserver' in window) {
    const ro = new ResizeObserver(() => {
      const end = o.scrimTarget.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
      root.style.setProperty('--abg-scrim-end', `${Math.max(0, Math.round(end + 24))}px`);
    });
    ro.observe(o.scrimTarget);
    ro.observe(root);
    cleanups.push(() => ro.disconnect());
  }

  // ---- Pause / resume: tab hidden or element off screen ----
  let running = true;
  let inView = true;
  let job = null; // { fn, remaining, due, timer }
  let pendingSwap = false;

  function later(fn, ms) {
    if (job?.timer) clearTimeout(job.timer);
    job = { fn, remaining: ms, due: 0, timer: 0 };
    if (running) arm();
  }
  function arm() {
    const j = job;
    j.due = performance.now() + j.remaining;
    j.timer = setTimeout(() => {
      if (job !== j) return;
      job = null;
      j.fn();
    }, j.remaining);
  }
  function sync() {
    const run = inView && !document.hidden;
    if (run === running) return;
    running = run;
    root.classList.toggle('is-paused', !run);
    if (!run) {
      if (job?.timer) {
        clearTimeout(job.timer);
        job.timer = 0;
        job.remaining = Math.max(0, job.due - performance.now());
      }
      parallax.stop();
    } else {
      if (job && !job.timer) arm();
      if (pendingSwap) {
        pendingSwap = false;
        swap();
      }
      parallax.refresh();
    }
  }

  // ---- Slides ----
  let index = 0;
  let nextIndex = 0;
  let shown = 0; // slides shown so far; parity picks zoom in vs out
  let backReady = null;
  const kbClass = (n) => (n % 2 ? 'kb-out' : 'kb-in');

  function showFirst() {
    const layer = front;
    const { pic, img, ready } = buildPicture(slides[0], { lite, priority: true });
    if (!still) img.classList.add(kbClass(0));
    layer.append(pic);
    ready.then((ok) => {
      if (dead) return;
      layer.classList.add('is-first');
      layer.dataset.state = 'active';
      root.classList.add('is-ready');
      timeout(() => layer.classList.remove('is-first'), o.firstFadeDuration + 100);
      onReady();
      if (ok && !still) scheduleNext();
    });
  }

  function scheduleNext() {
    later(prepareNext, Math.max(0, o.interval - o.preloadLead));
  }

  function prepareNext() {
    const count = Math.min(slides.length, Math.max(1, bp().slides));
    nextIndex = (index + 1) % count;
    if (nextIndex === index) return scheduleNext(); // single slide at this breakpoint; check again later
    back.replaceChildren();
    back.dataset.state = 'idle';
    const { pic, img, ready } = buildPicture(slides[nextIndex], { lite: false, priority: false });
    img.classList.add(kbClass(shown + 1));
    back.append(pic);
    backReady = ready;
    later(advance, Math.min(o.preloadLead, o.interval));
  }

  async function advance() {
    const ok = await backReady;
    if (dead) return;
    if (!ok) { // broken image: skip it and try the one after
      index = nextIndex;
      back.replaceChildren();
      return scheduleNext();
    }
    if (!running) { pendingSwap = true; return; }
    swap();
  }

  function swap() {
    const incoming = back;
    const outgoing = front;
    outgoing.dataset.state = 'leaving';
    incoming.classList.add('is-fading');
    incoming.dataset.state = 'active';
    front = incoming;
    back = outgoing;
    index = nextIndex;
    shown += 1;
    timeout(() => {
      incoming.classList.remove('is-fading');
      if (back === outgoing && outgoing.dataset.state === 'leaving') {
        outgoing.dataset.state = 'idle';
        outgoing.replaceChildren(); // free the decoded bitmap
      }
    }, o.fadeDuration + 100);
    scheduleNext();
  }

  // ---- Parallax (translate3d on the stage only) ----
  const parallax = (() => {
    let kind = 'none';
    let max = 0;
    let raf = 0;
    let idle = 0;
    const cur = { x: 0, y: 0 };
    const tgt = { x: 0, y: 0 };
    const unbind = [];

    const step = () => {
      raf = 0;
      const k = kind === 'pointer' ? 0.07 : 1;
      cur.x += (tgt.x - cur.x) * k;
      cur.y += (tgt.y - cur.y) * k;
      stage.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`;
      if (Math.abs(tgt.x - cur.x) > 0.05 || Math.abs(tgt.y - cur.y) > 0.05) raf = requestAnimationFrame(step);
      else {
        clearTimeout(idle);
        idle = setTimeout(() => stage.classList.remove('is-moving'), 400);
      }
    };
    const kick = () => {
      if (!running || raf) return;
      clearTimeout(idle);
      stage.classList.add('is-moving');
      raf = requestAnimationFrame(step);
    };
    const onPointer = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      tgt.x = (0.5 - e.clientX / innerWidth) * 2 * max;
      tgt.y = (0.5 - e.clientY / innerHeight) * 2 * max;
      kick();
    };
    const onPointerOut = (e) => {
      if (e.relatedTarget) return; // still inside the window
      tgt.x = 0;
      tgt.y = 0;
      kick();
    };
    const onScroll = () => {
      const r = root.getBoundingClientRect();
      tgt.x = 0;
      tgt.y = clamp(-r.top / Math.max(1, r.height), 0, 1) * max;
      kick();
    };

    function setup() {
      teardown();
      const b = bp();
      kind = 'none';
      if (!still && o.parallax && b.parallax > 0) {
        const fine = mqls.finePointer.matches;
        kind = b.parallaxMode === 'auto' ? (fine ? 'pointer' : 'scroll') : b.parallaxMode;
        if (kind === 'pointer' && !fine) kind = 'scroll'; // touch-only "desktop": no hover dependency
      }
      max = kind === 'none' ? 0 : b.parallax;
      root.style.setProperty('--abg-px', `${max}px`);
      if (kind === 'pointer') {
        window.addEventListener('pointermove', onPointer, { passive: true });
        window.addEventListener('pointerout', onPointerOut, { passive: true });
        unbind.push(() => window.removeEventListener('pointermove', onPointer), () => window.removeEventListener('pointerout', onPointerOut));
      } else if (kind === 'scroll') {
        window.addEventListener('scroll', onScroll, { passive: true });
        unbind.push(() => window.removeEventListener('scroll', onScroll));
        onScroll();
      }
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      stage.classList.remove('is-moving');
    }
    function teardown() {
      stop();
      clearTimeout(idle);
      unbind.splice(0).forEach((fn) => fn());
      cur.x = cur.y = tgt.x = tgt.y = 0;
      stage.style.transform = '';
    }
    return { setup, stop, teardown, refresh: () => (kind === 'scroll' ? onScroll() : kick()) };
  })();

  // ---- Wire up ----
  applyVars();
  showFirst();

  if (!still) {
    parallax.setup();
    const onBreakpoint = () => { applyVars(); parallax.setup(); };
    for (const k of ['phone', 'tablet', 'finePointer']) listen(mqls[k], 'change', onBreakpoint);
    listen(document, 'visibilitychange', sync);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        inView = entries[entries.length - 1].isIntersecting;
        sync();
      });
      io.observe(root);
      cleanups.push(() => io.disconnect());
    }
    sync();
  }

  return {
    teardown() {
      if (job?.timer) clearTimeout(job.timer);
      job = null;
      timeouts.forEach(clearTimeout);
      timeouts.clear();
      parallax.teardown();
      cleanups.splice(0).forEach((fn) => fn());
      dead = true; // pending load callbacks see this and stop
    },
  };
}
