/**
 * @file settings.service.ts
 * @description Helpers para leer y guardar configuraciones globales del panel.
 */

import { pool } from "../config/database";
import { env } from "../config/env";

// Llaves estables usadas para la configuración global del canal VIP Full.
export const SETTINGS_KEYS = {
  telegramFullChannelId: "telegram_full_channel_id",
  telegramFullInviteLink: "telegram_full_invite_link",
} as const;

/**
 * Normaliza un valor de configuración para guardar strings limpios.
 *
 * @param value - Valor recibido desde el panel o desde variables de entorno.
 * @returns Texto recortado o cadena vacía cuando el valor no existe.
 */
function normalizarSetting(value: unknown): string {
  // Convertimos null/undefined en cadena vacía para evitar "undefined" guardado.
  if (value === null || value === undefined) {
    return "";
  }

  // Convertimos a string y eliminamos espacios accidentales.
  return String(value).trim();
}

/**
 * Lee una configuración global desde la base de datos.
 *
 * @param key - Llave única de la configuración.
 * @param fallback - Valor alternativo cuando la llave no existe.
 * @returns Valor guardado, o fallback si está vacío/no existe.
 */
export async function obtenerSetting(key: string, fallback = ""): Promise<string> {
  // Consultamos por llave exacta para evitar mezclar configuraciones.
  const [rows]: any = await pool.query(
    "SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1",
    [key]
  );

  // Normalizamos el valor de base de datos antes de decidir si usamos fallback.
  const valorGuardado = normalizarSetting(rows[0]?.setting_value);

  // Si existe un valor real en DB, tiene prioridad sobre el fallback.
  if (valorGuardado) {
    return valorGuardado;
  }

  // Usamos el fallback limpio cuando no hay valor administrado.
  return normalizarSetting(fallback);
}

/**
 * Guarda una configuración global desde el panel.
 *
 * @param key - Llave única de la configuración.
 * @param value - Valor a persistir; vacío limpia la configuración.
 * @returns Valor normalizado que quedó guardado.
 */
export async function guardarSetting(key: string, value: unknown): Promise<string> {
  // Limpiamos espacios antes de persistir.
  const valorNormalizado = normalizarSetting(value);

  // Insertamos o actualizamos la llave sin crear filas duplicadas.
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, valorNormalizado]
  );

  // Devolvemos el valor final para que el controlador responda al frontend.
  return valorNormalizado;
}

/**
 * Obtiene la configuración del canal espejo VIP Full.
 *
 * @returns Channel ID y enlace de invitación con fallback a variables de entorno.
 */
export async function obtenerTelegramFullConfig(): Promise<{
  telegram_channel_id: string;
  telegram_invite_link: string;
}> {
  // Leemos el Channel ID desde DB y usamos .env como respaldo local/producción.
  const telegramChannelId = await obtenerSetting(
    SETTINGS_KEYS.telegramFullChannelId,
    env.TELEGRAM_FULL_CHANNEL_ID
  );

  // Leemos el invite link desde DB y usamos .env como respaldo.
  const telegramInviteLink = await obtenerSetting(
    SETTINGS_KEYS.telegramFullInviteLink,
    env.TELEGRAM_FULL_INVITE_LINK
  );

  // Devolvemos nombres compatibles con el panel de Telegram existente.
  return {
    telegram_channel_id: telegramChannelId,
    telegram_invite_link: telegramInviteLink,
  };
}
