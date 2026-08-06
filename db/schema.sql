-- Seaduced Experience — PostgreSQL Schema
-- Compatible con Neon / Vercel Postgres
-- Ejecutar una vez en cada base de datos (demo y producción)

CREATE TABLE IF NOT EXISTS bookings (
    id              SERIAL PRIMARY KEY,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tour_id         VARCHAR(50),
    tour_name       VARCHAR(255),
    customer_name   VARCHAR(255),
    customer_email  VARCHAR(255),
    customer_phone  VARCHAR(50),
    passengers      INTEGER,
    booking_date    DATE,
    booking_time    TIME,
    total_price     DECIMAL(10, 2),
    payment_status  VARCHAR(20) DEFAULT 'PENDING',
    sumup_id        VARCHAR(100) UNIQUE,
    lang            VARCHAR(20) DEFAULT 'english',
    source          VARCHAR(20) DEFAULT 'web',       -- 'web' | 'gyg'
    gyg_booking_id  VARCHAR(100) UNIQUE,             -- GYG booking ref, nullable
    extras          INTEGER DEFAULT 0,               -- Charcuterie/tapas qty
    booking_end_time TIME,                           -- Manual override; falls back to tour duration if null
    boat            VARCHAR(10)                      -- Manual override 'boat1'|'boat2'; null = boat del tour
);

-- Índices para búsquedas frecuentes del admin
CREATE INDEX IF NOT EXISTS idx_bookings_date     ON bookings (booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings (payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_email    ON bookings (customer_email);
CREATE INDEX IF NOT EXISTS idx_bookings_sumup_id ON bookings (sumup_id);
CREATE INDEX IF NOT EXISTS idx_bookings_source   ON bookings (source);

-- Run this on existing DBs to add new columns without recreating the table:
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'web';
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gyg_booking_id VARCHAR(100) UNIQUE;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extras INTEGER DEFAULT 0;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_end_time TIME;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS boat VARCHAR(10);
