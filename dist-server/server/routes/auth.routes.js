/**
 * @file auth.routes.ts
 * @description Rutas de autenticación de usuarios.
 * Maneja: registro, login, perfil propio y cambio de contraseña.
 * Todas las rutas son: POST /api/auth/register, POST /api/auth/login,
 *   GET /api/auth/me, PUT /api/auth/password
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { authenticateToken } from "../middleware/auth.js";
// Importamos límites específicos para login y registro sin afectar /auth/me.
import { loginLimiter, passwordResetLimiter, registerLimiter } from "../middleware/rateLimiter.js";
import { enviarEmailBienvenida, enviarEmailRecuperacion } from "../services/email.service.js";
// Creamos el router de Express para agrupar las rutas de autenticación
const router = Router();
// Tiempo de validez para enlaces de recuperación de contraseña.
const PASSWORD_RESET_TTL_MINUTES = 60;
/**
 * Normaliza correos para evitar duplicados por mayúsculas o espacios.
 *
 * @param email - Correo recibido desde el formulario.
 * @returns Correo normalizado para consultas y persistencia.
 */
function normalizarEmail(email) {
    // Convertimos cualquier valor recibido a string, quitamos espacios y usamos minúsculas.
    return String(email || "").trim().toLowerCase();
}
/**
 * Genera un token aleatorio seguro para recuperación de contraseña.
 *
 * @returns Token hexadecimal que solo se envía al email del usuario.
 */
function generarTokenRecuperacion() {
    // Usamos 32 bytes aleatorios para producir un token difícil de adivinar.
    return crypto.randomBytes(32).toString("hex");
}
/**
 * Hashea el token de recuperación antes de guardarlo o buscarlo en DB.
 *
 * @param token - Token crudo recibido por email o querystring.
 * @returns Hash SHA-256 hexadecimal del token.
 */
function hashearTokenRecuperacion(token) {
    // Guardamos solo el hash para que una filtración de DB no exponga links válidos.
    return crypto.createHash("sha256").update(token).digest("hex");
}
/**
 * Calcula la fecha de expiración para un token de recuperación.
 *
 * @returns Fecha futura de expiración en UTC.
 */
function calcularExpiracionRecuperacion() {
    // Sumamos el tiempo de vida configurado al momento actual.
    return new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
}
/**
 * Formatea una fecha JS como DATETIME compatible con MySQL.
 *
 * @param fecha - Fecha que se escribirá en base de datos.
 * @returns Fecha en formato YYYY-MM-DD HH:mm:ss.
 */
function formatearFechaMysql(fecha) {
    // Usamos UTC para mantener consistencia con las demás fechas del backend.
    return fecha.toISOString().slice(0, 19).replace("T", " ");
}
// ─── POST /api/auth/register ─────────────────────────────────────────────────
/**
 * Registra un nuevo usuario en el sistema.
 * Valida que el email no esté duplicado, hashea la contraseña con bcrypt
 * y devuelve un JWT listo para usar.
 */
// Limitamos registros sin bloquear las demás rutas de autenticación.
router.post("/register", registerLimiter, async (req, res) => {
    // Extraemos email y contraseña del cuerpo de la petición
    const { email, password } = req.body;
    try {
        // Validación: ambos campos son obligatorios
        if (!email || !password) {
            return res.status(400).json({ error: "Email y contraseña son requeridos" });
        }
        // Verificamos que el email no esté ya registrado
        const [existentes] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
        if (existentes.length > 0) {
            return res.status(400).json({ error: "El email ya está registrado" });
        }
        // Hasheamos la contraseña con bcrypt (factor de costo: 10)
        const passwordHash = await bcrypt.hash(password, 10);
        // Insertamos el nuevo usuario en la base de datos con rol 'user' por defecto
        const [resultado] = await pool.query("INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)", [email, passwordHash, "user"]);
        // Obtenemos el ID del usuario recién creado
        const nuevoId = resultado.insertId;
        // Generamos un JWT válido por 24 horas
        const token = jwt.sign({ id: nuevoId, email, role: "user" }, env.JWT_SECRET, { expiresIn: "24h" });
        // Enviamos el email de bienvenida de forma asíncrona (no bloqueante)
        // No esperamos a que termine para no atrasar la respuesta al cliente
        enviarEmailBienvenida(email).catch((err) => console.error("[REGISTER] Error enviando email de bienvenida:", err));
        // Respondemos con 201 Created, incluyendo el token y los datos del usuario
        return res.status(201).json({
            token,
            user: { id: nuevoId, email, role: "user", subscriptions: [] },
        });
    }
    catch (error) {
        console.error("[AUTH] Error en registro:", error);
        return res.status(500).json({ error: "Error al registrar usuario" });
    }
});
// ─── POST /api/auth/login ────────────────────────────────────────────────────
/**
 * Autentica a un usuario existente y devuelve un JWT.
 * Verifica el email y la contraseña hasheada con bcrypt.
 */
