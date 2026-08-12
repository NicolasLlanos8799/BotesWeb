import db from '../lib/db.js';

async function addBooking() {
  console.log("📅 Adding today's bookings...");

  const today = new Date().toISOString().split('T')[0];

  const bookings = [
    {
      tour_id: 'city-highlights-1h', tour_name: 'City Highlights',
      customer_name: 'Emma Jensen', customer_email: 'emma.jensen@example.com',
      customer_phone: '+45 20123456', passengers: 2, booking_time: '10:00',
      total_price: 2499, payment_status: 'PAID', lang: 'english',
      source: 'gyg', sumup_id: 'manual_' + Date.now() + '_1',
      gyg_booking_id: 'GYG-' + Math.random().toString(36).substring(2, 9).toUpperCase()
    },
    {
      tour_id: 'city-highlights-3h', tour_name: 'Private 3-Hour Extended (Reffen)',
      customer_name: 'Oliver Andersen', customer_email: 'oliver.andersen@example.com',
      customer_phone: '+45 20987654', passengers: 4, booking_time: '13:00',
      total_price: 4299, payment_status: 'PAID', lang: 'english',
      source: 'gyg', sumup_id: 'manual_' + Date.now() + '_2',
      gyg_booking_id: 'GYG-' + Math.random().toString(36).substring(2, 9).toUpperCase()
    },
    {
      tour_id: 'book-wine', tour_name: 'Floating Wine Tasting Experience',
      customer_name: 'Nicolas Llanos', customer_email: 'nicolas@example.com',
      customer_phone: '+34 600000000', passengers: 6, booking_time: '19:00',
      total_price: 4999, payment_status: 'PAID', lang: 'spanish',
      source: 'web', sumup_id: 'manual_' + Date.now() + '_3',
      gyg_booking_id: null
    }
  ];

  try {
    for (const b of bookings) {
      await db`
        INSERT INTO bookings
          (tour_id, tour_name, customer_name, customer_email, customer_phone,
           passengers, booking_date, booking_time, total_price, payment_status, sumup_id,
           lang, source, gyg_booking_id)
        VALUES
          (${b.tour_id}, ${b.tour_name}, ${b.customer_name}, ${b.customer_email}, ${b.customer_phone},
           ${b.passengers}, ${today}, ${b.booking_time}, ${b.total_price}, ${b.payment_status}, ${b.sumup_id},
           ${b.lang}, ${b.source}, ${b.gyg_booking_id})
        ON CONFLICT (sumup_id) DO NOTHING
      `;
    }

    console.log("✅ 3 bookings added for today (2 GetYourGuide + 1 own)!");
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

addBooking();
