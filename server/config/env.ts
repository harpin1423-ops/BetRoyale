/**
 * @file env.ts
 * @description Configuración y validación de variables de entorno.
 * Centraliza el acceso a los Secrets del servidor para evitar
 * valores undefined esparcidos por el código.
 */

import dotenv from "dotenv";

// Cargamos las variables de entorno desde el archivo .env
dotenv.config();

/**
 * Objeto con todas las variables de entorno tipadas y con valores por defecto.
 * Si una variable crítica falta, se emite una advertencia en consola.
 */
export const env = {
  // ─── Servidor ───────────────────────────────────────────────────────────────
  /** Puerto en el que escucha el servidor Express */
  PORT: parseInt(process.env.PORT || "3000", 10),

  /** Entorno de ejecución: 'development' | 'production' */
  NODE_ENV: process.env.NODE_ENV || "development",

  /** URL pública de la aplicación (necesaria para webhooks y redirecciones de pago) */
  APP_URL: process.env.APP_URL || "http://localhost:3000",

  // ─── Base de datos ───────────────────────────────────────────────────────────
  /** Host del servidor MySQL */
  DB_HOST: process.env.DB_HOST || "localhost",

  /** Usuario de la base de datos MySQL */
  DB_USER: process.env.DB_USER || "root",

  /** Contraseña del usuario MySQL */
  DB_PASSWORD: process.env.DB_PASSWORD || "",

  /** Nombre de la base de datos */
  DB_NAME: process.env.DB_NAME || "betroyale",

  // ─── Autenticación ───────────────────────────────────────────────────────────
  /** Secreto para firmar los JWT. CAMBIAR en producción */
  JWT_SECRET: process.env.JWT_SECRET || "super-secret-key-change-in-production",

  // ─── Mercado Pago ────────────────────────────────────────────────────────────
  /** Access Token de la API de Mercado Pago */
  MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN || "",

  // ─── Telegram ────────────────────────────────────────────────────────────────
  /** Token del Bot de Telegram, obtenido desde @BotFather */
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",

  /** ID del canal de Telegram para picks gratuitos */
  TELEGRAM_FREE_CHANNEL_ID: process.env.TELEGRAM_FREE_CHANNEL_ID || "",

  /** Enlace de invitación al canal gratuito de Telegram */
  TELEGRAM_FREE_INVITE_LINK: process.env.TELEGRAM_FREE_INVITE_LINK || "#",

  /** ID del canal espejo que recibe todos los picks VIP */
  TELEGRAM_FULL_CHANNEL_ID: process.env.TELEGRAM_FULL_CHANNEL_ID || "",

  /** Enlace de invitación al canal VIP Full */
  TELEGRAM_FULL_INVITE_LINK: process.env.TELEGRAM_FULL_INVITE_LINK || "",

  // ─── Email (Nodemailer) ──────────────────────────────────────────────────────
  /** Host SMTP para envío de correos (ej: smtp.gmail.com) */
  SMTP_HOST: process.env.SMTP_HOST || "",

  /** Puerto SMTP (suele ser 587 para TLS o 465 para SSL) */
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),

  /** Usuario de la cuenta de correo */
  SMTP_USER: process.env.SMTP_USER || "",

  /** Contraseña o App Password del correo */
  SMTP_PASS: process.env.SMTP_PASS || "",

  /** Dirección y nombre del remitente */
  SMTP_FROM: process.env.SMTP_FROM || "BetRoyale Club <noreply@betroyale.club>",
} as const;

// ─── Validación de variables críticas ───────────────────────────────────────
// Advertir si alguna variable crítica de producción no está configurada
if (env.NODE_ENV === "production") {
  const criticas: (keyof typeof env)[] = [
    "JWT_SECRET",
    "MERCADOPAGO_ACCESS_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "APP_URL",
    "DB_HOST",
    "DB_USER",
    "DB_PASSWORD",
    "DB_NAME",
  ];

  criticas.forEach((key) => {
    // Si la variable está vacía o usa el valor por defecto
    const value = env[key];
    const isDefault =
      typeof value === "string" &&
      (value.includes("secret") || value.includes("change-in-production"));

    if (!value || isDefault) {
      console.error(
        `\n[SECURITY FATAL] ❌ La variable de entorno '${key}' es insegura o falta en producción.`
      );
      console.error(
        `Para proteger la plataforma, el servidor NO arrancará hasta que se configure correctamente.\n`
      );
      process.exit(1);
    }
  });
  console.log("🛡️  Validación de seguridad de entorno: EXITOSA");
}
