/**
 * @file picks.routes.ts
 * @description Rutas CRUD para los picks deportivos.
 * Incluye: listado de picks, creación, edición, actualización de estado,
 * eliminación individual y masiva, y tracking/seguimiento de picks.
 */
import { Router } from "express";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
// Importamos utilidades de Telegram para publicar picks, seguimientos y resultados cortos de parlays.
import { sendTelegramMessage, formatPickParaTelegram, formatSeguimientoParaTelegram, formatResultadoParlayParaTelegram } from "../services/telegram.service.js";
import { obtenerTelegramFullConfig } from "../services/settings.service.js";
// Importamos el motor de evaluación para sugerir resultados manuales según el mercado.
import { evaluatePickStatus } from "../services/scores.service.js";
// Creamos el router para las rutas de picks
const router = Router();
// Centralizamos los estados válidos para evitar typos desde el panel admin.
const ESTADOS_PERMITIDOS = new Set(["pending", "won", "lost", "void", "half-won", "half-lost"]);
/**
 * <summary>
 * Convierte un valor del formulario en número entero opcional sin romper cuando llega vacío.
 * </summary>
 * @param value - Valor recibido desde el panel admin.
 * @returns Número entero o null cuando no existe un dato válido.
 */
function parseOptionalInteger(value) {
    // Tratamos null, undefined y cadenas vacías como ausencia de dato.
    if (value === null || value === undefined || String(value).trim() === "") {
        return null;
    }
    // Convertimos el texto recibido a número.
    const parsed = Number(value);
    // Si el valor no es finito, devolvemos null para no guardar basura.
    if (!Number.isFinite(parsed)) {
        return null;
    }
    // Redondeamos a entero porque marcador, córners y amarillas no aceptan decimales.
    return Math.trunc(parsed);
}
/**
 * <summary>
 * Resuelve el total manual de una estadística usando el total explícito o la suma local/visitante.
 * </summary>
 * @param totalValue - Total ingresado manualmente.
 * @param homeValue - Valor del equipo local.
 * @param awayValue - Valor del equipo visitante.
 * @returns Total consolidado o null cuando aún falta información.
 */
function resolveManualTotal(totalValue, homeValue, awayValue) {
    // Priorizamos el total explícito cuando el admin ya lo conoce.
    if (totalValue !== null) {
        return totalValue;
    }
    // Si no hay total directo pero sí ambos lados, sumamos local y visitante.
    if (homeValue !== null && awayValue !== null) {
        return homeValue + awayValue;
    }
    // Si falta información, dejamos el total en null.
    return null;
}
/**
 * <summary>
 * Obtiene el identificador más útil del mercado para pasarlo al motor de evaluación.
 * </summary>
 * @param pickRow - Pick cargado desde base de datos con join opcional de markets.
 * @returns Texto representativo del mercado.
 */
function getManualMarketReference(pickRow) {
    // Priorizamos acrónimo, luego etiqueta y por último el valor guardado en picks.pick.
    return String(pickRow?.market_acronym || pickRow?.market_label || pickRow?.pick || "").trim();
}
/**
 * <summary>
 * Traduce el estado técnico del pick a una etiqueta legible para el admin.
 * </summary>
 * @param status - Estado técnico del pick.
 * @returns Etiqueta en español para feedback del modal.
 */
function getManualStatusLabel(status) {
    // Centralizamos etiquetas humanas para que el modal y el backend hablen igual.
    switch (String(status || "").toLowerCase()) {
        case "won":
            return "Ganado";
        case "lost":
            return "Perdido";
        case "void":
            return "Nulo";
        case "half-won":
            return "Medio Ganado";
        case "half-lost":
            return "Medio Perdido";
        default:
            return "Pendiente";
    }
}
/**
 * <summary>
 * Construye una explicación breve de por qué el sistema sugiere un resultado manual.
 * </summary>
 * @param marketReference - Mercado evaluado.
 * @param scoreHome - Marcador local cargado manualmente.
 * @param scoreAway - Marcador visitante cargado manualmente.
 * @param cornersTotal - Total de córners disponible para evaluación.
 * @param yellowCardsTotal - Total de amarillas disponible para evaluación.
 * @param suggestedStatus - Estado sugerido por el motor.
 * @returns Razón legible para el panel admin.
 */
function buildManualResolutionReason(marketReference, scoreHome, scoreAway, cornersTotal, yellowCardsTotal, suggestedStatus) {
    // Iniciamos con el mercado evaluado para dar contexto rápido.
    const details = [`Mercado evaluado: ${marketReference || "Sin mercado definido"}.`];
    // Agregamos el marcador si existe porque suele ser el dato principal del pick.
    if (scoreHome !== null && scoreAway !== null) {
        details.push(`Marcador manual: ${scoreHome}-${scoreAway}.`);
    }
    // Agregamos total de córners si está disponible.
    if (cornersTotal !== null) {
        details.push(`Córners totales disponibles: ${cornersTotal}.`);
    }
    // Agregamos total de amarillas si está disponible.
    if (yellowCardsTotal !== null) {
        details.push(`Amarillas totales disponibles: ${yellowCardsTotal}.`);
    }
    // Cerramos con la sugerencia del sistema.
    details.push(`Sugerencia del sistema: ${getManualStatusLabel(suggestedStatus)}.`);
    // Si no había datos suficientes, lo explicamos de forma explícita.
    if (suggestedStatus === "pending") {
        details.push("Falta información concluyente o el mercado requiere revisión manual adicional.");
    }
    // Devolvemos una sola frase limpia para el panel.
    return details.join(" ");
}
/**
 * <summary>
 * Calcula una sugerencia de estado usando marcador y estadísticas manuales sin inventar datos críticos.
 * </summary>
 * @param marketReference - Mercado a evaluar.
 * @param scoreHome - Marcador local manual.
 * @param scoreAway - Marcador visitante manual.
 * @param cornersHome - Córners del local.
 * @param cornersAway - Córners del visitante.
 * @param yellowCardsHome - Amarillas del local.
 * @param yellowCardsAway - Amarillas del visitante.
 * @param eventId - Identificador lógico del evento para trazabilidad.
 * @returns Estado sugerido por el motor o pending si faltan datos.
 */
function getSuggestedManualStatus(marketReference, scoreHome, scoreAway, cornersHome, cornersAway, yellowCardsHome, yellowCardsAway, eventId) {
    // Detectamos mercados puramente estadísticos para permitir evaluación sin marcador.
    const isCornersMarket = /corner|corners|c[oó]rner/i.test(marketReference);
    // Detectamos mercados de amarillas para permitir evaluación sin score.
    const isYellowCardsMarket = /yellow|amarilla|tarjeta/i.test(marketReference);
    // Si el mercado depende del marcador y aún falta score, devolvemos pendiente.
    if (!isCornersMarket && !isYellowCardsMarket && (scoreHome === null || scoreAway === null)) {
        return "pending";
    }
    // Armamos un resultado compatible con el motor de evaluación.
    const manualResult = {
        // Etiquetamos el origen manual del cálculo.
        eventId,
        // Marcamos el partido como terminado para evaluar el pick.
        status: "FT",
        // Usamos marcador manual o cero solo cuando el mercado no depende de score faltante.
        goalsHome: scoreHome ?? 0,
        // Usamos marcador manual o cero solo cuando el mercado no depende de score faltante.
        goalsAway: scoreAway ?? 0,
        // Pasamos las estadísticas manuales por equipo.
        cornersHome,
        // Pasamos las estadísticas manuales por equipo.
        cornersAway,
        // Pasamos las amarillas manuales por equipo.
        yellowCardsHome,
        // Pasamos las amarillas manuales por equipo.
        yellowCardsAway,
        // Conservamos proveedor lógico para auditoría.
        provider: "API-Football",
    };
    // Devolvemos la sugerencia del motor de reglas.
    return evaluatePickStatus(marketReference, manualResult.goalsHome ?? 0, manualResult.goalsAway ?? 0, manualResult);
}
/**
 * <summary>
 * Agrega estados de selecciones para sugerir el estado global del parlay.
 * </summary>
 * @param statuses - Estados sugeridos o finales de cada selección.
 * @returns Estado global sugerido para el parlay.
 */
