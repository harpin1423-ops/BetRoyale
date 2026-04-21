/**
 * @file picks.routes.ts
 * @description Rutas CRUD para los picks deportivos.
 * Incluye: listado de picks, creación, edición, actualización de estado,
 * eliminación individual y masiva, y tracking/seguimiento de picks.
 */

import { Router } from "express";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { sendTelegramMessage, formatPickParaTelegram, formatSeguimientoParaTelegram } from "../services/telegram.service.js";
import { obtenerTelegramFullConfig } from "../services/settings.service.js";

// Creamos el router para las rutas de picks
const router = Router();

// Centralizamos los estados válidos para evitar typos desde el panel admin.
const ESTADOS_PERMITIDOS = new Set(["pending", "won", "lost", "void", "half-won", "half-lost"]);

/**
 * Convierte el JSON de selecciones de parlay en un arreglo seguro.
 *
 * @param rawSelections - Valor JSON recibido desde MySQL o desde el formulario.
 * @returns Arreglo de selecciones parseadas.
 */
function parseSeleccionesParlay(rawSelections: any): any[] {
  // Si no hay selecciones, devolvemos un arreglo vacío.
  if (!rawSelections) {
    return [];
  }

  // MySQL puede devolver JSON como string según la configuración del driver.
  if (typeof rawSelections === "string") {
    try {
      return JSON.parse(rawSelections);
    } catch (error) {
      console.error("[PICKS] Error parseando selecciones para Telegram:", error);
      return [];
    }
  }

  // Si ya llega como arreglo, lo usamos directamente.
  if (Array.isArray(rawSelections)) {
    return rawSelections;
  }

  // Cualquier otro formato no es seguro para publicar.
  return [];
}

/**
 * Enriquece las selecciones de parlay con liga, país, bandera y mercado legible.
 *
 * @param rawSelections - Selecciones originales guardadas en el pick.
 * @returns Selecciones listas para formatear en Telegram.
 */
async function enriquecerSeleccionesParaTelegram(rawSelections: any): Promise<any[]> {
  // Parseamos primero para trabajar siempre con un arreglo.
  const selecciones = parseSeleccionesParlay(rawSelections);

  // Si no hay selecciones, no necesitamos consultar datos relacionados.
  if (selecciones.length === 0) {
    return [];
  }

  // Extraemos IDs únicos de ligas y mercados para consultar en lote.
  const leagueIds = [...new Set(selecciones.map((s) => s.league_id).filter(Boolean))];
  const marketIds = [...new Set(selecciones.map((s) => s.pick).filter(Boolean))];

  // Mapa para resolver liga, país y bandera por ID.
  const leagueMap = new Map<string, any>();

  // Consultamos ligas si el parlay trae league_id.
  if (leagueIds.length > 0) {
    const placeholders = leagueIds.map(() => "?").join(",");
    const [leagueRows]: any = await pool.query(
      `SELECT l.id, l.name, c.name AS country_name, c.flag AS country_flag
       FROM leagues l
       LEFT JOIN countries c ON l.country_id = c.id
       WHERE l.id IN (${placeholders})`,
      leagueIds
    );

    // Indexamos por string para tolerar IDs numéricos o texto desde JSON.
    leagueRows.forEach((league: any) => {
      leagueMap.set(String(league.id), league);
    });
  }

  // Mapa para resolver mercados por ID/acrónimo.
  const marketMap = new Map<string, any>();

  // Consultamos mercados si el parlay trae pick/acrónimo.
  if (marketIds.length > 0) {
    const placeholders = marketIds.map(() => "?").join(",");
    const [marketRows]: any = await pool.query(
      `SELECT id, label, acronym
       FROM markets
       WHERE id IN (${placeholders})`,
      marketIds
    );

    // Indexamos por ID del mercado.
    marketRows.forEach((market: any) => {
      marketMap.set(String(market.id), market);
    });
  }

  // Combinamos cada selección con sus datos relacionados.
  return selecciones.map((selection) => {
    const league = leagueMap.get(String(selection.league_id));
    const market = marketMap.get(String(selection.pick));

    // Devolvemos una selección enriquecida manteniendo los campos originales.
    return {
      ...selection,
      league_name: league?.name || selection.league_name || selection.league_id,
      country_name: league?.country_name || selection.country_name || "",
      country_flag: league?.country_flag || selection.country_flag || "",
      market_label: market?.label || selection.market_label || selection.pick,
      market_acronym: market?.acronym || selection.market_acronym || "",
    };
  });
}

