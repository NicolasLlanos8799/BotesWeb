import db from '../lib/db.js';

async function cleanupAndSeed() {
  console.log('🧹 Cleaning up old mock data...');
  
  try {
    // Only delete bookings that were created by the seeder (sumup_id starts with mock_)
    const [delResult] = await db.execute("DELETE FROM bookings WHERE sumup_id LIKE 'mock_%'");
    console.log(`✅ Deleted ${delResult.affectedRows} mock records.`);

    console.log('🌱 Seeding 15 fresh mock bookings...');
    const tours = [
      { id: 'book-1h', name: 'City Highlights', price: 2499 },
      { id: 'book-winter', name: '2-Hour Winter Hygge 2026', price: 4999 },
      { id: 'book-reffen', name: 'Private 3-Hour Extended (Reffen)', price: 4299 },
      { id: 'book-premium', name: 'Sea Fortress & Coastal Journey (4-Hour)', price: 5999 },
      { id: 'book-malmo', name: 'Copenhagen to Malmö Experience', price: 13000 },
      { id: 'book-wine', name: 'Floating Wine Tasting Experience', price: 3499 }
    ];

    const names = ['Emma Jensen', 'Lars Nielsen', 'Sofia Hansen', 'Mads Pedersen', 'Oliver Andersen', 'Freja Christensen', 'Hans Møller', 'Anya Berg', 'John Doe', 'Sarah Connor'];
    
    for (let i = 0; i < 15; i++) {
      const tour = tours[Math.floor(Math.random() * tours.length)];
      const name = names[Math.floor(Math.random() * names.length)];
      const pax = Math.floor(Math.random() * 8) + 1;
      const date = `2026-05-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`;
      const time = `${String(Math.floor(Math.random() * 8) + 9).padStart(2, '0')}:00`;
      const status = Math.random() > 0.1 ? 'PAID' : 'PENDING';

      await db.execute(
        `INSERT INTO bookings (tour_id, tour_name, customer_name, customer_email, customer_phone, passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tour.id, tour.name, name, name.toLowerCase().replace(' ', '.') + '@example.com', '+45 ' + (Math.floor(Math.random() * 89999999) + 10000000), pax, date, time, tour.price, status, 'mock_sumup_' + Math.random().toString(36).substring(7), 'english']
      );
    }

    console.log('🚀 DONE! Ahora tienes 15 registros de prueba + tus reservas reales.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

cleanupAndSeed();
