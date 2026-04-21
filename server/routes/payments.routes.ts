/**
 * @file payments.routes.ts
 * @description Rutas del sistema de pagos con Mercado Pago.
 * Maneja: creación de preferencias de pago, sincronización manual
 * y el webhook de notificaciones automáticas de Mercado Pago.
 */

import { Router } from "express";
import { Preference, Payment } from "mercadopago";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { authenticateToken } from "../middleware/auth.js";
import {
  getMercadoPagoClient,
  obtenerTasaCambio,
  activarSuscripcion,
} from "../services/mercadopago.service.js";
import { enviarEmailConfirmacionVIP } from "../services/email.service.js";

// Creamos el router para las rutas de pagos
const router = Router();

// ─── POST /api/payments/mercadopago ──────────────────────────────────────────
/**
 * Crea una preferencia de pago en Mercado Pago.
 * El frontend redirige al usuario a la URL generada para completar el pago.
 * Requiere autenticación (el usuario debe estar logueado para comprar).
 */
router.post("/mercadopago", authenticateToken, async (req: any, res) => {
  const {
    title,        // Título del item a mostrar en MP
    description,  // Descripción del plan
    quantity,     // Cantidad (normalmente 1)
    unit_price,   // Precio en USD (lo convertimos a COP)
    planId,       // Slug del plan (ej: 'cuota_2')
    period,       // Período: 'mensual' | 'trimestral' | 'semestral' | 'anual'
    promoCode,    // Código promocional (opcional)
  } = req.body;

  try {
    // Validamos la credencial privada antes de llamar a Mercado Pago para evitar errores crudos.
    if (!env.MERCADOPAGO_ACCESS_TOKEN.trim()) {
      return res.status(503).json({
        error: "Mercado Pago no está configurado. Falta MERCADOPAGO_ACCESS_TOKEN en el servidor.",
      });
    }

    // Detectamos si la credencial privada pertenece al entorno sandbox de Mercado Pago.
    const esCredencialMercadoPagoSandbox = env.MERCADOPAGO_ACCESS_TOKEN.startsWith("TEST-");

    // Obtenemos la tasa de cambio USD → COP para procesar el pago en moneda local
    const tasa = await obtenerTasaCambio();
    const precioCOP = Math.round(unit_price * tasa);

    // ─── CASO ESPECIAL: Suscripción Gratuita (Cupón 100%) ───────────────────
    if (precioCOP <= 0) {
      console.log(`[PAYMENTS] Procesando suscripción gratuita para usuario ${req.user.id}`);
      
      await activarSuscripcion({
        userId: req.user.id.toString(),
        planId,
        period: period || "mensual",
        amount: 0,
        currency: "COP",
        paymentMethod: "promo_code_100",
        promoCode,
      });

      // Enviamos email de confirmación
      const [filaUsuario]: any = await pool.query(
        "SELECT email, vip_until FROM users WHERE id = ?",
        [req.user.id]
      );
      if (filaUsuario[0]) {
        const hasta = new Date(filaUsuario[0].vip_until).toLocaleDateString("es-ES");
        enviarEmailConfirmacionVIP(filaUsuario[0].email, planId, hasta).catch(console.error);
      }

      return res.json({
        success: true,
        message: "Suscripción gratuita activada exitosamente",
        direct_activation: true
      });
    }

    // Verificamos que el APP_URL esté configurado (necesario para las URLs de retorno)
    if (!env.APP_URL) {
      throw new Error("APP_URL no configurado en las variables de entorno");
    }

    // Limpiamos la URL de la app (eliminamos slash final si existe)
    const appUrl = env.APP_URL.replace(/\/$/, "");

    // Detectamos si la app está en una URL pública compatible con redirecciones de MP.
    const esAppUrlPublica = /^https:\/\//i.test(appUrl) && !/localhost|127\.0\.0\.1/i.test(appUrl);

    // Creamos la referencia externa que MP nos devolverá en el webhook
    // Formato: sub:userId:planId:period[:promoCode]
    const referenciaExterna = `sub:${req.user.id}:${planId}:${period}${
      promoCode ? `:${promoCode}` : ""
    }`;

    // Obtenemos el cliente de Mercado Pago con el token más reciente
    const mpClient = getMercadoPagoClient();

    // Armamos el cuerpo base de la preferencia de pago.
    const preferenceBody: any = {
      /** Items del pago */
      items: [
        {
          id: planId,
          title: title || `Suscripción VIP ${planId}`,
          description: description || `Plan ${planId} - ${period}`,
          quantity: Number(quantity) || 1,
          unit_price: precioCOP,       // En COP
          currency_id: "COP",          // Moneda colombiana
        },
      ],
      /** Email del comprador (prellenado en el formulario de MP) */
      payer: { email: req.user.email },
      /** Configuración de métodos de pago */
      payment_methods: {
        excluded_payment_types: [],
        excluded_payment_methods: [],
        installments: 12,              // Hasta 12 cuotas
      },
      /** Referencia que nos llega en el webhook para identificar el pago */
      external_reference: referenciaExterna,
      /** Modo binario: solo aprobado o rechazado, sin estado pendiente */
      binary_mode: true,
      /** Texto en el estado de cuenta del usuario */
      statement_descriptor: "BETROYALE VIP",
    };

    // En producción/deploy público sí activamos webhook y retorno automático.
    if (esAppUrlPublica) {
      // URL a la que MP envía las notificaciones automáticas.
      preferenceBody.notification_url = `${appUrl}/api/payments/webhook`;

      // URLs de retorno tras el pago.
      preferenceBody.back_urls = {
        success: `${appUrl}/payment-return`,
        failure: `${appUrl}/payment-return`,
        pending: `${appUrl}/payment-return`,
      };

      // Redirige automáticamente si el pago es aprobado.
      preferenceBody.auto_return = "approved";
    } else {
      // En localhost MP rechaza auto_return; dejamos checkout usable para pruebas manuales.
      console.warn("[PAYMENTS] APP_URL local detectado; creando preferencia sin auto_return/webhook.");
    }

    // Creamos la preferencia de pago en MP
    const preferenceClient = new Preference(mpClient);
    const resultado = await preferenceClient.create({
      body: preferenceBody,
    });

    console.log(`[PAYMENTS] Preferencia creada: ${resultado.id} | Plan: ${planId} | Usuario: ${req.user.id}`);

    // Devolvemos los links de pago al frontend
    return res.json({
      id: resultado.id,
      init_point: resultado.init_point,             // Link de producción
      sandbox_init_point: resultado.sandbox_init_point, // Link de sandbox (test)
      is_sandbox: esCredencialMercadoPagoSandbox,   // Marca real del entorno usado por el backend
    });
  } catch (error: any) {
    console.error("[PAYMENTS] Error creando preferencia MP:", error);

    // Detectamos rechazos de autorización de Mercado Pago para mostrar un mensaje accionable.
    const esErrorAutorizacionMp =
      error?.status === 401 ||
      error?.status === 403 ||
      error?.code === "PA_UNAUTHORIZED_RESULT_FROM_POLICIES";

    // Evitamos enviar al usuario mensajes internos tipo PolicyAgent/UNAUTHORIZED.
    if (esErrorAutorizacionMp) {
      return res.status(503).json({
        error: "Mercado Pago rechazó la credencial configurada. Revisa MERCADOPAGO_ACCESS_TOKEN.",
      });
    }

    return res.status(500).json({
      error: error.message || "Error al crear pago con Mercado Pago",
    });
  }
});

