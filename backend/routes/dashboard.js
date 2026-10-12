/**
 * EDPAbarber — Dashboard / Stats Route
 */
const router = require('express').Router();
const pool   = require('../config/database');
const { auth, role } = require('../middleware/auth');

/* GET /api/dashboard/stats */
router.get('/stats', auth, role('admin'), async (req, res, next) => {
  try {
    const [[totals]] = await pool.query(`
      SELECT
        COUNT(*)                                                         AS total_bookings,
        SUM(status = 'pending')                                          AS pending_bookings,
        SUM(status = 'confirmed')                                        AS confirmed_bookings,
        SUM(status = 'completed')                                        AS completed_bookings,
        SUM(status = 'cancelled')                                        AS cancelled_bookings,
        COALESCE(SUM(CASE WHEN status IN ('completed','confirmed')
                         THEN total_price ELSE 0 END), 0)               AS total_revenue
      FROM bookings
    `);

    const [[today]] = await pool.query(`
      SELECT COUNT(*) AS today_bookings
        FROM bookings
       WHERE booking_date = CURDATE()
    `);

    const [[weekly]] = await pool.query(`
      SELECT COUNT(*) AS week_bookings
        FROM bookings
       WHERE booking_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `);

    const [[monthly]] = await pool.query(`
      SELECT COUNT(*) AS month_bookings
        FROM bookings
       WHERE MONTH(booking_date) = MONTH(CURDATE())
         AND YEAR(booking_date)  = YEAR(CURDATE())
    `);

    const [[customers]] = await pool.query(`
      SELECT COUNT(*) AS total_customers FROM customers
    `);

    res.json({
      stats: {
        ...totals,
        ...today,
        ...weekly,
        ...monthly,
        ...customers
      }
    });
  } catch (e) { next(e); }
});

module.exports = router;
