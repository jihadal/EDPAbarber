-- =====================================================
-- EDPAbarber — Schema Fix Script
-- Jalankan ini jika sudah pernah import edpabarber.sql
-- dan muncul error saat booking.
-- =====================================================

USE edpabarber_db;

-- Hapus UNIQUE KEY yang bermasalah (jika ada)
-- MySQL tidak support partial unique index pada ENUM
ALTER TABLE bookings DROP INDEX IF EXISTS uq_barber_slot;

-- Pastikan kolom booking_time bertipe TIME (bukan VARCHAR)
-- Jalankan ini hanya jika perlu:
-- ALTER TABLE bookings MODIFY COLUMN booking_time TIME NOT NULL;

SELECT 'Schema fix applied successfully.' AS result;

-- =====================================================
-- Fix: Ubah kolom photo/image ke LONGTEXT
-- Jalankan ini jika muncul "Data too long for column"
-- =====================================================
ALTER TABLE barbers MODIFY COLUMN photo LONGTEXT;
ALTER TABLE services MODIFY COLUMN image LONGTEXT;

SELECT 'Photo/image columns updated to LONGTEXT.' AS result;
