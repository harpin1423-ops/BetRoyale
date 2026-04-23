/**
 * @file mercadopago.service.ts
 * @description Servicio de utilidades para Mercado Pago.
 * Contiene la lógica compartida de tipo de cambio (USD→COP)
 * y la activación de suscripciones de usuario tras un pago aprobado.
 */
import { env } from "../config/env.js";
import { pool } from "../config/database.js";
// ─── Configuración base de la API REST de Mercado Pago ──────────────────────
// Definimos la URL base oficial para las llamadas backend a Mercado Pago.
const MERCADOPAGO_API_BASE_URL = "https://api.mercadopago.com";
// ─── Cache de tasa de cambio ─────────────────────────────────────────────────
/**
 * Cache en memoria para la tasa de cambio USD→COP.
 * Se actualiza máximo una vez por hora para evitar llamadas excesivas a la API.
 */
let tasaCache = null;
/**
 * Obtiene la tasa de cambio actual de USD a COP desde una API externa.
 * Utiliza caché de 1 hora para minimizar las llamadas externas.
 *
 * @returns Tasa de cambio USD/COP. En caso de error, retorna un valor de respaldo (4000).
 */
export async function obtenerTasaCambio() {
    const ahora = Date.now();
    const UNA_HORA_MS = 3_600_000;
    // Si tenemos una tasa en caché y no ha expirado, la devolvemos
    if (tasaCache && ahora - tasaCache.timestamp < UNA_HORA_MS) {
        return tasaCache.valor;
    }
    try {
        // Configuramos un timeout de 5 segundos para la petición
        const controlador = new AbortController();
        const timeoutId = setTimeout(() => controlador.abort(), 5_000);
        // Consultamos la API de tasas de cambio gratuita
        const respuesta = await fetch("https://api.exchangerate-api.com/v4/latest/USD", {
            signal: controlador.signal,
        });
        // Limpiamos el timeout al recibir respuesta
        clearTimeout(timeoutId);
        const datos = (await respuesta.json());
        const tasa = datos.rates.COP;
        // Guardamos en caché con el timestamp actual
        tasaCache = { valor: tasa, timestamp: ahora };
        console.log(`[MP] Tasa de cambio actualizada: 1 USD = ${tasa} COP`);
        return tasa;
    }
    catch (error) {
        // En caso de error de red, usamos un valor de respaldo razonable
        console.error("[MP] Error obteniendo tasa de cambio. Usando respaldo 4000 COP:", error);
        return 4_000;
    }
}
/**
 * Activa o renueva una suscripción VIP de usuario en la base de datos.
 * - Calcula la fecha de vencimiento según el período.
 * - Inserta o actualiza el registro en user_subscriptions.
 * - Actualiza el rol del usuario a 'vip' en la tabla users.
 * - Si se usó un código promo, incrementa su contador de usos.
 *
 * @param params - Parámetros de la activación
 */
