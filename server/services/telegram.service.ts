/**
 * @file telegram.service.ts
 * @description Servicio de integración con el Bot de Telegram.
 * Maneja el envío de mensajes al canal configurado y el formato
 * de los picks para su presentación en Telegram (HTML).
 */

import { env } from "../config/env.js";

// ─── Tipos ───────────────────────────────────────────────────────────────────

/**
 * Estructura mínima de un pick para formatear el mensaje de Telegram.
 */
interface PickParaTelegram {
  /** ID del pick dentro de BetRoyale */
  id?: number | string;
  /** Fecha y hora del partido */
  match_date: string | Date;
  /** Nombre del partido (ej: "Real Madrid vs Barcelona") */
  match_name: string;
  /** Nombre de la liga */
  league: string;
  /** Nombre del país asociado a la liga */
  country_name?: string;
  /** Código ISO de bandera asociado al país */
  country_flag?: string;
  /** Nombre visible del plan del pick */
  pick_type_name?: string;
  /** Slug del tipo de pick para decidir la ruta pública/VIP */
  pick_type_slug?: string;
  /** Pronóstico elegido (ej: "1", "AEM", "+2.5") */
  pick: string;
  /** Etiqueta legible del mercado (ej: "Gana Local") */
  market_label?: string;
  /** Acrónimo corto del mercado (ej: "1") */
  market_acronym?: string;
  /** Cuota decimal del pick */
  odds: number | string;
  /** Stake sugerido sobre 10 */
  stake: number | string;
  /** Análisis generado por IA (opcional) */
  analysis?: string;
  /** Estado actual del pick: 'pending' | 'won' | 'lost' | 'void' */
  status: string;
  /** Indica si el pick es un parlay */
  is_parlay?: boolean | number;
  /** Selecciones enriquecidas del parlay */
  selections?: SeleccionTelegram[];
}

/**
 * Estructura enriquecida de una selección dentro de un parlay.
 */
interface SeleccionTelegram {
  /** Fecha y hora local de la selección */
  match_time?: string | Date;
  /** Partido de la selección */
  match_name?: string;
  /** Nombre de la liga */
  league_name?: string;
  /** Nombre del país */
  country_name?: string;
  /** Código ISO de bandera */
  country_flag?: string;
  /** Mercado legible */
  market_label?: string;
  /** Acrónimo del mercado */
  market_acronym?: string;
  /** Fallback del pick cuando no existe mercado */
  pick?: string;
  /** Cuota de la selección */
  odds?: number | string;
}

// ─── Funciones ───────────────────────────────────────────────────────────────

/**
 * Escapa texto dinámico antes de insertarlo en mensajes HTML de Telegram.
 *
 * @param value - Valor dinámico que puede venir del admin, la base de datos o APIs externas.
 * @returns Texto seguro para usar dentro de parse_mode HTML.
 */