function aggregateParlaySuggestedStatus(statuses) {
    // Normalizamos los estados recibidos para comparar con seguridad.
    const normalizedStatuses = statuses.map((status) => String(status || "pending").toLowerCase());
    // Si alguna selección se perdió, el parlay se considera perdido.
    if (normalizedStatuses.includes("lost")) {
        return "lost";
    }
    // Si aún hay selecciones sin datos suficientes, el parlay queda pendiente.
    if (normalizedStatuses.includes("pending")) {
        return "pending";
    }
    // Si existen medias liquidaciones, preferimos dejar revisión manual.
    if (normalizedStatuses.includes("half-won") || normalizedStatuses.includes("half-lost")) {
        return "pending";
    }
    // Si todas fueron nulas, el parlay se sugiere nulo.
    if (normalizedStatuses.length > 0 && normalizedStatuses.every((status) => status === "void")) {
        return "void";
    }
    // Si todas quedaron entre ganadas y nulas, el parlay sigue vivo como ganado.
    if (normalizedStatuses.length > 0 && normalizedStatuses.every((status) => status === "won" || status === "void")) {
        return "won";
    }
    // Cualquier mezcla no contemplada queda para revisión.
    return "pending";
}
/**
 * <summary>
 * Resume en una sola frase el estado sugerido de las selecciones de un parlay.
 * </summary>
 * @param selections - Selecciones ya evaluadas con sugerencia por selección.
 * @param overallStatus - Estado global sugerido del parlay.
 * @returns Resumen corto para el modal del admin.
 */
function buildParlayManualSuggestedReason(selections, overallStatus) {
    // Resumimos cada selección con índice, partido y estado sugerido.
    const parts = selections.map((selection, index) => `#${index + 1} ${selection.match_name || `Selección ${index + 1}`}: ${getManualStatusLabel(selection.suggested_status)}`);
    // Cerramos con la sugerencia global del sistema.
    parts.push(`Sugerencia global del parlay: ${getManualStatusLabel(overallStatus)}.`);
    // Si alguna selección sigue pendiente, lo dejamos explícito para el admin.
    if (selections.some((selection) => selection.suggested_status === "pending")) {
        parts.push("Hay al menos una selección con información insuficiente o que requiere revisión manual.");
    }
    // Entregamos el resumen consolidado.
    return parts.join(" ");
}
/**
 * Convierte el JSON de selecciones de parlay en un arreglo seguro.
 *
 * @param rawSelections - Valor JSON recibido desde MySQL o desde el formulario.
 * @returns Arreglo de selecciones parseadas.
 */
function parseSeleccionesParlay(rawSelections) {
    // Si no hay selecciones, devolvemos un arreglo vacío.
    if (!rawSelections) {
        return [];
    }
    // MySQL puede devolver JSON como string según la configuración del driver.
    if (typeof rawSelections === "string") {
        try {
            return JSON.parse(rawSelections);
        }
        catch (error) {
            console.error("[PICKS] Error parseando selecciones para Telegram:", error);
            return [];
        }
    }
    // Si ya llega como arreglo, lo usamos directamente.
    if (Array.isArray(rawSelections)) {
        return rawSelections;
    }
    // Cualquier otro formato no es seguro para publicar.
    return [];
}
/**
 * <summary>
 * Valida y normaliza las selecciones de un parlay antes de guardarlas o enviarlas a Telegram.
 * </summary>
 * @param rawSelections - Selecciones recibidas desde el panel de administración.
 * @returns Resultado con selecciones limpias o mensaje de error para el administrador.
 */
function validarSeleccionesParlay(rawSelections) {
    // Convertimos el payload a arreglo para soportar clientes que envíen JSON string.
    const selections = parseSeleccionesParlay(rawSelections);
    // Un parlay necesita al menos una selección explícita.
    if (selections.length === 0) {
        return { valid: false, selections: [], error: "Agrega al menos una selección al parlay" };
    }
    // Normalizamos cada selección y detenemos el proceso si falta información crítica.
    for (let index = 0; index < selections.length; index += 1) {
        // Tomamos la selección actual para validar sus campos.
        const selection = selections[index] || {};
        // Validamos la liga de la selección para poder resolver país/bandera en Telegram.
        if (!selection.league_id) {
            return { valid: false, selections: [], error: `Selecciona la liga en la selección ${index + 1}` };
        }
        // Validamos el partido final que verá el usuario en Telegram y estadísticas.
        if (!String(selection.match_name || "").trim()) {
            return { valid: false, selections: [], error: `Selecciona o escribe el partido en la selección ${index + 1}` };
        }
        // Validamos fecha/hora propia porque los parlays no usan una hora general.
        if (!selection.match_time) {
            return { valid: false, selections: [], error: `Selecciona fecha y hora en la selección ${index + 1}` };
        }
        // Validamos mercado para que el bot no publique IDs vacíos.
        if (!selection.pick) {
            return { valid: false, selections: [], error: `Selecciona el pronóstico en la selección ${index + 1}` };
        }
        // Convertimos cuota a número para validar rango operativo.
        const odds = Number(selection.odds);
        // Una cuota debe ser mayor que 1 para que el parlay tenga sentido.
        if (!Number.isFinite(odds) || odds <= 1) {
            return { valid: false, selections: [], error: `La cuota de la selección ${index + 1} debe ser mayor a 1` };
        }
    }
    // Devolvemos selecciones limpias, conservando IDs de equipos para futuras ediciones.
    const normalizedSelections = selections.map((selection) => ({
        // Conservamos campos adicionales existentes sin perder compatibilidad.
        ...selection,
        // Normalizamos país opcional como texto estable.
        country_id: selection.country_id ? String(selection.country_id) : "",
        // Normalizamos liga como texto para comparaciones consistentes.
        league_id: String(selection.league_id),
        // Normalizamos equipo local opcional para reabrir el editor con selección.
        home_team: selection.home_team ? String(selection.home_team) : "",
        // Normalizamos equipo visitante opcional para reabrir el editor con selección.
        away_team: selection.away_team ? String(selection.away_team) : "",
        // Guardamos el partido final limpio para Telegram.
        match_name: String(selection.match_name).trim(),
        // Guardamos datetime-local como texto Colombia para el formatter del bot.
        match_time: String(selection.match_time),
        // Normalizamos mercado como texto para resolverlo después.
        pick: String(selection.pick),
        // Guardamos cuota con dos decimales para que el mensaje sea consistente.
        odds: Number(selection.odds).toFixed(2),
    }));
    // Entregamos resultado válido con selecciones normalizadas.
    return { valid: true, selections: normalizedSelections };
}
/**
 * Enriquece las selecciones de parlay con liga, país, bandera y mercado legible.
 *
 * @param rawSelections - Selecciones originales guardadas en el pick.
 * @returns Selecciones listas para formatear en Telegram.
 */
async function enriquecerSeleccionesParaTelegram(rawSelections) {
    // Parseamos primero para trabajar siempre con un arreglo.
    const selecciones = parseSeleccionesParlay(rawSelections);
    // Si no hay selecciones, no necesitamos consultar datos relacionados.
    if (selecciones.length === 0) {
        return [];
    }
    // Extraemos IDs únicos para consulta en lote.
    const leagueIds = [...new Set(selecciones.map((s) => s.league_id).filter(Boolean))];
    const marketIds = [...new Set(selecciones.map((s) => s.pick).filter(Boolean))];
    const teamIds = [...new Set([
            ...selecciones.map((s) => s.home_team).filter(Boolean),
            ...selecciones.map((s) => s.away_team).filter(Boolean)
        ])];
    // Mapas para resolver datos relacionados
    const leagueMap = new Map();
    const marketMap = new Map();
    const teamMap = new Map();
    // Consultar Ligas
    if (leagueIds.length > 0) {
        const placeholders = leagueIds.map(() => "?").join(",");
        const [leagueRows] = await pool.query(`SELECT l.id, l.name, c.name AS country_name, c.flag AS country_flag
       FROM leagues l
       LEFT JOIN countries c ON l.country_id = c.id
       WHERE l.id IN (${placeholders})`, leagueIds);
        leagueRows.forEach((l) => leagueMap.set(String(l.id), l));
    }
    // Consultar Mercados
    if (marketIds.length > 0) {
        const placeholders = marketIds.map(() => "?").join(",");
        const [marketRows] = await pool.query(`SELECT id, label, acronym FROM markets WHERE id IN (${placeholders})`, marketIds);
        marketRows.forEach((m) => marketMap.set(String(m.id), m));
    }
    // Consultar Equipos (para nombres dinámicos)
    if (teamIds.length > 0) {
        const placeholders = teamIds.map(() => "?").join(",");
        const [teamRows] = await pool.query(`SELECT id, name FROM teams WHERE id IN (${placeholders})`, teamIds);
        teamRows.forEach((t) => teamMap.set(String(t.id), t.name));
    }
    // Combinamos cada selección con sus datos relacionados.
    return selecciones.map((selection) => {
        const league = leagueMap.get(String(selection.league_id));
        const market = marketMap.get(String(selection.pick));
        // Resolvemos equipos si tienen ID, de lo contrario usamos el texto que ya venía.
        const hName = teamMap.get(String(selection.home_team));
        const aName = teamMap.get(String(selection.away_team));
        let finalMatchName = selection.match_name;
        if (hName && aName) {
            finalMatchName = `${hName} vs ${aName}`;
        }
        // Devolvemos una selección enriquecida manteniendo los campos originales.
        return {
            ...selection,
            league_name: league?.name || selection.league_name || selection.league_id,
            country_name: league?.country_name || selection.country_name || "",
            country_flag: league?.country_flag || selection.country_flag || "",
            market_label: market?.label || selection.market_label || selection.pick,
            market_acronym: market?.acronym || selection.market_acronym || "",
            match_name: finalMatchName,
        };
    });
}
/**
 * Carga un pick con nombres legibles para enviarlo a Telegram.
 *
 * @param pickId - ID del pick que se notificará por Telegram.
 * @returns Pick enriquecido con liga, mercado y canal del tipo de pick.
 */
