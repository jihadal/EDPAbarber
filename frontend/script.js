/* =====================================================
   EDPAbarber — Frontend Script
   All pages: homepage, login, booking, preview,
   customer dashboard, admin dashboard
   ===================================================== */

'use strict';

/* ── helpers ─────────────────────────────────────────── */
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g,
  m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
const money = n =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
    .format(Number(n || 0));
const dateID = d => {
  if (!d) return '—';
  // Ambil hanya bagian YYYY-MM-DD jika ada timestamp lengkap (ISO / datetime dari DB)
  const dateOnly = String(d).slice(0, 10);
  const dt = new Date(dateOnly + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDatetime = (date, time) =>
  date ? `${dateID(date)} · ${time || '—'}` : '—';

/* ── api fetch ───────────────────────────────────────── */
const API_BASE = '/api';
async function api(path, opts = {}) {
  const token = sessionStorage.getItem('edpa_token');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}

/* ── auth helpers ────────────────────────────────────── */
function getUser()  { try { return JSON.parse(sessionStorage.getItem('edpa_user')); } catch { return null; } }
function getToken() { return sessionStorage.getItem('edpa_token'); }
function requireAuth(role) {
  if (!getToken()) { location.href = 'login.html'; return false; }
  const u = getUser();
  if (role && u?.role !== role) {
    location.href = u?.role === 'admin' ? 'admin-dashboard.html' : 'customer-dashboard.html';
    return false;
  }
  return true;
}

/* ── modal helpers ───────────────────────────────────── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  else console.warn('openModal: element not found —', id);
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}
window.closeModal = closeModal;

/* ── logout ──────────────────────────────────────────── */
function setupLogout() {
  $$('[data-logout]').forEach(btn => {
    btn.onclick = async () => {
      try { await api('/auth/logout', { method: 'POST' }); } catch {}
      sessionStorage.clear();
      location.href = 'index.html';
    };
  });
}

/* ── mobile menu ─────────────────────────────────────── */
function setupMenu() {
  const toggle = $('.menu-toggle');
  const nav    = $('.nav');
  if (toggle && nav) {
    toggle.onclick = () => nav.classList.toggle('open');
    // close on link click
    $$('.nav a').forEach(a => { a.onclick = () => nav.classList.remove('open'); });
  }
}

/* =====================================================
   RENDER HELPERS (shared card builders)
   ===================================================== */
function buildServiceCard(s, index, total) {
  return `
    <div class="service-card">
      <div class="service-img" style="background-image:url('${esc(s.image || 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=900&q=80')}')">
        <div class="service-img-overlay"></div>
        <span class="service-img-num">${String(index).padStart(2,'0')} / ${String(total).padStart(2,'0')}</span>
      </div>
      <div class="service-body">
        <div class="service-name">${esc(s.name)}</div>
        <p class="service-desc">${esc(s.description || 'Premium grooming service by EDPAbarber.')}</p>
        <div class="service-footer">
          <div>
            <div class="service-price">${money(s.price)}</div>
            <div class="service-dur">${s.duration} menit</div>
          </div>
          <a class="btn btn-gold btn-sm" href="booking.html?service_id=${s.id}">BOOK NOW</a>
        </div>
      </div>
    </div>`;
}

function buildBarberCard(b) {
  const initials = b.name.trim().split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const photo = b.photo
    ? `background-image:url('${esc(b.photo)}')`
    : `background:linear-gradient(135deg,#1a1a1a,#111)`;
  const skills = (b.specialization || 'Master Barber').split(',').map(t =>
    `<span class="tag">${esc(t.trim())}</span>`).join('');
  return `
    <div class="barber-card">
      <div class="barber-photo-wrap" style="${photo}">
        ${!b.photo ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:900;color:var(--gold);opacity:.3">${initials}</div>` : ''}
        <div class="barber-photo-overlay"></div>
      </div>
      <div class="barber-info">
        <div class="barber-name">${esc(b.name)}</div>
        <div class="barber-role">${esc(b.specialization || 'Master Barber')}</div>
        <div class="barber-tags">${skills}</div>
        <a class="btn btn-gold btn-sm full" href="booking.html?barber_id=${b.id}" style="margin-top:16px">PILIH BARBER</a>
      </div>
    </div>`;
}

/* =====================================================
   HOMEPAGE
   ===================================================== */
async function initHome() {
  const svcGrid = $('#homeServiceGrid');
  const brbGrid = $('#homeBarbersGrid');
  if (!svcGrid && !brbGrid) return;

  if (svcGrid) {
    try {
      const { services } = await api('/services?status=active');
      if (services.length) {
        svcGrid.innerHTML = services.map((s, i) => buildServiceCard(s, i + 1, services.length)).join('');
      }
    } catch (e) {
      if (svcGrid) svcGrid.innerHTML = `<p class="form-message error">${esc(e.message)}</p>`;
    }
  }

  if (brbGrid) {
    try {
      const { barbers } = await api('/barbers?status=active');
      brbGrid.innerHTML = barbers.length
        ? barbers.map(b => buildBarberCard(b)).join('')
        : '<p style="color:var(--muted)">No barbers available.</p>';
    } catch (e) {
      brbGrid.innerHTML = `<p class="form-message error">${esc(e.message)}</p>`;
    }
  }
}

/* =====================================================
   SERVICES PAGE
   ===================================================== */
async function initServicesPage() {
  const grid = $('#allServicesGrid');
  if (!grid) return;
  try {
    const { services } = await api('/services?status=active');
    grid.innerHTML = services.length
      ? services.map((s, i) => buildServiceCard(s, i + 1, services.length)).join('')
      : '<p style="color:var(--muted)">No services available.</p>';
  } catch (e) {
    grid.innerHTML = `<p class="form-message error">${esc(e.message)}</p>`;
  }
}

/* =====================================================
   BARBERS PAGE
   ===================================================== */
async function initBarbersPage() {
  const grid = $('#allBarbersGrid');
  if (!grid) return;
  try {
    const { barbers } = await api('/barbers?status=active');
    grid.innerHTML = barbers.length
      ? barbers.map(b => buildBarberCard(b)).join('')
      : '<p style="color:var(--muted)">No barbers available.</p>';
  } catch (e) {
    grid.innerHTML = `<p class="form-message error">${esc(e.message)}</p>`;
  }
}

/* =====================================================
   LOGIN PAGE
   ===================================================== */
function initLogin() {
  const loginForm = $('#loginForm');
  const regForm   = $('#registerForm');
  if (!loginForm && !regForm) return;

  // Redirect if already logged in
  const u = getUser();
  if (u && getToken()) {
    location.href = u.role === 'admin' ? 'admin-dashboard.html' : 'customer-dashboard.html';
    return;
  }

  if (loginForm) {
    loginForm.onsubmit = async e => {
      e.preventDefault();
      const msg = $('#loginMsg');
      msg.textContent = 'Signing in...';
      msg.className   = 'form-message';
      try {
        const data = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email:    $('#loginEmail').value.trim(),
            password: $('#loginPassword').value
          })
        });
        sessionStorage.setItem('edpa_token', data.token);
        sessionStorage.setItem('edpa_user',  JSON.stringify(data.user));
        location.href = data.user.role === 'admin'
          ? 'admin-dashboard.html'
          : 'customer-dashboard.html';
      } catch (err) {
        msg.textContent = err.message;
        msg.className   = 'form-message error';
      }
    };
  }

  if (regForm) {
    regForm.onsubmit = async e => {
      e.preventDefault();
      const msg = $('#registerMsg');
      msg.textContent = 'Creating account...';
      msg.className   = 'form-message';
      try {
        const data = await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name:    $('#regName').value.trim(),
            email:   $('#regEmail').value.trim(),
            password:$('#regPassword').value,
            phone:   $('#regPhone').value.trim(),
            address: $('#regAddress')?.value.trim() || ''
          })
        });
        sessionStorage.setItem('edpa_token', data.token);
        sessionStorage.setItem('edpa_user',  JSON.stringify(data.user));
        location.href = 'customer-dashboard.html';
      } catch (err) {
        msg.textContent = err.message;
        msg.className   = 'form-message error';
      }
    };
  }
}

/* =====================================================
   BOOKING PAGE — 6-step wizard
   ===================================================== */
// Shared booking state
let bk = {
  step: 1,
  service:       null,  // {id, name, price, duration, rawPrice}
  barber:        null,  // {id, name, specialization}
  date:          '',
  time:          '',
  notes:         '',
  paymentMethod: ''     // 'qris' | 'cash'
};
window.bk = bk;

async function initBooking() {
  if (!$('#step-1')) return;
  if (!requireAuth('customer')) return;

  const params  = new URLSearchParams(location.search);
  const svcId   = params.get('service_id');
  const brbId   = params.get('barber_id');

  // Load services & barbers in parallel
  try {
    const [{ services }, { barbers }] = await Promise.all([
      api('/services?status=active'),
      api('/barbers?status=active')
    ]);
    renderServiceOptions(services, svcId);
    renderBarberOptions(barbers, brbId);
    // Store full objects for use in selectService/selectBarber
    window._services = services;
    window._barbers  = barbers;
    // Pre-select from URL params
    if (svcId) {
      const s = services.find(s => String(s.id) === svcId);
      if (s) {
        bk.service = { id: s.id, name: s.name, price: money(s.price), duration: s.duration, rawPrice: s.price };
        $(`#svc-${s.id}`)?.classList.add('selected');
      }
    }
    if (brbId) {
      const b = barbers.find(b => String(b.id) === brbId);
      if (b) {
        bk.barber = { id: b.id, name: b.name, specialization: b.specialization };
        $(`#brb-${b.id}`)?.classList.add('selected');
      }
    }
  } catch (e) {
    $('#serviceOptions').innerHTML = `<p class="form-message error">${esc(e.message)}</p>`;
  }

  // Set minimum date = today (booking hari ini diizinkan)
  const minDate = new Date();
  const dateInput = $('#bookingDate');
  if (dateInput) {
    dateInput.min = minDate.toISOString().slice(0, 10);
    if (bk.date) dateInput.value = bk.date;
  }

  goStep(bk.step);
}

