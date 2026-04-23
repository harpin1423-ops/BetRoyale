/**
 * @file scores.routes.ts
 * @description Rutas para búsqueda de partidos y ejecución manual del cron de resultados.
 * Integrado con API-Football para marcador, corners y tarjetas.
 */
import { Router } from "express";
import { searchFixtures, getMatchResultByName } from "../services/scores.service.js";
import { runCronManually } from "../services/cron.service.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { pool } from "../config/database.js";
const router = Router();
/**
 * GET /api/scores/search?q=Barcelona+vs+Real+Madrid&date=2026-04-22
 * Busca partidos en API-Football por nombre/alias y fecha opcional.
 * Solo accesible para administradores.
 */
router.get("/search", authenticateToken, requireAdmin, async (req, res) => {
    const { q, date } = req.query;
    if (!q || typeof q !== "string") {
        return res.status(400).json({ error: "Falta el término de búsqueda (q)" });
    }
    try {
        const fixtures = await searchFixtures(q, typeof date === "string" ? date : undefined);
        res.json({ fixtures, source: "API-Football" });
    }
    catch (error) {
        console.error("[SCORES] Error buscando partidos:", error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/scores/run-cron
 * Ejecuta manualmente el cron de resolución de picks.
 * Útil para el panel de administración (botón "Actualizar Resultados").
 * Solo accesible para administradores.
 */
router.post("/run-cron", authenticateToken, requireAdmin, async (req, res) => {
    try {
        console.log("[SCORES] Ejecución manual del cron solicitada por admin.");
        const result = await runCronManually();
        res.json({
            success: true,
            message: `Cron ejecutado. Procesados: ${result.processed}, Errores: ${result.errors}`,
            ...result,
        });
    }
    catch (error) {
        console.error("[SCORES] Error en ejecución manual del cron:", error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/scores/test?match=Barcelona+vs+Celta+de+Vigo&date=2026-04-22
 * Prueba la búsqueda de un resultado específico (debugging para Admin).
 * Solo accesible para administradores.
 */
router.get("/test", authenticateToken, requireAdmin, async (req, res) => {
    const { match, date } = req.query;
    if (!match || !date || typeof match !== "string" || typeof date !== "string") {
        return res.status(400).json({ error: "Faltan parámetros: match y date (YYYY-MM-DD)" });
    }
    try {
        const result = await getMatchResultByName(match, date);
        if (!result) {
            return res.json({ found: false, message: "No se encontró el partido en API-Football" });
        }
        res.json({ found: true, result });
    }
    catch (error) {
        console.error("[SCORES] Error en test de búsqueda:", error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/scores/pending-picks
 * Devuelve la lista de picks pendientes que el cron procesará en la próxima ejecución.
 * Solo para administradores.
 */
router.get("/pending-picks", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [picks] = await pool.query(`
      SELECT p.id, p.match_name, p.match_date, p.status, p.is_parlay,
             p.api_fixture_id,
             p.thesportsdb_event_id,
             pt.name AS pick_type_name,
             m.acronym AS market_acronym
      FROM picks p
      LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
      LEFT JOIN markets    m  ON p.pick = m.id
      WHERE p.status = 'pending'
        AND p.match_name IS NOT NULL
        AND p.match_name != ''
        AND p.match_date < DATE_SUB(NOW(), INTERVAL 105 MINUTE)
      ORDER BY p.match_date DESC
      LIMIT 50
    `);
        res.json({ count: picks.length, picks });
    }
    catch (error) {
        console.error("[SCORES] Error obteniendo picks pendientes:", error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/scores/debug
 * Muestra el tiempo del servidor DB y los picks que están cerca de ser procesados.
 */
router.get("/debug", authenticateToken, requireAdmin, async (_req, res) => {
    try {
        // Obtenemos la hora actual de la base de datos
        const [timeRows] = await pool.query("SELECT NOW() as now");
        const now = timeRows[0]?.now;
        // Obtenemos picks próximos a vencer el umbral de 105 minutos
        const [picks] = await pool.query(`
      SELECT id, match_name, match_date, status, api_fixture_id, thesportsdb_event_id,
             DATE_SUB(NOW(), INTERVAL 105 MINUTE) as threshold
      FROM picks 
      WHERE status = 'pending'
      ORDER BY match_date ASC
      LIMIT 10
    `);
        res.json({
            db_now: now,
            server_now: new Date().toISOString(),
            threshold_105_min: picks[0]?.threshold || "N/A",
            pending_picks: picks
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
