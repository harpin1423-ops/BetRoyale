/**
 * @file cron.service.ts
 * @description Tarea programada para la actualización automática de resultados.
 * Usa TheSportsDB (gratuita) para buscar resultados por nombre de partido y fecha.
 * Corre cada hora y procesa picks pendientes cuya fecha de partido ya pasó.
 */
import cron from "node-cron";
import { pool } from "../config/database.js";
import { getMatchResultByName, getFixtureResult, evaluatePickStatus, isFinished, } from "./scores.service.js";
import { sendTelegramMessage, formatPickParaTelegram, } from "./telegram.service.js";
import { obtenerTelegramFullConfig } from "./settings.service.js";
/**
 * Inicia la tarea programada de resolución automática de resultados.
 * Se ejecuta al minuto 5 de cada hora para evitar colisión con otros crons.
 */
export function initCronJobs() {
    // Minuto 5 de cada hora: '5 * * * *'
    cron.schedule("5 * * * *", async () => {
        console.log(`[CRON] ${new Date().toISOString()} - Iniciando verificación de resultados (TheSportsDB)...`);
        try {
            await processPendingPicks();
        }
        catch (error) {
            console.error("[CRON] Error general procesando picks:", error);
        }
    });
    console.log("✅ Cron de resultados iniciado (TheSportsDB, frecuencia: 1 hora)");
}
/**
 * Endpoint manual para forzar la ejecución del cron (útil en testing/admin).
 * Lo expone el servidor si se llama directamente.
 */
export async function runCronManually() {
    console.log("[CRON MANUAL] Iniciando procesamiento manual (60 min threshold)...");
    // En ejecución manual permitimos picks de hace 60 min (para captar resultados rápido)
    return processPendingPicks(60);
}
/**
 * Obtiene y procesa todos los picks pendientes cuya fecha ya pasó.
 * Un pick es candidato si:
 *  - status = 'pending'
 *  - match_date < ahora - 105 minutos (partido debería haber terminado)
 *  - tiene un match_name (para poder buscar en la API)
 */
async function processPendingPicks(minMinutes = 105) {
    let processed = 0;
    let errors = 0;
    const [picks] = await pool.query(`
    SELECT p.*,
           l.name  AS league_name,
           pt.name AS pick_type_name,
           pt.slug AS pick_type_slug,
           c.name  AS country_name,
           c.flag  AS country_flag,
           m.label AS market_label,
           m.acronym AS market_acronym
    FROM picks p
    LEFT JOIN leagues  l  ON p.league_id     = l.id
    LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
    LEFT JOIN countries  c  ON l.country_id   = c.id
    LEFT JOIN markets    m  ON p.pick         = m.id
    /* Seleccionamos picks pendientes O picks que no tengan marcador (para autocompletar) */
    WHERE (p.status = 'pending' OR (p.score_home IS NULL AND p.score_away IS NULL))
      AND p.match_name IS NOT NULL
      AND p.match_name != ''
      /* Filtro de tiempo: el partido debe haber comenzado hace al menos N minutos */
      AND p.match_date < DATE_SUB(NOW(), INTERVAL ? MINUTE)
    ORDER BY p.match_date ASC
    LIMIT 50
  `, [minMinutes]);
    if (!picks.length) {
        console.log("[CRON] Sin picks pendientes por actualizar.");
        return { processed, errors };
    }
    console.log(`[CRON] Procesando ${picks.length} picks pendientes...`);
    for (const pick of picks) {
        try {
            if (pick.is_parlay) {
                await handleParlayResolution(pick);
            }
            else {
                await handleSinglePickResolution(pick);
            }
            processed++;
        }
        catch (error) {
            errors++;
            console.error(`[CRON] Error procesando pick #${pick.id}:`, error);
        }
    }
    console.log(`[CRON] Finalizado. Procesados: ${processed}, Errores: ${errors}`);
    return { processed, errors };
}
/**
 * Resuelve un pick individual buscando el resultado en TheSportsDB.
 * Estrategia:
 * 1. Si tiene thesportsdb_event_id guardado → búsqueda directa por ID
 * 2. Si no → búsqueda por match_name + match_date
 */