async function obtenerPickParaTelegram(pickId) {
    // Consultamos el pick junto con su tipo, liga y mercado para no enviar ids crudos.
    const [rows] = await pool.query(`SELECT p.*,
            pt.slug AS pick_type_slug,
            pt.name AS pick_type_name,
            pt.telegram_channel_id,
            c.name AS country_name,
            c.flag AS country_flag,
            COALESCE(l.name, p.league, '') AS league_name,
            m.label AS market_label,
            m.acronym AS market_acronym,
            ht.name AS home_team_name,
            at.name AS away_team_name
     FROM picks p
     LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
     LEFT JOIN leagues l ON p.league_id = l.id
     LEFT JOIN countries c ON l.country_id = c.id
     LEFT JOIN markets m ON p.pick = m.id
     LEFT JOIN teams ht ON p.home_team_id = ht.id
     LEFT JOIN teams at ON p.away_team_id = at.id
     WHERE p.id = ?
     LIMIT 1`, [pickId]);
    // Si no hay registro, no hay nada que notificar.
    if (rows.length === 0) {
        return null;
    }
    // Normalizamos el pick para el formato esperado por el servicio de Telegram.
    const pick = rows[0];
    // Enriquecemos selecciones si el pick publicado es un parlay.
    const selecciones = await enriquecerSeleccionesParaTelegram(pick.selections);
    // Resolvemos el nombre del partido dinámicamente si tenemos los IDs de los equipos.
    let dynamicMatchName = pick.match_name;
    if (pick.home_team_name && pick.away_team_name) {
        dynamicMatchName = `${pick.home_team_name} vs ${pick.away_team_name}`;
    }
    // Devolvemos textos legibles para picks simples y parlays.
    return {
        ...pick,
        league: pick.is_parlay ? "Parlay" : pick.league_name,
        pick: pick.is_parlay ? "Parlay" : pick.pick,
        match_name: pick.is_parlay ? "Parlay" : dynamicMatchName,
        selections: selecciones,
    };
}
/**
 * Determina los canales de Telegram que corresponden a un pick.
 *
 * @param pick - Pick enriquecido con configuración de tipo y slug legacy.
 * @returns Lista de Channel IDs configurados, sin duplicados.
 */
async function obtenerCanalesTelegramParaPick(pick) {
    // Usamos Set para evitar duplicar envíos si dos configuraciones apuntan al mismo canal.
    const canales = new Set();
    // Normalizamos el slug para distinguir picks free de picks VIP.
    const slugTipo = String(pick.pick_type_slug || pick.pick_type || "").trim();
    // Un pick se considera gratuito solo cuando su slug legacy o actual es "free".
    const esPickGratis = slugTipo === "free";
    // Usamos primero el canal guardado desde el panel admin.
    if (pick.telegram_channel_id) {
        canales.add(String(pick.telegram_channel_id).trim());
    }
    // Mantenemos compatibilidad con el canal gratuito definido por variable de entorno.
    if (esPickGratis && env.TELEGRAM_FREE_CHANNEL_ID) {
        canales.add(env.TELEGRAM_FREE_CHANNEL_ID.trim());
    }
    // Los picks VIP se envían también al canal espejo VIP Full.
    if (!esPickGratis) {
        const fullConfig = await obtenerTelegramFullConfig();
        // Agregamos el canal Full solo si está configurado.
        if (fullConfig.telegram_channel_id) {
            canales.add(fullConfig.telegram_channel_id.trim());
        }
    }
    // Eliminamos valores vacíos antes de intentar enviar mensajes.
    return Array.from(canales).filter(Boolean);
}
/**
 * <summary>
 * Convierte una fecha guardada en MySQL como UTC en un objeto Date seguro.
 * </summary>
 * @param value - Fecha del pick recibida desde MySQL.
 * @returns Fecha parseada como instante UTC.
 */
function parseFechaUtc(value) {
    // Si MySQL ya entregó un Date, usamos ese instante directamente.
    if (value instanceof Date) {
        return value;
    }
    // Normalizamos espacios de MySQL para que Date pueda interpretar la cadena.
    const text = String(value || "").trim().replace(" ", "T");
    // Detectamos si la fecha ya incluye zona horaria explícita.
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
    // Agregamos segundos cuando la cadena viene de datetime-local.
    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? `${text}:00` : text;
    // MySQL guarda match_date en UTC, así que agregamos Z si no hay zona.
    return new Date(hasTimezone ? normalized : `${normalized}Z`);
}
/**
 * <summary>
 * Convierte un Date a formato DATETIME UTC compatible con MySQL.
 * </summary>
 * @param value - Fecha absoluta que se guardará como texto UTC.
 * @returns Fecha tipo "YYYY-MM-DD HH:mm:ss".
 */
function formatMysqlUtc(value) {
    // Usamos ISO y quitamos milisegundos/zona para comparar contra DATETIME.
    return value.toISOString().slice(0, 19).replace("T", " ");
}
/**
 * <summary>
 * Calcula el rango UTC del mes colombiano al que pertenece un pick.
 * </summary>
 * @param value - Fecha del pick usada como referencia del mes.
 * @returns Rango UTC y etiqueta corta del mes.
 */
