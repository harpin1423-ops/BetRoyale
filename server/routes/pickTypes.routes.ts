/**
 * @file pickTypes.routes.ts
 * @description Rutas para gestionar los tipos de picks y su configuración de Telegram.
 */

import { Router } from "express";
import { pool } from "../config/database";
import { authenticateToken, requireAdmin } from "../middleware/auth";

const router = Router();

// ── GET /api/pick-types ──────────────────────────────────────────────────────
/**
 * Obtiene todos los tipos de pick disponibles.
 * Ruta protegida para admin.
 */
router.get("/", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM pick_types ORDER BY id ASC");
    return res.json(rows);
  } catch (error) {
    console.error("[PICK-TYPES] Error obteniendo tipos:", error);
    return res.status(500).json({ error: "Error al obtener tipos de pick" });
  }
});

// ── PUT /api/pick-types/:id ──────────────────────────────────────────────────
/**
 * Actualiza la configuración de un tipo de pick (incluyendo Telegram).
 * Solo administradores.
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, telegram_channel_id, telegram_invite_link } = req.body;

  if (!name) {
    return res.status(400).json({ error: "El nombre es obligatorio" });
  }

  try {
    const [result] = await pool.query(
      "UPDATE pick_types SET name = ?, telegram_channel_id = ?, telegram_invite_link = ? WHERE id = ?",
      [name, telegram_channel_id || null, telegram_invite_link || null, id]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Tipo de pick no encontrado" });
    }

    return res.json({ message: "Configuración de plan actualizada exitosamente" });
  } catch (error) {
    console.error("[PICK-TYPES] Error actualizando tipo:", error);
    return res.status(500).json({ error: "Error al actualizar el tipo de pick" });
  }
});

export default router;
