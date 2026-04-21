/**
 * @file pickTypes.routes.ts
 * @description Rutas para gestionar los tipos de picks y su configuración de Telegram.
 */

import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { escapeTelegramHtml, sendTelegramMessage } from "../services/telegram.service.js";
import { SETTINGS_KEYS, guardarSetting, obtenerTelegramFullConfig } from "../services/settings.service.js";

const router = Router();

/**
 * Normaliza campos opcionales de texto para guardar valores limpios o null.
 *
 * @param value - Valor recibido desde el panel de administración.
 * @returns undefined si el campo no se envió, null si llegó vacío, o texto recortado.
 */
function normalizarTextoOpcional(value: unknown): string | null | undefined {
  // Si el frontend no envió el campo, preservamos el valor actual en base de datos.
  if (value === undefined) {
    return undefined;
  }

  // Si el frontend envió null explícito, limpiamos el campo en base de datos.
  if (value === null) {
    return null;
  }

  // Convertimos el valor a texto para aceptar inputs normales del navegador.
  const texto = String(value).trim();

  // Guardamos null cuando el admin borra el contenido del input.
  return texto.length > 0 ? texto : null;
}

// ── GET /api/pick-types ──────────────────────────────────────────────────────
/**
 * Obtiene todos los tipos de pick disponibles.
 * Admin recibe configuración completa; usuarios autenticados reciben solo lectura segura.
 */
router.get("/", authenticateToken, async (req: any, res) => {
  try {
    // Los administradores necesitan ver canales e invitaciones para configurar Telegram.
    const query = req.user?.role === "admin"
      ? "SELECT * FROM pick_types ORDER BY id ASC"
      : "SELECT id, name, slug FROM pick_types ORDER BY id ASC";

    // Ejecutamos la consulta adecuada para el rol autenticado.
    const [rows] = await pool.query(query);

    // Devolvemos la lista segura para el frontend correspondiente.
    return res.json(rows);
  } catch (error) {
    console.error("[PICK-TYPES] Error obteniendo tipos:", error);
    return res.status(500).json({ error: "Error al obtener tipos de pick" });
  }
});

// ── GET /api/pick-types/telegram-full ───────────────────────────────────────
/**
 * Obtiene la configuración global del canal espejo VIP Full.
 *
 * @param req - Solicitud autenticada del administrador.
 * @param res - Respuesta HTTP con Channel ID e invite link del canal Full.
 */
router.get("/telegram-full", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    // Cargamos la configuración desde DB con fallback a variables de entorno.
    const config = await obtenerTelegramFullConfig();

    // Respondemos con la misma forma de datos que usa el panel de Telegram.
    return res.json({
      name: "VIP Full",
      ...config,
    });
  } catch (error) {
    // Registramos el error técnico sin exponer detalles internos al panel.
    console.error("[PICK-TYPES] Error obteniendo Telegram Full:", error);
    return res.status(500).json({ error: "Error al obtener configuración VIP Full" });
  }
});

// ── PUT /api/pick-types/telegram-full ───────────────────────────────────────
/**
 * Actualiza la configuración global del canal espejo VIP Full.
 *
 * @param req - Solicitud autenticada con telegram_channel_id y/o telegram_invite_link.
 * @param res - Respuesta HTTP con la configuración final guardada.
 */
router.put("/telegram-full", authenticateToken, requireAdmin, async (req, res) => {
  // Tomamos solo los campos de Telegram admitidos para esta configuración global.
  const { telegram_channel_id, telegram_invite_link } = req.body;

  try {
    // Guardamos el Channel ID cuando el panel lo envía.
    if (Object.prototype.hasOwnProperty.call(req.body, "telegram_channel_id")) {
      await guardarSetting(SETTINGS_KEYS.telegramFullChannelId, telegram_channel_id);
    }

    // Guardamos el invite link cuando el panel lo envía.
    if (Object.prototype.hasOwnProperty.call(req.body, "telegram_invite_link")) {
      await guardarSetting(SETTINGS_KEYS.telegramFullInviteLink, telegram_invite_link);
    }

    // Recargamos la configuración final para devolver valores normalizados.
    const config = await obtenerTelegramFullConfig();

    // Confirmamos al panel que la configuración global quedó persistida.
    return res.json({
      message: "Configuración VIP Full actualizada correctamente",
      config,
    });
  } catch (error) {
    // Registramos el error técnico sin exponer detalles internos al panel.
    console.error("[PICK-TYPES] Error actualizando Telegram Full:", error);
    return res.status(500).json({ error: "Error al actualizar configuración VIP Full" });
  }
});