function obtenerRangoMesColombia(value) {
    // Parseamos la fecha del pick como instante UTC.
    const fecha = parseFechaUtc(value);
    // Extraemos año y mes desde la zona horaria de Colombia.
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
    }).formatToParts(fecha);
    // Obtenemos el año visible en Colombia.
    const year = Number(partes.find((part) => part.type === "year")?.value || fecha.getUTCFullYear());
    // Obtenemos el mes visible en Colombia.
    const month = Number(partes.find((part) => part.type === "month")?.value || fecha.getUTCMonth() + 1);
    // Construimos el primer día del mes en horario Colombia.
    const inicioColombia = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00-05:00`);
    // Calculamos el primer día del mes siguiente en horario Colombia.
    const siguienteYear = month === 12 ? year + 1 : year;
    // Calculamos el número del mes siguiente.
    const siguienteMonth = month === 12 ? 1 : month + 1;
    // Construimos el inicio del mes siguiente en horario Colombia.
    const finColombia = new Date(`${siguienteYear}-${String(siguienteMonth).padStart(2, "0")}-01T00:00:00-05:00`);
    // Formateamos el mes para mostrarlo en Telegram.
    const label = new Intl.DateTimeFormat("es-CO", {
        timeZone: "America/Bogota",
        month: "short",
        year: "numeric",
    }).format(fecha);
    // Devolvemos rango convertido a UTC para MySQL y etiqueta visual.
    return {
        inicioUtc: formatMysqlUtc(inicioColombia),
        finUtc: formatMysqlUtc(finColombia),
        label,
    };
}
/**
 * <summary>
 * Calcula unidades, yield y récord mensual del plan de un pick.
 * </summary>
 * @param pick - Pick ya actualizado que define plan y mes de cálculo.
 * @returns Métricas mensuales listas para formatear en Telegram.
 */
async function calcularMetricasMensualesParaPick(pick) {
    // Calculamos el rango mensual en horario Colombia, comparado como UTC en MySQL.
    const rango = obtenerRangoMesColombia(pick.match_date);
    // Consultamos el rendimiento mensual del mismo plan después de actualizar el pick.
    const [rows] = await pool.query(`SELECT
       COALESCE(SUM(CASE
         WHEN status = 'won' THEN stake * (odds - 1)
         WHEN status = 'lost' THEN -stake
         WHEN status = 'half-won' THEN (stake / 2) * (odds - 1)
         WHEN status = 'half-lost' THEN -(stake / 2)
         ELSE 0
       END), 0) AS profit,
       COALESCE(SUM(CASE
         WHEN status IN ('won', 'lost', 'half-won', 'half-lost') THEN stake
         ELSE 0
       END), 0) AS total_staked,
       COALESCE(SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END), 0) AS won,
       COALESCE(SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END), 0) AS lost,
       COALESCE(SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END), 0) AS voids
     FROM picks
     WHERE pick_type_id = ?
       AND match_date >= ?
       AND match_date < ?
       AND status IN ('won', 'lost', 'half-won', 'half-lost', 'void')`, [pick.pick_type_id, rango.inicioUtc, rango.finUtc]);
    // Tomamos la primera fila agregada de MySQL.
    const fila = rows[0] || {};
    // Normalizamos el profit acumulado.
    const profit = Number(fila.profit) || 0;
    // Normalizamos el total apostado.
    const totalStaked = Number(fila.total_staked) || 0;
    // Calculamos yield mensual sobre unidades apostadas.
    const yieldMensual = totalStaked > 0 ? (profit / totalStaked) * 100 : 0;
    // Devolvemos métricas numéricas para el formatter de Telegram.
    return {
        label: rango.label,
        profit,
        yield: yieldMensual,
        totalStaked,
        won: Number(fila.won) || 0,
        lost: Number(fila.lost) || 0,
        voids: Number(fila.voids) || 0,
    };
}
/**
 * <summary>
 * Indica si un pick debe usar el mensaje corto especial para resultado de parlay.
 * </summary>
 * @param pick - Pick actualizado con estado y bandera de parlay.
 * @returns true cuando es parlay ganado o perdido.
 */
function debeUsarMensajeResultadoParlay(pick) {
    // Normalizamos la bandera de parlay porque MySQL puede devolver 0/1.
    const esParlay = Boolean(Number(pick.is_parlay) || pick.is_parlay === true);
    // Normalizamos el slug para evitar mandar resultados free a canales VIP pagos.
    const slugTipo = String(pick.pick_type_slug || pick.pick_type || "").trim();
    // Un pick gratuito no debe replicarse a todos los canales VIP.
    const esPickGratis = slugTipo === "free";
    // Solo ganados y perdidos usan el formato corto pedido para parlays.
    return !esPickGratis && esParlay && ["won", "lost"].includes(String(pick.status));
}
/**
 * <summary>
 * Notifica por Telegram el resultado actualizado de un pick.
 * </summary>
 * @param pickId - ID del pick que acaba de cambiar de estado.
 */
async function notificarResultadoPickPorTelegram(pickId) {
    // Cargamos el pick actualizado con nombres legibles para Telegram.
    const pick = await obtenerPickParaTelegram(pickId);
    // Si el pick no existe o ya fue notificado, no hacemos nada.
    if (!pick || pick.result_notified) {
        return;
    }
    // Detectamos si aplica el resultado corto de parlay VIP.
    const usaMensajeParlayVip = debeUsarMensajeResultadoParlay(pick);
    // Publicamos solo en el canal del plan y en VIP Full si está configurado como espejo.
    const channelIds = await obtenerCanalesTelegramParaPick(pick);
    // Si no hay canales configurados, evitamos llamar a Telegram.
    if (channelIds.length === 0) {
        return;
    }
    // Calculamos métricas solo para el formato corto de parlays ganados/perdidos.
    const mensaje = usaMensajeParlayVip
        ? formatResultadoParlayParaTelegram(pick, await calcularMetricasMensualesParaPick(pick))
        : formatPickParaTelegram(pick, true);
    // Publicamos el resultado en cada canal correspondiente.
    for (const channelId of channelIds) {
        await sendTelegramMessage(channelId, mensaje);
    }
    // Marcamos como notificado para evitar duplicados en ejecuciones futuras o crons.
    await pool.query("UPDATE picks SET result_notified = 1 WHERE id = ?", [pickId]);
}
// ─── GET /api/picks ──────────────────────────────────────────────────────────
/**
 * Devuelve todos los picks con sus datos relacionados:
 * tipo, mercado, liga y bandera del país.
 * También incluye el tracking de cada pick y resuelve las selecciones de parlays.
 * Ruta pública (no requiere autenticación).
 */
router.get("/", async (_req, res) => {
    try {
        // Query principal: JOIN con tipos, mercados, ligas y países
        const [picks] = await pool.query(`
      SELECT p.*, 
             pt.slug  AS pick_type_slug, 
             pt.name  AS pick_type_name,
             m.label  AS market_label, 
             m.acronym AS market_acronym,
             COALESCE(l.name, p.league) AS league_name,
             c.flag   AS country_flag,
             c.name   AS country_name
      FROM picks p 
      LEFT JOIN pick_types pt ON p.pick_type_id = pt.id 
      LEFT JOIN markets    m  ON p.pick = m.id
      LEFT JOIN leagues    l  ON p.league_id = l.id
      LEFT JOIN countries  c  ON l.country_id = c.id
      ORDER BY p.match_date DESC
    `);
        // Cargamos todos los registros de tracking para adjuntarlos luego
        const [tracking] = await pool.query("SELECT * FROM pick_tracking ORDER BY created_at ASC");
        // Cargamos ligas con país/bandera para resolver tickets sociales y selecciones de parlays.
        const [ligas] = await pool.query(`
      SELECT l.id, l.name, c.name AS country_name, c.flag AS country_flag
      FROM leagues l
      LEFT JOIN countries c ON l.country_id = c.id
    `);
        const [mercados] = await pool.query("SELECT id, label, acronym FROM markets");
        // Procesamos cada pick para formatear fechas y adjuntar tracking
        const picksFormateados = picks.map((pick) => {
            // Forzamos interpretación UTC para que el navegador muestre la hora local correcta
            const fechaObj = pick.match_date instanceof Date
                ? pick.match_date
                : new Date(pick.match_date + "Z");
            // Parseamos las selecciones de parlay (si es parlay y tiene selecciones JSON)
            let selecciones = [];
            if (pick.selections) {
                if (typeof pick.selections === "string") {
                    try {
                        // Intentamos parsear el JSON de selecciones
                        selecciones = JSON.parse(pick.selections);
                    }
                    catch (e) {
                        console.error(`[PICKS] Error parseando selecciones del pick ${pick.id}:`, e);
                    }
                }
                else if (Array.isArray(pick.selections)) {
                    // Si ya es array, lo usamos directamente
                    selecciones = pick.selections;
                }
                // Enriquecemos cada selección con el nombre de liga y mercado
                selecciones = selecciones.map((sel) => {
                    const liga = ligas.find((l) => l.id.toString() === sel.league_id?.toString());
                    const mercado = mercados.find((m) => m.id.toString() === sel.pick?.toString());
                    return {
                        ...sel,
                        /** Nombre legible de la liga */
                        league_name: liga ? liga.name : sel.league_id,
                        /** Nombre legible del país para piezas sociales */
                        country_name: liga ? liga.country_name : sel.country_name,
                        /** Bandera legible del país para piezas sociales */
                        country_flag: liga ? liga.country_flag : sel.country_flag,
                        /** Etiqueta del mercado (ej: "Gana Local") */
                        market_label: mercado ? mercado.label : sel.pick,
                        /** Acrónimo del mercado (ej: "1") */
                        market_acronym: mercado ? mercado.acronym : "",
                    };
                });
            }
            return {
                ...pick,
                /** Fecha en formato ISO para facilitar el manejo en el frontend */
                match_date: fechaObj.toISOString(),
                /** Selecciones del parlay procesadas */
                selections: selecciones,
                /** Registros de tracking filtrados para este pick */
                tracking: tracking.filter((t) => t.pick_id === pick.id),
            };
        });
        return res.json(picksFormateados);
    }
    catch (error) {
        console.error("[PICKS] Error obteniendo picks:", error);
        return res.status(500).json({ error: "Error al obtener los picks" });
    }
});
// ─── POST /api/picks ─────────────────────────────────────────────────────────
/**
 * Crea un nuevo pick deportivo.
 * Solo administradores. Notifica automáticamente por Telegram al publicar.
 */
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
    const { match_date, league_id, match_name, pick, odds, stake, pick_type_id, analysis, is_parlay, selections, } = req.body;
    // Preparamos las selecciones limpias cuando el pick es parlay.
    let seleccionesParlayNormalizadas = [];
    // Validación diferenciada para parlays vs picks individuales
    if (is_parlay) {
        if (!match_date || !odds || !stake || !pick_type_id || !selections?.length) {
            return res.status(400).json({ error: "Faltan campos obligatorios para el parlay" });
        }
        // Validamos cada selección para que Telegram reciba partido, liga, hora, mercado y cuota.
        const validation = validarSeleccionesParlay(selections);
        // Si falta información de una selección, devolvemos el error concreto al admin.
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error || "Selecciones de parlay inválidas" });
        }
        // Usamos la versión normalizada como única fuente para guardar el parlay.
        seleccionesParlayNormalizadas = validation.selections;
    }
    else {
        if (!match_date || !league_id || !match_name || !pick || !odds || !stake || !pick_type_id) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }
    }
    try {
        // Obtenemos el slug del tipo de pick (necesario para el campo legacy 'pick_type')
        const [tipos] = await pool.query("SELECT slug FROM pick_types WHERE id = ?", [pick_type_id]);
        const slugTipo = tipos.length > 0 ? tipos[0].slug : "free";
        // Convertimos la fecha de Colombia (UTC-5) a UTC para almacenar en MySQL
        const fechaColombia = new Date(match_date + ":00-05:00");
        const fechaFormateada = fechaColombia.toISOString().slice(0, 19).replace("T", " ");
        // Insertamos el pick en la base de datos
        const [resultado] = await pool.query(`INSERT INTO picks 
       (match_date, league_id, match_name, pick, odds, stake, pick_type_id, 
        analysis, is_parlay, selections, league, pick_type, home_team_id, away_team_id,
        api_fixture_id, thesportsdb_event_id, auto_update, score_home, score_away)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            fechaFormateada,
            is_parlay ? null : league_id,
            is_parlay ? "Parlay" : match_name,
            is_parlay ? "Parlay" : pick,
            odds,
            stake,
            pick_type_id,
            analysis || null,
            is_parlay ? true : false,
            is_parlay ? JSON.stringify(seleccionesParlayNormalizadas) : null,
            is_parlay ? "Parlay" : "",
            slugTipo,
            is_parlay ? null : (req.body.home_team || null),
            is_parlay ? null : (req.body.away_team || null),
            req.body.api_fixture_id ? Number(req.body.api_fixture_id) : null,
            req.body.thesportsdb_event_id || null,
            req.body.auto_update !== undefined ? (req.body.auto_update ? 1 : 0) : 1,
            req.body.score_home !== undefined ? req.body.score_home : null,
            req.body.score_away !== undefined ? req.body.score_away : null
        ]);
        // Notificamos al canal de Telegram correspondiente
        try {
            // Cargamos el pick recién creado con nombres legibles para Telegram.
            const pickTelegram = await obtenerPickParaTelegram(resultado.insertId);
            // Resolvemos los canales del plan y el espejo VIP Full cuando aplica.
            const channelIds = pickTelegram ? await obtenerCanalesTelegramParaPick(pickTelegram) : [];
            // Enviamos la notificación solo cuando al menos un canal está configurado.
            if (pickTelegram && channelIds.length > 0) {
                const mensaje = formatPickParaTelegram(pickTelegram);
                // Publicamos el mismo pick en cada canal resuelto para ese plan.
                for (const channelId of channelIds) {
                    await sendTelegramMessage(channelId, mensaje);
                }
            }
        }
        catch (tgErr) {
            // El error de Telegram no debe bloquear la creación del pick
            console.error("[PICKS] Error enviando a Telegram:", tgErr);
        }
        return res.status(201).json({
            id: resultado.insertId,
            message: "Pick creado exitosamente",
        });
    }
    catch (error) {
        console.error("[PICKS] Error creando pick:", error);
        return res.status(500).json({ error: "Error al crear el pick", details: error.message });
    }
});
// ─── PUT /api/picks/:id ──────────────────────────────────────────────────────
/**
 * Actualiza todos los campos de un pick existente.
 * Solo administradores.
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { match_date, league_id, match_name, pick, odds, stake, pick_type_id, analysis, is_parlay, selections, } = req.body;
    // Preparamos las selecciones limpias cuando el pick editado es parlay.
    let seleccionesParlayNormalizadas = [];
    // Validación de campos requeridos según tipo
    if (is_parlay) {
        if (!match_date || !odds || !stake || !pick_type_id || !selections?.length) {
            return res.status(400).json({ error: "Faltan campos obligatorios para el parlay" });
        }
        // Validamos cada selección para que al editar no se pierdan datos del bot.
        const validation = validarSeleccionesParlay(selections);
        // Si falta un dato clave, bloqueamos el guardado con mensaje claro.
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error || "Selecciones de parlay inválidas" });
        }
        // Guardamos solamente las selecciones ya normalizadas.
        seleccionesParlayNormalizadas = validation.selections;
    }
    else {
        if (!match_date || !league_id || !match_name || !pick || !odds || !stake || !pick_type_id) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }
    }
    try {
        // Antes de actualizar, obtenemos el tipo actual para detectar cambios.
        let oldPickTypeId = null;
        try {
            const [currentPick] = await pool.query("SELECT pick_type_id FROM picks WHERE id = ?", [id]);
            if (currentPick && currentPick.length > 0) {
                oldPickTypeId = currentPick[0].pick_type_id;
            }
        }
        catch (e) {
            console.warn("[PICKS] No se pudo obtener el pick anterior para notificación:", e);
        }
        // Obtenemos el slug del tipo para el campo legacy
        const [tipos] = await pool.query("SELECT slug FROM pick_types WHERE id = ?", [pick_type_id]);
        const slugTipo = tipos.length > 0 ? tipos[0].slug : "free";
        // Convertimos la fecha de Colombia a UTC
        const fechaColombia = new Date(match_date + ":00-05:00");
        const fechaFormateada = fechaColombia.toISOString().slice(0, 19).replace("T", " ");
        // Actualizamos el pick en la base de datos
        await pool.query(`UPDATE picks SET 
       match_date = ?, league_id = ?, match_name = ?, pick = ?, odds = ?, 
       stake = ?, pick_type_id = ?, analysis = ?, is_parlay = ?, 
       selections = ?, league = ?, pick_type = ?, home_team_id = ?, away_team_id = ?,
       api_fixture_id = ?, thesportsdb_event_id = ?, auto_update = ?,
       score_home = ?, score_away = ?
       WHERE id = ?`, [
            fechaFormateada,
            is_parlay ? null : league_id,
            is_parlay ? "Parlay" : match_name,
            is_parlay ? "Parlay" : pick,
            odds, stake, pick_type_id,
            analysis || null,
            is_parlay ? true : false,
            is_parlay ? JSON.stringify(seleccionesParlayNormalizadas) : null,
            is_parlay ? "Parlay" : "",
            slugTipo,
            is_parlay ? null : (req.body.home_team || null),
            is_parlay ? null : (req.body.away_team || null),
            req.body.api_fixture_id ? Number(req.body.api_fixture_id) : null,
            req.body.thesportsdb_event_id || null,
            req.body.auto_update !== undefined ? (req.body.auto_update ? 1 : 0) : 1,
            req.body.score_home !== undefined ? req.body.score_home : null,
            req.body.score_away !== undefined ? req.body.score_away : null,
            id,
        ]);
        // Si el tipo de pick cambió, notificamos al nuevo canal correspondiente.
        // Esto es útil cuando el administrador se equivoca de plan y lo corrige.
        if (oldPickTypeId && String(oldPickTypeId) !== String(pick_type_id)) {
            try {
                const pickTelegram = await obtenerPickParaTelegram(id);
                const channelIds = pickTelegram ? await obtenerCanalesTelegramParaPick(pickTelegram) : [];
                if (pickTelegram && channelIds.length > 0) {
                    const mensaje = formatPickParaTelegram(pickTelegram);
                    for (const channelId of channelIds) {
                        await sendTelegramMessage(channelId, mensaje);
                    }
                }
            }
            catch (tgErr) {
                console.error("[PICKS] Error enviando a Telegram tras cambio de tipo:", tgErr);
            }
        }
        return res.json({ message: "Pick actualizado exitosamente" });
    }
    catch (error) {
        console.error("[PICKS] Error actualizando pick:", error);
        return res.status(500).json({ error: "Error al actualizar el pick", details: error.message });
    }
});
// ─── POST /api/picks/:id/resend-telegram ─────────────────────────────────────
/**
 * Reenvía manualmente la notificación de un pick a Telegram.
 * Útil cuando el administrador necesita reenviar tras una corrección manual.
 */
