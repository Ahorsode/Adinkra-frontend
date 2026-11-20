// Shared client helpers: API calls, routing, formatting, modal, toasts, charts.

export const state = { user: null, airports: [], airportMap: {} };

// ---------- API ----------
const TOKENS_KEY = 'adk_booking_tokens';
function tokens() {
  try { return JSON.parse(sessionStorage.getItem(TOKENS_KEY) || '{}'); } catch { return {}; }
}
export function saveBookingToken(pnr, token) {
  if (!token) return;
  const t = tokens();
  t[pnr] = token;
  try { sessionStorage.setItem(TOKENS_KEY, JSON.stringify(t)); } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

function headersFor(path, extra = {}) {
  const h = { 'X-Requested-With': 'fetch', ...extra };
  const m = /^\/api\/bookings\/([A-Z0-9]{6})/.exec(path);
  if (m && tokens()[m[1]]) h['X-Booking-Token'] = tokens()[m[1]];
  return h;
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: headersFor(path, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.user) { state.user = null; renderNav(); }
    throw new ApiError(res.status, data);
  }
  return data;
}
export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body = {}) => api(p, { method: 'PUT', body });

export async function downloadFile(path, filename) {
  const res = await fetch(path, { credentials: 'same-origin', headers: headersFor(path) });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new ApiError(res.status, d);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Escaping & formatting ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => (v == null ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]));
export const money = (n, dp = 2) => `GH₵ ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const compactMoney = (n) => {
  const v = Number(n || 0);
  // One compact format per screen: always one decimal, so 801.4M and 8.3k read alike.
  if (Math.abs(v) >= 1e6) return `GH₵ ${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `GH₵ ${(v / 1e3).toFixed(1)}k`;
  return `GH₵ ${v.toFixed(0)}`;
};
export const num = (n) => Number(n || 0).toLocaleString('en-GH');
export const pct = (x, dp = 0) => `${(Number(x || 0) * 100).toFixed(dp)}%`;
const TZ = { timeZone: 'UTC' };
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...TZ }) : '');
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...TZ }) : '');
export const fmtDateLong = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...TZ }) : '');
export const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : '');
export const fmtDur = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
export const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
export const today = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
export const SEG_LABEL = { DOMESTIC: 'Domestic', REGIONAL: 'Regional', INTERNATIONAL: 'International' };
export const segBadge = (s) => `<span class="nowrap"><span class="seg-dot seg-${esc(s)}"></span>${esc(SEG_LABEL[s] || s)}</span>`;
export const city = (code) => state.airportMap[code]?.city || code;
export const STATUS_TONE = {
  HELD: 'warn', CONFIRMED: 'ok', CANCELLED: 'bad', EXPIRED: 'bad', BOARDED: 'info',
  OPEN: 'warn', IN_PROGRESS: 'info', RESOLVED: 'ok', CLOSED: '',
  PENDING: 'warn', APPROVED: 'info', RECEIVED: 'info', IN_TRANSIT: 'info', ARRIVED: 'ok', DELIVERED: 'ok', REJECTED: 'bad',
};
export const badge = (status, label) => `<span class="badge ${STATUS_TONE[status] || ''}">${esc(label || String(status).replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()))}</span>`;
export const liveBadge = (live) => `<span class="badge ${esc(live.tone)}">${esc(live.label)}</span>`;
export const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const daysChips = (days) => `<span class="days" title="Operating days">${DAYS.map((d, i) => `<span class="${days.includes(String(i + 1)) ? 'on' : ''}">${d}</span>`).join('')}</span>`;

export function airportOptions(selected, { servedOnly = true, list } = {}) {
  const src = list || state.airports.filter((a) => !servedOnly || a.served);
  const groups = { GH: 'Ghana', WA: 'West Africa', INTL: 'International' };
  return Object.entries(groups).map(([z, label]) => {
    const opts = src.filter((a) => a.zone === z);
    if (!opts.length) return '';
    return `<optgroup label="${label}">${opts.map((a) => `<option value="${a.code}" ${a.code === selected ? 'selected' : ''}>${esc(a.city)} (${a.code})</option>`).join('')}</optgroup>`;
  }).join('');
}

// ---------- Icons (lucide, 1.5 stroke, inherit text colour) ----------
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
};
export const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
/** Back link: arrow icon + label, used at the top of detail pages. */
export const backLink = (href, label) => `<a href="${href}" class="small back">${icon('arrow-left')}${esc(label)}</a>`;

