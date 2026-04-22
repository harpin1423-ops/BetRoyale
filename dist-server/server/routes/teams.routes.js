/**
 * @file teams.routes.ts
 * @description Rutas CRUD para la gestión de equipos vinculados a ligas.
 */
import { Router } from "express";
import { pool } from "../config/database.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
export const teamsRouter = Router();
/**
 * <summary>
 * Obtiene el país oficial asociado a una liga para evitar equipos cruzados entre países.
 * </summary>
 * @param leagueId - ID de la liga seleccionada en el panel de administración.
 * @returns ID del país de la liga o null cuando la liga no existe.
 */
async function obtenerPaisDeLiga(leagueId) {
    // Consultamos la liga como fuente de verdad del país asociado.
    const [rows] = await pool.query("SELECT country_id FROM leagues WHERE id = ? LIMIT 1", [leagueId]);
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
function paisCoincideConLiga(countryId, leagueCountryId) {
    // Permitimos country_id vacío para que clientes antiguos sigan funcionando.
    if (countryId === null || countryId === undefined || String(countryId).trim() === "") {
        return true;
    }
    // Comparamos ambos valores como números para tolerar strings desde JSON.
    return Number(countryId) === Number(leagueCountryId);
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
             t.league_id,
             COALESCE(t.country_id, l.country_id) AS country_id
      FROM teams t
      LEFT JOIN leagues l ON t.league_id = l.id
    `;
        // Parámetros seguros para evitar interpolar valores del usuario.
        const params = [];
        // Condiciones dinámicas para filtros opcionales.
        const conditions = [];
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
    }
    catch (error) {
        console.error("[TEAMS] Error obteniendo equipos:", error);
        return res.status(500).json({ error: "Error al obtener equipos" });
    }
});
// ─── POST /api/teams ─────────────────────────────────────────────────────────
/** Crea un nuevo equipo. Solo administradores. */
teamsRouter.post("/", authenticateToken, requireAdmin, async (req, res) => {
    const { name, league_id, country_id } = req.body;
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
        // Guardamos el equipo con el país oficial de la liga.
        const [resultado] = await pool.query("INSERT INTO teams (name, league_id, country_id) VALUES (?, ?, ?)", [String(name).trim(), league_id, leagueCountryId]);
        return res.status(201).json({
            id: resultado.insertId,
            message: "Equipo creado correctamente",
        });
    }
    catch (error) {
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
    const { name, league_id, country_id } = req.body;
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
        // Actualizamos nombre, liga y país oficial de la liga.
        await pool.query("UPDATE teams SET name = ?, league_id = ?, country_id = ? WHERE id = ?", [String(name).trim(), league_id, leagueCountryId, id]);
        return res.json({ message: "Equipo actualizado correctamente" });
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error("[TEAMS] Error en eliminación masiva:", error);
        return res.status(500).json({ error: "Error al eliminar equipos" });
    }
});
