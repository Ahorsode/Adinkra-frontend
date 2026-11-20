import {
  state, get, post, esc, money, fmtTime, fmtDate, fmtDateLong, fmtDur, fmtDateTime, city, badge, liveBadge, segBadge,
  $, $$, formData, guard, go, toast, modal, closeModal, onLeave, saveBookingToken, downloadFile, errorBox, loading, today,
} from '../core.js';

const TIER_LABEL = { ECONOMY: 'Economy', BUSINESS: 'Business', FIRST: 'First' };

// ================= Passenger details + seat selection =================
export async function book(el) {
  const draft = JSON.parse(sessionStorage.getItem('adk_draft') || 'null');
  if (!draft?.outbound) {
    el.innerHTML = '<div class="card empty"><h2>No flight selected</h2><a class="btn btn-primary" href="#/">Search flights</a></div>';
    return;
  }
  const flights = [draft.outbound, draft.inbound].filter(Boolean);
  const dirs = ['out', 'ret'].slice(0, flights.length);
  const [maps, profile, doc] = await Promise.all([
    Promise.all(flights.map((f) => get(`/api/flights/${f.id}/seats`))),
    get('/api/profile'),
    get('/api/profile/travel-document').catch(() => ({})),
  ]);
  const intl = draft.segment !== 'DOMESTIC';
  const pax = Array.from({ length: draft.pax }, (_, i) => ({ seats: {} , i }));
  const [first, ...rest] = (doc.name || profile.profile.name).replace(/^Dr\.?\s+/, '').split(' ');
  let activePax = 0;
  let activeDir = 0;

  const fareFor = (f) => f.tiers.find((t) => t.tier === draft.tier);
  const perPax = flights.reduce((s, f) => s + fareFor(f).fare + fareFor(f).taxes, 0);

  const paxForm = (i) => `
    <fieldset class="card" data-pax="${i}" style="border:1px solid var(--line)">
      <legend class="badge brand">Passenger ${i + 1}</legend>
      <div class="form-grid">
        <div class="field"><label>First name</label><input name="firstName" required value="${i === 0 ? esc(first) : ''}"></div>
        <div class="field"><label>Last name / surname</label><input name="lastName" required value="${i === 0 ? esc(rest.slice(-1)[0] || '') : ''}"></div>
        <div class="field"><label>Date of birth</label><input type="date" name="dob" max="${today()}" required value="${i === 0 ? esc(doc.dob || '') : ''}"></div>
        <div class="field"><label>Nationality</label><input name="nationality" value="${i === 0 ? esc(doc.nationality || 'Ghanaian') : 'Ghanaian'}"></div>
        <div class="field"><label>Passport number ${intl ? '' : '<span class="muted">(optional)</span>'}</label><input name="passportNo" ${intl ? 'required' : ''} value="${i === 0 ? esc(doc.passportNo || '') : ''}" autocomplete="off"></div>
        <div class="field"><label>Passport expiry</label><input type="date" name="passportExpiry" ${intl ? 'required' : ''} value="${i === 0 ? esc(doc.passportExpiry || '') : ''}"></div>
      </div>
    </fieldset>`;

  const seatMap = (m, dir) => {
    const mine = Object.fromEntries(pax.map((p) => [p.seats[dir], p.i]).filter(([s]) => s));
    let lastTier = null;
    return `<div class="seatmap-scroll"><div class="seatmap">${m.rows.map((r) => {
      const label = r.tier !== lastTier ? `<div class="cabin-label">${TIER_LABEL[r.tier]}</div>` : '';
      lastTier = r.tier;
      return `${label}<div class="srow"><span class="rn">${r.row}</span>${r.groups.map((g) => `<div class="sgroup">${g.map((s) => {
        const owner = mine[s.id];
        const cls = ['seat', r.tier, s.taken ? 'taken' : '', r.tier !== draft.tier ? 'other-tier' : '', owner != null ? 'mine' : '', owner === activePax ? 'active-pax' : ''].join(' ');
        const disabled = (s.taken || r.tier !== draft.tier) && owner == null;
        return `<button type="button" class="${cls}" data-seat="${s.id}" ${disabled ? 'disabled' : ''} aria-label="Seat ${s.id}${s.taken ? ' taken' : ''}">${owner != null ? `P${owner + 1}` : s.taken ? '' : s.id.replace(/^\d+/, '')}</button>`;
      }).join('')}</div>`).join('<span style="width:10px"></span>')}</div>`;
    }).join('')}</div></div>`;
  };

  const renderSeats = () => {
    const dir = dirs[activeDir];
    $('#seats').innerHTML = `
      ${flights.length > 1 ? `<div class="seg-control" style="margin-bottom:12px">${flights.map((f, i) => `<button type="button" data-dir="${i}" class="${i === activeDir ? 'on' : ''}">${i ? 'Return' : 'Outbound'} · ${esc(f.flightNo)}</button>`).join('')}</div>` : ''}
      <div class="pax-pills">${pax.map((p) => `<button type="button" class="pax-pill ${p.i === activePax ? 'on' : ''}" data-ap="${p.i}">P${p.i + 1}: ${esc(p.seats[dir] || 'auto-assign')}</button>`).join('')}</div>
      <div class="legend"><span><i></i>Available</span><span><i class="t"></i>Taken</span><span><i class="m"></i>Your selection</span><span class="muted">Only ${TIER_LABEL[draft.tier]} seats can be selected</span></div>
      ${seatMap(maps[activeDir], dir)}`;
    $$('[data-dir]').forEach((b) => b.addEventListener('click', () => { activeDir = Number(b.dataset.dir); renderSeats(); }));
    $$('[data-ap]').forEach((b) => b.addEventListener('click', () => { activePax = Number(b.dataset.ap); renderSeats(); }));
    $$('[data-seat]').forEach((b) => b.addEventListener('click', () => {
      const s = b.dataset.seat;
      const holder = pax.find((p) => p.seats[dir] === s);
      if (holder) { delete holder.seats[dir]; if (holder.i !== activePax) activePax = holder.i; }
      else {
        pax[activePax].seats[dir] = s;
        if (activePax < pax.length - 1) activePax++;
      }
      renderSeats();
    }));
  };

  el.innerHTML = `
    <div class="page-head"><div><h1>Passenger details</h1><p>Names must match the Ghana Card or passport used for travel</p></div></div>
    <form id="f" class="split" novalidate>
      <div class="stack">
        ${pax.map((p) => paxForm(p.i)).join('')}
        <div class="card"><h3>Choose seats</h3><p class="muted small">Pick a passenger, then tap a seat. Unselected passengers get the best available seat automatically.</p><div id="seats"></div></div>
        <div class="card"><h3>Contact for this booking</h3>
          <div class="form-grid"><div class="field"><label>Email (e-ticket is sent here)</label><input name="contactEmail" type="email" value="${esc(profile.profile.email)}" required></div>
          <div class="field"><label>Mobile (SMS alerts)</label><input name="contactPhone" type="tel" value="${esc(profile.profile.phone || '')}" required></div></div>
        </div>
      </div>
      <aside class="card sticky"><h3>Trip summary</h3>
        ${flights.map((f, i) => `<div style="margin-bottom:12px"><div class="small muted">${i ? 'Return' : 'Outbound'} · <span class="mono">${esc(f.flightNo)}</span></div>
          <b>${esc(f.originCity)} → ${esc(f.destinationCity)}</b><div class="small">${fmtDate(f.departure)} · ${fmtTime(f.departure)}–${fmtTime(f.arrival)} · ${fmtDur(f.durationMin)}</div></div>`).join('')}
        <div class="sum-line"><span>${TIER_LABEL[draft.tier]} fare × ${draft.pax}</span><span>${money(flights.reduce((s, f) => s + fareFor(f).fare, 0) * draft.pax)}</span></div>
        <div class="sum-line"><span>Taxes & charges</span><span>${money(flights.reduce((s, f) => s + fareFor(f).taxes, 0) * draft.pax)}</span></div>
        <div class="sum-line total"><span>Total</span><span>${money(perPax * draft.pax)}</span></div>
        <div id="err"></div>
        <button class="btn btn-accent btn-block btn-lg" id="go">Hold seats & continue to payment</button>
        <p class="small muted" style="margin-top:8px">Seats are held for 20 minutes while you pay</p>
      </aside>
    </form>`;
  renderSeats();

  const form = $('#f');
  form.addEventListener('submit', guard($('#go'), async () => {
    const passengers = $$('[data-pax]', form).map((fs, i) => {
      const v = Object.fromEntries($$('input', fs).map((inp) => [inp.name, inp.value.trim()]));
      return { ...v, seats: pax[i].seats };
    });
    const missing = passengers.findIndex((p) => !p.firstName || !p.lastName || !p.dob);
    if (missing >= 0) throw new Error(`Complete the name and date of birth for passenger ${missing + 1}`);
    const fd = formData(form);
    const r = await post('/api/bookings', {
      outboundFlightId: draft.outbound.id, returnFlightId: draft.inbound?.id || null, tier: draft.tier,
      passengers, contactEmail: fd.contactEmail, contactPhone: fd.contactPhone,
    });
    saveBookingToken(r.pnr, r.token);
    sessionStorage.removeItem('adk_draft');
    go(`/pay/${r.pnr}`);
  }, $('#err')));
}

