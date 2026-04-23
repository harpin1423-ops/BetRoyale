/**
 * @file scores.service.ts
 * @description Servicio de integración con TheSportsDB (API gratuita, sin API key necesaria).
 * Permite buscar partidos por nombre y fecha, obtener marcadores finales y evaluar picks.
 * Documentación: https://www.thesportsdb.com/documentation
 */

// La key "123" es la demo pública de TheSportsDB — funciona sin registro.
const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json/123";

/**
 * Interfaz para el resultado de un partido desde TheSportsDB.
 */
export interface MatchResult {
  eventId: string;
  status: string;       // "Match Finished", "Not Started", "In Progress", etc.
  goalsHome: number | null;
  goalsAway: number | null;
}

/**
 * Realiza un fetch con timeout contra TheSportsDB.
 */
async function tsdbFetch(endpoint: string): Promise<any> {
  const url = `${TSDB_BASE}/${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} en ${url}`);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error(`Timeout al consultar TheSportsDB: ${url}`);
    }
    throw err;
  }
}

/**
 * Normaliza el nombre de un partido para usarlo como parámetro de búsqueda.
 * Convierte "FC Barcelona vs Celta de Vigo" → "FC_Barcelona_vs_Celta_de_Vigo"
 */
function normalizeMatchName(name: string): string {
  return name.trim().replace(/\s+/g, "_");
}

/**
 * Extrae la fecha en formato YYYY-MM-DD desde el campo match_date del pick.
 * Acepta formatos: "2026-04-22 20:00:00", "2026-04-22T20:00:00", ISO strings.
 */
function extractDateFromMatchDate(matchDate: string): string | null {
  if (!matchDate) return null;
  // Si ya tiene formato "YYYY-MM-DD", lo tomamos directamente
  const match = matchDate.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return null;
}

/**
 * Mapea el strStatus de TheSportsDB a nuestros estados internos.
 */
function isMatchFinished(status: string | null): boolean {
  if (!status) return false;
  const finished = ["match finished", "ft", "aet", "pen", "finished", "final"];
  return finished.includes(status.toLowerCase());
}

/**
 * Busca eventos en TheSportsDB por nombre (para el buscador en Admin).
 * Retorna una lista de partidos con su ID, nombre, fecha y marcador.
 */
export async function searchFixtures(query: string): Promise<any[]> {
  try {
    const normalized = normalizeMatchName(query);
    const data = await tsdbFetch(`searchevents.php?e=${encodeURIComponent(normalized)}`);
    const events = data?.event || [];

    return events.map((e: any) => ({
      id: e.idEvent,
      name: `${e.strHomeTeam} vs ${e.strAwayTeam}`,
      league: e.strLeague,
      date: e.dateEvent,
      time: e.strTime,
      status: e.strStatus,
      homeScore: e.intHomeScore,
      awayScore: e.intAwayScore,
    }));
  } catch (err) {
    console.error("[SCORES] Error buscando en TheSportsDB:", err);
    return [];
  }
}

/**
 * Busca un partido por nombre y fecha, y retorna su resultado si terminó.
 * Este es el método principal que usa el cron para resolución automática.
 *
 * Estrategia de búsqueda (de más a menos precisa):
 * 1. Por nombre exacto + fecha (searchevents.php?e=...&d=...)
 * 2. Por todos los eventos del día filtrando por nombre parcial (eventsday.php)
 */
export async function getMatchResultByName(
  matchName: string,
  matchDate: string
): Promise<MatchResult | null> {
  const dateStr = extractDateFromMatchDate(matchDate);
  if (!dateStr) {
    console.warn(`[SCORES] No se pudo extraer fecha de: ${matchDate}`);
    return null;
  }

  // — Intento 1: búsqueda directa por nombre + fecha —
  try {
    const normalized = normalizeMatchName(matchName);
    const data = await tsdbFetch(
      `searchevents.php?e=${encodeURIComponent(normalized)}&d=${dateStr}`
    );
    const event = data?.event?.[0];

    if (event) {
      console.log(`[SCORES] Encontrado por nombre+fecha: ${event.strEvent} (${event.strStatus})`);
      return buildResult(event);
    }
  } catch (err) {
    console.warn(`[SCORES] Intento 1 fallido para "${matchName}":`, err);
  }

  // — Intento 2: buscar todos los partidos del día y filtrar por nombre similar —
  try {
    const data = await tsdbFetch(`eventsday.php?d=${dateStr}&s=Soccer`);
    const events: any[] = data?.events || [];

    if (events.length === 0) {
      console.log(`[SCORES] Sin eventos Soccer el ${dateStr}`);
      return null;
    }

    // Normalizamos para comparación fuzzy básica
    const normalizedQuery = matchName.toLowerCase().replace(/[^a-z0-9 ]/g, "");

    const found = events.find((e: any) => {
      const eventName = `${e.strHomeTeam} vs ${e.strAwayTeam}`
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "");

      // Verificamos si los equipos principales coinciden parcialmente
      const [home, away] = matchName.toLowerCase().split(" vs ");
      const homeMatch = home && eventName.includes(home.trim().slice(0, 5));
      const awayMatch = away && eventName.includes(away.trim().slice(0, 5));

      return homeMatch && awayMatch;
    });

    if (found) {
      console.log(`[SCORES] Encontrado por búsqueda en día: ${found.strEvent} (${found.strStatus})`);
      return buildResult(found);
    }

    console.log(`[SCORES] No se encontró "${matchName}" entre ${events.length} eventos del ${dateStr}`);
  } catch (err) {
    console.warn(`[SCORES] Intento 2 (día) fallido para "${matchName}":`, err);
  }

  return null;
}

