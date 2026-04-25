/**
 * @file teams.routes.ts
 * @description Rutas CRUD para la gestión de equipos vinculados a ligas.
 */

import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { searchProviderTeamCandidates } from "../services/scores.service.js";

export const teamsRouter = Router();

/**
 * <summary>
 * Obtiene el país oficial asociado a una liga para evitar equipos cruzados entre países.
 * </summary>
 * @param leagueId - ID de la liga seleccionada en el panel de administración.
 * @returns ID del país de la liga o null cuando la liga no existe.
 */
async function obtenerPaisDeLiga(leagueId: unknown): Promise<number | null> {
  // Consultamos la liga como fuente de verdad del país asociado.
  const [rows]: any = await pool.query(
    "SELECT country_id FROM leagues WHERE id = ? LIMIT 1",
    [leagueId]
  );

  // Si la liga no existe, devolvemos null para bloquear la operación.
  if (rows.length === 0) {
    return null;
  }

  // Leemos el país de la liga antes de normalizarlo.
  const countryId = rows[0].country_id;

  // Si la liga no tiene país asociado, la tratamos como inválida para equipos.
  if (countryId === null || countryId === undefined) {
    return null;
  }

  // Normalizamos el país a número para usarlo en inserts y updates.
  const normalizedCountryId = Number(countryId);

  // Si MySQL devolvió un valor no numérico, bloqueamos la operación.
  if (Number.isNaN(normalizedCountryId)) {
    return null;
  }

  // Devolvemos el ID numérico del país oficial de la liga.
  return normalizedCountryId;
}

/**
 * <summary>
 * Valida que el país enviado por el panel coincida con el país real de la liga.
 * </summary>
 * @param countryId - País enviado desde el formulario, opcional para compatibilidad.
 * @param leagueCountryId - País oficial consultado desde la tabla de ligas.
 * @returns true cuando el país es compatible con la liga.
 */
function paisCoincideConLiga(countryId: unknown, leagueCountryId: number): boolean {
  // Permitimos country_id vacío para que clientes antiguos sigan funcionando.
  if (countryId === null || countryId === undefined || String(countryId).trim() === "") {
    return true;
  }

  // Comparamos ambos valores como números para tolerar strings desde JSON.
  return Number(countryId) === Number(leagueCountryId);
}

/**
 * <summary>
 * Normaliza el nombre oficial y el ID de API-Football antes de persistirlos en la base de datos.
 * </summary>
 * @param apiNameInput - Alias técnico opcional usado como compatibilidad o fallback.
 * @param apiProviderNameInput - Nombre oficial del equipo según API-Football.
 * @param apiTeamIdInput - ID oficial del equipo en API-Football.
 * @returns Datos normalizados o un error de validación cuando el ID no es numérico.
 */
function normalizeTeamProviderData(
  apiNameInput: unknown,
  apiProviderNameInput: unknown,
  apiTeamIdInput: unknown
): { apiName: string | null; apiProviderName: string | null; apiTeamId: number | null; error: string | null } {
  // Normalizamos el alias legado de API-Football dejando null cuando llega vacío.
  const apiName = apiNameInput && String(apiNameInput).trim() ? String(apiNameInput).trim() : null;

  // Normalizamos el nombre oficial del proveedor dejando null cuando no viene informado.
  const apiProviderName = apiProviderNameInput && String(apiProviderNameInput).trim() ? String(apiProviderNameInput).trim() : null;

  // Si no existe ID del proveedor, guardamos null para permitir equipos aún no vinculados.
  if (apiTeamIdInput === null || apiTeamIdInput === undefined || String(apiTeamIdInput).trim() === "") {
    // Devolvemos el alias técnico como fallback del nombre oficial cuando todavía no hay vínculo completo.
    return { apiName: apiName || apiProviderName, apiProviderName: apiProviderName || apiName, apiTeamId: null, error: null };
  }

  // Convertimos el ID del proveedor a número entero.
  const parsedApiTeamId = Number(apiTeamIdInput);

  // Validamos que el ID recibido sea numérico y positivo.
  if (!Number.isInteger(parsedApiTeamId) || parsedApiTeamId <= 0) {
    // Devolvemos un mensaje legible para el panel de administración.
    return { apiName, apiProviderName, apiTeamId: null, error: "El ID oficial de API-Football debe ser un entero positivo" };
  }

  // Devolvemos datos normalizados usando el nombre oficial como respaldo del alias técnico.
  return {
    apiName: apiName || apiProviderName,
    apiProviderName: apiProviderName || apiName,
    apiTeamId: parsedApiTeamId,
    error: null,
  };
}

// ─── GET /api/teams ──────────────────────────────────────────────────────────
/** 
 * Devuelve todos los equipos. 
 * Soporta filtrado opcional por country_id y league_id.
 */