// ================= Payment =================
export async function pay(el, { pnr }) {
  const { booking: b } = await get(`/api/bookings/${pnr}`);
  if (b.status !== 'HELD') { go(`/booking/${pnr}`); return; }
  el.innerHTML = `
    <div class="page-head"><div><h1>Secure payment</h1><p>Booking reference <span class="mono"><b>${esc(b.pnr)}</b></span> · seats held for <span class="countdown" id="cd"></span></p></div></div>
    <div class="split">
      <div class="card">
        <div class="seg-control" style="margin-bottom:16px"><button type="button" data-m="MOMO" class="on">Mobile Money</button><button type="button" data-m="CARD">Card</button></div>
        <div id="err"></div>
        <form id="momo">
          <div class="field"><label>Network</label><select name="provider"><option value="MTN">MTN MoMo</option><option value="TELECEL">Telecel Cash</option><option value="AIRTELTIGO">AT Money</option></select></div>
          <div class="field"><label>Mobile Money number</label><input name="momoNumber" type="tel" inputmode="numeric" placeholder="024 123 4567" required>
            <div class="hint">You'll receive a prompt to approve with your MoMo PIN. Sandbox: numbers ending in 0000 are declined.</div></div>
          <button class="btn btn-accent btn-lg btn-block">Pay ${money(b.total)}</button>
        </form>
        <form id="card" class="hidden">
          <div class="field"><label>Name on card</label><input name="cardName" autocomplete="cc-name" required></div>
          <div class="field"><label>Card number</label><input name="cardNumber" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" required></div>
          <div class="form-grid"><div class="field"><label>Expiry</label><input name="cardExpiry" placeholder="MM/YY" autocomplete="cc-exp" required></div>
          <div class="field"><label>CVV</label><input name="cardCvv" inputmode="numeric" autocomplete="cc-csc" maxlength="4" required></div></div>
          <div class="hint" style="margin-bottom:12px">Visa, Mastercard and Verve accepted. Sandbox: any Luhn-valid number works; 4000 0000 0000 0002 is declined.</div>
          <button class="btn btn-accent btn-lg btn-block">Pay ${money(b.total)}</button>
        </form>
        <p class="small muted" style="margin-top:16px">Payments are processed by our PCI-DSS gateway partner. Adinkra Airways never stores your full card number or PIN.</p>
      </div>
      <aside class="card"><h3>Summary</h3>
        ${b.segments.map((s) => `<div style="margin-bottom:12px"><div class="small muted">${s.direction === 'RET' ? 'Return' : 'Outbound'} · <span class="mono">${esc(s.flightNo)}</span></div>
          <b>${esc(s.originCity)} → ${esc(s.destinationCity)}</b><div class="small">${fmtDateTime(s.departure)}</div></div>`).join('')}
        <div class="sum-line"><span>Passengers</span><span>${b.passengers.map((p) => esc(`${p.firstName} ${p.lastName}`)).join(', ')}</span></div>
        <div class="sum-line"><span>Cabin</span><span>${esc(b.tierLabel)}</span></div>
        <div class="sum-line"><span>Taxes included</span><span>${money(b.taxes)}</span></div>
        <div class="sum-line total"><span>Total</span><span>${money(b.total)}</span></div>
      </aside>
    </div>`;
  const cd = $('#cd');
  const tick = () => {
    const s = Math.max(0, Math.floor((Date.parse(b.holdExpires) - Date.now()) / 1000));
    cd.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (!s) { clearInterval(t); toast('Your seat hold expired', 'bad'); go(`/booking/${pnr}`); }
  };
  const t = setInterval(tick, 1000);
  tick();
  onLeave(() => clearInterval(t));
  $$('[data-m]').forEach((btn) => btn.addEventListener('click', () => {
    $$('[data-m]').forEach((x) => x.classList.toggle('on', x === btn));
    $('#momo').classList.toggle('hidden', btn.dataset.m !== 'MOMO');
    $('#card').classList.toggle('hidden', btn.dataset.m !== 'CARD');
  }));
  for (const [id, method] of [['momo', 'MOMO'], ['card', 'CARD']]) {
    const f = $(`#${id}`);
    const btn = f.querySelector('button');
    f.addEventListener('submit', guard(btn, async () => {
      const label = btn.textContent;
      btn.innerHTML = `<span class="spinner"></span> ${method === 'MOMO' ? 'Waiting for approval on your phone…' : 'Authorising…'}`;
      try {
        await new Promise((r) => setTimeout(r, method === 'MOMO' ? 1800 : 900));
        const r = await post(`/api/bookings/${pnr}/pay`, { method, ...formData(f) });
        toast(`Payment approved · ${r.txnRef}`, 'ok');
        go(`/booking/${pnr}?new=1`);
      } finally { btn.textContent = label; }
    }, $('#err')));
  }
}

