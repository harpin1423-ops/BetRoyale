/**
 * @file rateLimiter.ts
 * @description Middleware para limitar la tasa de peticiones (Rate Limiting).
 * Protege la API contra ataques de fuerza bruta y denegación de servicio.
 */

import rateLimit from "express-rate-limit";

/**
 * Limitador general para toda la API.
 * Permite 1000 peticiones cada 15 minutos por IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  // Permitimos navegación normal, polling de paneles y uso de admin sin bloquear usuarios reales.
  max: 1000,
  standardHeaders: true, // Retorna info en headers 'RateLimit-*'
  legacyHeaders: false, // Deshabilita headers 'X-RateLimit-*'
  message: {
    error: "Demasiadas peticiones desde esta IP, por favor inténtalo más tarde.",
  },
});

/**
 * Limitador estricto para intentos de login.
 * Permite 20 intentos fallidos cada 15 minutos por IP.
 */
export const loginLimiter = rateLimit({
  // Ventana corta para frenar fuerza bruta sin bloquear el uso normal demasiado tiempo.
  windowMs: 15 * 60 * 1000,
  // Límite de intentos fallidos por ventana.
  max: 20,
  // Los logins exitosos no deben consumir el cupo del usuario legítimo.
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiados intentos de acceso sospechosos. Esta IP ha sido restringida temporalmente.",
  },
});

/**
 * Limitador estricto para creación de cuentas.
 * Permite 10 registros cada hora por IP.
 */
export const registerLimiter = rateLimit({
  // Usamos una ventana más larga porque el registro es una acción menos frecuente.
  windowMs: 60 * 60 * 1000,
  // Límite de cuentas creadas o intentadas por IP.
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiados registros desde esta IP. Inténtalo más tarde.",
  },
});
