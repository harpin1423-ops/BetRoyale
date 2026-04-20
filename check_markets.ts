import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function checkMarkets() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'test',
  });

  try {
    const [rows]: any = await pool.query('DESCRIBE markets');
    console.log("Markets Schema:", rows);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

checkMarkets();
