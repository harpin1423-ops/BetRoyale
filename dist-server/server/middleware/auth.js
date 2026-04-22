/**
 * @file auth.ts
 * @description Middlewares de autenticación y autorización.
 * - authenticateToken: verifica que el JWT sea válido.
 * - requireAdmin: verifica que el usuario autenticado sea admin.
 */
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
/**
 * Middleware: Verifica que el header Authorization contenga un JWT válido.
 * Añade req.user con los datos decodificados si el token es correcto.
 * Responde con 401 si el token falta, expiró o es inválido.
 */
export const authenticateToken = (req, res, next) => {
    // Extraemos el header Authorization
    const authHeader = req.headers["authorization"];
    // El token viene en formato "Bearer <token>"
    const token = authHeader && authHeader.split(" ")[1];
    // Si no hay token, rechazamos la petición inmediatamente
    if (!token) {
        console.warn(`[AUTH] Sin token → ${req.method} ${req.path}`);
        res.status(401).json({ error: "No se proporcionó token de autenticación" });
        return;
    }
    // Verificamos el token con la clave secreta
    jwt.verify(token, env.JWT_SECRET, (err, decoded) => {
        if (err) {
            // No loguemos tokens expirados (son muy comunes y no son errores reales)
            if (err.message !== "jwt expired") {
                console.warn(`[AUTH] Token inválido → ${req.path}: ${err.message}`);
            }
            res.status(401).json({ error: "Token inválido o expirado" });
            return;
        }
        // Adjuntamos el usuario decodificado al objeto request
        req.user = decoded;
        // Continuamos al siguiente middleware o route handler
        next();
    });
};
/**
 * Middleware: Verifica que el usuario autenticado tenga rol de administrador.
 * DEBE usarse DESPUÉS de authenticateToken en la cadena de middlewares.
 * Responde con 403 Forbidden si el usuario no es admin.
 */
export const requireAdmin = (req, res, next) => {
    // Verificamos que el rol del usuario sea 'admin'
    if (req.user?.role !== "admin") {
        console.warn(`[ADMIN] Acceso denegado para usuario '${req.user?.email}' → ${req.path}`);
        res.status(403).json({ error: "Acceso restringido: se requiere rol admin" });
        return;
    }
    // El usuario es admin, continuamos
    next();
};
