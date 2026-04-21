/**
 * @file teams.routes.ts
 * @description Rutas CRUD para la gestión de equipos vinculados a ligas.
 */

import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";

export const teamsRouter = Router();

// ─── GET /api/teams ──────────────────────────────────────────────────────────
/** 
 * Devuelve todos los equipos. 
 * Soporta filtrado opcional por league_id.
 */
teamsRouter.get("/", async (req, res) => {
  const { league_id } = req.query;
  try {
    let query = "SELECT * FROM teams";
    const params = [];

    if (league_id) {
      query += " WHERE league_id = ?";
      params.push(league_id);
    }

    query += " ORDER BY name ASC";
    
    const [filas] = await pool.query(query, params);
    return res.json(filas);
  } catch (error) {
    console.error("[TEAMS] Error obteniendo equipos:", error);
    return res.status(500).json({ error: "Error al obtener equipos" });
  }
});

// ─── POST /api/teams ─────────────────────────────────────────────────────────
/** Crea un nuevo equipo. Solo administradores. */
teamsRouter.post("/", authenticateToken, requireAdmin, async (req, res) => {
  const { name, league_id, country_id } = req.body;

  if (!name || !league_id) {
    return res.status(400).json({ error: "El nombre y la liga son obligatorios" });
  }

  try {
    const [resultado] = await pool.query(
      "INSERT INTO teams (name, league_id, country_id) VALUES (?, ?, ?)",
      [name, league_id, country_id || null]
    );

    return res.status(201).json({
      id: (resultado as any).insertId,
      message: "Equipo creado correctamente",
    });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "El equipo ya existe en esta liga" });
    }
    console.error("[TEAMS] Error creando equipo:", error);
    return res.status(500).json({ error: "Error al crear equipo" });
  }
});

// ─── PUT /api/teams/:id ──────────────────────────────────────────────────────
/** Actualiza un equipo existente. Solo administradores. */
teamsRouter.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, league_id, country_id } = req.body;

  if (!name || !league_id) {
    return res.status(400).json({ error: "El nombre y la liga son obligatorios" });
  }

  try {
    await pool.query(
      "UPDATE teams SET name = ?, league_id = ?, country_id = ? WHERE id = ?",
      [name, league_id, country_id || null, id]
    );

    return res.json({ message: "Equipo actualizado correctamente" });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Ya existe un equipo con ese nombre en esta liga" });
    }
    console.error("[TEAMS] Error actualizando equipo:", error);
    return res.status(500).json({ error: "Error al actualizar equipo" });
  }
});

// ─── DELETE /api/teams/:id ───────────────────────────────────────────────────
/** Elimina un equipo. Solo administradores. */
teamsRouter.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM teams WHERE id = ?", [id]);
    return res.json({ message: "Equipo eliminado correctamente" });
  } catch (error) {
    console.error("[TEAMS] Error eliminando equipo:", error);
    return res.status(500).json({ error: "Error al eliminar equipo" });
  }
});

// ─── POST /api/teams/bulk-delete ─────────────────────────────────────────────
/** Elimina múltiples equipos a la vez. Solo administradores. */
teamsRouter.post("/bulk-delete", authenticateToken, requireAdmin, async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "IDs inválidos" });
  }

  try {
    await pool.query("DELETE FROM teams WHERE id IN (?)", [ids]);
    return res.json({ message: "Equipos eliminados correctamente" });
  } catch (error) {
    console.error("[TEAMS] Error en eliminación masiva:", error);
    return res.status(500).json({ error: "Error al eliminar equipos" });
  }
});
