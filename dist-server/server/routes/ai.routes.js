/**
 * @file server/routes/ai.routes.ts
 * @description Rutas para funcionalidades de IA.
 * Protegidas para uso administrativo.
 */
import { Router } from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { generatePickAnalysis } from "../services/ai.service.js";
const router = Router();
/**
 * POST /api/ai/analyze-pick
 * Genera un análisis automático para un pick basado en sus datos.
 */
router.post("/analyze-pick", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { match_name, league_name, pick, odds, is_parlay, selections } = req.body;
        // Validamos datos mínimos
        if (!match_name && !is_parlay) {
            return res.status(400).json({
                status: "error",
                message: "Faltan datos del partido o selecciones del parlay."
            });
        }
        const analysis = await generatePickAnalysis({
            match_name,
            league_name,
            pick,
            odds,
            is_parlay,
            selections
        });
        res.json({
            status: "success",
            analysis
        });
    }
    catch (error) {
        console.error("Error en /api/ai/analyze-pick:", error);
        res.status(500).json({
            status: "error",
            message: error.message || "Error al generar el análisis con IA."
        });
    }
});
export default router;
