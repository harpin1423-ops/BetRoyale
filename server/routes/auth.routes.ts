/**
 * @file auth.routes.ts
 * @description Rutas de autenticación de usuarios.
 * Maneja: registro, login, perfil propio y cambio de contraseña.
 * Todas las rutas son: POST /api/auth/register, POST /api/auth/login,
 *   GET /api/auth/me, PUT /api/auth/password
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../config/database";
import { env } from "../config/env";
import { authenticateToken } from "../middleware/auth";
import { enviarEmailBienvenida } from "../services/email.service";

// Creamos el router de Express para agrupar las rutas de autenticación
const router = Router();

// ─── POST /api/auth/register ─────────────────────────────────────────────────
/**
 * Registra un nuevo usuario en el sistema.
 * Valida que el email no esté duplicado, hashea la contraseña con bcrypt
 * y devuelve un JWT listo para usar.
 */
router.post("/register", async (req, res) => {
  // Extraemos email y contraseña del cuerpo de la petición
  const { email, password } = req.body;

  try {
    // Validación: ambos campos son obligatorios
    if (!email || !password) {
      return res.status(400).json({ error: "Email y contraseña son requeridos" });
    }

    // Verificamos que el email no esté ya registrado
    const [existentes] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if ((existentes as any[]).length > 0) {
      return res.status(400).json({ error: "El email ya está registrado" });
    }

    // Hasheamos la contraseña con bcrypt (factor de costo: 10)
    const passwordHash = await bcrypt.hash(password, 10);

    // Insertamos el nuevo usuario en la base de datos con rol 'user' por defecto
    const [resultado] = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)",
      [email, passwordHash, "user"]
    );

    // Obtenemos el ID del usuario recién creado
    const nuevoId = (resultado as any).insertId;

    // Generamos un JWT válido por 24 horas
    const token = jwt.sign(
      { id: nuevoId, email, role: "user" },
      env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Enviamos el email de bienvenida de forma asíncrona (no bloqueante)
    // No esperamos a que termine para no atrasar la respuesta al cliente
    enviarEmailBienvenida(email).catch((err) =>
      console.error("[REGISTER] Error enviando email de bienvenida:", err)
    );

    // Respondemos con 201 Created, incluyendo el token y los datos del usuario
    return res.status(201).json({
      token,
      user: { id: nuevoId, email, role: "user", subscriptions: [] },
    });
  } catch (error) {
    console.error("[AUTH] Error en registro:", error);
    return res.status(500).json({ error: "Error al registrar usuario" });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
/**
 * Autentica a un usuario existente y devuelve un JWT.
 * Verifica el email y la contraseña hasheada con bcrypt.
 */
router.post("/login", async (req, res) => {
  // Extraemos las credenciales del cuerpo de la petición
  const { email, password } = req.body;

  try {
    // Buscamos el usuario por email en la base de datos
    const [filas] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    const usuarios = filas as any[];

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
    const [suscripciones] = await pool.query(
      `SELECT plan_id, expires_at, amount, payment_method, created_at, 
              periodicity, currency, amount_usd 
       FROM user_subscriptions WHERE user_id = ?`,
      [usuario.id]
    );

    // Generamos un JWT con los datos básicos del usuario (no incluimos datos sensibles)
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, role: usuario.role },
      env.JWT_SECRET,
      { expiresIn: "24h" }
    );

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
  } catch (error) {
    console.error("[AUTH] Error en login:", error);
    return res.status(500).json({ error: "Error en el servidor" });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
/**
 * Devuelve los datos actualizados del usuario autenticado.
 * Útil para que el frontend refresque el estado del usuario.
 */
router.get("/me", authenticateToken, async (req: any, res) => {
  try {
    // Obtenemos los datos frescos del usuario desde la BD (con rol y vip_until actualizados)
    const [filas] = await pool.query(
      "SELECT id, email, role, vip_until, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    const usuarios = filas as any[];

    // Si el usuario ya no existe en la BD (cuenta eliminada), respondemos 404
    if (usuarios.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const usuario = usuarios[0];

    // Adjuntamos las suscripciones activas (incluyendo las expiradas para historial)
    const [suscripciones] = await pool.query(
      `SELECT plan_id, expires_at, amount, payment_method, created_at, 
              periodicity, currency, amount_usd 
       FROM user_subscriptions WHERE user_id = ?`,
      [req.user.id]
    );

    usuario.subscriptions = suscripciones;

    return res.json(usuario);
  } catch (error) {
    console.error("[AUTH] Error en /me:", error);
    return res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// ─── PUT /api/auth/password ──────────────────────────────────────────────────
/**
 * Cambia la contraseña del usuario autenticado.
 * Requiere la contraseña actual para confirmar identidad.
 */
router.put("/password", authenticateToken, async (req: any, res) => {
  // Extraemos la contraseña actual y la nueva del cuerpo
  const { currentPassword, newPassword } = req.body;

  try {
    // Obtenemos el hash actual de la contraseña del usuario
    const [filas] = await pool.query(
      "SELECT password_hash FROM users WHERE id = ?",
      [req.user.id]
    );
    const usuarios = filas as any[];

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
    await pool.query(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [nuevoHash, req.user.id]
    );

    return res.json({ success: true, message: "Contraseña actualizada correctamente" });
  } catch (error) {
    console.error("[AUTH] Error cambiando contraseña:", error);
    return res.status(500).json({ error: "Error al actualizar contraseña" });
  }
});

// Exportamos el router para registrarlo en el servidor principal
export default router;
