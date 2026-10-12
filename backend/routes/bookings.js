/**
 * EDPAbarber — Bookings Route
 * POST   /api/bookings            — create booking (customer)
 * GET    /api/bookings            — list bookings (customer sees own, admin sees all)
 * GET    /api/bookings/:id        — single booking
 * PUT    /api/bookings/:id/status — update status (admin)
 * DELETE /api/bookings/:id        — cancel booking
 */
const router = require('express').Router();
const pool   = require('../config/database');
const { auth, role } = require('../middleware/auth');

const VALID_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

function makeCode() {
  return 'EDPA-' + Math.random().toString(36).slice(2, 9).toUpperCase();
}

/* ── POST /api/bookings ──────────────────────────────── */
router.post('/', auth, role('customer'), async (req, res, next) => {
  const { service_id, barber_id, booking_date, booking_time, notes, payment_method } = req.body;

  // Validate date — not in the past
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dObj  = new Date(`${booking_date}T00:00:00`);
  if (!booking_date || Number.isNaN(dObj.getTime()) || dObj < today) {
    return res.status(400).json({ message: 'Booking date cannot be in the past.' });
  }

  // Validate time format HH:MM
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(booking_time || '')) {
    return res.status(400).json({ message: 'Invalid booking time format.' });
  }
  if (booking_time < '09:00' || booking_time > '20:30') {
    return res.status(400).json({ message: 'Booking hours are 09:00 – 21:00 WIB.' });
  }

  // Parse IDs as integers
  const svcId = parseInt(service_id, 10);
  const brbId = parseInt(barber_id, 10);
  if (!svcId || !brbId) {
    return res.status(400).json({ message: 'Invalid service_id or barber_id.' });
  }

  // Parse payment method (qris / cash / default: cash)
  const payMethod = ['qris', 'cash'].includes(payment_method) ? payment_method : 'cash';

  const conn = await pool.getConnection();
  let responded = false;
  try {
    await conn.beginTransaction();

    // Verify service
    const [[service]] = await conn.query(
      'SELECT id, name, price, duration FROM services WHERE id = ? AND status = "active"',
      [svcId]
    );
    if (!service) {
      await conn.rollback();
      responded = true;
      return res.status(400).json({ message: 'Service is unavailable.' });
    }

    // Verify barber
    const [[barber]] = await conn.query(
      'SELECT id, name FROM barbers WHERE id = ? AND status = "active"',
      [brbId]
    );
    if (!barber) {
      await conn.rollback();
      responded = true;
      return res.status(400).json({ message: 'Barber is unavailable.' });
    }

    // Prevent double-booking: same barber same slot
    const [[barberConflict]] = await conn.query(
      `SELECT id FROM bookings
        WHERE barber_id = ? AND booking_date = ? AND booking_time = ?
          AND status IN ('pending','confirmed') LIMIT 1`,
      [brbId, booking_date, booking_time]
    );
    if (barberConflict) {
      await conn.rollback();
      responded = true;
      return res.status(409).json({ message: 'Barber sudah ada booking di jam ini. Pilih jam lain.' });
    }

    // Prevent double-booking: same customer same slot
    const [[custConflict]] = await conn.query(
      `SELECT b.id FROM bookings b
         JOIN customers c ON c.id = b.customer_id
        WHERE c.user_id = ? AND b.booking_date = ? AND b.booking_time = ?
          AND b.status IN ('pending','confirmed') LIMIT 1`,
      [req.user.id, booking_date, booking_time]
    );
    if (custConflict) {
      await conn.rollback();
      responded = true;
      return res.status(409).json({ message: 'Kamu sudah punya booking di jam yang sama.' });
    }

    // Get customer record
    const [[customer]] = await conn.query(
      'SELECT id FROM customers WHERE user_id = ?', [req.user.id]
    );
    if (!customer) {
      await conn.rollback();
      responded = true;
      return res.status(400).json({ message: 'Customer profile tidak ditemukan. Coba login ulang.' });
    }

    // Generate unique booking code
    let code = makeCode();
    let attempts = 0;
    while (attempts < 10) {
      const [[exists]] = await conn.query('SELECT id FROM bookings WHERE booking_code = ?', [code]);
      if (!exists) break;
      code = makeCode();
      attempts++;
    }

    const [result] = await conn.query(
      `INSERT INTO bookings
         (booking_code, customer_id, barber_id, service_id, booking_date, booking_time, notes, total_price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [code, customer.id, brbId, svcId, booking_date, booking_time, notes || null, service.price]
    );

    // Insert payment record immediately with chosen method
    // Tunai = pending (dibayar di tempat), QRIS = pending (tunggu scan)
    await conn.query(
      `INSERT INTO payments (booking_id, payment_method, amount, payment_status)
       VALUES (?, ?, ?, 'pending')`,
      [result.insertId, payMethod, service.price]
    );

    await conn.commit();

    // Fetch full booking with joins including payment
    const [[booking]] = await pool.query(
      `SELECT b.*, s.name service_name, s.duration, br.name barber_name,
              p.payment_status, p.payment_method, p.paid_at
         FROM bookings b
         JOIN services  s  ON s.id  = b.service_id
         JOIN barbers   br ON br.id = b.barber_id
    LEFT JOIN payments  p  ON p.booking_id = b.id
        WHERE b.id = ?`,
      [result.insertId]
    );

    responded = true;
    return res.status(201).json({ booking });
  } catch (e) {
    if (!responded) {
      try { await conn.rollback(); } catch {}
    }
    next(e);
  } finally {
    conn.release();
  }
});

/* ── GET /api/bookings ───────────────────────────────── */
router.get('/', auth, async (req, res, next) => {
  try {
    let sql = `
      SELECT b.*,
             s.name  service_name, s.duration,
             br.name barber_name,
             u.name  customer_name, u.email customer_email,
             c.phone customer_phone,
             p.payment_status,
             p.payment_method,
             p.paid_at
        FROM bookings  b
        JOIN services  s  ON s.id  = b.service_id
        JOIN barbers   br ON br.id = b.barber_id
        JOIN customers c  ON c.id  = b.customer_id
        JOIN users     u  ON u.id  = c.user_id
   LEFT JOIN payments  p  ON p.booking_id = b.id
       WHERE 1=1`;
    const args = [];

    // Customers only see their own bookings
    if (req.user.role === 'customer') {
      sql += ' AND c.user_id = ?'; args.push(req.user.id);
    }

    if (req.query.date)       { sql += ' AND b.booking_date = ?';    args.push(req.query.date); }
    if (req.query.status)     { sql += ' AND b.status = ?';          args.push(req.query.status); }
    if (req.query.barber_id)  { sql += ' AND b.barber_id = ?';       args.push(req.query.barber_id); }
    if (req.query.service_id) { sql += ' AND b.service_id = ?';      args.push(req.query.service_id); }
    if (req.query.month) {
      // format: YYYY-MM
      const [y, m] = req.query.month.split('-');
      sql += ' AND YEAR(b.booking_date) = ? AND MONTH(b.booking_date) = ?';
      args.push(y, Number(m));
    }

    sql += ' ORDER BY b.booking_date DESC, b.booking_time DESC';

    const [bookings] = await pool.query(sql, args);
    return res.json({ bookings });
  } catch (e) { next(e); }
});

/* ── GET /api/bookings/:id ───────────────────────────── */
router.get('/:id', auth, async (req, res, next) => {
  try {
    let sql = `
      SELECT b.*,
             s.name  service_name, s.duration,
             br.name barber_name,
             u.name  customer_name, u.email customer_email,
             c.phone customer_phone,
             p.payment_status,
             p.payment_method,
             p.paid_at
        FROM bookings  b
        JOIN services  s  ON s.id  = b.service_id
        JOIN barbers   br ON br.id = b.barber_id
        JOIN customers c  ON c.id  = b.customer_id
        JOIN users     u  ON u.id  = c.user_id
   LEFT JOIN payments  p  ON p.booking_id = b.id
       WHERE b.id = ?`;
    const args = [req.params.id];

    if (req.user.role === 'customer') { sql += ' AND c.user_id = ?'; args.push(req.user.id); }

    const [rows] = await pool.query(sql, args);
    if (!rows.length) return res.status(404).json({ message: 'Booking not found.' });
    return res.json({ booking: rows[0] });
  } catch (e) { next(e); }
});

/* ── PUT /api/bookings/:id/status  (admin) ───────────── */
router.put('/:id/status', auth, role('admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be: ${VALID_STATUSES.join(', ')}` });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.query('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
      if (!r.affectedRows) {
        await conn.rollback();
        return res.status(404).json({ message: 'Booking not found.' });
      }
      // Auto-update payment status when booking is completed → mark as paid
      if (status === 'completed') {
        await conn.query(
          `UPDATE payments SET payment_status = 'paid', paid_at = NOW()
            WHERE booking_id = ? AND payment_status = 'pending'`,
          [req.params.id]
        );
      }
      // Auto-update payment status when booking is cancelled → mark as failed
      if (status === 'cancelled') {
        await conn.query(
          `UPDATE payments SET payment_status = 'failed'
            WHERE booking_id = ? AND payment_status = 'pending'`,
          [req.params.id]
        );
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
    return res.json({ message: 'Booking status updated.' });
  } catch (e) { next(e); }
});

