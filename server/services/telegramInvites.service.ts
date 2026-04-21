/**
 * @file telegramInvites.service.ts
 * @description Generación y caché de links privados temporales para canales VIP.
 */

import { pool } from "../config/database.js";
import { createTelegramInviteLink } from "./telegram.service.js";

// Tiempo de vida para links privados de canales pagos.
const HORAS_VALIDEZ_INVITE_VIP = 24;

// Margen mínimo para no reutilizar links a punto de vencer.
const MINUTOS_MARGEN_REUSO = 5;

/**
 * Parámetros necesarios para crear o reutilizar un invite VIP.
 */
interface ParametrosInviteVip {
  /** ID del usuario dueño del link privado. */
  userId: number | string;
  /** Slug del plan pago que habilita el canal. */
  planId: string;
  /** ID del canal privado de Telegram. */
  channelId: string;
  /** Nombre visible del canal o plan. */
  name: string;
}

/**
 * Resultado devuelto al frontend para un canal VIP.
 */
export interface ResultadoInviteVip {
  /** Nombre visible del canal. */
  name: string;
  /** Link privado creado por Telegram. */
  link: string;
  /** Fecha de vencimiento del link privado. */
  expires_at: string;
}

/**
 * Formatea una fecha JS como DATETIME MySQL en UTC.
 *
 * @param value - Fecha que se guardará en MySQL.
 * @returns Fecha en formato "YYYY-MM-DD HH:mm:ss".
 */
function formatMysqlDate(value: Date): string {
  // Usamos ISO UTC para mantener consistencia con otros timestamps del proyecto.
  return value.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Calcula la fecha de expiración estándar para un link VIP temporal.
 *
 * @returns Fecha futura con la duración configurada para canales pagos.
 */
function calcularExpiracionInviteVip(): Date {
  // Sumamos 24 horas para que el usuario tenga margen razonable tras pagar.
  return new Date(Date.now() + HORAS_VALIDEZ_INVITE_VIP * 60 * 60 * 1000);
}

/**
 * Construye el nombre interno del invite link para auditoría en Telegram.
 *
 * @param params - Datos del usuario, plan y canal.
 * @returns Nombre corto compatible con Telegram.
 */
function construirNombreInvite(params: ParametrosInviteVip): string {
  // Incluimos userId y plan para identificar el link sin exponer email.
  return `BR ${params.planId} U${params.userId}`;
}

/**
 * Obtiene un link VIP vigente o crea uno nuevo con límite de un ingreso.
 *
 * @param params - Usuario, plan y canal para el invite privado.
 * @returns Link privado temporal, o null si Telegram no pudo crearlo.
 */
export async function obtenerOCrearInviteVip(
  params: ParametrosInviteVip
): Promise<ResultadoInviteVip | null> {
  // Normalizamos el Channel ID porque Telegram no acepta espacios accidentales.
  const channelId = String(params.channelId || "").trim();

  // Sin Channel ID no hay forma segura de generar un link privado.
  if (!channelId) {
    return null;
  }

  // Buscamos un link existente que no esté cerca de vencerse.
  const [existentes]: any = await pool.query(
    `SELECT invite_link, expires_at
     FROM telegram_user_invites
     WHERE user_id = ?
       AND plan_id = ?
       AND channel_id = ?
       AND expires_at > DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
     LIMIT 1`,
    [params.userId, params.planId, channelId, MINUTOS_MARGEN_REUSO]
  );

  // Reutilizamos el link vigente para evitar crear enlaces nuevos en cada refresh.
  if (existentes.length > 0) {
    return {
      name: params.name,
      link: existentes[0].invite_link,
      expires_at: formatMysqlDate(new Date(existentes[0].expires_at)),
    };
  }

  // Calculamos la expiración del nuevo link privado.
  const expiresAt = calcularExpiracionInviteVip();

  // Creamos el link en Telegram con expiración y member_limit = 1.
  const inviteLink = await createTelegramInviteLink(
    channelId,
    construirNombreInvite(params),
    expiresAt
  );

  // Si Telegram rechaza la creación, no devolvemos enlaces permanentes para planes pagos.
  if (!inviteLink) {
    return null;
  }

  // Convertimos la expiración a DATETIME para MySQL.
  const expiresAtMysql = formatMysqlDate(expiresAt);

  // Persistimos o renovamos el link privado para este usuario/plan/canal.
  await pool.query(
    `INSERT INTO telegram_user_invites
       (user_id, plan_id, channel_id, invite_link, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       invite_link = VALUES(invite_link),
       expires_at = VALUES(expires_at)`,
    [params.userId, params.planId, channelId, inviteLink, expiresAtMysql]
  );

  // Devolvemos el link recién creado para que el frontend lo muestre.
  return {
    name: params.name,
    link: inviteLink,
    expires_at: expiresAtMysql,
  };
}
