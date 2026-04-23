/**
 * @file scores.service.ts
 * @description Servicio profesional de resultados deportivos usando API-Football.
 * Permite buscar fixtures, leer marcador final, extraer corners/tarjetas y evaluar picks.
 * Documentacion: https://www.api-football.com/documentation-v3
 */
// Importamos variables de entorno centralizadas para no leer process.env en cada funcion.
import { env } from "../config/env.js";
// Definimos la zona horaria operativa de BetRoyale para buscar fixtures por fecha.
const BETROYALE_TIMEZONE = "America/Bogota";
// Detectamos si se usara RapidAPI como puente para API-Football.
const API_FOOTBALL_USES_RAPIDAPI = Boolean(!env.APIFOOTBALL_API_KEY && env.RAPIDAPI_KEY);
// Definimos la URL base oficial o la URL de RapidAPI segun la llave configurada.
const API_FOOTBALL_BASE_URL = env.APIFOOTBALL_BASE_URL || (API_FOOTBALL_USES_RAPIDAPI ? "https://api-football-v1.p.rapidapi.com/v3" : "https://v3.football.api-sports.io");
// Definimos la API key directa de API-Sports.
const API_FOOTBALL_DIRECT_KEY = env.APIFOOTBALL_API_KEY;
// Definimos la API key RapidAPI si se usa ese puente.
const API_FOOTBALL_RAPID_KEY = env.RAPIDAPI_KEY;
// Definimos la API key activa para validaciones generales.
const API_FOOTBALL_KEY = API_FOOTBALL_DIRECT_KEY || API_FOOTBALL_RAPID_KEY;
// Definimos estados terminados segun API-Football y compatibilidad legacy.
const FINISHED_STATUS_CODES = new Set(["FT", "AET", "PEN", "AWD", "WO", "MATCH FINISHED", "FINISHED", "FINAL"]);
// Definimos variantes de texto que API-Football puede devolver para corners.
const CORNER_STAT_NAMES = new Set(["corner kicks", "corners"]);
// Definimos variantes de texto que API-Football puede devolver para tarjetas amarillas.
const YELLOW_CARD_STAT_NAMES = new Set(["yellow cards", "yellowcards"]);
/**
 * <summary>
 * Extrae una fecha YYYY-MM-DD desde un datetime-local, MySQL DATETIME o ISO.
 * </summary>
 * @param value - Fecha recibida desde el panel o desde MySQL.
 * @returns Fecha YYYY-MM-DD o null cuando no se puede extraer.
 */
function extractDateFromMatchDate(value) {
    // Validamos que exista un valor antes de aplicar expresiones regulares.
    if (!value)
        return null;
    // Convertimos el valor a texto para soportar entradas del formulario y de MySQL.
    const rawValue = String(value).trim();
    // Buscamos el prefijo de fecha ISO/MySQL que comparten los formatos tecnicos.
    const match = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
    // Devolvemos null cuando no hay coincidencia segura.
    if (match) {
        // Devolvemos solamente la fecha para API-Football.
        return match[1];
    }
    // Aceptamos fechas localizadas tipo 22/4/2026 que puede mostrar el panel al editar.
    const localizedMatch = rawValue.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    // Si no se reconoce formato localizado, devolvemos null.
    if (!localizedMatch)
        return null;
    // Normalizamos dia a dos digitos.
    const day = localizedMatch[1].padStart(2, "0");
    // Normalizamos mes a dos digitos.
    const month = localizedMatch[2].padStart(2, "0");
    // Leemos el año de cuatro digitos.
    const year = localizedMatch[3];
    // Devolvemos formato requerido por API-Football.
    return `${year}-${month}-${day}`;
}
/**
 * <summary>
 * Calcula temporadas candidatas para buscar fixtures por fecha.
 * </summary>
 * @param date - Fecha YYYY-MM-DD usada para localizar el partido.
 * @returns Temporadas probables ordenadas por prioridad.
 */
function getCandidateSeasons(date) {
    // Si no hay fecha, usamos el año operativo actual y el anterior como respaldo.
    if (!date) {
        // Tomamos el año local de BetRoyale para búsquedas sin fecha exacta.
        const currentYear = new Date().getFullYear();
        // Devolvemos dos temporadas para cubrir ligas anuales y europeas.
        return [currentYear, currentYear - 1];
    }
    // Extraemos año y mes de la fecha YYYY-MM-DD.
    const [yearText, monthText] = date.split("-");
    // Convertimos el año a numero.
    const year = Number(yearText);
    // Convertimos el mes a numero.
    const month = Number(monthText);
    // Si no se pudo leer la fecha, usamos año actual como fallback.
    if (!year || !month) {
        // Tomamos el año actual del servidor.
        const currentYear = new Date().getFullYear();
        // Devolvemos fallback conservador.
        return [currentYear, currentYear - 1];
    }
    // En ligas europeas, enero-julio suele pertenecer a la temporada iniciada el año anterior.
    if (month <= 7) {
        // Priorizamos temporada anterior y luego ligas de año calendario.
        return [year - 1, year];
    }
    // En agosto-diciembre, la temporada europea coincide con el año de inicio.
    return [year, year - 1];
}
/**
 * <summary>
 * Normaliza texto para comparar equipos aunque tengan acentos, puntos o abreviaturas.
 * </summary>
 * @param value - Texto original del equipo o partido.
 * @returns Texto plano en minusculas.
 */
