import {
  state, get, post, put, esc, money, fmtDateTime, fmtDate, ago, badge, airportOptions, city,
  $, $$, formData, guard, go, toast, errorBox, loading, backLink } from '../core.js';

// ================= Profile =================
export async function profile(el) {
  const [{ profile: p }, { notifications }] = await Promise.all([get('/api/profile'), get('/api/profile/notifications')]);
  el.innerHTML = `
    <div class="page-head"><div><h1>My profile</h1><p>Member since ${fmtDate(p.memberSince)}</p></div>
      <div class="card" style="padding:12px 16px"><div class="small muted">Adinkra Miles</div><b class="mono">${esc(p.frequentFlyerNo || '—')}</b> · <span class="badge brand">${esc(p.loyaltyTier)}</span> <span class="small muted">${p.flightsFlown} flights flown</span></div></div>
    <div class="split">
      <form class="stack" id="pf">
        <div id="err"></div>
        <div class="card"><h3>Personal details</h3>
          <div class="form-grid">
            <div class="field"><label>Full name</label><input name="name" value="${esc(p.name)}" required></div>
            <div class="field"><label>Email</label><input value="${esc(p.email)}" disabled></div>
            <div class="field"><label>Phone</label><input name="phone" type="tel" value="${esc(p.phone || '')}" required></div>
            <div class="field"><label>Date of birth</label><input name="dob" type="date" value="${esc(p.dob || '')}"></div>
            <div class="field"><label>Ghana Card</label><input value="${esc(p.nationalId || 'Not on file')}" disabled><div class="hint">Encrypted; contact support to change</div></div>
            <div class="field"><label>Frequent flyer number</label><input name="frequentFlyerNo" value="${esc(p.frequentFlyerNo || '')}"></div>
          </div></div>
        <div class="card"><h3>Travel document</h3>
          <div class="form-grid">
            <div class="field"><label>Passport number</label><input name="passportNo" placeholder="${p.hasPassport ? esc(`On file: ${p.passport}`) : 'e.g. G1234567'}" autocomplete="off">
              <div class="hint">${p.hasPassport ? 'Leave blank to keep the saved passport.' : 'Saved encrypted and prefilled when you book.'}</div></div>
            <div class="field"><label>Passport expiry</label><input name="passportExpiry" type="date" value="${esc(p.passportExpiry || '')}"></div>
            <div class="field"><label>Nationality</label><input name="nationality" value="${esc(p.nationality || '')}"></div>
          </div></div>
        <div class="card"><h3>Emergency contact</h3>
          <div class="form-grid">
            <div class="field"><label>Name</label><input name="em_name" value="${esc(p.emergency.name || '')}"></div>
            <div class="field"><label>Relationship</label><input name="em_relation" value="${esc(p.emergency.relation || '')}"></div>
            <div class="field"><label>Phone</label><input name="em_phone" type="tel" value="${esc(p.emergency.phone || '')}"></div>
          </div></div>
        <div><button class="btn btn-primary btn-lg">Save changes</button></div>
      </form>
      <aside class="stack">
        <form class="card" id="pw"><h3>Change password</h3><div id="pwerr"></div>
          <div class="field"><label>Current password</label><input type="password" name="currentPassword" autocomplete="current-password" required></div>
          <div class="field"><label>New password</label><input type="password" name="newPassword" autocomplete="new-password" required></div>
          <button class="btn">Update password</button></form>
        <div class="card"><h3>Messages sent to you</h3><p class="small muted">E-tickets, SMS alerts and updates (simulated outbox)</p>
          ${notifications.length ? notifications.slice(0, 12).map((n) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
            <div class="row between small"><b>${esc(n.subject)}</b><span class="badge">${esc(n.channel)}</span></div>
            <div class="small muted">${esc(n.body)}</div><div class="small muted">${ago(n.created_at)} · ${esc(n.recipient)}</div></div>`).join('') : '<p class="muted small">No messages yet</p>'}
        </div>
      </aside>
    </div>`;
  const f = $('#pf');
  f.addEventListener('submit', guard(f.querySelector('button.btn-primary'), async () => {
    const d = formData(f);
    await put('/api/profile', {
      ...d, emergency: { name: d.em_name, relation: d.em_relation, phone: d.em_phone },
    });
    toast('Profile saved', 'ok');
    profile(el);
  }, $('#err')));
  const pw = $('#pw');
  pw.addEventListener('submit', guard(pw.querySelector('button'), async () => {
    await put('/api/profile/password', formData(pw));
    pw.reset();
    toast('Password updated', 'ok');
  }, $('#pwerr')));
}

// ================= Support =================
export async function support(el, { ref } = {}) {
  const meta = await get('/api/support/meta');
  if (ref) return supportThread(el, ref);
  const { tickets } = await get('/api/support');
  const bag = meta.baggage;
  el.innerHTML = `
    <div class="page-head"><div><h1>Help & support</h1><p>Our customer care team usually replies within a few hours.</p></div></div>
    <div class="split">
      <div class="stack">
        <form class="card" id="nt"><h3>Ask a question</h3><div id="err"></div>
          <div class="form-grid">
            <div class="field"><label>Topic</label><select name="category">${Object.entries(meta.categories).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
            <div class="field"><label>Booking reference <span class="muted">(optional)</span></label><input name="pnr" maxlength="6" style="text-transform:uppercase"></div>
          </div>
          <div class="field"><label>Subject</label><input name="subject" required maxlength="120"></div>
          <div class="field"><label>Message</label><textarea name="message" required></textarea></div>
          <button class="btn btn-primary">Send to support</button></form>
        <div class="card"><h3>Your requests</h3>
          ${tickets.length ? `<div class="table-wrap"><table><thead><tr><th>Ref</th><th>Subject</th><th>Topic</th><th>Status</th><th>Updated</th></tr></thead><tbody>
            ${tickets.map((t) => `<tr class="clickable" data-ref="${esc(t.ref)}"><td class="mono">${esc(t.ref)}</td><td>${esc(t.subject)}</td><td>${esc(t.category)}</td><td>${badge(t.status)}</td><td class="small">${ago(t.updatedAt)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="muted">No requests yet</p>'}</div>
      </div>
      <aside class="card"><h3>Baggage allowance</h3>
        ${Object.entries(bag).map(([seg, tiers]) => `<h4 style="margin:12px 0 4px">${seg[0] + seg.slice(1).toLowerCase()}</h4>
          ${Object.entries(tiers).map(([t, b]) => `<div class="sum-line small"><span>${t[0] + t.slice(1).toLowerCase()}</span><span>${esc(b.checked)} + ${esc(b.cabin)} cabin</span></div>`).join('')}`).join('')}
        <hr><p class="small muted">Excess baggage: GHS 15/kg domestic, GHS 45/kg regional & international. Power banks must be carried in the cabin.</p>
      </aside>
    </div>`;
  $$('[data-ref]', el).forEach((r) => r.addEventListener('click', () => go(`/support/${r.dataset.ref}`)));
  const f = $('#nt');
  f.addEventListener('submit', guard(f.querySelector('button'), async () => {
    const { ticket } = await post('/api/support', formData(f));
    toast(`Request ${ticket.ref} sent`, 'ok');
    go(`/support/${ticket.ref}`);
  }, $('#err')));
}

async function supportThread(el, ref) {
  const { ticket: t } = await get(`/api/support/${ref}`);
  el.innerHTML = `
    <div class="page-head"><div>${backLink('#/support', 'All requests')}<h1>${esc(t.subject)}</h1>
      <p><span class="mono">${esc(t.ref)}</span> · ${esc(t.categoryLabel)} ${t.pnr ? `· booking <a href="#/booking/${esc(t.pnr)}">${esc(t.pnr)}</a>` : ''} · ${badge(t.status)}</p></div></div>
    <div class="card"><div class="thread">${t.messages.map((m) => `<div class="msg ${m.author_role}"><div class="meta">${esc(m.author)} · ${fmtDateTime(m.created_at)}</div><p>${esc(m.body)}</p></div>`).join('')}</div>
      <form id="rf" style="margin-top:16px"><div id="err"></div><div class="field"><label>Reply</label><textarea name="message" required></textarea></div><button class="btn btn-primary">Send reply</button></form></div>`;
  const f = $('#rf');
  f.addEventListener('submit', guard(f.querySelector('button'), async () => {
    await post(`/api/support/${ref}/messages`, formData(f));
    supportThread(el, ref);
  }, $('#err')));
}

// ================= Cargo =================
const CARGO_FLOW = ['PENDING', 'APPROVED', 'RECEIVED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];
const CARGO_LABEL = { PENDING: 'Request received', APPROVED: 'Space confirmed', RECEIVED: 'Received at terminal', IN_TRANSIT: 'In transit', ARRIVED: 'Arrived', DELIVERED: 'Delivered', REJECTED: 'Rejected' };

export function cargoTimeline(s) {
  if (s.status === 'REJECTED') {
    return `<ul class="timeline">${s.events.map((e) => `<li><b>${esc(CARGO_LABEL[e.status])}</b><div class="small muted">${fmtDateTime(e.created_at)} · ${esc(e.note || '')}</div></li>`).join('')}</ul>`;
  }
  const idx = CARGO_FLOW.indexOf(s.status);
  return `<ul class="timeline">${CARGO_FLOW.map((st, i) => {
    const ev = [...s.events].reverse().find((e) => e.status === st);
    return `<li class="${i > idx ? 'todo' : ''}"><b>${CARGO_LABEL[st]}</b>${ev ? `<div class="small muted">${fmtDateTime(ev.created_at)} · ${esc(ev.note || '')}</div>` : ''}</li>`;
  }).join('')}</ul>`;
}

export async function cargo(el, _p, q) {
  const meta = await get('/api/cargo/meta');
  const tab = q.tab || 'quote';
  const origins = [...new Set(meta.routes.map((r) => r.origin))];
  el.innerHTML = `
    <div class="page-head"><div><h1>Adinkra Cargo</h1><p>Air freight across Ghana, West Africa and to our international gateways</p></div></div>
    <nav class="tabs">${[['quote', 'Get a quote'], ['track', 'Track shipment'], ...(state.user ? [['mine', 'My shipments']] : [])].map(([k, l]) => `<a href="#/cargo?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div id="pane"></div>`;
  const pane = $('#pane');

  if (tab === 'track') {
    pane.innerHTML = `<form class="card" id="tf" style="max-width:560px"><div class="row"><div class="field" style="flex:1;margin:0"><label>Air waybill number</label><input name="awb" placeholder="839-12345678" value="${esc(q.awb || '')}" required></div>
      <button class="btn btn-primary" style="align-self:flex-end">Track</button></div></form><div id="tr" style="margin-top:16px"></div>`;
    const run = async (awb) => {
      $('#tr').innerHTML = loading();
      try {
        const { shipment: s } = await get(`/api/cargo/track/${encodeURIComponent(awb)}`);
        $('#tr').innerHTML = `<div class="card" style="max-width:720px"><div class="row between"><h3 style="margin:0" class="mono">${esc(s.awb)}</h3>${badge(s.status, CARGO_LABEL[s.status])}</div>
          <p class="muted">${esc(s.originCity)} → ${esc(s.destinationCity)} · ${s.pieces} piece(s) · ${s.chargeableKg} kg chargeable · ${esc(s.cargoType)}${s.flight ? ` · flight <b class="mono">${esc(s.flight.flight_no)}</b> ${fmtDateTime(s.flight.departure)}` : ''}</p>
          ${cargoTimeline(s)}</div>`;
      } catch (e) { $('#tr').innerHTML = errorBox(e); }
    };
    $('#tf').addEventListener('submit', (e) => { e.preventDefault(); run(formData(e.target).awb); });
    if (q.awb) run(q.awb);
    return;
  }
  if (tab === 'mine') {
    const { shipments } = await get('/api/cargo/mine');
    pane.innerHTML = `<div class="card table-wrap">${shipments.length ? `<table><thead><tr><th>AWB</th><th>Route</th><th>Status</th><th class="num">Chargeable</th><th class="num">Price</th><th>Created</th></tr></thead><tbody>
      ${shipments.map((s) => `<tr class="clickable" data-awb="${esc(s.awb)}"><td class="mono">${esc(s.awb)}</td><td>${esc(city(s.origin))} → ${esc(city(s.destination))}</td><td>${badge(s.status, CARGO_LABEL[s.status])}</td><td class="num">${s.chargeable_kg} kg</td><td class="num">${money(s.price, 0)}</td><td class="small">${fmtDate(s.created_at)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">No shipments yet.</div>'}</div>`;
    $$('[data-awb]', pane).forEach((r) => r.addEventListener('click', () => go(`/cargo?tab=track&awb=${r.dataset.awb}`)));
    return;
  }

  pane.innerHTML = `
    <div class="split">
      <form class="card" id="qf"><h3>Shipment details</h3><div id="err"></div>
        <div class="form-grid">
          <div class="field"><label>From</label><select name="origin" id="corigin">${airportOptions('ACC', { list: state.airports.filter((a) => origins.includes(a.code)) })}</select></div>
          <div class="field"><label>To</label><select name="destination" id="cdest"></select></div>
          <div class="field"><label>Cargo type</label><select name="cargoType">${Object.entries(meta.types).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div>
          <div class="field"><label>Pieces</label><input name="pieces" type="number" min="1" max="50" value="1" required></div>
          <div class="field"><label>Total weight (kg)</label><input name="weightKg" type="number" min="0.5" step="0.1" value="25" required></div>
          <div class="field"><label>Length (cm, per piece)</label><input name="lengthCm" type="number" min="1" value="60" required></div>
          <div class="field"><label>Width (cm)</label><input name="widthCm" type="number" min="1" value="40" required></div>
          <div class="field"><label>Height (cm)</label><input name="heightCm" type="number" min="1" value="40" required></div>
        </div>
        <button class="btn btn-primary">Get quote</button>
        <div id="book" class="hidden"><hr><h3>Book this shipment</h3>
          <div class="field"><label>Description of goods</label><input name="description" placeholder="e.g. Boxed shea butter" maxlength="200"></div>
          <div class="form-grid">
            <div class="field"><label>Shipper name</label><input name="shipperName" value="${esc(state.user?.name || '')}"></div>
            <div class="field"><label>Shipper phone</label><input name="shipperPhone" type="tel"></div>
            <div class="field"><label>Shipper email</label><input name="shipperEmail" type="email" value="${esc(state.user?.email || '')}"></div>
            <div class="field"><label>Consignee name</label><input name="consigneeName"></div>
            <div class="field"><label>Consignee phone</label><input name="consigneePhone" type="tel"></div>
          </div>
          <p class="small muted">Dangerous goods (batteries, flammables, gas) must be declared at the terminal. You pay at drop-off.</p>
          <button type="button" class="btn btn-accent" id="submitCargo">Submit cargo request</button></div>
      </form>
      <aside class="card sticky" id="quote"><h3>Your quote</h3><p class="muted small">Enter the shipment details to see standard pricing. We charge the greater of actual and volumetric weight (L×W×H ÷ 6000).</p></aside>
    </div>`;
  const f = $('#qf');
  const fillDest = () => {
    const dests = meta.routes.filter((r) => r.origin === f.origin.value).map((r) => r.destination);
    f.destination.innerHTML = airportOptions(dests.includes('TML') ? 'TML' : dests[0], { list: state.airports.filter((a) => dests.includes(a.code)) });
  };
  fillDest();
  f.origin.addEventListener('change', fillDest);
  f.addEventListener('submit', guard(f.querySelector('button.btn-primary'), async () => {
    const r = await post('/api/cargo/quote', formData(f));
    $('#quote').innerHTML = `<h3>Your quote</h3>
      <div class="sum-line small"><span>Actual weight</span><span>${r.quote.actualKg} kg</span></div>
      <div class="sum-line small"><span>Volumetric weight</span><span>${r.quote.volumetricKg} kg</span></div>
      <div class="sum-line small"><span><b>Chargeable weight</b></span><span><b>${r.quote.chargeableKg} kg</b></span></div><hr>
      ${r.quote.lines.map((l) => `<div class="sum-line small"><span>${esc(l.label)}</span><span>${money(l.amount, 0)}</span></div>`).join('')}
      <div class="sum-line total"><span>Estimated total</span><span>${money(r.quote.total, 0)}</span></div>
      <p class="small muted">Operated by ${esc(r.aircraft)} · rate ${money(r.quote.ratePerKg)}/kg</p>
      ${r.warnings.map((w) => `<p class="note warn small">${esc(w)}</p>`).join('')}`;
    $('#book').classList.remove('hidden');
  }, $('#err')));
  $('#submitCargo').addEventListener('click', guard($('#submitCargo'), async () => {
    const r = await post('/api/cargo', formData(f));
    toast(`Cargo request ${r.awb} submitted`, 'ok');
    go(`/cargo?tab=track&awb=${r.awb}`);
  }, $('#err')));
}
