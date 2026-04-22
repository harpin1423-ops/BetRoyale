/**
 * @file database.ts
 * @description Configuración del pool de conexiones MySQL.
 * Exporta el pool de conexiones reutilizable y un wrapper
 * que detecta queries lentas automáticamente.
 */
import mysql from "mysql2/promise";
import { env } from "./env.js";
/**
 * Pool de conexiones MySQL compartido en toda la aplicación.
 * Permite reutilizar conexiones en lugar de abrir una nueva por request.
 */
export const pool = mysql.createPool({
    /** Host del servidor de base de datos */
    host: env.DB_HOST,
    /** Usuario de la base de datos */
    user: env.DB_USER,
    /** Contraseña de la base de datos */
    password: env.DB_PASSWORD,
    /** Nombre de la base de datos a usar */
    database: env.DB_NAME,
    /** Esperar por una conexión libre si el pool está lleno */
    waitForConnections: true,
    /** Número máximo de conexiones simultáneas permitidas */
    connectionLimit: 10,
    /** 0 = sin límite en la cola de espera de conexiones */
    queueLimit: 0,
});
// ─── Wrapper de queries con detección de lentitud ───────────────────────────
// Guardamos la referencia original antes de reemplazarla
const _originalQuery = pool.query.bind(pool);
/**
 * Reemplazamos pool.query para interceptar cada consulta y:
 * 1. Medir el tiempo de ejecución
 * 2. Registrar una advertencia si supera los 500ms
 * 3. Re-lanzar errores de forma controlada
 */
pool.query = async (...args) => {
    // Tomamos el timestamp de inicio
    const inicio = Date.now();
    try {
        // Ejecutamos la query original
        const resultado = await _originalQuery(...args);
        // Calculamos la duración
        const duracion = Date.now() - inicio;
        // Si tardó más de 500ms, lo reportamos como query lenta
        if (duracion > 500) {
            console.warn(`[DB LENTA] ${duracion}ms → ${String(args[0]).substring(0, 100)}...`);
        }
        return resultado;
    }
    catch (error) {
        const duracion = Date.now() - inicio;
        // Ignoramos la advertencia de duplicados (son esperados en ON DUPLICATE KEY)
        if (error.code !== "ER_DUP_ENTRY") {
            console.error(`[DB ERROR] ${duracion}ms → ${String(args[0]).substring(0, 100)}`, error.message);
        }
        // Re-lanzamos el error para que lo maneje el route handler
        throw error;
    }
};
/**
 * Verifica que la conexión a la base de datos está activa.
 * Útil para health checks al iniciar el servidor.
 */
export async function testConnection() {
    try {
        // Obtenemos una conexión del pool
        const conn = await pool.getConnection();
        // Ejecutamos una query simple para verificar la conexión
        await conn.query("SELECT 1");
        // Devolvemos la conexión al pool
        conn.release();
        console.log("[DB] ✅ Conexión a MySQL establecida correctamente");
        return true;
    }
    catch (error) {
        console.error("[DB] ❌ Error conectando a MySQL:", error);
        return false;
    }
}
