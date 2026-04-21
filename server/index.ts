/**
 * @file server/index.ts
 * @description Configuración y arranque del servidor Express.
 * Este archivo orquesta todos los módulos del backend:
 * middlewares, rutas y configuración del servidor Vite para desarrollo.
 * Es el punto de ensamblaje de la aplicación.
 */

import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import path from "path";
import helmet from "helmet";

// ─── Importamos la configuración central ─────────────────────────────────────
import { env } from "./config/env.js";
import { pool } from "./config/database.js";
import { initDB } from "./db/schema.js";

// ─── Importamos los middlewares ────────────────────────────────────────────────
import { requestLogger, apiLogger } from "./middleware/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

// ─── Importamos los routers de cada dominio ───────────────────────────────────
import authRouter from "./routes/auth.routes.js";
import picksRouter from "./routes/picks.routes.js";
import usersRouter from "./routes/users.routes.js";
import { leaguesRouter, countriesRouter } from "./routes/leagues.routes.js";
import marketsRouter from "./routes/markets.routes.js";
import paymentsRouter from "./routes/payments.routes.js";
import statsRouter from "./routes/stats.routes.js";
import promoCodesRouter from "./routes/promoCodes.routes.js";
import pickTypesRouter from "./routes/pickTypes.routes.js";
import telegramRouter from "./routes/telegram.routes.js";
import { teamsRouter } from "./routes/teams.routes.js";
import { apiLimiter } from "./middleware/rateLimiter.js";

/**
 * Crea y configura la instancia del servidor Express,
 * registra todos los middlewares y rutas, y arranca el servidor.
 */
export async function startServer(): Promise<void> {
  console.log("🚀 Iniciando servidor BetRoyale...");
  // ── Inicialización de la base de datos ──────────────────────────────────────
  // Aseguramos que el esquema de BD esté listo antes de recibir requests
  await initDB();
  console.log("✅ Base de datos inicializada");

  // ── Creación de la aplicación Express ───────────────────────────────────────
  const app = express();

  // Confiamos en el primer proxy para que el rate limit use la IP real en Hostinger.
  app.set("trust proxy", 1);

  // ── Middlewares globales de Seguridad ──────────────────────────────────────

  /** Helmet: Cabeceras de seguridad para proteger contra ataques comunes */
  app.use(
    helmet({
      contentSecurityPolicy: false, // Deshabilitado para permitir recursos externos dinámicos
      crossOriginEmbedderPolicy: false,
    })
  );

  /** Deshabilitar cabeceras que revelan tecnología del servidor */
  app.disable("x-powered-by");

  // CORS: Restringido en producción al dominio oficial
  const allowedOrigin =
    env.NODE_ENV === "production" ? "https://betroyaleclub.com" : "*";
  app.use(
    cors({
      origin: allowedOrigin,
      credentials: true,
    })
  );

  // Parseador JSON: necesario para leer req.body en las rutas POST/PUT
  app.use(express.json());

  // Rate Limiting: General para toda la API
  app.use("/api", apiLimiter);

  // Logger: registra cada request HTTP con duración y status code
  app.use(requestLogger);

  // Logger específico de API: log adicional para rutas /api/*
  app.use("/api/*", apiLogger);

  // ── Rutas de la API ──────────────────────────────────────────────────────────
  // Cada dominio tiene su propio prefijo de ruta

  /** Autenticación: registro, login, perfil. Los límites sensibles viven por ruta */
  app.use("/api/auth", authRouter);

  /** Perfil y métricas del usuario autenticado */
  app.use("/api/user", usersRouter);

  /** Gestión de usuarios (admin) — comparte router pero diferente prefijo */
  app.use("/api/users", usersRouter);

  /** Gestión de tipos de pick y configuración de Telegram */
  app.use("/api/pick-types", pickTypesRouter);

  /** Picks deportivos: CRUD + tracking + estado */
  app.use("/api/picks", picksRouter);

  /** Ligas deportivas */
  app.use("/api/leagues", leaguesRouter);

  /** Países (flags y nombres) */
  app.use("/api/countries", countriesRouter);

  /** Equipos deportivos por liga */
  app.use("/api/teams", teamsRouter);

  /** Mercados de apuestas (Gana Local, AEM, +2.5, etc.) */
  app.use("/api/markets", marketsRouter);

  /** Sistema de pagos Mercado Pago: preferencia + sync + webhook */
  app.use("/api/payments", paymentsRouter);

  /** Estadísticas: rendimiento, yield mensual, ingresos, avanzadas, historial */
  app.use("/api/stats", statsRouter);

  /** Códigos promocionales de descuento */
  app.use("/api/promo-codes", promoCodesRouter);

  /** Webhook de Telegram para marcar invites VIP como usados */
  app.use("/api/telegram", telegramRouter);

  /** Health check: verificación rápida de que el servidor está activo */
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  /** Test de conexión a la BD: útil durante desarrollo */
  app.get("/api/test-db", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "success", message: "Conexión a MySQL exitosa" });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        message: "Error conectando a MySQL",
        details: error.message,
      });
    }
  });

  // ── Configuración del servidor de archivos estáticos ─────────────────────────

  if (env.NODE_ENV !== "production") {
    // En desarrollo: usamos el middleware de Vite para HMR (Hot Module Replacement)
    console.log("[SERVER] Modo desarrollo: iniciando Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // En producción: servimos los archivos estáticos compilados por Vite
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    // Todas las rutas no-API responden con index.html (SPA routing)
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ── Middlewares de manejo de errores ─────────────────────────────────────────
  // DEBEN registrarse DESPUÉS de todas las rutas

  /** Handler de rutas no encontradas (404) */
  app.use(notFoundHandler);

  /** Handler global de errores no capturados */
  app.use(errorHandler);

  // ── Arranque del servidor ─────────────────────────────────────────────────────
  const PORT = env.PORT;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 BetRoyale Server corriendo en http://localhost:${PORT}`);
    console.log(`📊 Entorno: ${env.NODE_ENV}`);
    console.log(`🗄️  Base de datos: ${env.DB_NAME}@${env.DB_HOST}\n`);
  });
}
