/**
 * @file markets.routes.ts
 * @description Rutas CRUD para los mercados de apuestas.
 * Los mercados definen los tipos de pronóstico disponibles
 * (ej: "Gana Local", "Ambos Marcan", "+2.5 Goles").
 */

import { Router } from "express";
import { pool } from "../config/database";
import { authenticateToken, requireAdmin } from "../middleware/auth";

// Creamos el router para las rutas de mercados
const router = Router();

// ─── GET /api/markets ────────────────────────────────────────────────────────
/**
 * Devuelve todos los mercados disponibles ordenados por ID.
 * Ruta pública: se usa en el formulario de creación de picks.
 */
router.get("/", async (_req, res) => {
  try {
    // Ordenamos por ID para mantener un orden consistente en los selects del frontend
    const [filas] = await pool.query("SELECT * FROM markets ORDER BY id");
    return res.json(filas);
  } catch (error) {
    console.error("[MARKETS] Error obteniendo mercados:", error);
    return res.status(500).json({ error: "Error al obtener mercados" });
  }
});

// ─── POST /api/markets ───────────────────────────────────────────────────────
/**
 * Crea un nuevo mercado de apuestas.
 * El acrónimo sirve como ID único del mercado (ej: "AEM", "+2.5").
 * Solo administradores.
 */
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  const { label, acronym } = req.body;

  // Ambos campos son obligatorios para crear un mercado
  if (!label || !acronym) {
    return res.status(400).json({ error: "La etiqueta y el acrónimo son obligatorios" });
  }

  try {
    // El ID del mercado es el acrónimo en trim (sin espacios)
    const id = acronym.trim();

    // Verificamos que no exista ya un mercado con el mismo ID/acrónimo
    const [existentes]: any = await pool.query(
      "SELECT id FROM markets WHERE id = ?",
      [id]
    );
    if (existentes.length > 0) {
      return res.status(400).json({ error: "Ya existe un mercado con ese acrónimo" });
    }

    // Insertamos el nuevo mercado
    await pool.query(
      "INSERT INTO markets (id, label, acronym) VALUES (?, ?, ?)",
      [id, label, acronym]
    );

    return res.status(201).json({ id, message: "Mercado creado" });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "El mercado ya existe" });
    }
    console.error("[MARKETS] Error creando mercado:", error);
    return res.status(500).json({ error: "Error al crear mercado" });
  }
});

// ─── PUT /api/markets/:id ────────────────────────────────────────────────────
/**
 * Actualiza un mercado existente.
 * Si el acrónimo cambia, actualiza también el ID del mercado.
 * Solo administradores.
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { label, acronym } = req.body;

  if (!label || !acronym) {
    return res.status(400).json({ error: "La etiqueta y el acrónimo son obligatorios" });
  }

  try {
    // El nuevo ID es el nuevo acrónimo en trim
    const nuevoId = acronym.trim();

    // Si el acrónimo cambió, verificamos que el nuevo no esté en uso
    if (nuevoId !== id) {
      const [existentes]: any = await pool.query(
        "SELECT id FROM markets WHERE id = ?",
        [nuevoId]
      );
      if (existentes.length > 0) {
        return res.status(400).json({ error: "Ya existe un mercado con ese acrónimo" });
      }
    }

    // Actualizamos tanto el ID como el label y acronym
    await pool.query(
      "UPDATE markets SET id = ?, label = ?, acronym = ? WHERE id = ?",
      [nuevoId, label, acronym, id]
    );

    return res.json({ message: "Mercado actualizado" });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "El mercado ya existe" });
    }
    console.error("[MARKETS] Error actualizando mercado:", error);
    return res.status(500).json({ error: "Error al actualizar mercado" });
  }
});

// ─── DELETE /api/markets/:id ─────────────────────────────────────────────────
/**
 * Elimina un mercado por su ID.
 * Solo administradores.
 */
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM markets WHERE id = ?", [id]);
    return res.json({ message: "Mercado eliminado" });
  } catch (error) {
    console.error("[MARKETS] Error eliminando mercado:", error);
    return res.status(500).json({ error: "Error al eliminar mercado" });
  }
});

// Exportamos el router
export default router;