// ================= Booking detail / manage =================
function boardingPass(b, seg, p, t) {
  return `<div class="pass">
    <div class="main">
      <div class="row between"><div><div class="small muted">Passenger</div><b>${esc(p.lastName.toUpperCase())} / ${esc(p.firstName.toUpperCase())}</b></div>${badge(t.status)}</div>
      <div class="codes"><b>${esc(seg.origin)}</b><span class="muted">→</span><b>${esc(seg.destination)}</b><span class="muted small">${esc(seg.originCity)} to ${esc(seg.destinationCity)}</span></div>
      <div class="kv">
        <div><small>Flight</small><span class="mono">${esc(seg.flightNo)}</span></div>
        <div><small>Date</small><span>${fmtDate(seg.departure)}</span></div>
        <div><small>Departs</small><span>${fmtTime(seg.departure)}</span></div>
        <div><small>Seat</small><span>${esc(t.seat)}</span></div>
        <div><small>Gate</small><span>${esc(seg.live.gate || 'TBA')}</span></div>
        <div><small>Cabin</small><span>${esc(b.tierLabel)}</span></div>
      </div>
      <div class="small muted" style="margin-top:8px">E-ticket ${esc(t.ticketNo)} · Gate closes 15 minutes before departure</div>
    </div>
    <div class="qr">${t.qr ? `<img src="${t.qr}" alt="Boarding QR code for ${esc(p.firstName)}"><div class="mono">${esc(t.ticketNo)}</div>` : '<span class="muted small">No QR</span>'}</div>
  </div>`;
}

