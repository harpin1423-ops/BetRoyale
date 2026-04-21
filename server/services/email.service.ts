/**
 * @file email.service.ts
 * @description Servicio de envío de correos electrónicos con Nodemailer.
 * Maneja el envío de emails transaccionales:
 * - Bienvenida al registrarse
 * - Recuperación de contraseña
 * - Confirmación de suscripción VIP
 */

import nodemailer from "nodemailer";
import { env } from "../config/env.js";

// ─── Configuración del transporter ───────────────────────────────────────────

/**
 * Crea y configura el transporter de Nodemailer.
 * Si las credenciales SMTP no están configuradas, retorna null
 * y el sistema funciona sin envío de correos (no bloquea el registro).
 */
function crearTransporter(): nodemailer.Transporter | null {
  // Si no hay credenciales SMTP, el servicio de email está deshabilitado
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.warn(
      "[EMAIL] Variables SMTP no configuradas. El envío de emails está deshabilitado."
    );
    return null;
  }

  // Creamos el transporter con la configuración SMTP
  return nodemailer.createTransport({
    /** Dirección del servidor SMTP (ej: smtp.gmail.com) */
    host: env.SMTP_HOST,

    /** Puerto SMTP: 587 para STARTTLS, 465 para SSL */
    port: env.SMTP_PORT,

    /** true si el puerto es 465 (SSL directo), false para STARTTLS */
    secure: env.SMTP_PORT === 465,

    /** Credenciales de autenticación */
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    /** Configuración TLS: Necesaria para algunos entornos de hosting */
    tls: {
      rejectUnauthorized: false
    }
  });
}

/** Instancia única del transporter (puede ser null si SMTP no está configurado) */
const transporter = crearTransporter();

// ─── Funciones de envío ───────────────────────────────────────────────────────

/**
 * Función genérica para enviar un email.
 * Si SMTP no está configurado, solo registra un log y retorna sin error.
 *
 * @param para    - Dirección de email del destinatario
 * @param asunto  - Asunto del correo
 * @param html    - Contenido HTML del correo
 */
