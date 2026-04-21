/**
 * @file rateLimiter.ts
 * @description Middleware para limitar la tasa de peticiones (Rate Limiting).
 * Protege la API contra ataques de fuerza bruta y denegación de servicio.
 */

import rateLimit from "express-rate-limit";

/**
 * Limitador general para toda la API.
 * Permite 100 peticiones cada 15 minutos por IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Límite de 100 peticiones por ventana
  standardHeaders: true, // Retorna info en headers 'RateLimit-*'
  legacyHeaders: false, // Deshabilita headers 'X-RateLimit-*'
  message: {
    error: "Demasiadas peticiones desde esta IP, por favor inténtalo más tarde.",
  },
});

/**
 * Limitador estricto para rutas sensibles (Login y Registro).
 * Permite solo 10 intentos cada hora por IP.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // Límite de 10 intentos
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiados intentos de acceso sospechosos. Esta IP ha sido restringida temporalmente.",
  },
});
