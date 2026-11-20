import {
  state, get, post, esc, money, fmtTime, fmtDate, fmtDur, today, airportOptions, city, segBadge, liveBadge, daysChips,
  $, $$, formData, guard, go, toast, onLeave, loading, errorBox, renderNav, SEG_LABEL,
} from '../core.js';
import { AnimatedBackground } from '../animated-background.js';
import { HERO_BACKGROUND } from '../hero-config.js';
import { watchLive } from '../live.js';

// ================= Home / search =================
export async function home(el) {
  const last = JSON.parse(sessionStorage.getItem('adk_last_search') || 'null') || {};
  // The hero is full-bleed, so main drops its .wrap width on this page only.
  el.classList.add('bleed');
  onLeave(() => el.classList.remove('bleed'));
  // Render the hero straight away (airports are already loaded) so the background
  // image and the search form are not held up by the fares request below.
  el.innerHTML = `
    <section class="hero">
      <div data-abg></div>
      <div class="wrap hero-inner">
        <div class="hero-copy">
          <h1>Where to next, from Accra and beyond?</h1>
          <p>Book domestic, West African and intercontinental flights, pay with Mobile Money or card, and get your e-ticket by email and SMS</p>
        </div>
      <form class="search-card hero-reveal" id="search" autocomplete="off">
        <div class="row between" style="margin-bottom:12px">
          <div class="seg-control" role="radiogroup" aria-label="Trip type">
            <button type="button" data-trip="ROUND_TRIP" class="${last.trip !== 'ONE_WAY' ? 'on' : ''}">Return</button>
            <button type="button" data-trip="ONE_WAY" class="${last.trip === 'ONE_WAY' ? 'on' : ''}">One way</button>
          </div>
          <span class="muted small">Times are GMT</span>
        </div>
        <div class="search-grid">
          <div class="field"><label for="from">From</label><select id="from" name="from" required>${airportOptions(last.from || 'ACC')}</select></div>
          <div class="field"><label for="to">To</label><select id="to" name="to" required></select></div>
          <div class="field"><label for="date">Depart</label><input type="date" id="date" name="date" min="${today()}" value="${esc(last.date && last.date >= today() ? last.date : today(3))}" required></div>
          <div class="field" id="retField"><label for="ret">Return</label><input type="date" id="ret" name="ret" min="${today()}" value="${esc(last.ret && last.ret >= today() ? last.ret : today(10))}"></div>
          <div class="field"><label for="pax">Passengers</label><select id="pax" name="pax">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option ${Number(last.pax) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="field"><label for="tier">Cabin</label><select id="tier" name="tier">
            <option value="ECONOMY">Economy</option><option value="BUSINESS" ${last.tier === 'BUSINESS' ? 'selected' : ''}>Business</option><option value="FIRST" ${last.tier === 'FIRST' ? 'selected' : ''}>First</option></select></div>
          <div class="go"><button class="btn btn-accent btn-lg btn-block" type="submit">Search flights</button></div>
        </div>
      </form>
      </div>
    </section>
    <div class="wrap">
    <section class="quick">
      <a href="#/manage"><div class="card"><h3>Manage booking</h3><p>Change dates, cancel or download your e-ticket with your PNR</p></div></a>
      <a href="#/status"><div class="card"><h3>Flight status</h3><p>Live departures, arrivals, delays and gates</p></div></a>
      <a href="#/cargo"><div class="card"><h3>Ship cargo</h3><p>Instant freight quotes and air waybill tracking</p></div></a>
      <a href="#/support"><div class="card"><h3>Help &amp; baggage</h3><p>Allowances, refunds and talking to our team</p></div></a>
    </section>
    <section class="grid g2" id="deals" style="margin-top:24px">${loading('Loading fares…')}</section>
    </div>`;

  const form = $('#search');
  const reveal = () => form.classList.add('is-in');
  const bg = AnimatedBackground($('[data-abg]', el), { ...HERO_BACKGROUND, scrimTarget: $('.hero-copy', el), onReady: reveal });
  onLeave(() => bg.destroy());
  // Never hold the booking form back for long on a slow image.
  const revealCap = setTimeout(reveal, 400);
  onLeave(() => clearTimeout(revealCap));

  let trip = last.trip || 'ROUND_TRIP';
  const fillTo = () => {
    const from = state.airportMap[form.from.value];
    const dests = state.airports.filter((a) => from?.destinations.includes(a.code));
    const keep = form.to.value || last.to;
    form.to.innerHTML = airportOptions(dests.some((d) => d.code === keep) ? keep : dests[0]?.code, { list: dests });
  };
  const syncTrip = () => {
    $$('[data-trip]', form).forEach((b) => b.classList.toggle('on', b.dataset.trip === trip));
    $('#retField').classList.toggle('hidden', trip === 'ONE_WAY');
  };
  fillTo();
  syncTrip();
  form.from.addEventListener('change', fillTo);
  $$('[data-trip]', form).forEach((b) => b.addEventListener('click', () => { trip = b.dataset.trip; syncTrip(); }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(form);
    if (trip === 'ROUND_TRIP' && d.ret < d.date) return toast('Return date must be after departure', 'bad');
    sessionStorage.setItem('adk_last_search', JSON.stringify({ ...d, trip }));
    const q = new URLSearchParams({ from: d.from, to: d.to, date: d.date, pax: d.pax, tier: d.tier });
    if (trip === 'ROUND_TRIP') q.set('ret', d.ret);
    go(`/search?${q}`);
  });

  const dealsEl = $('#deals', el);
  try {
    const sched = await get('/api/flights/schedule');
    const deals = sched.routes.filter((r) => r.origin === 'ACC').sort((a, b) => a.fromPrice - b.fromPrice);
    dealsEl.innerHTML = ['DOMESTIC', 'REGIONAL', 'INTERNATIONAL'].map((s) => {
      const list = deals.filter((d) => d.segment === s);
      if (!list.length) return '';
      return `<div class="card"><h2>${segBadge(s)} fares from Accra</h2>${list.map((d) => `
        <a class="deal" href="#/search?from=ACC&to=${d.destination}&date=${today(7)}&pax=1&tier=ECONOMY">
          <span><strong>${esc(d.destinationCity)}</strong> <span class="muted small"><span class="mono">${d.destination}</span> · ${fmtDur(d.durationMin)}</span></span>
          <span>from <strong>${money(d.fromPrice, 0)}</strong></span></a>`).join('')}</div>`;
    }).join('');
  } catch (e) {
    dealsEl.innerHTML = `<div class="card">${errorBox(e)}</div>`;
  }
}