teamsRouter.get("/", async (req, res) => {
  const { country_id, league_id } = req.query;
  try {
    // Base de consulta para listar equipos con país resuelto desde la liga si falta en teams.
    let query = `
      SELECT t.id,
             t.name,
             t.api_name,
             t.api_provider_name,
             t.api_team_id,
             t.league_id,
             COALESCE(t.country_id, l.country_id) AS country_id
      FROM teams t
      LEFT JOIN leagues l ON t.league_id = l.id
      LEFT JOIN countries c ON t.country_id = c.id
    `;
    // Parámetros seguros para evitar interpolar valores del usuario.
    const params: any[] = [];
    // Condiciones dinámicas para filtros opcionales.
    const conditions: string[] = [];

    // Filtramos por país cuando el panel o frontend lo solicita.
    if (country_id) {
      conditions.push("COALESCE(t.country_id, l.country_id) = ?");
      params.push(country_id);
    }

    // Filtramos por liga cuando se necesita poblar un selector dependiente.
    if (league_id) {
      conditions.push("t.league_id = ?");
      params.push(league_id);
    }

    // Añadimos WHERE solo cuando existe al menos un filtro.
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    // Ordenamos por nombre para que el buscador sea predecible.
    query += " ORDER BY t.name ASC";
    
    // Ejecutamos la consulta parametrizada.
    const [filas] = await pool.query(query, params);
    return res.json(filas);
  } catch (error) {
    console.error("[TEAMS] Error obteniendo equipos:", error);
    return res.status(500).json({ error: "Error al obtener equipos" });
  }
});

// ─── GET /api/teams/provider-alias-suggestions ───────────────────────────────
/**
 * <summary>
 * Sugiere vínculos de API-Football para un equipo local sin modificar su nombre visible.
 * </summary>
 * @param q - Nombre visible del equipo usado como consulta en API-Football.
 * @returns Lista corta de candidatos sugeridos para el vínculo exacto del proveedor.
 */
teamsRouter.get("/provider-alias-suggestions", authenticateToken, requireAdmin, async (req, res) => {
  // Leemos el texto de búsqueda desde query params.
  const { q } = req.query;

  // Validamos que el admin haya enviado un nombre suficiente para buscar.
  if (!q || typeof q !== "string" || q.trim().length < 2) {
    return res.status(400).json({ error: "Debes enviar un nombre de equipo válido en q" });
  }

  try {
    // Buscamos candidatos de alias en API-Football sin tocar la base local.
    const candidates = await searchProviderTeamCandidates(q);

    // Respondemos la lista para que el panel decida qué alias aplicar.
    return res.json({ candidates });
  } catch (error) {
    console.error("[TEAMS] Error sugiriendo alias API-Football:", error);
    return res.status(500).json({ error: "Error al buscar alias en API-Football" });
  }
});

// ─── POST /api/teams ─────────────────────────────────────────────────────────
/** Crea un nuevo equipo. Solo administradores. */
teamsRouter.post("/", authenticateToken, requireAdmin, async (req, res) => {
  const { name, league_id, country_id, api_name, api_provider_name, api_team_id } = req.body;

  // Validamos campos mínimos antes de consultar datos relacionados.
  if (!name || !league_id) {
    return res.status(400).json({ error: "El nombre y la liga son obligatorios" });
  }

  try {
    // Derivamos el país desde la liga para que no se guarden cruces inválidos.
    const leagueCountryId = await obtenerPaisDeLiga(league_id);

    // Si no existe la liga, el equipo no puede crearse.
    if (leagueCountryId === null) {
      return res.status(400).json({ error: "La liga seleccionada no existe" });
    }

    // Bloqueamos discrepancias entre país visible del panel y país real de la liga.
    if (!paisCoincideConLiga(country_id, leagueCountryId)) {
      return res.status(400).json({ error: "La liga no pertenece al país seleccionado" });
    }

    // Normalizamos el vínculo técnico con API-Football antes de persistirlo.
    const normalizedProviderData = normalizeTeamProviderData(api_name, api_provider_name, api_team_id);

    // Si el vínculo técnico no es válido, detenemos el guardado con un mensaje claro.
    if (normalizedProviderData.error) {
      return res.status(400).json({ error: normalizedProviderData.error });
    }

    // Guardamos el equipo con el país oficial de la liga y su vínculo exacto al proveedor.
    const [resultado] = await pool.query(
      "INSERT INTO teams (name, api_name, api_provider_name, api_team_id, league_id, country_id) VALUES (?, ?, ?, ?, ?, ?)",
      [
        String(name).trim(),
        normalizedProviderData.apiName,
        normalizedProviderData.apiProviderName,
        normalizedProviderData.apiTeamId,
        league_id,
        leagueCountryId,
      ]
    );

    return res.status(201).json({
      id: (resultado as any).insertId,
      message: "Equipo creado correctamente",
    });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "El equipo ya existe en esta liga" });
    }
    console.error("[TEAMS] Error creando equipo:", error);
    return res.status(500).json({ error: "Error al crear equipo" });
  }
});