// ─── GET /api/payments/sync ──────────────────────────────────────────────────
/**
 * Sincroniza manualmente el estado de un pago aprobado.
 * Se usa como fallback cuando el webhook no funcionó correctamente.
 * El usuario llama esto desde la página /payment-return con su payment_id.
 */
router.get("/sync", authenticateToken, async (req: any, res) => {
  const { payment_id } = req.query;

  if (!payment_id) {
    return res.status(400).json({ error: "Falta el payment_id" });
  }

  try {
    // Obtenemos los detalles del pago desde la API de Mercado Pago
    const mpClient = getMercadoPagoClient();
    const paymentClient = new Payment(mpClient);
    const pago = await paymentClient.get({ id: payment_id.toString() });

    // Solo procesamos si el pago está aprobado o autorizado
    if (
      (pago.status === "approved" || pago.status === "authorized") &&
      pago.external_reference
    ) {
      const refExterna =
        typeof pago.external_reference === "string" ? pago.external_reference : "";

      // Parseamos la referencia externa: sub:userId:planId:period[:promoCode]
      const [, userId, planId, period, promoCode] = refExterna.split(":");

      // Verificamos que el pago pertenece al usuario autenticado (seguridad)
      if (userId !== req.user.id.toString()) {
        return res.status(403).json({ error: "Este pago no pertenece a tu cuenta" });
      }

      // Activamos la suscripción del usuario en la base de datos
      await activarSuscripcion({
        userId,
        planId,
        period: period || "mensual",
        amount: pago.transaction_amount,
        currency: pago.currency_id,
        paymentMethod: pago.payment_method_id,
        promoCode,
      });

      // Obtenemos el email del usuario para el email de confirmación
      const [filaUsuario]: any = await pool.query(
        "SELECT email, vip_until FROM users WHERE id = ?",
        [userId]
      );

      // Enviamos email de confirmación de forma no bloqueante
      if (filaUsuario[0]) {
        const hasta = new Date(filaUsuario[0].vip_until).toLocaleDateString("es-ES");
        enviarEmailConfirmacionVIP(filaUsuario[0].email, planId, hasta).catch((err) =>
          console.error("[PAYMENTS] Error enviando email confirmación:", err)
        );
      }

      console.log(`[PAYMENTS SYNC] ✅ Suscripción activada → Usuario ${userId} | Plan ${planId}`);
      return res.json({ success: true, message: "Suscripción activada exitosamente" });
    }

    // Si el pago no está aprobado, lo informamos
    return res.json({
      success: false,
      status: pago.status,
      message: `Estado del pago: ${pago.status}`,
    });
  } catch (error: any) {
    console.error("[PAYMENTS SYNC] Error sincronizando pago:", error);
    return res.status(500).json({ error: "Error al sincronizar: " + error.message });
  }
});

