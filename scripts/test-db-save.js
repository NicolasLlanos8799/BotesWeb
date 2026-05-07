import db from './lib/db.js';

async function testSave() {
  console.log('🧪 Testing MySQL Save Logic...');
  
  const mockBooking = {
    tour: 'test-tour',
    tourTitle: 'Test Experience',
    name: 'Debug User',
    email: 'debug@example.com',
    phone: '12345678',
    qty: 2,
    date: '2026-06-01',
    time: '10:00',
    total: 1500,
    checkout_id: 'test_id_' + Date.now()
  };

  try {
    const [result] = await db.execute(
      `INSERT INTO bookings (tour_id, tour_name, customer_name, customer_email, customer_phone, passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mockBooking.tour,
        mockBooking.tourTitle,
        mockBooking.name,
        mockBooking.email,
        mockBooking.phone,
        mockBooking.qty,
        mockBooking.date,
        mockBooking.time,
        mockBooking.total,
        "PAID",
        mockBooking.checkout_id,
        'english'
      ]
    );

    console.log('✅ SUCCESS! Booking saved to MySQL with ID:', result.insertId);
    process.exit(0);
  } catch (err) {
    console.error('❌ FAILED to save to MySQL:', err.message);
    process.exit(1);
  }
}

testSave();