// ================= Search results =================
function flightCard(f, { pax, selected, dir }) {
  const fares = f.tiers.map((t) => {
    const on = selected && selected.id === f.id && selected.tier === t.tier;
    const ok = f.bookable && t.available >= pax;
    return `<button class="fare ${on ? 'on' : ''}" data-pick="${dir}" data-id="${f.id}" data-tier="${t.tier}" ${ok ? '' : 'disabled'}>
      <div class="lbl">${esc(t.label)}</div>
      <div class="p">${money(t.fare, 0)}</div>
      <div class="s ${t.available < 6 ? 'low' : ''}">${t.available ? `${t.available} seat${t.available === 1 ? '' : 's'} left` : 'Sold out'}</div></button>`;
  }).join('');
  return `<div class="card flight">
    <div>
      <div class="legline">
        <div><div class="t">${fmtTime(f.departure)}</div><div class="c">${f.origin}</div></div>
        <div class="bar"><span>${fmtDur(f.durationMin)} · non-stop</span></div>
        <div><div class="t">${fmtTime(f.arrival)}</div><div class="c">${f.destination}${f.arrival.slice(0, 10) !== f.departure.slice(0, 10) ? ' <b>+1</b>' : ''}</div></div>
      </div>
      <div class="row small muted" style="margin-top:8px"><b class="mono">${esc(f.flightNo)}</b> · ${esc(f.aircraft)} ${f.live.code !== 'SCHEDULED' ? liveBadge(f.live) : ''}</div>
    </div>
    <div class="fares">${fares}</div></div>`;
}