async function enviarEmail(para: string, asunto: string, html: string): Promise<void> {
  // Si el transporter no está disponible, no enviamos pero tampoco fallamos
  if (!transporter) {
    console.log(`[EMAIL] (deshabilitado) Habría enviado a ${para}: ${asunto}`);
    return;
  }

  try {
    // Enviamos el correo con el transporter configurado
    const info = await transporter.sendMail({
      /** Remitente configurado en las variables de entorno */
      from: env.SMTP_FROM,
      /** Destinatario */
      to: para,
      /** Asunto del correo */
      subject: asunto,
      /** Contenido HTML del correo */
      html,
    });

    console.log(`[EMAIL] ✅ Enviado a ${para} | ID: ${info.messageId}`);
  } catch (error: any) {
    // Registramos el error completo en consola para depuración
    console.error(`[EMAIL] ❌ Error enviando a ${para}:`, {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
  }
}

// ─── Templates de email ───────────────────────────────────────────────────────

/**
 * Template HTML base para todos los correos de BetRoyale Club.
 * Diseño oscuro, moderno y branded con el estilo de la plataforma.
 *
 * @param contenido - Contenido HTML interno del correo
 * @returns HTML completo del email
 */
function templateBase(contenido: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BetRoyale Club</title>
</head>
<body style="margin:0; padding:0; background:#0a0a0a; font-family:'Segoe UI', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#111827; border-radius:16px; overflow:hidden; border:1px solid #1f2937;">
          
          <!-- Header con logo -->
          <tr>
            <td style="background:linear-gradient(135deg,#065f46,#0d9488); padding:32px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:28px; font-weight:800; letter-spacing:2px;">
                👑 BETROYALE CLUB
              </h1>
              <p style="margin:8px 0 0; color:rgba(255,255,255,0.8); font-size:14px;">
                Invirtiendo con Inteligencia
              </p>
            </td>
          </tr>

          <!-- Contenido dinámico -->
          <tr>
            <td style="padding:32px 40px; color:#e5e7eb; line-height:1.6; font-size:15px;">
              ${contenido}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0a0a0a; padding:24px 40px; border-top:1px solid #1f2937; text-align:center;">
              <p style="margin:0; color:#6b7280; font-size:12px;">
                BetRoyale Club · La información proporcionada es solo para entretenimiento.<br>
                El juego puede ser adictivo. Juega con responsabilidad.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// ─── Emails específicos ───────────────────────────────────────────────────────

/**
 * Envía el email de bienvenida a un nuevo usuario registrado.
 *
 * @param email - Correo del nuevo usuario
 */
export async function enviarEmailBienvenida(email: string): Promise<void> {
  // Definimos el asunto del correo de bienvenida
  const asunto = "¡Bienvenido a BetRoyale Club! 👑";

  // Construimos el contenido HTML del email usando el template base
  const contenido = `
    <h2 style="color:#34d399; margin:0 0 16px;">¡Ya eres parte del Club! 🎉</h2>
    <p>Hola, <strong style="color:#fff;">${email}</strong></p>
    <p>Tu cuenta en <strong style="color:#34d399;">BetRoyale Club</strong> ha sido creada exitosamente. 
    Ya tienes acceso a nuestros <strong>Picks Gratuitos</strong> de alta calidad.</p>

    <div style="background:#1f2937; border-radius:12px; padding:20px; margin:24px 0; border-left:4px solid #34d399;">
      <h3 style="color:#34d399; margin:0 0 12px;">¿Qué puedes hacer ahora?</h3>
      <ul style="margin:0; padding-left:20px; color:#d1d5db;">
        <li>✅ Ver los picks gratuitos diarios</li>
        <li>📊 Consultar las estadísticas históricas</li>
        <li>📱 Unirte al canal de Telegram gratuito</li>
        <li>👑 Actualizar a VIP para acceder a picks premium</li>
      </ul>
    </div>

    <p>¿Listo para empezar a invertir con inteligencia?</p>
    <a href="${env.APP_URL}" 
       style="display:inline-block; background:linear-gradient(135deg,#065f46,#0d9488); color:#fff; 
              padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:700; 
              font-size:16px; margin-top:8px;">
      🚀 Ir al Dashboard
    </a>
    <br><br>
    <p style="color:#6b7280; font-size:13px;">
      Si no creaste esta cuenta, puedes ignorar este correo.
    </p>
  `;

  // Enviamos el correo usando la función genérica
  await enviarEmail(email, asunto, templateBase(contenido));
}

/**
 * Envía un correo con el link para restablecer la contraseña.
 *
 * @param email - Correo del usuario que solicitó el reset
 * @param token - Token de restablecimiento (corto tiempo de vida)
 */
export async function enviarEmailRecuperacion(
  email: string,
  token: string
): Promise<void> {
  // Construimos la URL de reset con el token
  const urlReset = `${env.APP_URL}/reset-password?token=${token}`;

  // Asunto del correo de recuperación
  const asunto = "Recupera tu contraseña — BetRoyale Club";

  // Contenido del correo
  const contenido = `
    <h2 style="color:#f59e0b; margin:0 0 16px;">🔑 Recupera tu acceso</h2>
    <p>Hola, recibimos una solicitud para restablecer la contraseña de <strong style="color:#fff;">${email}</strong>.</p>
    <p>Haz clic en el botón para crear una nueva contraseña. 
    Este enlace es válido por <strong>1 hora</strong>.</p>

    <a href="${urlReset}" 
       style="display:inline-block; background:linear-gradient(135deg,#d97706,#f59e0b); color:#fff; 
              padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:700; 
              font-size:16px; margin:16px 0;">
      🔑 Restablecer Contraseña
    </a>

    <p style="color:#6b7280; font-size:13px; margin-top:16px;">
      Si no solicitaste esto, ignora este correo. Tu contraseña actual seguirá siendo la misma.
    </p>
    <p style="color:#6b7280; font-size:12px; word-break:break-all;">
      O copia y pega esta URL en tu navegador:<br>
      <span style="color:#34d399;">${urlReset}</span>
    </p>
  `;

  await enviarEmail(email, asunto, templateBase(contenido));
}

/**
 * Envía confirmación de activación de suscripción VIP al usuario.
 *
 * @param email   - Correo del usuario
 * @param planId  - Nombre del plan activado
 * @param hasta   - Fecha de vencimiento de la suscripción
 */
export async function enviarEmailConfirmacionVIP(
  email: string,
  planId: string,
  hasta: string
): Promise<void> {
  const asunto = "✅ Suscripción VIP Activada — BetRoyale Club";

  const contenido = `
    <h2 style="color:#34d399; margin:0 0 16px;">🎉 ¡Ya eres VIP!</h2>
    <p>Hola, <strong style="color:#fff;">${email}</strong></p>
    <p>Tu suscripción <strong style="color:#34d399;">${planId}</strong> ha sido activada exitosamente.</p>

    <div style="background:#1f2937; border-radius:12px; padding:20px; margin:24px 0; border-left:4px solid #fbbf24;">
      <p style="margin:0; color:#fbbf24; font-weight:700;">
        📅 Tu acceso VIP está activo hasta: ${hasta}
      </p>
    </div>

    <p>Ahora tienes acceso a:</p>
    <ul style="color:#d1d5db;">
      <li>⭐ Picks VIP con cuotas mínimas garantizadas</li>
      <li>📊 Análisis detallado con IA por cada pick</li>
      <li>📱 Canal exclusivo de Telegram VIP</li>
      <li>📈 Panel de rendimiento personalizado</li>
    </ul>

    <a href="${env.APP_URL}/vip-picks" 
       style="display:inline-block; background:linear-gradient(135deg,#b45309,#fbbf24); color:#fff; 
              padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:700; font-size:16px;">
      👑 Ver mis Picks VIP
    </a>
  `;

  await enviarEmail(email, asunto, templateBase(contenido));
}
