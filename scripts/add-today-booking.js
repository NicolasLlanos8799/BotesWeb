import db from '../lib/db.js';

async function addBooking() {
  console.log('📅 Adding a booking for today...');

  try {
    const today = new Date().toISOString().split('T')[0];
    const mockId = 'manual_' + Date.now();

    await db`
      INSERT INTO bookings
        (tour_id, tour_name, customer_name, customer_email, customer_phone,
         passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang)
      VALUES
        ('book-reffen', 'Private 3-Hour Extended (Reffen)', 'Nicolas Llanos',
         'nicolas@example.com', '+34 600000000',
         6, ${today}, '19:00', 4299, 'PAID', ${mockId}, 'spanish')
      ON CONFLICT (sumup_id) DO NOTHING
    `;

    console.log("✅ Booking added for today! Check your Captain's Manifest now.");
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

addBooking();
