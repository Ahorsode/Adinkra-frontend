import {
  state, get, post, put, esc, money, fmtTime, fmtDate, fmtDateTime, ago, badge, liveBadge, segBadge, city,
  $, $$, formData, guard, go, toast, modal, closeModal, onLeave, errorBox, loading, backLink, icon, can, staffTabs } from '../core.js';
import { cargoTimeline } from './account.js';

export async function staff(el, { tab: t, id }) {
  // Only the sections this account's permissions cover are listed or reachable (the router already
  // turned away accounts with none). A link to any other section lands on the first allowed one.
  const tabs = staffTabs();
  if (!t || !tabs.some(([k]) => k === t)) { location.replace(`#/staff/${tabs[0][0]}`); return; }
  const tab = t;
  const roleLabel = state.user.role === 'admin' ? 'administrator (all sections)' : tabs.map(([, l]) => l).join(', ');
  el.innerHTML = `
    <div class="page-head"><div><h1>Staff portal</h1><p>Signed in as ${esc(state.user.name)} · ${esc(roleLabel)}</p></div></div>
    ${tabs.length > 1 ? `<nav class="tabs">${tabs.map(([k, l]) => `<a href="#/staff/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav>` : ''}
    <div id="pane">${loading()}</div>`;
  const pane = $('#pane');
  const handlers = { support: supportTab, gate: gateTab, manifest: manifestTab, bookings: bookingsTab, cargo: cargoTab, ops: opsTab };
  try { await handlers[tab](pane, id); } catch (e) { pane.innerHTML = errorBox(e); }
}

// ---------------- Support ----------------
async function supportTab(pane, ref) {
  if (ref) return supportTicket(pane, ref);
  const d = await get('/api/staff/support');
  pane.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px">${['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => `<div class="kpi"><small>${s.charAt(0) + s.slice(1).replace('_', ' ').toLowerCase()}</small><b>${d.counts[s] || 0}</b></div>`).join('')}</div>
    <div class="card table-wrap"><table><thead><tr><th>Ref</th><th>Customer</th><th>Subject</th><th>Topic</th><th>Status</th><th>Updated</th></tr></thead><tbody>
      ${d.tickets.map((t) => `<tr class="clickable" data-ref="${esc(t.ref)}"><td class="mono">${esc(t.ref)}</td><td>${esc(t.customer)}</td>
        <td>${esc(t.subject)} ${t.awaitingReply && !['RESOLVED', 'CLOSED'].includes(t.status) ? '<span class="badge warn">needs reply</span>' : ''}</td><td>${esc(t.category)}</td><td>${badge(t.status)}</td><td class="small">${ago(t.updatedAt)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No tickets</td></tr>'}
    </tbody></table></div>`;
  $$('[data-ref]', pane).forEach((r) => r.addEventListener('click', () => go(`/staff/support/${r.dataset.ref}`)));
}

async function supportTicket(pane, ref) {
  const { ticket: t, templates } = await get(`/api/staff/support/${ref}`);
  pane.innerHTML = `
    ${backLink('#/staff/support', 'All tickets')}
    <div class="split" style="margin-top:12px">
      <div class="card"><div class="row between"><h2 style="margin:0">${esc(t.subject)}</h2>${badge(t.status)}</div>
        <p class="muted small"><span class="mono">${esc(t.ref)}</span> · ${esc(t.categoryLabel)} · ${esc(t.customer.name)} (${esc(t.customer.email)})${t.pnr ? ` · PNR ${can('bookings') ? `<a href="#/staff/bookings/${esc(t.pnr)}">${esc(t.pnr)}</a>` : `<span class="mono">${esc(t.pnr)}</span>`}` : ''}</p>
        <div class="thread">${t.messages.map((m) => `<div class="msg ${m.author_role}"><div class="meta">${esc(m.author)} · ${fmtDateTime(m.created_at)}</div><p>${esc(m.body)}</p></div>`).join('')}</div>
        <form id="rf" style="margin-top:16px"><div id="err"></div>
          <div class="field"><label>Reply to customer</label><textarea name="message" id="reply"></textarea></div>
          <div class="row"><select name="status" style="width:auto">
            <option value="IN_PROGRESS">Keep in progress</option><option value="RESOLVED" selected>Mark as resolved</option><option value="CLOSED">Close</option><option value="OPEN">Re-open</option></select>
            <button class="btn btn-primary">Send</button></div></form>
      </div>
      <aside class="card"><h3>Quick replies</h3><p class="small muted">Insert approved guidance into your reply</p>
        <div class="stack">${templates.map((x) => `<button class="option" data-tpl="${esc(x.id)}"><span><b>${esc(x.label)}</b><br><span class="small muted">${esc(x.body.slice(0, 90))}…</span></span></button>`).join('')}</div></aside>
    </div>`;
  $$('[data-tpl]', pane).forEach((b) => b.addEventListener('click', () => {
    const tpl = templates.find((x) => x.id === b.dataset.tpl);
    const ta = $('#reply');
    ta.value = (ta.value ? `${ta.value}\n\n` : `Dear ${t.customer.name.split(' ')[0]},\n\n`) + tpl.body;
    ta.focus();
  }));
  const f = $('#rf');
  f.addEventListener('submit', guard(f.querySelector('button'), async () => {
    await post(`/api/staff/support/${ref}/reply`, formData(f));
    toast('Reply sent to customer', 'ok');
    supportTicket(pane, ref);
  }, $('#err')));
}

// ---------------- Gate ----------------
async function flightOptions(selected, { ahead = 30 } = {}) {
  const { flights } = await get(`/api/staff/flights?back=6&ahead=${ahead}`);
  const def = selected || flights.find((f) => Date.parse(f.departure) > Date.now() - 3600000 && f.pax > 0)?.id;
  return {
    flights,
    def,
    html: flights.map((f) => `<option value="${f.id}" ${f.id === Number(def) ? 'selected' : ''}>${fmtDate(f.departure)} ${fmtTime(f.departure)} · ${esc(f.flightNo)} ${esc(f.origin)}→${esc(f.destination)} (${f.boarded}/${f.pax} boarded)</option>`).join(''),
  };
}

async function gateTab(pane) {
  const fo = await flightOptions(null);
  pane.innerHTML = `
    <div class="split">
      <div class="stack">
        <div class="card"><div class="field"><label>Gate flight</label><select id="gf">${fo.html}</select></div>
          <div id="gstats" class="row"></div></div>
        <div class="card"><h3>Scan e-ticket</h3>
          <div id="cam" class="hidden"><div class="scanner"><video id="video" playsinline muted></video><div class="frame"></div></div></div>
          <div class="row" style="margin:12px 0"><button class="btn btn-primary" id="camBtn">Start camera scanner</button><span class="muted small" id="camMsg"></span></div>
          <form id="mf" class="row"><input name="code" placeholder="Or type/paste ticket number or QR code" style="flex:1;min-width:200px" autocomplete="off"><button class="btn">Check in</button></form>
        </div>
      </div>
      <aside class="stack"><div id="result" class="scan-result"><h3>Ready</h3><p class="muted">Scan a passenger's QR code to board them</p></div>
        <div class="card"><h3>Recent scans</h3><div id="recent" class="small muted">None yet.</div></div></aside>
    </div>`;
  const recent = [];
  const stats = async () => {
    const id = $('#gf').value;
    if (!id) return;
    const m = await get(`/api/staff/flights/${id}/manifest`);
    $('#gstats').innerHTML = `${liveBadge(m.flight.live)} <span><b>${m.summary.boarded}</b> of ${m.summary.total} passengers boarded</span>
      <div class="meter" style="flex:1"><span style="width:${m.summary.total ? (m.summary.boarded / m.summary.total) * 100 : 0}%"></span></div>
      <a class="btn btn-sm" href="#/staff/manifest/${id}">Manifest</a>`;
  };
  $('#gf').addEventListener('change', stats);
  stats();

  const TONE = { BOARDED: 'ok', DUPLICATE: 'warn', TOO_EARLY: 'warn', WRONG_FLIGHT: 'bad', REJECTED: 'bad', INVALID: 'bad' };
  const TITLE = { BOARDED: 'Boarded', DUPLICATE: 'Already boarded', TOO_EARLY: 'Boarding not open', WRONG_FLIGHT: 'Wrong flight', REJECTED: 'Do not board', INVALID: 'Invalid code' };
  let busy = false;
  const check = async (code, override = false) => {
    if (busy) return;
    busy = true;
    try {
      const r = await post('/api/staff/gate/scan', { code, flightId: Number($('#gf').value), override });
      const p = r.passenger;
      $('#result').className = `scan-result ${TONE[r.result]}`;
      $('#result').innerHTML = `<h3>${icon(TONE[r.result] === 'ok' ? 'check' : TONE[r.result] === 'warn' ? 'alert' : 'x')}${TITLE[r.result]}</h3><p>${esc(r.message)}</p>
        ${p ? `<div class="kv"><div><small>Passenger</small><span>${esc(p.name)}</span></div><div><small>Seat</small><span>${esc(p.seat)}</span></div>
          <div><small>Flight</small><span class="mono">${esc(p.flightNo)}</span></div><div><small>Cabin</small><span>${esc(p.tier)}</span></div><div><small>PNR</small><span class="mono">${esc(p.pnr)}</span></div></div>` : ''}
        ${r.result === 'TOO_EARLY' ? '<button class="btn btn-sm" id="ovr" style="margin-top:12px">Board anyway (supervisor)</button>' : ''}`;
      $('#ovr')?.addEventListener('click', () => check(code, true));
      if (p) {
        recent.unshift(`${fmtTime(new Date().toISOString())} · ${TITLE[r.result]} · ${p.name} ${p.seat}`);
        $('#recent').innerHTML = recent.slice(0, 10).map((x) => `<div>${esc(x)}</div>`).join('');
      }
      if (r.result === 'BOARDED') stats();
    } catch (e) { toast(e.message, 'bad'); } finally { busy = false; }
  };
  $('#mf').addEventListener('submit', (e) => { e.preventDefault(); const c = e.target.code.value.trim(); if (c) check(c); e.target.reset(); });

  // Camera scanning with jsQR
  let stream = null;
  let raf = null;
  let lastCode = '';
  let lastAt = 0;
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    $('#cam')?.classList.add('hidden');
    if ($('#camBtn')) $('#camBtn').textContent = 'Start camera scanner';
  };
  onLeave(stop);
  $('#camBtn').addEventListener('click', async () => {
    if (stream) return stop();
    try {
      if (!window.jsQR) await new Promise((res, rej) => { const s = Object.assign(document.createElement('script'), { src: '/vendor/jsQR.js', onload: res, onerror: rej }); document.head.append(s); });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) { $('#camMsg').textContent = `Camera unavailable: ${e.message || e}`; return; }
    const video = $('#video');
    video.srcObject = stream;
    await video.play();
    $('#cam').classList.remove('hidden');
    $('#camBtn').textContent = 'Stop camera';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const loop = () => {
      if (!stream) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data && (code.data !== lastCode || Date.now() - lastAt > 4000)) {
          lastCode = code.data;
          lastAt = Date.now();
          check(code.data);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  });
}

async function manifestTab(pane, id) {
  const fo = await flightOptions(id ? Number(id) : null, { ahead: 72 });
  pane.innerHTML = `<div class="card no-print"><div class="row"><div class="field" style="flex:1;margin:0"><label>Flight</label><select id="mfSel">${fo.html}</select></div>
    <input id="mfFilter" placeholder="Filter by name, seat or PNR" style="max-width:260px;align-self:flex-end"><button class="btn" id="mfPrint" style="align-self:flex-end">Print</button></div></div><div id="mfBody" style="margin-top:16px"></div>`;
  const load = async () => {
    const fid = $('#mfSel').value;
    if (!fid) { $('#mfBody').innerHTML = '<div class="card empty">No flights in this window.</div>'; return; }
    const m = await get(`/api/staff/flights/${fid}/manifest`);
    const render = () => {
      const qv = $('#mfFilter').value.trim().toLowerCase();
      const list = m.passengers.filter((p) => !qv || `${p.name} ${p.seat} ${p.pnr}`.toLowerCase().includes(qv));
      $('#mfBody').innerHTML = `<div class="card"><div class="row between"><h3 style="margin:0"><span class="mono">${esc(m.flight.flightNo)}</span> · ${esc(m.flight.originCity)} → ${esc(m.flight.destinationCity)} · ${fmtDateTime(m.flight.departure)}</h3>
        <span>${liveBadge(m.flight.live)} <b>${m.summary.boarded}</b>/${m.summary.total} boarded · ${m.flight.capacity} seats</span></div>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Seat</th><th>Passenger</th><th>Type</th><th>Cabin</th><th>PNR</th><th>Ticket</th><th>Status</th></tr></thead><tbody>
        ${list.map((p) => `<tr><td class="mono"><b>${esc(p.seat)}</b></td><td>${esc(p.name)}</td><td class="small">${esc(p.type.toLowerCase())}</td><td class="small">${esc(p.tier.toLowerCase())}</td>
          <td class="mono">${esc(p.pnr)}</td><td class="mono small">${esc(p.ticketNo)}</td><td>${badge(p.status)}${p.boardedAt ? ` <span class="small muted">${fmtTime(p.boardedAt)}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No passengers</td></tr>'}
        </tbody></table></div></div>`;
    };
    render();
    $('#mfFilter').oninput = render;
  };
  $('#mfSel').addEventListener('change', load);
  $('#mfPrint').addEventListener('click', () => window.print());
  load();
}

// ---------------- Bookings desk ----------------
async function bookingsTab(pane, pnr) {
  pane.innerHTML = `<form class="card" id="lf" style="max-width:520px"><div class="row"><div class="field" style="flex:1;margin:0"><label>Passenger PNR</label>
    <input name="pnr" maxlength="6" value="${esc(pnr || '')}" style="text-transform:uppercase;font-family:var(--mono)" required></div><button class="btn btn-primary" style="align-self:flex-end">Look up</button></div></form>
    <div id="bk" style="margin-top:16px"></div>`;
  $('#lf').addEventListener('submit', (e) => { e.preventDefault(); go(`/staff/bookings/${formData(e.target).pnr.toUpperCase()}`); });
  if (pnr) await showBooking(pnr, false);

  async function showBooking(p, reveal) {
    const box = $('#bk');
    box.innerHTML = loading();
    try {
      const { booking: b, owner, cancelQuote: cq } = await get(`/api/staff/bookings/${p}${reveal ? '?reveal=1' : ''}`);
      const canAct = b.status === 'CONFIRMED';
      box.innerHTML = `<div class="split"><div class="stack">
        <div class="card"><div class="row between"><div><span class="pnr">${esc(b.pnr)}</span> ${badge(b.status)}</div><span>${esc(b.tierLabel)} · ${segBadge(b.segment)}</span></div>
          <p class="small muted">Booked ${fmtDateTime(b.createdAt)} · contact ${esc(b.contactEmail)} / ${esc(b.contactPhone)}${owner ? ` · account ${esc(owner.name)}` : ''}</p>
          <h3>Passengers — identity check</h3>
          <div class="table-wrap"><table><thead><tr><th>Name</th><th>Date of birth</th><th>Passport</th><th>Seats</th></tr></thead><tbody>
          ${b.passengers.map((x) => `<tr><td><b>${esc(x.lastName.toUpperCase())}</b>, ${esc(x.firstName)}</td><td>${esc(x.dob || '')}</td><td class="mono">${esc(x.passport || '—')}</td>
            <td class="small">${x.tickets.map((t) => `${esc(t.seat)} ${badge(t.status)}`).join(' ')}</td></tr>`).join('')}</tbody></table></div>
          ${!reveal && b.passengers.some((x) => x.passport) ? '<button class="btn btn-sm" id="reveal" style="margin-top:8px">Reveal full passport numbers (logged)</button>' : ''}
        </div>
        ${b.segments.map((s) => `<div class="card"><div class="row between"><h3 style="margin:0"><span class="mono">${esc(s.flightNo)}</span> ${esc(s.originCity)} → ${esc(s.destinationCity)}</h3>${liveBadge(s.live)}</div>
          <p class="small muted">${fmtDateTime(s.departure)} · ${esc(s.aircraft)}${s.live.remarks ? ` · ${esc(s.live.remarks)}` : ''}</p>
          ${canAct && Date.parse(s.departure) > Date.now() - 3 * 3600000 ? `<button class="btn btn-sm btn-primary" data-reroute="${s.segmentId}">Re-route passenger(s)</button>` : ''}</div>`).join('')}
      </div>
      <aside class="card"><h3>Cancellation & refund</h3>
        ${canAct && !cq.error ? `<div class="sum-line small"><span>Paid</span><span>${money(cq.paid)}</span></div>
          <div class="sum-line small"><span>Policy</span><span>${esc(cq.rule)}</span></div>
          <div class="sum-line"><span>Refund (${cq.pct}%)</span><b>${money(cq.refund)}</b></div>
          <form id="cf" style="margin-top:12px"><div id="cerr"></div>
            <label class="check"><input type="checkbox" name="identityVerified"> I have verified the passenger's ID against the booking</label>
            <div class="field" style="margin-top:12px"><label>Reason</label><input name="reason" placeholder="e.g. Passenger unable to travel – illness"></div>
            <label class="check"><input type="checkbox" name="waive"> Waive policy – full refund (supervisor approval)</label>
            <button class="btn btn-danger btn-block" style="margin-top:12px">Cancel & process refund</button></form>`
          : `<p class="muted small">${esc(cq.error || `Booking is ${b.status.toLowerCase()}.`)}</p>`}
        ${b.refunds.map((r) => `<p class="note ok small">Refunded ${money(r.amount)} (${r.pct}%) · ${esc(r.reason || '')}</p>`).join('')}
      </aside></div>`;
      $('#reveal')?.addEventListener('click', () => showBooking(p, true));
      const cf = $('#cf');
      cf?.addEventListener('submit', guard(cf.querySelector('button'), async () => {
        const r = await post(`/api/staff/bookings/${p}/cancel`, { identityVerified: cf.identityVerified.checked, waive: cf.waive.checked, reason: cf.reason.value });
        toast(`Cancelled. Refund ${money(r.refund)} (${r.pct}%) issued.`, 'ok');
        showBooking(p, false);
      }, $('#cerr')));
      $$('[data-reroute]', box).forEach((btn) => btn.addEventListener('click', () => reroute(p, Number(btn.dataset.reroute))));
    } catch (e) { box.innerHTML = errorBox(e); }
  }

  async function reroute(p, segmentId) {
    const d = modal({ title: 'Re-route to another flight', body: loading('Finding next available flights…') });
    try {
      const o = await get(`/api/staff/bookings/${p}/reroute-options?segmentId=${segmentId}`);
      let chosen = null;
      $('.mb', d).innerHTML = `<p class="small muted">Current: <b class="mono">${esc(o.current.flightNo)}</b> ${fmtDateTime(o.current.departure)} ${liveBadge(o.current.live)} · ${o.passengers} passenger(s). No fees are charged for staff re-routing.</p>
        <div class="field"><label>Reason shown to the customer</label><input id="rr" value="${o.current.live.delayMin ? `the ${o.current.live.delayMin}-minute delay of ${o.current.flightNo}` : o.current.live.code === 'CANCELLED' ? `the cancellation of ${o.current.flightNo}` : 'a schedule change'}"></div>
        ${o.options.length ? `<div class="option-list">${o.options.map((f) => `<button class="option" data-opt="${f.id}"><span><b>${esc(f.flightNo)}</b> ${fmtDateTime(f.departure)}<br><span class="small muted">${f.seatsLeft} seats left</span></span>${liveBadge(f.live)}</button>`).join('')}</div>` : '<div class="empty">No flights with enough seats.</div>'}
        <div id="merr"></div>`;
      const foot = Object.assign(document.createElement('div'), { className: 'mf', innerHTML: '<button class="btn" data-close>Close</button><button class="btn btn-primary" id="go" disabled>Re-book & send e-ticket</button>' });
      d.append(foot);
      foot.querySelector('[data-close]').addEventListener('click', () => d.close());
      $$('[data-opt]', d).forEach((b) => b.addEventListener('click', () => { chosen = Number(b.dataset.opt); $$('[data-opt]', d).forEach((x) => x.classList.toggle('on', x === b)); $('#go', d).disabled = false; }));
      $('#go', d).addEventListener('click', guard($('#go', d), async () => {
        const r = await post(`/api/staff/bookings/${p}/reroute`, { segmentId, newFlightId: chosen, reason: $('#rr', d).value });
        closeModal();
        toast(`Moved to ${r.flight.flightNo}; seats ${r.seats.join(', ')}. Customer notified by email & SMS.`, 'ok');
        showBooking(p, false);
      }, $('#merr', d)));
    } catch (e) { $('.mb', d).innerHTML = errorBox(e); }
  }
}

// ---------------- Cargo ----------------
async function cargoTab(pane, awb) {
  if (awb) return cargoDetail(pane, awb);
  const d = await get('/api/staff/cargo');
  pane.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px">${['PENDING', 'APPROVED', 'RECEIVED', 'IN_TRANSIT'].map((s) => `<div class="kpi"><small>${s.charAt(0) + s.slice(1).replace('_', ' ').toLowerCase()}</small><b>${d.counts[s] || 0}</b></div>`).join('')}</div>
    <div class="card table-wrap"><table><thead><tr><th>AWB</th><th>Route</th><th>Shipper</th><th>Goods</th><th class="num">Pieces</th><th class="num">Chargeable</th><th class="num">Price</th><th>Status</th></tr></thead><tbody>
    ${d.shipments.map((s) => `<tr class="clickable" data-awb="${esc(s.awb)}"><td class="mono">${esc(s.awb)}</td><td class="mono">${esc(s.origin)} → ${esc(s.destination)}</td><td>${esc(s.shipper)}</td>
      <td class="small">${esc(s.description)}<br><span class="muted">${esc(s.type)}</span></td><td class="num">${s.pieces}</td><td class="num">${s.chargeableKg} kg</td><td class="num">${money(s.price, 0)}</td><td>${badge(s.status)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No shipments</td></tr>'}
    </tbody></table></div>`;
  $$('[data-awb]', pane).forEach((r) => r.addEventListener('click', () => go(`/staff/cargo/${r.dataset.awb}`)));
}

async function cargoDetail(pane, awb) {
  const { shipment: s, flight, flightOptions: opts } = await get(`/api/staff/cargo/${awb}`);
  const next = { APPROVED: 'Mark received & paid', RECEIVED: 'Mark loaded / in transit', IN_TRANSIT: 'Mark arrived', ARRIVED: 'Mark delivered' }[s.status];
  pane.innerHTML = `${backLink('#/staff/cargo', 'All shipments')}
    <div class="split" style="margin-top:12px"><div class="stack">
      <div class="card"><div class="row between"><h2 style="margin:0" class="mono">${esc(s.awb)}</h2>${badge(s.status)}</div>
        <p class="muted">${esc(city(s.origin))} → ${esc(city(s.destination))} · ${esc(s.description)} · ${esc(s.type)}</p>
        <div class="kv"><div><small>Pieces</small><span>${s.pieces}</span></div><div><small>Actual</small><span>${s.weight_kg} kg</span></div>
          <div><small>Dimensions</small><span>${s.length_cm}×${s.width_cm}×${s.height_cm} cm</span></div><div><small>Chargeable</small><span>${s.chargeable_kg} kg</span></div><div><small>Price</small><span>${money(s.price, 0)}</span></div></div>
        <hr><div class="small">Shipper: <b>${esc(s.shipper_name)}</b> ${esc(s.shipper_phone)} · Consignee: <b>${esc(s.consignee_name)}</b> ${esc(s.consignee_phone)}</div>
        ${flight ? `<p class="note info small" style="margin-top:12px">Booked on <b class="mono">${esc(flight.flight_no)}</b> ${fmtDateTime(flight.departure)}</p>` : ''}
      </div>
      ${s.status === 'PENDING' ? `<div class="card"><h3>Assign to flight</h3><p class="small muted">Capacity and dimension checks against the aircraft operating each flight</p>
        <div class="option-list">${opts.map((f) => `<button class="option" data-fid="${f.id}" ${f.fits ? '' : 'disabled'}><span><b class="mono">${esc(f.flightNo)}</b> ${fmtDateTime(f.departure)} · ${esc(f.aircraft)}<br>
          ${f.checks.map((c) => `<span class="small check-line ${c.ok ? 'ok' : 'bad'}">${icon(c.ok ? 'check' : 'x')}${esc(c.label)}</span>`).join('<br>')}</span>
          <span>${f.fits ? '<span class="badge ok">Fits</span>' : '<span class="badge bad">Exceeds limits</span>'}</span></button>`).join('') || '<div class="empty">No upcoming flights on this route.</div>'}</div>
        <div id="aerr"></div>
        <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="approve" disabled>Approve shipment</button><button class="btn btn-danger" id="reject">Reject…</button></div></div>` : ''}
      ${next ? `<div class="card"><h3>Next step</h3><div class="field"><label>Note (optional)</label><input id="anote"></div><button class="btn btn-primary" id="adv">${next}</button></div>` : ''}
    </div>
    <aside class="card"><h3>Tracking timeline</h3>${cargoTimeline(s)}</aside></div>`;
  let fid = null;
  $$('[data-fid]', pane).forEach((b) => b.addEventListener('click', () => { fid = Number(b.dataset.fid); $$('[data-fid]', pane).forEach((x) => x.classList.toggle('on', x === b)); $('#approve').disabled = false; }));
  $('#approve')?.addEventListener('click', guard($('#approve'), async () => {
    await post(`/api/staff/cargo/${awb}/approve`, { flightId: fid });
    toast('Shipment approved – shipper notified', 'ok');
    cargoDetail(pane, awb);
  }, $('#aerr')));
  $('#reject')?.addEventListener('click', () => {
    const d = modal({ title: 'Reject shipment', body: '<div id="rerr"></div><div class="field"><label>Reason (sent to shipper)</label><textarea id="rreason"></textarea></div>', actions: '<button class="btn" data-close>Back</button><button class="btn btn-danger" id="rgo">Reject</button>' });
    $('#rgo', d).addEventListener('click', guard($('#rgo', d), async () => {
      await post(`/api/staff/cargo/${awb}/reject`, { reason: $('#rreason', d).value });
      closeModal();
      cargoDetail(pane, awb);
    }, $('#rerr', d)));
  });
  $('#adv')?.addEventListener('click', guard($('#adv'), async () => {
    const r = await post(`/api/staff/cargo/${awb}/advance`, { note: $('#anote').value });
    toast(`Status: ${r.status.replace('_', ' ').toLowerCase()}`, 'ok');
    cargoDetail(pane, awb);
  }));
}

// ---------------- Flight ops ----------------
async function opsTab(pane) {
  const { flights } = await get('/api/staff/flights?back=3&ahead=36');
  pane.innerHTML = `<div class="card table-wrap"><table><thead><tr><th>Departure</th><th>Flight</th><th>Route</th><th>Status</th><th>Load</th><th>Delay (min)</th><th>Gate</th><th>Remarks</th><th></th></tr></thead><tbody>
    ${flights.map((f) => `<tr data-row="${f.id}"><td class="mono small">${fmtDate(f.departure)}<br>${fmtTime(f.departure)}</td><td class="mono"><b>${esc(f.flightNo)}</b></td><td>${esc(f.origin)} → ${esc(f.destination)}</td>
      <td>${liveBadge(f.live)}</td><td class="small">${f.pax}/${f.capacity}</td>
      <td><input type="number" min="0" max="1440" name="delayMin" value="${f.delayMin}" style="width:80px"></td>
      <td><input name="gate" value="${esc(f.gate || '')}" style="width:64px"></td>
      <td><input name="remarks" value="${esc(f.remarks || '')}" style="min-width:140px"></td>
      <td class="nowrap"><button class="btn btn-sm btn-primary" data-save="${f.id}">Save</button> <button class="btn btn-sm ${f.status === 'CANCELLED' ? '' : 'btn-danger'}" data-cancel="${f.id}" data-on="${f.status === 'CANCELLED' ? 0 : 1}">${f.status === 'CANCELLED' ? 'Reinstate' : 'Cancel'}</button></td></tr>`).join('')}
    </tbody></table></div><p class="small muted">Changing a delay or cancelling notifies all confirmed passengers by email and SMS</p>`;
  const save = async (id, extra = {}) => {
    const row = $(`[data-row="${id}"]`, pane);
    const v = Object.fromEntries($$('input', row).map((i) => [i.name, i.value]));
    await put(`/api/staff/flights/${id}/ops`, { ...v, ...extra });
    toast('Flight updated', 'ok');
    opsTab(pane);
  };
  $$('[data-save]', pane).forEach((b) => b.addEventListener('click', guard(b, () => save(b.dataset.save, { status: flights.find((f) => f.id === Number(b.dataset.save)).status }))));
  $$('[data-cancel]', pane).forEach((b) => b.addEventListener('click', guard(b, async () => {
    if (b.dataset.on === '1' && !confirm('Cancel this flight and notify all passengers?')) return;
    await save(b.dataset.cancel, { status: b.dataset.on === '1' ? 'CANCELLED' : 'SCHEDULED' });
  })));
}
