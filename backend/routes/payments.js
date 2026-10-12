/**
 * EDPAbarber — Payments Route
 * Handles Midtrans Snap payment creation + webhook callback
 * and internal payment record management.
 */
const router  = require('express').Router();
const pool    = require('../config/database');
const { auth, role } = require('../middleware/auth');
const crypto  = require('crypto');

/* ─────────────────────────────────────────────────────
   Helper: Midtrans Snap  (Server-Side only, key never
   sent to frontend)
───────────────────────────────────────────────────── */
async function createSnapTransaction(booking, customer) {
  const serverKey  = process.env.MIDTRANS_SERVER_KEY;
  const isSandbox  = process.env.MIDTRANS_ENV !== 'production';
  const snapUrl    = isSandbox
    ? 'https://app.sandbox.midtrans.com/snap/v1/transactions'
    : 'https://app.midtrans.com/snap/v1/transactions';

  const authHeader = 'Basic ' + Buffer.from(serverKey + ':').toString('base64');

  const body = {
    transaction_details: {
      order_id: booking.booking_code,
      gross_amount: Math.round(Number(booking.total_price))
    },
    customer_details: {
      first_name: customer.name,
      email:      customer.email,
      phone:      customer.phone || ''
    },
    item_details: [{
      id:       String(booking.service_id),
      name:     booking.service_name || 'Barbershop Service',
      price:    Math.round(Number(booking.total_price)),
      quantity: 1
    }],
    callbacks: {
      finish:  `${process.env.APP_URL || 'http://localhost:3000'}/preview.html`,
      error:   `${process.env.APP_URL || 'http://localhost:3000'}/booking.html`,
      pending: `${process.env.APP_URL || 'http://localhost:3000'}/preview.html`
    }
  };

  const res = await fetch(snapUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body:    JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_messages?.[0] || 'Midtrans error');
  return data; // { token, redirect_url }
}

/* ─────────────────────────────────────────────────────
   POST /api/payments/snap   — create Snap transaction
   Body: { booking_id }
   Returns: { snap_token, redirect_url }
───────────────────────────────────────────────────── */
router.post('/snap', auth, role('customer'), async (req, res, next) => {
  try {
    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ message: 'booking_id is required.' });

    // Fetch booking + verify ownership
    const [[booking]] = await pool.query(
      `SELECT b.*, s.name service_name
         FROM bookings b
         JOIN services s ON s.id = b.service_id
         JOIN customers c ON c.id = b.customer_id
        WHERE b.id = ? AND c.user_id = ? AND b.status = 'pending'`,
      [booking_id, req.user.id]
    );
    if (!booking) return res.status(404).json({ message: 'Booking not found or not payable.' });

    // Check if payment already exists
    const [[existingPay]] = await pool.query(
      'SELECT id, payment_status FROM payments WHERE booking_id = ?',
      [booking_id]
    );
    if (existingPay?.payment_status === 'paid') {
      return res.status(409).json({ message: 'Booking already paid.' });
    }

    // Fetch customer info
    const [[customer]] = await pool.query(
      `SELECT u.name, u.email, c.phone
         FROM users u JOIN customers c ON c.user_id = u.id
        WHERE u.id = ?`,
      [req.user.id]
    );

    // --- Midtrans disabled (no key) → return demo token ---
    if (!process.env.MIDTRANS_SERVER_KEY || process.env.MIDTRANS_SERVER_KEY === 'your-midtrans-server-key') {
      // Upsert a pending payment record for demo
      await pool.query(
        `INSERT INTO payments (booking_id, payment_method, amount, payment_status, transaction_reference)
              VALUES (?, 'midtrans', ?, 'pending', ?)
         ON DUPLICATE KEY UPDATE
              payment_status = 'pending',
              transaction_reference = VALUES(transaction_reference)`,
        [booking_id, booking.total_price, 'DEMO-' + booking.booking_code]
      );
      return res.json({
        demo: true,
        snap_token: null,
        redirect_url: null,
        message: 'Midtrans not configured. Set MIDTRANS_SERVER_KEY in .env to enable real payments.'
      });
    }

    // Create Snap transaction
    const snap = await createSnapTransaction(booking, customer);

    // Upsert payment record (pending)
    await pool.query(
      `INSERT INTO payments (booking_id, payment_method, amount, payment_status, transaction_reference)
            VALUES (?, 'midtrans', ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE
            payment_status = 'pending',
            transaction_reference = VALUES(transaction_reference)`,
      [booking_id, booking.total_price, snap.token]
    );

    return res.json({ snap_token: snap.token, redirect_url: snap.redirect_url });
  } catch (e) { next(e); }
});