export function escapeTelegramHtml(value: unknown): string {
  // Convertimos null/undefined en cadena vacía para evitar textos "undefined".
  const text = value === null || value === undefined ? "" : String(value);

  // Reemplazamos caracteres reservados de HTML para que Telegram no rompa el mensaje.
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convierte un código ISO de país en emoji de bandera para Telegram.
 *
 * @param value - Código ISO de dos letras o valor especial de región.
 * @returns Emoji de bandera o cadena vacía si no se puede resolver.
 */
function flagToEmoji(value: unknown): string {
  // Normalizamos el código guardado en la base de datos.
  const code = String(value || "").trim().toUpperCase();

  // Mapeamos regiones no nacionales a un símbolo global.
  if (["EU", "MUNDO", "EUROPA", "AMERICA", "ASIA", "OCEANIA"].includes(code)) {
    return "🌐";
  }

  // Solo los códigos ISO de dos letras se pueden convertir a bandera regional.
  if (!/^[A-Z]{2}$/.test(code)) {
    return "";
  }

  // Telegram renderiza estas dos letras regionales como una bandera.
  return [...code]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

/**
 * Formatea fecha y hora en horario Colombia.
 *
 * @param value - Fecha recibida desde MySQL o desde una selección del formulario.
 * @param source - Indica si la cadena sin zona horaria viene en UTC o ya en hora COL.
 * @returns Objeto con fecha y hora legibles para Telegram.
 */
function formatFechaHoraColombia(
  value: string | Date,
  source: "utc" | "col" = "utc"
): { fecha: string; hora: string } {
  // Convertimos Date directamente porque ya representa un instante absoluto.
  let date = value instanceof Date ? value : null;

  // Parseamos cadenas de MySQL o datetime-local cuando no viene como Date.
  if (!date) {
    // Normalizamos espacios de MySQL para poder construir una fecha válida.
    const text = String(value || "").trim().replace(" ", "T");

    // Si la fecha ya trae zona horaria, respetamos ese instante.
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);

    // Agregamos segundos si el input viene desde datetime-local.
    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)
      ? `${text}:00`
      : text;

    // MySQL guarda el match_date principal en UTC; las selecciones del parlay vienen en hora COL.
    date = new Date(
      hasTimezone
        ? normalized
        : source === "col"
          ? `${normalized}-05:00`
          : `${normalized}Z`
    );
  }

  // Si la fecha no se pudo parsear, devolvemos el valor original con contexto horario.
  if (Number.isNaN(date.getTime())) {
    return { fecha: escapeTelegramHtml(value), hora: "COL (GMT-5)" };
  }

  // Formateamos la fecha en America/Bogota para que el canal vea una fecha consistente.
  const fecha = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  // Formateamos la hora por separado como pidió el flujo editorial.
  const hora = `${new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)} COL (GMT-5)`;

  // Devolvemos campos separados para imprimir líneas independientes.
  return { fecha, hora };
}

/**
 * Construye una etiqueta profesional de liga con bandera y país.
 *
 * @param pick - Pick o selección con liga, país y bandera.
 * @returns Texto legible para la línea de liga.
 */
function formatLigaConPais(pick: PickParaTelegram | SeleccionTelegram): string {
  // Convertimos el código ISO a emoji para hacer el mensaje más escaneable.
  const flag = flagToEmoji(pick.country_flag);

  // Escapamos textos administrativos antes de usarlos en HTML.
  const country = escapeTelegramHtml(pick.country_name);

  // Permitimos league o league_name según si viene de pick o de selección.
  const leagueSource =
    (pick as SeleccionTelegram).league_name || (pick as PickParaTelegram).league;

  // Escapamos la liga antes de incluirla en el HTML.
  const league = escapeTelegramHtml(leagueSource);

  // Combinamos bandera, país y liga sin duplicar separadores vacíos.
  return [flag, country, league].filter(Boolean).join(" · ");
}

/**
 * Construye una etiqueta de mercado con nombre y acrónimo.
 *
 * @param label - Nombre legible del mercado.
 * @param acronym - Acrónimo corto del mercado.
 * @param fallback - Valor original del pick si no existe mercado configurado.
 * @returns Mercado listo para mostrar en Telegram.
 */
function formatMercado(label?: unknown, acronym?: unknown, fallback?: unknown): string {
  // Normalizamos las tres fuentes posibles del pronóstico.
  const safeLabel = String(label || "").trim();
  const safeAcronym = String(acronym || "").trim();
  const safeFallback = String(fallback || "").trim();

  // Si tenemos nombre y acrónimo distinto, mostramos ambos.
  if (safeLabel && safeAcronym && safeLabel !== safeAcronym) {
    return `${escapeTelegramHtml(safeLabel)} (${escapeTelegramHtml(safeAcronym)})`;
  }

  // Si solo tenemos nombre, usamos el nombre.
  if (safeLabel) {
    return escapeTelegramHtml(safeLabel);
  }

  // Si solo tenemos acrónimo, usamos el acrónimo.
  if (safeAcronym) {
    return escapeTelegramHtml(safeAcronym);
  }

  // Fallback para picks legacy escritos como texto libre.
  return escapeTelegramHtml(safeFallback);
}