export async function search(el, _p, q) {
  const pax = Number(q.pax) || 1;
  const params = new URLSearchParams({ from: q.from, to: q.to, date: q.date, pax });
  if (q.ret) params.set('returnDate', q.ret);
  const data = await get(`/api/flights/search?${params}`);
  const sel = { out: null, ret: null, tier: q.tier || 'ECONOMY' };
  const prev = JSON.parse(sessionStorage.getItem('adk_draft') || 'null');
  if (prev && prev.query === location.hash) {
    sel.out = prev.outbound ? { id: prev.outbound.id, tier: prev.tier } : null;
    sel.ret = prev.inbound ? { id: prev.inbound.id, tier: prev.tier } : null;
  }

  const section = (title, list, dir, date, suggestions) => `
    <h2 style="margin-top:24px">${title} <span class="muted small">${fmtDate(`${date}T12:00:00Z`)}</span></h2>
    ${list.length ? `<div class="stack">${list.map((f) => flightCard(f, { pax, selected: sel[dir], dir })).join('')}</div>` : `
      <div class="card empty"><p>No flights on this date</p>
      ${suggestions?.length ? `<p class="small">Try a nearby date:</p><div class="chips" style="justify-content:center">${suggestions.map((d) => `<button class="chip" data-date="${dir}" data-v="${d}">${fmtDate(`${d}T12:00:00Z`)}</button>`).join('')}</div>` : ''}</div>`}`;

  const render = () => {
    const out = data.outbound.find((f) => f.id === sel.out?.id);
    const ret = data.inbound.find((f) => f.id === sel.ret?.id);
    const fareOf = (f) => f?.tiers.find((t) => t.tier === sel.tier);
    const per = [out, ret].filter(Boolean).reduce((s, f) => s + fareOf(f).fare + fareOf(f).taxes, 0);
    const ready = out && (!q.ret || ret);
    el.innerHTML = `
      <div class="page-head"><div><h1>${esc(city(q.from))} → ${esc(city(q.to))}</h1>
        <p>${q.ret ? 'Return' : 'One way'} · ${pax} passenger${pax > 1 ? 's' : ''} · ${data.segment ? SEG_LABEL[data.segment] : ''}</p></div>
        <a class="btn" href="#/">Modify search</a></div>
      ${data.noRoute ? `<div class="card empty">${esc(data.message)}</div>` : `
      <div class="split"><div>
        ${section('Choose your outbound flight', data.outbound, 'out', q.date, data.suggestions.outbound)}
        ${q.ret ? section('Choose your return flight', data.inbound, 'ret', q.ret, data.suggestions.inbound) : ''}
      </div>
      <aside class="card sticky"><h3>Your trip</h3>
        ${[['Outbound', out], ['Return', ret]].filter(([, f], i) => i === 0 || q.ret).map(([label, f]) => `
          <div class="sum-line"><span>${label}</span><span>${f ? `<span class="mono">${esc(f.flightNo)}</span> · ${fmtDate(f.departure)} ${fmtTime(f.departure)}` : '<span class="muted">Not selected</span>'}</span></div>`).join('')}
        <div class="sum-line"><span>Cabin</span><span>${esc(sel.tier[0] + sel.tier.slice(1).toLowerCase())}</span></div>
        <div class="sum-line"><span>Fare + taxes × ${pax}</span><span>${money(per)} each</span></div>
        <div class="sum-line total"><span>Total</span><span>${money(per * pax)}</span></div>
        ${data.baggage?.[sel.tier] ? `<p class="small muted">Baggage: ${esc(data.baggage[sel.tier].checked)} checked + ${esc(data.baggage[sel.tier].cabin)} cabin per person.</p>` : ''}
        <button class="btn btn-accent btn-block btn-lg" id="continue" ${ready ? '' : 'disabled'}>Proceed to book</button>
        ${!state.user ? '<p class="small muted" style="margin-top:8px">You will be asked to sign in or register</p>' : ''}
      </aside></div>`}`;

    $$('[data-pick]', el).forEach((b) => b.addEventListener('click', () => {
      const dir = b.dataset.pick;
      sel.tier = b.dataset.tier;
      sel[dir] = { id: Number(b.dataset.id), tier: sel.tier };
      const other = dir === 'out' ? 'ret' : 'out';
      const list = other === 'out' ? data.outbound : data.inbound;
      const of = list.find((f) => f.id === sel[other]?.id);
      if (of && !(of.tiers.find((t) => t.tier === sel.tier)?.available >= pax)) sel[other] = null;
      render();
    }));
    $$('[data-date]', el).forEach((b) => b.addEventListener('click', () => {
      const nq = { ...q };
      if (b.dataset.date === 'out') nq.date = b.dataset.v; else nq.ret = b.dataset.v;
      if (nq.ret && nq.ret < nq.date) nq.ret = nq.date;
      go(`/search?${new URLSearchParams(nq)}`);
    }));
    $('#continue', el)?.addEventListener('click', () => {
      sessionStorage.setItem('adk_draft', JSON.stringify({
        query: location.hash, outbound: out, inbound: ret || null, tier: sel.tier, pax, segment: data.segment,
      }));
      go('/book');
    });
  };
  render();
}

