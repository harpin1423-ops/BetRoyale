/**
 * @file server/routes/ai.routes.ts
 * @description Rutas para funcionalidades de IA multi-proveedor.
 * Soporta Gemini, Groq y OpenAI con auto-fallback.
 */
import { Router } from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { generatePickAnalysis, getProviderLabel } from "../services/ai.service.js";
import { env } from "../config/env.js";
const router = Router();
/**
 * GET /api/ai/providers
 * Devuelve los proveedores de IA disponibles (tienen API key configurada).
 */
router.get("/providers", authenticateToken, requireAdmin, (_req, res) => {
    const providers = [
        { id: "auto", label: "Automático (mejor disponible)", available: true },
        { id: "gemini", label: "Google Gemini", available: Boolean(env.GEMINI_API_KEY) },
        { id: "groq", label: "Groq (Llama 3) — Gratis", available: Boolean(env.GROQ_API_KEY) },
        { id: "deepseek", label: "DeepSeek V3 — Gratis ($5 créditos)", available: Boolean(env.DEEPSEEK_API_KEY) },
        { id: "openai", label: "OpenAI (GPT-4o-mini)", available: Boolean(env.OPENAI_API_KEY) },
    ];
    res.json({ providers });
});
/**
 * POST /api/ai/analyze-pick
 * Genera un análisis automático para un pick basado en sus datos.
 * Acepta campo opcional "provider" para elegir el proveedor (gemini|groq|openai|auto).
 */
router.post("/analyze-pick", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { match_name, league_name, pick, odds, is_parlay, selections, provider } = req.body;
        // Validamos datos mínimos
        if (!match_name && !is_parlay) {
            return res.status(400).json({
                status: "error",
                message: "Faltan datos del partido o selecciones del parlay."
            });
        }
        const result = await generatePickAnalysis({
            match_name,
            league_name,
            pick,
            odds,
            is_parlay,
            selections,
            provider: provider || "auto",
        });
        res.json({
            status: "success",
            analysis: result.analysis,
            // Devolvemos el proveedor que respondió para mostrarlo en el admin
            usedProvider: result.usedProvider,
            usedProviderLabel: getProviderLabel(result.usedProvider),
        });
    }
    catch (error) {
        console.error("[AI Route] Error en /api/ai/analyze-pick:", error);
        res.status(500).json({
            status: "error",
            message: error.message || "Error al generar el análisis con IA."
        });
    }
});
export default router;