/**
 * Carga un pick con nombres legibles para enviarlo a Telegram.
 *
 * @param pickId - ID del pick que se notificará por Telegram.
 * @returns Pick enriquecido con liga, mercado y canal del tipo de pick.
 */
async function obtenerPickParaTelegram(pickId: string | number): Promise<any | null> {
  // Consultamos el pick junto con su tipo, liga y mercado para no enviar ids crudos.
  const [rows]: any = await pool.query(
    `SELECT p.*,
            pt.slug AS pick_type_slug,
            pt.name AS pick_type_name,
            pt.telegram_channel_id,
            c.name AS country_name,
            c.flag AS country_flag,
            COALESCE(l.name, p.league, '') AS league_name,
            m.label AS market_label,
            m.acronym AS market_acronym
     FROM picks p
     LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
     LEFT JOIN leagues l ON p.league_id = l.id
     LEFT JOIN countries c ON l.country_id = c.id
     LEFT JOIN markets m ON p.pick = m.id
     WHERE p.id = ?
     LIMIT 1`,
    [pickId]
  );

  // Si no hay registro, no hay nada que notificar.
  if (rows.length === 0) {
    return null;
  }

  // Normalizamos el pick para el formato esperado por el servicio de Telegram.
  const pick = rows[0];

  // Enriquecemos selecciones si el pick publicado es un parlay.
  const selecciones = await enriquecerSeleccionesParaTelegram(pick.selections);

  // Devolvemos textos legibles para picks simples y parlays.
  return {
    ...pick,
    league: pick.is_parlay ? "Parlay" : pick.league_name,
    pick: pick.is_parlay ? "Parlay" : pick.pick,
    match_name: pick.is_parlay ? "Parlay" : pick.match_name,
    selections: selecciones,
  };
}

/**
 * Determina los canales de Telegram que corresponden a un pick.
 *
 * @param pick - Pick enriquecido con configuración de tipo y slug legacy.
 * @returns Lista de Channel IDs configurados, sin duplicados.
 */
async function obtenerCanalesTelegramParaPick(pick: any): Promise<string[]> {
  // Usamos Set para evitar duplicar envíos si dos configuraciones apuntan al mismo canal.
  const canales = new Set<string>();

  // Normalizamos el slug para distinguir picks free de picks VIP.
  const slugTipo = String(pick.pick_type_slug || pick.pick_type || "").trim();

  // Un pick se considera gratuito solo cuando su slug legacy o actual es "free".
  const esPickGratis = slugTipo === "free";

  // Usamos primero el canal guardado desde el panel admin.
  if (pick.telegram_channel_id) {
    canales.add(String(pick.telegram_channel_id).trim());
  }

  // Mantenemos compatibilidad con el canal gratuito definido por variable de entorno.
  if (esPickGratis && env.TELEGRAM_FREE_CHANNEL_ID) {
    canales.add(env.TELEGRAM_FREE_CHANNEL_ID.trim());
  }

  // Los picks VIP se envían también al canal espejo VIP Full.
  if (!esPickGratis) {
    const fullConfig = await obtenerTelegramFullConfig();

    // Agregamos el canal Full solo si está configurado.
    if (fullConfig.telegram_channel_id) {
      canales.add(fullConfig.telegram_channel_id.trim());
    }
  }

  // Eliminamos valores vacíos antes de intentar enviar mensajes.
  return Array.from(canales).filter(Boolean);
}



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
      // Cargamos el pick recién creado con nombres legibles para Telegram.
      const pickTelegram = await obtenerPickParaTelegram((resultado as any).insertId);

      // Resolvemos los canales del plan y el espejo VIP Full cuando aplica.
      const channelIds = pickTelegram ? await obtenerCanalesTelegramParaPick(pickTelegram) : [];

      // Enviamos la notificación solo cuando al menos un canal está configurado.
      if (pickTelegram && channelIds.length > 0) {
        const mensaje = formatPickParaTelegram(pickTelegram);

        // Publicamos el mismo pick en cada canal resuelto para ese plan.
        for (const channelId of channelIds) {
          await sendTelegramMessage(channelId, mensaje);
        }
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

    // Las ediciones normales no notifican Telegram para evitar ruido en el canal.
    // Los avisos públicos salen solo al publicar, cambiar resultado o agregar seguimiento.

    return res.json({ message: "Pick actualizado exitosamente" });
  } catch (error: any) {
    console.error("[PICKS] Error actualizando pick:", error);
    return res.status(500).json({ error: "Error al actualizar el pick", details: error.message });
  }
});