function normalizeComparable(value) {
    // Convertimos a texto, removemos acentos y limpiamos separadores.
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
/**
 * <summary>
 * Divide un texto tipo "Equipo A vs Equipo B" en nombres de local y visitante.
 * </summary>
 * @param query - Consulta escrita o construida desde aliases de equipos.
 * @returns Local, visitante y texto normalizado.
 */
function splitMatchQuery(query) {
    // Normalizamos conectores comunes para no depender solo de "vs".
    const normalized = String(query || "").replace(/\s+(?:v|vs|versus)\s+/i, " vs ").replace(/\s+-\s+/g, " vs ");
    // Separamos la consulta en dos equipos como maximo.
    const parts = normalized.split(/\s+vs\s+/i).map((part) => part.trim()).filter(Boolean);
    // Devolvemos ambos lados cuando existen.
    return { home: parts[0] || normalized.trim(), away: parts[1] || "", normalized };
}
/**
 * <summary>
 * Lanza un mensaje claro cuando API-Football no esta configurado.
 * </summary>
 * @returns true cuando existe API key configurada.
 */
function hasApiFootballKey() {
    // Validamos la llave antes de hacer llamadas externas.
    return Boolean(API_FOOTBALL_KEY && String(API_FOOTBALL_KEY).trim());
}
/**
 * <summary>
 * Construye headers correctos para API-Sports directo o RapidAPI.
 * </summary>
 * @returns Headers HTTP del proveedor configurado.
 */
function buildApiFootballHeaders() {
    // Si existe llave directa, usamos el header oficial de API-Sports.
    if (API_FOOTBALL_DIRECT_KEY) {
        // Retornamos headers directos sin mezclar RapidAPI.
        return { "x-apisports-key": API_FOOTBALL_DIRECT_KEY };
    }
    // Si existe llave RapidAPI, usamos host y key del marketplace.
    if (API_FOOTBALL_RAPID_KEY) {
        // Retornamos headers compatibles con API-Football en RapidAPI.
        return {
            "x-rapidapi-key": API_FOOTBALL_RAPID_KEY,
            "x-rapidapi-host": env.APIFOOTBALL_RAPIDAPI_HOST || "api-football-v1.p.rapidapi.com",
        };
    }
    // Sin llave configurada, no enviamos headers.
    return {};
}
/**
 * <summary>
 * Ejecuta una llamada GET contra API-Football con timeout y errores legibles.
 * </summary>
 * @param endpoint - Ruta del endpoint sin la URL base.
 * @param params - Parametros query que se enviaran al proveedor.
 * @returns Respuesta JSON de API-Football.
 */
async function apiFootballFetch(endpoint, params = {}) {
    // Bloqueamos la llamada si el servidor no tiene llave configurada.
    if (!hasApiFootballKey()) {
        throw new Error("Falta configurar APIFOOTBALL_API_KEY o RAPIDAPI_KEY en el entorno.");
    }
    // Construimos la URL respetando una base configurable.
    const url = new URL(`${API_FOOTBALL_BASE_URL.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`);
    // Agregamos parametros definidos y omitimos vacios.
    Object.entries(params).forEach(([key, value]) => {
        // Evitamos mandar null, undefined o cadenas vacias.
        if (value !== null && value !== undefined && String(value).trim() !== "") {
            url.searchParams.set(key, String(value));
        }
    });
    // Creamos controlador para cortar llamadas lentas.
    const controller = new AbortController();
    // Definimos timeout razonable para que el cron no quede colgado.
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        // Ejecutamos la peticion con headers correctos del proveedor configurado.
        const response = await fetch(url, {
            signal: controller.signal,
            headers: buildApiFootballHeaders(),
        });
        // Parseamos JSON incluso cuando el status HTTP no es 2xx para capturar errores del proveedor.
        const data = await response.json();
        // Cortamos el timeout al recibir respuesta valida.
        clearTimeout(timeout);
        // Convertimos errores HTTP en excepciones legibles.
        if (!response.ok) {
            throw new Error(`API-Football HTTP ${response.status}: ${JSON.stringify(data?.errors || data)}`);
        }
        // API-Football devuelve errors como objeto o arreglo.
        const providerErrors = data?.errors;
        // Detectamos errores funcionales aunque HTTP sea 200.
        if (providerErrors && Object.keys(providerErrors).length > 0) {
            throw new Error(`API-Football error: ${JSON.stringify(providerErrors)}`);
        }
        // Devolvemos la respuesta completa para permitir paging y metadatos.
        return data;
    }
    catch (error) {
        // Cortamos el timeout tambien en excepciones.
        clearTimeout(timeout);
        // Convertimos AbortError en mensaje claro.
        if (error?.name === "AbortError") {
            throw new Error(`Timeout consultando API-Football: ${url.toString()}`);
        }
        // Relanzamos otros errores para que rutas/cron decidan como continuar.
        throw error;
    }
}
/**
 * <summary>
 * Convierte un fixture crudo de API-Football al formato usado por el panel admin.
 * </summary>
 * @param fixture - Fixture recibido desde API-Football.
 * @returns Fixture liviano para el frontend.
 */
function mapFixtureForAdmin(fixture) {
    // Leemos la fecha ISO del proveedor.
    const fixtureDate = String(fixture?.fixture?.date || "");
    // Extraemos fecha legible para datetime-local.
    const date = fixtureDate.slice(0, 10);
    // Extraemos hora local segun timezone solicitado.
    const time = fixtureDate.includes("T") ? fixtureDate.split("T")[1]?.slice(0, 5) : "";
    // Devolvemos una estructura compatible con el buscador existente.
    return {
        // Exponemos el ID oficial del fixture para vinculación posterior.
        id: String(fixture?.fixture?.id || ""),
        // Exponemos el nombre visible del cruce para el panel admin.
        name: `${fixture?.teams?.home?.name || "Local"} vs ${fixture?.teams?.away?.name || "Visitante"}`,
        // Exponemos el ID oficial del equipo local para depuración o UI futura.
        homeTeamId: fixture?.teams?.home?.id ?? null,
        // Exponemos el ID oficial del equipo visitante para depuración o UI futura.
        awayTeamId: fixture?.teams?.away?.id ?? null,
        // Exponemos el nombre oficial del local según el proveedor.
        homeTeamName: fixture?.teams?.home?.name || "",
        // Exponemos el nombre oficial del visitante según el proveedor.
        awayTeamName: fixture?.teams?.away?.name || "",
        // Exponemos la liga del fixture para el panel.
        league: fixture?.league?.name || "",
        // Exponemos el país del fixture para contexto visual.
        country: fixture?.league?.country || "",
        // Exponemos la fecha del fixture en formato simple.
        date,
        // Exponemos la hora del fixture en formato HH:mm.
        time,
        // Exponemos el estado corto/largo del proveedor.
        status: fixture?.fixture?.status?.short || fixture?.fixture?.status?.long || "",
        // Exponemos el marcador local si ya existe.
        homeScore: fixture?.goals?.home ?? null,
        // Exponemos el marcador visitante si ya existe.
        awayScore: fixture?.goals?.away ?? null,
        // Exponemos el logo local cuando el proveedor lo entrega.
        homeLogo: fixture?.teams?.home?.logo || "",
        // Exponemos el logo visitante cuando el proveedor lo entrega.
        awayLogo: fixture?.teams?.away?.logo || "",
        // Exponemos el logo de la liga para cards del panel.
        leagueLogo: fixture?.league?.logo || "",
    };
}
/**
 * <summary>
 * Busca equipos en API-Football por nombre.
 * </summary>
 * @param teamName - Nombre o alias del equipo en el proveedor.
 * @returns Lista de equipos candidatos.
 */