// Limitamos intentos fallidos de login para proteger contra fuerza bruta.
router.post("/login", loginLimiter, async (req, res) => {
    // Extraemos las credenciales del cuerpo de la petición
    const { email, password } = req.body;
    try {
        // Buscamos el usuario por email en la base de datos
        const [filas] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
        const usuarios = filas;
        // Si no existe ningún usuario con ese email, respondemos con error genérico
        // (no decimos si el email existe para evitar enumeración de usuarios)
        if (usuarios.length === 0) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }
        const usuario = usuarios[0];
        // Comparamos la contraseña ingresada con el hash almacenado
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }
        // Obtenemos las suscripciones activas del usuario
        const [suscripciones] = await pool.query(`SELECT plan_id, expires_at, amount, payment_method, created_at, 
              periodicity, currency, amount_usd 
       FROM user_subscriptions WHERE user_id = ?`, [usuario.id]);
        // Generamos un JWT con los datos básicos del usuario (no incluimos datos sensibles)
        const token = jwt.sign({ id: usuario.id, email: usuario.email, role: usuario.role }, env.JWT_SECRET, { expiresIn: "24h" });
        // Respondemos con el token y los datos del usuario (sin el password hash)
        return res.json({
            token,
            user: {
                id: usuario.id,
                email: usuario.email,
                role: usuario.role,
                subscriptions: suscripciones,
            },
        });
    }
    catch (error) {
        console.error("[AUTH] Error en login:", error);
        return res.status(500).json({ error: "Error en el servidor" });
    }
});
// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
/**
 * Solicita un enlace seguro para restablecer la contraseña.
 */
