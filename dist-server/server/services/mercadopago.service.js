/**
 * @file mercadopago.service.ts
 * @description Servicio de utilidades para Mercado Pago.
 * Contiene la lógica compartida de tipo de cambio (USD→COP)
 * y la activación de suscripciones de usuario tras un pago aprobado.
 */
import { MercadoPagoConfig } from "mercadopago";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
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
 * Obtiene una instancia configurada del cliente de Mercado Pago.
 * Usa el token más reciente desde las variables de entorno (evita stale secrets).
 */
export function getMercadoPagoClient() {
    const token = env.MERCADOPAGO_ACCESS_TOKEN;
    // Advertimos si el token no está configurado
    if (!token) {
        console.error("[MP] ❌ MERCADOPAGO_ACCESS_TOKEN no configurado");
    }
    return new MercadoPagoConfig({ accessToken: token });
}
