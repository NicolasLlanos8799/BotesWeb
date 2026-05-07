import mysql from 'mysql2/promise';

async function init() {
  const config = {
    host: '127.0.0.1',
    user: 'root',
    password: '',
  };

  try {
    const connection = await mysql.createConnection(config);
    console.log('✅ Connected to MySQL server.');

    await connection.query('CREATE DATABASE IF NOT EXISTS seaduced_experience;');
    console.log('✅ Database "seaduced_experience" checked/created.');

    await connection.query('USE seaduced_experience;');
    
    const tableQuery = `
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
    `;

    await connection.query(tableQuery);
    console.log('✅ Table "bookings" checked/created.');

    console.log('\n🚀 ALL DONE! Your database is ready.');
    await connection.end();
  } catch (err) {
    console.error('❌ Error during initialization:', err.message);
    if (err.code === 'ER_NOT_SUPPORTED_AUTH_MODE') {
      console.log('\n💡 Try running this in your terminal to fix auth mode:');
      console.log('mysql -h 127.0.0.1 -u root -e "ALTER USER \'root\'@\'localhost\' IDENTIFIED WITH mysql_native_password BY \'\';"');
    }
  }
}

init();
