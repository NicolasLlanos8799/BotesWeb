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

-- ─────────────────────────────────────────────────────────────────────────────
-- Bloqueos manuales de horario (mantenimiento, clima, vacaciones…)
-- Una fila = un día × un bote. Un bloqueo de la UI genera N filas con el mismo
-- group_id (rango de fechas × botes seleccionados) para poder deshacerlo entero.
-- Fuente de verdad para: GYG get-availabilities/reserve + evento en Google Calendar
-- (que es lo que bloquea la web pública).
CREATE TABLE IF NOT EXISTS blocked_slots (
    id            SERIAL PRIMARY KEY,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    group_id      UUID NOT NULL,
    block_date    DATE NOT NULL,
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    boat          VARCHAR(10) NOT NULL,          -- 'boat1' | 'boat2'
    reason        VARCHAR(255),
    gcal_event_id VARCHAR(255),                  -- id del evento creado en Google Calendar
    CONSTRAINT blocked_slots_range_ck CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_date  ON blocked_slots (block_date);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_boat  ON blocked_slots (boat, block_date);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_group ON blocked_slots (group_id);

-- Run this on existing DBs to add new columns without recreating the table:
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'web';
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gyg_booking_id VARCHAR(100) UNIQUE;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extras INTEGER DEFAULT 0;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_end_time TIME;
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS boat VARCHAR(10);