// ---------- DOM helpers ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const view = () => document.getElementById('app');
export function formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) out[k] = typeof v === 'string' ? v.trim() : v;
  return out;
}
export const loading = (msg = 'Loading…') => `<div class="loading"><span class="spinner"></span> ${esc(msg)}</div>`;
export const errorBox = (e) => `<div class="error-box">${esc(e?.message || e)}</div>`;

/** Wraps a submit/click handler: disables the button, shows errors inline. */
export function guard(btn, fn, errTarget) {
  return async (ev) => {
    ev?.preventDefault?.();
    if (btn) btn.disabled = true;
    if (errTarget) errTarget.innerHTML = '';
    try {
      await fn(ev);
    } catch (e) {
      if (errTarget) errTarget.innerHTML = errorBox(e);
      else toast(e.message, 'bad');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
}

export function toast(msg, tone = '') {
  const el = Object.assign(document.createElement('div'), { className: `toast ${tone}`, textContent: msg });
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

export function modal({ title, body, actions = '' }) {
  const d = document.getElementById('modal');
  d.innerHTML = `<div class="mh"><h2>${esc(title)}</h2><button class="btn btn-ghost" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="mb">${body}</div>${actions ? `<div class="mf">${actions}</div>` : ''}`;
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  if (!d.open) d.showModal();
  return d;
}
export const closeModal = () => document.getElementById('modal').close();

// ---------- Roles & permissions (mirror of the API's hasPerm; the API still enforces them) ----------
/** Staff portal sections and the permission each needs. */
export const STAFF_TABS = [
  ['support', 'Support desk', 'support'],
  ['gate', 'Gate boarding', 'gate'],
  ['manifest', 'Manifests', 'gate'],
  ['bookings', 'Bookings', 'bookings'],
  ['cargo', 'Cargo intake', 'cargo'],
  ['ops', 'Flight ops', 'ops'],
];
export function can(perm, u = state.user) {
  if (!u) return false;
  return u.role === 'admin' || (u.role === 'staff' && (u.permissions || []).includes(perm));
}
/** Staff portal sections this user may open (empty for travellers and for staff with no permissions). */
export const staffTabs = (u = state.user) => STAFF_TABS.filter(([, , p]) => can(p, u));
export const canSeeAdmin = (u = state.user) => u?.role === 'admin';
export const canSeeStaff = (u = state.user) => staffTabs(u).length > 0;
/** Where a user lands after signing in when no other page was asked for. */
export const homeFor = (u = state.user) => (canSeeAdmin(u) ? '/admin' : canSeeStaff(u) ? '/staff' : '/trips');

// ---------- Router ----------
const routes = [];
let cleanup = [];
export function route(pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ re, keys, handler, ...opts });
}
/** Register teardown for timers/streams when the page changes. */
export const onLeave = (fn) => cleanup.push(fn);
export const go = (hash) => { location.hash = hash; };
export function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

export async function navigate() {
  cleanup.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  cleanup = [];
  const { path, query } = parseHash();
  const el = view();
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    if (r.auth && !state.user) {
      go(`/login?next=${encodeURIComponent(path + (location.hash.includes('?') ? `?${location.hash.split('?')[1]}` : ''))}`);
      return;
    }
    // Google sign-ups add their phone and Ghana Card before using signed-in pages.
    if (r.auth && state.user?.needsProfile && path !== '/complete-profile') {
      go(`/complete-profile?next=${encodeURIComponent(path)}`);
      return;
    }
    // Sign-in, register and reset pages are only for signed-out visitors.
    if (r.guestOnly && state.user) {
      location.replace(`#${homeFor()}`);
      return;
    }
    // Pages a user's role or permissions don't cover are never shown.
    if ((r.roles && !r.roles.includes(state.user?.role)) || (r.allow && !r.allow(state.user))) {
      renderNav();
      document.title = 'Restricted · Adinkra Airways';
      el.innerHTML = `<div class="card empty"><h2>Restricted area</h2><p>Your account does not have access to this page.</p><a class="btn" href="#${state.user ? homeFor() : '/'}">Go to your home page</a></div>`;
      return;
    }
    renderNav();
    document.title = r.title ? `${r.title} · Adinkra Airways` : 'Adinkra Airways';
    el.innerHTML = loading();
    try {
      await r.handler(el, params, query);
    } catch (e) {
      el.innerHTML = `<div class="card">${errorBox(e)}<a class="btn" href="#/">Back to home</a></div>`;
    }
    if (!r.keepScroll) window.scrollTo(0, 0);
    return;
  }
  el.innerHTML = `<div class="card empty"><h2>Page not found</h2><a class="btn" href="#/">Go home</a></div>`;
}