// ================= Flight status =================
export async function status(el, _p, q) {
  el.innerHTML = `
    <div class="page-head"><div><h1>Live flight status</h1><p id="liveNote" aria-live="polite">Updated automatically every 30 seconds</p></div></div>
    <div class="grid g2">
      <form class="card" id="byNo"><h3>By flight number</h3>
        <div class="form-grid"><div class="field"><label>Flight number</label><input name="flightNo" placeholder="e.g. AD201" value="${esc(q.flightNo || '')}" required></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${esc(q.date || today())}"></div></div>
        <button class="btn btn-primary">Track flight</button></form>
      <form class="card" id="byRoute"><h3>By route</h3>
        <div class="form-grid"><div class="field"><label>From</label><select name="from">${airportOptions(q.from || 'LOS')}</select></div>
        <div class="field"><label>To</label><select name="to">${airportOptions(q.to || 'ACC')}</select></div>
        <div class="field"><label>Date</label><input type="date" name="date" value="${esc(q.date || today())}"></div></div>
        <button class="btn btn-primary">Show flights</button></form>
    </div>
    <div id="result" class="stack" style="margin-top:16px"></div>
    <div class="card" style="margin-top:16px">
      <div class="row between"><h2 style="margin:0">Kotoka International (ACC)</h2>
        <div class="seg-control"><button data-board="departures" class="on">Departures</button><button data-board="arrivals">Arrivals</button></div></div>
      <div id="board" style="margin-top:12px">${loading()}</div>
    </div>`;
  let boardType = 'departures';
  const result = $('#result');

  const statusCard = (f) => `
    <div class="card">
      <div class="row between"><div><h3 style="margin:0"><span class="mono">${esc(f.flightNo)}</span> · ${esc(f.originCity)} → ${esc(f.destinationCity)}</h3>
        <div class="muted small">${fmtDate(f.departure)} · ${esc(f.aircraft)}</div></div>${liveBadge(f.live)}</div>
      <div class="progress" aria-label="Flight progress"><span style="width:${(f.live.progress * 100).toFixed(0)}%"></span></div>
      <div class="grid g4 small" style="margin-top:12px">
        <div><div class="muted">Scheduled departure</div><b>${fmtTime(f.live.scheduledDeparture)}</b></div>
        <div><div class="muted">${f.live.delayMin ? 'Estimated departure' : 'Departure'}</div><b class="${f.live.delayMin ? 'warn' : ''}">${fmtTime(f.live.estimatedDeparture)}</b></div>
        <div><div class="muted">Estimated arrival</div><b>${fmtTime(f.live.estimatedArrival)}</b></div>
        <div><div class="muted">Gate / terminal</div><b>${esc(f.live.gate || '—')}${f.live.terminal ? ` · ${esc(f.live.terminal)}` : ''}</b></div>
      </div>
      ${f.live.remarks ? `<p class="note warn" style="margin-top:12px">${esc(f.live.remarks)}</p>` : ''}
    </div>`;

  // Neon Realtime: refresh the moment flight operations change a delay, gate or status.
  // The 30-second refresh below stays as the fallback whenever live updates are unavailable.
  const live = { board: 'off', status: 'off' };
  const showLive = () => {
    const on = live.board === 'live' && (!lastQuery || live.status === 'live');
    $('#liveNote').innerHTML = on
      ? '<span class="live-dot" aria-hidden="true"></span> Live: changes appear the moment our operations team posts them'
      : 'Updated automatically every 30 seconds';
  };
  let stopStatus = null;
  let stopBoard = null;

  let lastQuery = null;
  const run = async (qs, { refresh = false } = {}) => {
    if (!refresh) {
      lastQuery = qs;
      stopStatus?.();
      live.status = 'off';
      stopStatus = watchLive(`/api/live/status?${qs}`, () => run(qs, { refresh: true }), (s) => { live.status = s; showLive(); });
    }
    try {
      const d = await get(`/api/flights/status?${qs}`);
      result.innerHTML = d.flights.length ? d.flights.map(statusCard).join('') : '<div class="card empty">No flights found for that search and date.</div>';
    } catch (e) { result.innerHTML = errorBox(e); }
  };
  const loadBoard = async () => {
    try {
      const d = await get(`/api/flights/board?airport=ACC&type=${boardType}`);
      const arr = boardType === 'arrivals';
      $('#board').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Flight</th><th>${arr ? 'From' : 'To'}</th><th>Gate</th><th>Status</th><th>Estimated</th></tr></thead><tbody>
        ${d.flights.map((f) => `<tr><td class="mono">${fmtTime(arr ? f.arrival : f.departure)}</td><td class="mono">${esc(f.flightNo)}</td>
          <td>${esc(arr ? f.originCity : f.destinationCity)}</td><td>${esc(f.live.gate || '')}</td><td>${liveBadge(f.live)}</td>
          <td class="mono">${fmtTime(arr ? f.live.estimatedArrival : f.live.estimatedDeparture)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No flights in this window</td></tr>'}
        </tbody></table></div>`;
    } catch (e) { $('#board').innerHTML = errorBox(e); }
  };
  $('#byNo').addEventListener('submit', (e) => { e.preventDefault(); run(new URLSearchParams(formData(e.target))); });
  $('#byRoute').addEventListener('submit', (e) => { e.preventDefault(); run(new URLSearchParams(formData(e.target))); });
  const watchBoard = () => {
    stopBoard?.();
    live.board = 'off';
    stopBoard = watchLive(`/api/live/board?airport=ACC&type=${boardType}`, loadBoard, (s) => { live.board = s; showLive(); });
  };
  $$('[data-board]').forEach((b) => b.addEventListener('click', () => {
    boardType = b.dataset.board;
    $$('[data-board]').forEach((x) => x.classList.toggle('on', x === b));
    loadBoard();
    watchBoard();
  }));
  if (q.flightNo) run(new URLSearchParams({ flightNo: q.flightNo, date: q.date || today() }));
  loadBoard();
  watchBoard();
  // Fallback polling, skipped while the live subscriptions are connected.
  const timer = setInterval(() => {
    if (live.board !== 'live') loadBoard();
    if (lastQuery && live.status !== 'live') run(lastQuery, { refresh: true });
  }, 30000);
  onLeave(() => { clearInterval(timer); stopBoard?.(); stopStatus?.(); });
}

// ================= Timetable =================
export async function schedule(el, _p, q) {
  const seg = q.segment || '';
  const d = await get(`/api/flights/schedule${seg ? `?segment=${seg}` : ''}`);
  el.innerHTML = `
    <div class="page-head"><div><h1>Flight timetable</h1><p>Scheduled services across our domestic, regional and international network</p></div>
      <div class="seg-control">${[['', 'All'], ['DOMESTIC', 'Domestic'], ['REGIONAL', 'Regional'], ['INTERNATIONAL', 'International']].map(([v, l]) => `<button data-seg="${v}" class="${seg === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="card table-wrap"><table><thead><tr><th>Flight</th><th>Route</th><th>Type</th><th>Days</th><th>Departs</th><th>Duration</th><th>Aircraft</th><th class="num">From</th><th></th></tr></thead><tbody>
    ${d.routes.map((r) => `<tr><td class="mono"><b>${esc(r.flightNo)}</b></td><td>${esc(r.originCity)} → ${esc(r.destinationCity)}<div class="muted small mono">${r.origin}–${r.destination}</div></td>
      <td>${segBadge(r.segment)}</td><td>${daysChips(r.days)}</td><td class="mono">${esc(r.depTime)}</td><td>${fmtDur(r.durationMin)}</td><td class="small">${esc(r.aircraft)}</td>
      <td class="num">${money(r.fromPrice, 0)}</td>
      <td>${r.nextDeparture ? `<a class="btn btn-sm" href="#/search?from=${r.origin}&to=${r.destination}&date=${r.nextDeparture.slice(0, 10)}&pax=1&tier=ECONOMY">Book</a>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  $$('[data-seg]', el).forEach((b) => b.addEventListener('click', () => go(`/schedule${b.dataset.seg ? `?segment=${b.dataset.seg}` : ''}`)));
}

// ================= Auth =================
export function login(el, _p, q) {
  el.innerHTML = `
    <div style="max-width:420px;margin:24px auto">
      <form class="card" id="f"><h1>Sign in</h1><p class="muted">Travellers, staff and administrators all sign in here</p>
        <div id="err"></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
          <div class="hint"><a href="#/forgot">Forgot your password?</a></div></div>
        <button class="btn btn-primary btn-block btn-lg">Sign in</button>
        <p class="small muted" style="margin-top:12px">New to Adinkra Airways? <a href="#/register${q.next ? `?next=${encodeURIComponent(q.next)}` : ''}">Create an account</a></p>
      </form></div>`;
  const f = $('#f');
  f.addEventListener('submit', guard(f.querySelector('button'), async () => {
    const { user } = await post('/api/auth/login', formData(f));
    state.user = user;
    renderNav();
    toast(`Welcome back, ${user.name.split(' ')[0] === 'Dr.' ? user.name : user.name.split(' ')[0]}`, 'ok');
    go(q.next || (user.role === 'admin' ? '/admin' : user.role === 'staff' ? '/staff' : '/trips'));
  }, $('#err')));
}

// Password reset with a 6-digit code emailed by Neon Auth.
export function forgot(el, _p, q) {
  el.innerHTML = `
    <div style="max-width:420px;margin:24px auto">
      <form class="card" id="ask"><h1>Reset your password</h1>
        <p class="muted">Enter the email you registered with. We'll email you a 6-digit code.</p>
        <div id="err1"></div>
        <div class="field"><label for="femail">Email</label><input id="femail" name="email" type="email" autocomplete="username" value="${esc(q.email || '')}" required></div>
        <button class="btn btn-primary btn-block btn-lg">Email me a code</button>
        <p class="small muted" style="margin-top:12px"><a href="#/login">Back to sign in</a></p>
      </form>
      <form class="card" id="reset" hidden><h1>Choose a new password</h1>
        <p class="muted" id="sentTo"></p>
        <div id="err2"></div>
        <div class="field"><label for="code">6-digit code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required></div>
        <div class="field"><label for="npw">New password</label><input id="npw" name="password" type="password" autocomplete="new-password" minlength="8" required>
          <div class="hint">At least 8 characters with letters and numbers</div></div>
        <button class="btn btn-primary btn-block btn-lg">Save new password</button>
        <p class="small muted" style="margin-top:12px">No email after a few minutes? Check spam, or <a href="#" id="again">send another code</a>.</p>
      </form></div>`;
  const ask = $('#ask');
  const reset = $('#reset');
  let email = '';
  const send = async () => {
    const r = await post('/api/auth/forgot-password', { email });
    $('#sentTo').textContent = r.message;
  };
  ask.addEventListener('submit', guard(ask.querySelector('button'), async () => {
    email = formData(ask).email.trim();
    await send();
    ask.hidden = true;
    reset.hidden = false;
    $('#code').focus();
  }, $('#err1')));
  $('#again').addEventListener('click', (e) => { e.preventDefault(); send().then(() => toast('New code sent', 'ok')).catch((err) => toast(err.message, 'bad')); });
  reset.addEventListener('submit', guard(reset.querySelector('button'), async () => {
    const r = await post('/api/auth/reset-password', { email, ...formData(reset) });
    toast(r.message, 'ok');
    go(`/login`);
  }, $('#err2')));
}

export function register(el, _p, q) {
  el.innerHTML = `
    <div style="max-width:520px;margin:24px auto">
      <form class="card" id="f"><h1>Create your account</h1><p class="muted">Book faster, track trips and earn Adinkra Miles</p>
        <div id="err"></div>
        <div class="field"><label>Full name</label><input name="name" autocomplete="name" required></div>
        <div class="form-grid">
          <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label>Phone</label><input name="phone" type="tel" autocomplete="tel" placeholder="024 123 4567" required></div>
        </div>
        <div class="field"><label>Ghana Card number</label><input name="nationalId" placeholder="GHA-123456789-0" required pattern="[Gg][Hh][Aa]-\\d{9}-\\d">
          <div class="hint">Stored encrypted. Used to verify your identity at check-in.</div></div>
        <div class="field"><label>Password</label><input name="password" type="password" autocomplete="new-password" minlength="8" required>
          <div class="hint">At least 8 characters with letters and numbers</div></div>
        <button class="btn btn-primary btn-block btn-lg">Register</button>
        <p class="small muted" style="margin-top:12px">Already registered? <a href="#/login${q.next ? `?next=${encodeURIComponent(q.next)}` : ''}">Sign in</a></p>
      </form></div>`;
  const f = $('#f');
  f.addEventListener('submit', guard(f.querySelector('button'), async () => {
    const { user } = await post('/api/auth/register', formData(f));
    state.user = user;
    renderNav();
    toast(`Akwaaba, ${user.name.split(' ')[0]}! Your account is ready.`, 'ok');
    go(q.next || '/trips');
  }, $('#err')));
}
