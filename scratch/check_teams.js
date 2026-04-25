
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkTeams() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'betroyale'
  });

  try {
    const [rows] = await connection.execute('SELECT * FROM teams WHERE name LIKE "%Grasshopper%" OR name LIKE "%Luzern%"');
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

checkTeams();