export async function bookingPage(el, { pnr }, q) {
  const { booking: b } = await get(`/api/bookings/${pnr}`);
  const upcoming = b.segments.some((s) => Date.parse(s.departure) > Date.now());
  const anyBoarded = b.passengers.some((p) => p.tickets.some((t) => t.status === 'BOARDED'));
  el.innerHTML = `
    ${q.new ? `<div class="note ok" style="margin-bottom:16px"><b>Payment received, you're booked.</b> We've emailed your e-ticket to ${esc(b.contactEmail)} and sent an SMS to ${esc(b.contactPhone)}.</div>` : ''}
    <div class="page-head"><div><div class="small muted">Booking reference</div><div class="pnr">${esc(b.pnr)}</div>
      <p>${badge(b.status)} · ${esc(b.tierLabel)} · ${b.tripType === 'ROUND_TRIP' ? 'Return trip' : 'One way'} · ${segBadge(b.segment)}</p></div>
      <div class="row no-print">
        ${b.status === 'HELD' ? `<a class="btn btn-accent" href="#/pay/${esc(b.pnr)}">Complete payment</a>` : ''}
        ${b.status === 'CONFIRMED' ? '<button class="btn btn-primary" id="pdf">Download e-ticket (PDF)</button><button class="btn" id="print">Print</button>' : ''}
      </div></div>
    <div class="split"><div class="stack">
      ${b.segments.map((s) => `
        <div class="card">
          <div class="row between"><h3 style="margin:0">${s.direction === 'RET' ? 'Return' : 'Outbound'} · <span class="mono">${esc(s.flightNo)}</span></h3>${liveBadge(s.live)}</div>
          <div class="legline" style="margin:12px 0">
            <div><div class="t">${fmtTime(s.departure)}</div><div class="c">${esc(s.originCity)} (${s.origin})</div></div>
            <div class="bar"><span>${fmtDur(s.durationMin)}</span></div>
            <div><div class="t">${fmtTime(s.arrival)}</div><div class="c">${esc(s.destinationCity)} (${s.destination})</div></div>
          </div>
          <div class="row between small"><span class="muted">${fmtDateLong(s.departure)} · ${esc(s.aircraft)}${s.live.delayMin ? ` · <b>new departure ${fmtTime(s.live.estimatedDeparture)}</b>` : ''}</span>
          ${b.status === 'CONFIRMED' && Date.parse(s.departure) > Date.now() + 3 * 3600000 && !anyBoarded ? `<button class="btn btn-sm no-print" data-change="${s.segmentId}">Change date</button>` : ''}</div>
          ${b.status === 'CONFIRMED' ? `<div class="stack" style="margin-top:16px">${b.passengers.map((p) => {
            const t = p.tickets.find((x) => x.segmentId === s.segmentId);
            return t ? boardingPass(b, s, p, t) : '';
          }).join('')}</div>` : ''}
        </div>`).join('')}
    </div>
    <aside class="stack">
      <div class="card"><h3>Passengers</h3>${b.passengers.map((p) => `<div class="sum-line"><span>${esc(p.firstName)} ${esc(p.lastName)} <span class="muted small">${esc(p.type.toLowerCase())}</span></span><span class="mono small">${esc(p.passport || '')}</span></div>`).join('')}
        <hr><div class="small muted">Baggage per passenger: ${esc(b.baggage.checked)} checked, ${esc(b.baggage.cabin)} cabin</div></div>
      <div class="card"><h3>Payments</h3>
        ${b.payments.map((p) => `<div class="sum-line small"><span>${esc(p.kind === 'CHANGE' ? 'Change fee' : 'Ticket')} · ${esc(p.account_masked || p.method)}<br><span class="muted">${esc(p.txn_ref)} · ${badge(p.status === 'SUCCESS' ? 'CONFIRMED' : 'CANCELLED', p.status.toLowerCase())}</span></span><span>${money(p.amount)}</span></div>`).join('') || '<p class="muted small">No payment yet</p>'}
        ${b.refunds.map((r) => `<div class="sum-line small"><span>Refund (${r.pct}%)</span><span>−${money(r.amount)}</span></div>`).join('')}
        <div class="sum-line total"><span>Paid</span><span>${money(b.paid - b.refunded)}</span></div></div>
      ${b.status === 'CONFIRMED' && upcoming && !anyBoarded ? '<div class="card no-print"><h3>Cancel booking</h3><p class="small muted">See your refund before you confirm</p><button class="btn btn-danger btn-block" id="cancel">Cancel this booking</button></div>' : ''}
    </aside></div>`;

  $('#pdf')?.addEventListener('click', guard($('#pdf'), () => downloadFile(`/api/bookings/${b.pnr}/eticket.pdf`, `eticket-${b.pnr}.pdf`)));
  $('#print')?.addEventListener('click', () => window.print());
  $$('[data-change]', el).forEach((btn) => btn.addEventListener('click', () => changeDialog(b, Number(btn.dataset.change))));
  $('#cancel')?.addEventListener('click', guard($('#cancel'), async () => {
    const qte = await get(`/api/bookings/${b.pnr}/cancel-quote`);
    const d = modal({
      title: `Cancel booking ${b.pnr}?`,
      body: `<p>${esc(qte.rule)}.</p>
        <div class="sum-line"><span>Amount paid</span><span>${money(qte.paid)}</span></div>
        <div class="sum-line"><span>Refund (${qte.pct}%)</span><span>${money(qte.refund)}</span></div>
        <p class="note warn" style="margin-top:12px">This cannot be undone. All seats on this booking will be released.</p><div id="merr"></div>`,
      actions: '<button class="btn" data-close>Keep booking</button><button class="btn btn-danger" id="yes">Cancel booking</button>',
    });
    $('#yes', d).addEventListener('click', guard($('#yes', d), async () => {
      const r = await post(`/api/bookings/${b.pnr}/cancel`);
      closeModal();
      toast(`Booking cancelled. Refund of ${money(r.refund)} is on its way.`, 'ok');
      bookingPage(el, { pnr }, {});
    }, $('#merr', d)));
  }));

  async function changeDialog(bk, segmentId) {
    const d = modal({ title: 'Change travel date', body: loading('Finding available flights…') });
    try {
      const o = await get(`/api/bookings/${bk.pnr}/change-options?segmentId=${segmentId}`);
      let chosen = null;
      $('.mb', d).innerHTML = `
        <p class="small muted">Current: <b class="mono">${esc(o.current.flightNo)}</b> ${fmtDateTime(o.current.departure)} · ${o.passengers} passenger(s). Change fee ${money(o.options[0]?.feePerPax || 0, 0)} per person plus any fare difference.</p>
        ${o.options.length ? `<div class="option-list">${o.options.map((f) => `
          <button class="option" data-opt="${f.id}"><span><b>${fmtDate(f.departure)}</b> · ${fmtTime(f.departure)} <span class="mono small">${esc(f.flightNo)}</span><br><span class="small muted">${f.seatsLeft} seats left · fare ${money(f.fare, 0)}</span></span>
          <span class="right"><b>${f.totalCharge ? money(f.totalCharge) : 'Free'}</b><br><span class="small muted">to pay</span></span></button>`).join('')}</div>` : '<div class="empty">No alternative flights with enough seats.</div>'}
        <div id="merr"></div>`;
      const foot = document.createElement('div');
      foot.className = 'mf';
      foot.innerHTML = '<button class="btn" data-close>Close</button><button class="btn btn-primary" id="confirm" disabled>Confirm change</button>';
      d.append(foot);
      foot.querySelector('[data-close]').addEventListener('click', () => d.close());
      $$('[data-opt]', d).forEach((btn) => btn.addEventListener('click', () => {
        chosen = o.options.find((x) => x.id === Number(btn.dataset.opt));
        $$('[data-opt]', d).forEach((x) => x.classList.toggle('on', x === btn));
        const c = $('#confirm', d);
        c.disabled = false;
        c.textContent = chosen.totalCharge ? `Pay ${money(chosen.totalCharge)} & confirm` : 'Confirm change';
      }));
      $('#confirm', d).addEventListener('click', guard($('#confirm', d), async () => {
        const r = await post(`/api/bookings/${bk.pnr}/change`, { segmentId, newFlightId: chosen.id });
        closeModal();
        toast(`Changed to ${r.flight.flightNo} on ${fmtDate(r.flight.departure)}. Seats ${r.seats.join(', ')}.`, 'ok');
        bookingPage(el, { pnr }, {});
      }, $('#merr', d)));
    } catch (e) { $('.mb', d).innerHTML = errorBox(e); }
  }
}