function renderServiceOptions(services, preselect) {
  const el = $('#serviceOptions');
  if (!el) return;
  el.innerHTML = services.map(s => `
    <div class="option-card ${preselect && String(s.id) === preselect ? 'selected' : ''}"
         id="svc-${s.id}" onclick="selectService(${s.id})">
      <div class="opt-radio"><div class="opt-radio-dot"></div></div>
      <div class="opt-body">
        <div class="opt-name">${esc(s.name)}</div>
        <div class="opt-desc">${esc(s.description || '')} · ${s.duration} menit</div>
      </div>
      <div class="opt-right">
        <div class="opt-price">${money(s.price)}</div>
        <div class="opt-dur">${s.duration} menit</div>
      </div>
    </div>`).join('');
}

function renderBarberOptions(barbers, preselect) {
  const el = $('#barberOptions');
  if (!el) return;
  el.innerHTML = barbers.map((b, i) => `
    <div class="barber-opt ${preselect && String(b.id) === preselect ? 'selected' : ''}"
         id="brb-${b.id}" onclick="selectBarber(${b.id})">
      <div class="barber-opt-num">${String(i+1).padStart(2,'0')}</div>
      <div style="flex:1">
        <div class="barber-opt-name">${esc(b.name)}</div>
        <div class="barber-opt-role">${esc(b.specialization || 'Master Barber')}</div>
      </div>
      <div class="opt-radio"><div class="opt-radio-dot"></div></div>
    </div>`).join('');
}

window.selectService = function(id) {
  const numId = Number(id);
  $$('.option-card').forEach(c => c.classList.remove('selected'));
  $(`#svc-${numId}`)?.classList.add('selected');
  // Always use the API object stored in _services
  const s = (window._services || []).find(x => x.id === numId);
  if (s) {
    bk.service = { id: s.id, name: s.name, price: money(s.price), duration: s.duration, rawPrice: s.price };
  }
};

window.selectBarber = function(id) {
  const numId = Number(id);
  $$('.barber-opt').forEach(c => c.classList.remove('selected'));
  $(`#brb-${numId}`)?.classList.add('selected');
  const b = (window._barbers || []).find(x => x.id === numId);
  bk.barber = b ? { id: b.id, name: b.name, specialization: b.specialization } : { id: numId };
};

window.onDateChange = function(val) {
  bk.date = val;
  bk.time = '';
  $('#step4Sub') && ($('#step4Sub').textContent = `Pilih waktu yang cocok untuk ${dateID(val)}.`);
  renderTimeSlots();
};

async function renderTimeSlots() {
  const el = $('#timeGrid');
  if (!el) return;

  const slots = [];
  for (let h = 9; h <= 20; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    if (h < 20) slots.push(`${String(h).padStart(2,'0')}:30`);
  }

  // Fetch taken slots for selected barber + date
  let taken = [];
  if (bk.barber?.id && bk.date) {
    try {
      const { bookings } = await api(
        `/bookings?date=${bk.date}&barber_id=${bk.barber.id}`
      );
      taken = bookings
        .filter(b => ['pending','confirmed'].includes(b.status))
        .map(b => b.booking_time?.slice(0,5));
    } catch {}
  }

  el.innerHTML = slots.map(t => {
    const unavail = taken.includes(t);
    return `<button type="button"
      class="time-btn ${bk.time === t ? 'selected' : ''} ${unavail ? 'unavailable' : ''}"
      onclick="selectTime('${t}')"
      ${unavail ? 'disabled title="Slot sudah dipesan"' : ''}
    >${t}</button>`;
  }).join('');
}

window.selectTime = function(t) {
  bk.time = t;
  $$('.time-btn').forEach(b => b.classList.remove('selected'));
  $$('.time-btn').forEach(b => { if (b.textContent.trim() === t) b.classList.add('selected'); });
};

