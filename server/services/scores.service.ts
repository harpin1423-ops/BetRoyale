/**
 * @file scores.service.ts
 * @description Servicio de integración con API-Football (RapidAPI) para marcadores.
 * Maneja la búsqueda de partidos, obtención de resultados finales y lógica de resolución de picks.
 */

import { env } from "../config/env.js";

const API_BASE_URL = "https://api-football-v1.p.rapidapi.com/v3";

/**
 * Interfaz para el resultado de un partido desde la API.
 */
export interface MatchResult {
  fixtureId: number;
  status: string; // FT, PEN, AET, etc.
  goalsHome: number | null;
  goalsAway: number | null;
}

/**
 * Realiza una petición genérica a API-Football.
 */
async function fetchFromApi(endpoint: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/${endpoint}${query ? "?" + query : ""}`;

  if (!env.RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY no configurada en el servidor.");
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-key": env.RAPIDAPI_KEY,
      "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
    },
  });

  const data = await response.json();
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API Error: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

/**
 * Busca partidos por nombre de equipo o liga para vincularlos en el panel admin.
 */
export async function searchFixtures(query: string) {
  // Nota: API-Football tiene límites en la búsqueda directa por texto. 
  // Se recomienda buscar por equipos o ligas específicas.
  // Por simplicidad, implementaremos búsqueda por equipo.
  const data = await fetchFromApi("fixtures", { search: query });
  return data.response || [];
}

/**
 * Obtiene el resultado final de un partido específico por su ID.
 */
export async function getFixtureResult(fixtureId: number): Promise<MatchResult | null> {
  const data = await fetchFromApi("fixtures", { id: fixtureId.toString() });
  const fixture = data.response?.[0];

  if (!fixture) return null;

  return {
    fixtureId: fixture.fixture.id,
    status: fixture.fixture.status.short, // FT = Finished
    goalsHome: fixture.goals.home,
    goalsAway: fixture.goals.away,
  };
}

/**
 * Motor de Reglas: Determina el estado (WON/LOST) de un pick basándose en el marcador.
 * Soporta mercados: 1, 2, X, 1X, X2, AEM, +1.5, +2.5, AEM_+2.5.
 */
export function evaluatePickStatus(marketId: string, goalsHome: number, goalsAway: number): "won" | "lost" | "pending" {
  const totalGoals = goalsHome + goalsAway;

  switch (marketId) {
    case "1": // Gana Local
      return goalsHome > goalsAway ? "won" : "lost";
    case "2": // Gana Visitante
      return goalsAway > goalsHome ? "won" : "lost";
    case "X": // Empate
      return goalsHome === goalsAway ? "won" : "lost";
    case "1X": // Gana/Empate Local
      return goalsHome >= goalsAway ? "won" : "lost";
    case "X2": // Gana/Empate Visitante
      return goalsAway >= goalsHome ? "won" : "lost";
    case "AEM": // Ambos Marcan
      return goalsHome > 0 && goalsAway > 0 ? "won" : "lost";
    case "+1.5": // Más de 1.5 goles
      return totalGoals > 1.5 ? "won" : "lost";
    case "+2.5": // Más de 2.5 goles
      return totalGoals > 2.5 ? "won" : "lost";
    case "AEM_+2.5": // Ambos Marcan y +2.5
      return (goalsHome > 0 && goalsAway > 0 && totalGoals > 2.5) ? "won" : "lost";
    default:
      // Si el mercado no está automatizado, permanece pendiente para revisión manual.
      return "pending";
  }
}
