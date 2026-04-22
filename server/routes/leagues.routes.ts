/**
 * @file leagues.routes.ts
 * @description Rutas CRUD para ligas y países.
 * Maneja la creación, edición, eliminación y listado de ligas deportivas
 * y sus países asociados. Incluye eliminación masiva.
 */

import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";

// Creamos los routers separados para ligas y países
export const leaguesRouter = Router();
export const countriesRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// RUTAS DE PAÍSES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/countries ──────────────────────────────────────────────────────
/** Devuelve todos los países ordenados por nombre ascendentemente. */
countriesRouter.get("/", async (_req, res) => {
  try {
    const [filas] = await pool.query("SELECT * FROM countries ORDER BY name ASC");
    res.json(filas);
  } catch (error: any) {
    console.error("[COUNTRIES] Error obteniendo países:", error);
    return res.status(500).json({ error: "Error al obtener países" });
  }
});

// ─── POST /api/countries ─────────────────────────────────────────────────────
/** Crea un nuevo país. Solo administradores. */
countriesRouter.post("/", authenticateToken, requireAdmin, async (req, res) => {
  const { name, flag } = req.body;

  // El nombre es el único campo obligatorio
  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });

  try {
    // Verificamos que no exista otro país con el mismo nombre
    const [existentes]: any = await pool.query(
      "SELECT id FROM countries WHERE name = ?",
      [name]
    );
    if (existentes.length > 0) {
      return res.status(400).json({ error: "El país ya existe" });
    }

    // Insertamos el nuevo país (flag es opcional)
    const [resultado] = await pool.query(
      "INSERT INTO countries (name, flag) VALUES (?, ?)",
      [name, flag || null]
    );

    return res.status(201).json({
      id: (resultado as any).insertId,
      message: "País creado",
    });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "El país ya existe" });
    }
    console.error("[COUNTRIES] Error creando país:", error);
    return res.status(500).json({ error: "Error al crear país" });
  }
});

// ─── PUT /api/countries/:id ──────────────────────────────────────────────────
/** Actualiza un país existente. Solo administradores. */
countriesRouter.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, flag } = req.body;

  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });

  try {
    // Verificamos que no haya otro país con el mismo nombre (excluyendo el actual)
    const [existentes]: any = await pool.query(
      "SELECT id FROM countries WHERE name = ? AND id != ?",
      [name, id]
    );
    if (existentes.length > 0) {
      return res.status(400).json({ error: "Ya existe un país con ese nombre" });
    }

    await pool.query(
      "UPDATE countries SET name = ?, flag = ? WHERE id = ?",
      [name, flag || null, id]
    );

    return res.json({ message: "País actualizado" });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "El país ya existe" });
    }
    console.error("[COUNTRIES] Error actualizando país:", error);
    return res.status(500).json({ error: "Error al actualizar país" });
  }
});

// ─── DELETE /api/countries/:id ───────────────────────────────────────────────
/** Elimina un país. Falla si hay ligas asociadas. Solo administradores. */
countriesRouter.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM countries WHERE id = ?", [id]);
    return res.json({ message: "País eliminado" });
  } catch (error: any) {
    // Error de FK: el país tiene ligas asociadas y no puede eliminarse
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        error: "No se puede eliminar: hay ligas asociadas a este país",
      });
    }
    console.error("[COUNTRIES] Error eliminando país:", error);
    return res.status(500).json({ error: "Error al eliminar país" });
  }
});

