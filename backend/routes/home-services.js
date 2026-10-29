/**
 * EDPAbarber — Home Services Route (Pangkas Panggilan / Home Service)
 * POST   /api/home-services            — create order (customer)
 * GET    /api/home-services            — list orders (customer sees own, admin sees all)
 * GET    /api/home-services/:id        — single order
 * PUT    /api/home-services/:id/status — update status (admin)
 * DELETE /api/home-services/:id        — cancel order (customer or admin)
 */
'use strict';

const router           = require('express').Router();
const pool             = require('../config/database');
const { auth, role }   = require('../middleware/auth');

const VALID_STATUSES = ['pending', 'confirmed', 'on_the_way', 'completed', 'cancelled'];
const TRAVEL_FEE     = 25000;

/* ── POST /api/home-services ─────────────────────────── */
router.post('/', auth, role('customer'), async (req, res, next) => {
  const {
    customer_name, phone, address,
    service_id, barber_id,
    preferred_date, preferred_time,
    notes
  } = req.body;

  // Validate required fields
  if (!customer_name || !phone || !address) {
    return res.status(400).json({ message: 'customer_name, phone, and address are required.' });
  }

  // Validate date — not in the past
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dObj  = new Date(`${preferred_date}T00:00:00`);
  if (!preferred_date || Number.isNaN(dObj.getTime()) || dObj < today) {
    return res.status(400).json({ message: 'Preferred date cannot be in the past.' });
  }

  // Validate time format HH:MM
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(preferred_time || '')) {
    return res.status(400).json({ message: 'Invalid preferred time format.' });
  }
  if (preferred_time < '09:00' || preferred_time > '21:00') {
    return res.status(400).json({ message: 'Service hours are 09:00 – 21:00 WIB.' });
  }

  // Parse IDs as integers
  const svcId = parseInt(service_id, 10);
  const brbId = parseInt(barber_id, 10);
  if (!svcId || !brbId) {
    return res.status(400).json({ message: 'Invalid service_id or barber_id.' });
  }

  try {
    // Verify service
    const [[service]] = await pool.query(
      'SELECT id, name, price, duration FROM services WHERE id = ? AND status = "active"',
      [svcId]
    );
    if (!service) {
      return res.status(400).json({ message: 'Service is unavailable.' });
    }

    // Verify barber
    const [[barber]] = await pool.query(
      'SELECT id, name FROM barbers WHERE id = ? AND status = "active"',
      [brbId]
    );
    if (!barber) {
      return res.status(400).json({ message: 'Barber is unavailable.' });
    }

    const totalPrice = Number(service.price) + TRAVEL_FEE;

    const [result] = await pool.query(
      `INSERT INTO home_services
         (user_id, customer_name, phone, address, service_id, barber_id,
          preferred_date, preferred_time, notes, total_price, travel_fee)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        customer_name, phone, address,
        svcId, brbId,
        preferred_date, preferred_time,
        notes || null,
        totalPrice, TRAVEL_FEE
      ]
    );

    // Re-fetch with JOINs
    const [[homeService]] = await pool.query(
      `SELECT hs.*,
              s.name  service_name, s.price service_price,
              br.name barber_name,
              u.name  user_name, u.email user_email
         FROM home_services hs
         JOIN services s  ON s.id  = hs.service_id
         JOIN barbers  br ON br.id = hs.barber_id
         JOIN users    u  ON u.id  = hs.user_id
        WHERE hs.id = ?`,
      [result.insertId]
    );

    return res.status(201).json({ homeService });
  } catch (e) { next(e); }
});

/* ── GET /api/home-services ──────────────────────────── */
router.get('/', auth, async (req, res, next) => {
  try {
    let sql = `
      SELECT hs.*,
             s.name  service_name, s.price service_price,
             br.name barber_name,
             u.name  user_name, u.email user_email
        FROM home_services hs
        JOIN services s  ON s.id  = hs.service_id
        JOIN barbers  br ON br.id = hs.barber_id
        JOIN users    u  ON u.id  = hs.user_id
       WHERE 1=1`;
    const args = [];

    if (req.user.role === 'customer') {
      sql += ' AND hs.user_id = ?';
      args.push(req.user.id);
    }

    if (req.query.status) {
      sql += ' AND hs.status = ?';
      args.push(req.query.status);
    }

    sql += ' ORDER BY hs.created_at DESC';

    const [homeServices] = await pool.query(sql, args);
    return res.json({ homeServices });
  } catch (e) { next(e); }
});

/* ── GET /api/home-services/:id ──────────────────────── */
router.get('/:id', auth, async (req, res, next) => {
  try {
    let sql = `
      SELECT hs.*,
             s.name  service_name, s.price service_price,
             br.name barber_name,
             u.name  user_name, u.email user_email
        FROM home_services hs
        JOIN services s  ON s.id  = hs.service_id
        JOIN barbers  br ON br.id = hs.barber_id
        JOIN users    u  ON u.id  = hs.user_id
       WHERE hs.id = ?`;
    const args = [req.params.id];

    if (req.user.role === 'customer') {
      sql += ' AND hs.user_id = ?';
      args.push(req.user.id);
    }

    const [rows] = await pool.query(sql, args);
    if (!rows.length) return res.status(404).json({ message: 'Home service order not found.' });
    return res.json({ homeService: rows[0] });
  } catch (e) { next(e); }
});

/* ── PUT /api/home-services/:id/status  (admin) ──────── */
router.put('/:id/status', auth, role('admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be: ${VALID_STATUSES.join(', ')}` });
    }
    const [r] = await pool.query(
      'UPDATE home_services SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Home service order not found.' });
    return res.json({ message: 'Status updated.' });
  } catch (e) { next(e); }
});

/* ── DELETE /api/home-services/:id  (cancel) ─────────── */
router.delete('/:id', auth, async (req, res, next) => {
  try {
    let sql = `UPDATE home_services SET status = 'cancelled'
                WHERE id = ? AND status IN ('pending','confirmed')`;
    const args = [req.params.id];

    if (req.user.role === 'customer') {
      sql += ' AND user_id = ?';
      args.push(req.user.id);
    }

    const [r] = await pool.query(sql, args);
    if (!r.affectedRows) return res.status(400).json({ message: 'Order cannot be cancelled.' });
    return res.json({ message: 'Home service order cancelled.' });
  } catch (e) { next(e); }
});

module.exports = router;
