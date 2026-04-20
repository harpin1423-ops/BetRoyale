/**
 * @file picks.routes.ts
 * @description Rutas CRUD para los picks deportivos.
 * Incluye: listado de picks, creación, edición, actualización de estado,
 * eliminación individual y masiva, y tracking/seguimiento de picks.
 */

import { Router } from "express";
import { pool } from "../config/database";
import { authenticateToken, requireAdmin } from "../middleware/auth";
import { sendTelegramMessage, formatPickParaTelegram } from "../services/telegram.service";

// Creamos el router para las rutas de picks
const router = Router();



// ─── GET /api/picks ──────────────────────────────────────────────────────────
/**
 * Devuelve todos los picks con sus datos relacionados:
 * tipo, mercado, liga y bandera del país.
 * También incluye el tracking de cada pick y resuelve las selecciones de parlays.
 * Ruta pública (no requiere autenticación).
 */
router.get("/", async (_req, res) => {
  try {
    // Query principal: JOIN con tipos, mercados, ligas y países
    const [picks] = await pool.query(`
      SELECT p.*, 
             pt.slug  AS pick_type_slug, 
             pt.name  AS pick_type_name,
             m.label  AS market_label, 
             m.acronym AS market_acronym,
             COALESCE(l.name, p.league) AS league_name,
             c.flag   AS country_flag
      FROM picks p 
      LEFT JOIN pick_types pt ON p.pick_type_id = pt.id 
      LEFT JOIN markets    m  ON p.pick = m.id
      LEFT JOIN leagues    l  ON p.league_id = l.id
      LEFT JOIN countries  c  ON l.country_id = c.id
      ORDER BY p.match_date DESC
    `);

    // Cargamos todos los registros de tracking para adjuntarlos luego
    const [tracking] = await pool.query(
      "SELECT * FROM pick_tracking ORDER BY created_at ASC"
    );

    // Cargamos ligas y mercados para resolver las selecciones de parlays
    const [ligas] = await pool.query("SELECT id, name FROM leagues");
    const [mercados] = await pool.query("SELECT id, label, acronym FROM markets");

    // Procesamos cada pick para formatear fechas y adjuntar tracking
    const picksFormateados = (picks as any[]).map((pick) => {
      // Forzamos interpretación UTC para que el navegador muestre la hora local correcta
      const fechaObj =
        pick.match_date instanceof Date
          ? pick.match_date
          : new Date(pick.match_date + "Z");

      // Parseamos las selecciones de parlay (si es parlay y tiene selecciones JSON)
      let selecciones: any[] = [];
      if (pick.selections) {
        if (typeof pick.selections === "string") {
          try {
            // Intentamos parsear el JSON de selecciones
            selecciones = JSON.parse(pick.selections);
          } catch (e) {
            console.error(`[PICKS] Error parseando selecciones del pick ${pick.id}:`, e);
          }
        } else if (Array.isArray(pick.selections)) {
          // Si ya es array, lo usamos directamente
          selecciones = pick.selections;
        }

        // Enriquecemos cada selección con el nombre de liga y mercado
        selecciones = selecciones.map((sel: any) => {
          const liga = (ligas as any[]).find(
            (l) => l.id.toString() === sel.league_id?.toString()
          );
          const mercado = (mercados as any[]).find(
            (m) => m.id.toString() === sel.pick?.toString()
          );
          return {
            ...sel,
            /** Nombre legible de la liga */
            league_name: liga ? liga.name : sel.league_id,
            /** Etiqueta del mercado (ej: "Gana Local") */
            market_label: mercado ? mercado.label : sel.pick,
            /** Acrónimo del mercado (ej: "1") */
            market_acronym: mercado ? mercado.acronym : "",
          };
        });
      }

      return {
        ...pick,
        /** Fecha en formato ISO para facilitar el manejo en el frontend */
        match_date: fechaObj.toISOString(),
        /** Selecciones del parlay procesadas */
        selections: selecciones,
        /** Registros de tracking filtrados para este pick */
        tracking: (tracking as any[]).filter((t) => t.pick_id === pick.id),
      };
    });

    return res.json(picksFormateados);
  } catch (error: any) {
    console.error("[PICKS] Error obteniendo picks:", error);
    return res.status(500).json({ error: "Error al obtener los picks" });
  }
});

// ─── POST /api/picks ─────────────────────────────────────────────────────────
/**
 * Crea un nuevo pick deportivo.
 * Solo administradores. Notifica automáticamente por Telegram al publicar.
 */
