/**
 * @file telegram.routes.ts
 * @description Webhook público de Telegram para auditar ingresos por links VIP.
 */
import { Router } from "express";
import { env } from "../config/env.js";
import { marcarInviteVipComoUsado } from "../services/telegramInvites.service.js";
// Creamos el router dedicado a eventos entrantes del Bot de Telegram.
const router = Router();
/**
 * Extrae de un update de Telegram el link usado para entrar al canal.
 *
 * @param update - Payload enviado por Telegram al webhook del bot.
 * @returns Datos del invite usado o null si el update no confirma un ingreso.
 */
function extraerInviteUsado(update) {
    // Telegram envía cambios de membresía en la propiedad chat_member.
    const chatMember = update?.chat_member;
    // Sin chat_member no hay confirmación real de entrada al canal.
    if (!chatMember) {
        return null;
    }
    // Tomamos el nuevo estado de membresía del usuario.
    const nuevoEstado = chatMember.new_chat_member?.status;
    // Solo marcamos como usado cuando el usuario ya quedó dentro del canal.
    const ingresoConfirmado = ["member", "administrator", "creator"].includes(nuevoEstado);
    // Si el usuario no quedó dentro, no consumimos el link en nuestra base.
    if (!ingresoConfirmado) {
        return null;
    }
    // Telegram incluye el invite link usado cuando el bot tiene permisos suficientes.
    const inviteLink = chatMember.invite_link?.invite_link;
    // Sin invite link no podemos relacionar el ingreso con una compra específica.
    if (!inviteLink) {
        return null;
    }
    // Tomamos el usuario final que ingresó al canal.
    const telegramUser = chatMember.new_chat_member?.user || chatMember.from;
    // Devolvemos los datos mínimos para auditar el ingreso.
    return {
        inviteLink,
        telegramUserId: telegramUser?.id || null,
        telegramUsername: telegramUser?.username || null,
    };
}
/**
 * Valida el secreto opcional del webhook de Telegram.
 *
 * @param req - Solicitud Express recibida desde Telegram.
 * @returns true cuando no hay secreto configurado o cuando el header coincide.
 */
function validarSecretoTelegram(req) {
    // Si no configuramos secreto, aceptamos el webhook por compatibilidad.
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
        return true;
    }
    // Telegram envía este header cuando el webhook fue configurado con secret_token.
    const secretoRecibido = req.get("x-telegram-bot-api-secret-token");
    // Comparamos el secreto esperado contra el valor recibido.
    return secretoRecibido === env.TELEGRAM_WEBHOOK_SECRET;
}
// ─── POST /api/telegram/webhook ─────────────────────────────────────────────
/**
 * Recibe updates de Telegram y marca como usados los links VIP consumidos.
 */
router.post("/webhook", async (req, res) => {
    // Rechazamos updates que no traigan el secreto configurado en producción.
    if (!validarSecretoTelegram(req)) {
        return res.status(401).json({ ok: false });
    }
    try {
        // Extraemos únicamente eventos donde Telegram confirma ingreso por invite link.
        const inviteUsado = extraerInviteUsado(req.body);
        // Si el update no aplica a invites VIP, respondemos ok para no forzar reintentos.
        if (!inviteUsado) {
            return res.json({ ok: true });
        }
        // Marcamos el invite como usado para que el panel ya no emita otro link.
        await marcarInviteVipComoUsado(inviteUsado.inviteLink, inviteUsado.telegramUserId, inviteUsado.telegramUsername);
        // Confirmamos a Telegram que el update fue procesado.
        return res.json({ ok: true });
    }
    catch (error) {
        // Registramos el error sin exponer detalles internos a Telegram.
        console.error("[TELEGRAM] Error procesando webhook:", error);
        // Respondemos ok para evitar bucles de reintento por errores no críticos.
        return res.json({ ok: true });
    }
});
// Exportamos el router para montarlo en server/index.ts.
export default router;
