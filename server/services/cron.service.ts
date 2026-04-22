/**
 * @file cron.service.ts
 * @description Tarea programada para la actualización automática de resultados.
 * Revisa cada hora los picks pendientes que tienen un api_fixture_id vinculado.
 */

import cron from "node-cron";
import { pool } from "../config/database.js";
import { getFixtureResult, evaluatePickStatus } from "./scores.service.js";
import { 
  sendTelegramMessage, 
  formatPickParaTelegram 
} from "./telegram.service.js";
import { obtenerTelegramFullConfig } from "./settings.service.js";

/**
 * Inicia la tarea programada.
 */
export function initCronJobs() {
  // Configuración: Cada hora (minuto 0)
  // '0 * * * *'
  cron.schedule("0 * * * *", async () => {
    console.log(`[CRON] ${new Date().toISOString()} - Iniciando verificación de resultados...`);
    try {
      await processPendingPicks();
    } catch (error) {
      console.error("[CRON] Error procesando picks pendientes:", error);
    }
  });

  console.log("✅ Cron de resultados iniciado (frecuencia: 1 hora)");
}

/**
 * Procesa todos los picks pendientes que tienen automatización activada.
 */
async function processPendingPicks() {
  // 1. Obtener picks pendientes que tengan automatización activada
  const [picks]: any = await pool.query(`
    SELECT p.*, l.name as league_name, pt.name as pick_type_name, pt.slug as pick_type_slug,
           c.name as country_name, c.flag as country_flag,
           m.label as market_label, m.acronym as market_acronym
    FROM picks p
    LEFT JOIN leagues l ON p.league_id = l.id
    LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
    LEFT JOIN countries c ON l.country_id = c.id
    LEFT JOIN markets m ON p.pick = m.id
    WHERE p.status = 'pending' 
      AND p.auto_update = 1
      AND (p.api_fixture_id IS NOT NULL OR p.is_parlay = 1)
      AND p.match_date < DATE_SUB(NOW(), INTERVAL 105 MINUTE)
  `);

  if (!picks.length) {
    console.log("[CRON] No hay picks pendientes por actualizar.");
    return;
  }

  console.log(`[CRON] Procesando ${picks.length} picks...`);

  for (const pick of picks) {
    try {
      if (pick.is_parlay) {
        await handleParlayResolution(pick);
      } else {
        await handleSinglePickResolution(pick);
      }
    } catch (error) {
      console.error(`[CRON] Error procesando pick #${pick.id}:`, error);
    }
  }
}

/**
 * Lógica para resolver un pick individual.
 */
async function handleSinglePickResolution(pick: any) {
  const result = await getFixtureResult(pick.api_fixture_id);

  if (!result || result.status !== "FT") return;

  const marketAcronym = pick.market_acronym || pick.pick;
  const newStatus = evaluatePickStatus(marketAcronym, result.goalsHome!, result.goalsAway!);

  if (newStatus === "pending") return;

  await pool.query(
    `UPDATE picks SET status = ?, score_home = ?, score_away = ? WHERE id = ?`,
    [newStatus, result.goalsHome, result.goalsAway, pick.id]
  );

  console.log(`[CRON] Pick #${pick.id} (Single) -> ${newStatus} (${result.goalsHome}-${result.goalsAway})`);
  await notificarResultado({ ...pick, status: newStatus, score_home: result.goalsHome, score_away: result.goalsAway });
}

/**
 * Lógica para resolver un Parlay procesando cada selección.
 */
async function handleParlayResolution(pick: any) {
  let selections = typeof pick.selections === 'string' ? JSON.parse(pick.selections) : pick.selections;
  if (!Array.isArray(selections)) return;

  let updated = false;
  let allFinished = true;
  let anyLost = false;

  for (const sel of selections) {
    // Si la selección tiene fixture y no tiene marcador aún
    if (sel.api_fixture_id && (sel.score_home === undefined || sel.score_home === null)) {
      const result = await getFixtureResult(sel.api_fixture_id);
      if (result && result.status === "FT") {
        sel.score_home = result.goalsHome;
        sel.score_away = result.goalsAway;
        sel.status = evaluatePickStatus(sel.market_acronym || sel.pick, result.goalsHome!, result.goalsAway!);
        updated = true;
      } else {
        allFinished = false;
      }
    }

    if (sel.status === 'lost') anyLost = true;
    if (!sel.status || sel.status === 'pending') allFinished = false;
  }

  if (updated) {
    await pool.query("UPDATE picks SET selections = ? WHERE id = ?", [JSON.stringify(selections), pick.id]);
  }

  // Resolución final del Parlay
  let finalStatus: string | null = null;
  if (anyLost) finalStatus = 'lost';
  else if (allFinished) finalStatus = 'won';

  if (finalStatus) {
    await pool.query("UPDATE picks SET status = ? WHERE id = ?", [finalStatus, pick.id]);
    console.log(`[CRON] Parlay #${pick.id} -> ${finalStatus}`);
    await notificarResultado({ ...pick, status: finalStatus, selections });
  }
}

/**
 * Envía la notificación de resultado a Telegram siguiendo la configuración del plan.
 */
async function notificarResultado(pick: any) {
  try {
    const config = await obtenerTelegramFullConfig();
    const planConfig = config.find((c) => c.slug === pick.pick_type_slug);

    if (!planConfig || !planConfig.channelId) return;

    const mensaje = formatPickParaTelegram(pick, true);
    await sendTelegramMessage(planConfig.channelId, mensaje);
  } catch (error) {
    console.error(`[CRON] Error enviando notificación a Telegram para pick #${pick.id}:`, error);
  }
}
