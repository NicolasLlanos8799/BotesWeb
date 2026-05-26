import db from '../lib/db.js';

async function addBooking() {
  console.log('📅 Adding specific booking for today (May 8, 19:00)...');
  
  try {
    const tour = { id: 'book-reffen', name: 'Private 3-Hour Extended (Reffen)', price: 4299 };
    const date = '2026-05-08'; // TODAY
    const time = '19:00:00';
    
    await db.execute(
      `INSERT INTO bookings (tour_id, tour_name, customer_name, customer_email, customer_phone, passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tour.id, 
        tour.name, 
        'Nicolas Llanos', 
        'nicolas@example.com', 
        '+34 600000000', 
        6, 
        date, 
        time, 
        tour.price, 
        'PAID', 
        'manual_' + Date.now(), 
        'spanish'
      ]
    );

    console.log('✅ Booking added! Check your Captain\'s Manifest now.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

addBooking();