async function handleSinglePickResolution(pick) {
    let result = null;
    // Estrategia 1: por ID guardado previamente
    if (pick.thesportsdb_event_id) {
        result = await getFixtureResult(String(pick.thesportsdb_event_id));
    }
    // Estrategia 2: por nombre de partido + fecha
    if (!result) {
        result = await getMatchResultByName(pick.match_name, pick.match_date);
    }
    if (!result) {
        console.log(`[CRON] Pick #${pick.id} — Sin resultado encontrado para "${pick.match_name}"`);
        return;
    }
    // Guardar el ID del evento si lo encontramos (para la próxima vez)
    if (result.eventId && !pick.thesportsdb_event_id) {
        await pool.query("UPDATE picks SET thesportsdb_event_id = ? WHERE id = ?", [result.eventId, pick.id]);
    }
    // Si el partido aún no terminó, esperamos
    if (!isFinished(result.status)) {
        console.log(`[CRON] Pick #${pick.id} — Partido no terminado (${result.status}), se reintentará.`);
        return;
    }
    // Si no hay marcador válido, esperamos
    if (result.goalsHome === null || result.goalsAway === null) {
        console.log(`[CRON] Pick #${pick.id} — Sin marcador aún (${result.status})`);
        return;
    }
    // Evaluamos el resultado del pick
    const marketAcronym = pick.market_acronym || pick.pick || "";
    const newStatus = evaluatePickStatus(marketAcronym, result.goalsHome, result.goalsAway);
    if (newStatus === "pending") {
        console.log(`[CRON] Pick #${pick.id} — Mercado "${marketAcronym}" no automatizable, skip.`);
        return;
    }
    // Actualizamos en la BD
    await pool.query(`UPDATE picks SET status = ?, score_home = ?, score_away = ? WHERE id = ?`, [newStatus, result.goalsHome, result.goalsAway, pick.id]);
    console.log(`[CRON] ✅ Pick #${pick.id} (${pick.match_name}) → ${newStatus} (${result.goalsHome}-${result.goalsAway})`);
    // Notificamos a Telegram
    await notificarResultado({
        ...pick,
        status: newStatus,
        score_home: result.goalsHome,
        score_away: result.goalsAway,
    });
}
/**
 * Resuelve un Parlay procesando cada selección individualmente.
 * El Parlay queda como WON solo si TODAS las selecciones ganaron.
 * Queda como LOST si cualquier selección pierde.
 */
async function handleParlayResolution(pick) {
    let selections = typeof pick.selections === "string"
        ? JSON.parse(pick.selections)
        : pick.selections;
    if (!Array.isArray(selections) || selections.length === 0) {
        console.warn(`[CRON] Parlay #${pick.id} sin selecciones válidas.`);
        return;
    }
    let anyUpdated = false;
    let allFinished = true;
    let anyLost = false;
    for (const sel of selections) {
        // Si la selección ya tiene resultado, la saltamos
        if (sel.status === "won" || sel.status === "lost" || sel.status === "void") {
            if (sel.status === "lost")
                anyLost = true;
            continue;
        }
        // Buscamos el resultado de esta selección
        let result = null;
        if (sel.thesportsdb_event_id) {
            result = await getFixtureResult(String(sel.thesportsdb_event_id));
        }
        if (!result && sel.match_name && sel.match_time) {
            result = await getMatchResultByName(sel.match_name, sel.match_time);
        }
        if (!result || !isFinished(result.status)) {
            allFinished = false;
            continue;
        }
        if (result.goalsHome === null || result.goalsAway === null) {
            allFinished = false;
            continue;
        }
        // Guardar ID de evento en la selección si lo encontramos
        if (result.eventId && !sel.thesportsdb_event_id) {
            sel.thesportsdb_event_id = result.eventId;
        }
        // Evaluar el mercado de esta selección
        const marketAcronym = sel.market_acronym || sel.pick || "";
        const selStatus = evaluatePickStatus(marketAcronym, result.goalsHome, result.goalsAway);
        sel.score_home = result.goalsHome;
        sel.score_away = result.goalsAway;
        sel.status = selStatus;
        anyUpdated = true;
        // Si el mercado no se puede evaluar automáticamente, el parlay sigue pendiente.
        if (selStatus === "pending") {
            allFinished = false;
            continue;
        }
        if (selStatus === "lost")
            anyLost = true;
    }
    // Guardar selecciones actualizadas en la BD
    if (anyUpdated) {
        await pool.query("UPDATE picks SET selections = ? WHERE id = ?", [JSON.stringify(selections), pick.id]);
    }
    // Determinar estado final del parlay
    let finalStatus = null;
    if (anyLost) {
        finalStatus = "lost";
    }
    else if (allFinished) {
        finalStatus = "won";
    }
    if (finalStatus) {
        await pool.query("UPDATE picks SET status = ? WHERE id = ?", [
            finalStatus,
            pick.id,
        ]);
        console.log(`[CRON] ✅ Parlay #${pick.id} → ${finalStatus}`);
        await notificarResultado({ ...pick, status: finalStatus, selections });
    }
    else {
        console.log(`[CRON] Parlay #${pick.id} — Aún hay selecciones pendientes, se reintentará.`);
    }
}
/**
 * Envía la notificación del resultado resuelto a los canales de Telegram
 * correspondientes al plan del pick.
 */
async function notificarResultado(pick) {
    try {
        // 1. Canal específico del plan
        const [planRows] = await pool.query("SELECT telegram_channel_id FROM pick_types WHERE id = ? OR slug = ?", [pick.pick_type_id, pick.pick_type_slug]);
        if (planRows.length > 0 && planRows[0].telegram_channel_id) {
            const mensaje = formatPickParaTelegram(pick, true);
            await sendTelegramMessage(planRows[0].telegram_channel_id, mensaje);
        }
        // 2. Canal espejo VIP Full (para picks de pago)
        const isVip = pick.pick_type_slug && pick.pick_type_slug !== "free";
        if (isVip) {
            const configFull = await obtenerTelegramFullConfig();
            if (configFull.telegram_channel_id) {
                const mensaje = formatPickParaTelegram(pick, true);
                await sendTelegramMessage(configFull.telegram_channel_id, mensaje);
            }
        }
    }
    catch (error) {
        console.error(`[CRON] Error notificando resultado pick #${pick.id} a Telegram:`, error);
    }
}