export function manage(el) {
  el.innerHTML = `
    <div style="max-width:520px;margin:24px auto">
      <form class="card" id="f"><h1>Manage booking</h1>
        <p class="muted">Change dates, cancel or download your e-ticket. No account needed.</p>
        <div id="err"></div>
        <div class="field"><label>Booking reference (PNR)</label><input name="pnr" maxlength="6" placeholder="e.g. KWM7KS" style="text-transform:uppercase;font-family:var(--mono)" required></div>
        <div class="field"><label>Passenger surname</label><input name="surname" required></div>
        <button class="btn btn-primary btn-block btn-lg">Find booking</button>
        ${state.user ? '<p class="small muted" style="margin-top:12px">Signed in? Your bookings are also under <a href="#/trips">My trips</a>.</p>' : ''}
      </form></div>`;
  const f = $('#f');
  f.addEventListener('submit', guard(f.querySelector('button'), async () => {
    const r = await post('/api/bookings/lookup', formData(f));
    saveBookingToken(r.pnr, r.token);
    go(`/booking/${r.pnr}`);
  }, $('#err')));
}

export async function trips(el) {
  const { bookings } = await get('/api/bookings/mine');
  const now = new Date().toISOString();
  const up = bookings.filter((b) => b.legs.some((l) => l.departure > now) && b.status !== 'CANCELLED');
  const past = bookings.filter((b) => !up.includes(b));
  const row = (b) => `<a class="card deal" href="#/booking/${esc(b.pnr)}" style="display:flex">
      <span><span class="mono"><b>${esc(b.pnr)}</b></span> ${badge(b.status)}<br>
      ${b.legs.map((l) => `<span class="small"><span class="mono">${esc(l.flightNo)}</span> · ${esc(city(l.route.split('-')[0]))} → ${esc(city(l.route.split('-')[1]))} · ${fmtDateTime(l.departure)}</span>`).join('<br>')}</span>
      <span class="right"><b>${money(b.total)}</b><br><span class="small muted">${b.pax} pax · ${esc(TIER_LABEL[b.tier])}</span></span></a>`;
  el.innerHTML = `
    <div class="page-head"><div><h1>My trips</h1><p>Bookings made with your account</p></div><a class="btn btn-accent" href="#/">Book a flight</a></div>
    <h2>Upcoming</h2>${up.length ? `<div class="stack">${up.map(row).join('')}</div>` : '<div class="card empty">No upcoming trips. Time to plan one?</div>'}
    <h2 style="margin-top:24px">Past & cancelled</h2>${past.length ? `<div class="stack">${past.map(row).join('')}</div>` : '<div class="card empty">Nothing here yet.</div>'}`;
}
