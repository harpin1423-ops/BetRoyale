/**
 * @file promoCodes.routes.ts
 * @description Rutas CRUD para los códigos de descuento promocionales.
 * Permite al admin crear, listar y eliminar códigos de promo.
 * Los usuarios pueden validar un código antes de comprar.
 */
import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
// Creamos el router para las rutas de códigos promocionales
const router = Router();
// Zona horaria oficial para operaciones administrativas de BetRoyale en Colombia.
const PROMO_TIME_ZONE = "America/Bogota";
/**
 * @summary Formatea una fecha absoluta como DATETIME local de Colombia para MySQL.
 * @param value - Fecha absoluta que se debe representar en hora Colombia.
 * @returns Cadena compatible con DATETIME en formato YYYY-MM-DD HH:mm:ss.
 */
function formatDateInColombia(value) {
    // Descomponemos la fecha usando la zona horaria de Colombia.
    const parts = new Intl.DateTimeFormat("en-CA", {
        // Aplicamos la zona horaria operativa del proyecto.
        timeZone: PROMO_TIME_ZONE,
        // Solicitamos año numérico para construir el DATETIME.
        year: "numeric",
        // Solicitamos mes con dos dígitos para mantener orden lexicográfico.
        month: "2-digit",
        // Solicitamos día con dos dígitos para mantener orden lexicográfico.
        day: "2-digit",
        // Solicitamos hora con dos dígitos en formato de 24 horas.
        hour: "2-digit",
        // Solicitamos minutos con dos dígitos para DATETIME.
        minute: "2-digit",
        // Solicitamos segundos con dos dígitos para DATETIME.
        second: "2-digit",
        // Forzamos ciclo 00-23 para evitar AM/PM y horas 24.
        hourCycle: "h23",
    }).formatToParts(value);
    // Convertimos las partes en un mapa simple por tipo.
    const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    // Devolvemos el formato nativo que espera MySQL DATETIME.
    return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
}
/**
 * @summary Normaliza la fecha enviada por el formulario de cupones sin aplicar desfases UTC.
 * @param value - Valor recibido desde el cliente para valid_until.
 * @returns Fecha DATETIME MySQL o null si el cupón no vence.
 */
function normalizarFechaCupon(value) {
    // Ignoramos valores no enviados o explícitamente vacíos.
    if (typeof value !== "string")
        return null;
    // Quitamos espacios accidentales del formulario.
    const trimmed = value.trim();
    // Permitimos cupones sin fecha de expiración.
    if (!trimmed)
        return null;
    // Detectamos timestamps con zona horaria explícita, como ISO terminado en Z.
    const hasExplicitTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
    // Convertimos timestamps absolutos a hora Colombia antes de cualquier recorte.
    if (hasExplicitTimeZone) {
        // Parseamos el timestamp absoluto recibido desde integraciones o clientes antiguos.
        const parsed = new Date(trimmed);
        // Rechazamos valores inválidos en lugar de guardar una fecha corrupta.
        if (Number.isNaN(parsed.getTime()))
            return null;
        // Convertimos el ISO externo a hora Colombia antes de persistir.
        return formatDateInColombia(parsed);
    }
    // Convertimos el separador de datetime-local al separador DATETIME de MySQL.
    const normalized = trimmed.replace("T", " ").slice(0, 19);
    // Aceptamos valores con precisión de minutos desde el input datetime-local.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized))
        return `${normalized}:00`;
    // Aceptamos valores ya normalizados con segundos.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized))
        return normalized;
    // Rechazamos valores ambiguos sin zona horaria para evitar desfases silenciosos.
    return null;
}
/**
 * @summary Obtiene el momento actual como DATETIME local de Colombia para comparar cupones.
 * @returns Cadena YYYY-MM-DD HH:mm:ss en hora Colombia.
 */
function obtenerAhoraColombiaMysql() {
    // Usamos la misma normalización para comparar contra valores DATETIME de cupones.
    return formatDateInColombia(new Date());
}
// ─── GET /api/promo-codes ────────────────────────────────────────────────────
/**
 * Lista todos los códigos promocionales existentes.
 * Solo administradores.
 */