router.post("/:id/resend-telegram", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const pickTelegram = await obtenerPickParaTelegram(id);
        if (!pickTelegram) {
            return res.status(404).json({ error: "Pick no encontrado" });
        }
        const channelIds = await obtenerCanalesTelegramParaPick(pickTelegram);
        if (channelIds.length === 0) {
            return res.status(400).json({ error: "Este plan no tiene canales de Telegram configurados o el pick no pertenece a un plan con notificaciones." });
        }
        const mensaje = formatPickParaTelegram(pickTelegram);
        let successCount = 0;
        for (const channelId of channelIds) {
            const enviado = await sendTelegramMessage(channelId, mensaje);
            if (enviado)
                successCount++;
        }
        if (successCount === 0) {
            return res.status(500).json({ error: "No se pudo enviar el mensaje a Telegram. Verifica la configuración del bot." });
        }
        return res.json({ message: `Notificación reenviada a ${successCount} canal(es).` });
    }
    catch (error) {
        console.error("[PICKS] Error reenviando pick a Telegram:", error);
        return res.status(500).json({ error: "Error interno al reenviar a Telegram" });
    }
});
// ─── PATCH /api/picks/bulk/status ────────────────────────────────────────────
/**
 * Actualiza el estado de múltiples picks a la vez.
 * Solo administradores. Notifica los resultados por Telegram.
 */