// ── PUT /api/pick-types/:id ──────────────────────────────────────────────────
/**
 * Actualiza la configuración de un tipo de pick (incluyendo Telegram).
 * Solo administradores.
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, telegram_channel_id, telegram_invite_link } = req.body;

  try {
    // Cargamos el tipo actual para permitir actualizaciones parciales desde la pestaña Telegram.
    const [filasActuales]: any = await pool.query(
      "SELECT id, name, telegram_channel_id, telegram_invite_link FROM pick_types WHERE id = ?",
      [id]
    );

    // Si no existe el tipo, respondemos 404 antes de intentar actualizar.
    if (filasActuales.length === 0) {
      return res.status(404).json({ error: "Tipo de pick no encontrado" });
    }

    // Tomamos el registro actual como base para preservar campos no enviados.
    const tipoActual = filasActuales[0];

    // Validamos el nombre solo cuando el cliente intenta actualizarlo.
    if (Object.prototype.hasOwnProperty.call(req.body, "name") && !String(name || "").trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    // Conservamos el nombre actual si el panel solo está guardando campos de Telegram.
    const nombreFinal = Object.prototype.hasOwnProperty.call(req.body, "name")
      ? String(name).trim()
      : tipoActual.name;

    // Normalizamos el channel id para aceptar borrados desde el input del panel.
    const canalNormalizado = normalizarTextoOpcional(telegram_channel_id);

    // Normalizamos el link de invitación para aceptar borrados desde el input del panel.
    const enlaceNormalizado = normalizarTextoOpcional(telegram_invite_link);

    // Conservamos los valores anteriores cuando el frontend no envía ese campo.
    const canalFinal = canalNormalizado === undefined ? tipoActual.telegram_channel_id : canalNormalizado;

    // Conservamos el link anterior cuando el frontend no envía ese campo.
    const enlaceFinal = enlaceNormalizado === undefined ? tipoActual.telegram_invite_link : enlaceNormalizado;

    // Persistimos la configuración final del plan.
    const [result] = await pool.query(
      "UPDATE pick_types SET name = ?, telegram_channel_id = ?, telegram_invite_link = ? WHERE id = ?",
      [nombreFinal, canalFinal, enlaceFinal, id]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: "Tipo de pick no encontrado" });
    }

    return res.json({ message: "Configuración de plan actualizada exitosamente" });
  } catch (error) {
    console.error("[PICK-TYPES] Error actualizando tipo:", error);
    return res.status(500).json({ error: "Error al actualizar el tipo de pick" });
  }
});

// ── POST /api/pick-types/telegram-full/test ─────────────────────────────────
/**
 * Envía un mensaje de prueba al canal espejo VIP Full.
 *
 * @param req - Solicitud autenticada del administrador.
 * @param res - Respuesta HTTP con el resultado del envío.
 */
router.post("/telegram-full/test", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    // Cargamos el Channel ID global con fallback a .env.
    const config = await obtenerTelegramFullConfig();

    // Validamos que exista un canal antes de intentar hablar con Telegram.
    if (!config.telegram_channel_id) {
      return res.status(400).json({ error: "Primero configura el Channel ID de VIP Full" });
    }

    // Escapamos el nombre visible porque el mensaje usa HTML.
    const nombreSeguro = escapeTelegramHtml("VIP Full");

    // Armamos un mensaje corto para confirmar que el espejo recibe publicaciones.
    const mensaje = `<b>✅ Prueba BetRoyale Club</b>\n\nCanal espejo configurado para <b>${nombreSeguro}</b>.\n\nSi ves este mensaje, los picks VIP también llegarán aquí.`;

    // Enviamos el mensaje usando el bot configurado en TELEGRAM_BOT_TOKEN.
    const enviado = await sendTelegramMessage(config.telegram_channel_id, mensaje);

    // Si Telegram rechaza el mensaje, damos una acción clara al administrador.
    if (!enviado) {
      return res.status(502).json({
        error: "Telegram no aceptó el mensaje. Revisa TELEGRAM_BOT_TOKEN, el Channel ID Full y que el bot sea admin del canal.",
      });
    }

    // Confirmamos el envío exitoso al panel.
    return res.json({ message: "Mensaje de prueba enviado correctamente a VIP Full" });
  } catch (error) {
    // Registramos el error técnico sin exponer detalles sensibles al cliente.
    console.error("[PICK-TYPES] Error probando Telegram Full:", error);
    return res.status(500).json({ error: "Error al probar el canal VIP Full" });
  }
});

// ── POST /api/pick-types/:id/test-telegram ───────────────────────────────────
/**
 * Envía un mensaje de prueba al canal configurado para un tipo de pick.
 *
 * @param req - Solicitud autenticada del administrador.
 * @param res - Respuesta HTTP con el resultado del envío.
 */
router.post("/:id/test-telegram", authenticateToken, requireAdmin, async (req, res) => {
  // Obtenemos el id del plan desde la URL.
  const { id } = req.params;

  try {
    // Buscamos el canal configurado para el tipo de pick solicitado.
    const [filas]: any = await pool.query(
      "SELECT name, telegram_channel_id FROM pick_types WHERE id = ?",
      [id]
    );

    // Respondemos 404 si el plan no existe.
    if (filas.length === 0) {
      return res.status(404).json({ error: "Tipo de pick no encontrado" });
    }

    // Tomamos el plan encontrado para preparar el mensaje de prueba.
    const tipo = filas[0];

    // Validamos que el admin haya guardado un canal antes de probar.
    if (!tipo.telegram_channel_id) {
      return res.status(400).json({ error: "Primero configura el Channel ID de Telegram" });
    }

    // Escapamos el nombre del plan porque Telegram interpretará el mensaje como HTML.
    const nombreSeguro = escapeTelegramHtml(tipo.name);

    // Armamos un mensaje corto para confirmar que el bot publica en el canal correcto.
    const mensaje = `<b>✅ Prueba BetRoyale Club</b>\n\nCanal configurado para <b>${nombreSeguro}</b>.\n\nSi ves este mensaje, el bot ya puede publicar picks aquí.`;

    // Enviamos el mensaje usando el token configurado en TELEGRAM_BOT_TOKEN.
    const enviado = await sendTelegramMessage(tipo.telegram_channel_id, mensaje);

    // Si Telegram no aceptó el mensaje, avisamos al panel admin.
    if (!enviado) {
      return res.status(502).json({
        error: "Telegram no aceptó el mensaje. Revisa TELEGRAM_BOT_TOKEN, el Channel ID y que el bot sea admin del canal.",
      });
    }

    // Confirmamos el envío exitoso al panel.
    return res.json({ message: "Mensaje de prueba enviado correctamente" });
  } catch (error) {
    // Registramos el error técnico sin exponer detalles sensibles al cliente.
    console.error("[PICK-TYPES] Error probando Telegram:", error);
    return res.status(500).json({ error: "Error al probar el canal de Telegram" });
  }
});

export default router;