// ─── POST /api/countries/bulk-delete ─────────────────────────────────────────
/** Elimina múltiples países a la vez. Solo administradores. */
countriesRouter.post("/bulk-delete", authenticateToken, requireAdmin, async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "IDs inválidos" });
  }

  try {
    await pool.query("DELETE FROM countries WHERE id IN (?)", [ids]);
    return res.json({ message: "Países eliminados" });
  } catch (error: any) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        error: "Algunos países tienen ligas asociadas y no pueden eliminarse",
      });
    }
    console.error("[COUNTRIES] Error en eliminación masiva:", error);
    return res.status(500).json({ error: "Error al eliminar países" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUTAS DE LIGAS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/leagues ────────────────────────────────────────────────────────
/** Devuelve todas las ligas con el nombre de su país asociado. */
leaguesRouter.get("/", async (_req, res) => {
  try {
    const [filas] = await pool.query(`
      SELECT l.*, c.name AS country_name, c.flag AS country_flag
      FROM leagues l 
      LEFT JOIN countries c ON l.country_id = c.id 
      ORDER BY l.name ASC
    `);
    return res.json(filas);
  } catch (error) {
    console.error("[LEAGUES] Error obteniendo ligas:", error);
    return res.status(500).json({ error: "Error al obtener ligas" });
  }
});

// ─── POST /api/leagues ───────────────────────────────────────────────────────
/** Crea una nueva liga, opcionalmente asociada a un país. Solo administradores. */
leaguesRouter.post("/", authenticateToken, requireAdmin, async (req, res) => {
  const { name, country_id } = req.body;

  // Convertimos country_id a entero o null si no se proporcionó
  const countryIdFinal =
    country_id && country_id !== "" ? parseInt(country_id.toString(), 10) : null;

  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });

  try {
    // Verificamos que no exista ya la misma liga en el mismo país
    const query = countryIdFinal
      ? "SELECT id FROM leagues WHERE name = ? AND country_id = ?"
      : "SELECT id FROM leagues WHERE name = ? AND country_id IS NULL";
    const params = countryIdFinal ? [name, countryIdFinal] : [name];

    const [existentes]: any = await pool.query(query, params);
    if (existentes.length > 0) {
      return res.status(400).json({ error: "La liga ya existe en este país" });
    }

    const [resultado] = await pool.query(
      "INSERT INTO leagues (name, country_id) VALUES (?, ?)",
      [name, countryIdFinal]
    );

    return res.status(201).json({
      id: (resultado as any).insertId,
      message: "Liga creada",
    });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "La liga ya existe en este país" });
    }
    console.error("[LEAGUES] Error creando liga:", error);
    return res.status(500).json({ error: "Error al crear liga" });
  }
});

// ─── PUT /api/leagues/:id ────────────────────────────────────────────────────
/** Actualiza una liga existente. Solo administradores. */
leaguesRouter.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, country_id } = req.body;

  const countryIdFinal =
    country_id && country_id !== "" ? parseInt(country_id.toString(), 10) : null;

  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });

  try {
    // Verificamos que no exista otra liga con el mismo nombre en el mismo país
    const query = countryIdFinal
      ? "SELECT id FROM leagues WHERE name = ? AND country_id = ? AND id != ?"
      : "SELECT id FROM leagues WHERE name = ? AND country_id IS NULL AND id != ?";
    const params = countryIdFinal ? [name, countryIdFinal, id] : [name, id];

    const [existentes]: any = await pool.query(query, params);
    if (existentes.length > 0) {
      return res.status(400).json({ error: "La liga ya existe en este país" });
    }

    await pool.query(
      "UPDATE leagues SET name = ?, country_id = ? WHERE id = ?",
      [name, countryIdFinal, id]
    );

    return res.json({ message: "Liga actualizada" });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "La liga ya existe en este país" });
    }
    console.error("[LEAGUES] Error actualizando liga:", error);
    return res.status(500).json({ error: "Error al actualizar liga" });
  }
});

// ─── DELETE /api/leagues/:id ─────────────────────────────────────────────────
/** Elimina una liga. Falla si tiene picks asociados. Solo administradores. */
leaguesRouter.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM leagues WHERE id = ?", [id]);
    return res.json({ message: "Liga eliminada" });
  } catch (error: any) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        error: "No se puede eliminar: hay picks asociados a esta liga",
      });
    }
    console.error("[LEAGUES] Error eliminando liga:", error);
    return res.status(500).json({ error: "Error al eliminar liga" });
  }
});

// ─── POST /api/leagues/bulk-delete ───────────────────────────────────────────
/** Elimina múltiples ligas a la vez. Solo administradores. */
leaguesRouter.post("/bulk-delete", authenticateToken, requireAdmin, async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "IDs inválidos" });
  }

  try {
    await pool.query("DELETE FROM leagues WHERE id IN (?)", [ids]);
    return res.json({ message: "Ligas eliminadas" });
  } catch (error: any) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        error: "Algunas ligas tienen picks asociados y no pueden eliminarse",
      });
    }
    console.error("[LEAGUES] Error en eliminación masiva:", error);
    return res.status(500).json({ error: "Error al eliminar ligas" });
  }
});