/**
 * Obtiene el resultado de un partido por su ID de TheSportsDB.
 * Se usa cuando el pick ya tiene guardado el thesportsdb_event_id.
 */
export async function getFixtureResult(eventId: string): Promise<MatchResult | null> {
  try {
    const data = await tsdbFetch(`lookupevent.php?id=${eventId}`);
    const event = data?.events?.[0];
    if (!event) return null;
    return buildResult(event);
  } catch (err) {
    console.error(`[SCORES] Error al buscar evento ID ${eventId}:`, err);
    return null;
  }
}

/**
 * Construye un MatchResult desde la respuesta raw de TheSportsDB.
 */
function buildResult(event: any): MatchResult {
  const homeScore = event.intHomeScore !== null && event.intHomeScore !== ""
    ? parseInt(event.intHomeScore, 10)
    : null;
  const awayScore = event.intAwayScore !== null && event.intAwayScore !== ""
    ? parseInt(event.intAwayScore, 10)
    : null;

  return {
    eventId: event.idEvent,
    status: event.strStatus || "",
    goalsHome: isNaN(homeScore as number) ? null : homeScore,
    goalsAway: isNaN(awayScore as number) ? null : awayScore,
  };
}

/**
 * Motor de Reglas: Determina el estado (won/lost) de un pick basándose en el marcador.
 * Soporta mercados: 1, 2, X, 1X, X2, 12, AEM, +1.5, +2.5, +3.5, AEM_+2.5, -1.5, BTTS.
 */
export function evaluatePickStatus(
  marketId: string,
  goalsHome: number,
  goalsAway: number
): "won" | "lost" | "pending" {
  const totalGoals = goalsHome + goalsAway;
  const diff = goalsHome - goalsAway;

  switch (marketId) {
    // ── Resultado final (1X2) ──
    case "1":       // Gana Local
      return goalsHome > goalsAway ? "won" : "lost";
    case "2":       // Gana Visitante
      return goalsAway > goalsHome ? "won" : "lost";
    case "X":       // Empate
      return goalsHome === goalsAway ? "won" : "lost";

    // ── Doble oportunidad ──
    case "1X":      // Local o Empate
      return goalsHome >= goalsAway ? "won" : "lost";
    case "X2":      // Visitante o Empate
      return goalsAway >= goalsHome ? "won" : "lost";
    case "12":      // Local o Visitante (no empate)
      return goalsHome !== goalsAway ? "won" : "lost";

    // ── Goles ──
    case "+1.5":
    case "MAS_1.5":
      return totalGoals > 1.5 ? "won" : "lost";
    case "+2.5":
    case "MAS_2.5":
      return totalGoals > 2.5 ? "won" : "lost";
    case "+3.5":
    case "MAS_3.5":
      return totalGoals > 3.5 ? "won" : "lost";
    case "-1.5":
    case "MEN_1.5":
      return totalGoals < 1.5 ? "won" : "lost";
    case "-2.5":
    case "MEN_2.5":
      return totalGoals < 2.5 ? "won" : "lost";

    // ── Ambos marcan ──
    case "AEM":
    case "BTTS":
      return goalsHome > 0 && goalsAway > 0 ? "won" : "lost";
    case "AEM_NO":
    case "BTTS_NO":
      return !(goalsHome > 0 && goalsAway > 0) ? "won" : "lost";

    // ── Combinados ──
    case "AEM_+2.5":
      return goalsHome > 0 && goalsAway > 0 && totalGoals > 2.5 ? "won" : "lost";

    // ── Hándicap asiático simple ──
    case "H_-1":    // Local gana por 2+
      return diff >= 2 ? "won" : "lost";
    case "H_+1":    // Visitante no pierde por 2+
      return diff <= 1 ? "won" : "lost";

    default:
      // Mercado no automatizable → permanece pendiente para revisión manual
      console.log(`[SCORES] Mercado "${marketId}" no soportado → pendiente manual`);
      return "pending";
  }
}

/**
 * Verifica si el partido finalizó según su estado.
 */
export function isFinished(status: string): boolean {
  return isMatchFinished(status);
}
