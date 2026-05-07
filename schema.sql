CREATE DATABASE IF NOT EXISTS seaduced_experience;
USE seaduced_experience;

CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tour_id VARCHAR(50),
    tour_name VARCHAR(255),
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    passengers INT,
    booking_date DATE,
    booking_time TIME,
    total_price DECIMAL(10, 2),
    payment_status VARCHAR(20) DEFAULT 'PENDING',
    sumup_id VARCHAR(100) UNIQUE,
    lang VARCHAR(20) DEFAULT 'english'
);
