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

// ─── GET /api/promo-codes ────────────────────────────────────────────────────
/**
 * Lista todos los códigos promocionales existentes.
 * Solo administradores.
 */
router.get("/", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    // Ordenamos por fecha de creación descendente para ver los nuevos primero
    const [codigos] = await pool.query(
      "SELECT * FROM promo_codes ORDER BY created_at DESC"
    );
    return res.json(codigos);
  } catch (error) {
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
    await pool.query(
      `INSERT INTO promo_codes (code, discount_percentage, max_uses, valid_until) 
       VALUES (?, ?, ?, ?)`,
      [
        code.toUpperCase(),                   // Normalizamos el código a mayúsculas
        discount_percentage,
        max_uses || null,                      // null = usos ilimitados
        valid_until || null,                   // null = sin fecha de expiración
      ]
    );
    return res.json({ success: true, message: "Código promocional creado" });
  } catch (error: any) {
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
  } catch (error) {
    console.error("[PROMOS] Error eliminando código:", error);
    return res.status(500).json({ error: "Error al eliminar código de descuento" });
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
    const [filas] = await pool.query(
      "SELECT * FROM promo_codes WHERE code = ?",
      [code.toUpperCase()]
    );
    const codigos = filas as any[];

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

    // Verificamos que el código no haya expirado
    if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
      return res.status(400).json({ error: "Este código promocional ha expirado" });
    }

    // El código es válido: devolvemos el descuento aplicable
    return res.json({
      discount_percentage: promo.discount_percentage,
      id: promo.id,
      code: promo.code,
    });
  } catch (error) {
    console.error("[PROMOS] Error validando código:", error);
    return res.status(500).json({ error: "Error al validar código" });
  }
});

// Exportamos el router
export default router;