router.patch("/bulk/status", authenticateToken, requireAdmin, async (req, res) => {
    const { pickIds, status } = req.body;
    // Validamos que se hayan proporcionado IDs válidos
    if (!pickIds || !Array.isArray(pickIds) || pickIds.length === 0) {
        return res.status(400).json({ error: "No se proporcionaron IDs válidos" });
    }
    // Validamos el estado para que estadísticas y badges sigan siendo consistentes.
    if (!ESTADOS_PERMITIDOS.has(String(status))) {
        return res.status(400).json({ error: "Estado de pick no permitido" });
    }
    try {
        // Construimos los placeholders dinámicamente para el IN clause
        const placeholders = pickIds.map(() => "?").join(",");
        // Consultamos los picks para ver cuáles son parleys
        const [rows] = await pool.query(`SELECT id, is_parlay, selections FROM picks WHERE id IN (${placeholders})`, pickIds);
        // Actualizamos los picks, aplicando el nuevo estado a las selecciones si es un parlay
        for (const row of rows) {
            if (row.is_parlay) {
                let selections = [];
                try {
                    selections = typeof row.selections === "string" ? JSON.parse(row.selections) : row.selections;
                }
                catch (e) {
                    selections = [];
                }
                if (status !== "pending" && Array.isArray(selections)) {
                    selections = selections.map((sel) => {
                        if (!sel.status || sel.status === "pending") {
                            return { ...sel, status: status };
                        }
                        return sel;
                    });
                }
                await pool.query("UPDATE picks SET status = ?, selections = ? WHERE id = ?", [status, JSON.stringify(selections), row.id]);
            }
            else {
                await pool.query("UPDATE picks SET status = ? WHERE id = ?", [status, row.id]);
            }
        }
        // Notificamos cada pick actualizado sin bloquear la respuesta si Telegram falla.
        for (const pickId of pickIds) {
            try {
                // Enviamos el resultado con formato normal o parlay corto según corresponda.
                await notificarResultadoPickPorTelegram(pickId);
            }
            catch (tgErr) {
                // El error de Telegram no debe revertir la actualización masiva.
                console.error("[PICKS] Error de Telegram en actualización masiva:", tgErr);
            }
        }
        return res.json({ message: "Estados actualizados exitosamente" });
    }
    catch (error) {
        console.error("[PICKS] Error actualizando estados masivos:", error);
        return res.status(500).json({ error: "Error al actualizar los estados" });
    }
});
// ─── PATCH /api/picks/:id/status ─────────────────────────────────────────────
/**
 * Actualiza solo el estado de un pick (won, lost, void, pending, half-won, half-lost).
 * Solo administradores. Notifica el resultado por Telegram.
 */
router.patch("/:id/status", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    // Validamos el estado antes de tocar la base de datos.
    if (!ESTADOS_PERMITIDOS.has(String(status))) {
        return res.status(400).json({ error: "Estado de pick no permitido" });
    }
    try {
        // Leemos el pick actual para saber si es un parlay y actualizar sus selecciones si es necesario.
        const [rows] = await pool.query("SELECT is_parlay, selections FROM picks WHERE id = ?", [id]);
        if (rows && rows.length > 0 && rows[0].is_parlay) {
            let selections = [];
            try {
                selections = typeof rows[0].selections === "string" ? JSON.parse(rows[0].selections) : rows[0].selections;
            }
            catch (e) {
                selections = [];
            }
            // Si el estado forzado no es 'pending', forzamos las selecciones pendientes al mismo estado 
            // para que el cron no siga reabriendo el parlay.
            if (status !== "pending" && Array.isArray(selections)) {
                selections = selections.map((sel) => {
                    if (!sel.status || sel.status === "pending") {
                        return { ...sel, status: status };
                    }
                    return sel;
                });
            }
            await pool.query("UPDATE picks SET status = ?, selections = ? WHERE id = ?", [status, JSON.stringify(selections), id]);
        }
        else {
            // Pick simple
            await pool.query("UPDATE picks SET status = ? WHERE id = ?", [status, id]);
        }
        // Notificamos el cambio de resultado por Telegram
        try {
            // Enviamos el resultado con formato normal o parlay corto según corresponda.
            await notificarResultadoPickPorTelegram(id);
        }
        catch (tgErr) {
            console.error("[PICKS] Error de Telegram actualizando estado:", tgErr);
        }
        return res.json({ message: "Estado actualizado exitosamente" });
    }
    catch (error) {
        console.error("[PICKS] Error actualizando estado:", error);
        return res.status(500).json({ error: "Error al actualizar el estado" });
    }
});
// ─── POST /api/picks/:id/manual-resolution ───────────────────────────────────
/**
 * <summary>
 * Permite cargar marcador y estadísticas manuales, obtener una sugerencia automática
 * y confirmar manualmente el estado final de un pick individual o un parlay.
 * </summary>
 */
