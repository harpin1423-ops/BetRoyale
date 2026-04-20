/**
 * @file users.routes.ts
 * @description Rutas de gestión de usuarios.
 * Incluye: perfil del usuario autenticado, bankroll, métricas de rendimiento,
 * links de Telegram, configuración de planes y administración de usuarios (admin only).
 */

import { Router } from "express";
import { pool } from "../config/database";
import { authenticateToken, requireAdmin } from "../middleware/auth";

// Creamos el router para todas las rutas relacionadas con usuarios
const router = Router();

// ─── GET /api/user/profile ───────────────────────────────────────────────────
/**
 * Devuelve el perfil completo del usuario autenticado,
 * incluyendo sus suscripciones activas con todos los detalles.
 */
router.get("/profile", authenticateToken, async (req: any, res) => {
  try {
    // Obtenemos los datos del usuario desde la base de datos
    const [filas] = await pool.query(
      `SELECT id, email, role, vip_until, plan_type, vip_since, 
              initial_bankroll, created_at 
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    const usuarios = filas as any[];

    if (usuarios.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const usuario = usuarios[0];

    // Obtenemos las suscripciones activas con todos sus detalles
    const [suscripciones] = await pool.query(
      `SELECT plan_id, expires_at, amount, payment_method, created_at, 
              periodicity, currency, amount_usd 
       FROM user_subscriptions WHERE user_id = ? AND expires_at > NOW()`,
      [req.user.id]
    );

    // Adjuntamos las suscripciones al objeto de usuario
    usuario.subscriptions = suscripciones;

    return res.json(usuario);
  } catch (error) {
    console.error("[USERS] Error obteniendo perfil:", error);
    return res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// ─── PUT /api/user/bankroll ──────────────────────────────────────────────────
/**
 * Actualiza el bankroll inicial del usuario autenticado.
 * El bankroll es la cantidad de unidades con las que el usuario quiere calcular sus métricas.
 */
router.put("/bankroll", authenticateToken, async (req: any, res) => {
  const { initial_bankroll } = req.body;

  try {
    // Actualizamos el bankroll del usuario en la base de datos
    await pool.query(
      "UPDATE users SET initial_bankroll = ? WHERE id = ?",
      [initial_bankroll, req.user.id]
    );
    return res.json({ message: "Bankroll actualizado exitosamente" });
  } catch (error) {
    console.error("[USERS] Error actualizando bankroll:", error);
    return res.status(500).json({ error: "Error al actualizar bankroll" });
  }
});

// ─── GET /api/user/telegram-links ────────────────────────────────────────────
/**
 * Devuelve los enlaces de invitación a los canales de Telegram
 * a los que el usuario tiene acceso según sus suscripciones activas.
 */
router.get("/telegram-links", authenticateToken, async (req: any, res) => {
  try {
    // Obtenemos los planes activos del usuario con su link de Telegram
    const [suscripcionesActivas]: any = await pool.query(
      `SELECT pt.name, pt.telegram_invite_link 
       FROM user_subscriptions us
       JOIN pick_types pt ON us.plan_id = pt.slug
       WHERE us.user_id = ? AND us.expires_at > NOW()`,
      [req.user.id]
    );

    // El enlace gratuito está disponible para todos los usuarios
    const enlaceGratuito = process.env.TELEGRAM_FREE_INVITE_LINK || "#";

    return res.json({
      /** Enlace al canal gratuito de Telegram */
      free: enlaceGratuito,
      /** Lista de canales VIP a los que tiene acceso */
      vip: suscripcionesActivas.map((s: any) => ({
        name: s.name,
        link: s.telegram_invite_link,
      })),
    });
  } catch (error) {
    console.error("[USERS] Error obteniendo links de Telegram:", error);
    return res.status(500).json({ error: "Error al obtener links de Telegram" });
  }
});

// ─── GET /api/user/plan-settings ─────────────────────────────────────────────
/**
 * Obtiene la configuración de bankroll por tipo de pick del usuario.
 * Permite al usuario tener diferentes bankrolls para free vs VIP.
 */
router.get("/plan-settings", authenticateToken, async (req: any, res) => {
  try {
    const [filas] = await pool.query(
      "SELECT pick_type_id, initial_bankroll FROM user_plan_settings WHERE user_id = ?",
      [req.user.id]
    );
    return res.json(filas);
  } catch (error) {
    console.error("[USERS] Error obteniendo configuración de planes:", error);
    return res.status(500).json({ error: "Error al obtener configuración de planes" });
  }
});

// ─── PUT /api/user/plan-settings ─────────────────────────────────────────────
/**
 * Actualiza o crea la configuración de bankroll para un tipo de pick específico.
 */
router.put("/plan-settings", authenticateToken, async (req: any, res) => {
  const { pick_type_id, initial_bankroll } = req.body;

  try {
    // Usamos UPSERT (INSERT ... ON DUPLICATE KEY UPDATE) para crear o actualizar
    await pool.query(
      `INSERT INTO user_plan_settings (user_id, pick_type_id, initial_bankroll) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE initial_bankroll = VALUES(initial_bankroll)`,
      [req.user.id, pick_type_id, initial_bankroll]
    );
    return res.json({ message: "Configuración de plan actualizada exitosamente" });
  } catch (error) {
    console.error("[USERS] Error actualizando configuración de plan:", error);
    return res.status(500).json({ error: "Error al actualizar configuración de plan" });
  }
});

// ─── GET /api/user/metrics ───────────────────────────────────────────────────
/**
 * Calcula las métricas de rendimiento personalizadas del usuario VIP:
 * evolución del bankroll, profit total, yield y hit rate.
 * Basado en todos los picks VIP desde la fecha de alta del usuario.
 */
router.get("/metrics", authenticateToken, async (req: any, res) => {
  try {
    // Obtenemos la fecha de inicio VIP y el bankroll inicial del usuario
    const [filaUsuario] = await pool.query(
      "SELECT vip_since, initial_bankroll FROM users WHERE id = ?",
      [req.user.id]
    );
    const usuario = (filaUsuario as any[])[0];

    // Si el usuario no tiene fecha de inicio VIP, devolvemos métricas vacías
    if (!usuario || !usuario.vip_since) {
      return res.json({
        metrics: [],
        summary: {
          totalProfit: 0,
          yield: 0,
          hitRate: 0,
          currentBankroll: usuario?.initial_bankroll || 0,
        },
      });
    }

    // Obtenemos todos los picks VIP resueltos desde la fecha de alta del usuario
    const [picks] = await pool.query(
      `SELECT match_date AS date, status, odds, stake 
       FROM picks 
       WHERE pick_type_id != 1 
         AND match_date >= ? 
         AND status IN ('won', 'lost', 'half-won', 'half-lost', 'void')
       ORDER BY match_date ASC`,
      [usuario.vip_since]
    );

    // Variables para el cálculo acumulado de métricas
    const listaPicks = picks as any[];
    let bankrollActual = Number(usuario.initial_bankroll) || 0;
    let totalStaked = 0;       // Total de unidades apostadas
    let totalProfit = 0;       // Ganancia/pérdida neta
    let wins = 0;              // Conteo de aciertos (0.5 para half-won)
    let totalResueltos = 0;    // Total de picks con resultado

    // Agrupamos los datos por fecha para el gráfico de evolución
    const dataPorFecha = new Map<string, { date: string; bankroll: number; profit: number }>();

    // Procesamos cada pick y calculamos el impacto en el bankroll
    listaPicks.forEach((pick) => {
      const stake = Number(pick.stake) || 1;
      const odds = Number(pick.odds) || 1;
      let profit = 0;

      totalResueltos++;
      totalStaked += stake;

      // Calculamos el profit según el resultado del pick
      if (pick.status === "won") {
        profit = stake * (odds - 1);  // Ganamos: stake × (cuota - 1)
        wins++;
      } else if (pick.status === "lost") {
        profit = -stake;              // Perdemos: restamos el stake
      } else if (pick.status === "half-won") {
        profit = (stake / 2) * (odds - 1);  // Ganamos la mitad
        wins += 0.5;
      } else if (pick.status === "half-lost") {
        profit = -stake / 2;         // Perdemos la mitad
      }
      // 'void' no afecta al bankroll

      totalProfit += profit;
      bankrollActual += profit;

      // Agrupamos por fecha para el gráfico de evolución del bankroll
      const fechaStr = new Date(pick.date).toISOString().split("T")[0];
      if (!dataPorFecha.has(fechaStr)) {
        dataPorFecha.set(fechaStr, { date: fechaStr, bankroll: bankrollActual, profit: 0 });
      }
      const diaDato = dataPorFecha.get(fechaStr)!;
      diaDato.bankroll = bankrollActual;  // Actualizamos con el valor más reciente del día
      diaDato.profit += profit;           // Acumulamos profit del día
    });

    // Calculamos yield: (profit / totalStaked) × 100
    const yieldPorcentaje = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    // Calculamos hit rate: (aciertos / resueltos) × 100
    const hitRate = totalResueltos > 0 ? (wins / totalResueltos) * 100 : 0;

    return res.json({
      /** Datos para el gráfico de evolución del bankroll en el tiempo */
      metrics: Array.from(dataPorFecha.values()),
      /** Resumen de métricas globales */
      summary: {
        totalProfit,
        yield: yieldPorcentaje,
        hitRate,
        currentBankroll: bankrollActual,
      },
    });
  } catch (error) {
    console.error("[USERS] Error calculando métricas:", error);
    return res.status(500).json({ error: "Error al calcular métricas" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUTAS DE ADMINISTRACIÓN DE USUARIOS (solo admin)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/users ──────────────────────────────────────────────────────────
/**
 * Devuelve la lista completa de usuarios con sus suscripciones.
 * Solo administradores.
 */
router.get("/", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    // JOIN con suscripciones para obtener todos los datos en una query
    const [filas] = await pool.query(`
      SELECT u.id, u.email, u.role, u.vip_until, u.created_at, 
             s.plan_id, s.expires_at, s.amount, s.payment_method, 
             s.created_at AS sub_created_at, s.periodicity, s.currency, s.amount_usd
      FROM users u
      LEFT JOIN user_subscriptions s ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `);

    // Agrupamos las suscripciones por usuario para evitar duplicados de usuario
    const mapaUsuarios = new Map<number, any>();
    (filas as any[]).forEach((fila) => {
      if (!mapaUsuarios.has(fila.id)) {
        // Primera vez que vemos este usuario: creamos su entrada
        mapaUsuarios.set(fila.id, {
          id: fila.id,
          email: fila.email,
          role: fila.role,
          vip_until: fila.vip_until,
          created_at: fila.created_at,
          subscriptions: [],
        });
      }
      // Si tiene una suscripción, la añadimos a su lista
      if (fila.plan_id) {
        mapaUsuarios.get(fila.id).subscriptions.push({
          plan_id: fila.plan_id,
          expires_at: fila.expires_at,
          amount: fila.amount,
          payment_method: fila.payment_method,
          created_at: fila.sub_created_at,
          periodicity: fila.periodicity,
          currency: fila.currency,
          amount_usd: fila.amount_usd,
        });
      }
    });

    return res.json(Array.from(mapaUsuarios.values()));
  } catch (error) {
    console.error("[ADMIN USERS] Error obteniendo usuarios:", error);
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// ─── PUT /api/users/:id/vip ──────────────────────────────────────────────────
/**
 * Extiende manualmente la suscripción VIP de un usuario.
 * Solo administradores. Útil para accesos de prueba o resolución de incidencias.
 */
router.put("/:id/vip", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { days } = req.body;

  try {
    // Buscamos el usuario para conocer su vip_until actual
    const [filas] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    const usuario = (filas as any[])[0];

    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Calculamos la nueva fecha: if ya tiene VIP activo, lo extendemos desde ahí
    let nuevaFecha = new Date();
    if (usuario.vip_until && new Date(usuario.vip_until) > new Date()) {
      nuevaFecha = new Date(usuario.vip_until);
    }
    // Añadimos los días solicitados (por defecto: 30)
    nuevaFecha.setDate(nuevaFecha.getDate() + (days || 30));

    const fechaFormateada = nuevaFecha.toISOString().slice(0, 19).replace("T", " ");

    // Actualizamos el rol a vip y la fecha de vencimiento
    await pool.query(
      "UPDATE users SET role = 'vip', vip_until = ? WHERE id = ?",
      [fechaFormateada, id]
    );

    return res.json({ message: "Suscripción VIP actualizada", vip_until: fechaFormateada });
  } catch (error) {
    console.error("[ADMIN USERS] Error actualizando VIP:", error);
    return res.status(500).json({ error: "Error al actualizar suscripción" });
  }
});

// ─── DELETE /api/users/:id/vip ───────────────────────────────────────────────
/**
 * Cancela la suscripción VIP de un usuario, revirtiéndolo a rol 'user'.
 * Solo administradores.
 */
router.delete("/:id/vip", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      "UPDATE users SET role = 'user', vip_until = NULL WHERE id = ?",
      [id]
    );
    return res.json({ message: "Suscripción VIP cancelada" });
  } catch (error) {
    console.error("[ADMIN USERS] Error cancelando VIP:", error);
    return res.status(500).json({ error: "Error al cancelar suscripción" });
  }
});

// Exportamos el router
export default router;