function goStep(n) {
  // Hide all panels
  $$('.step-panel').forEach(p => p.classList.remove('active'));
  const panel = $(`#step-${n}`);
  if (panel) panel.classList.add('active');

  // Update progress bar (7 steps now)
  for (let i = 1; i <= 7; i++) {
    const ps = $(`#ps-${i}`);
    if (!ps) continue;
    ps.classList.remove('active', 'done');
    if (i < n) ps.classList.add('done');
    else if (i === n) ps.classList.add('active');
  }

  bk.step = n;
  if (n === 4) renderTimeSlots();
  if (n === 6) renderSummary();
  if (n === 7) renderPaymentStep();

  // Scroll to top of booking area
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.goStep = goStep;

window.bookingNext = function() {
  const msg = $(`#msg-${bk.step}`);
  if (msg) msg.textContent = '';

  if (bk.step === 1) {
    if (!bk.service) { if (msg) msg.textContent = 'Pilih layanan terlebih dahulu.'; return; }
  }
  if (bk.step === 2) {
    if (!bk.barber) { if (msg) msg.textContent = 'Pilih barber terlebih dahulu.'; return; }
  }
  if (bk.step === 3) {
    if (!bk.date) { if (msg) msg.textContent = 'Pilih tanggal terlebih dahulu.'; return; }
  }
  if (bk.step === 4) {
    if (!bk.time) { if (msg) msg.textContent = 'Pilih jam terlebih dahulu.'; return; }
  }
  if (bk.step < 7) goStep(bk.step + 1);
};

window.bookingBack = function() {
  if (bk.step > 1) goStep(bk.step - 1);
};

function renderSummary() {
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('#sum-service',  bk.service?.name  || '—');
  set('#sum-barber',   bk.barber?.name   || '—');
  set('#sum-datetime', fmtDatetime(bk.date, bk.time));
  set('#sum-notes',    bk.notes?.trim()  || 'Tidak ada');
  // Show formatted price: use rawPrice (number) if available, else price string
  const displayPrice = bk.service?.rawPrice != null
    ? money(bk.service.rawPrice)
    : (bk.service?.price || '—');
  set('#sum-price', displayPrice);
}

/* ── Payment step ─────────────────────────────────── */
function renderPaymentStep() {
  // Reset selection state
  bk.paymentMethod = '';
  $$('#pay-qris, #pay-cash').forEach(c => c.classList.remove('selected'));
  const qrisPanel = document.getElementById('qrisPanel');
  const cashPanel = document.getElementById('cashPanel');
  if (qrisPanel) qrisPanel.classList.add('hidden');
  if (cashPanel) cashPanel.classList.add('hidden');

  // Lock confirm button until method chosen
  const btn = document.getElementById('confirmBtn');
  if (btn) { btn.disabled = true; btn.style.opacity = '.4'; btn.style.cursor = 'not-allowed'; }

  // Show price in panels
  const rawPrice = bk.service?.rawPrice != null ? bk.service.rawPrice : 0;
  const dp       = Math.ceil(rawPrice / 2);
  const remain   = rawPrice - dp;
  const price    = rawPrice > 0 ? money(rawPrice) : (bk.service?.price || '—');
  const dpFmt    = rawPrice > 0 ? money(dp) : '—';
  const remFmt   = rawPrice > 0 ? money(remain) : '—';

  const qaEl  = document.getElementById('qrAmount');
  const caEl  = document.getElementById('cashAmount');
  const dpEl  = document.getElementById('dpAmount');
  const remEl = document.getElementById('remainAmount');
  const qaLbl = document.getElementById('qrAmountLabel');

  if (qaEl) qaEl.textContent = dpFmt;
  if (caEl) caEl.textContent = price;
  if (dpEl) dpEl.textContent = dpFmt;
  if (remEl) remEl.textContent = remFmt;

  // Build QRIS art
  buildQRArt();
}

function buildQRArt() {
  const qrEl = document.getElementById('qrDisplay');
  if (!qrEl) return;
  // 9x9 = 81 cells visual QR pattern
  const pattern = [
    1,1,1,1,1,1,1,0,0,
    1,0,0,0,0,0,1,0,1,
    1,0,1,1,1,0,1,0,0,
    1,0,1,1,1,0,1,0,1,
    1,0,1,1,1,0,1,0,0,
    1,0,0,0,0,0,1,0,1,
    1,1,1,1,1,1,1,0,1,
    0,0,0,0,0,0,0,0,0,
    1,0,1,0,1,1,1,0,1
  ];
  qrEl.innerHTML = pattern.map(on =>
    `<div style="background:${on ? '#111' : 'white'};border-radius:1px"></div>`
  ).join('');
  qrEl.style.cssText = 'width:160px;height:160px;background:white;border-radius:8px;margin:0 auto 16px;display:grid;grid-template-columns:repeat(9,1fr);gap:1px;padding:12px';
}

window.selectPayment = function(method) {
  bk.paymentMethod = method;

  // Update card selection
  $$('#pay-qris, #pay-cash').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(method === 'qris' ? 'pay-qris' : 'pay-cash');
  if (card) card.classList.add('selected');

  // Show/hide panels
  const qrisPanel = document.getElementById('qrisPanel');
  const cashPanel = document.getElementById('cashPanel');
  if (qrisPanel) qrisPanel.classList.toggle('hidden', method !== 'qris');
  if (cashPanel) cashPanel.classList.toggle('hidden', method !== 'cash');

  // Enable confirm button
  const btn = document.getElementById('confirmBtn');
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
};

window.submitBooking = async function() {
  const btn = document.getElementById('confirmBtn');
  const msg = document.getElementById('msg-7') || document.getElementById('msg-6');
  if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = 'Memproses...'; }
  if (msg) { msg.textContent = ''; msg.className = 'form-message'; }

  // Final validation
  if (!bk.service?.id)   { if (msg) { msg.textContent = 'Pilih layanan terlebih dahulu.';            msg.className = 'form-message error'; } resetBtn(btn); return; }
  if (!bk.barber?.id)    { if (msg) { msg.textContent = 'Pilih barber terlebih dahulu.';             msg.className = 'form-message error'; } resetBtn(btn); return; }
  if (!bk.date)          { if (msg) { msg.textContent = 'Pilih tanggal terlebih dahulu.';            msg.className = 'form-message error'; } resetBtn(btn); return; }
  if (!bk.time)          { if (msg) { msg.textContent = 'Pilih jam terlebih dahulu.';                msg.className = 'form-message error'; } resetBtn(btn); return; }
  if (!bk.paymentMethod) { if (msg) { msg.textContent = 'Pilih metode pembayaran terlebih dahulu.'; msg.className = 'form-message error'; } resetBtn(btn); return; }

  try {
    const { booking } = await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        service_id:     Number(bk.service.id),
        barber_id:      Number(bk.barber.id),
        booking_date:   bk.date,
        booking_time:   bk.time,
        notes:          bk.notes || null,
        payment_method: bk.paymentMethod
      })
    });
    sessionStorage.setItem('edpa_preview', JSON.stringify({
      ...booking,
      payment_method: bk.paymentMethod
    }));
    location.href = 'preview.html';
  } catch (err) {
    if (msg) { msg.textContent = err.message; msg.className = 'form-message error'; }
    resetBtn(btn);
  }
};

function resetBtn(btn) {
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; btn.textContent = 'KONFIRMASI BOOKING →'; }
}

/* =====================================================
   PREVIEW / CONFIRMATION PAGE
   ===================================================== */