router.post("/:id/manual-resolution", authenticateToken, requireAdmin, async (req, res) => {
    // Leemos el ID del pick desde la URL.
    const { id } = req.params;
    // Leemos las estadísticas manuales opcionales y el estado final opcional.
    const { score_home, score_away, corners_total, corners_home, corners_away, yellow_cards_total, yellow_cards_home, yellow_cards_away, final_status, selections, } = req.body || {};
    try {
        // Cargamos el pick con el mercado legible para que la sugerencia sea precisa.
        const [rows] = await pool.query(`SELECT p.id, p.match_name, p.pick, p.status, p.is_parlay, p.selections, p.score_home, p.score_away,
              p.corners_total, p.corners_home, p.corners_away,
              p.yellow_cards_total, p.yellow_cards_home, p.yellow_cards_away,
              m.label AS market_label, m.acronym AS market_acronym
       FROM picks p
       LEFT JOIN markets m ON p.pick = m.id
       WHERE p.id = ?
       LIMIT 1`, [id]);
        // Validamos que el pick exista.
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: "Pick no encontrado" });
        }
        // Tomamos la fila única del pick consultado.
        const pick = rows[0];
        // Si es un parlay, resolvemos cada selección por separado y luego calculamos el estado global.
        if (Boolean(pick.is_parlay)) {
            // Parseamos las selecciones existentes guardadas en el pick.
            const existingSelections = parseSeleccionesParlay(pick.selections);
            // Validamos que el parlay tenga selecciones reales.
            if (existingSelections.length === 0) {
                return res.status(400).json({ error: "El parlay no tiene selecciones guardadas para resolver." });
            }
            // Normalizamos las selecciones recibidas desde el modal.
            const incomingSelections = Array.isArray(selections) ? selections : [];
            // Calculamos la sugerencia y los valores finales por cada selección.
            const evaluatedSelections = existingSelections.map((existingSelection, index) => {
                // Tomamos la selección editable enviada por el panel si existe.
                const incomingSelection = incomingSelections[index] || {};
                // Combinamos la selección persistida con los valores nuevos.
                const mergedSelection = { ...existingSelection, ...incomingSelection };
                // Parseamos marcador manual o reutilizamos el guardado.
                const selectionScoreHome = parseOptionalInteger(incomingSelection.score_home) !== null ? parseOptionalInteger(incomingSelection.score_home) : parseOptionalInteger(existingSelection.score_home);
                const selectionScoreAway = parseOptionalInteger(incomingSelection.score_away) !== null ? parseOptionalInteger(incomingSelection.score_away) : parseOptionalInteger(existingSelection.score_away);
                // Parseamos córners manuales o reutilizamos los guardados.
                const selectionCornersHome = parseOptionalInteger(incomingSelection.corners_home) !== null ? parseOptionalInteger(incomingSelection.corners_home) : parseOptionalInteger(existingSelection.corners_home);
                const selectionCornersAway = parseOptionalInteger(incomingSelection.corners_away) !== null ? parseOptionalInteger(incomingSelection.corners_away) : parseOptionalInteger(existingSelection.corners_away);
                const selectionCornersTotal = parseOptionalInteger(incomingSelection.corners_total) !== null
                    ? parseOptionalInteger(incomingSelection.corners_total)
                    : (parseOptionalInteger(incomingSelection.corners_home) !== null || parseOptionalInteger(incomingSelection.corners_away) !== null)
                        ? resolveManualTotal(null, selectionCornersHome, selectionCornersAway)
                        : resolveManualTotal(parseOptionalInteger(existingSelection.corners_total), selectionCornersHome, selectionCornersAway);
                // Parseamos amarillas manuales o reutilizamos los datos guardados.
                const selectionYellowCardsHome = parseOptionalInteger(incomingSelection.yellow_cards_home) !== null ? parseOptionalInteger(incomingSelection.yellow_cards_home) : parseOptionalInteger(existingSelection.yellow_cards_home);
                const selectionYellowCardsAway = parseOptionalInteger(incomingSelection.yellow_cards_away) !== null ? parseOptionalInteger(incomingSelection.yellow_cards_away) : parseOptionalInteger(existingSelection.yellow_cards_away);
                const selectionYellowCardsTotal = parseOptionalInteger(incomingSelection.yellow_cards_total) !== null
                    ? parseOptionalInteger(incomingSelection.yellow_cards_total)
                    : (parseOptionalInteger(incomingSelection.yellow_cards_home) !== null || parseOptionalInteger(incomingSelection.yellow_cards_away) !== null)
                        ? resolveManualTotal(null, selectionYellowCardsHome, selectionYellowCardsAway)
                        : resolveManualTotal(parseOptionalInteger(existingSelection.yellow_cards_total), selectionYellowCardsHome, selectionYellowCardsAway);
                // Resolvemos el mercado de la selección para el motor de reglas.
                const selectionMarketReference = getManualMarketReference(mergedSelection);
                // Calculamos sugerencia individual para la selección.
                const suggestedSelectionStatus = getSuggestedManualStatus(selectionMarketReference, selectionScoreHome, selectionScoreAway, selectionCornersHome, selectionCornersAway, selectionYellowCardsHome, selectionYellowCardsAway, `manual-${pick.id}-selection-${index + 1}`);
                // Construimos una razón corta para la selección puntual.
                const suggestedSelectionReason = buildManualResolutionReason(selectionMarketReference, selectionScoreHome, selectionScoreAway, selectionCornersTotal, selectionYellowCardsTotal, suggestedSelectionStatus);
                // Si el admin confirmó un estado individual válido, lo respetamos; de lo contrario usamos la sugerencia.
                const finalSelectionStatus = ESTADOS_PERMITIDOS.has(String(incomingSelection.final_status || ""))
                    ? String(incomingSelection.final_status)
                    : suggestedSelectionStatus;
                // Preparamos la selección que se guardará en el JSON del parlay.
                const persistedSelection = {
                    ...mergedSelection,
                    score_home: selectionScoreHome,
                    score_away: selectionScoreAway,
                    corners_total: selectionCornersTotal,
                    corners_home: selectionCornersHome,
                    corners_away: selectionCornersAway,
                    yellow_cards_total: selectionYellowCardsTotal,
                    yellow_cards_home: selectionYellowCardsHome,
                    yellow_cards_away: selectionYellowCardsAway,
                    status: finalSelectionStatus,
                };
                // Preparamos una versión amigable para el modal.
                const responseSelection = {
                    match_name: mergedSelection.match_name || `Selección ${index + 1}`,
                    market_label: mergedSelection.market_label || selectionMarketReference || "Mercado",
                    market_reference: selectionMarketReference,
                    suggested_status: suggestedSelectionStatus,
                    suggested_reason: suggestedSelectionReason,
                    final_status: finalSelectionStatus,
                    manual_values: {
                        score_home: selectionScoreHome,
                        score_away: selectionScoreAway,
                        corners_total: selectionCornersTotal,
                        corners_home: selectionCornersHome,
                        corners_away: selectionCornersAway,
                        yellow_cards_total: selectionYellowCardsTotal,
                        yellow_cards_home: selectionYellowCardsHome,
                        yellow_cards_away: selectionYellowCardsAway,
                    },
                };
                // Devolvemos ambas versiones para usar en preview y persistencia.
                return { persistedSelection, responseSelection };
            });
            // Calculamos la sugerencia global del parlay a partir de las selecciones sugeridas.
            const suggestedParlayStatus = aggregateParlaySuggestedStatus(evaluatedSelections.map((selection) => selection.responseSelection.suggested_status));
            // Construimos una razón legible a nivel del parlay completo.
            const suggestedParlayReason = buildParlayManualSuggestedReason(evaluatedSelections.map((selection) => selection.responseSelection), suggestedParlayStatus);
            // Si aún no hay estado final global, respondemos solo con la sugerencia.
            if (final_status === null || final_status === undefined || String(final_status).trim() === "") {
                return res.json({
                    message: "Sugerencia de parlay calculada exitosamente",
                    suggested_status: suggestedParlayStatus,
                    suggested_reason: suggestedParlayReason,
                    selections: evaluatedSelections.map((selection) => selection.responseSelection),
                });
            }
            // Validamos el estado final global antes de guardar.
            if (!ESTADOS_PERMITIDOS.has(String(final_status))) {
                return res.status(400).json({ error: "Estado final no permitido" });
            }
            // Guardamos estados manuales por selección y el estado final global del parlay.
            await pool.query(`UPDATE picks
         SET selections = ?, status = ?
         WHERE id = ?`, [
                JSON.stringify(evaluatedSelections.map((selection) => selection.persistedSelection)),
                final_status,
                id,
            ]);
            // Intentamos notificar el resultado final por Telegram sin bloquear el guardado.
            try {
                // Publicamos con el mismo flujo actual de notificaciones.
                await notificarResultadoPickPorTelegram(id);
            }
            catch (tgErr) {
                // Telegram no debe impedir que el parlay quede guardado.
                console.error("[PICKS] Error de Telegram en resolución manual de parlay:", tgErr);
            }
            // Respondemos con el resultado final ya consolidado.
            return res.json({
                message: "Resolución manual del parlay guardada exitosamente",
                suggested_status: suggestedParlayStatus,
                suggested_reason: suggestedParlayReason,
                final_status,
                selections: evaluatedSelections.map((selection) => selection.responseSelection),
            });
        }
        // Parseamos marcador manual o reutilizamos el dato ya guardado.
        const parsedScoreHome = parseOptionalInteger(score_home);
        const parsedScoreAway = parseOptionalInteger(score_away);
        // Parseamos córners manuales o reutilizamos los existentes.
        const parsedCornersTotal = parseOptionalInteger(corners_total);
        const parsedCornersHome = parseOptionalInteger(corners_home);
        const parsedCornersAway = parseOptionalInteger(corners_away);
        // Parseamos amarillas manuales o reutilizamos las existentes.
        const parsedYellowCardsTotal = parseOptionalInteger(yellow_cards_total);
        const parsedYellowCardsHome = parseOptionalInteger(yellow_cards_home);
        const parsedYellowCardsAway = parseOptionalInteger(yellow_cards_away);
        // Consolidamos el marcador final que usará la sugerencia.
        const resolvedScoreHome = parsedScoreHome !== null ? parsedScoreHome : parseOptionalInteger(pick.score_home);
        const resolvedScoreAway = parsedScoreAway !== null ? parsedScoreAway : parseOptionalInteger(pick.score_away);
        // Leemos los totales ya guardados para usarlos solo cuando no hubo cambios manuales.
        const storedCornersTotal = parseOptionalInteger(pick.corners_total);
        // Leemos las amarillas totales ya guardadas para usarlas solo como fallback.
        const storedYellowCardsTotal = parseOptionalInteger(pick.yellow_cards_total);
        // Consolidamos córners totales y parciales.
        const resolvedCornersHome = parsedCornersHome !== null ? parsedCornersHome : parseOptionalInteger(pick.corners_home);
        const resolvedCornersAway = parsedCornersAway !== null ? parsedCornersAway : parseOptionalInteger(pick.corners_away);
        const resolvedCornersTotal = parsedCornersTotal !== null
            ? parsedCornersTotal
            : (parsedCornersHome !== null || parsedCornersAway !== null)
                ? resolveManualTotal(null, resolvedCornersHome, resolvedCornersAway)
                : resolveManualTotal(storedCornersTotal, resolvedCornersHome, resolvedCornersAway);
        // Consolidamos amarillas totales y parciales.
        const resolvedYellowCardsHome = parsedYellowCardsHome !== null ? parsedYellowCardsHome : parseOptionalInteger(pick.yellow_cards_home);
        const resolvedYellowCardsAway = parsedYellowCardsAway !== null ? parsedYellowCardsAway : parseOptionalInteger(pick.yellow_cards_away);
        const resolvedYellowCardsTotal = parsedYellowCardsTotal !== null
            ? parsedYellowCardsTotal
            : (parsedYellowCardsHome !== null || parsedYellowCardsAway !== null)
                ? resolveManualTotal(null, resolvedYellowCardsHome, resolvedYellowCardsAway)
                : resolveManualTotal(storedYellowCardsTotal, resolvedYellowCardsHome, resolvedYellowCardsAway);
        // Construimos el texto de mercado que entiende el motor de reglas.
        const marketReference = getManualMarketReference(pick);
        // Calculamos la sugerencia individual con el helper compartido.
        const suggestedStatus = getSuggestedManualStatus(marketReference, resolvedScoreHome, resolvedScoreAway, resolvedCornersHome, resolvedCornersAway, resolvedYellowCardsHome, resolvedYellowCardsAway, `manual-${pick.id}`);
        // Construimos una explicación clara para el modal del admin.
        const suggestedReason = buildManualResolutionReason(marketReference, resolvedScoreHome, resolvedScoreAway, resolvedCornersTotal, resolvedYellowCardsTotal, suggestedStatus);
        // Si el admin no confirmó aún un estado final, devolvemos solo la sugerencia.
        if (final_status === null || final_status === undefined || String(final_status).trim() === "") {
            return res.json({
                message: "Sugerencia calculada exitosamente",
                suggested_status: suggestedStatus,
                suggested_reason: suggestedReason,
                manual_values: {
                    score_home: resolvedScoreHome,
                    score_away: resolvedScoreAway,
                    corners_total: resolvedCornersTotal,
                    corners_home: resolvedCornersHome,
                    corners_away: resolvedCornersAway,
                    yellow_cards_total: resolvedYellowCardsTotal,
                    yellow_cards_home: resolvedYellowCardsHome,
                    yellow_cards_away: resolvedYellowCardsAway,
                },
            });
        }
        // Validamos el estado final para mantener consistencia con badges y métricas.
        if (!ESTADOS_PERMITIDOS.has(String(final_status))) {
            return res.status(400).json({ error: "Estado final no permitido" });
        }
        // Persistimos estadísticas manuales y el estado elegido por el admin.
        await pool.query(`UPDATE picks
       SET score_home = ?, score_away = ?, corners_total = ?, corners_home = ?, corners_away = ?,
           yellow_cards_total = ?, yellow_cards_home = ?, yellow_cards_away = ?, status = ?
       WHERE id = ?`, [
            resolvedScoreHome,
            resolvedScoreAway,
            resolvedCornersTotal,
            resolvedCornersHome,
            resolvedCornersAway,
            resolvedYellowCardsTotal,
            resolvedYellowCardsHome,
            resolvedYellowCardsAway,
            final_status,
            id,
        ]);
        // Notificamos Telegram con el estado final confirmado por el admin.
        try {
            // Enviamos la notificación final con el mismo flujo existente.
            await notificarResultadoPickPorTelegram(id);
        }
        catch (tgErr) {
            // Telegram no debe impedir que la decisión quede guardada.
            console.error("[PICKS] Error de Telegram en resolución manual:", tgErr);
        }
        // Respondemos con el guardado final y la sugerencia usada como apoyo.
        return res.json({
            message: "Resolución manual guardada exitosamente",
            suggested_status: suggestedStatus,
            suggested_reason: suggestedReason,
            final_status,
        });
    }
    catch (error) {
        console.error("[PICKS] Error en resolución manual asistida:", error);
        return res.status(500).json({ error: "Error al resolver manualmente el pick" });
    }
});
// ─── POST /api/picks/:id/tracking ────────────────────────────────────────────
/**
 * Añade un mensaje de seguimiento a un pick (para informar actualizaciones).
 * Solo administradores.
 */
