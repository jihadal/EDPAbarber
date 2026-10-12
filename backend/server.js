/**
 * EDPAbarber — Express Server
 */
'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const bcrypt  = require('bcrypt');
const pool    = require('./config/database');

const app  = express();
const PORT = Number(process.env.PORT || 3000);

/* ── Middleware ──────────────────────────────────────── */
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));

// Midtrans webhook needs raw body for signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    try { req.body = JSON.parse(req.body.toString()); } catch {}
  }
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

/* ── Static frontend ─────────────────────────────────── */
app.use(express.static(path.join(__dirname, '../frontend')));

/* ── Health check ────────────────────────────────────── */
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, service: 'EDPAbarber API', ts: new Date().toISOString() })
);

/* ── API Routes ──────────────────────────────────────── */
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/services',  require('./routes/services'));
app.use('/api/barbers',   require('./routes/barbers'));
app.use('/api/bookings',  require('./routes/bookings'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/payments',  require('./routes/payments'));

/* ── SPA fallback ────────────────────────────────────── */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

/* ── Global error handler ────────────────────────────── */
app.use((err, _req, res, _next) => {
  // Print full stack in development
  console.error('[Error]', err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error.',
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {})
  });
});

/* ── Demo seed (creates demo accounts on first start) ── */
async function seedDemo() {
  const conn = await pool.getConnection();
  try {
    // Admin account
    const adminHash = await bcrypt.hash('Admin123!', 12);
    await conn.query(
      `INSERT INTO users (name, email, password, role)
            VALUES ('EDPA Admin', 'admin@edpabarber.com', ?, 'admin')
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = 'admin'`,
      [adminHash]
    );

    // Demo customer
    const custHash = await bcrypt.hash('Customer123!', 12);
    await conn.query(
      `INSERT INTO users (name, email, password, role)
            VALUES ('Demo Customer', 'customer@edpabarber.com', ?, 'customer')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [custHash]
    );
    const [[custUser]] = await conn.query(
      'SELECT id FROM users WHERE email = ?', ['customer@edpabarber.com']
    );
    await conn.query(
      `INSERT INTO customers (user_id, phone, address)
            VALUES (?, '081234567890', 'Indonesia')
       ON DUPLICATE KEY UPDATE phone = VALUES(phone)`,
      [custUser.id]
    );

    console.log('[Seed] Demo accounts ready.');
    console.log('       Admin:    admin@edpabarber.com    / Admin123!');
    console.log('       Customer: customer@edpabarber.com / Customer123!');
  } catch (e) {
    console.warn('[Seed] Warning:', e.message);
  } finally {
    conn.release();
  }
}

/* ── Boot ────────────────────────────────────────────── */
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Connected to MySQL.');
    await seedDemo();
    app.listen(PORT, () => {
      console.log(`[Server] EDPAbarber running at http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('[Fatal] Startup failed:', e.message);
    process.exit(1);
  }
})();