/**
 * Formatea el stake como unidades y porcentaje de banca.
 *
 * @param value - Stake del pick guardado en base de datos.
 * @returns Texto tipo "1 (1%)" para el canal.
 */
function formatStake(value: unknown): string {
  // Convertimos el stake a número para calcular el porcentaje equivalente.
  const stake = Number(value);

  // Si no es numérico, devolvemos el texto original escapado.
  if (!Number.isFinite(stake)) {
    return escapeTelegramHtml(value);
  }

  // Mostramos enteros sin decimales y decimales solo cuando hacen falta.
  const unidades = Number.isInteger(stake) ? stake.toString() : stake.toFixed(2);

  // En el sistema actual 1 unidad equivale a 1% de banca recomendada.
  const porcentaje = Number.isInteger(stake) ? stake.toString() : stake.toFixed(2);

  // Devolvemos el formato editorial solicitado para Telegram.
  return `${unidades} (${porcentaje}%)`;
}

/**
 * Calcula profit neto en unidades según estado, cuota y stake.
 *
 * @param pick - Pick con cuota, stake y estado.
 * @returns Profit neto formateado en unidades.
 */
function formatProfit(pick: PickParaTelegram): string {
  // Convertimos valores numéricos desde MySQL o JSON.
  const odds = Number(pick.odds) || 1;
  const stake = Number(pick.stake) || 0;

  // Calculamos el resultado financiero con reglas estándar de apuestas.
  let profit = 0;
  if (pick.status === "won") profit = stake * (odds - 1);
  if (pick.status === "lost") profit = -stake;
  if (pick.status === "half-won") profit = (stake / 2) * (odds - 1);
  if (pick.status === "half-lost") profit = -(stake / 2);

  // Los nulos no afectan el profit y se muestran como 0.00u.
  const sign = profit > 0 ? "+" : "";

  // Devolvemos formato corto y consistente para el canal.
  return `${sign}${profit.toFixed(2)}u`;
}

/**
 * Resuelve la ruta web principal para un pick.
 *
 * @param pick - Pick con slug de plan.
 * @returns URL de BetRoyale para seguir el pick en la plataforma.
 */
function getPickWebUrl(pick: PickParaTelegram): string {
  // Limpiamos APP_URL para evitar doble slash.
  const appUrl = env.APP_URL.replace(/\/$/, "");

  // Los picks free viven en la vista pública y los VIP en la zona privada.
  const path = pick.pick_type_slug === "free" ? "/free-picks" : "/vip-picks";

  // Devolvemos un link estable hacia la pantalla donde aparece el pick.
  return `${appUrl}${path}`;
}

/**
 * Indica si el link web debe mostrarse en Telegram.
 *
 * @returns true cuando APP_URL apunta a un entorno público.
 */
function shouldShowBetRoyaleLink(): boolean {
  // Mientras trabajamos localmente, ocultamos links que el usuario final no puede abrir.
  return !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(env.APP_URL);
}

/**
 * Envía un mensaje de texto formateado en HTML a un canal de Telegram.
 *
 * @param channelId - ID del canal o chat de Telegram (ej: "-100123456789")
 * @param message   - Mensaje en formato HTML que enviará el bot
 * @returns true si Telegram aceptó el mensaje; false si faltó configuración o la API falló.
 */