function initPreview() {
  const card = $('#confirmCard');
  if (!card) return;

  const booking = (() => {
    try { return JSON.parse(sessionStorage.getItem('edpa_preview')); } catch { return null; }
  })();

  if (!booking) {
    card.innerHTML = `
      <div style="text-align:center;padding:40px 0">
        <p style="color:var(--muted);margin-bottom:24px">No booking data found.</p>
        <a class="btn btn-gold" href="booking.html">MAKE A BOOKING ↗</a>
      </div>`;
    return;
  }

  // Build QR art
  const qrCells = Array.from({ length: 25 }, (_, i) => {
    const corners = [0,1,2,5,6,10,14,18,19,20,22,23,24];
    const on = corners.includes(i) || Math.random() > 0.45;
    return `<div class="qr-cell" style="background:${on ? 'var(--gold)' : 'transparent'}"></div>`;
  }).join('');

  const code = booking.booking_code || '—';
  const payMethod = booking.payment_method || 'cash';
  const payLabel  = payMethod === 'qris' ? '⬛ QRIS' : '💵 Tunai';
  const waMsg = encodeURIComponent(
    `Halo EDPAbarber, saya ingin konfirmasi booking.\n\n` +
    `Booking ID: ${code}\n` +
    `Layanan: ${booking.service_name}\n` +
    `Barber: ${booking.barber_name}\n` +
    `Tanggal: ${booking.booking_date}\n` +
    `Jam: ${booking.booking_time}\n` +
    `Total: ${money(booking.total_price)}\n` +
    `Metode Bayar: ${payMethod === 'qris' ? 'QRIS' : 'Tunai'}\n` +
    `Status: ${booking.status?.toUpperCase()}\n\nTerima kasih.`
  );
  const waNumber = '62895415418661';

  card.innerHTML = `
    <div class="confirm-icon">✓</div>
    <div class="eyebrow-line" style="justify-content:center;margin-bottom:12px">BOOKING CONFIRMED</div>
    <h2 class="confirm-h2">Looking good, ${esc(booking.service_name)} is on the calendar.</h2>
    <p class="confirm-sub">Booking kamu sudah diterima. Tunjukkan kode ini saat datang ke barbershop.</p>

    <div class="confirm-meta">
      <div class="confirm-pill"><strong>${esc(code)}</strong></div>
      <div class="confirm-pill">${esc(booking.barber_name)}</div>
      <div class="confirm-pill">${dateID(booking.booking_date)} · ${booking.booking_time?.slice(0,5)}</div>
      <div class="confirm-pill"><strong>${money(booking.total_price)}</strong></div>
    </div>

    <div class="qr-block">
      <div class="qr-inner">${qrCells}</div>
    </div>
    <p style="font-size:11px;color:var(--muted);margin-bottom:28px">Booking ID: ${esc(code)}</p>

    <div class="ticket">
      <div class="ticket-code">${esc(code)}</div>
      <div class="ticket-row"><span class="label">Layanan</span><strong>${esc(booking.service_name)}</strong></div>
      <div class="ticket-row"><span class="label">Barber</span><strong>${esc(booking.barber_name)}</strong></div>
      <div class="ticket-row"><span class="label">Tanggal</span><strong>${dateID(booking.booking_date)}</strong></div>
      <div class="ticket-row"><span class="label">Jam</span><strong>${booking.booking_time?.slice(0,5)} WIB</strong></div>
      <div class="ticket-row"><span class="label">Durasi</span><strong>${booking.duration} menit</strong></div>
      <div class="ticket-row"><span class="label">Metode Bayar</span><strong>${esc(payLabel)}</strong></div>
      <div class="ticket-row"><span class="label">Status</span><span class="badge ${esc(booking.status)}">${esc(booking.status)}</span></div>
      <div class="ticket-row"><span class="label">Total</span><strong style="color:var(--gold)">${money(booking.total_price)}</strong></div>
    </div>

    <div class="confirm-actions">
      <a class="btn btn-gold" href="customer-dashboard.html">LIHAT DASHBOARD ↗</a>
      <a class="btn btn-outline" href="https://wa.me/${waNumber}?text=${waMsg}" target="_blank">
        📱 KONFIRMASI WHATSAPP
      </a>
    </div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-outline full" onclick="printStruk()" style="width:100%">🖨️ CETAK STRUK</button>
      <a class="btn btn-ghost full" href="booking.html">BOOKING LAGI</a>
    </div>`;
}

/* =====================================================
   PRINT STRUK
   ===================================================== */