// ---------- Navigation bar ----------
export function renderNav() {
  const nav = document.getElementById('nav');
  const u = state.user;
  const { path } = parseHash();
  const link = (href, label) => `<a href="#${href}" class="${path === href || (href !== '/' && path.startsWith(href)) ? 'active' : ''}">${label}</a>`;
  // Signed-out visitors don't see links to pages that need an account (footer too).
  document.querySelectorAll('[data-auth]').forEach((a) => { a.hidden = !u; });
  nav.innerHTML = [
    link('/', 'Book'),
    link('/manage', 'Manage booking'),
    link('/status', 'Flight status'),
    link('/schedule', 'Timetable'),
    link('/cargo', 'Cargo'),
    '<span class="sep"></span>',
    u ? link('/trips', 'My trips') : '',
    u ? link('/support', 'Help') : '',
    canSeeStaff(u) ? link('/staff', 'Staff') : '',
    canSeeAdmin(u) ? link('/admin', 'Admin') : '',
    u ? link('/profile', esc(u.name.split(' ')[u.name.startsWith('Dr.') ? 1 : 0])) : '',
    u ? '<button class="linklike" id="logout">Sign out</button>' : link('/login', 'Sign in'),
    u ? '' : link('/register', 'Register'),
  ].join('');
  nav.querySelector('#logout')?.addEventListener('click', async () => {
    await post('/api/auth/logout');
    state.user = null;
    toast('Signed out');
    go('/');
    renderNav();
  });
}

// ---------- Charts (inline SVG) ----------
export function barChart(data, { keys, colors, labels, height = 240, width = 640, fmt = compactMoney }) {
  const W = width;
  const H = height;
  const pad = { l: 64, r: 10, t: 10, b: 28 };
  const max = Math.max(1, ...data.map((d) => keys.reduce((s, k) => s + (d[k] || 0), 0)));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><g class="grid">`;
  for (let v = 0; v <= top + 1e-9; v += step) {
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  svg += '</g>';
  data.forEach((d, i) => {
    let acc = 0;
    const x = pad.l + i * bw + bw * 0.18;
    const w = bw * 0.64;
    keys.forEach((k, j) => {
      const v = d[k] || 0;
      if (!v) return;
      const y1 = y(acc + v);
      const h = y(acc) - y1;
      svg += `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(0, h - 1)}" fill="${colors[j]}" rx="2"><title>${esc(labels[j])}: ${esc(fmt(v))}</title></rect>`;
      acc += v;
    });
    svg += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
  });
  svg += '</svg>';
  const legend = `<div class="chart-legend">${keys.map((k, j) => `<span><span class="seg-dot" style="background:${colors[j]}"></span>${esc(labels[j])}</span>`).join('')}</div>`;
  return svg + (keys.length > 1 ? legend : '');
}

export function lineChart(points, { height = 200, width = 640, fmt = num, color = 'var(--brand)' }) {
  const W = width;
  const H = height;
  const pad = { l: 52, r: 12, t: 10, b: 28 };
  if (!points.length) return '<div class="empty">No data</div>';
  const max = Math.max(1, ...points.map((p) => p.v));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const x = (i) => pad.l + (W - pad.l - pad.r) * (points.length === 1 ? 0.5 : i / (points.length - 1));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><g class="grid">`;
  for (let v = 0; v <= top + 1e-9; v += step) svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
  svg += '</g>';
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
  const every = Math.ceil(points.length / 8);
  points.forEach((p, i) => {
    svg += `<circle cx="${x(i)}" cy="${y(p.v)}" r="3" fill="${color}"><title>${esc(p.label)}: ${esc(fmt(p.v))}</title></circle>`;
    if (i % every === 0) svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`;
  });
  return `${svg}</svg>`;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export const meter = (v) => `<div class="meter ${v >= 0.85 ? 'warn' : v < 0.5 ? 'bad' : ''}"><span style="width:${Math.min(100, v * 100).toFixed(1)}%"></span></div>`;
