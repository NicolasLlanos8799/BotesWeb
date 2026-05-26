import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

// Manual .env.local loader for local execution
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^#\s=]+)=(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

const bookingsData = [
{"id":"1","created_at":"2026-05-07 10:01:47","tour_id":"City Highlights","tour_name":"City Highlights","customer_name":"Test","customer_email":"nicolasllanossw@gmail.com","customer_phone":"121212","passengers":"1","booking_date":"2026-05-08","booking_time":"10:00:00","total_price":"10.00","payment_status":"PAID","sumup_id":"2c14839e-ed75-48bf-8593-3d3b036f4f24","lang":"english"},
{"id":"32","created_at":"2026-05-07 10:13:59","tour_id":"book-wine","tour_name":"Floating Wine Tasting Experience","customer_name":"Sarah Connor","customer_email":"sarah.connor@example.com","customer_phone":"+45 40109482","passengers":"6","booking_date":"2026-05-15","booking_time":"16:00:00","total_price":"3499.00","payment_status":"PAID","sumup_id":"mock_sumup_jpgr1r","lang":"english"},
{"id":"33","created_at":"2026-05-07 10:13:59","tour_id":"book-premium","tour_name":"Sea Fortress & Coastal Journey (4-Hour)","customer_name":"Emma Jensen","customer_email":"emma.jensen@example.com","customer_phone":"+45 55185119","passengers":"6","booking_date":"2026-05-27","booking_time":"10:00:00","total_price":"5999.00","payment_status":"PAID","sumup_id":"mock_sumup_6uceh5","lang":"english"},
{"id":"34","created_at":"2026-05-07 10:13:59","tour_id":"book-1h","tour_name":"City Highlights","customer_name":"Oliver Andersen","customer_email":"oliver.andersen@example.com","customer_phone":"+45 26397073","passengers":"4","booking_date":"2026-05-15","booking_time":"16:00:00","total_price":"2499.00","payment_status":"PAID","sumup_id":"mock_sumup_x7sx8rx","lang":"english"},
{"id":"35","created_at":"2026-05-07 10:13:59","tour_id":"book-premium","tour_name":"Sea Fortress & Coastal Journey (4-Hour)","customer_name":"Sofia Hansen","customer_email":"sofia.hansen@example.com","customer_phone":"+45 32897962","passengers":"6","booking_date":"2026-05-19","booking_time":"09:00:00","total_price":"5999.00","payment_status":"PAID","sumup_id":"mock_sumup_jga0o5","lang":"english"},
{"id":"36","created_at":"2026-05-07 10:13:59","tour_id":"book-reffen","tour_name":"Private 3-Hour Extended (Reffen)","customer_name":"Sarah Connor","customer_email":"sarah.connor@example.com","customer_phone":"+45 53340830","passengers":"1","booking_date":"2026-05-25","booking_time":"15:00:00","total_price":"4299.00","payment_status":"PAID","sumup_id":"mock_sumup_36npdo","lang":"english"},
{"id":"37","created_at":"2026-05-07 10:13:59","tour_id":"book-malmo","tour_name":"Copenhagen to Malmö Experience","customer_name":"Emma Jensen","customer_email":"emma.jensen@example.com","customer_phone":"+45 51771233","passengers":"3","booking_date":"2026-05-18","booking_time":"12:00:00","total_price":"13000.00","payment_status":"PAID","sumup_id":"mock_sumup_bdaod","lang":"english"},
{"id":"38","created_at":"2026-05-07 10:13:59","tour_id":"book-wine","tour_name":"Floating Wine Tasting Experience","customer_name":"Mads Pedersen","customer_email":"mads.pedersen@example.com","customer_phone":"+45 99783951","passengers":"2","booking_date":"2026-05-10","booking_time":"13:00:00","total_price":"3499.00","payment_status":"PAID","sumup_id":"mock_sumup_9mftli","lang":"english"},
{"id":"39","created_at":"2026-05-07 10:13:59","tour_id":"book-winter","tour_name":"2-Hour Winter Hygge 2026","customer_name":"Freja Christensen","customer_email":"freja.christensen@example.com","customer_phone":"+45 55116274","passengers":"3","booking_date":"2026-05-19","booking_time":"15:00:00","total_price":"4999.00","payment_status":"PAID","sumup_id":"mock_sumup_d98p3m","lang":"english"},
{"id":"40","created_at":"2026-05-07 10:13:59","tour_id":"book-reffen","tour_name":"Private 3-Hour Extended (Reffen)","customer_name":"Oliver Andersen","customer_email":"oliver.andersen@example.com","customer_phone":"+45 41120801","passengers":"5","booking_date":"2026-05-13","booking_time":"10:00:00","total_price":"4299.00","payment_status":"PAID","sumup_id":"mock_sumup_ofja8l","lang":"english"},
{"id":"41","created_at":"2026-05-07 10:13:59","tour_id":"book-winter","tour_name":"2-Hour Winter Hygge 2026","customer_name":"Oliver Andersen","customer_email":"oliver.andersen@example.com","customer_phone":"+45 88387137","passengers":"3","booking_date":"2026-05-07","booking_time":"14:00:00","total_price":"4999.00","payment_status":"PAID","sumup_id":"mock_sumup_0dfzv9","lang":"english"},
{"id":"42","created_at":"2026-05-07 10:13:59","tour_id":"book-winter","tour_name":"2-Hour Winter Hygge 2026","customer_name":"Emma Jensen","customer_email":"emma.jensen@example.com","customer_phone":"+45 90021917","passengers":"1","booking_date":"2026-05-05","booking_time":"16:00:00","total_price":"4999.00","payment_status":"PAID","sumup_id":"mock_sumup_rfl9m","lang":"english"},
{"id":"43","created_at":"2026-05-07 10:13:59","tour_id":"book-winter","tour_name":"2-Hour Winter Hygge 2026","customer_name":"Hans Møller","customer_email":"hans.møller@example.com","customer_phone":"+45 20007002","passengers":"4","booking_date":"2026-05-23","booking_time":"09:00:00","total_price":"4999.00","payment_status":"PAID","sumup_id":"mock_sumup_xu977r","lang":"english"},
{"id":"44","created_at":"2026-05-07 10:13:59","tour_id":"book-premium","tour_name":"Sea Fortress & Coastal Journey (4-Hour)","customer_name":"Sofia Hansen","customer_email":"sofia.hansen@example.com","customer_phone":"+45 70491683","passengers":"2","booking_date":"2026-05-01","booking_time":"10:00:00","total_price":"5999.00","payment_status":"PENDING","sumup_id":"mock_sumup_xhihyi","lang":"english"},
{"id":"45","created_at":"2026-05-07 10:13:59","tour_id":"book-winter","tour_name":"2-Hour Winter Hygge 2026","customer_name":"Oliver Andersen","customer_email":"oliver.andersen@example.com","customer_phone":"+45 16101969","passengers":"3","booking_date":"2026-05-07","booking_time":"14:00:00","total_price":"4999.00","payment_status":"PAID","sumup_id":"mock_sumup_gflyee","lang":"english"},
{"id":"46","created_at":"2026-05-07 10:13:59","tour_id":"book-reffen","tour_name":"Private 3-Hour Extended (Reffen)","customer_name":"Sofia Hansen","customer_email":"sofia.hansen@example.com","customer_phone":"+45 85338204","passengers":"5","booking_date":"2026-05-02","booking_time":"13:00:00","total_price":"4299.00","payment_status":"PAID","sumup_id":"mock_sumup_ttegcx","lang":"english"},
{"id":"47","created_at":"2026-05-08 17:50:51","tour_id":"book-reffen","tour_name":"Private 3-Hour Extended (Reffen)","customer_name":"Nicolas Llanos","customer_email":"nicolas@example.com","customer_phone":"+34 600000000","passengers":"6","booking_date":"2026-05-08","booking_time":"19:00:00","total_price":"4299.00","payment_status":"PAID","sumup_id":"manual_1778255451760","lang":"spanish"}
];

