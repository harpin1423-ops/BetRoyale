/**
 * @file server.ts
 * @description Punto de entrada principal del servidor BetRoyale Club.
 *
 * Este archivo es intencionalmente minimalista.
 * Toda la lógica de negocio, rutas, middlewares y configuración
 * ha sido modularizada en el directorio server/ para
 * garantizar mantenibilidad y separación de responsabilidades.
 *
 * Estructura del backend modular:
 *   server/config/     → Variables de entorno y pool de MySQL
 *   server/db/         → Esquema e inicialización de la BD
 *   server/middleware/ → Auth, logger, errorHandler
 *   server/services/   → Telegram, Mercado Pago, Email
 *   server/routes/     → Endpoints de la API REST por dominio
 *   server/index.ts    → Ensamblador del servidor Express
 */

// Importamos y arrancamos el servidor modular con extensión compatible con Node ESM.
import { startServer } from "./server/index.js";

// Iniciamos el servidor (maneja internamente: BD, rutas, middlewares y Vite)
startServer().catch((error) => {
  // Si el servidor no puede arrancar, lo reportamos y terminamos el proceso
  console.error("❌ Error fatal arrancando el servidor:", error);
  process.exit(1);
});