window.printStruk = function() {
  const booking = (() => {
    try { return JSON.parse(sessionStorage.getItem('edpa_preview')); } catch { return null; }
  })();
  if (!booking) { alert('Data booking tidak ditemukan.'); return; }

  const payMethod = booking.payment_method || 'cash';
  const payLabel  = payMethod === 'qris' ? 'QRIS' : 'Tunai';
  const code      = booking.booking_code || '—';

  const win = window.open('', '_blank', 'width=420,height=620');
  win.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Struk Booking — EDPAbarber</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; background:#fff; color:#111; padding:24px; width:380px; }
    .logo { text-align:center; font-size:22px; font-weight:900; letter-spacing:2px; margin-bottom:2px; }
    .logo em { font-style:normal; color:#B8962E; }
    .tagline { text-align:center; font-size:10px; color:#666; letter-spacing:3px; text-transform:uppercase; margin-bottom:16px; }
    .divider { border:none; border-top:1px dashed #bbb; margin:12px 0; }
    .title { text-align:center; font-size:11px; letter-spacing:3px; text-transform:uppercase; margin-bottom:12px; font-weight:700; }
    .row { display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px; }
    .row .lbl { color:#555; font-size:10px; letter-spacing:1px; text-transform:uppercase; }
    .row .val { font-weight:700; text-align:right; max-width:55%; }
    .code-box { text-align:center; font-size:26px; font-weight:900; letter-spacing:4px; color:#B8962E; margin:14px 0 4px; }
    .total-row { display:flex; justify-content:space-between; font-size:14px; font-weight:900; margin-top:10px; border-top:2px solid #111; padding-top:10px; }
    .total-row .val { color:#B8962E; }
    .footer { text-align:center; font-size:10px; color:#888; margin-top:18px; line-height:1.8; }
    .status-badge { display:inline-block; padding:2px 10px; border:1px solid #B8962E; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#B8962E; }
    @media print {
      body { padding:8px; }
      .no-print { display:none; }
    }
  </style>
</head>
<body>
  <div class="logo"><span>EDPA</span><em>barber</em></div>
  <div class="tagline">Barbershop & Style</div>
  <hr class="divider">
  <div class="title">Struk Booking</div>

  <div class="code-box">${esc(code)}</div>
  <p style="text-align:center;font-size:10px;color:#888;margin-bottom:12px">Booking ID</p>

  <hr class="divider">

  <div class="row"><span class="lbl">Layanan</span><span class="val">${esc(booking.service_name || '—')}</span></div>
  <div class="row"><span class="lbl">Barber</span><span class="val">${esc(booking.barber_name || '—')}</span></div>
  <div class="row"><span class="lbl">Tanggal</span><span class="val">${dateID(booking.booking_date)}</span></div>
  <div class="row"><span class="lbl">Jam</span><span class="val">${(booking.booking_time || '').slice(0,5)} WIB</span></div>
  <div class="row"><span class="lbl">Durasi</span><span class="val">${booking.duration || '—'} menit</span></div>
  <div class="row"><span class="lbl">Metode Bayar</span><span class="val">${esc(payLabel)}</span></div>
  <div class="row"><span class="lbl">Status</span><span class="val"><span class="status-badge">${esc(booking.status || '—')}</span></span></div>
  ${booking.notes ? `<div class="row"><span class="lbl">Catatan</span><span class="val">${esc(booking.notes)}</span></div>` : ''}

  <div class="total-row">
    <span>TOTAL</span>
    <span class="val">${money(booking.total_price)}</span>
  </div>

  <hr class="divider">
  <div class="footer">
    Terima kasih telah memilih EDPAbarber.<br>
    Tunjukkan kode booking ini saat datang.<br>
    Dicetak: ${new Date().toLocaleString('id-ID', {day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}
  </div>

  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
};

/* =====================================================
   CUSTOMER DASHBOARD
   ===================================================== */
async function initCustomerDash() {
  if (!$('#custName')) return;
  if (!requireAuth('customer')) return;

  try {
    const { user } = await api('/auth/me');
    $('#custName').textContent = user.name + '.';

    const { bookings } = await api('/bookings');
    const upcoming = bookings.filter(b => ['pending','confirmed'].includes(b.status));
    const history  = bookings.filter(b => ['completed','cancelled'].includes(b.status));
    const spend    = bookings
      .filter(b => b.status === 'completed')
      .reduce((a, b) => a + Number(b.total_price), 0);

    // Stats
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('#st-total',    bookings.length);
    set('#st-upcoming', upcoming.length);
    set('#st-done',     bookings.filter(b => b.status === 'completed').length);
    set('#st-spend',    money(spend));

    // Upcoming
    const upEl = $('#upcomingList');
    upEl.innerHTML = upcoming.length
      ? upcoming.map(b => buildBookingItem(b, true)).join('')
      : '<p style="color:var(--muted);font-size:13px;padding:10px 0">Tidak ada booking mendatang.</p>';

    // History
    const hiEl = $('#historyList');
    hiEl.innerHTML = history.length
      ? history.map(b => buildBookingItem(b, false)).join('')
      : '<p style="color:var(--muted);font-size:13px;padding:10px 0">Belum ada riwayat booking.</p>';

    // Attach cancel handlers
    $$('.cancel-btn').forEach(btn => {
      btn.onclick = () => cancelBooking(btn.dataset.id);
    });
    // Attach detail handlers
    $$('.detail-btn').forEach(btn => {
      btn.onclick = () => showBookingDetail(btn.dataset.id, bookings);
    });

  } catch (e) {
    alert('Gagal memuat dashboard: ' + e.message);
  }
}

function buildBookingItem(b, showCancel) {
  const payInfo = b.payment_method
    ? `<span style="font-size:11px;color:var(--muted);margin-left:8px">${payMethodLabel(b.payment_method)}</span>`
    : '';
  return `
    <div class="booking-item">
      <div class="booking-item-left">
        <div>
          <div class="booking-code">${esc(b.booking_code)}</div>
          <div class="booking-service-name">${esc(b.service_name)}</div>
          <div class="booking-meta-text">${esc(b.barber_name)} · ${dateID(b.booking_date)} · ${b.booking_time?.slice(0,5)}</div>
        </div>
      </div>
      <div class="booking-actions">
        <span class="badge ${esc(b.status)}">${esc(b.status)}</span>
        ${payBadge(b.payment_status)}${payInfo}
        <button class="btn btn-ghost btn-sm detail-btn" data-id="${b.id}">Detail</button>
        ${showCancel ? `<button class="btn btn-danger btn-sm cancel-btn" data-id="${b.id}">Batal</button>` : ''}
      </div>
    </div>`;
}

async function cancelBooking(id) {
  if (!confirm('Batalkan booking ini?')) return;
  try {
    await api(`/bookings/${id}`, { method: 'DELETE' });
    initCustomerDash();
  } catch (e) {
    alert(e.message);
  }
}

function showBookingDetail(id, bookings) {
  const b = bookings.find(x => String(x.id) === String(id));
  if (!b) return;
  const waMsg = encodeURIComponent(
    `Halo EDPAbarber, konfirmasi booking:\n\n` +
    `ID: ${b.booking_code}\nLayanan: ${b.service_name}\nBarber: ${b.barber_name}\n` +
    `Tanggal: ${b.booking_date} ${b.booking_time?.slice(0,5)}\nTotal: ${money(b.total_price)}`
  );
  $('#bookingModalContent').innerHTML = `
    <div class="eyebrow-line" style="margin-bottom:16px">DETAIL BOOKING</div>
    <div class="ticket">
      <div class="ticket-code">${esc(b.booking_code)}</div>
      <div class="ticket-row"><span class="label">Layanan</span><strong>${esc(b.service_name)}</strong></div>
      <div class="ticket-row"><span class="label">Barber</span><strong>${esc(b.barber_name)}</strong></div>
      <div class="ticket-row"><span class="label">Tanggal</span><strong>${dateID(b.booking_date)}</strong></div>
      <div class="ticket-row"><span class="label">Jam</span><strong>${b.booking_time?.slice(0,5)} WIB</strong></div>
      <div class="ticket-row"><span class="label">Durasi</span><strong>${b.duration} menit</strong></div>
      <div class="ticket-row"><span class="label">Catatan</span><strong>${esc(b.notes || '—')}</strong></div>
      <div class="ticket-row"><span class="label">Status</span><span class="badge ${esc(b.status)}">${esc(b.status)}</span></div>
      <div class="ticket-row"><span class="label">Total</span><strong style="color:var(--gold)">${money(b.total_price)}</strong></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
      <a class="btn btn-outline" href="https://wa.me/62895415418661?text=${waMsg}" target="_blank">📱 WhatsApp</a>
      <button class="btn btn-ghost" onclick="closeModal('bookingModal')">TUTUP</button>
    </div>`;
  openModal('bookingModal');
}

/* =====================================================
   ADMIN DASHBOARD
   ===================================================== */
let adminCalYear  = new Date().getFullYear();
let adminCalMonth = new Date().getMonth();
window.calShift   = n => { adminCalMonth += n; if (adminCalMonth < 0) { adminCalMonth = 11; adminCalYear--; } if (adminCalMonth > 11) { adminCalMonth = 0; adminCalYear++; } renderCalendar(); };

async function initAdmin() {
  if (!$('#sec-dashboard')) return;
  if (!requireAuth('admin')) return;

  // Set avatar / label
  const u = getUser();
  if (u) {
    const el = $('#adminUserLabel'); if (el) el.textContent = u.name;
    const av = $('#adminAvatar'); if (av) av.textContent = u.name[0].toUpperCase();
  }

  // Sidebar nav switching
  $$('[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const sec = link.dataset.section;
      $$('[data-section]').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      $$('.admin-section').forEach(s => s.classList.add('hidden'));
      $(`#sec-${sec}`)?.classList.remove('hidden');
      const titleMap = {
        dashboard: 'Dashboard', bookings: 'Bookings', services: 'Services',
        barbers: 'Barbers', customers: 'Customers', payments: 'Payments', calendar: 'Calendar'
      };
      const titleEl = $('#adminPageTitle'); if (titleEl) titleEl.textContent = titleMap[sec] || sec;
      if (sec === 'bookings')  loadAdminBookings();
      if (sec === 'services')  loadAdminServices();
      if (sec === 'barbers')   loadAdminBarbers();
      if (sec === 'customers') loadAdminCustomers();
      if (sec === 'payments')  loadAdminPayments();
      if (sec === 'calendar')  renderCalendar();
    });
  });

  // Filter handlers
  $('#filterDate')?.addEventListener('change', loadAdminBookings);
  $('#filterStatus')?.addEventListener('change', loadAdminBookings);
  $('#filterBarber')?.addEventListener('change', loadAdminBookings);

  // Service / barber forms
  $('#serviceForm')?.addEventListener('submit', submitServiceForm);
  $('#barberForm')?.addEventListener('submit', submitBarberForm);

  // Populate barber filter
  try {
    const { barbers } = await api('/barbers');
    const sel = $('#filterBarber');
    if (sel) {
      barbers.forEach(b => {
        const o = document.createElement('option');
        o.value = b.id; o.textContent = b.name; sel.appendChild(o);
      });
    }
  } catch {}

  // Load initial data
  await loadAdminStats();
  await loadAdminBookingsDash();
}

/* ── badge helpers ───────────────────────────────────── */
function payBadge(status) {
  if (!status) return `<span class="badge inactive">belum ada</span>`;
  return `<span class="badge ${esc(status)}">${esc(status)}</span>`;
}
function payMethodLabel(method) {
  if (!method) return '—';
  if (method === 'qris')  return '⬛ QRIS';
  if (method === 'cash')  return '💵 Tunai';
  return esc(method);
}

async function loadAdminStats() {
  try {
    const { stats } = await api('/dashboard/stats');
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('#s-today',     stats.today_bookings);
    set('#s-month',     stats.total_bookings);
    set('#s-revenue',   money(stats.total_revenue));
    set('#s-customers', stats.total_customers);
  } catch (e) { console.warn('Stats error:', e.message); }
}

async function loadAdminBookingsDash() {
  const tbody = $('#dashBookings');
  if (!tbody) return;
  try {
    const { bookings } = await api('/bookings');
    const recent = bookings.slice(0, 8);
    tbody.innerHTML = recent.length
      ? recent.map(b => `
          <tr>
            <td class="t-id">${esc(b.booking_code)}</td>
            <td>${esc(b.customer_name)}</td>
            <td>${esc(b.service_name)}</td>
            <td>${esc(b.barber_name)}</td>
            <td>${dateID(b.booking_date)}</td>
            <td>${b.booking_time?.slice(0,5)}</td>
            <td style="color:var(--gold)">${money(b.total_price)}</td>
            <td><span class="badge ${esc(b.status)}">${esc(b.status)}</span></td>
            <td>${payBadge(b.payment_status)}</td>
          </tr>`).join('')
      : '<tr><td colspan="9" style="color:var(--muted)">No bookings yet.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="form-message error">${esc(e.message)}</td></tr>`;
  }
}

window.loadAdminBookings = async function() {
  const tbody = $('#bookingsTable');
  if (!tbody) return;
  const q = new URLSearchParams();
  const d = $('#filterDate')?.value;   if (d) q.set('date', d);
  const s = $('#filterStatus')?.value; if (s) q.set('status', s);
  const b = $('#filterBarber')?.value; if (b) q.set('barber_id', b);
  try {
    const { bookings } = await api('/bookings?' + q.toString());
    tbody.innerHTML = bookings.length
      ? bookings.map(b => `
          <tr>
            <td class="t-id">${esc(b.booking_code)}</td>
            <td>${esc(b.customer_name)}</td>
            <td>${esc(b.service_name)}</td>
            <td>${esc(b.barber_name)}</td>
            <td>${dateID(b.booking_date)}</td>
            <td>${b.booking_time?.slice(0,5)}</td>
            <td style="color:var(--gold)">${money(b.total_price)}</td>
            <td>
              <select class="status-select" data-id="${b.id}" data-prev="${esc(b.status)}" onchange="updateBookingStatus(this)">
                ${['pending','confirmed','completed','cancelled'].map(st =>
                  `<option value="${st}" ${st === b.status ? 'selected' : ''}>${st}</option>`
                ).join('')}
              </select>
            </td>
            <td>${payBadge(b.payment_status)}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="showAdminBookingDetail(${b.id})">Detail</button></td>
          </tr>`).join('')
      : '<tr><td colspan="10" style="color:var(--muted)">No bookings found.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10" class="form-message error">${esc(e.message)}</td></tr>`;
  }
};

window.updateBookingStatus = async function(sel) {
  try {
    await api(`/bookings/${sel.dataset.id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: sel.value })
    });
    await loadAdminStats();
  } catch (e) { alert(e.message); sel.value = sel.dataset.prev; }
  sel.dataset.prev = sel.value;
};

window.showAdminBookingDetail = async function(id) {
  const detailEl = document.getElementById('adminBookingDetail');
  if (!detailEl) { console.warn('adminBookingDetail not found'); return; }
  try {
    const { booking: b } = await api(`/bookings/${id}`);

    const paidAtStr = b.paid_at
      ? new Date(b.paid_at).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';

    detailEl.innerHTML = `
      <div class="eyebrow-line" style="margin-bottom:16px">BOOKING DETAIL</div>
      <div class="ticket">
        <div class="ticket-code">${esc(b.booking_code)}</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">

          <div style="border-bottom:1px solid var(--border);padding:12px 0">
            <div class="label" style="font-size:10px;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Customer</div>
            <strong>${esc(b.customer_name)}</strong>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(b.customer_email || '')}</div>
          </div>

          <div style="border-bottom:1px solid var(--border);padding:12px 0 12px 20px">
            <div class="label" style="font-size:10px;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Barber</div>
            <strong>${esc(b.barber_name)}</strong>
          </div>

        </div>

        <div class="ticket-row"><span class="label">Layanan</span><strong>${esc(b.service_name)}</strong></div>
        <div class="ticket-row"><span class="label">Tanggal</span><strong>${dateID(b.booking_date)}</strong></div>
        <div class="ticket-row"><span class="label">Jam</span><strong>${b.booking_time?.slice(0,5)} WIB</strong></div>
        <div class="ticket-row"><span class="label">Durasi</span><strong>${b.duration} menit</strong></div>
        <div class="ticket-row"><span class="label">Catatan</span><strong style="color:var(--muted)">${esc(b.notes || '—')}</strong></div>

        <div style="border-top:2px solid var(--border);margin-top:4px;padding-top:4px">
          <div class="ticket-row" style="background:rgba(200,160,74,.04)">
            <span class="label">Total Pembayaran</span>
            <strong style="color:var(--gold);font-size:18px">${money(b.total_price)}</strong>
          </div>
          <div class="ticket-row">
            <span class="label">Metode Bayar</span>
            <strong>${payMethodLabel(b.payment_method)}</strong>
          </div>
          <div class="ticket-row">
            <span class="label">Status Pembayaran</span>
            <span>${payBadge(b.payment_status)}</span>
          </div>
          <div class="ticket-row">
            <span class="label">Waktu Bayar</span>
            <strong style="color:var(--muted);font-size:12px">${paidAtStr}</strong>
          </div>
          <div class="ticket-row">
            <span class="label">Status Booking</span>
            <span class="badge ${esc(b.status)}">${esc(b.status)}</span>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <select class="form-select" id="detailStatusSel" style="flex:1;padding:10px 14px;font-size:12px">
          ${['pending','confirmed','completed','cancelled'].map(st =>
            `<option value="${st}" ${st === b.status ? 'selected' : ''}>${st}</option>`
          ).join('')}
        </select>
        <button class="btn btn-gold" onclick="updateDetailStatus(${b.id})">UPDATE STATUS</button>
        ${b.payment_status === 'pending'
          ? `<button class="btn btn-outline" style="border-color:var(--success);color:var(--success)" onclick="markPaymentPaid(${b.id})">✓ TANDAI LUNAS</button>`
          : ''}
        <button class="btn btn-ghost" onclick="closeModal('adminBookingModal')">TUTUP</button>
      </div>`;

    openModal('adminBookingModal');
  } catch (e) { alert(e.message); }
};

window.updateDetailStatus = async function(id) {
  const sel = document.getElementById('detailStatusSel');
  if (!sel) return;
  try {
    await api(`/bookings/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: sel.value })
    });
    closeModal('adminBookingModal');
    await loadAdminStats();
    await loadAdminBookingsDash();
    const sec = document.getElementById('sec-bookings');
    if (sec && !sec.classList.contains('hidden')) loadAdminBookings();
  } catch (e) { alert(e.message); }
};

window.markPaymentPaid = async function(id) {
  if (!confirm('Tandai pembayaran ini sebagai LUNAS?')) return;
  try {
    await api(`/bookings/${id}/payment`, {
      method: 'PUT',
      body: JSON.stringify({ payment_status: 'paid' })
    });
    // Also confirm the booking
    await api(`/bookings/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'confirmed' })
    });
    closeModal('adminBookingModal');
    await loadAdminStats();
    await loadAdminBookingsDash();
    const sec = document.getElementById('sec-bookings');
    if (sec && !sec.classList.contains('hidden')) loadAdminBookings();
  } catch (e) { alert(e.message); }
};

async function loadAdminServices() {
  const tbody = $('#servicesTable');
  if (!tbody) return;
  try {
    const { services } = await api('/services');
    tbody.innerHTML = services.length
      ? services.map(s => `
          <tr>
            <td>${esc(s.name)}</td>
            <td style="color:var(--gold)">${money(s.price)}</td>
            <td>${s.duration} menit</td>
            <td><span class="badge ${esc(s.status)}">${esc(s.status)}</span></td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" onclick="openServiceModal(${s.id})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteService(${s.id})">Hapus</button>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="color:var(--muted)">No services.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="form-message error">${esc(e.message)}</td></tr>`;
  }
}

function compressImage(file, maxWidth, maxHeight, quality, callback) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      let w = img.width, h = img.height;
      if (w > maxWidth)  { h = Math.round(h * maxWidth / w);  w = maxWidth; }
      if (h > maxHeight) { w = Math.round(w * maxHeight / h); h = maxHeight; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

window.onServiceImageChange = function(input) {
  const file = input.files[0];
  if (!file) return;
  compressImage(file, 800, 600, 0.7, function(base64) {
    document.getElementById('svcImage').value = base64;
    const preview = document.getElementById('svcImagePreview');
    const wrap    = document.getElementById('svcImagePreviewWrap');
    const label   = document.getElementById('svcImageLabel');
    preview.src        = base64;
    wrap.style.display = 'block';
    label.textContent  = file.name;
  });
};

window.openServiceModal = async function(id) {
  const titleEl = document.getElementById('serviceModalTitle');
  if (!titleEl) { console.warn('serviceModal not found in DOM'); return; }
  titleEl.textContent = id ? 'Edit Service' : 'Add Service';
  document.getElementById('svcId').value = id || '';
  if (id) {
    try {
      const { service: s } = await api(`/services/${id}`);
      document.getElementById('svcName').value     = s.name;
      document.getElementById('svcDesc').value     = s.description || '';
      document.getElementById('svcPrice').value    = s.price;
      document.getElementById('svcDuration').value = s.duration;
      document.getElementById('svcImage').value    = s.image || '';
      document.getElementById('svcStatus').value   = s.status;
      // Tampilkan preview gambar jika ada
      const preview = document.getElementById('svcImagePreview');
      const wrap    = document.getElementById('svcImagePreviewWrap');
      const label   = document.getElementById('svcImageLabel');
      if (s.image) {
        preview.src        = s.image;
        wrap.style.display = 'block';
        label.textContent  = 'Gambar tersimpan — pilih file baru untuk mengganti';
      } else {
        wrap.style.display = 'none';
        label.textContent  = 'Pilih gambar dari komputer...';
      }
    } catch (e) { alert('Gagal load service: ' + e.message); return; }
  } else {
    document.getElementById('serviceForm').reset();
    document.getElementById('svcImagePreviewWrap').style.display = 'none';
    document.getElementById('svcImageLabel').textContent = 'Pilih gambar dari komputer...';
    document.getElementById('svcImage').value = '';
  }
  openModal('serviceModal');
};

async function submitServiceForm(e) {
  e.preventDefault();
  const msg = document.getElementById('svcMsg');
  const id  = document.getElementById('svcId').value;
  const body = {
    name:        document.getElementById('svcName').value,
    description: document.getElementById('svcDesc').value,
    price:       Number(document.getElementById('svcPrice').value),
    duration:    Number(document.getElementById('svcDuration').value),
    image:       document.getElementById('svcImage').value,
    status:      document.getElementById('svcStatus').value
  };
  try {
    await api(id ? `/services/${id}` : '/services', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    closeModal('serviceModal');
    loadAdminServices();
    msg.textContent = '';
  } catch (err) {
    msg.textContent = err.message;
    msg.className   = 'form-message error';
  }
}

window.deleteService = async function(id) {
  if (!confirm('Nonaktifkan layanan ini?')) return;
  try { await api(`/services/${id}`, { method: 'DELETE' }); loadAdminServices(); }
  catch (e) { alert(e.message); }
};

async function loadAdminBarbers() {
  const tbody = $('#barbersTable');
  if (!tbody) return;
  try {
    const { barbers } = await api('/barbers');
    tbody.innerHTML = barbers.length
      ? barbers.map(b => `
          <tr>
            <td>${esc(b.name)}</td>
            <td>${esc(b.phone || '—')}</td>
            <td>${esc(b.specialization || '—')}</td>
            <td><span class="badge ${esc(b.status)}">${esc(b.status)}</span></td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" onclick="openBarberModal(${b.id})">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteBarber(${b.id})">Hapus</button>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="color:var(--muted)">No barbers.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="form-message error">${esc(e.message)}</td></tr>`;
  }
}

window.onBarberPhotoChange = function(input) {
  const file = input.files[0];
  if (!file) return;
  compressImage(file, 400, 400, 0.75, function(base64) {
    document.getElementById('brbPhoto').value = base64;
    const preview = document.getElementById('brbPhotoPreview');
    const wrap    = document.getElementById('brbPhotoPreviewWrap');
    const label   = document.getElementById('brbPhotoLabel');
    preview.src        = base64;
    wrap.style.display = 'block';
    label.textContent  = file.name;
  });
};

window.openBarberModal = async function(id) {
  const titleEl = document.getElementById('barberModalTitle');
  if (!titleEl) { console.warn('barberModal not found in DOM'); return; }
  titleEl.textContent = id ? 'Edit Barber' : 'Add Barber';
  document.getElementById('brbId').value = id || '';
  if (id) {
    try {
      const { barber: b } = await api(`/barbers/${id}`);
      document.getElementById('brbName').value  = b.name;
      document.getElementById('brbPhone').value = b.phone || '';
      document.getElementById('brbSpec').value  = b.specialization || '';
      document.getElementById('brbPhoto').value = b.photo || '';
      document.getElementById('brbStatus').value= b.status;
      // Tampilkan preview foto jika ada
      const preview = document.getElementById('brbPhotoPreview');
      const wrap    = document.getElementById('brbPhotoPreviewWrap');
      const label   = document.getElementById('brbPhotoLabel');
      if (b.photo) {
        preview.src        = b.photo;
        wrap.style.display = 'block';
        label.textContent  = 'Foto tersimpan — pilih file baru untuk mengganti';
      } else {
        wrap.style.display = 'none';
        label.textContent  = 'Pilih foto dari komputer...';
      }
    } catch (e) { alert('Gagal load barber: ' + e.message); return; }
  } else {
    document.getElementById('barberForm').reset();
    document.getElementById('brbPhotoPreviewWrap').style.display = 'none';
    document.getElementById('brbPhotoLabel').textContent = 'Pilih foto dari komputer...';
    document.getElementById('brbPhoto').value = '';
  }
  openModal('barberModal');
};

async function submitBarberForm(e) {
  e.preventDefault();
  const msg = document.getElementById('brbMsg');
  const id  = document.getElementById('brbId').value;
  const body = {
    name:           document.getElementById('brbName').value,
    phone:          document.getElementById('brbPhone').value,
    specialization: document.getElementById('brbSpec').value,
    photo:          document.getElementById('brbPhoto').value,
    status:         document.getElementById('brbStatus').value
  };
  try {
    await api(id ? `/barbers/${id}` : '/barbers', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    closeModal('barberModal');
    loadAdminBarbers();
    msg.textContent = '';
  } catch (err) {
    msg.textContent = err.message;
    msg.className   = 'form-message error';
  }
}

window.deleteBarber = async function(id) {
  if (!confirm('Nonaktifkan barber ini?')) return;
  try { await api(`/barbers/${id}`, { method: 'DELETE' }); loadAdminBarbers(); }
  catch (e) { alert(e.message); }
};

async function loadAdminCustomers() {
  const tbody = $('#customersTable');
  if (!tbody) return;
  try {
    const { customers } = await api('/customers');
    tbody.innerHTML = customers.length
      ? customers.map(c => `
          <tr>
            <td>${esc(c.name)}</td>
            <td>${esc(c.email)}</td>
            <td>${esc(c.phone || '—')}</td>
            <td style="color:var(--gold)">${c.booking_count}</td>
            <td style="color:var(--muted)">${new Date(c.created_at).toLocaleDateString('id-ID')}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" style="color:var(--muted)">No customers.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="form-message error">${esc(e.message)}</td></tr>`;
  }
}

async function loadAdminPayments() {
  const tbody = $('#paymentsTable');
  if (!tbody) return;
  try {
    const { payments } = await api('/payments/all');
    tbody.innerHTML = payments.length
      ? payments.map(p => `
          <tr>
            <td class="t-id">${esc(p.booking_code || '—')}</td>
            <td>${esc(p.customer_name || '—')}</td>
            <td style="color:var(--gold)">${money(p.amount)}</td>
            <td>${esc(p.payment_method)}</td>
            <td><span class="badge ${esc(p.payment_status)}">${esc(p.payment_status)}</span></td>
            <td style="color:var(--muted)">${p.paid_at ? new Date(p.paid_at).toLocaleString('id-ID') : '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="6" style="color:var(--muted)">No payments found.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="form-message error">${esc(e.message)}</td></tr>`;
  }
}

/* ── calendar ──────────────────────────────────────── */
async function renderCalendar() {
  const grid = $('#calGrid');
  const lbl  = $('#calMonthLabel');
  if (!grid) return;

  const year  = adminCalYear;
  const month = adminCalMonth;
  const monthNames = ['Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember'];
  if (lbl) lbl.textContent = `${monthNames[month]} ${year}`;

  const dayHeaders = ['MIN','SEN','SEL','RAB','KAM','JUM','SAB']
    .map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // Fetch bookings for this month
  let bookings = [];
  try {
    const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;
    const { bookings: bk } = await api(`/bookings?month=${monthStr}`);
    bookings = bk;
  } catch {}

  // Build calendar grid
  const firstDay  = new Date(year, month, 1).getDay();
  const daysInMon = new Date(year, month + 1, 0).getDate();
  const prevDays  = new Date(year, month, 0).getDate();
  const today     = new Date();

  let cells = '';

  // Previous month filler
  for (let i = firstDay - 1; i >= 0; i--) {
    cells += `<div class="cal-cell other-month"><div class="cal-cell-day">${prevDays - i}</div></div>`;
  }

  // Current month
  for (let d = 1; d <= daysInMon; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const dayBk   = bookings.filter(b => b.booking_date?.slice(0,10) === dateStr);
    const events  = dayBk.slice(0,3).map(b =>
      `<div class="cal-event ce-${esc(b.status)}">${b.booking_time?.slice(0,5)} ${esc(b.service_name?.slice(0,7))}</div>`
    ).join('');
    cells += `<div class="cal-cell${isToday ? ' today' : ''}">
      <div class="cal-cell-day">${d}</div>${events}
    </div>`;
  }

  // Next month filler
  const totalCells = firstDay + daysInMon;
  const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) {
    cells += `<div class="cal-cell other-month"><div class="cal-cell-day">${i}</div></div>`;
  }

  grid.innerHTML = dayHeaders + cells;
}

/* =====================================================
   INIT — router
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  setupMenu();
  setupLogout();

  const page = location.pathname.split('/').pop() || 'index.html';

  if (page === 'index.html' || page === '' || page === '/') {
    initHome();
  }
  if (page === 'services.html')          initServicesPage();
  if (page === 'barbers.html')           initBarbersPage();
  if (page === 'login.html')             initLogin();
  if (page === 'booking.html')           initBooking();
  if (page === 'preview.html')           initPreview();
  if (page === 'customer-dashboard.html') initCustomerDash();
  if (page === 'admin-dashboard.html')   initAdmin();
});

/* =====================================================
   ANIMATIONS — Modern EDPAbarber
   ===================================================== */

(function() {
  'use strict';

  /* ── 1. Scroll-reveal IntersectionObserver ─────────── */
  function initReveal() {
    const selectors = '.reveal, .reveal-left, .reveal-right';
    const items = document.querySelectorAll(selectors);
    if (!items.length) return;
    const obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function(el) { obs.observe(el); });
  }

  /* ── 2. Navbar scroll effect ───────────────────────── */
  function initNavbarScroll() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    function onScroll() {
      if (window.scrollY > 40) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── 3. Counter animation ──────────────────────────── */
  function animateCount(el, target, duration) {
    duration = duration || 1200;
    var start = 0;
    var startTime = null;
    var isFloat = target % 1 !== 0;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      var current = start + (target - start) * ease;
      el.textContent = isFloat ? current.toFixed(1) : Math.floor(current).toLocaleString('id-ID');
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initCounters() {
    var els = document.querySelectorAll('.stat-val[data-count]');
    if (!els.length) return;
    var obs2 = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var target = parseFloat(el.getAttribute('data-count'));
          if (!isNaN(target)) animateCount(el, target);
          obs2.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    els.forEach(function(el) { obs2.observe(el); });
  }

  /* ── 4. Smooth page transitions ────────────────────── */
  function initPageTransitions() {
    document.body.classList.add('page-loaded');
    document.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript') ||
          href.startsWith('http') || href.startsWith('//') ||
          a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Only handle same-directory .html links
      if (!/\.html/.test(href)) return;
      e.preventDefault();
      document.body.classList.add('page-leaving');
      setTimeout(function() { window.location.href = href; }, 280);
    });
  }

  /* ── 5. Skeleton helpers (exposed globally) ────────── */
  /**
   * Replace a container's innerHTML with N skeleton cards.
   * Call before an API fetch; call clearSkeleton after.
   */
  window.showSkeleton = function(container, count, hasImg) {
    count = count || 3;
    var html = '';
    for (var i = 0; i < count; i++) {
      html += '<div class="skeleton-card">';
      if (hasImg) html += '<div class="skeleton-img"></div>';
      html += '<div class="skeleton-line w80"></div>';
      html += '<div class="skeleton-line w60"></div>';
      html += '<div class="skeleton-line w40"></div>';
      html += '</div>';
    }
    if (container) container.innerHTML = html;
  };
  window.clearSkeleton = function(container) {
    if (container) container.innerHTML = '';
  };

  /* ── Init ───────────────────────────────────────────── */
  function init() {
    initReveal();
    initNavbarScroll();
    initCounters();
    initPageTransitions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();