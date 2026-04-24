/**
 * @file cron.service.ts
 * @description Tarea programada para la actualización automática de resultados.
 * Usa API-Football para marcador, corners, tarjetas y resolucion de picks.
 * Corre cada hora y procesa picks pendientes cuya fecha de partido ya pasó.
 */
import cron from "node-cron";
import { pool } from "../config/database.js";
import { getMatchResultByName, getMatchResultByProviderTeamIds, getFixtureResult, evaluatePickStatus, isFinished, } from "./scores.service.js";
import { sendTelegramMessage, formatPickParaTelegram, } from "./telegram.service.js";
import { obtenerTelegramFullConfig } from "./settings.service.js";
/**
 * Inicia la tarea programada de resolución automática de resultados.
 * Se ejecuta al minuto 5 de cada hora para evitar colisión con otros crons.
 */
export function initCronJobs() {
    // Minuto 5 de cada hora: '5 * * * *'
    cron.schedule("5 * * * *", async () => {
        console.log(`[CRON] ${new Date().toISOString()} - Iniciando verificación de resultados (API-Football)...`);
        try {
            await processPendingPicks();
        }
        catch (error) {
            console.error("[CRON] Error general procesando picks:", error);
        }
    });
    console.log("✅ Cron de resultados iniciado (API-Football, frecuencia: 1 hora)");
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
 * <summary>
 * Construye el nombre tecnico para consultar API-Football sin alterar el nombre visible.
 * </summary>
 * @param homeName - Nombre visible del equipo local.
 * @param homeApiName - Alias API-Football del equipo local.
 * @param awayName - Nombre visible del equipo visitante.
 * @param awayApiName - Alias API-Football del equipo visitante.
 * @param fallback - Nombre del partido guardado cuando faltan equipos.
 * @returns Texto "Local API vs Visitante API" o fallback visible.
 */
function buildProviderMatchName(homeName, homeApiName, awayName, awayApiName, fallback) {
    // Elegimos alias API cuando exista; si no, usamos nombre visible.
    const providerHomeName = String(homeApiName || homeName || "").trim();
    // Elegimos alias API visitante cuando exista; si no, usamos nombre visible.
    const providerAwayName = String(awayApiName || awayName || "").trim();
    // Si tenemos ambos lados, construimos una busqueda precisa.
    if (providerHomeName && providerAwayName) {
        return `${providerHomeName} vs ${providerAwayName}`;
    }
    // Si falta algun equipo, usamos el nombre del partido como respaldo.
    return String(fallback || "").trim();
}
/**
 * <summary>
 * Obtiene el contexto técnico de una selección de parlay usando sus equipos locales.
 * </summary>
 * @param selection - Seleccion del parlay con home_team y away_team opcionales.
 * @returns Nombre técnico e IDs del proveedor cuando existen.
 */
async function getProviderSelectionContext(selection) {
    // Leemos IDs de equipos guardados dentro de la seleccion.
    const teamIds = [selection?.home_team, selection?.away_team].filter(Boolean);
    // Si no tenemos ambos IDs, usamos el match_name guardado.
    if (teamIds.length < 2) {
        return {
            providerMatchName: String(selection?.match_name || "").trim(),
            homeProviderTeamId: null,
            awayProviderTeamId: null,
        };
    }
    // Consultamos nombres visibles, nombres oficiales e IDs API en lote.
    const [rows] = await pool.query("SELECT id, name, api_name, api_provider_name, api_team_id FROM teams WHERE id IN (?)", [teamIds]);
    // Buscamos el equipo local dentro de la respuesta.
    const homeTeam = rows.find((team) => String(team.id) === String(selection.home_team));
    // Buscamos el equipo visitante dentro de la respuesta.
    const awayTeam = rows.find((team) => String(team.id) === String(selection.away_team));
    // Construimos el nombre técnico conservando el nombre oficial del proveedor cuando exista.
    const providerMatchName = buildProviderMatchName(homeTeam?.name, homeTeam?.api_provider_name || homeTeam?.api_name, awayTeam?.name, awayTeam?.api_provider_name || awayTeam?.api_name, selection.match_name);
    // Devolvemos nombre técnico junto con los IDs oficiales de ambos equipos.
    return {
        providerMatchName,
        homeProviderTeamId: homeTeam?.api_team_id ?? null,
        awayProviderTeamId: awayTeam?.api_team_id ?? null,
    };
}
/**
 * <summary>
 * Calcula el estado final de un parlay solo cuando todas sus selecciones ya tienen un estado resuelto.
 * </summary>
 * @param selections - Selecciones actuales del parlay con sus estados individuales ya actualizados.
 * @returns lost o won cuando todo terminó; null mientras exista al menos una selección pendiente.
 */
function getResolvedParlayFinalStatus(selections) {
    // Recorremos cada selección para detectar si todavía queda alguna pendiente.
    for (const selection of selections) {
        // Normalizamos el estado para comparar sin depender de null o espacios.
        const normalizedStatus = String(selection?.status || "").trim();
        // Si una selección aún no tiene cierre definitivo, el parlay sigue pendiente.
        if (!normalizedStatus || normalizedStatus === "pending") {
            return null;
        }
    }
    // Detectamos si al menos una selección terminó perdida.
    const hasLostSelection = selections.some(
    // Marcamos el parlay como perdido solo cuando alguna selección cerró en lost.
    (selection) => String(selection?.status || "").trim() === "lost");
    // Si existe una selección perdida, el parlay completo pierde; si no, gana.
    return hasLostSelection ? "lost" : "won";
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
           m.acronym AS market_acronym,
           ht.name AS home_team_name,
           ht.api_provider_name AS home_team_api_provider_name,
           ht.api_name AS home_team_api_name,
           ht.api_team_id AS home_team_api_team_id,
           at.name AS away_team_name,
           at.api_provider_name AS away_team_api_provider_name,
           at.api_name AS away_team_api_name,
           at.api_team_id AS away_team_api_team_id
    FROM picks p
    LEFT JOIN leagues  l  ON p.league_id     = l.id
    LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
    LEFT JOIN countries  c  ON l.country_id   = c.id
    LEFT JOIN markets    m  ON p.pick         = m.id
    LEFT JOIN teams      ht ON p.home_team_id = ht.id
    LEFT JOIN teams      at ON p.away_team_id = at.id
    /* Seleccionamos picks pendientes, picks sin marcador o parleys que aún conservan selecciones pendientes */
    WHERE (
      p.status = 'pending'
      OR (p.score_home IS NULL AND p.score_away IS NULL)
      OR (
        p.is_parlay = 1
        AND p.selections IS NOT NULL
        AND p.selections != ''
        AND p.selections LIKE '%"status":"pending"%'
      )
    )
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
 * Resuelve un pick individual buscando el resultado en API-Football.
 * Estrategia:
 * 1. Si tiene api_fixture_id guardado, busqueda directa por ID.
 * 2. Si no, busqueda por alias API de equipos mas fecha.
 */
async function handleSinglePickResolution(pick) {
    let result = null;
    // Estrategia 1: por ID oficial de API-Football guardado previamente.
    if (pick.api_fixture_id) {
        result = await getFixtureResult(String(pick.api_fixture_id));
    }
    // Construimos el nombre técnico con el nombre oficial del proveedor cuando exista.
    const providerMatchName = buildProviderMatchName(pick.home_team_name, pick.home_team_api_provider_name || pick.home_team_api_name, pick.away_team_name, pick.away_team_api_provider_name || pick.away_team_api_name, pick.match_name);
    // Estrategia 2: por IDs oficiales del proveedor cuando ambos equipos ya están vinculados.
    if (!result && pick.home_team_api_team_id && pick.away_team_api_team_id) {
        result = await getMatchResultByProviderTeamIds(pick.home_team_api_team_id, pick.away_team_api_team_id, pick.match_date);
    }
    // Estrategia 3: por nombre técnico de partido + fecha.
    if (!result) {
        result = await getMatchResultByName(providerMatchName, pick.match_date);
    }
    if (!result) {
        console.log(`[CRON] Pick #${pick.id} - Sin resultado encontrado para "${providerMatchName}"`);
        return;
    }
    // Guardar el ID oficial de API-Football si lo encontramos para la proxima vez.
    if (result.eventId && !pick.api_fixture_id) {
        await pool.query("UPDATE picks SET api_fixture_id = ? WHERE id = ?", [result.eventId, pick.id]);
    }
    // Si el partido aun no termino, esperamos.
    if (!isFinished(result.status)) {
        console.log(`[CRON] Pick #${pick.id} - Partido no terminado (${result.status}), se reintentara.`);
        return;
    }
    // Si no hay marcador valido, esperamos.
    if (result.goalsHome === null || result.goalsAway === null) {
        console.log(`[CRON] Pick #${pick.id} - Sin marcador aun (${result.status})`);
        return;
    }
    // Guardamos marcador aunque el mercado especial quede pendiente por falta de stats.
    await pool.query("UPDATE picks SET score_home = ?, score_away = ?, api_fixture_id = COALESCE(api_fixture_id, ?) WHERE id = ?", [result.goalsHome, result.goalsAway, result.eventId || null, pick.id]);
    // Evaluamos el resultado del pick con marcador y estadisticas disponibles.
    const marketAcronym = pick.market_acronym || pick.pick || "";
    const newStatus = evaluatePickStatus(marketAcronym, result.goalsHome, result.goalsAway, result);
    if (newStatus === "pending") {
        console.log(`[CRON] Pick #${pick.id} - Mercado "${marketAcronym}" requiere revision manual o estadisticas no disponibles.`);
        return;
    }
    // Actualizamos estado final en la BD.
    await pool.query("UPDATE picks SET status = ? WHERE id = ?", [newStatus, pick.id]);
    console.log(`[CRON] Pick #${pick.id} (${pick.match_name}) -> ${newStatus} (${result.goalsHome}-${result.goalsAway})`);
    // Volvemos a consultar para asegurarnos de que no fue notificado por otro proceso (ej: manual resolution)
    const [freshPick] = await pool.query("SELECT result_notified, status FROM picks WHERE id = ?", [pick.id]);
    const isAlreadyNotified = freshPick.length > 0 && freshPick[0].result_notified;
    // Notificamos a Telegram si no ha sido notificado aún.
    if (!isAlreadyNotified) {
        await notificarResultado({
            ...pick,
            status: newStatus,
            score_home: result.goalsHome,
            score_away: result.goalsAway,
        });
        // Marcamos como notificado para evitar duplicados.
        await pool.query("UPDATE picks SET result_notified = 1 WHERE id = ?", [pick.id]);
    }
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
    // Marcamos si alguna selección recibió un update durante este ciclo.
    let anyUpdated = false;
    for (const sel of selections) {
        // Normalizamos el estado actual para decidir si la selección ya quedó resuelta.
        const currentSelectionStatus = String(sel?.status || "").trim();
        // Si la selección ya cerró, no volvemos a recalcularla en este ciclo.
        if (currentSelectionStatus && currentSelectionStatus !== "pending") {
            continue;
        }
        // Buscamos el resultado de esta selección
        let result = null;
        // Usamos primero el ID oficial de API-Football y mantenemos compatibilidad con selecciones antiguas.
        const fixtureId = sel.api_fixture_id || sel.thesportsdb_event_id;
        // Buscamos resultado por fixture vinculado.
        if (fixtureId) {
            result = await getFixtureResult(String(fixtureId));
        }
        // Construimos contexto técnico usando nombre oficial e IDs API de los equipos de la selección.
        const providerSelectionContext = await getProviderSelectionContext(sel);
        // Leemos el nombre técnico de la selección para posibles búsquedas por texto.
        const providerMatchName = providerSelectionContext.providerMatchName;
        // Si ambos equipos tienen vínculo exacto, buscamos primero por IDs del proveedor.
        if (!result && providerSelectionContext.homeProviderTeamId && providerSelectionContext.awayProviderTeamId && sel.match_time) {
            result = await getMatchResultByProviderTeamIds(providerSelectionContext.homeProviderTeamId, providerSelectionContext.awayProviderTeamId, sel.match_time);
        }
        // Si no hay ID exacto, buscamos por nombre técnico y fecha.
        if (!result && sel.match_name && sel.match_time) {
            result = await getMatchResultByName(providerMatchName || sel.match_name, sel.match_time);
        }
        if (!result || !isFinished(result.status)) {
            continue;
        }
        if (result.goalsHome === null || result.goalsAway === null) {
            continue;
        }
        // Guardar ID de API-Football en la seleccion si lo encontramos.
        if (result.eventId && !sel.api_fixture_id) {
            sel.api_fixture_id = result.eventId;
        }
        // Evaluar el mercado de esta seleccion con marcador y estadisticas.
        const marketAcronym = sel.market_acronym || sel.pick || "";
        const selStatus = evaluatePickStatus(marketAcronym, result.goalsHome, result.goalsAway, result);
        sel.score_home = result.goalsHome;
        sel.score_away = result.goalsAway;
        sel.status = selStatus;
        anyUpdated = true;
        // Si el mercado no se puede evaluar automáticamente, dejamos la selección pendiente.
        if (selStatus === "pending") {
            continue;
        }
    }
    // Guardar selecciones actualizadas en la BD
    if (anyUpdated) {
        await pool.query("UPDATE picks SET selections = ? WHERE id = ?", [JSON.stringify(selections), pick.id]);
    }
    // Calculamos el cierre global solo cuando todas las selecciones ya están resueltas.
    const finalStatus = getResolvedParlayFinalStatus(selections);
    // Si todavía no se resolvió el ticket completo, lo devolvemos a pending y quitamos notificación previa.
    if (!finalStatus) {
        // Detectamos si el parlay quedó marcado erróneamente como final en una ejecución anterior.
        const shouldResetPickToPending = String(pick.status || "").trim() !== "pending" || Boolean(Number(pick.result_notified));
        // Reabrimos el pick para que siga entrando al cron hasta que termine la última selección.
        if (shouldResetPickToPending) {
            // Restauramos estado pendiente y limpiamos la bandera de notificación para el cierre real.
            await pool.query("UPDATE picks SET status = 'pending', result_notified = 0 WHERE id = ?", [pick.id]);
            // Dejamos traza explícita para diagnosticar parleys reabiertos.
            console.log(`[CRON] ♻️ Parlay #${pick.id} reabierto a pending porque aún tiene selecciones sin terminar.`);
        }
        // Informamos que todavía faltan partidos por cerrar sin mandar Telegram.
        console.log(`[CRON] Parlay #${pick.id} — Aún hay selecciones pendientes, se reintentará.`);
        // Salimos sin cerrar ni notificar el parlay todavía.
        return;
    }
    // Persistimos el estado final solo cuando el ticket completo ya terminó.
    await pool.query("UPDATE picks SET status = ? WHERE id = ?", [
        finalStatus,
        pick.id,
    ]);
    // Dejamos una traza clara del cierre definitivo del parlay.
    console.log(`[CRON] ✅ Parlay #${pick.id} → ${finalStatus}`);
    // Volvemos a consultar para asegurarnos de que no fue notificado por otro proceso.
    const [freshPick] = await pool.query("SELECT result_notified, status FROM picks WHERE id = ?", [pick.id]);
    // Calculamos si ya existe una notificación final previa para evitar duplicados.
    const isAlreadyNotified = freshPick.length > 0 && freshPick[0].result_notified;
    // Notificamos a Telegram únicamente cuando el parlay ya cerró y aún no fue notificado.
    if (!isAlreadyNotified) {
        // Enviamos el mensaje final del ticket completo a los canales configurados.
        await notificarResultado({ ...pick, status: finalStatus, selections });
        // Marcamos como notificado para evitar duplicados posteriores.
        await pool.query("UPDATE picks SET result_notified = 1 WHERE id = ?", [pick.id]);
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