router.post("/", authenticateToken, requireAdmin, async (req, res) => {
  const {
    match_date, league_id, match_name, pick, odds, stake,
    pick_type_id, analysis, is_parlay, selections,
  } = req.body;

  // Validación diferenciada para parlays vs picks individuales
  if (is_parlay) {
    if (!match_date || !odds || !stake || !pick_type_id || !selections?.length) {
      return res.status(400).json({ error: "Faltan campos obligatorios para el parlay" });
    }
  } else {
    if (!match_date || !league_id || !match_name || !pick || !odds || !stake || !pick_type_id) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }
  }

  try {
    // Obtenemos el slug del tipo de pick (necesario para el campo legacy 'pick_type')
    const [tipos]: any = await pool.query(
      "SELECT slug FROM pick_types WHERE id = ?",
      [pick_type_id]
    );
    const slugTipo = tipos.length > 0 ? tipos[0].slug : "free";

    // Convertimos la fecha de Colombia (UTC-5) a UTC para almacenar en MySQL
    const fechaColombia = new Date(match_date + ":00-05:00");
    const fechaFormateada = fechaColombia.toISOString().slice(0, 19).replace("T", " ");

    // Insertamos el pick en la base de datos
    const [resultado] = await pool.query(
      `INSERT INTO picks 
       (match_date, league_id, match_name, pick, odds, stake, pick_type_id, 
        analysis, is_parlay, selections, league, pick_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fechaFormateada,
        is_parlay ? null : league_id,
        is_parlay ? "Parlay" : match_name,
        is_parlay ? "Parlay" : pick,
        odds,
        stake,
        pick_type_id,
        analysis || null,
        is_parlay ? true : false,
        is_parlay ? JSON.stringify(selections) : null,
        is_parlay ? "Parlay" : "",
        slugTipo,
      ]
    );

    // Notificamos al canal de Telegram correspondiente
    try {
      const [tipoRows]: any = await pool.query(
        "SELECT telegram_channel_id FROM pick_types WHERE id = ?",
        [pick_type_id]
      );
      const channelId =
        tipoRows[0]?.telegram_channel_id ||
        (slugTipo === "free" ? process.env.TELEGRAM_FREE_CHANNEL_ID : null);

      if (channelId) {
        const mensaje = formatPickParaTelegram({
          match_date: fechaFormateada,
          match_name: is_parlay ? "Parlay" : match_name,
          league: is_parlay ? "Parlay" : "",
          pick: is_parlay ? "Parlay" : pick,
          odds,
          stake,
          analysis,
          status: "pending",
        });
        await sendTelegramMessage(channelId, mensaje);
      }
    } catch (tgErr) {
      // El error de Telegram no debe bloquear la creación del pick
      console.error("[PICKS] Error enviando a Telegram:", tgErr);
    }

    return res.status(201).json({
      id: (resultado as any).insertId,
      message: "Pick creado exitosamente",
    });
  } catch (error: any) {
    console.error("[PICKS] Error creando pick:", error);
    return res.status(500).json({ error: "Error al crear el pick", details: error.message });
  }
});

// ─── PUT /api/picks/:id ──────────────────────────────────────────────────────
/**
 * Actualiza todos los campos de un pick existente.
 * Solo administradores.
 */
router.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    match_date, league_id, match_name, pick, odds, stake,
    pick_type_id, analysis, is_parlay, selections,
  } = req.body;

  // Validación de campos requeridos según tipo
  if (is_parlay) {
    if (!match_date || !odds || !stake || !pick_type_id || !selections?.length) {
      return res.status(400).json({ error: "Faltan campos obligatorios para el parlay" });
    }
  } else {
    if (!match_date || !league_id || !match_name || !pick || !odds || !stake || !pick_type_id) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }
  }

  try {
    // Obtenemos el slug del tipo para el campo legacy
    const [tipos]: any = await pool.query(
      "SELECT slug FROM pick_types WHERE id = ?",
      [pick_type_id]
    );
    const slugTipo = tipos.length > 0 ? tipos[0].slug : "free";

    // Convertimos la fecha de Colombia a UTC
    const fechaColombia = new Date(match_date + ":00-05:00");
    const fechaFormateada = fechaColombia.toISOString().slice(0, 19).replace("T", " ");

    // Actualizamos el pick en la base de datos
    await pool.query(
      `UPDATE picks SET 
       match_date = ?, league_id = ?, match_name = ?, pick = ?, odds = ?, 
       stake = ?, pick_type_id = ?, analysis = ?, is_parlay = ?, 
       selections = ?, league = ?, pick_type = ? 
       WHERE id = ?`,
      [
        fechaFormateada,
        is_parlay ? null : league_id,
        is_parlay ? "Parlay" : match_name,
        is_parlay ? "Parlay" : pick,
        odds, stake, pick_type_id,
        analysis || null,
        is_parlay ? true : false,
        is_parlay ? JSON.stringify(selections) : null,
        is_parlay ? "Parlay" : "",
        slugTipo,
        id,
      ]
    );

    // Notificamos la actualización por Telegram
    try {
      const [pickActualizado]: any = await pool.query("SELECT * FROM picks WHERE id = ?", [id]);
      const [tipoRows]: any = await pool.query(
        "SELECT telegram_channel_id FROM pick_types WHERE id = ?",
        [pickActualizado[0].pick_type_id]
      );
      const channelId =
        tipoRows[0]?.telegram_channel_id ||
        (pickActualizado[0].pick_type === "free" ? process.env.TELEGRAM_FREE_CHANNEL_ID : null);

      if (channelId) {
        const mensaje = formatPickParaTelegram(pickActualizado[0], true);
        await sendTelegramMessage(channelId, mensaje);
      }
    } catch (tgErr) {
      console.error("[PICKS] Error de Telegram en actualización:", tgErr);
    }

    return res.json({ message: "Pick actualizado exitosamente" });
  } catch (error: any) {
    console.error("[PICKS] Error actualizando pick:", error);
    return res.status(500).json({ error: "Error al actualizar el pick", details: error.message });
  }
});

// ─── PATCH /api/picks/:id/status ─────────────────────────────────────────────
/**
 * Actualiza solo el estado de un pick (won, lost, void, pending, half-won, half-lost).
 * Solo administradores. Notifica el resultado por Telegram.
 */
router.patch("/:id/status", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    // Actualizamos únicamente el estado del pick
    await pool.query("UPDATE picks SET status = ? WHERE id = ?", [status, id]);

    // Notificamos el cambio de resultado por Telegram
    try {
      const [pickRows]: any = await pool.query("SELECT * FROM picks WHERE id = ?", [id]);
      const pick = pickRows[0];
      const [tipoRows]: any = await pool.query(
        "SELECT telegram_channel_id FROM pick_types WHERE id = ?",
        [pick.pick_type_id]
      );
      const channelId =
        tipoRows[0]?.telegram_channel_id ||
        (pick.pick_type === "free" ? process.env.TELEGRAM_FREE_CHANNEL_ID : null);

      if (channelId) {
        const mensaje = formatPickParaTelegram(pick, true);
        await sendTelegramMessage(channelId, mensaje);
      }
    } catch (tgErr) {
      console.error("[PICKS] Error de Telegram actualizando estado:", tgErr);
    }

    return res.json({ message: "Estado actualizado exitosamente" });
  } catch (error: any) {
    console.error("[PICKS] Error actualizando estado:", error);
    return res.status(500).json({ error: "Error al actualizar el estado" });
  }
});

// ─── PATCH /api/picks/bulk/status ────────────────────────────────────────────
/**
 * Actualiza el estado de múltiples picks a la vez.
 * Solo administradores.
 */
router.patch("/bulk/status", authenticateToken, requireAdmin, async (req, res) => {
  const { pickIds, status } = req.body;

  // Validamos que se hayan proporcionado IDs válidos
  if (!pickIds || !Array.isArray(pickIds) || pickIds.length === 0) {
    return res.status(400).json({ error: "No se proporcionaron IDs válidos" });
  }

  try {
    // Construimos los placeholders dinámicamente para el IN clause
    const placeholders = pickIds.map(() => "?").join(",");
    await pool.query(
      `UPDATE picks SET status = ? WHERE id IN (${placeholders})`,
      [status, ...pickIds]
    );
    return res.json({ message: "Estados actualizados exitosamente" });
  } catch (error: any) {
    console.error("[PICKS] Error actualizando estados masivos:", error);
    return res.status(500).json({ error: "Error al actualizar los estados" });
  }
});

// ─── POST /api/picks/:id/tracking ────────────────────────────────────────────
/**
 * Añade un mensaje de seguimiento a un pick (para informar actualizaciones).
 * Solo administradores.
 */
router.post("/:id/tracking", authenticateToken, requireAdmin, async (req, res) => {
  const { message } = req.body;
  const pickId = req.params.id;

  // El mensaje es obligatorio para el tracking
  if (!message) {
    return res.status(400).json({ error: "El mensaje es obligatorio" });
  }

  try {
    const [resultado] = await pool.query(
      "INSERT INTO pick_tracking (pick_id, message) VALUES (?, ?)",
      [pickId, message]
    );
    return res.status(201).json({
      id: (resultado as any).insertId,
      message: "Seguimiento añadido",
    });
  } catch (error: any) {
    console.error("[PICKS] Error añadiendo tracking:", error);
    return res.status(500).json({ error: "Error al añadir seguimiento", details: error.message });
  }
});

// ─── DELETE /api/picks/:id ───────────────────────────────────────────────────
/**
 * Elimina un pick individual por su ID.
 * Solo administradores.
 */
router.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM picks WHERE id = ?", [id]);
    return res.json({ message: "Pick eliminado exitosamente" });
  } catch (error: any) {
    console.error("[PICKS] Error eliminando pick:", error);
    return res.status(500).json({ error: "Error al eliminar el pick" });
  }
});

// ─── POST /api/picks/bulk/delete ─────────────────────────────────────────────
/**
 * Elimina múltiples picks a la vez.
 * Solo administradores.
 */
router.post("/bulk/delete", authenticateToken, requireAdmin, async (req, res) => {
  const { pickIds } = req.body;

  if (!pickIds || !Array.isArray(pickIds) || pickIds.length === 0) {
    return res.status(400).json({ error: "No se proporcionaron IDs válidos" });
  }

  try {
    const placeholders = pickIds.map(() => "?").join(",");
    await pool.query(
      `DELETE FROM picks WHERE id IN (${placeholders})`,
      pickIds
    );
    return res.json({ message: "Picks eliminados exitosamente" });
  } catch (error: any) {
    console.error("[PICKS] Error eliminando picks masivos:", error);
    return res.status(500).json({ error: "Error al eliminar los picks" });
  }
});

// Exportamos el router
export default router;
