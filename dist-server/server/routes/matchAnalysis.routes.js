import { Router } from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { pool } from "../config/database.js";
import { generateAnalysisText } from "../services/ai.service.js";
import { agenda, analyze, archive, archivedReport, providerMessage } from "../services/matchAnalysis.service.js";
const router = Router();
router.use(authenticateToken, requireAdmin);
router.get("/fixtures", async (req, res) => {
    const day = String(req.query.date || "");
    if (!/^\d{4}-\d\d-\d\d$/.test(day) || !Number.isFinite(Date.parse(day)))
        return res.status(400).json({ error: "Fecha inválida." });
    try {
        res.json(await agenda(day));
    }
    catch (err) {
        res.status(503).json({ error: providerMessage(err) });
    }
});
router.get("/archive", async (_req, res) => {
    try {
        res.json(await archive());
    }
    catch {
        res.status(503).json({ error: "El registro de pronósticos no está disponible." });
    }
});
router.get("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
        return res.status(400).json({ error: "Partido inválido." });
    try {
        const report = req.query.snapshot === "first" ? await archivedReport(id) : await analyze(id);
        if (!report)
            return res.status(404).json({ error: "Informe no encontrado." });
        res.json(report);
    }
    catch (err) {
        if (String(err).includes("PREMATCH_ONLY"))
            return res.status(409).json({ error: "El partido ya comenzó o cambió de estado." });
        res.status(503).json({ error: providerMessage(err) });
    }
});
router.post("/:id/commentary", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
        return res.status(400).json({ error: "Partido inválido." });
    try {
        const a = await analyze(id);
        if (!a.model)
            return res.status(422).json({ error: "Faltan partidos para explicar el pronóstico." });
        const evidence = {
            partido: a.fixture.name,
            local: a.home.stats,
            visitante: a.away.stats,
            mercados: a.markets,
            fecha: a.at,
        };
        const result = await generateAnalysisText("Redacta tres frases breves en español para el analista de BetRoyale. Explica un cruce de ataque y defensa, la comparación entre probabilidad y precio si hay cuota, y una limitación. Usa únicamente los datos JSON adjuntos. Los valores n indican muestra, null significa desconocido. No inventes estadísticas, probabilidades, bajas ni noticias. " +
            JSON.stringify(evidence));
        res.json(result);
    }
    catch {
        res
            .status(503)
            .json({ error: "El proveedor de IA no está disponible. La lectura estadística sigue disponible." });
    }
});
router.post("/:id/metrics", async (req, res) => {
    const id = Number(req.params.id), rows = req.body.rows;
    if (!Number.isSafeInteger(id) || id < 1 || !Array.isArray(rows) || !rows.length || rows.length > 10)
        return res.status(400).json({ error: "Selecciona entre 1 y 10 registros del historial." });
    try {
        const report = await analyze(id);
        if (Date.now() >= report.fixture.timestamp * 1000)
            return res.status(409).json({ error: "El partido ya comenzó." });
        const valid = new Set([...report.home.rows, ...report.away.rows].map((r) => r.id + "/" + r.teamId));
        const values = [];
        for (const r of rows) {
            if (!r ||
                !valid.has(r.fixtureId + "/" + r.teamId) ||
                typeof r.source !== "string" ||
                !r.source.trim() ||
                r.source.length > 200)
                return res.status(400).json({ error: "Revisa los IDs y la fuente de cada fila." });
            const metrics = [r.xt, r.sca, r.touches];
            if (metrics.every((v) => v == null) ||
                metrics.some((v) => v != null && (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 10000)) ||
                (r.sca != null && r.sca < 0) ||
                (r.touches != null && (!Number.isInteger(r.touches) || r.touches < 0)))
                return res.status(400).json({ error: "Incluye al menos una métrica numérica válida por fila." });
            values.push([r.fixtureId, r.teamId, ...metrics.map((v) => v ?? null), r.source.trim()]);
        }
        await pool.query(`INSERT INTO analysis_event_metrics (fixture_id,team_id,xt,sca,touches,source) VALUES ?
      ON DUPLICATE KEY UPDATE xt=VALUES(xt),sca=VALUES(sca),touches=VALUES(touches),source=VALUES(source)`, [values]);
        res.json(await analyze(id, true));
    }
    catch {
        res.status(503).json({ error: "No se pudo actualizar el informe con las métricas importadas." });
    }
});
export default router;