router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
    // Extraemos el correo del cuerpo de la petición.
    const { email } = req.body;
    // Normalizamos el correo para consulta consistente.
    const emailNormalizado = normalizarEmail(email);
    // Validamos que se haya enviado un correo usable.
    if (!emailNormalizado) {
        return res.status(400).json({ error: "Email requerido" });
    }
    try {
        // Buscamos el usuario sin revelar si existe o no en la respuesta.
        const [filas] = await pool.query("SELECT id, email FROM users WHERE email = ? LIMIT 1", [emailNormalizado]);
        // Convertimos el resultado a arreglo para trabajar con seguridad.
        const usuarios = filas;
        // Si el correo existe, generamos token y enviamos email.
        if (usuarios.length > 0) {
            // Tomamos el usuario encontrado por email.
            const usuario = usuarios[0];
            // Generamos el token crudo que recibirá el usuario por email.
            const token = generarTokenRecuperacion();
            // Guardamos solo el hash del token en base de datos.
            const tokenHash = hashearTokenRecuperacion(token);
            // Calculamos la expiración del enlace de recuperación.
            const expiresAt = formatearFechaMysql(calcularExpiracionRecuperacion());
            // Invalidamos tokens anteriores pendientes de este usuario.
            await pool.query("UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL", [usuario.id]);
            // Persistimos el nuevo token hasheado.
            await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, ?)`, [usuario.id, tokenHash, expiresAt]);
            // Enviamos el correo con el link de recuperación.
            await enviarEmailRecuperacion(usuario.email, token);
        }
        // Respondemos siempre igual para evitar enumeración de emails.
        return res.json({
            success: true,
            message: "Si el email está registrado, recibirás instrucciones para recuperar tu contraseña.",
        });
    }
    catch (error) {
        console.error("[AUTH] Error solicitando recuperación:", error);
        return res.status(500).json({ error: "Error procesando la solicitud" });
    }
});
// ─── POST /api/auth/reset-password ──────────────────────────────────────────
/**
 * Restablece la contraseña usando un token válido y no usado.
 */
router.post("/reset-password", passwordResetLimiter, async (req, res) => {
    // Extraemos token y nueva contraseña desde el formulario.
    const { token, password } = req.body;
    // Normalizamos el token recibido desde la URL.
    const tokenNormalizado = String(token || "").trim();
    // Validamos formato del token para evitar consultas innecesarias.
    if (!/^[a-f0-9]{64}$/i.test(tokenNormalizado)) {
        return res.status(400).json({ error: "El enlace de recuperación no es válido" });
    }
    // Validamos una longitud mínima coherente con el resto del sistema.
    if (!password || String(password).length < 6) {
        return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
    }
    // Hasheamos el token recibido para compararlo con DB.
    const tokenHash = hashearTokenRecuperacion(tokenNormalizado);
    // Reservamos una conexión para actualizar token y contraseña de forma atómica.
    const conexion = await pool.getConnection();
    try {
        // Iniciamos transacción para no dejar tokens activos si falla la actualización.
        await conexion.beginTransaction();
        // Buscamos un token vigente, no usado y no expirado.
        const [filasToken] = await conexion.query(`SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = ?
         AND used_at IS NULL
         AND expires_at > UTC_TIMESTAMP()
       LIMIT 1`, [tokenHash]);
        // Si no existe token válido, revertimos y respondemos error controlado.
        if (filasToken.length === 0) {
            await conexion.rollback();
            return res.status(400).json({ error: "El enlace expiró o ya fue usado" });
        }
        // Tomamos el registro del token válido.
        const resetToken = filasToken[0];
        // Hasheamos la nueva contraseña con bcrypt.
        const passwordHash = await bcrypt.hash(String(password), 10);
        // Actualizamos la contraseña del usuario dueño del token.
        await conexion.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, resetToken.user_id]);
        // Marcamos todos los tokens pendientes de ese usuario como usados.
        await conexion.query("UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL", [resetToken.user_id]);
        // Confirmamos la transacción completa.
        await conexion.commit();
        // Respondemos éxito sin iniciar sesión automáticamente por seguridad.
        return res.json({
            success: true,
            message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
        });
    }
    catch (error) {
        // Revertimos cualquier cambio parcial si ocurre un error inesperado.
        await conexion.rollback();
        console.error("[AUTH] Error restableciendo contraseña:", error);
        return res.status(500).json({ error: "Error restableciendo la contraseña" });
    }
    finally {
        // Liberamos la conexión dedicada.
        conexion.release();
    }
});
// ─── GET /api/auth/me ────────────────────────────────────────────────────────
/**
 * Devuelve los datos actualizados del usuario autenticado.
 * Útil para que el frontend refresque el estado del usuario.
 */
router.get("/me", authenticateToken, async (req, res) => {
    try {
        // Obtenemos los datos frescos del usuario desde la BD (con rol y vip_until actualizados)
        const [filas] = await pool.query("SELECT id, email, role, vip_until, created_at FROM users WHERE id = ?", [req.user.id]);
        const usuarios = filas;
        // Si el usuario ya no existe en la BD (cuenta eliminada), respondemos 404
        if (usuarios.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        const usuario = usuarios[0];
        // Adjuntamos las suscripciones activas (incluyendo las expiradas para historial)
        const [suscripciones] = await pool.query(`SELECT plan_id, expires_at, amount, payment_method, created_at, 
              periodicity, currency, amount_usd 
       FROM user_subscriptions WHERE user_id = ?`, [req.user.id]);
        usuario.subscriptions = suscripciones;
        return res.json(usuario);
    }
    catch (error) {
        console.error("[AUTH] Error en /me:", error);
        return res.status(500).json({ error: "Error al obtener perfil" });
    }
});
// ─── PUT /api/auth/password ──────────────────────────────────────────────────
/**
 * Cambia la contraseña del usuario autenticado.
 * Requiere la contraseña actual para confirmar identidad.
 */
router.put("/password", authenticateToken, async (req, res) => {
    // Extraemos la contraseña actual y la nueva del cuerpo
    const { currentPassword, newPassword } = req.body;
    try {
        // Obtenemos el hash actual y el email para la notificación
        const [filas] = await pool.query("SELECT password_hash, email FROM users WHERE id = ?", [req.user.id]);
        const usuarios = filas;
        if (usuarios.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        // Verificamos que la contraseña actual sea correcta
        const esValida = await bcrypt.compare(currentPassword, usuarios[0].password_hash);
        if (!esValida) {
            return res.status(401).json({ error: "La contraseña actual es incorrecta" });
        }
        // Validamos que la nueva contraseña tenga al menos 6 caracteres
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
        }
        // Hasheamos la nueva contraseña antes de guardarla
        const nuevoHash = await bcrypt.hash(newPassword, 10);
        // Actualizamos el hash en la base de datos
        await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [nuevoHash, req.user.id]);
        // Importamos dinámicamente para asegurar que use la última config
        const { enviarEmailConfirmacionClave } = await import("../services/email.service.js");
        // Intentamos enviar el correo de confirmación (es asíncrono)
        enviarEmailConfirmacionClave(usuarios[0].email).catch((err) => console.error("[EMAIL] Error enviando confirmación de clave:", err));
        return res.json({ message: "Contraseña actualizada correctamente" });
    }
    catch (error) {
        console.error("[AUTH] Error cambiando contraseña:", error);
        return res.status(500).json({ error: "Error al actualizar contraseña" });
    }
});
// Exportamos el router para registrarlo en el servidor principal
export default router;