router.get("/", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        // Ordenamos por fecha de creación descendente y devolvemos DATETIME sin conversión UTC.
        const [codigos] = await pool.query(`SELECT id, code, discount_percentage, max_uses, current_uses,
        DATE_FORMAT(valid_until, '%Y-%m-%d %H:%i:%s') AS valid_until,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM promo_codes
       ORDER BY created_at DESC`);
        return res.json(codigos);
    }
    catch (error) {
        console.error("[PROMOS] Error obteniendo códigos:", error);
        return res.status(500).json({ error: "Error al obtener códigos de descuento" });
    }
});
// ─── POST /api/promo-codes ───────────────────────────────────────────────────
/**
 * Crea un nuevo código promocional.
 * El código se guarda en mayúsculas para normalizar las búsquedas.
 * Solo administradores.
 */
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
    const { code, discount_percentage, max_uses, valid_until } = req.body;
    try {
        // Normalizamos la fecha como hora Colombia/MySQL antes de guardar.
        const fechaValidaHasta = normalizarFechaCupon(valid_until);
        await pool.query(`INSERT INTO promo_codes (code, discount_percentage, max_uses, valid_until) 
       VALUES (?, ?, ?, ?)`, [
            code.toUpperCase(), // Normalizamos el código a mayúsculas
            discount_percentage,
            max_uses || null, // null = usos ilimitados
            fechaValidaHasta, // null = sin fecha de expiración
        ]);
        return res.json({ success: true, message: "Código promocional creado" });
    }
    catch (error) {
        // El código ya existe (violación de UNIQUE)
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "El código ya existe" });
        }
        console.error("[PROMOS] Error creando código:", error);
        return res.status(500).json({ error: "Error al crear código de descuento" });
    }
});
// ─── DELETE /api/promo-codes/:id ─────────────────────────────────────────────
/**
 * Elimina un código promocional por su ID.
 * Solo administradores.
 */
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query("DELETE FROM promo_codes WHERE id = ?", [req.params.id]);
        return res.json({ success: true, message: "Código eliminado" });
    }
    catch (error) {
        console.error("[PROMOS] Error eliminando código:", error);
        return res.status(500).json({ error: "Error al eliminar código de descuento" });
    }
});
// ─── PUT /api/promo-codes/:id ────────────────────────────────────────────────
/**
 * Actualiza un código promocional existente.
 * Solo administradores.
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { code, discount_percentage, max_uses, valid_until } = req.body;
    const { id } = req.params;
    try {
        // Normalizamos la fecha como hora Colombia/MySQL antes de actualizar.
        const fechaValidaHasta = normalizarFechaCupon(valid_until);
        await pool.query(`UPDATE promo_codes 
       SET code = ?, discount_percentage = ?, max_uses = ?, valid_until = ?
       WHERE id = ?`, [
            code.toUpperCase(),
            discount_percentage,
            max_uses || null,
            fechaValidaHasta,
            id
        ]);
        return res.json({ success: true, message: "Código promocional actualizado" });
    }
    catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "El código ya existe" });
        }
        console.error("[PROMOS] Error actualizando código:", error);
        return res.status(500).json({ error: "Error al actualizar código de descuento" });
    }
});
// ─── POST /api/promo-codes/validate ──────────────────────────────────────────
/**
 * Valida un código promocional ingresado por el usuario.
 * Verifica: existencia, límite de usos y vigencia.
 * Ruta protegida: el usuario debe estar autenticado para validar.
 */
router.post("/validate", authenticateToken, async (req, res) => {
    const { code } = req.body;
    try {
        // Buscamos el código en mayúsculas (como están almacenados)
        const [filas] = await pool.query(`SELECT id, code, discount_percentage, max_uses, current_uses,
        DATE_FORMAT(valid_until, '%Y-%m-%d %H:%i:%s') AS valid_until
       FROM promo_codes
       WHERE code = ?`, [code.toUpperCase()]);
        const codigos = filas;
        // Si no existe el código, respuesta genérica
        if (codigos.length === 0) {
            return res.status(404).json({ error: "Código promocional inválido" });
        }
        const promo = codigos[0];
        // Verificamos que no haya superado el límite de usos
        if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
            return res.status(400).json({
                error: "Este código ha alcanzado su límite máximo de usos",
            });
        }
        // Verificamos que el código no haya expirado usando hora Colombia, sin UTC implícito.
        if (promo.valid_until && String(promo.valid_until) < obtenerAhoraColombiaMysql()) {
            return res.status(400).json({ error: "Este código promocional ha expirado" });
        }
        // El código es válido: devolvemos el descuento aplicable
        return res.json({
            discount_percentage: promo.discount_percentage,
            id: promo.id,
            code: promo.code,
        });
    }
    catch (error) {
        console.error("[PROMOS] Error validando código:", error);
        return res.status(500).json({ error: "Error al validar código" });
    }
});
// Exportamos el router
export default router;
