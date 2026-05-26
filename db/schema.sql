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
    lang            VARCHAR(20) DEFAULT 'english'
);

-- Índices para búsquedas frecuentes del admin
CREATE INDEX IF NOT EXISTS idx_bookings_date     ON bookings (booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings (payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_email    ON bookings (customer_email);
CREATE INDEX IF NOT EXISTS idx_bookings_sumup_id ON bookings (sumup_id);
