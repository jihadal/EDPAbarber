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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── Static frontend ─────────────────────────────────── */
// When deployed with Root Directory = backend, frontend is at ../frontend (local)
// or at the same level. We try both.
const frontendDir = (() => {
  const candidates = [
    path.join(__dirname, '../frontend'),   // local / root-level deploy
    path.join(__dirname, 'frontend'),      // frontend copied inside backend
  ];
  const fs = require('fs');
  return candidates.find(p => fs.existsSync(path.join(p, 'index.html'))) || candidates[0];
})();
app.use(express.static(frontendDir));

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
  res.sendFile(path.join(frontendDir, 'index.html'));
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

/* ── Auto-migrate: pastikan kolom photo/image pakai LONGTEXT ── */
async function runMigrations() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`ALTER TABLE barbers MODIFY COLUMN photo LONGTEXT`);
    await conn.query(`ALTER TABLE services MODIFY COLUMN image LONGTEXT`);
    console.log('[Migration] Columns photo/image set to LONGTEXT.');
  } catch (e) {
    // Abaikan jika sudah LONGTEXT atau tabel tidak ada kolom itu
    console.warn('[Migration] Warning:', e.message);
  } finally {
    conn.release();
  }
}


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
    console.log('[Boot] Starting EDPAbarber...');
    console.log('[Boot] DB_HOST:', process.env.DB_HOST || '(not set)');
    console.log('[Boot] DB_PORT:', process.env.DB_PORT || '(not set)');
    console.log('[Boot] DB_USER:', process.env.DB_USER || '(not set)');
    console.log('[Boot] DB_NAME:', process.env.DB_NAME || '(not set)');
    console.log('[Boot] PORT:', process.env.PORT || '(not set)');
    await pool.query('SELECT 1');
    console.log('[DB] Connected to MySQL.');
    await runMigrations();
    await seedDemo();
    app.listen(PORT, () => {
      console.log(`[Server] EDPAbarber running at http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('[Fatal] Startup failed:', e.message);
    console.error('[Fatal] Full error:', e.stack);
    process.exit(1);
  }
})();
