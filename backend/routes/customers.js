/**
 * EDPAbarber — Customers Route
 * Admin: list all customers with booking count.
 * Customer: view/update own profile.
 */
const router = require('express').Router();
const pool   = require('../config/database');
const { auth, role } = require('../middleware/auth');

/* GET /api/customers — admin: all customers */
router.get('/', auth, role('admin'), async (req, res, next) => {
  try {
    const [customers] = await pool.query(
      `SELECT u.id, u.name, u.email, u.created_at,
              c.phone, c.address,
              COUNT(b.id) AS booking_count
         FROM users u
         JOIN customers c ON c.user_id = u.id
    LEFT JOIN bookings  b ON b.customer_id = c.id
        WHERE u.role = 'customer'
        GROUP BY u.id
        ORDER BY u.created_at DESC`
    );
    res.json({ customers });
  } catch (e) { next(e); }
});

/* GET /api/customers/me — customer: own profile */
router.get('/me', auth, role('customer'), async (req, res, next) => {
  try {
    const [[profile]] = await pool.query(
      `SELECT u.id, u.name, u.email, u.created_at, c.phone, c.address
         FROM users u JOIN customers c ON c.user_id = u.id
        WHERE u.id = ?`,
      [req.user.id]
    );
    if (!profile) return res.status(404).json({ message: 'Profile not found.' });
    res.json({ profile });
  } catch (e) { next(e); }
});

/* PUT /api/customers/me — customer: update profile */
router.put('/me', auth, role('customer'), async (req, res, next) => {
  try {
    const { name, phone, address } = req.body;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (name) {
        await conn.query('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id]);
      }
      await conn.query(
        'UPDATE customers SET phone = ?, address = ? WHERE user_id = ?',
        [phone || null, address || null, req.user.id]
      );
      await conn.commit();
      res.json({ message: 'Profile updated.' });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { next(e); }
});

/* GET /api/customers/:id — admin: single customer detail */
router.get('/:id', auth, role('admin'), async (req, res, next) => {
  try {
    const [[customer]] = await pool.query(
      `SELECT u.id, u.name, u.email, u.created_at, c.phone, c.address,
              COUNT(b.id) AS booking_count
         FROM users u
         JOIN customers c ON c.user_id = u.id
    LEFT JOIN bookings  b ON b.customer_id = c.id
        WHERE u.id = ?
        GROUP BY u.id`,
      [req.params.id]
    );
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });
    res.json({ customer });
  } catch (e) { next(e); }
});

module.exports = router;
