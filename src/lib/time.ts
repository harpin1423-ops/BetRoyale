/**
 * @file time.ts
 * @description Helpers para mostrar horarios oficiales BetRoyale y horarios locales del usuario.
 */

// Zona horaria oficial de operación de BetRoyale.
export const BETROYALE_TIME_ZONE = "America/Bogota";

// Etiqueta pública que BetRoyale usa para Colombia.
export const BETROYALE_TIME_LABEL = "COL (GMT-5)";

// Patrón para detectar fechas que ya traen zona horaria explícita.
const EXPLICIT_TIME_ZONE_PATTERN = /(?:z|[+-]\d{2}:?\d{2})$/i;

// Patrón para detectar DATETIME de MySQL o datetime-local sin zona horaria.
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;

/**
 * @summary Obtiene la zona horaria del navegador de forma segura.
 * @returns Zona horaria IANA del usuario o la zona oficial de BetRoyale como fallback.
 */
export function getUserTimeZone(): string {
  // Validamos que el código esté corriendo en navegador antes de consultar Intl.
  if (typeof Intl === "undefined") return BETROYALE_TIME_ZONE;

  // Leemos la zona horaria configurada en el dispositivo del usuario.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Devolvemos la zona del usuario o Colombia si el navegador no la reporta.
  return timeZone || BETROYALE_TIME_ZONE;
}

/**
 * @summary Convierte fechas de picks a una fecha absoluta sin perder la referencia Colombia.
 * @param value - Fecha recibida desde backend, MySQL, JSON o selecciones de parlay.
 * @returns Date absoluta lista para formatear por zona horaria.
 */
