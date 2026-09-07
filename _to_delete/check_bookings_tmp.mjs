import db from "./lib/db.js";
const r = await db`SELECT id, created_at, booking_date, booking_time, payment_status, customer_name, tour_name, total_price, reminder_sent_at FROM bookings ORDER BY id DESC LIMIT 8`;
console.log(JSON.stringify(r.rows ?? r, null, 2));
const c = await db`SELECT COUNT(*) FROM bookings`;
console.log("count:", JSON.stringify(c.rows ?? c));
