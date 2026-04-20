/**
 * @file telegram.service.ts
 * @description Servicio de integración con el Bot de Telegram.
 * Maneja el envío de mensajes al canal configurado y el formato
 * de los picks para su presentación en Telegram (HTML).
 */

import { env } from "../config/env";

// ─── Tipos ───────────────────────────────────────────────────────────────────

/**
 * Estructura mínima de un pick para formatear el mensaje de Telegram.
 */
interface PickParaTelegram {
  /** Fecha y hora del partido */
  match_date: string | Date;
  /** Nombre del partido (ej: "Real Madrid vs Barcelona") */
  match_name: string;
  /** Nombre de la liga */
  league: string;
  /** Pronóstico elegido (ej: "1", "AEM", "+2.5") */
  pick: string;
  /** Cuota decimal del pick */
  odds: number | string;
  /** Stake sugerido sobre 10 */
  stake: number | string;
  /** Análisis generado por IA (opcional) */
  analysis?: string;
  /** Estado actual del pick: 'pending' | 'won' | 'lost' | 'void' */
  status: string;
}

// ─── Funciones ───────────────────────────────────────────────────────────────

/**
 * Envía un mensaje de texto formateado en HTML a un canal de Telegram.
 *
 * @param channelId - ID del canal o chat de Telegram (ej: "-100123456789")
 * @param message   - Mensaje en formato HTML que enviará el bot
 */
export async function sendTelegramMessage(
  channelId: string,
  message: string
): Promise<void> {
  // Verificamos que el token del bot y el channelId estén configurados
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !channelId) {
    console.warn("[TELEGRAM] Bot token o Channel ID no configurado. Omitiendo envío.");
    return;
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
    }
  } catch (error) {
    // Error de red u otro error inesperado
    console.error("[TELEGRAM] Error al enviar mensaje:", error);
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
  };
  const emoji = emojiEstado[pick.status] || "📌";

  // Encabezado del mensaje (diferente si es nuevo pick o actualización)
  const encabezado = esActualizacion
    ? `<b>🚨 ACTUALIZACIÓN DE PICK ${emoji}</b>\n\n`
    : `<b>🔥 NUEVO PICK DISPONIBLE ${emoji}</b>\n\n`;

  // Formateamos la fecha del partido al formato español: DD/MM HH:MM
  const fecha = new Date(pick.match_date).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Construimos el cuerpo del mensaje con los datos del pick
  let mensaje = encabezado;
  mensaje += `<b>🏆 Evento:</b> ${pick.match_name}\n`;
  mensaje += `<b>📅 Fecha:</b> ${fecha}\n`;
  mensaje += `<b>⚽ Liga:</b> ${pick.league}\n`;
  mensaje += `<b>🎯 Pronóstico:</b> ${pick.pick}\n`;
  mensaje += `<b>📈 Cuota:</b> ${pick.odds}\n`;
  mensaje += `<b>💰 Stake:</b> ${pick.stake}/10\n`;

  // Si el pick ya tiene resultado, lo mostramos
  if (pick.status !== "pending") {
    mensaje += `\n<b>📊 Resultado:</b> ${pick.status.toUpperCase()} ${emoji}\n`;
  }

  // Si hay análisis y no es una actualización, lo incluimos (máx 500 caracteres)
  if (pick.analysis && !esActualizacion) {
    const analisisCorto =
      pick.analysis.length > 500
        ? pick.analysis.substring(0, 500) + "..."
        : pick.analysis;
    mensaje += `\n<b>📝 Análisis:</b>\n<i>${analisisCorto}</i>\n`;
  }

  // Pie de firma del canal
  mensaje += `\n🚀 <b>BetRoyale Club</b> - <i>Invirtiendo con Inteligencia</i>`;

  return mensaje;
}