export async function sendTelegramMessage(
  channelId: string,
  message: string
): Promise<boolean> {
  // Verificamos que el token del bot y el channelId estén configurados
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !channelId) {
    console.warn("[TELEGRAM] Bot token o Channel ID no configurado. Omitiendo envío.");
    return false;
  }

  try {
    // Construimos la URL de la API de Telegram para enviar mensajes
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    // Hacemos la petición POST a la API de Telegram
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        /** ID del canal o usuario destino */
        chat_id: channelId,
        /** Contenido del mensaje */
        text: message,
        /** Modo de parseo: HTML permite usar <b>, <i>, etc. */
        parse_mode: "HTML",
      }),
    });

    // Parseamos la respuesta de Telegram
    const data = (await respuesta.json()) as { ok: boolean; description?: string };

    // Si Telegram reporta un error, lo registramos en consola
    if (!data.ok) {
      console.error("[TELEGRAM] Error de API:", data.description);
      return false;
    }

    // Confirmamos al llamador que el mensaje fue aceptado por Telegram
    return true;
  } catch (error) {
    // Error de red u otro error inesperado
    console.error("[TELEGRAM] Error al enviar mensaje:", error);
    return false;
  }
}

/**
 * Crea un enlace privado de invitación para un canal de Telegram.
 *
 * @param channelId - ID del canal privado donde el bot es administrador.
 * @param name - Nombre interno del enlace visible para administradores de Telegram.
 * @param expiresAt - Fecha exacta en la que Telegram debe vencer el enlace.
 * @returns Link de invitación privado, o null si Telegram no pudo crearlo.
 */
export async function createTelegramInviteLink(
  channelId: string,
  name: string,
  expiresAt: Date
): Promise<string | null> {
  // Verificamos que el token del bot y el canal estén configurados.
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !channelId) {
    console.warn("[TELEGRAM] Bot token o Channel ID no configurado. Omitiendo invite link.");
    return null;
  }

  // Telegram espera expire_date como Unix timestamp en segundos.
  const expireDate = Math.floor(expiresAt.getTime() / 1000);

  // Telegram limita el nombre del invite link; lo recortamos de forma segura.
  const safeName = String(name || "BetRoyale VIP").slice(0, 32);

  try {
    // Construimos la URL de la API de Telegram para crear links privados.
    const url = `https://api.telegram.org/bot${token}/createChatInviteLink`;

    // Hacemos la petición POST con límite de un solo ingreso para planes pagos.
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        /** ID del canal privado destino */
        chat_id: channelId,
        /** Nombre interno para identificar el link en Telegram */
        name: safeName,
        /** Fecha de expiración del enlace */
        expire_date: expireDate,
        /** Solo permite un ingreso con este link */
        member_limit: 1,
      }),
    });

    // Parseamos la respuesta de Telegram.
    const data = (await respuesta.json()) as {
      ok: boolean;
      description?: string;
      result?: { invite_link?: string };
    };

    // Si Telegram reporta un error, lo registramos sin exponer token ni datos sensibles.
    if (!data.ok || !data.result?.invite_link) {
      console.error("[TELEGRAM] Error creando invite link:", data.description);
      return null;
    }

    // Devolvemos el link privado para guardarlo y mostrarlo al usuario pago.
    return data.result.invite_link;
  } catch (error) {
    // Error de red u otro error inesperado al hablar con Telegram.
    console.error("[TELEGRAM] Error al crear invite link:", error);
    return null;
  }
}

/**
 * Revoca un link privado de invitación para que no queden enlaces VIP antiguos activos.
 *
 * @param channelId - ID del canal privado donde se revocará el invite.
 * @param inviteLink - Link de invitación que se desea invalidar.
 * @returns true si Telegram aceptó la revocación; false si falló o faltó configuración.
 */
export async function revokeTelegramInviteLink(
  channelId: string,
  inviteLink: string
): Promise<boolean> {
  // Verificamos que el token del bot, el canal y el link estén configurados.
  const token = env.TELEGRAM_BOT_TOKEN;

  // Sin datos completos no se puede revocar nada de forma segura.
  if (!token || !channelId || !inviteLink) {
    return false;
  }

  try {
    // Construimos la URL de la API de Telegram para revocar links privados.
    const url = `https://api.telegram.org/bot${token}/revokeChatInviteLink`;

    // Hacemos la petición POST para invalidar el link anterior.
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        /** ID del canal privado destino */
        chat_id: channelId,
        /** Link privado que se revocará */
        invite_link: inviteLink,
      }),
    });

    // Parseamos la respuesta de Telegram.
    const data = (await respuesta.json()) as {
      ok: boolean;
      description?: string;
    };

    // Registramos el rechazo sin exponer datos sensibles.
    if (!data.ok) {
      console.warn("[TELEGRAM] No se pudo revocar invite link:", data.description);
      return false;
    }

    // Confirmamos que el link anterior ya no queda activo.
    return true;
  } catch (error) {
    // Error de red u otro error inesperado al hablar con Telegram.
    console.error("[TELEGRAM] Error al revocar invite link:", error);
    return false;
  }
}

