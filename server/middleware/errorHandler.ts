/**
 * @file errorHandler.ts
 * @description Middleware global de manejo de errores no capturados.
 * Centraliza la respuesta de error para que todos los endpoints
 * tengan un formato consistente en caso de fallo inesperado.
 */

import { Request, Response, NextFunction } from "express";

/**
 * Interfaz para errores personalizados con código HTTP.
 */
interface AppError extends Error {
  /** Código HTTP del error (ej: 400, 404, 500) */
  statusCode?: number;
}

/**
 * Middleware de manejo de errores global de Express.
 * Debe registrarse DESPUÉS de todas las rutas con app.use(errorHandler).
 * Express lo reconoce como error handler por tener 4 parámetros (err, req, res, next).
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Determinamos el código HTTP: usamos el del error si existe, sino 500
  const statusCode = err.statusCode || 500;

  // En producción no exponemos detalles del error al cliente
  const esProduccion = process.env.NODE_ENV === "production";

  // Siempre imprimimos el error completo en el server para debugging
  console.error(
    `[ERROR] ${req.method} ${req.path} → ${statusCode}:`,
    err.message,
    esProduccion ? "" : err.stack
  );

  // Enviamos respuesta de error al cliente
  res.status(statusCode).json({
    /** Indica que hubo un error */
    error: err.message || "Error interno del servidor",

    /** En desarrollo incluimos el stack trace para facilitar el debugging */
    ...(esProduccion ? {} : { stack: err.stack }),
  });
};

/**
 * Middleware para rutas no encontradas (404).
 * Registrar JUSTO ANTES del error handler, DESPUÉS de todas las rutas.
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  console.warn(`[404] Ruta no encontrada: ${req.method} ${req.path}`);
  res.status(404).json({
    error: `La ruta ${req.method} ${req.path} no existe en este servidor`,
  });
};
