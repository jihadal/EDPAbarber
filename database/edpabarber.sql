-- =====================================================
-- EDPAbarber — Complete Database Schema
-- Engine: MySQL 5.7+ / MariaDB 10.3+
-- Charset: utf8mb4
-- =====================================================

CREATE DATABASE IF NOT EXISTS edpabarber_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE edpabarber_db;

-- ── users ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120)    NOT NULL,
  email      VARCHAR(190)    NOT NULL,
  password   VARCHAR(255)    NOT NULL,
  role       ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── customers ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED    NOT NULL,
  phone      VARCHAR(30)     DEFAULT NULL,
  address    TEXT            DEFAULT NULL,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_user (user_id),
  CONSTRAINT fk_customers_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── barbers ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS barbers (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name            VARCHAR(120)    NOT NULL,
  phone           VARCHAR(30)     DEFAULT NULL,
  specialization  VARCHAR(200)    DEFAULT NULL,
  photo           TEXT            DEFAULT NULL,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_barbers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── services ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120)    NOT NULL,
  description TEXT            DEFAULT NULL,
  price       DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  duration    SMALLINT UNSIGNED NOT NULL COMMENT 'Duration in minutes',
  image       TEXT            DEFAULT NULL,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_services_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── bookings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_code  VARCHAR(30)     NOT NULL,
  customer_id   INT UNSIGNED    NOT NULL,
  barber_id     INT UNSIGNED    NOT NULL,
  service_id    INT UNSIGNED    NOT NULL,
  booking_date  DATE            NOT NULL,
  booking_time  TIME            NOT NULL,
  notes         TEXT            DEFAULT NULL,
  total_price   DECIMAL(12,2)   NOT NULL,
  status        ENUM('pending','confirmed','completed','cancelled')
                                NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_booking_code (booking_code),
  -- NOTE: Double-booking prevention is enforced in application logic (bookings.js)
  -- not at DB level, because MySQL cannot enforce conditional uniqueness on ENUM columns.
  INDEX idx_bookings_customer  (customer_id),
  INDEX idx_bookings_barber    (barber_id),
  INDEX idx_bookings_service   (service_id),
  INDEX idx_bookings_date      (booking_date),
  INDEX idx_bookings_status    (status),
  CONSTRAINT fk_bookings_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_barber
    FOREIGN KEY (barber_id)   REFERENCES barbers(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_service
    FOREIGN KEY (service_id)  REFERENCES services(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── payments ──────────────────────────────────────────
-- One payment record per booking.
-- transaction_reference = Midtrans order_id / snap token.
-- payment_method is filled by Midtrans webhook (e.g. "qris", "bank_transfer").
CREATE TABLE IF NOT EXISTS payments (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id            BIGINT UNSIGNED NOT NULL,
  payment_method        VARCHAR(60)     NOT NULL DEFAULT 'midtrans',
  amount                DECIMAL(12,2)   NOT NULL,
  payment_status        ENUM('pending','paid','failed','refunded')
                                        NOT NULL DEFAULT 'pending',
  transaction_reference VARCHAR(200)    DEFAULT NULL
                                        COMMENT 'Midtrans snap token or order_id',
  paid_at               DATETIME        DEFAULT NULL,
  created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_booking (booking_id),
  INDEX idx_payment_status (payment_status),
  INDEX idx_payment_method (payment_method),
  CONSTRAINT fk_payments_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- SEED DATA — Services
-- =====================================================
INSERT INTO services (name, description, price, duration, image, status)
VALUES
  (
    'Haircut',
    'Potong rambut presisi sesuai karakter dan gaya kamu. Ditangani oleh barber profesional kami.',
    50000, 30,
    'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=900&q=80',
    'active'
  ),
  (
    'Wash Hair',
    'Cuci rambut dan relaksasi dengan produk premium. Rambut bersih, kepala segar.',
    25000, 20,
    'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=900&q=80',
    'active'
  ),
  (
    'Hair Dye',
    'Warna baru, hasil natural yang tetap terasa kamu. Pewarna berkualitas premium dengan konsultasi gratis.',
    150000, 60,
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80',
    'active'
  )
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  price       = VALUES(price),
  duration    = VALUES(duration),
  image       = VALUES(image);

-- =====================================================
-- SEED DATA — Barbers
-- =====================================================
INSERT INTO barbers (name, phone, specialization, photo, status)
VALUES
  (
    'Raka',
    '081234567891',
    'Classic Cut, Pompadour, Fade',
    'https://images.unsplash.com/photo-1599351431202-1e0f0d6c2e6b?auto=format&fit=crop&w=900&q=80',
    'active'
  ),
  (
    'Dimas',
    '081234567892',
    'Undercut, Texture, Hair Dye',
    'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=900&q=80',
    'active'
  ),
  (
    'Arga',
    '081234567893',
    'Slick Back, Beard Trim, Wash',
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80',
    'active'
  )
ON DUPLICATE KEY UPDATE
  specialization = VALUES(specialization),
  phone          = VALUES(phone);

-- =====================================================
-- NOTE: Admin + demo customer accounts are seeded
-- automatically by backend/server.js on first start
-- using bcrypt-hashed passwords:
--   admin@edpabarber.com    / Admin123!
--   customer@edpabarber.com / Customer123!
-- =====================================================
