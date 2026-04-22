/**
 * @file scores.routes.ts
 * @description Rutas para búsqueda de partidos y marcadores externos.
 */

import { Router } from "express";
import { searchFixtures } from "../services/scores.service.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";

const router = Router();

/**
 * Busca partidos en API-Football por nombre de equipo.
 * Solo accesible para administradores.
 */
router.get("/search", authenticateToken, requireAdmin, async (req, res) => {
  const { q } = req.query;

  if (!q || typeof q !== "string") {
    return res.status(400).json({ error: "Falta el término de búsqueda" });
  }

  try {
    const fixtures = await searchFixtures(q);
    res.json(fixtures);
  } catch (error: any) {
    console.error("[SCORES] Error buscando partidos:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