/* ── PUT /api/bookings/:id/payment  (admin) ─────────── */
/* Mark payment as paid manually (e.g. cash received at shop) */
router.put('/:id/payment', auth, role('admin'), async (req, res, next) => {
  try {
    const { payment_status } = req.body;
    const validPayStatuses = ['pending', 'paid', 'failed', 'refunded'];
    if (!validPayStatuses.includes(payment_status)) {
      return res.status(400).json({ message: `Invalid payment_status.` });
    }
    const paidAt = payment_status === 'paid' ? new Date() : null;
    const [r] = await pool.query(
      `UPDATE payments SET payment_status = ?, paid_at = ?
        WHERE booking_id = ?`,
      [payment_status, paidAt, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Payment record not found.' });
    return res.json({ message: 'Payment status updated.' });
  } catch (e) { next(e); }
});

/* ── DELETE /api/bookings/:id  (cancel) ──────────────── */
router.delete('/:id', auth, async (req, res, next) => {
  try {
    let sql = `UPDATE bookings SET status = 'cancelled'
                WHERE id = ? AND status IN ('pending','confirmed')`;
    const args = [req.params.id];

    if (req.user.role === 'customer') {
      sql += ' AND customer_id = (SELECT id FROM customers WHERE user_id = ?)';
      args.push(req.user.id);
    }

    const [r] = await pool.query(sql, args);
    if (!r.affectedRows) return res.status(400).json({ message: 'Booking cannot be cancelled.' });
    return res.json({ message: 'Booking cancelled.' });
  } catch (e) { next(e); }
});

module.exports = router;