async function searchProviderTeams(teamName) {
    // Evitamos gastar consultas con textos demasiado cortos.
    if (!teamName || teamName.trim().length < 2)
        return [];
    // Consultamos el endpoint oficial de equipos.
    const data = await apiFootballFetch("teams", { search: teamName.trim() });
    // Normalizamos la respuesta como arreglo.
    return Array.isArray(data?.response) ? data.response : [];
}
/**
 * <summary>
 * Normaliza el ID de un equipo del proveedor para búsquedas exactas por API-Football.
 * </summary>
 * @param value - ID recibido desde rutas, formulario o base de datos.
 * @returns ID numérico o null cuando no es válido.
 */
function normalizeProviderTeamId(value) {
    // Tratamos vacío, null o undefined como ausencia de vínculo.
    if (value === null || value === undefined || String(value).trim() === "") {
        return null;
    }
    // Convertimos el valor recibido a número.
    const parsedValue = Number(value);
    // Solo aceptamos enteros positivos como IDs oficiales de API-Football.
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        return null;
    }
    // Devolvemos el ID listo para usar en filtros exactos.
    return parsedValue;
}
/**
 * <summary>
 * Detecta si un nombre de equipo parece juvenil, filial o reserva para bajar su prioridad.
 * </summary>
 * @param teamName - Nombre oficial entregado por API-Football.
 * @returns Verdadero cuando el equipo parece no ser la plantilla principal.
 */
function isYouthOrReserveTeamName(teamName) {
    // Normalizamos el texto para detectar sufijos comunes de categorías inferiores.
    const normalizedTeamName = normalizeComparable(teamName);
    // Detectamos juveniles, filiales, equipos femeninos o reservas.
    return /\bu(?:17|18|19|20|21|23)\b|\bii\b|\biii\b|\breserv(?:a|e|es)\b|\bwomen\b|\bfemin(?:ino|ine|ino)\b/.test(normalizedTeamName);
}
/**
 * <summary>
 * Calcula un puntaje de coincidencia para priorizar el mejor equipo sugerido por API-Football.
 * </summary>
 * @param expectedName - Nombre local del equipo en BetRoyale.
 * @param providerName - Nombre oficial devuelto por API-Football.
 * @returns Puntaje donde un valor mayor indica una mejor coincidencia.
 */
function getProviderCandidateScore(expectedName, providerName) {
    // Normalizamos ambos lados para comparaciones exactas o por inclusión.
    const normalizedExpectedName = normalizeComparable(expectedName);
    // Normalizamos el nombre del proveedor para compararlo de forma estable.
    const normalizedProviderName = normalizeComparable(providerName);
    // Partimos de un puntaje neutro.
    let score = 0;
    // Priorizamos coincidencias exactas del nombre completo.
    if (normalizedExpectedName === normalizedProviderName) {
        score += 10;
    }
    // Priorizamos coincidencias por inclusión para nombres con prefijos como "1. FC".
    if (normalizedProviderName.includes(normalizedExpectedName) || normalizedExpectedName.includes(normalizedProviderName)) {
        score += 4;
    }
    // Sumamos un punto adicional cuando la comparación flexible ya considera válido el alias.
    if (teamNameMatches(expectedName, providerName)) {
        score += 2;
    }
    // Penalizamos juveniles o reservas para favorecer el primer equipo.
    if (isYouthOrReserveTeamName(providerName)) {
        score -= 5;
    }
    // Devolvemos el puntaje final para ordenar sugerencias.
    return score;
}
/**
 * <summary>
 * Expone candidatos de alias API-Football para el panel de equipos sin alterar el nombre visible local.
 * </summary>
 * @param teamName - Nombre visible del equipo en BetRoyale usado para buscar coincidencias en el proveedor.
 * @returns Lista corta de candidatos con nombre técnico y metadatos básicos.
 */
export async function searchProviderTeamCandidates(teamName) {
    // Consultamos el proveedor con el nombre visible o alias parcial digitado por el admin.
    const candidates = await searchProviderTeams(teamName);
    // Convertimos la respuesta cruda del proveedor en un formato compacto para el panel.
    const normalizedCandidates = candidates
        .map((candidate) => {
        // Leemos el nombre oficial del equipo que usa API-Football.
        const providerName = String(candidate?.team?.name || "").trim();
        // Calculamos una prioridad alta cuando el equipo coincide y no parece juvenil o reserva.
        const similarityScore = getProviderCandidateScore(teamName, providerName);
        // Devolvemos únicamente los campos útiles para la UI administrativa.
        return {
            // Guardamos el ID oficial del equipo en API-Football.
            provider_id: candidate?.team?.id ?? null,
            // Guardamos el nombre oficial del proveedor.
            provider_name: providerName,
            // Guardamos el país oficial para ayudar a desambiguar.
            country_name: String(candidate?.team?.country || "").trim(),
            // Guardamos el código corto cuando exista.
            code: String(candidate?.team?.code || "").trim(),
            // Guardamos el logo para posibles mejoras visuales.
            logo: String(candidate?.team?.logo || "").trim(),
            // Conservamos el puntaje interno para ordenar resultados antes de responder.
            similarity_score: similarityScore,
        };
    })
        // Descartamos respuestas vacías o incompletas del proveedor.
        .filter((candidate) => Boolean(candidate.provider_name))
        // Priorizamos coincidencias más cercanas antes de mostrar al admin.
        .sort((left, right) => right.similarity_score - left.similarity_score || left.provider_name.localeCompare(right.provider_name));
    // Quitamos el campo interno de ordenamiento antes de responder.
    return normalizedCandidates.slice(0, 8).map(({ similarity_score, ...candidate }) => candidate);
}
/**
 * <summary>
 * Valida si un fixture contiene al visitante buscado.
 * </summary>
 * @param fixture - Fixture candidato de API-Football.
 * @param awayQuery - Nombre o alias del visitante que esperamos encontrar.
 * @returns true cuando el visitante coincide suficientemente.
 */
