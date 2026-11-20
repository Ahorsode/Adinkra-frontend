import {
  state, get, post, put, esc, money, compactMoney, num, pct, fmtDate, fmtDateTime, fmtDur, ago, segBadge, daysChips, DAYS,
  barChart, lineChart, meter, $, $$, formData, guard, go, toast, modal, closeModal, errorBox, loading, airportOptions, SEG_LABEL,
} from '../core.js';

const TABS = [['analytics', 'Revenue'], ['occupancy', 'Seat occupancy'], ['routes', 'Routes & schedules'], ['users', 'Users & access'], ['security', 'Security & data']];
const SEG_COLORS = ['var(--seg-dom)', 'var(--seg-reg)', 'var(--seg-int)'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function admin(el, { tab = 'analytics' }, q) {
  el.innerHTML = `
    <div class="page-head"><div><h1>Administration</h1><p>Management dashboard · ${esc(state.user.name)}</p></div><a class="btn" href="#/staff">Staff portal</a></div>
    <nav class="tabs">${TABS.map(([k, l]) => `<a href="#/admin/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div id="pane">${loading()}</div>`;
  const pane = $('#pane');
  const fn = { analytics, occupancy, routes, users, security }[tab];
  if (!fn) { pane.innerHTML = errorBox('Unknown section'); return; }
  try { await fn(pane, q); } catch (e) { pane.innerHTML = errorBox(e); }
}

const filterBar = (q, base, extra = '') => `
  <div class="row between" style="margin-bottom:16px">
    <div class="seg-control">${[['', 'All segments'], ['DOMESTIC', 'Domestic'], ['REGIONAL', 'Regional'], ['INTERNATIONAL', 'International']].map(([v, l]) => `<button data-f="segment" data-v="${v}" class="${(q.segment || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${extra}</div>`;
function bindFilters(pane, q, base) {
  $$('[data-f]', pane).forEach((b) => b.addEventListener('click', () => {
    const nq = { ...q, [b.dataset.f]: b.dataset.v };
    Object.keys(nq).forEach((k) => !nq[k] && delete nq[k]);
    go(`${base}?${new URLSearchParams(nq)}`);
  }));
}

// ---------------- Revenue analytics ----------------
async function analytics(pane, q) {
  const days = q.days || '90';
  const d = await get(`/api/admin/analytics?days=${days}${q.segment ? `&segment=${q.segment}` : ''}`);
  const k = d.kpis;
  const segs = d.segment ? [d.segment] : ['DOMESTIC', 'REGIONAL', 'INTERNATIONAL'];
  const monthly = d.monthly.map((m) => ({ ...m, label: MONTHS[Number(m.month.slice(5)) - 1] }));
  const totalMethods = d.methods.reduce((s, m) => s + m.amount, 0) || 1;
  pane.innerHTML = `
    ${filterBar(q, '/admin/analytics', `<div class="seg-control">${[['30', '30 days'], ['90', '90 days'], ['180', '6 months'], ['365', '12 months']].map(([v, l]) => `<button data-f="days" data-v="${v}" class="${days === v ? 'on' : ''}">${l}</button>`).join('')}</div>`)}
    <div class="grid g4">
      <div class="kpi"><small>Net ticket revenue</small><b>${compactMoney(k.netRevenue)}</b><span>${compactMoney(k.grossRevenue)} gross − ${compactMoney(k.refunds)} refunds</span></div>
      <div class="kpi"><small>Tickets sold</small><b>${num(k.ticketsSold)}</b><span>${num(k.bookings)} bookings · ${pct(k.bookings ? k.cancelled / k.bookings : 0, 1)} cancelled</span></div>
      <div class="kpi"><small>Average ticket</small><b>${compactMoney(k.avgTicket)}</b><span>incl. taxes</span></div>
      <div class="kpi"><small>Passengers flown</small><b>${num(k.passengersFlown)}</b><span>+ cargo ${compactMoney(k.cargoRevenue)}</span></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>Monthly revenue by segment</h3><span class="small muted">Payments received per calendar month, current month to date</span></div>
      ${barChart(monthly, { keys: segs, colors: segs.map((s) => SEG_COLORS[['DOMESTIC', 'REGIONAL', 'INTERNATIONAL'].indexOf(s)]), labels: segs.map((s) => SEG_LABEL[s]), width: 1100, height: 300 })}
    </div>
    <div class="dash">
      <div class="card"><h3>Top routes by revenue</h3><div class="table-wrap"><table><thead><tr><th>Route</th><th>Segment</th><th class="num">Bookings</th><th class="num">Revenue</th></tr></thead><tbody>
        ${d.topRoutes.map((r) => `<tr><td>${esc(r.label)}</td><td>${segBadge(r.segment)}</td><td class="num">${num(r.bookings)}</td><td class="num">${compactMoney(r.revenue)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="stack">
      <div class="card"><div class="card-head"><h3>Weekly ticket sales</h3><span class="small muted">By booking date</span></div>
        ${lineChart(d.weekly.map((w) => ({ label: fmtDate(`${w.start}T12:00:00Z`).replace(/^\w+ /, ''), v: w.tickets })), { fmt: num, width: 400, height: 200 })}</div>
      <div class="card"><h3>Payment channels</h3>
        ${d.methods.map((m) => `<div style="margin-bottom:12px"><div class="sum-line small"><span>${esc(m.method === 'MOMO' ? `Mobile Money · ${m.provider}` : `Card · ${m.provider}`)}</span><span>${compactMoney(m.amount)} · ${pct(m.amount / totalMethods)}</span></div>
          <div class="meter"><span style="width:${((m.amount / totalMethods) * 100).toFixed(1)}%"></span></div></div>`).join('')}
        <p class="small muted">${pct(d.methods.filter((m) => m.method === 'MOMO').reduce((s, m) => s + m.amount, 0) / totalMethods)} of revenue paid via Mobile Money</p></div>
      </div>
    </div>`;
  bindFilters(pane, q, '/admin/analytics');
}

// ---------------- Occupancy ----------------
async function occupancy(pane, q) {
  const win = q.window || 'past30';
  const [d, meta] = await Promise.all([get(`/api/admin/occupancy?window=${win}${q.segment ? `&segment=${q.segment}` : ''}`), get('/api/admin/meta')]);
  pane.innerHTML = `
    ${filterBar(q, '/admin/occupancy', `<div class="seg-control">${[['past30', 'Last 30 days (flown)'], ['next30', 'Next 30 days (booked)']].map(([v, l]) => `<button data-f="window" data-v="${v}" class="${win === v ? 'on' : ''}">${l}</button>`).join('')}</div>`)}
    <div class="grid g4">
      <div class="kpi"><small>Overall seat factor</small><b>${pct(d.overall, 1)}</b>${meter(d.overall)}</div>
      ${d.bySegment.map((s) => `<div class="kpi"><small>${segBadge(s.segment)}</small><b>${pct(s.load, 1)}</b><span>${num(s.sold)} / ${num(s.seats)} seats</span></div>`).join('')}
    </div>
    <div class="card table-wrap" style="margin-top:16px"><table><thead><tr><th>Route</th><th>Segment</th><th class="num">Flights</th><th class="num">Seats sold</th><th>Seat factor</th><th class="num">Range</th><th>Recommendation</th><th>Aircraft (future flights)</th></tr></thead><tbody>
      ${d.routes.map((r) => `<tr><td><b class="mono">${esc(r.flightNo)}</b> ${esc(r.label)}</td><td>${segBadge(r.segment)}</td><td class="num">${r.flights}</td><td class="num">${num(r.sold)} / ${num(r.seats)}</td>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap"><b>${pct(r.load)}</b>${meter(r.load)}</div></td><td class="num small">${pct(r.minLoad)}–${pct(r.maxLoad)}</td>
        <td class="small">${esc(r.advice)}</td>
        <td><div class="row" style="flex-wrap:nowrap;gap:8px"><select data-ac="${r.routeId}" style="width:auto">${meta.aircraft.map((a) => `<option ${a.name === r.aircraft ? 'selected' : ''} value="${esc(a.name)}">${esc(a.name)} (${a.seats.total})</option>`).join('')}</select>
          <button class="btn btn-sm" data-apply="${r.routeId}">Apply</button></div></td></tr>`).join('') || '<tr><td colspan="8" class="empty">No flights in this window</td></tr>'}
    </tbody></table></div>
    <p class="small muted">Changing aircraft updates seat capacity and cargo limits on future flights; flights whose booked seats don't exist on the new layout are skipped</p>`;
  bindFilters(pane, q, '/admin/occupancy');
  $$('[data-apply]', pane).forEach((b) => b.addEventListener('click', guard(b, async () => {
    const r = await put(`/api/admin/routes/${b.dataset.apply}`, { aircraft: $(`[data-ac="${b.dataset.apply}"]`, pane).value });
    toast(`Updated ${r.updatedFlights} flights${r.skippedFlights ? `, ${r.skippedFlights} skipped (seat conflicts)` : ''}`, 'ok');
    occupancy(pane, q);
  })));
}

// ---------------- Routes ----------------
async function routes(pane) {
  const [{ routes: list }, meta] = await Promise.all([get('/api/admin/routes'), get('/api/admin/meta')]);
  state.airports.forEach((a) => { if (!meta.airports.find((x) => x.code === a.code)) meta.airports.push(a); });
  const used = new Set(list.map((r) => r.flightNo));
  let n = 240;
  while (used.has(`AD${n}`) || used.has(`AD${n + 1}`)) n += 10;
  pane.innerHTML = `
    <div class="row between" style="margin-bottom:16px"><span class="muted">${list.length} routes · ${list.filter((r) => r.active).length} published</span><button class="btn btn-primary" id="newRoute">Add new route</button></div>
    <div class="card table-wrap"><table><thead><tr><th>Flight</th><th>Route</th><th>Segment</th><th>Schedule</th><th>Aircraft</th><th class="num">Base fare</th><th class="num">Upcoming</th><th>Live</th><th></th></tr></thead><tbody>
    ${list.map((r) => `<tr><td class="mono"><b>${esc(r.flightNo)}</b></td><td>${esc(r.originCity)} → ${esc(r.destinationCity)}</td><td>${segBadge(r.segment)}</td>
      <td>${daysChips(r.days)} <span class="mono small">${esc(r.depTime)}</span> · ${fmtDur(r.durationMin)}</td><td class="small">${esc(r.aircraft)}</td>
      <td class="num"><input type="number" data-price="${r.id}" value="${r.basePrice}" min="50" style="width:100px;text-align:right"></td><td class="num">${r.upcoming}</td>
      <td><label class="check"><input type="checkbox" data-active="${r.id}" ${r.active ? 'checked' : ''}> ${r.active ? 'Published' : 'Hidden'}</label></td>
      <td class="nowrap"><button class="btn btn-sm" data-save="${r.id}">Save</button> <button class="btn btn-sm btn-ghost" data-extend="${r.id}">+60 days</button></td></tr>`).join('')}
    </tbody></table></div>`;
  $$('[data-save]', pane).forEach((b) => b.addEventListener('click', guard(b, async () => {
    const id = b.dataset.save;
    const r = await put(`/api/admin/routes/${id}`, { basePrice: Number($(`[data-price="${id}"]`, pane).value), active: $(`[data-active="${id}"]`, pane).checked });
    toast(`${r.route.flightNo} saved · ${r.updatedFlights} future flights repriced`, 'ok');
    routes(pane);
  })));
  $$('[data-extend]', pane).forEach((b) => b.addEventListener('click', guard(b, async () => {
    const r = await post(`/api/admin/routes/${b.dataset.extend}/extend`, { days: 60 });
    toast(`${r.added} flights added to the schedule`, 'ok');
    routes(pane);
  })));
  $('#newRoute').addEventListener('click', () => {
    const d = modal({
      title: 'Configure new route',
      body: `<form id="rf"><div id="rerr"></div>
        <div class="form-grid">
          <div class="field"><label>Origin</label><select name="origin">${airportOptions('ACC', { list: meta.airports })}</select></div>
          <div class="field"><label>Destination</label><select name="destination">${airportOptions('ABJ', { list: meta.airports })}</select></div>
        </div>
        <p class="small" id="segInfo"></p>
        <div class="form-grid">
          <div class="field"><label>Flight number</label><input name="flightNo" value="AD${n}" required></div>
          <div class="field"><label>Departure (GMT)</label><input name="depTime" type="time" value="08:45" required></div>
          <div class="field"><label>Block time (minutes)</label><input name="durationMin" type="number" value="65" min="20" max="960" required></div>
          <div class="field"><label>Base Economy fare (GHS)</label><input name="basePrice" type="number" value="1450" min="50" required></div>
          <div class="field"><label>Aircraft</label><select name="aircraft">${meta.aircraft.map((a) => `<option value="${esc(a.name)}" ${a.name === 'Boeing 737-800' ? 'selected' : ''}>${esc(a.name)} – ${a.seats.total} seats</option>`).join('')}</select></div>
          <div class="field"><label>Generate schedule for</label><select name="generateDays"><option value="30">30 days</option><option value="60" selected>60 days</option><option value="90">90 days</option><option value="120">120 days</option></select></div>
        </div>
        <div class="field"><label>Operating days</label><div class="row">${DAYS.map((x, i) => `<label class="check"><input type="checkbox" name="d${i + 1}" ${[0, 2, 4, 5].includes(i) ? 'checked' : ''}> ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</label>`).join('')}</div></div>
        <hr><label class="check"><input type="checkbox" name="withReturn" checked> Also create the return flight</label>
        <div class="form-grid" id="retFields" style="margin-top:8px">
          <div class="field"><label>Return flight number</label><input name="retFlightNo" value="AD${n + 1}"></div>
          <div class="field"><label>Return departure (GMT)</label><input name="retDepTime" type="time" value="11:30"></div>
        </div>
        <label class="check"><input type="checkbox" name="publish" checked> Publish live immediately (bookable on the public site)</label>
      </form>`,
      actions: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="rgo">Create & publish</button>',
    });
    const f = $('#rf', d);
    const seg = () => {
      const a = meta.airports.find((x) => x.code === f.origin.value);
      const b = meta.airports.find((x) => x.code === f.destination.value);
      const s = a.zone === 'GH' && b.zone === 'GH' ? 'DOMESTIC' : a.zone !== 'INTL' && b.zone !== 'INTL' ? 'REGIONAL' : 'INTERNATIONAL';
      $('#segInfo', d).innerHTML = `Segment: ${segBadge(s)} · ${esc(a.city)} → ${esc(b.city)}`;
    };
    f.origin.addEventListener('change', seg);
    f.destination.addEventListener('change', seg);
    seg();
    f.withReturn.addEventListener('change', () => $('#retFields', d).classList.toggle('hidden', !f.withReturn.checked));
    $('#rgo', d).addEventListener('click', guard($('#rgo', d), async () => {
      const v = formData(f);
      const days = [1, 2, 3, 4, 5, 6, 7].filter((i) => f[`d${i}`].checked).join('');
      const r = await post('/api/admin/routes', {
        origin: v.origin, destination: v.destination, flightNo: v.flightNo, depTime: v.depTime, durationMin: Number(v.durationMin),
        basePrice: Number(v.basePrice), aircraft: v.aircraft, generateDays: Number(v.generateDays), days, publish: f.publish.checked,
        returnFlight: f.withReturn.checked ? { flightNo: v.retFlightNo, depTime: v.retDepTime } : null,
      });
      closeModal();
      toast(r.created.map((c) => `${c.route.flightNo}: ${c.flights} flights`).join(' · '), 'ok');
      routes(pane);
    }, $('#rerr', d)));
  });
}

// ---------------- Users ----------------
async function users(pane, q) {
  const [d, meta] = await Promise.all([get(`/api/admin/users?${new URLSearchParams({ role: q.role || '', q: q.q || '' })}`), get('/api/admin/meta')]);
  const perms = Object.entries(meta.permissions);
  pane.innerHTML = `
    <div class="row between" style="margin-bottom:16px">
      <div class="seg-control">${[['', 'All'], ['admin', `Admins (${d.counts.admin || 0})`], ['staff', `Staff (${d.counts.staff || 0})`], ['traveler', `Travellers (${d.counts.traveler || 0})`]].map(([v, l]) => `<button data-f="role" data-v="${v}" class="${(q.role || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn btn-primary" id="newUser">Create staff profile</button></div>
    <div class="card table-wrap"><table><thead><tr><th>Name</th><th>Role</th>${perms.map(([, l]) => `<th class="small" title="${esc(l)}">${esc(l.split(' ')[0])}</th>`).join('')}<th>Active</th><th>Last login</th><th></th></tr></thead><tbody>
    ${d.users.map((u) => `<tr data-u="${u.id}"><td><b>${esc(u.name)}</b><div class="small muted">${esc(u.email)}</div></td>
      <td><select name="role" style="width:auto">${['traveler', 'staff', 'admin'].map((r) => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      ${perms.map(([p]) => `<td><input type="checkbox" name="perm" value="${p}" ${u.permissions.includes(p) ? 'checked' : ''} ${u.role !== 'staff' ? 'disabled' : ''} aria-label="${esc(p)}"></td>`).join('')}
      <td><input type="checkbox" name="active" ${u.active ? 'checked' : ''}></td><td class="small">${u.lastLogin ? ago(u.lastLogin) : '—'}</td>
      <td><button class="btn btn-sm" data-save="${u.id}">Save</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="small muted">Admins hold every permission. Staff only see the portal sections their permissions allow. Every change is recorded in the audit log.</p>`;
  bindFilters(pane, q, '/admin/users');
  $$('[data-u] select[name=role]', pane).forEach((s) => s.addEventListener('change', () => {
    $$('input[name=perm]', s.closest('tr')).forEach((c) => { c.disabled = s.value !== 'staff'; });
  }));
  $$('[data-save]', pane).forEach((b) => b.addEventListener('click', guard(b, async () => {
    const row = b.closest('tr');
    await put(`/api/admin/users/${b.dataset.save}`, {
      role: $('select[name=role]', row).value, active: $('input[name=active]', row).checked,
      permissions: $$('input[name=perm]:checked', row).map((c) => c.value),
    });
    toast('Access updated', 'ok');
    users(pane, q);
  })));
  $('#newUser').addEventListener('click', () => {
    const d2 = modal({
      title: 'Create staff profile',
      body: `<form id="uf"><div id="uerr"></div>
        <div class="form-grid"><div class="field"><label>Full name</label><input name="name" required></div><div class="field"><label>Work email</label><input name="email" type="email" required></div>
        <div class="field"><label>Phone</label><input name="phone"></div><div class="field"><label>Role</label><select name="role"><option value="staff">Staff</option><option value="admin">Administrator</option></select></div></div>
        <div class="field"><label>Temporary password</label><input name="password" value="Welcome@${new Date().getFullYear()}" required><div class="hint">Share securely; the user should change it on first sign-in</div></div>
        <div class="field"><label>Permissions</label>${perms.map(([p, l]) => `<label class="check" style="margin-bottom:8px"><input type="checkbox" name="perm" value="${p}" ${p === 'gate' ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></form>`,
      actions: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="ugo">Create profile</button>',
    });
    $('#ugo', d2).addEventListener('click', guard($('#ugo', d2), async () => {
      const f = $('#uf', d2);
      const r = await post('/api/admin/users', { ...formData(f), permissions: $$('input[name=perm]:checked', f).map((c) => c.value) });
      closeModal();
      toast(`${r.user.name} created with ${r.user.permissions.join(', ')}`, 'ok');
      users(pane, q);
    }, $('#uerr', d2)));
  });
}

// ---------------- Security ----------------
async function security(pane, q) {
  const [s, a] = await Promise.all([get('/api/admin/security'), get(`/api/admin/audit?${new URLSearchParams({ severity: q.severity || '', action: q.action || '' })}`)]);
  const st = s.settings;
  pane.innerHTML = `
    <div class="grid g4">
      <div class="kpi"><small>Compliance checks</small><b>${s.checks.filter((c) => c.ok).length}/${s.checks.length}</b><span>passing</span></div>
      <div class="kpi"><small>Active sessions</small><b>${s.stats.activeSessions}</b></div>
      <div class="kpi"><small>Failed logins (24 h)</small><b>${s.stats.failedLogins24h}</b></div>
      <div class="kpi"><small>High-severity events (24 h)</small><b>${s.stats.events24h.high || 0}</b><span>${s.stats.events24h.warn || 0} warnings</span></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Data protection compliance</h3><p class="small muted">Controls supporting Ghana's Data Protection Act, 2012 (Act 843)</p>
        ${s.checks.map((c) => `<div class="sum-line small"><span>${esc(c.label)}</span><span class="badge ${c.ok ? 'ok' : 'bad'}">${c.ok ? 'Pass' : 'Review'}</span></div>`).join('')}</div>
      <div class="card"><h3>Encryption</h3>
        <div class="sum-line small"><span>Field encryption</span><span>${esc(s.encryption.algorithm)}</span></div>
        <div class="sum-line small"><span>Key fingerprint</span><span class="mono">${esc(s.encryption.keyFingerprint)}</span></div>
        <div class="sum-line small"><span>Password hashing</span><span>${esc(s.encryption.passwordHashing)}</span></div>
        <div class="table-wrap"><table style="margin-top:12px"><thead><tr><th>Encrypted field</th><th class="num">Records</th><th class="num">Verified</th><th class="num">Failures</th></tr></thead><tbody>
          ${s.encryption.fields.map((f) => `<tr><td class="mono small">${esc(f.field)}</td><td class="num">${num(f.records)}</td><td class="num">${num(f.verified)}</td><td class="num">${f.failures}</td></tr>`).join('')}</tbody></table></div>
        <p class="small muted">The latest 2,000 records per field are decrypted as a self-test on each view</p></div>
    </div>
    <form class="card" id="sf" style="margin-top:16px"><h3>Security policy</h3><div id="serr"></div>
      <div class="form-grid">
        <div class="field"><label>Session timeout (hours)</label><input type="number" name="session_timeout_hours" value="${esc(st.session_timeout_hours)}"></div>
        <div class="field"><label>Minimum password length</label><input type="number" name="password_min_length" value="${esc(st.password_min_length)}"></div>
        <div class="field"><label>Failed logins before lockout</label><input type="number" name="max_login_attempts" value="${esc(st.max_login_attempts)}"></div>
        <div class="field"><label>Seat hold (minutes)</label><input type="number" name="booking_hold_minutes" value="${esc(st.booking_hold_minutes)}"></div>
        <div class="field"><label>Data retention (days)</label><input type="number" name="data_retention_days" value="${esc(st.data_retention_days)}"></div>
      </div>
      <label class="check"><input type="checkbox" name="mask" ${st.mask_pii_for_staff === '1' ? 'checked' : ''}> Mask passport numbers for staff by default</label>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary">Save policy</button><button type="button" class="btn" id="purge">Run retention purge</button></div></form>
    <div class="card" style="margin-top:16px"><div class="row between"><h3 style="margin:0">Security audit log</h3>
      <div class="seg-control">${[['', 'All'], ['high', 'High'], ['warn', 'Warning'], ['info', 'Info']].map(([v, l]) => `<button data-f="severity" data-v="${v}" class="${(q.severity || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Time</th><th>Severity</th><th>Action</th><th>User</th><th>Target</th><th>Details</th><th>IP</th></tr></thead><tbody>
      ${a.events.map((e) => `<tr><td class="small nowrap">${fmtDateTime(e.at)}</td><td><span class="badge ${e.severity === 'high' ? 'bad' : e.severity === 'warn' ? 'warn' : ''}">${esc(e.severity)}</span></td>
        <td class="mono small">${esc(e.action)}</td><td class="small">${esc(e.user || '—')}</td><td class="small mono">${esc(e.target || '')}</td><td class="small" style="max-width:280px;word-break:break-word">${esc(e.details || '')}</td><td class="small mono">${esc(e.ip || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No events</td></tr>'}
      </tbody></table></div></div>`;
  bindFilters(pane, q, '/admin/security');
  const f = $('#sf');
  f.addEventListener('submit', guard(f.querySelector('.btn-primary'), async () => {
    const v = formData(f);
    delete v.mask;
    await put('/api/admin/settings', { ...v, mask_pii_for_staff: f.mask.checked ? '1' : '0' });
    toast('Security policy saved', 'ok');
    security(pane, q);
  }, $('#serr')));
  $('#purge').addEventListener('click', guard($('#purge'), async () => {
    const r = await post('/api/admin/retention/purge');
    toast(`Purged ${r.purged.auditEvents} audit events, ${r.purged.notifications} messages, ${r.purged.sessions} expired sessions`, 'ok');
    security(pane, q);
  }));
}
