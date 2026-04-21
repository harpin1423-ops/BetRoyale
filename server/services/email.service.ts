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
    // RE-LANZAMOS el error para que la ruta de la API pueda detectarlo
    throw error;
  }
}

// ─── Templates de email ───────────────────────────────────────────────────────

/**
 * Template HTML base para todos los correos de BetRoyale Club.
 * Diseño premium, oscuro, con el nuevo logo y estética SaaS.
 *
 * @param contenido - Contenido HTML interno del correo
 * @param para      - Email del destinatario (opcional, para personalización de soporte)
 * @returns HTML completo del email
 */
function templateBase(contenido: string, para: string = ""): string {
  // URL del logo guardado en public
  const logoUrl = `${env.APP_URL}/logo_premium.jpg`;
  
  // Link de soporte WhatsApp con mensaje predefinido
  const msjSoporte = encodeURIComponent(`Hola BetRoyale, necesito soporte para mi cuenta (${para}).`);
  const whatsappUrl = `https://wa.me/573150730901?text=${msjSoporte}`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BetRoyale Club</title>
</head>
<body style="margin:0; padding:0; background-color:#0a0a0a; font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" maxWidth="600" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#141414; border-radius:24px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
          
          <!-- Header con Logo Premium (Más grande y sin recorte) -->
          <tr>
            <td style="padding:48px 32px 32px; text-align:center;">
              <a href="${env.APP_URL}" target="_blank" style="text-decoration:none;">
                <img src="${logoUrl}" alt="BetRoyale Club" width="220" style="width:220px; height:auto; display:block; margin:0 auto;">
              </a>
            </td>
          </tr>

          <!-- Contenido dinámico -->
          <tr>
            <td style="padding:0 48px 48px; color:#ffffff; line-height:1.7; font-size:16px;">
              ${contenido}
            </td>
          </tr>

          <!-- Sección de Soporte WhatsApp -->
          <tr>
            <td style="padding:0 48px 48px; text-align:center;">
              <div style="background:rgba(255,255,255,0.03); border-radius:16px; padding:24px; border:1px dashed rgba(255,255,255,0.1);">
                <p style="margin:0 0 12px; color:#9ca3af; font-size:14px;">¿Tienes alguna duda o problema?</p>
                <a href="${whatsappUrl}" 
                   style="color:#34d399; text-decoration:none; font-weight:700; font-size:15px; display:inline-flex; align-items:center;">
                   💬 Hablar con Soporte por WhatsApp
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer con Redes y Links -->
          <tr>
            <td style="background-color:#000000; padding:40px; border-top:1px solid rgba(255,255,255,0.05); text-align:center;">
              <div style="margin-bottom:24px;">
                <a href="${env.APP_URL}" style="color:#ffffff; text-decoration:none; font-weight:600; font-size:14px; margin:0 15px;">Sitio Web</a>
                <a href="${env.TELEGRAM_FREE_INVITE_LINK || '#'}" style="color:#EAB308; text-decoration:none; font-weight:600; font-size:14px; margin:0 15px;">Acceder al Grupo FREE</a>
              </div>
              <p style="margin:0; color:#4b5563; font-size:12px; line-height:1.5;">
                &copy; ${new Date().getFullYear()} BetRoyale Club. Todos los derechos reservados.<br>
                Inversión deportiva inteligente.<br><br>
                <span style="opacity:0.6;">La información proporcionada es solo para fines informativos y de entretenimiento. El juego es para mayores de 18 años. Juega con responsabilidad.</span>
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
 */
export async function enviarEmailBienvenida(email: string): Promise<void> {
  const asunto = "Bienvenido a la Élite: BetRoyale Club 👑";

  const contenido = `
    <div style="text-align:center; margin-bottom:32px;">
      <h1 style="margin:0; font-size:28px; font-weight:800; color:#fff;">¡Bienvenido al Club! 🎉</h1>
      <p style="color:#9ca3af; margin-top:8px;">Hola, <span style="color:#ffffff;">${email}</span></p>
    </div>

    <p style="font-size:16px; color:#d1d5db;">Tu cuenta ha sido creada con éxito. Ahora tienes acceso a la plataforma de análisis deportivo más avanzada.</p>

    <div style="background:rgba(234, 179, 8, 0.1); border-radius:16px; padding:24px; margin:32px 0; border:1px solid rgba(234, 179, 8, 0.2);">
      <h3 style="color:#EAB308; margin:0 0 16px; font-size:18px;">Primeros pasos:</h3>
      <div style="color:#d1d5db; font-size:15px; margin-bottom:8px;">✅ Accede a tus <strong style="color:#fff;">Picks Gratuitos</strong></div>
      <div style="color:#d1d5db; font-size:15px; margin-bottom:8px;">📈 Revisa el historial de rendimiento</div>
      <div style="color:#d1d5db; font-size:15px;">👑 Mejora a <strong style="color:#EAB308;">VIP</strong> para el máximo profit</div>
    </div>

    <div style="text-align:center; margin-top:40px;">
      <a href="${env.APP_URL}" 
         style="display:inline-block; background-color:#EAB308; color:#000000; 
                padding:18px 40px; border-radius:12px; text-decoration:none; 
                font-weight:800; font-size:16px; transition: all 0.3s ease;">
        Comenzar Ahora
      </a>
    </div>
  `;

  await enviarEmail(email, asunto, templateBase(contenido, email));
}

/**
 * Envía un correo con el link para restablecer la contraseña.
 */
export async function enviarEmailRecuperacion(email: string, token: string): Promise<void> {
  const urlReset = `${env.APP_URL}/reset-password?token=${token}`;
  const asunto = "Restablece tu contraseña — BetRoyale Club";

  const contenido = `
    <div style="text-align:center; margin-bottom:32px;">
      <h1 style="margin:0; font-size:28px; font-weight:800; color:#fff;">Recupera tu acceso 🔑</h1>
      <p style="color:#9ca3af; margin-top:8px;">Recibimos una solicitud para restablecer tu cuenta.</p>
    </div>

    <p style="font-size:16px; color:#d1d5db;">Hola, para crear una nueva contraseña haz clic en el botón de abajo. Por seguridad, este enlace expirará en 60 minutos.</p>

    <div style="text-align:center; margin:40px 0;">
      <a href="${urlReset}" 
         style="display:inline-block; background-color:#EAB308; color:#000000; 
                padding:18px 40px; border-radius:12px; text-decoration:none; 
                font-weight:800; font-size:16px;">
        Restablecer Contraseña
      </a>
    </div>

    <p style="color:#6b7280; font-size:13px; text-align:center;">
      Si no solicitaste este cambio, puedes ignorar este correo sin problemas.
    </p>

    <div style="margin-top:40px; padding-top:24px; border-top:1px solid rgba(255,255,255,0.05);">
       <p style="color:#4b5563; font-size:12px; word-break:break-all; text-align:center;">
        ¿El botón no funciona? Copia y pega esto:<br>
        <span style="color:#EAB308;">${urlReset}</span>
      </p>
    </div>
  `;

  await enviarEmail(email, asunto, templateBase(contenido, email));
}

/**
 * Envía un correo de confirmación de que la contraseña ha sido cambiada.
 */
export async function enviarEmailConfirmacionClave(email: string): Promise<void> {
  const asunto = "Tu contraseña ha sido actualizada — BetRoyale Club";

  const contenido = `
    <div style="text-align:center; margin-bottom:32px;">
      <h1 style="margin:0; font-size:28px; font-weight:800; color:#fff;">Seguridad Actualizada ✅</h1>
      <p style="color:#9ca3af; margin-top:8px;">Hola, <span style="color:#ffffff;">${email}</span></p>
    </div>

    <p style="font-size:16px; color:#d1d5db; text-align:center;">Te informamos que la contraseña de tu cuenta ha sido modificada correctamente.</p>

    <div style="background:rgba(52, 211, 153, 0.1); border-radius:16px; padding:24px; margin:32px 0; border:1px solid rgba(52, 211, 153, 0.2); text-align:center;">
      <p style="color:#34d399; margin:0; font-weight:600;">Este cambio se realizó de forma exitosa.</p>
    </div>

    <p style="color:#9ca3af; font-size:14px; text-align:center;">
      Si <strong>NO</strong> realizaste este cambio, por favor contacta a nuestro soporte de inmediato para proteger tu cuenta.
    </p>

    <div style="text-align:center; margin-top:40px;">
      <a href="${env.APP_URL}/login" 
         style="display:inline-block; border:1px solid #EAB308; color:#EAB308; 
                padding:14px 32px; border-radius:12px; text-decoration:none; 
                font-weight:700; font-size:15px;">
        Entrar a mi Cuenta
      </a>
    </div>
  `;

  await enviarEmail(email, asunto, templateBase(contenido, email));
}

/**
 * Envía confirmación de activación de suscripción VIP.
 */
export async function enviarEmailConfirmacionVIP(email: string, planId: string, hasta: string): Promise<void> {
  const asunto = "¡Bienvenido a la Élite VIP! 👑 — BetRoyale Club";

  const contenido = `
    <div style="text-align:center; margin-bottom:32px;">
      <h1 style="margin:0; font-size:28px; font-weight:800; color:#EAB308;">¡Acceso VIP Activado! 👑</h1>
      <p style="color:#9ca3af; margin-top:8px;">Tu estatus ha sido elevado.</p>
    </div>

    <p style="font-size:16px; color:#d1d5db;">Hola, es un honor tenerte en el grupo exclusivo. Tu suscripción <strong style="color:#fff;">${planId}</strong> ya está activa.</p>

    <div style="background:linear-gradient(135deg, rgba(234,179,8,0.1), rgba(0,0,0,0)); border-radius:16px; padding:24px; margin:32px 0; border:1px solid rgba(234, 179, 8, 0.3);">
      <p style="margin:0; color:#EAB308; font-weight:700; font-size:18px;">
        📅 Válido hasta: ${hasta}
      </p>
    </div>

    <p style="margin-bottom:24px; color:#fff; font-weight:600;">Tu arsenal de inversión ahora incluye:</p>
    <div style="color:#d1d5db; font-size:15px; margin-bottom:12px;">🏆 Picks de Alta Probabilidad</div>
    <div style="color:#d1d5db; font-size:15px; margin-bottom:12px;">📊 Análisis Profundo con Gemini IA</div>
    <div style="color:#d1d5db; font-size:15px; margin-bottom:12px;">📱 Canal de Telegram Privado</div>

    <div style="text-align:center; margin-top:40px;">
      <a href="${env.APP_URL}/dashboard" 
         style="display:inline-block; background-color:#EAB308; color:#000000; 
                padding:18px 40px; border-radius:12px; text-decoration:none; 
                font-weight:800; font-size:16px;">
        Ver Picks de Hoy
      </a>
    </div>
  `;

  await enviarEmail(email, asunto, templateBase(contenido, email));
}