function fixtureMatchesAwayTeam(fixture, awayQuery) {
    // Si no hay visitante buscado, aceptamos el fixture por equipo principal.
    if (!awayQuery)
        return true;
    // Normalizamos el visitante esperado.
    const expectedAway = normalizeComparable(awayQuery);
    // Normalizamos ambos equipos del fixture porque API puede invertir local/visitante.
    const homeName = normalizeComparable(fixture?.teams?.home?.name || "");
    const awayName = normalizeComparable(fixture?.teams?.away?.name || "");
    // Aceptamos coincidencia por inclusion en cualquiera de los lados.
    return homeName.includes(expectedAway) || expectedAway.includes(homeName) || awayName.includes(expectedAway) || expectedAway.includes(awayName);
}
/**
 * <summary>
 * Divide un nombre normalizado en tokens significativos para comparar aliases.
 * </summary>
 * @param value - Nombre normalizado del equipo.
 * @returns Tokens utiles para coincidencia flexible.
 */
function getTeamTokens(value) {
    // Definimos palabras que suelen ser ruido en nombres de clubes.
    const stopWords = new Set(["fc", "cf", "cd", "sc", "afc", "club", "de", "del", "la", "el", "the"]);
    // Convertimos el texto en tokens y descartamos ruido muy corto.
    return normalizeComparable(value)
        .split(" ")
        .filter((token) => token.length > 2 && !stopWords.has(token) && !/^u\d+$/i.test(token));
}
/**
 * <summary>
 * Compara un nombre esperado contra un equipo real de API-Football.
 * </summary>
 * @param expected - Nombre o alias que viene del panel admin.
 * @param actual - Nombre oficial retornado por API-Football.
 * @returns Verdadero cuando hay coincidencia directa o por tokens.
 */
function teamNameMatches(expected, actual) {
    // Normalizamos ambos lados para comparaciones directas.
    const expectedNormalized = normalizeComparable(expected);
    // Normalizamos el nombre real del proveedor.
    const actualNormalized = normalizeComparable(actual);
    // Sin nombre esperado, no podemos afirmar coincidencia.
    if (!expectedNormalized)
        return false;
    // Coincidencia directa por inclusion para casos sencillos.
    if (actualNormalized.includes(expectedNormalized) || expectedNormalized.includes(actualNormalized))
        return true;
    // Extraemos tokens del alias esperado.
    const expectedTokens = getTeamTokens(expectedNormalized);
    // Extraemos tokens del nombre real.
    const actualTokens = new Set(getTeamTokens(actualNormalized));
    // Contamos tokens compartidos para cubrir aliases como Paris SG vs Paris Saint Germain.
    const sharedTokens = expectedTokens.filter((token) => actualTokens.has(token));
    // Si el alias solo tenia siglas cortas sin tokens utiles, no forzamos coincidencia.
    if (expectedTokens.length === 0)
        return false;
    // Con un token fuerte compartido suele bastar cuando tambien filtramos rival y fecha.
    return sharedTokens.length >= 1;
}
/**
 * <summary>
 * Valida si un fixture de una fecha coincide con local/visitante esperados.
 * </summary>
 * @param fixture - Fixture candidato de API-Football.
 * @param homeQuery - Nombre o alias esperado del local.
 * @param awayQuery - Nombre o alias esperado del visitante.
 * @returns true cuando el partido coincide en orden normal o invertido.
 */
function fixtureMatchesFullQuery(fixture, homeQuery, awayQuery) {
    // Leemos nombre local desde el fixture.
    const fixtureHome = fixture?.teams?.home?.name || "";
    // Leemos nombre visitante desde el fixture.
    const fixtureAway = fixture?.teams?.away?.name || "";
    // Si no hay rival, aceptamos coincidencia del equipo principal en cualquier lado.
    if (!awayQuery)
        return teamNameMatches(homeQuery, fixtureHome) || teamNameMatches(homeQuery, fixtureAway);
    // Validamos direccion normal local vs visitante.
    const normalMatch = teamNameMatches(homeQuery, fixtureHome) && teamNameMatches(awayQuery, fixtureAway);
    // Validamos direccion invertida por si el admin escribio el orden contrario.
    const invertedMatch = teamNameMatches(homeQuery, fixtureAway) && teamNameMatches(awayQuery, fixtureHome);
    // Aceptamos cualquiera de las dos direcciones.
    return normalMatch || invertedMatch;
}
/**
 * <summary>
 * Valida si un fixture coincide exactamente con los IDs oficiales de API-Football esperados.
 * </summary>
 * @param fixture - Fixture candidato de API-Football.
 * @param homeProviderTeamId - ID esperado del equipo local según el proveedor.
 * @param awayProviderTeamId - ID esperado del equipo visitante según el proveedor.
 * @returns true cuando el fixture corresponde al mismo cruce exacto.
 */
function fixtureMatchesProviderTeamIds(fixture, homeProviderTeamId, awayProviderTeamId) {
    // Leemos el ID local del fixture devuelto por API-Football.
    const fixtureHomeTeamId = normalizeProviderTeamId(fixture?.teams?.home?.id);
    // Leemos el ID visitante del fixture devuelto por API-Football.
    const fixtureAwayTeamId = normalizeProviderTeamId(fixture?.teams?.away?.id);
    // Si alguno de los lados del fixture no tiene ID, no lo consideramos exacto.
    if (!fixtureHomeTeamId || !fixtureAwayTeamId) {
        return false;
    }
    // Validamos el orden local-visitante esperado.
    const normalMatch = fixtureHomeTeamId === homeProviderTeamId && fixtureAwayTeamId === awayProviderTeamId;
    // Validamos el orden invertido por si el pick quedó guardado al revés.
    const invertedMatch = fixtureHomeTeamId === awayProviderTeamId && fixtureAwayTeamId === homeProviderTeamId;
    // Aceptamos cualquiera de las dos direcciones exactas.
    return normalMatch || invertedMatch;
}
/**
 * <summary>
 * Busca fixtures por IDs oficiales de los equipos para evitar ambigüedad por nombres o aliases.
 * </summary>
 * @param homeProviderTeamId - ID oficial del equipo local en API-Football.
 * @param awayProviderTeamId - ID oficial del equipo visitante en API-Football.
 * @param matchDate - Fecha del partido para recortar el universo de fixtures.
 * @returns Fixtures compatibles con el cruce exacto de ambos IDs.
 */