/* ─────────────────────────────────────────────────────
   POST /api/payments/webhook — Midtrans notification
   No auth (called by Midtrans server).
   Signature verified using SHA512.
───────────────────────────────────────────────────── */
router.post('/webhook', async (req, res) => {
  try {
    const notif        = req.body;
    const serverKey    = process.env.MIDTRANS_SERVER_KEY || '';
    const orderId      = notif.order_id;
    const statusCode   = notif.status_code;
    const grossAmount  = notif.gross_amount;
    const sigKey       = notif.signature_key;

    // Verify signature
    const expectedSig = crypto
      .createHash('sha512')
      .update(orderId + statusCode + grossAmount + serverKey)
      .digest('hex');

    if (serverKey && sigKey !== expectedSig) {
      return res.status(400).json({ message: 'Invalid signature.' });
    }

    // Determine internal payment status
    const txStatus  = notif.transaction_status;
    const fraudStatus = notif.fraud_status;
    let paymentStatus = 'pending';
    let bookingStatus = null;

    if (txStatus === 'capture') {
      paymentStatus = fraudStatus === 'accept' ? 'paid' : 'failed';
      if (paymentStatus === 'paid') bookingStatus = 'confirmed';
    } else if (txStatus === 'settlement') {
      paymentStatus = 'paid';
      bookingStatus = 'confirmed';
    } else if (['cancel', 'deny', 'expire'].includes(txStatus)) {
      paymentStatus = 'failed';
      bookingStatus = 'cancelled';
    } else if (txStatus === 'refund') {
      paymentStatus = 'refunded';
    }

    // Update payment record
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Find booking by code (order_id)
      const [[booking]] = await conn.query(
        'SELECT id FROM bookings WHERE booking_code = ?', [orderId]
      );
      if (!booking) { await conn.rollback(); return res.json({ ok: true }); }

      const paidAt = paymentStatus === 'paid' ? new Date() : null;
      await conn.query(
        `UPDATE payments SET payment_status = ?, payment_method = ?,
              paid_at = ?
          WHERE booking_id = ?`,
        [paymentStatus, notif.payment_type || 'midtrans', paidAt, booking.id]
      );

      if (bookingStatus) {
        await conn.query(
          'UPDATE bookings SET status = ? WHERE id = ?',
          [bookingStatus, booking.id]
        );
      }

      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }

    return res.json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    return res.status(500).json({ message: 'Webhook processing error.' });
  }
});

/* ─────────────────────────────────────────────────────
   GET /api/payments/all   — admin: all payments
───────────────────────────────────────────────────── */
router.get('/all', auth, role('admin'), async (req, res, next) => {
  try {
    const [payments] = await pool.query(
      `SELECT p.*, b.booking_code, u.name customer_name
         FROM payments p
         JOIN bookings b  ON b.id  = p.booking_id
         JOIN customers c ON c.id  = b.customer_id
         JOIN users u     ON u.id  = c.user_id
        ORDER BY p.created_at DESC
        LIMIT 200`
    );
    res.json({ payments });
  } catch (e) { next(e); }
});

/* ─────────────────────────────────────────────────────
   GET /api/payments/:bookingId — single booking payment
───────────────────────────────────────────────────── */
router.get('/:bookingId', auth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*
         FROM payments p
         JOIN bookings b  ON b.id = p.booking_id
         JOIN customers c ON c.id = b.customer_id
        WHERE p.booking_id = ?
          AND (c.user_id = ? OR ? = 'admin')`,
      [req.params.bookingId, req.user.id, req.user.role]
    );
    res.json({ payment: rows[0] || null });
  } catch (e) { next(e); }
});

/* ─────────────────────────────────────────────────────
   POST /api/payments/manual — admin: mark as paid
───────────────────────────────────────────────────── */
router.post('/manual', auth, role('admin'), async (req, res, next) => {
  try {
    const { booking_id, payment_method, amount, transaction_reference } = req.body;
    if (!booking_id || !payment_method || !amount) {
      return res.status(400).json({ message: 'booking_id, payment_method, and amount are required.' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO payments (booking_id, payment_method, amount, payment_status, transaction_reference, paid_at)
              VALUES (?, ?, ?, 'paid', ?, NOW())
         ON DUPLICATE KEY UPDATE
              payment_status = 'paid',
              payment_method = VALUES(payment_method),
              paid_at = NOW(),
              transaction_reference = VALUES(transaction_reference)`,
        [booking_id, payment_method, amount, transaction_reference || null]
      );
      await conn.query(
        "UPDATE bookings SET status = 'confirmed' WHERE id = ?",
        [booking_id]
      );
      await conn.commit();
      res.json({ message: 'Payment recorded.' });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { next(e); }
});

module.exports = router;