router.post("/:id/tracking", authenticateToken, requireAdmin, async (req, res) => {
    const { message } = req.body;
    const pickId = req.params.id;
    // El mensaje es obligatorio para el tracking
    if (!message) {
        return res.status(400).json({ error: "El mensaje es obligatorio" });
    }
    try {
        const [resultado] = await pool.query("INSERT INTO pick_tracking (pick_id, message) VALUES (?, ?)", [pickId, message]);
        // Notificamos el seguimiento por Telegram cuando el canal del plan está configurado.
        try {
            // Cargamos el pick asociado al seguimiento con nombres legibles.
            const pick = await obtenerPickParaTelegram(pickId);
            // Resolvemos los canales del plan para publicar la actualización.
            const channelIds = pick ? await obtenerCanalesTelegramParaPick(pick) : [];
            // Enviamos el mensaje de seguimiento solo si existen canales configurados.
            if (pick && channelIds.length > 0) {
                const mensajeTelegram = formatSeguimientoParaTelegram(pick, message);
                // Publicamos el seguimiento en todos los canales correspondientes.
                for (const channelId of channelIds) {
                    await sendTelegramMessage(channelId, mensajeTelegram);
                }
            }
        }
        catch (tgErr) {
            // El error de Telegram no debe impedir que el seguimiento quede guardado.
            console.error("[PICKS] Error de Telegram añadiendo seguimiento:", tgErr);
        }
        return res.status(201).json({
            id: resultado.insertId,
            message: "Seguimiento añadido",
        });
    }
    catch (error) {
        console.error("[PICKS] Error añadiendo tracking:", error);
        return res.status(500).json({ error: "Error al añadir seguimiento", details: error.message });
    }
});
// ─── DELETE /api/picks/:id ───────────────────────────────────────────────────
/**
 * Elimina un pick individual por su ID.
 * Solo administradores.
 */
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM picks WHERE id = ?", [id]);
        return res.json({ message: "Pick eliminado exitosamente" });
    }
    catch (error) {
        console.error("[PICKS] Error eliminando pick:", error);
        return res.status(500).json({ error: "Error al eliminar el pick" });
    }
});
// ─── POST /api/picks/bulk/delete ─────────────────────────────────────────────
/**
 * Elimina múltiples picks a la vez.
 * Solo administradores.
 */
router.post("/bulk/delete", authenticateToken, requireAdmin, async (req, res) => {
    const { pickIds } = req.body;
    if (!pickIds || !Array.isArray(pickIds) || pickIds.length === 0) {
        return res.status(400).json({ error: "No se proporcionaron IDs válidos" });
    }
    try {
        const placeholders = pickIds.map(() => "?").join(",");
        await pool.query(`DELETE FROM picks WHERE id IN (${placeholders})`, pickIds);
        return res.json({ message: "Picks eliminados exitosamente" });
    }
    catch (error) {
        console.error("[PICKS] Error eliminando picks masivos:", error);
        return res.status(500).json({ error: "Error al eliminar los picks" });
    }
});
// Exportamos el router
export default router;