/**
 * Formatea los datos de un pick en un mensaje HTML estilizado para Telegram.
 * Soporta tanto la notificación de un nuevo pick como la de actualización de resultado.
 *
 * @param pick         - Objeto con los datos del pick
 * @param esActualizacion - true si se notifica un cambio de estado (ganó/perdió/nulo)
 * @returns Mensaje en formato HTML listo para enviar a Telegram
 */
export function formatPickParaTelegram(
  pick: PickParaTelegram,
  esActualizacion = false
): string {
  // Mapeamos el estado del pick a un emoji representativo
  const emojiEstado: Record<string, string> = {
    pending: "⏳",
    won: "✅",
    lost: "❌",
    void: "🔄",
    "half-won": "🟢",
    "half-lost": "🟠",
  };
  const emoji = emojiEstado[pick.status] || "📌";

  // Mapeamos el estado técnico a una etiqueta legible para los canales.
  const estadoTexto: Record<string, string> = {
    pending: "Pendiente",
    won: "Ganado",
    lost: "Perdido",
    void: "Nulo",
    "half-won": "Medio ganado",
    "half-lost": "Medio perdido",
  };

  // Encabezado sobrio para que el canal se vea como producto premium.
  const encabezado = esActualizacion
    ? `<b>RESULTADO BETROYALE ${emoji}</b>\n`
    : `<b>NUEVO PICK BETROYALE ${emoji}</b>\n`;

  // Escapamos los campos dinámicos antes de armar el HTML que recibirá Telegram.
  const matchName = escapeTelegramHtml(pick.match_name);
  const league = formatLigaConPais(pick);
  const pickValue = formatMercado(pick.market_label, pick.market_acronym, pick.pick);
  const odds = escapeTelegramHtml(pick.odds);
  const stake = formatStake(pick.stake);
  const plan = escapeTelegramHtml(pick.pick_type_name || "BetRoyale");
  const { fecha, hora } = formatFechaHoraColombia(pick.match_date, "utc");
  const webUrl = escapeTelegramHtml(getPickWebUrl(pick));

  // Construimos el cuerpo del mensaje con los datos del pick
  let mensaje = encabezado;
  mensaje += `🏷️ <b>Plan:</b> ${plan}\n`;
  mensaje += `🏆 <b>Evento:</b> ${matchName}\n`;
  mensaje += `🌍 <b>Liga:</b> ${league || "No definida"}\n`;
  mensaje += `📅 <b>Fecha:</b> ${fecha}\n`;
  mensaje += `🕒 <b>Hora:</b> ${hora}\n`;
  mensaje += `🎯 <b>Pronóstico:</b> ${pickValue}\n`;
  mensaje += `📈 <b>Cuota:</b> ${odds}\n`;
  mensaje += `💰 <b>Stake:</b> ${stake}\n`;

  // Si el pick es parlay, mostramos cada selección con su propia liga, mercado y hora.
  if (pick.is_parlay && pick.selections?.length) {
    mensaje += `\n<b>Selecciones del parlay:</b>\n`;
    pick.selections.forEach((selection, index) => {
      const selectionMatch = escapeTelegramHtml(selection.match_name || `Selección ${index + 1}`);
      const selectionLeague = formatLigaConPais(selection);
      const selectionMarket = formatMercado(
        selection.market_label,
        selection.market_acronym,
        selection.pick
      );
      const selectionOdds = escapeTelegramHtml(selection.odds || "");
      const selectionDateTime = selection.match_time
        ? formatFechaHoraColombia(selection.match_time, "col")
        : null;

      // Cada selección se mantiene compacta para no volver gigante el mensaje.
      mensaje += `${index + 1}. <b>${selectionMatch}</b>\n`;
      mensaje += `   🌍 ${selectionLeague || "Liga no definida"}\n`;
      if (selectionDateTime) {
        mensaje += `   📅 ${selectionDateTime.fecha} · 🕒 ${selectionDateTime.hora}\n`;
      }
      mensaje += `   🎯 ${selectionMarket}${selectionOdds ? ` @ ${selectionOdds}` : ""}\n`;
    });
  }

  // Si el pick ya tiene resultado, lo mostramos
  if (pick.status !== "pending") {
    mensaje += `\n📊 <b>Resultado:</b> ${estadoTexto[pick.status] || pick.status} ${emoji}\n`;
    mensaje += `💵 <b>Profit:</b> ${formatProfit(pick)}\n`;
  }

  // Si hay análisis y no es una actualización, lo incluimos (máx 500 caracteres)
  if (pick.analysis && !esActualizacion) {
    const analisisSeguro = escapeTelegramHtml(pick.analysis);
    const analisisCorto =
      analisisSeguro.length > 500
        ? analisisSeguro.substring(0, 500) + "..."
        : analisisSeguro;
    mensaje += `\n📝 <b>Análisis:</b>\n<i>${analisisCorto}</i>\n`;
  }

  // Pie de firma con link solo cuando APP_URL apunta a un entorno público.
  if (shouldShowBetRoyaleLink()) {
    mensaje += `\n<a href="${webUrl}">Ver pick en BetRoyale</a>`;
  }
  mensaje += `\n<b>BetRoyale Club</b> - <i>Invirtiendo con Inteligencia</i>`;

  return mensaje;
}