async function migrate() {
  console.log(`🚀 Starting migration of ${bookingsData.length} bookings...`);
  
  let successCount = 0;
  let errorCount = 0;

  for (const booking of bookingsData) {
    try {
      await sql`
        INSERT INTO bookings (
          created_at, tour_id, tour_name, customer_name, customer_email, 
          customer_phone, passengers, booking_date, booking_time, 
          total_price, payment_status, sumup_id, lang
        ) VALUES (
          ${booking.created_at}, ${booking.tour_id}, ${booking.tour_name}, 
          ${booking.customer_name}, ${booking.customer_email}, ${booking.customer_phone}, 
          ${parseInt(booking.passengers)}, ${booking.booking_date}, ${booking.booking_time}, 
          ${parseFloat(booking.total_price)}, ${booking.payment_status}, 
          ${booking.sumup_id}, ${booking.lang}
        )
        ON CONFLICT (sumup_id) DO NOTHING;
      `;
      successCount++;
    } catch (err) {
      console.error(`❌ Error importing booking ${booking.id}:`, err.message);
      errorCount++;
    }
  }

  console.log('\n--- Migration Results ---');
  console.log(`✅ Successfully imported: ${successCount}`);
  console.log(`❌ Errors/Duplicates: ${errorCount}`);
  console.log('-------------------------');
  console.log('🚀 ALL DONE! Check your /admin panel now.');
}

migrate();
