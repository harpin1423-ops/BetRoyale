/**
 * @file telegramInvites.service.ts
 * @description Generación y caché de links privados temporales para canales VIP.
 */
import { pool } from "../config/database.js";
import { createTelegramInviteLink, revokeTelegramInviteLink } from "./telegram.service.js";
// Tiempo de vida para links privados de canales pagos.
const HORAS_VALIDEZ_INVITE_VIP = 168;
// Margen mínimo para no reutilizar links a punto de vencer.
const MINUTOS_MARGEN_REUSO = 5;
/**
 * Formatea una fecha JS como DATETIME MySQL en UTC.
 *
 * @param value - Fecha que se guardará en MySQL.
 * @returns Fecha en formato "YYYY-MM-DD HH:mm:ss".
 */
function formatMysqlDate(value) {
    // Usamos ISO UTC para mantener consistencia con otros timestamps del proyecto.
    return value.toISOString().slice(0, 19).replace("T", " ");
}
/**
 * Calcula la fecha de expiración estándar para un link VIP temporal.
 *
 * @returns Fecha futura con la duración configurada para canales pagos.
 */
function calcularExpiracionInviteVip() {
    // Sumamos siete días para que el usuario tenga margen razonable tras pagar.
    return new Date(Date.now() + HORAS_VALIDEZ_INVITE_VIP * 60 * 60 * 1000);
}
/**
 * Convierte una fila de invitación usada en la respuesta segura del frontend.
 *
 * @param name - Nombre visible del canal que verá el usuario.
 * @param fila - Registro persistido de telegram_user_invites.
 * @returns Invitación marcada como usada sin exponer un link reutilizable.
 */
function construirInviteUsado(name, fila) {
    // Devolvemos el estado usado para que el panel muestre que el usuario ya entró.
    return {
        name,
        link: "",
        expires_at: fila.expires_at ? formatMysqlDate(new Date(fila.expires_at)) : null,
        status: "used",
        used_at: fila.used_at ? formatMysqlDate(new Date(fila.used_at)) : null,
        telegram_username: fila.telegram_username || null,
    };
}
/**
 * Marca un link privado como usado cuando Telegram confirma el ingreso al canal.
 *
 * @param inviteLink - Link de invitación recibido desde el webhook de Telegram.
 * @param telegramUserId - ID de Telegram del usuario que ingresó, si fue reportado.
 * @param telegramUsername - Username visible de Telegram, si fue reportado.
 * @returns true si se actualizó un registro pendiente; false si no se encontró.
 */
export async function marcarInviteVipComoUsado(inviteLink, telegramUserId, telegramUsername) {
    // Normalizamos el link porque Telegram lo reporta como string completo.
    const inviteLinkNormalizado = String(inviteLink || "").trim();
    // Sin link no hay forma confiable de relacionar el ingreso con un comprador.
    if (!inviteLinkNormalizado) {
        return false;
    }
    // Guardamos el primer ingreso confirmado y no sobreescribimos auditoría existente.
    const [resultado] = await pool.query(`UPDATE telegram_user_invites
     SET used_at = COALESCE(used_at, UTC_TIMESTAMP()),
         telegram_user_id = COALESCE(telegram_user_id, ?),
         telegram_username = COALESCE(telegram_username, ?)
     WHERE invite_link = ?
       AND used_at IS NULL`, [
        telegramUserId ? String(telegramUserId) : null,
        telegramUsername || null,
        inviteLinkNormalizado,
    ]);
    // Confirmamos si la base realmente marcó el enlace como usado.
    return Number(resultado?.affectedRows || 0) > 0;
}
/**
 * Construye el nombre interno del invite link para auditoría en Telegram.
 *
 * @param params - Datos del usuario, plan y canal.
 * @returns Nombre corto compatible con Telegram.
 */
function construirNombreInvite(params) {
    // Incluimos userId y plan para identificar el link sin exponer email.
    return `BR ${params.planId} U${params.userId}`;
}
/**
 * Obtiene un link VIP vigente o crea uno nuevo con límite de un ingreso.
 *
 * @param params - Usuario, plan y canal para el invite privado.
 * @returns Link privado temporal, o null si Telegram no pudo crearlo.
 */
export async function obtenerOCrearInviteVip(params) {
    // Normalizamos el Channel ID porque Telegram no acepta espacios accidentales.
    const channelId = String(params.channelId || "").trim();
    // Sin Channel ID no hay forma segura de generar un link privado.
    if (!channelId) {
        return null;
    }
    // Buscamos cualquier link previo para decidir si se reutiliza, se renueva o ya fue usado.
    const [existentes] = await pool.query(`SELECT invite_link, expires_at, used_at, revoked_at, telegram_username
     FROM telegram_user_invites
     WHERE user_id = ?
       AND plan_id = ?
       AND channel_id = ?
     LIMIT 1`, [params.userId, params.planId, channelId]);
    // Tomamos el registro único del usuario para este canal si ya existe.
    const existente = existentes[0];
    // Si Telegram ya confirmó ingreso, no emitimos otro link para el mismo plan.
    if (existente?.used_at) {
        return construirInviteUsado(params.name, existente);
    }
    // Validamos si el link anterior sigue vigente y no está revocado.
    const linkVigente = existente &&
        !existente.revoked_at &&
        new Date(existente.expires_at).getTime() >
            Date.now() + MINUTOS_MARGEN_REUSO * 60 * 1000;
    // Reutilizamos el link no usado si sigue vigente y no se pidió regeneración.
    if (linkVigente && !params.forceRefresh) {
        return {
            name: params.name,
            link: existente.invite_link,
            expires_at: formatMysqlDate(new Date(existente.expires_at)),
            status: "available",
            used_at: null,
            telegram_username: null,
        };
    }
    // Si el usuario pidió un link nuevo, revocamos el anterior para evitar dos accesos activos.
    if (params.forceRefresh && linkVigente && existente.invite_link) {
        // Pedimos a Telegram invalidar el link viejo antes de emitir uno nuevo.
        await revokeTelegramInviteLink(channelId, existente.invite_link);
        // Marcamos el link anterior como revocado también en nuestra base.
        await pool.query(`UPDATE telegram_user_invites
       SET revoked_at = UTC_TIMESTAMP()
       WHERE user_id = ?
         AND plan_id = ?
         AND channel_id = ?`, [params.userId, params.planId, channelId]);
    }
    // Calculamos la expiración del nuevo link privado.
    const expiresAt = calcularExpiracionInviteVip();
    // Creamos el link en Telegram con expiración y member_limit = 1.
    const inviteLink = await createTelegramInviteLink(channelId, construirNombreInvite(params), expiresAt);
    // Si Telegram rechaza la creación, no devolvemos enlaces permanentes para planes pagos.
    if (!inviteLink) {
        return null;
    }
    // Convertimos la expiración a DATETIME para MySQL.
    const expiresAtMysql = formatMysqlDate(expiresAt);
    // Persistimos o renovamos el link privado para este usuario/plan/canal.
    await pool.query(`INSERT INTO telegram_user_invites
       (user_id, plan_id, channel_id, invite_link, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       invite_link = VALUES(invite_link),
       expires_at = VALUES(expires_at),
       used_at = NULL,
       telegram_user_id = NULL,
       telegram_username = NULL,
       revoked_at = NULL`, [params.userId, params.planId, channelId, inviteLink, expiresAtMysql]);
    // Devolvemos el link recién creado para que el frontend lo muestre.
    return {
        name: params.name,
        link: inviteLink,
        expires_at: expiresAtMysql,
        status: "available",
        used_at: null,
        telegram_username: null,
    };
}