// ─── PUT /api/teams/:id ──────────────────────────────────────────────────────
/** Actualiza un equipo existente. Solo administradores. */
teamsRouter.put("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, league_id, country_id, api_name, api_provider_name, api_team_id } = req.body;

  // Validamos campos mínimos antes de actualizar.
  if (!name || !league_id) {
    return res.status(400).json({ error: "El nombre y la liga son obligatorios" });
  }

  try {
    // Derivamos el país oficial desde la liga seleccionada.
    const leagueCountryId = await obtenerPaisDeLiga(league_id);

    // Si la liga no existe, evitamos dejar el equipo en estado inválido.
    if (leagueCountryId === null) {
      return res.status(400).json({ error: "La liga seleccionada no existe" });
    }

    // Validamos que el país enviado siga correspondiendo a la liga.
    if (!paisCoincideConLiga(country_id, leagueCountryId)) {
      return res.status(400).json({ error: "La liga no pertenece al país seleccionado" });
    }

    // Normalizamos el vínculo técnico con API-Football antes de guardarlo.
    const normalizedProviderData = normalizeTeamProviderData(api_name, api_provider_name, api_team_id);

    // Si el vínculo técnico no es válido, detenemos el guardado con un mensaje claro.
    if (normalizedProviderData.error) {
      return res.status(400).json({ error: normalizedProviderData.error });
    }

    // Actualizamos nombre visible, vínculo API exacto, liga y país oficial de la liga.
    await pool.query(
      "UPDATE teams SET name = ?, api_name = ?, api_provider_name = ?, api_team_id = ?, league_id = ?, country_id = ? WHERE id = ?",
      [
        String(name).trim(),
        normalizedProviderData.apiName,
        normalizedProviderData.apiProviderName,
        normalizedProviderData.apiTeamId,
        league_id,
        leagueCountryId,
        id,
      ]
    );

    return res.json({ message: "Equipo actualizado correctamente" });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Ya existe un equipo con ese nombre en esta liga" });
    }
    console.error("[TEAMS] Error actualizando equipo:", error);
    return res.status(500).json({ error: "Error al actualizar equipo" });
  }
});

// ─── DELETE /api/teams/:id ───────────────────────────────────────────────────
/** Elimina un equipo. Solo administradores. */
teamsRouter.delete("/:id", authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM teams WHERE id = ?", [id]);
    return res.json({ message: "Equipo eliminado correctamente" });
  } catch (error) {
    console.error("[TEAMS] Error eliminando equipo:", error);
    return res.status(500).json({ error: "Error al eliminar equipo" });
  }
});

// ─── POST /api/teams/bulk-delete ─────────────────────────────────────────────
/** Elimina múltiples equipos a la vez. Solo administradores. */
teamsRouter.post("/bulk-delete", authenticateToken, requireAdmin, async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "IDs inválidos" });
  }

  try {
    await pool.query("DELETE FROM teams WHERE id IN (?)", [ids]);
    return res.json({ message: "Equipos eliminados correctamente" });
  } catch (error) {
    console.error("[TEAMS] Error en eliminación masiva:", error);
    return res.status(500).json({ error: "Error al eliminar equipos" });
  }
});
// ─── POST /api/teams/sync-all-api ───────────────────────────────────────────
/** 
 * Realiza un barrido masivo para vincular equipos locales con sus IDs oficiales de API-Football.
 * Solo procesa equipos que aún no tienen api_team_id.
 */
teamsRouter.post("/sync-all-api", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 1. Obtenemos los equipos que aún no tienen vínculo oficial.
    const [teams]: any = await pool.query(
      "SELECT id, name FROM teams WHERE api_team_id IS NULL"
    );

    if (teams.length === 0) {
      return res.json({ message: "No hay equipos pendientes de sincronización.", synced: 0 });
    }

    let syncedCount = 0;
    
    // 2. Procesamos secuencialmente para respetar los límites de la API externa.
    for (const team of teams) {
      try {
        // Buscamos candidatos en el proveedor usando el nombre local.
        const candidates = await searchProviderTeamCandidates(team.name);
        
        if (candidates && candidates.length > 0) {
          // Tomamos el mejor candidato (el primero devuelto por el buscador).
          const best = candidates[0];
          
          // Actualizamos el equipo en BD con su identidad oficial.
          await pool.query(
            "UPDATE teams SET api_team_id = ?, api_provider_name = ?, api_name = ? WHERE id = ?",
            [best.provider_id, best.provider_name, best.provider_name, team.id]
          );
          
          syncedCount++;
        }
        
        // Añadimos un pequeño delay de 150ms para evitar bloqueos por rate-limit del proveedor.
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (err) {
        // Si un equipo falla, continuamos con el resto para no abortar todo el barrido.
        console.error(`[TEAMS] Error sincronizando "${team.name}":`, err);
      }
    }

    return res.json({ 
      message: `Barrido completado exitosamente.`,
      synced: syncedCount,
      total_processed: teams.length
    });
  } catch (error) {
    console.error("[TEAMS] Error crítico en barrido API:", error);
    return res.status(500).json({ error: "Error durante el barrido masivo de equipos" });
  }
});
