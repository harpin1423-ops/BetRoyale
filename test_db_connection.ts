/**
 * Script temporal para probar la conexión a MySQL de Hostinger
 * Ejecutar con: npx tsx test_db_connection.ts
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

// Cargamos las variables de entorno
dotenv.config();

async function testConexion() {
  console.log(`\n🔌 Intentando conectar a MySQL...`);
  console.log(`   Host: ${process.env.DB_HOST}`);
  console.log(`   User: ${process.env.DB_USER}`);
  console.log(`   DB:   ${process.env.DB_NAME}\n`);

  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 15000,
      // Puerto estándar MySQL
      port: 3306,
    });

    await conn.query("SELECT 1");
    console.log("✅ CONEXIÓN EXITOSA a MySQL en Hostinger!");

    // Mostramos las tablas existentes
    const [tablas]: any = await conn.query("SHOW TABLES");
    console.log("\n📋 Tablas existentes en la BD:");
    console.log(tablas.map((t: any) => Object.values(t)[0]));

    // Contamos registros
    const [countC]: any = await conn.query("SELECT COUNT(*) as count FROM countries");
    const [countL]: any = await conn.query("SELECT COUNT(*) as count FROM leagues");
    const [countT]: any = await conn.query("SELECT COUNT(*) as count FROM teams");
    
    console.log("\n📊 Estadísticas de registros:");
    console.log(`   Países: ${countC[0].count}`);
    console.log(`   Ligas:   ${countL[0].count}`);
    console.log(`   Equipos: ${countT[0].count}`);

    await conn.end();
  } catch (error: any) {
    console.error("❌ ERROR de conexión:", error.code, "-", error.message);
    
    // Sugerimos soluciones según el tipo de error
    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
      console.log("\n💡 Posible causa: El host es incorrecto o MySQL remoto no está habilitado.");
      console.log("   → Verifica en Hostinger: Bases de datos → Acceso remoto");
    } else if (error.code === "ER_ACCESS_DENIED_ERROR") {
      console.log("\n💡 Credenciales incorrectas (usuario o contraseña).");
      console.log("   → Tu IP actual es: 190.253.253.16 (Asegúrate de que esté autorizada en Hostinger)");
    } else if (error.code === "ENOTFOUND") {
      console.log("\n💡 Host no encontrado. Verifica el DB_HOST en el .env");
    }
  }
}

testConexion();