export function parseBetRoyaleDate(value: unknown): Date | null {
  // Evitamos procesar valores vacíos.
  if (value === null || value === undefined) return null;

  // Reutilizamos instancias Date válidas cuando ya vienen normalizadas.
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  // Convertimos el valor a texto para normalizarlo.
  const text = String(value).trim();

  // Evitamos procesar cadenas vacías.
  if (!text) return null;

  // Parseamos directamente fechas ISO o strings con offset explícito.
  if (EXPLICIT_TIME_ZONE_PATTERN.test(text)) {
    // Construimos la fecha absoluta respetando la zona original del string.
    const parsed = new Date(text);

    // Devolvemos null si el navegador no pudo interpretar la fecha.
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Buscamos fechas sin zona horaria guardadas como hora oficial Colombia.
  const localMatch = text.match(LOCAL_DATE_TIME_PATTERN);

  // Convertimos hora Colombia a fecha absoluta usando offset fijo GMT-5.
  if (localMatch) {
    // Leemos el año desde el match de fecha local.
    const year = localMatch[1];

    // Leemos el mes desde el match de fecha local.
    const month = localMatch[2];

    // Leemos el día desde el match de fecha local.
    const day = localMatch[3];

    // Leemos la hora desde el match de fecha local.
    const hour = localMatch[4];

    // Leemos los minutos desde el match de fecha local.
    const minute = localMatch[5];

    // Usamos segundos explícitos o cero cuando vienen desde datetime-local.
    const second = localMatch[6] || "00";

    // Construimos una fecha absoluta equivalente a la hora Colombia.
    const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-05:00`);

    // Devolvemos null si el navegador no pudo interpretar la fecha.
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Intentamos un parseo final para valores legacy ya absolutos.
  const fallback = new Date(text);

  // Devolvemos la fecha si es válida o null si no lo es.
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * @summary Formatea una fecha en una zona horaria específica.
 * @param value - Fecha que se desea formatear.
 * @param timeZone - Zona horaria IANA que se debe usar.
 * @returns Fecha legible o guion cuando el valor no es válido.
 */
export function formatDateInTimeZone(value: unknown, timeZone: string): string {
  // Normalizamos el valor a fecha absoluta.
  const date = parseBetRoyaleDate(value);

  // Devolvemos un fallback legible si la fecha no existe.
  if (!date) return "-";

  // Formateamos la fecha con convención latina y zona indicada.
  return new Intl.DateTimeFormat("es-CO", {
    // Aplicamos la zona horaria solicitada.
    timeZone,
    // Mostramos día con dos dígitos para lectura rápida.
    day: "2-digit",
    // Mostramos mes corto para ahorrar espacio.
    month: "short",
    // Mostramos año numérico para evitar ambigüedad.
    year: "numeric",
  }).format(date);
}

/**
 * @summary Formatea solo la hora en una zona horaria específica.
 * @param value - Fecha que se desea formatear.
 * @param timeZone - Zona horaria IANA que se debe usar.
 * @returns Hora HH:mm o guion cuando el valor no es válido.
 */
export function formatTimeInTimeZone(value: unknown, timeZone: string): string {
  // Normalizamos el valor a fecha absoluta.
  const date = parseBetRoyaleDate(value);

  // Devolvemos un fallback legible si la fecha no existe.
  if (!date) return "--:--";

  // Formateamos la hora con ciclo 24h para evitar AM/PM.
  return new Intl.DateTimeFormat("es-CO", {
    // Aplicamos la zona horaria solicitada.
    timeZone,
    // Mostramos hora con dos dígitos.
    hour: "2-digit",
    // Mostramos minuto con dos dígitos.
    minute: "2-digit",
    // Usamos formato 00-23.
    hourCycle: "h23",
  }).format(date);
}

/**
 * @summary Obtiene una etiqueta corta de zona horaria para el usuario.
 * @param value - Fecha usada para resolver abreviaturas sensibles a la fecha.
 * @param timeZone - Zona horaria IANA que se desea describir.
 * @returns Etiqueta corta como GMT-6, COT o nombre IANA simplificado.
 */
export function formatTimeZoneShort(value: unknown, timeZone: string): string {
  // Normalizamos el valor a fecha absoluta.
  const date = parseBetRoyaleDate(value) || new Date();

  // Obtenemos las partes formateadas incluyendo timeZoneName.
  const parts = new Intl.DateTimeFormat("es-CO", {
    // Aplicamos la zona horaria solicitada.
    timeZone,
    // Solicitamos una hora mínima para que Intl incluya la zona.
    hour: "2-digit",
    // Pedimos nombre corto para no ocupar mucho espacio.
    timeZoneName: "short",
  }).formatToParts(date);

  // Buscamos la parte que contiene el nombre de la zona horaria.
  const zoneName = parts.find((part) => part.type === "timeZoneName")?.value;

  // Devolvemos el nombre corto o la zona IANA limpia como respaldo.
  return zoneName || timeZone.replace(/_/g, " ");
}

/**
 * @summary Formatea la fecha oficial BetRoyale.
 * @param value - Fecha del pick o selección.
 * @returns Fecha oficial en Colombia.
 */
export function formatBetRoyaleDate(value: unknown): string {
  // Delegamos el formato a la zona oficial del proyecto.
  return formatDateInTimeZone(value, BETROYALE_TIME_ZONE);
}

/**
 * @summary Formatea la hora oficial BetRoyale.
 * @param value - Fecha del pick o selección.
 * @returns Hora oficial en Colombia.
 */
export function formatBetRoyaleTime(value: unknown): string {
  // Delegamos el formato a la zona oficial del proyecto.
  return formatTimeInTimeZone(value, BETROYALE_TIME_ZONE);
}

/**
 * @summary Indica si conviene mostrar una hora local distinta a la hora BetRoyale.
 * @param value - Fecha usada para comparar hora oficial y hora local.
 * @returns true cuando la hora local del usuario difiere de Colombia.
 */
export function shouldShowUserLocalTime(value: unknown): boolean {
  // Obtenemos la zona horaria del navegador.
  const userTimeZone = getUserTimeZone();

  // Evitamos duplicar la misma zona horaria oficial.
  if (userTimeZone === BETROYALE_TIME_ZONE) return false;

  // Comparamos fecha y hora oficial contra fecha y hora local del usuario.
  const officialDateTime = `${formatDateInTimeZone(value, BETROYALE_TIME_ZONE)} ${formatTimeInTimeZone(value, BETROYALE_TIME_ZONE)}`;

  // Construimos la representación local del usuario.
  const localDateTime = `${formatDateInTimeZone(value, userTimeZone)} ${formatTimeInTimeZone(value, userTimeZone)}`;

  // Mostramos hora local solo si realmente cambia el resultado visible.
  return officialDateTime !== localDateTime;
}

/**
 * @summary Construye las etiquetas de hora oficial y hora local para un pick.
 * @param value - Fecha del pick o selección.
 * @returns Objeto con textos listos para pintar en la UI.
 */
export function getBetRoyaleTimeLabels(value: unknown) {
  // Obtenemos la zona horaria actual del usuario.
  const userTimeZone = getUserTimeZone();

  // Devolvemos etiquetas consistentes para todos los componentes de picks.
  return {
    // Fecha oficial del pick en Colombia.
    officialDate: formatBetRoyaleDate(value),
    // Hora oficial del pick en Colombia.
    officialTime: formatBetRoyaleTime(value),
    // Etiqueta oficial BetRoyale.
    officialZone: BETROYALE_TIME_LABEL,
    // Fecha local del usuario.
    localDate: formatDateInTimeZone(value, userTimeZone),
    // Hora local del usuario.
    localTime: formatTimeInTimeZone(value, userTimeZone),
    // Zona corta del usuario.
    localZone: formatTimeZoneShort(value, userTimeZone),
    // Bandera para evitar duplicar la misma hora.
    showLocal: shouldShowUserLocalTime(value),
  };
}