export async function searchFixturesByProviderTeamIds(homeProviderTeamId, awayProviderTeamId, matchDate) {
    // Normalizamos el ID local del proveedor.
    const normalizedHomeProviderTeamId = normalizeProviderTeamId(homeProviderTeamId);
    // Normalizamos el ID visitante del proveedor.
    const normalizedAwayProviderTeamId = normalizeProviderTeamId(awayProviderTeamId);
    // Si falta cualquiera de los IDs, no podemos hacer una búsqueda exacta.
    if (!normalizedHomeProviderTeamId || !normalizedAwayProviderTeamId) {
        return [];
    }
    // Extraemos la fecha si el panel o el cron la tiene disponible.
    const date = matchDate ? extractDateFromMatchDate(matchDate) : null;
    // Si existe fecha exacta, usamos el endpoint diario para reducir consumo y falsos positivos.
    if (date) {
        // Consultamos los fixtures del día completo en horario Colombia.
        const data = await apiFootballFetch("fixtures", { date, timezone: BETROYALE_TIMEZONE });
        // Normalizamos los fixtures devueltos por API-Football.
        const dailyFixtures = Array.isArray(data?.response) ? data.response : [];
        // Filtramos solo el cruce exacto entre ambos IDs oficiales.
        return dailyFixtures
            .filter((fixture) => fixtureMatchesProviderTeamIds(fixture, normalizedHomeProviderTeamId, normalizedAwayProviderTeamId))
            .slice(0, 20)
            .map(mapFixtureForAdmin);
    }
    // Calculamos temporadas candidatas cuando no hubo fecha exacta.
    const seasons = getCandidateSeasons(null);
    // Acumulamos fixtures evitando duplicados por ID.
    const fixturesById = new Map();
    // Probamos un conjunto corto de temporadas para no agotar cuota del proveedor.
    for (const season of seasons) {
        // Consultamos el calendario del equipo local en la temporada candidata.
        const data = await apiFootballFetch("fixtures", {
            team: normalizedHomeProviderTeamId,
            season,
            next: 20,
            timezone: BETROYALE_TIMEZONE,
        });
        // Normalizamos la respuesta como arreglo.
        const fixtures = Array.isArray(data?.response) ? data.response : [];
        // Guardamos solo fixtures que coincidan exactamente con ambos IDs oficiales.
        fixtures
            .filter((fixture) => fixtureMatchesProviderTeamIds(fixture, normalizedHomeProviderTeamId, normalizedAwayProviderTeamId))
            .forEach((fixture) => {
            // Persistimos una sola copia por fixture.
            fixturesById.set(String(fixture?.fixture?.id || ""), fixture);
        });
        // Si ya encontramos resultados exactos, evitamos más consultas.
        if (fixturesById.size > 0) {
            break;
        }
    }
    // Convertimos el mapa a la estructura usada por el panel admin.
    return Array.from(fixturesById.values()).slice(0, 20).map(mapFixtureForAdmin);
}
/**
 * <summary>
 * Busca partidos en API-Football usando IDs oficiales de equipo cuando existan, o aliases y fecha opcional como respaldo.
 * </summary>
 * @param query - Texto de busqueda, idealmente "Local vs Visitante".
 * @param matchDate - Fecha del partido para reducir falsos positivos.
 * @param homeProviderTeamId - ID oficial del equipo local en API-Football.
 * @param awayProviderTeamId - ID oficial del equipo visitante en API-Football.
 * @returns Fixtures compatibles con el panel admin.
 */
