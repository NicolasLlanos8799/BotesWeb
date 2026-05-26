import db from '../lib/db.js';

async function testSave() {
  console.log('🧪 Testing Postgres save...');

  const mockId = 'test_' + Date.now();

  try {
    const result = await db`
      INSERT INTO bookings
        (tour_id, tour_name, customer_name, customer_email, customer_phone,
         passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang)
      VALUES
        ('test-tour', 'Test Experience', 'Debug User', 'debug@example.com', '12345678',
         2, '2026-06-01', '10:00', 1500, 'PAID', ${mockId}, 'english')
      RETURNING id
    `;

    console.log('✅ SUCCESS! Booking saved with ID:', result.rows[0].id);
    process.exit(0);
  } catch (err) {
    console.error('❌ FAILED:', err.message);
    process.exit(1);
  }
}

testSave();