/**
 * Formatea una actualización de seguimiento escrita desde el panel admin.
 *
 * @param pick - Pick relacionado con el seguimiento publicado.
 * @param message - Mensaje de actualización que escribió el administrador.
 * @returns Mensaje HTML listo para enviar por Telegram.
 */
export function formatSeguimientoParaTelegram(
  pick: PickParaTelegram,
  message: string
): string {
  // Escapamos los campos dinámicos porque Telegram interpreta el mensaje como HTML.
  const matchName = escapeTelegramHtml(pick.match_name);
  const league = formatLigaConPais(pick);
  const safeMessage = escapeTelegramHtml(message);
  const pickValue = formatMercado(pick.market_label, pick.market_acronym, pick.pick);
  const { fecha, hora } = formatFechaHoraColombia(pick.match_date, "utc");
  const plan = escapeTelegramHtml(pick.pick_type_name || "BetRoyale");
  const webUrl = escapeTelegramHtml(getPickWebUrl(pick));

  // Armamos una notificación corta para cambios tácticos, noticias o contexto del pick.
  let mensaje = `<b>UPDATE BETROYALE</b>\n`;
  mensaje += `🏷️ <b>Plan:</b> ${plan}\n`;
  mensaje += `🏆 <b>Evento:</b> ${matchName}\n`;
  mensaje += `🌍 <b>Liga:</b> ${league || "No definida"}\n`;
  mensaje += `📅 <b>Fecha:</b> ${fecha}\n`;
  mensaje += `🕒 <b>Hora:</b> ${hora}\n`;
  mensaje += `🎯 <b>Pick:</b> ${pickValue}\n\n`;
  mensaje += `📝 <b>Nota del tipster:</b>\n${safeMessage}\n`;
  if (shouldShowBetRoyaleLink()) {
    mensaje += `\n<a href="${webUrl}">Ver pick en BetRoyale</a>`;
  }
  mensaje += `\n<b>BetRoyale Club</b> - <i>Invirtiendo con Inteligencia</i>`;

  // Devolvemos el HTML final para que el servicio de envío lo publique.
  return mensaje;
}