export async function searchFixtures(query, matchDate, homeProviderTeamId, awayProviderTeamId) {
    try {
        // Si tenemos ambos IDs oficiales, priorizamos una búsqueda exacta por proveedor.
        const fixturesByProviderIds = await searchFixturesByProviderTeamIds(homeProviderTeamId ?? null, awayProviderTeamId ?? null, matchDate);
        // Si la búsqueda exacta devolvió resultados, ya no necesitamos comparaciones por texto.
        if (fixturesByProviderIds.length > 0) {
            return fixturesByProviderIds;
        }
        // Dividimos la consulta para buscar por equipo local y filtrar el rival.
        const { home, away } = splitMatchQuery(query);
        // Extraemos la fecha si el panel la tiene disponible.
        const date = matchDate ? extractDateFromMatchDate(matchDate) : null;
        // Si tenemos fecha exacta, usamos el endpoint por dia para evitar restricciones de season en plan free.
        if (date) {
            // Consultamos todos los fixtures de la fecha en horario Colombia.
            const data = await apiFootballFetch("fixtures", { date, timezone: BETROYALE_TIMEZONE });
            // Normalizamos fixtures como arreglo.
            const dailyFixtures = Array.isArray(data?.response) ? data.response : [];
            // Filtramos por local/visitante usando coincidencia flexible de aliases.
            return dailyFixtures
                .filter((fixture) => fixtureMatchesFullQuery(fixture, home, away))
                .slice(0, 20)
                .map(mapFixtureForAdmin);
        }
        // Buscamos candidatos de equipo usando el alias configurado.
        const teams = await searchProviderTeams(home);
        // Si el proveedor no devuelve equipos, no podemos consultar fixtures de forma confiable.
        if (teams.length === 0)
            return [];
        // Acumulamos fixtures evitando duplicados.
        const fixturesById = new Map();
        // Probamos maximo tres candidatos para controlar consumo de API.
        for (const teamCandidate of teams.slice(0, 3)) {
            // Tomamos el ID del equipo candidato.
            const teamId = teamCandidate?.team?.id;
            // Saltamos candidatos incompletos.
            if (!teamId)
                continue;
            // Calculamos temporadas candidatas porque API-Football exige season al combinar team + date.
            const seasons = getCandidateSeasons(date);
            // Probamos temporadas probables para cubrir ligas europeas y ligas de año calendario.
            for (const season of seasons) {
                // Consultamos por fecha exacta si existe, o proximos partidos si no hay fecha.
                const data = await apiFootballFetch("fixtures", date
                    ? { date, team: teamId, season, timezone: BETROYALE_TIMEZONE }
                    : { team: teamId, season, next: 20, timezone: BETROYALE_TIMEZONE });
                // Normalizamos fixtures como arreglo.
                const fixtures = Array.isArray(data?.response) ? data.response : [];
                // Filtramos rival y guardamos por ID.
                fixtures.filter((fixture) => fixtureMatchesAwayTeam(fixture, away)).forEach((fixture) => {
                    // Guardamos una sola version por ID.
                    fixturesById.set(String(fixture?.fixture?.id), fixture);
                });
                // Si ya encontramos resultados con una temporada, evitamos gastar mas cuota.
                if (fixturesById.size > 0)
                    break;
            }
        }
        // Convertimos fixtures a formato del admin y limitamos resultados.
        return Array.from(fixturesById.values()).slice(0, 20).map(mapFixtureForAdmin);
    }
    catch (error) {
        // Extraemos mensaje del proveedor para distinguir errores de plan contra busquedas sin datos.
        const message = error instanceof Error ? error.message : String(error);
        // Si API-Football responde por limite de plan, lo subimos al panel admin con texto claro.
        if (message.includes("\"plan\"") || message.toLowerCase().includes("free plans")) {
            // Detectamos si el limite fue por fecha puntual.
            const isDateLimit = message.toLowerCase().includes("this date");
            // Extraemos el rango sugerido por API-Football cuando viene en la respuesta.
            const suggestedRange = message.match(/try from ([^".]+)/i)?.[1];
            // Construimos una explicación operativa para el administrador.
            const planMessage = isDateLimit
                ? `API-Football conectó correctamente, pero tu plan actual no permite consultar la fecha seleccionada${suggestedRange ? `; el proveedor permite ${suggestedRange}` : ""}. Usa vínculo manual para ese pick o amplía el plan de API-Football.`
                : `API-Football conectó correctamente, pero tu plan actual no permite consultar esa temporada${suggestedRange ? `; el proveedor permite ${suggestedRange}` : ""}. Usa vínculo manual para ese pick o amplía el plan de API-Football.`;
            // Marcamos el error con codigo estable para que el frontend lo trate como advertencia.
            const planError = Object.assign(new Error(planMessage), { code: "API_PLAN_LIMIT" });
            // Lanzamos el error tipado.
            throw planError;
        }
        // Registramos sin tumbar el panel admin.
        console.error("[SCORES] Error buscando en API-Football:", error);
        // Devolvemos arreglo vacio para que el frontend muestre estado controlado.
        return [];
    }
}
/**
 * <summary>
 * Obtiene un valor numerico de estadistica por nombre.
 * </summary>
 * @param statistics - Estadisticas de un equipo segun API-Football.
 * @param acceptedNames - Nombres aceptados normalizados en minusculas.
 * @returns Numero de la estadistica o null si no viene.
 */
function extractStatisticValue(statistics, acceptedNames) {
    // Buscamos una estadistica compatible por nombre.
    const stat = statistics.find((item) => acceptedNames.has(String(item?.type || "").toLowerCase()));
    // Si la estadistica no existe, la cobertura no esta disponible.
    if (!stat)
        return null;
    // API-Football puede devolver numeros o strings porcentuales.
    const rawValue = stat.value;
    // Null significa que el proveedor no recolecto ese dato.
    if (rawValue === null || rawValue === undefined || rawValue === "")
        return null;
    // Convertimos el valor a numero quitando simbolos.
    const numericValue = Number(String(rawValue).replace("%", ""));
    // Devolvemos null si el valor no es numerico.
    return Number.isFinite(numericValue) ? numericValue : null;
}
/**
 * <summary>
 * Consulta estadisticas de fixture y las empareja con local/visitante.
 * </summary>
 * @param fixtureId - ID del fixture en API-Football.
 * @param homeTeamId - ID del local en API-Football.
 * @param awayTeamId - ID del visitante en API-Football.
 * @returns Estadisticas normalizadas para mercados especiales.
 */
async function getFixtureStats(fixtureId, homeTeamId, awayTeamId) {
    try {
        // Consultamos estadisticas por fixture.
        const data = await apiFootballFetch("fixtures/statistics", { fixture: fixtureId });
        // Normalizamos la respuesta.
        const rows = Array.isArray(data?.response) ? data.response : [];
        // Si no hay dos equipos, la API no tiene cobertura suficiente para mercados especiales.
        if (rows.length === 0)
            return {};
        // Buscamos fila local por ID y caemos al orden de la API cuando falte ID.
        const homeStatsRow = rows.find((row) => row?.team?.id === homeTeamId) || rows[0];
        // Buscamos fila visitante por ID y caemos al orden de la API cuando falte ID.
        const awayStatsRow = rows.find((row) => row?.team?.id === awayTeamId) || rows[1];
        // Extraemos estadisticas del local.
        const homeStats = Array.isArray(homeStatsRow?.statistics) ? homeStatsRow.statistics : [];
        // Extraemos estadisticas del visitante.
        const awayStats = Array.isArray(awayStatsRow?.statistics) ? awayStatsRow.statistics : [];
        // Devolvemos valores que pueden estar null si no hay cobertura.
        return {
            cornersHome: extractStatisticValue(homeStats, CORNER_STAT_NAMES),
            cornersAway: extractStatisticValue(awayStats, CORNER_STAT_NAMES),
            yellowCardsHome: extractStatisticValue(homeStats, YELLOW_CARD_STAT_NAMES),
            yellowCardsAway: extractStatisticValue(awayStats, YELLOW_CARD_STAT_NAMES),
        };
    }
    catch (error) {
        // La falta de estadisticas no debe tumbar marcador ni cron.
        console.warn(`[SCORES] No se pudieron consultar estadisticas del fixture ${fixtureId}:`, error);
        // Devolvemos objeto vacio para que mercados especiales queden pendientes.
        return {};
    }
}
/**
 * <summary>
 * Construye un MatchResult desde el fixture crudo de API-Football.
 * </summary>
 * @param fixture - Fixture crudo del proveedor.
 * @returns Resultado base con marcador y estado.
 */
async function buildResult(fixture) {
    // Extraemos el ID del fixture.
    const fixtureId = String(fixture?.fixture?.id || "");
    // Extraemos IDs de equipos para mapear estadisticas.
    const homeTeamId = fixture?.teams?.home?.id ?? null;
    // Extraemos ID visitante para mapear estadisticas.
    const awayTeamId = fixture?.teams?.away?.id ?? null;
    // Consultamos estadisticas complementarias cuando existe ID de fixture.
    const stats = fixtureId ? await getFixtureStats(fixtureId, homeTeamId, awayTeamId) : {};
    // Devolvemos el resultado normalizado.
    return {
        eventId: fixtureId,
        status: fixture?.fixture?.status?.short || fixture?.fixture?.status?.long || "",
        goalsHome: fixture?.goals?.home ?? null,
        goalsAway: fixture?.goals?.away ?? null,
        provider: "API-Football",
        ...stats,
    };
}
/**
 * <summary>
 * Busca un partido por nombre y fecha, y retorna su marcador/estadisticas si existe.
 * </summary>
 * @param matchName - Nombre o alias del partido.
 * @param matchDate - Fecha usada para restringir la busqueda.
 * @returns Resultado normalizado o null cuando no se encuentra.
 */
export async function getMatchResultByName(matchName, matchDate) {
    // Extraemos la fecha para evitar falsos positivos.
    const date = extractDateFromMatchDate(matchDate);
    // Si no hay fecha, no hacemos busquedas abiertas poco confiables.
    if (!date) {
        console.warn(`[SCORES] No se pudo extraer fecha de: ${matchDate}`);
        return null;
    }
    // Buscamos fixtures con la misma logica del panel.
    const fixtures = await searchFixtures(matchName, date);
    // Si no hay candidato, no marcamos nada automaticamente.
    if (fixtures.length === 0)
        return null;
    // Consultamos el resultado completo del primer candidato.
    return getFixtureResult(fixtures[0].id);
}
/**
 * <summary>
 * Busca un partido por IDs oficiales de API-Football y devuelve su resultado final si existe.
 * </summary>
 * @param homeProviderTeamId - ID oficial del equipo local en API-Football.
 * @param awayProviderTeamId - ID oficial del equipo visitante en API-Football.
 * @param matchDate - Fecha usada para localizar el fixture exacto.
 * @returns Resultado normalizado o null cuando el proveedor no encuentra el cruce.
 */
export async function getMatchResultByProviderTeamIds(homeProviderTeamId, awayProviderTeamId, matchDate) {
    // Buscamos fixtures exactos usando ambos IDs oficiales del proveedor.
    const fixtures = await searchFixturesByProviderTeamIds(homeProviderTeamId, awayProviderTeamId, matchDate);
    // Si no hay fixture exacto, devolvemos null para permitir fallback por texto.
    if (fixtures.length === 0) {
        return null;
    }
    // Consultamos el resultado completo del primer fixture exacto encontrado.
    return getFixtureResult(fixtures[0].id);
}
/**
 * <summary>
 * Obtiene marcador y estadisticas por ID de fixture de API-Football.
 * </summary>
 * @param eventId - ID del fixture en API-Football.
 * @returns Resultado normalizado o null si el proveedor no lo encuentra.
 */
export async function getFixtureResult(eventId) {
    try {
        // Consultamos el fixture por ID exacto.
        const data = await apiFootballFetch("fixtures", { id: eventId, timezone: BETROYALE_TIMEZONE });
        // Tomamos el primer resultado del proveedor.
        const fixture = Array.isArray(data?.response) ? data.response[0] : null;
        // Si no existe fixture, devolvemos null para reintentar por nombre.
        if (!fixture)
            return null;
        // Construimos resultado completo.
        return buildResult(fixture);
    }
    catch (error) {
        // Registramos el error sin tumbar cron.
        console.error(`[SCORES] Error al buscar fixture API-Football ID ${eventId}:`, error);
        // Devolvemos null para que el flujo pueda reintentar por nombre.
        return null;
    }
}
/**
 * <summary>
 * Verifica si un estado de proveedor corresponde a partido finalizado.
 * </summary>
 * @param status - Estado corto/largo del proveedor.
 * @returns true cuando el partido ya puede evaluarse.
 */
function isMatchFinished(status) {
    // Normalizamos el estado para comparar.
    const normalizedStatus = String(status || "").trim().toUpperCase();
    // Revisamos estados cerrados de API-Football y legacy.
    return FINISHED_STATUS_CODES.has(normalizedStatus);
}
/**
 * <summary>
 * Extrae linea numerica de un mercado tipo +8.5, -4.5, MAS_2.5 o MEN_3.5.
 * </summary>
 * @param marketId - ID, label o acronimo del mercado.
 * @returns Linea numerica o null si no se detecta.
 */
function extractMarketLine(marketId) {
    // Intentamos detectar signos + o - junto a decimal.
    const signedMatch = String(marketId).match(/[+-]\s*(\d+(?:\.\d+)?)/);
    // Devolvemos la linea si existe.
    if (signedMatch)
        return Number(signedMatch[1]);
    // Intentamos detectar formatos MAS_2.5 o MEN_2.5.
    const namedMatch = String(marketId).match(/(?:MAS|MEN|OVER|UNDER)[_\s-]*(\d+(?:\.\d+)?)/i);
    // Devolvemos null si no hay linea.
    return namedMatch ? Number(namedMatch[1]) : null;
}
/**
 * <summary>
 * Determina si un mercado es de tipo over.
 * </summary>
 * @param marketId - ID, label o acronimo del mercado.
 * @returns true cuando el mercado es mas/over.
 */
function isOverMarket(marketId) {
    // Normalizamos para comparar palabras clave.
    const text = String(marketId || "").toUpperCase();
    // Detectamos mercados positivos o mas.
    return text.includes("+") || text.includes("MAS") || text.includes("MÁS") || text.includes("OVER");
}
/**
 * <summary>
 * Evalua una linea total si existe dato estadistico confiable.
 * </summary>
 * @param value - Total de la estadistica.
 * @param marketId - Mercado con linea over/under.
 * @returns Estado del pick o pending si faltan datos.
 */
function evaluateTotalLine(value, marketId) {
    // Si la API no entrego estadistica, dejamos revision manual.
    if (value === null || value === undefined)
        return "pending";
    // Extraemos linea del mercado.
    const line = extractMarketLine(marketId);
    // Sin linea no podemos evaluar con seguridad.
    if (line === null || Number.isNaN(line))
        return "pending";
    // Evaluamos over o under segun el texto del mercado.
    return isOverMarket(marketId) ? (value > line ? "won" : "lost") : (value < line ? "won" : "lost");
}
/**
 * <summary>
 * Selecciona el dato estadístico correcto según si el mercado habla del total, del local o del visitante.
 * </summary>
 * @param marketId - Texto del mercado que puede incluir local, visitante, home o away.
 * @param totalValue - Total consolidado de la estadística.
 * @param homeValue - Valor del equipo local.
 * @param awayValue - Valor del equipo visitante.
 * @returns Valor puntual a evaluar según el alcance detectado.
 */
function resolveScopedStatisticValue(marketId, totalValue, homeValue, awayValue) {
    // Normalizamos el texto para detectar si el mercado apunta al local o al visitante.
    const normalizedMarket = String(marketId || "").toLowerCase();
    // Detectamos mercados explícitos del equipo local.
    if (/(local|home|casa)/i.test(normalizedMarket) && !/(visitante|away|fuera)/i.test(normalizedMarket)) {
        // Devolvemos el valor del equipo local cuando aplica.
        return homeValue;
    }
    // Detectamos mercados explícitos del equipo visitante.
    if (/(visitante|away|fuera)/i.test(normalizedMarket) && !/(local|home|casa)/i.test(normalizedMarket)) {
        // Devolvemos el valor del equipo visitante cuando aplica.
        return awayValue;
    }
    // En cualquier otro caso evaluamos contra el total del partido.
    return totalValue;
}
/**
 * <summary>
 * Motor de reglas: determina estado del pick usando marcador y estadisticas disponibles.
 * </summary>
 * @param marketId - ID o acronimo del mercado guardado.
 * @param goalsHome - Goles locales.
 * @param goalsAway - Goles visitantes.
 * @param result - Resultado completo con corners y tarjetas opcionales.
 * @returns Estado calculado o pending para revision manual.
 */
export function evaluatePickStatus(marketId, goalsHome, goalsAway, result) {
    // Normalizamos mercado para comparaciones.
    const normalizedMarket = String(marketId || "").trim();
    // Calculamos goles totales.
    const totalGoals = goalsHome + goalsAway;
    // Calculamos diferencia local.
    const diff = goalsHome - goalsAway;
    // Detectamos mercados de corners totales.
    if (/corner|corners|c[oó]rner/i.test(normalizedMarket)) {
        // Calculamos corners totales solo si ambos equipos tienen dato.
        const totalCorners = result?.cornersHome !== null && result?.cornersHome !== undefined && result?.cornersAway !== null && result?.cornersAway !== undefined
            ? Number(result.cornersHome) + Number(result.cornersAway)
            : null;
        // Seleccionamos total, local o visitante según el texto del mercado.
        const scopedCorners = resolveScopedStatisticValue(normalizedMarket, totalCorners, result?.cornersHome, result?.cornersAway);
        // Evaluamos la línea de corners o dejamos pendiente manual.
        return evaluateTotalLine(scopedCorners, normalizedMarket);
    }
    // Detectamos mercados de tarjetas amarillas totales.
    if (/yellow|amarilla|tarjeta/i.test(normalizedMarket)) {
        // Calculamos amarillas totales solo si ambos equipos tienen dato.
        const totalYellows = result?.yellowCardsHome !== null && result?.yellowCardsHome !== undefined && result?.yellowCardsAway !== null && result?.yellowCardsAway !== undefined
            ? Number(result.yellowCardsHome) + Number(result.yellowCardsAway)
            : null;
        // Seleccionamos total, local o visitante según el texto del mercado.
        const scopedYellows = resolveScopedStatisticValue(normalizedMarket, totalYellows, result?.yellowCardsHome, result?.yellowCardsAway);
        // Evaluamos la línea de tarjetas o dejamos pendiente manual.
        return evaluateTotalLine(scopedYellows, normalizedMarket);
    }
    switch (normalizedMarket) {
        // Resultado final local.
        case "1":
        case "Gana Local":
        case "GL":
            return goalsHome > goalsAway ? "won" : "lost";
        // Resultado final visitante.
        case "2":
        case "Gana Visitante":
        case "GV":
            return goalsAway > goalsHome ? "won" : "lost";
        // Empate.
        case "X":
        case "Empate":
        case "E":
            return goalsHome === goalsAway ? "won" : "lost";
        // Doble oportunidad local.
        case "1X":
        case "Local o Empate":
            return goalsHome >= goalsAway ? "won" : "lost";
        // Doble oportunidad visitante.
        case "X2":
        case "Visitante o Empate":
            return goalsAway >= goalsHome ? "won" : "lost";
        // Doble oportunidad sin empate.
        case "12":
        case "Local o Visitante":
            return goalsHome !== goalsAway ? "won" : "lost";
        // Over de goles.
        case "+0.5":
        case "MAS_0.5":
            return totalGoals > 0.5 ? "won" : "lost";
        case "+1.5":
        case "MAS_1.5":
            return totalGoals > 1.5 ? "won" : "lost";
        case "+2.5":
        case "MAS_2.5":
            return totalGoals > 2.5 ? "won" : "lost";
        case "+3.5":
        case "MAS_3.5":
            return totalGoals > 3.5 ? "won" : "lost";
        // Under de goles.
        case "-0.5":
        case "MEN_0.5":
            return totalGoals < 0.5 ? "won" : "lost";
        case "-1.5":
        case "MEN_1.5":
            return totalGoals < 1.5 ? "won" : "lost";
        case "-2.5":
        case "MEN_2.5":
            return totalGoals < 2.5 ? "won" : "lost";
        case "-3.5":
        case "MEN_3.5":
            return totalGoals < 3.5 ? "won" : "lost";
        // Ambos equipos marcan.
        case "AEM":
        case "BTTS":
        case "Si":
            return goalsHome > 0 && goalsAway > 0 ? "won" : "lost";
        // Ambos equipos no marcan.
        case "AEM_NO":
        case "BTTS_NO":
        case "No":
            return !(goalsHome > 0 && goalsAway > 0) ? "won" : "lost";
        // Ambos marcan y over 2.5.
        case "AEM_+2.5":
        case "Si y +2.5":
        case "AEM & +2.5":
            return goalsHome > 0 && goalsAway > 0 && totalGoals > 2.5 ? "won" : "lost";
        // Handicap local -1.
        case "H_-1":
            return diff >= 2 ? "won" : "lost";
        // Handicap visitante +1.
        case "H_+1":
            return diff <= 1 ? "won" : "lost";
        default:
            // Dejamos pendiente cualquier mercado no automatizable.
            console.log(`[SCORES] Mercado "${marketId}" no soportado o sin datos suficientes -> pendiente manual`);
            return "pending";
    }
}
/**
 * <summary>
 * Verifica si el partido finalizo segun su estado.
 * </summary>
 * @param status - Estado retornado por API-Football.
 * @returns true cuando puede evaluarse automaticamente.
 */
export function isFinished(status) {
    // Delegamos al normalizador interno.
    return isMatchFinished(status);
}