export async function activarSuscripcion(params) {
    const { userId, planId, period, amount, currency, paymentMethod, promoCode } = params;
    // ── Calcular días según período ──────────────────────────────────────────
    const diasPorPeriodo = {
        mensual: 30,
        trimestral: 90,
        semestral: 180,
        anual: 365,
    };
    // Si el período no es reconocido, usamos 30 días por defecto
    const dias = diasPorPeriodo[period] || 30;
    // Calculamos la fecha de vencimiento de la suscripción
    const nuevaExpiracion = new Date();
    nuevaExpiracion.setDate(nuevaExpiracion.getDate() + dias);
    const expiracionFormateada = nuevaExpiracion
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
    // Calculamos el equivalente en USD para registro histórico
    const tasa = await obtenerTasaCambio();
    const montoUSD = amount ? (amount / tasa).toFixed(2) : "0.00";
    // ── Insertar o actualizar la suscripción ─────────────────────────────────
    const [subsExistentes] = await pool.query("SELECT id FROM user_subscriptions WHERE user_id = ? AND plan_id = ?", [userId, planId]);
    if (subsExistentes.length > 0) {
        // El usuario ya tenía este plan → renovamos la fecha de vencimiento
        await pool.query(`UPDATE user_subscriptions 
       SET expires_at = ?, amount = ?, payment_method = ?, 
           periodicity = ?, currency = ?, amount_usd = ? 
       WHERE id = ?`, [expiracionFormateada, amount, paymentMethod, period, currency, montoUSD, subsExistentes[0].id]);
    }
    else {
        // Primera vez con este plan → creamos el registro
        await pool.query(`INSERT INTO user_subscriptions 
       (user_id, plan_id, expires_at, amount, payment_method, periodicity, currency, amount_usd) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [userId, planId, expiracionFormateada, amount, paymentMethod, period, currency, montoUSD]);
    }
    // ── Actualizar el rol del usuario en la tabla users ──────────────────────
    // Obtenemos la mayor fecha de vencimiento entre todas sus suscripciones activas
    const [todasSubs] = await pool.query("SELECT MAX(expires_at) as max_expiracion FROM user_subscriptions WHERE user_id = ?", [userId]);
    const maxExpiracion = todasSubs[0].max_expiracion;
    const maxExpiracionFormateada = new Date(maxExpiracion)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
    // Actualizamos el rol a 'vip' y guardamos la fecha límite
    await pool.query(`UPDATE users 
     SET role = 'vip', vip_until = ?, plan_type = ?, 
         vip_since = COALESCE(vip_since, NOW()) 
     WHERE id = ?`, [maxExpiracionFormateada, planId, userId]);
    // ── Incrementar uso del código promo (si se usó uno) ─────────────────────
    if (promoCode) {
        await pool.query("UPDATE promo_codes SET current_uses = current_uses + 1 WHERE code = ?", [promoCode]);
        console.log(`[MP] Código promo '${promoCode}' usado por usuario ${userId}`);
    }
    console.log(`[MP] ✅ Suscripción activada → Usuario ${userId} | Plan ${planId} | Hasta ${expiracionFormateada}`);
}
/**
 * Obtiene el mensaje más claro posible desde una respuesta de error de Mercado Pago.
 *
 * @param payload - Respuesta JSON de error devuelta por la API.
 * @returns Mensaje legible para logs y manejo de errores.
 */
function obtenerMensajeMercadoPago(payload) {
    // Priorizamos el mensaje principal del proveedor cuando existe.
    if (payload?.message) {
        return String(payload.message);
    }
    // Intentamos usar la descripción detallada de la causa técnica.
    if (Array.isArray(payload?.cause) && payload.cause[0]?.description) {
        return String(payload.cause[0].description);
    }
    // Intentamos usar el texto de error estándar si Mercado Pago lo entrega.
    if (payload?.error) {
        return String(payload.error);
    }
    // Dejamos un fallback estable si no vino nada útil.
    return "Error desconocido al consultar Mercado Pago";
}
/**
 * Obtiene los headers autenticados para llamar a la API REST oficial de Mercado Pago.
 *
 * @returns Headers HTTP con autenticación y JSON habilitado.
 */
function construirHeadersMercadoPago() {
    // Leemos el token actual desde el entorno para evitar secretos obsoletos.
    const token = env.MERCADOPAGO_ACCESS_TOKEN;
    // Registramos una advertencia si falta el token privado del servidor.
    if (!token) {
        console.error("[MP] ❌ MERCADOPAGO_ACCESS_TOKEN no configurado");
    }
    // Devolvemos el set mínimo de headers requerido por la API REST.
    return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
}
/**
 * Ejecuta una llamada autenticada contra la API REST oficial de Mercado Pago.
 *
 * @param path - Ruta relativa del endpoint dentro de api.mercadopago.com.
 * @param init - Configuración fetch adicional como método, body o headers.
 * @returns JSON parseado de Mercado Pago.
 */
async function mercadopagoRequest(path, init = {}) {
    // Construimos la URL final del endpoint solicitado.
    const url = `${MERCADOPAGO_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
    // Creamos un AbortController para no dejar requests colgadas.
    const controller = new AbortController();
    // Definimos un timeout razonable para backend y webhooks.
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        // Ejecutamos la llamada autenticada con headers base y overrides puntuales.
        const response = await fetch(url, {
            ...init,
            signal: controller.signal,
            headers: {
                ...construirHeadersMercadoPago(),
                ...(init.headers || {}),
            },
        });
        // Intentamos leer la respuesta como JSON incluso en errores.
        const payload = await response.json().catch(() => null);
        // Cortamos con error tipado si Mercado Pago devolvió status no exitoso.
        if (!response.ok) {
            // Construimos un error enriquecido con status y payload del proveedor.
            const requestError = Object.assign(new Error(obtenerMensajeMercadoPago(payload)), {
                status: response.status,
                payload,
            });
            // Propagamos el error para que la ruta decida el mensaje final.
            throw requestError;
        }
        // Devolvemos el JSON de éxito tal cual lo respondió Mercado Pago.
        return payload;
    }
    finally {
        // Liberamos el timeout en éxito o error.
        clearTimeout(timeoutId);
    }
}
/**
 * Crea una preferencia de pago usando la API REST oficial de Mercado Pago.
 *
 * @param body - Cuerpo completo de la preferencia Checkout Pro.
 * @returns Preferencia creada con sus URLs de checkout.
 */
export async function createMercadoPagoPreference(body) {
    // Enviamos la preferencia al endpoint oficial de Checkout Pro.
    return mercadopagoRequest("/checkout/preferences", {
        method: "POST",
        body: JSON.stringify(body),
    });
}
/**
 * Obtiene el detalle completo de un pago usando su ID oficial en Mercado Pago.
 *
 * @param paymentId - Identificador único del pago en Mercado Pago.
 * @returns Objeto de pago con estado, monto y referencia externa.
 */
export async function getMercadoPagoPayment(paymentId) {
    // Consultamos el pago exacto por ID para sync y webhook.
    return mercadopagoRequest(`/v1/payments/${paymentId}`, {
        method: "GET",
    });
}