// ─── POST /api/payments/webhook ──────────────────────────────────────────────
/**
 * Webhook de Mercado Pago: procesa las notificaciones automáticas de pagos.
 * MP envía una petición POST a esta URL cuando un pago cambia de estado.
 * IMPORTANTE: Responde 200 inmediatamente y procesa de forma asíncrona.
 */
router.post("/webhook", async (req, res) => {
  // Respondemos 200 inmediatamente para que MP no reintente la notificación
  // MP espera una respuesta rápida; si tardamos, asume error y reintenta
  res.status(200).send("OK");

  try {
    const { query, body } = req;

    // Extraemos el topic y el ID del pago de la notificación
    // MP puede enviarlos de diferentes formas según la versión del webhook
    const topic = query.topic || query.type || body.type || body.topic;
    const id = query.id || query["data.id"] || body?.data?.id || body.id;

    // Si no hay ID, no podemos procesar la notificación
    if (!id) {
      console.warn("[WEBHOOK] Notificación sin ID. Ignorando.");
      return;
    }

    // Registramos el webhook en la BD para auditoría y debugging
    await pool.query(
      "INSERT INTO webhook_logs (topic, resource_id, raw_body) VALUES (?, ?, ?)",
      [topic || "unknown", String(id), JSON.stringify({ query: req.query, body: req.body })]
    ).catch((err) => console.error("[WEBHOOK] Error guardando log:", err));

    // Solo procesamos notificaciones de tipo 'payment'
    if (topic && topic !== "payment" && topic !== "payment.updated") {
      console.log(`[WEBHOOK] Topic '${topic}' ignorado. Solo procesamos 'payment'.`);
      return;
    }

    // Obtenemos los detalles completos del pago desde la API de MP
    const mpClient = getMercadoPagoClient();
    const paymentClient = new Payment(mpClient);
    const pago = await paymentClient.get({ id: String(id) });

    // Solo activamos suscripciones si el pago está aprobado
    if (pago.status === "approved" && pago.external_reference) {
      console.log(`[WEBHOOK] Pago aprobado: ${id} | Ref: ${pago.external_reference}`);

      const refExterna =
        typeof pago.external_reference === "string" ? pago.external_reference : "";

      // Parseamos la referencia externa
      const [, userId, planId, period, promoCode] = refExterna.split(":");

      // Activamos la suscripción del usuario
      await activarSuscripcion({
        userId,
        planId,
        period: period || "mensual",
        amount: pago.transaction_amount,
        currency: pago.currency_id,
        paymentMethod: pago.payment_method_id,
        promoCode,
      });

      // Enviamos email de confirmación VIP de forma asíncrona
      const [filaUsuario]: any = await pool.query(
        "SELECT email, vip_until FROM users WHERE id = ?",
        [userId]
      );
      if (filaUsuario[0]) {
        const hasta = new Date(filaUsuario[0].vip_until).toLocaleDateString("es-ES");
        enviarEmailConfirmacionVIP(filaUsuario[0].email, planId, hasta).catch(console.error);
      }

      console.log(`[WEBHOOK] ✅ Suscripción activada → Usuario ${userId}`);
    } else {
      console.log(`[WEBHOOK] Pago ${id} tiene estado '${pago.status}'. No se activa suscripción.`);
    }
  } catch (error) {
    // Solo logueamos el error, no respondemos (ya enviamos 200)
    console.error("[WEBHOOK] Error procesando notificación:", error);
  }
});

// Exportamos el router
export default router;
