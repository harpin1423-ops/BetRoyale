import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Create a connection pool to Hostinger MySQL database
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'elitepicks',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper function to test connection
export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Successfully connected to MySQL database');
    connection.release();
    return true;
  } catch (error) {
    console.error('Error connecting to MySQL database:', error);
    return false;
  }
}