// ─── PATCH /api/picks/bulk/status ────────────────────────────────────────────
/**
 * Actualiza el estado de múltiples picks a la vez.
 * Solo administradores. Notifica los resultados por Telegram.
 */
router.patch("/bulk/status", authenticateToken, requireAdmin, async (req, res) => {
  const { pickIds, status } = req.body;

  // Validamos que se hayan proporcionado IDs válidos
  if (!pickIds || !Array.isArray(pickIds) || pickIds.length === 0) {
    return res.status(400).json({ error: "No se proporcionaron IDs válidos" });
  }

  // Validamos el estado para que estadísticas y badges sigan siendo consistentes.
  if (!ESTADOS_PERMITIDOS.has(String(status))) {
    return res.status(400).json({ error: "Estado de pick no permitido" });
  }

  try {
    // Construimos los placeholders dinámicamente para el IN clause
    const placeholders = pickIds.map(() => "?").join(",");
    await pool.query(
      `UPDATE picks SET status = ? WHERE id IN (${placeholders})`,
      [status, ...pickIds]
    );

    // Notificamos cada pick actualizado sin bloquear la respuesta si Telegram falla.
    for (const pickId of pickIds) {
      try {
        // Cargamos el pick con su nuevo estado y textos legibles.
        const pick = await obtenerPickParaTelegram(pickId);

        // Resolvemos los canales configurados para ese plan y VIP Full.
        const channelIds = pick ? await obtenerCanalesTelegramParaPick(pick) : [];

        // Enviamos la actualización solo cuando existen canales configurados.
        if (pick && channelIds.length > 0) {
          const mensaje = formatPickParaTelegram(pick, true);

          // Publicamos el resultado en todos los canales correspondientes.
          for (const channelId of channelIds) {
            await sendTelegramMessage(channelId, mensaje);
          }
        }
      } catch (tgErr) {
        // El error de Telegram no debe revertir la actualización masiva.
        console.error("[PICKS] Error de Telegram en actualización masiva:", tgErr);
      }
    }

    return res.json({ message: "Estados actualizados exitosamente" });
  } catch (error: any) {
    console.error("[PICKS] Error actualizando estados masivos:", error);
    return res.status(500).json({ error: "Error al actualizar los estados" });
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

  // Validamos el estado antes de tocar la base de datos.
  if (!ESTADOS_PERMITIDOS.has(String(status))) {
    return res.status(400).json({ error: "Estado de pick no permitido" });
  }

  try {
    // Actualizamos únicamente el estado del pick
    await pool.query("UPDATE picks SET status = ? WHERE id = ?", [status, id]);

    // Notificamos el cambio de resultado por Telegram
    try {
      // Cargamos el pick actualizado con nombres legibles para Telegram.
      const pick = await obtenerPickParaTelegram(id);

      // Resolvemos los canales configurados para el plan del pick y VIP Full.
      const channelIds = pick ? await obtenerCanalesTelegramParaPick(pick) : [];

      // Enviamos la actualización solo cuando existen canales configurados.
      if (pick && channelIds.length > 0) {
        const mensaje = formatPickParaTelegram(pick, true);

        // Publicamos el resultado en cada canal correspondiente.
        for (const channelId of channelIds) {
          await sendTelegramMessage(channelId, mensaje);
        }
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

    // Notificamos el seguimiento por Telegram cuando el canal del plan está configurado.
    try {
      // Cargamos el pick asociado al seguimiento con nombres legibles.
      const pick = await obtenerPickParaTelegram(pickId);

      // Resolvemos los canales del plan para publicar la actualización.
      const channelIds = pick ? await obtenerCanalesTelegramParaPick(pick) : [];

      // Enviamos el mensaje de seguimiento solo si existen canales configurados.
      if (pick && channelIds.length > 0) {
        const mensajeTelegram = formatSeguimientoParaTelegram(pick, message);

        // Publicamos el seguimiento en todos los canales correspondientes.
        for (const channelId of channelIds) {
          await sendTelegramMessage(channelId, mensajeTelegram);
        }
      }
    } catch (tgErr) {
      // El error de Telegram no debe impedir que el seguimiento quede guardado.
      console.error("[PICKS] Error de Telegram añadiendo seguimiento:", tgErr);
    }

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
