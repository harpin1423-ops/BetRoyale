/**
 * @file stats.routes.ts
 * @description Rutas de estadísticas y análisis de rendimiento.
 * Incluye: estadísticas públicas de picks, yield mensual,
 * ingresos del admin y estadísticas avanzadas por liga y mercado.
 */

import { Router } from "express";
// Importamos JWT para autenticación opcional en estadísticas públicas.
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
// Importamos variables de entorno para validar tokens opcionales.
import { env } from "../config/env.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";

// Creamos el router para las rutas de estadísticas
const router = Router();

// Centralizamos los estados resueltos que pueden mostrarse completos al público.
const ESTADOS_RESUELTOS = new Set(["won", "lost", "void", "half-won", "half-lost"]);

/**
 * <summary>
 * Extrae un usuario opcional desde Authorization sin bloquear rutas públicas.
 * </summary>
 * @param req - Solicitud HTTP con header Authorization opcional.
 * @returns Usuario decodificado o null si no hay sesión válida.
 */
function obtenerUsuarioOpcional(req: any): { id: number; email: string; role: string } | null {
  // Leemos el header Authorization enviado por el frontend.
  const authHeader = req.headers["authorization"];

  // Extraemos el token Bearer cuando existe.
  const token = authHeader && authHeader.split(" ")[1];

  // Si no hay token usable, la ruta funciona como pública.
  if (!token || token === "null" || token === "undefined") {
    return null;
  }

  try {
    // Verificamos el JWT con la clave del servidor.
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;

    // Devolvemos solo los campos necesarios para autorización de vista.
    return { id: decoded.id, email: decoded.email, role: decoded.role };
  } catch (_error) {
    // Un token inválido no debe romper la página pública de estadísticas.
    return null;
  }
}

/**
 * <summary>
 * Obtiene los planes activos del usuario para decidir qué picks pendientes puede ver.
 * </summary>
 * @param userId - ID del usuario autenticado.
 * @returns Slugs de planes activos del usuario.
 */
async function obtenerPlanesActivosUsuario(userId: number): Promise<string[]> {
  // Consultamos solo suscripciones vigentes para no dar acceso con planes vencidos.
  const [rows]: any = await pool.query(
    `SELECT DISTINCT plan_id
     FROM user_subscriptions
     WHERE user_id = ?
       AND expires_at > NOW()`,
    [userId]
  );

  // Convertimos filas en una lista simple de slugs.
  return rows.map((row: any) => String(row.plan_id));
}

/**
 * <summary>
 * Indica si un usuario puede ver detalles de un pick VIP pendiente.
 * </summary>
 * @param pick - Pick del historial de estadísticas.
 * @param usuario - Usuario autenticado opcional.
 * @param planesActivos - Planes activos del usuario autenticado.
 * @returns true si el detalle puede mostrarse.
 */
function puedeVerDetallePendienteVip(pick: any, usuario: { role: string } | null, planesActivos: string[]): boolean {
  // Los administradores siempre pueden auditar todos los detalles.
  if (usuario?.role === "admin") {
    return true;
  }

  // Normalizamos el slug del plan del pick.
  const slug = String(pick.pick_type_slug || "");

  // El plan all_plans permite ver todos los VIP pendientes.
  if (planesActivos.includes("all_plans")) {
    return true;
  }

  // El usuario solo ve pendientes de planes que tiene activos.
  return planesActivos.includes(slug);
}

/**
 * <summary>
 * Convierte un JSON de selecciones de parlay en un arreglo seguro.
 * </summary>
 * @param rawSelections - JSON guardado en base de datos.
 * @returns Selecciones parseadas o arreglo vacío.
 */
function parseSeleccionesStats(rawSelections: any): any[] {
  // Si no hay selecciones, devolvemos un arreglo vacío.
  if (!rawSelections) {
    return [];
  }

  // Si MySQL devuelve texto JSON, intentamos parsearlo.
  if (typeof rawSelections === "string") {
    try {
      // Devolvemos el JSON convertido a arreglo.
      return JSON.parse(rawSelections);
    } catch (_error) {
      // Si el JSON está dañado, evitamos romper estadísticas.
      return [];
    }
  }

  // Si ya viene como arreglo, lo reutilizamos.
  if (Array.isArray(rawSelections)) {
    return rawSelections;
  }

  // Cualquier otro formato no es seguro para mostrar.
  return [];
}

/**
 * <summary>
 * Enriquece selecciones de parlay con liga, país y mercado legible.
 * </summary>
 * @param rawSelections - Selecciones originales del pick.
 * @param leagueMap - Mapa de ligas por ID.
 * @param marketMap - Mapa de mercados por ID.
 * @returns Selecciones listas para el frontend.
 */
function enriquecerSeleccionesStats(rawSelections: any, leagueMap: Map<string, any>, marketMap: Map<string, any>): any[] {
  // Parseamos el JSON antes de enriquecer.
  const selecciones = parseSeleccionesStats(rawSelections);

  // Mapeamos cada selección con datos legibles.
  return selecciones.map((selection: any) => {
    // Buscamos la liga relacionada con la selección.
    const league = leagueMap.get(String(selection.league_id));

    // Buscamos el mercado relacionado con la selección.
    const market = marketMap.get(String(selection.pick));

    // Devolvemos la selección enriquecida sin perder campos originales.
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
 * <summary>
 * Oculta detalles sensibles de picks VIP pendientes para usuarios sin acceso.
 * </summary>
 * @param pick - Pick original consultado desde base de datos.
 * @returns Pick seguro para entregar al frontend público.
 */
function ocultarDetalleVipPendiente(pick: any): any {
  // Devolvemos el mismo pick con campos deportivos sensibles enmascarados.
  return {
    ...pick,
    match_name: "Pick VIP pendiente",
    league_name: "Detalles disponibles al resolverse",
    country_name: null,
    country_flag: null,
    pick: "vip_pending",
    market_label: "Reservado",
    market_acronym: "VIP",
    odds: null,
    stake: null,
    analysis: null,
    selections: [],
    is_details_locked: true,
  };
}

/**
 * <summary>
 * Decide si un pick debe salir completo o enmascarado en estadísticas.
 * </summary>
 * @param pick - Pick consultado desde base de datos.
 * @param usuario - Usuario autenticado opcional.
 * @param planesActivos - Planes activos del usuario autenticado.
 * @param leagueMap - Mapa de ligas por ID.
 * @param marketMap - Mapa de mercados por ID.
 * @returns Pick seguro para la zona de estadísticas.
 */
function prepararPickStats(pick: any, usuario: { role: string } | null, planesActivos: string[], leagueMap: Map<string, any>, marketMap: Map<string, any>): any {
  // Normalizamos el slug para distinguir picks gratuitos de VIP.
  const slug = String(pick.pick_type_slug || "");

  // Detectamos si el pick pertenece a un plan VIP.
  const esVip = slug !== "free";

  // Detectamos si el pick ya tiene resultado público.
  const estaResuelto = ESTADOS_RESUELTOS.has(String(pick.status));

  // Solo los VIP pendientes necesitan control de detalle.
  const debeOcultarse = esVip && !estaResuelto && !puedeVerDetallePendienteVip(pick, usuario, planesActivos);

  // Si debe ocultarse, entregamos una versión segura.
  if (debeOcultarse) {
    return ocultarDetalleVipPendiente(pick);
  }

  // Si puede verse, enriquecemos selecciones de parlay para mostrar detalle real.
  return {
    ...pick,
    selections: enriquecerSeleccionesStats(pick.selections, leagueMap, marketMap),
    is_details_locked: false,
  };
}

// ─── GET /api/stats/performance ──────────────────────────────────────────────
/**
 * Devuelve las estadísticas globales de rendimiento de los picks.
 * Agrupa por plan (free, cuota_2, etc.) y calcula: totalPicks, won, lost,
 * voided, hitRate, yield y profit.
 * Ruta pública: visible en la página de estadísticas.
 */
router.get("/performance", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Filtro de fecha opcional para comparar períodos
    let filtroFecha = "";
    const parametros: any[] = [];

    if (startDate && endDate) {
      filtroFecha = " AND p.match_date >= ? AND p.match_date <= ?";
      parametros.push(startDate, endDate);
    }

    // Obtenemos todos los picks resueltos con su tipo de plan
    const [picks]: any = await pool.query(
      `SELECT p.status, p.stake, p.odds, pt.slug AS pick_type_slug 
       FROM picks p 
       LEFT JOIN pick_types pt ON p.pick_type_id = pt.id 
       WHERE p.status IN ('won', 'lost', 'void') ${filtroFecha}`,
      parametros
    );

    // Inicializamos el objeto de estadísticas con el grupo 'all' (global)
    const estadisticasPorPlan: Record<string, any> = {
      all: { totalPicks: 0, won: 0, lost: 0, voided: 0, profit: 0, totalStaked: 0 },
    };

    // Procesamos cada pick y acumulamos las estadísticas
    picks.forEach((pick: any) => {
      const stake = Number(pick.stake) || 0;    // Unidades apostadas
      const odds = Number(pick.odds) || 1;       // Cuota decimal
      const plan = pick.pick_type_slug || "free"; // Plan al que pertenece

      // Creamos el grupo del plan si no existe aún
      if (!estadisticasPorPlan[plan]) {
        estadisticasPorPlan[plan] = {
          totalPicks: 0, won: 0, lost: 0, voided: 0, profit: 0, totalStaked: 0,
        };
      }

      // Incrementamos el total de picks en grupo global y por plan
      estadisticasPorPlan.all.totalPicks++;
      estadisticasPorPlan[plan].totalPicks++;

      // Calculamos profit y actualizamos según resultado
      if (pick.status === "won") {
        // Ganado: profit = stake × (cuota - 1)
        const profit = stake * (odds - 1);
        estadisticasPorPlan.all.won++;
        estadisticasPorPlan.all.totalStaked += stake;
        estadisticasPorPlan.all.profit += profit;
        estadisticasPorPlan[plan].won++;
        estadisticasPorPlan[plan].totalStaked += stake;
        estadisticasPorPlan[plan].profit += profit;
      } else if (pick.status === "lost") {
        // Perdido: profit = -stake
        estadisticasPorPlan.all.lost++;
        estadisticasPorPlan.all.totalStaked += stake;
        estadisticasPorPlan.all.profit -= stake;
        estadisticasPorPlan[plan].lost++;
        estadisticasPorPlan[plan].totalStaked += stake;
        estadisticasPorPlan[plan].profit -= stake;
      } else if (pick.status === "void") {
        // Nulo: no afecta al profit pero contamos el pick
        estadisticasPorPlan.all.voided++;
        estadisticasPorPlan[plan].voided++;
      }
    });

    // Calculamos hitRate y yield para cada grupo
    for (const clave in estadisticasPorPlan) {
      const stats = estadisticasPorPlan[clave];
      const picksResueltos = stats.won + stats.lost;

      // Hit rate: porcentaje de aciertos sobre picks resueltos (sin nulos)
      stats.hitRate = picksResueltos > 0
        ? ((stats.won / picksResueltos) * 100).toFixed(2)
        : "0.00";

      // Yield: retorno sobre inversión = profit / totalStaked × 100
      stats.yield = stats.totalStaked > 0
        ? ((stats.profit / stats.totalStaked) * 100).toFixed(2)
        : "0.00";

      // Formateamos el profit con 2 decimales
      stats.profit = stats.profit.toFixed(2);
    }

    return res.json(estadisticasPorPlan);
  } catch (error) {
    console.error("[STATS] Error obteniendo estadísticas de rendimiento:", error);
    return res.status(500).json({ error: "Error al obtener estadísticas de rendimiento" });
  }
});

// ─── GET /api/stats/monthly-yield ────────────────────────────────────────────
/**
 * Devuelve el yield mensual de los últimos 6 meses para el gráfico de tendencia.
 * Ruta pública.
 */
router.get("/monthly-yield", async (_req, res) => {
  try {
    // Agrupamos picks por mes y calculamos profit y total staked por mes dentro de los últimos 6 meses calendario
    const [filas]: any = await pool.query(`
      SELECT 
        DATE_FORMAT(match_date, '%Y-%m') AS mes,
        SUM(CASE 
          WHEN status = 'won'  THEN stake * (odds - 1)
          WHEN status = 'lost' THEN -stake
          ELSE 0 
        END) AS profit,
        SUM(CASE 
          WHEN status IN ('won', 'lost') THEN stake
          ELSE 0 
        END) AS total_staked
      FROM picks
      WHERE status IN ('won', 'lost', 'void')
        AND match_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
      GROUP BY mes
      ORDER BY mes ASC
    `);

    // Indexamos las filas por mes para rellenar meses sin picks con valores en cero
    const filasPorMes = new Map<string, any>(filas.map((fila: any) => [String(fila.mes), fila]));

    // Tomamos el primer día del mes actual para construir meses consistentes sin saltos por día/hora
    const fechaBase = new Date();

    // Fijamos el día en 1 para evitar que meses cortos salten de forma inesperada
    fechaBase.setDate(1);

    // Creamos los últimos 6 meses en orden ascendente para que el gráfico siempre tenga eje X visible
    const mesesRecientes = Array.from({ length: 6 }, (_valor, indice) => {
      // Calculamos el mes correspondiente desde el más antiguo hasta el actual
      const fecha = new Date(fechaBase.getFullYear(), fechaBase.getMonth() - (5 - indice), 1);

      // Formateamos el año con 4 dígitos
      const anio = fecha.getFullYear();

      // Formateamos el mes con 2 dígitos
      const mes = String(fecha.getMonth() + 1).padStart(2, "0");

      // Devolvemos el formato YYYY-MM requerido por el frontend
      return `${anio}-${mes}`;
    });

    // Convertimos cada mes a un punto de gráfico compatible con frontend actual y versiones anteriores
    const dataMensual = mesesRecientes.map((mes) => {
      // Recuperamos la fila real del mes si existe
      const fila = filasPorMes.get(mes);

      // Normalizamos el profit para evitar strings/null desde MySQL
      const profit = Number(fila?.profit) || 0;

      // Normalizamos el total apostado para evitar división por cero o strings/null desde MySQL
      const totalStaked = Number(fila?.total_staked) || 0;

      // Devolvemos un punto estable para Recharts
      return {
        /** Mes en formato YYYY-MM */
        mes,
        /** Alias usado por el eje X de la home */
        month: mes,
        /** Yield del mes en porcentaje */
        yield: totalStaked > 0
          ? Number(((profit / totalStaked) * 100).toFixed(2))
          : 0,
        /** Profit neto del mes */
        profit: Number(profit.toFixed(2)),
      };
    });

    return res.json(dataMensual);
  } catch (error) {
    console.error("[STATS] Error obteniendo yield mensual:", error);
    return res.status(500).json({ error: "Error al obtener yield mensual" });
  }
});

// ─── GET /api/stats/revenue ──────────────────────────────────────────────────
/**
 * Devuelve las estadísticas de ingresos del negocio.
 * Incluye: ingresos por día/plan, distribución de planes activos y totales.
 * Solo administradores.
 */
router.get("/revenue", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let filtroFecha = "";
    const parametros: any[] = [];

    if (startDate && endDate) {
      filtroFecha = " WHERE created_at >= ? AND created_at <= ?";
      parametros.push(startDate, endDate);
    }

    // Ingresos agrupados por día y plan para el gráfico de ingresos
    const [ingresosPorDia]: any = await pool.query(
      `SELECT 
         DATE_FORMAT(created_at, '%Y-%m-%d') AS fecha,
         plan_id,
         SUM(amount) AS total_cop,
         SUM(amount_usd) AS total_usd
       FROM user_subscriptions
       ${filtroFecha}
       GROUP BY fecha, plan_id
       ORDER BY fecha ASC`,
      parametros
    );

    // Distribución de planes activos (instantánea del momento actual)
    const [distribucionPlanes]: any = await pool.query(`
      SELECT plan_id, COUNT(*) AS cantidad
      FROM user_subscriptions
      WHERE expires_at > NOW()
      GROUP BY plan_id
    `);

    // Total de ingresos por plan en el período seleccionado
    const [totalPorPlan]: any = await pool.query(
      `SELECT 
         plan_id,
         SUM(amount) AS total_cop,
         SUM(amount_usd) AS total_usd
       FROM user_subscriptions
       ${filtroFecha}
       GROUP BY plan_id`,
      parametros
    );

    return res.json({
      revenueByDay: ingresosPorDia.map((r: any) => ({ ...r, date: r.fecha, plan_id: r.plan_id })),
      planDistribution: distribucionPlanes.map((r: any) => ({ plan_id: r.plan_id, count: Number(r.cantidad) })),
      totalRevenue: totalPorPlan.map((r: any) => ({ plan_id: r.plan_id, total_cop: Number(r.total_cop), total_usd: Number(r.total_usd) })),
    });
  } catch (error) {
    console.error("[STATS] Error obteniendo ingresos:", error);
    return res.status(500).json({ error: "Error al obtener estadísticas de ingresos" });
  }
});

// ─── GET /api/stats/advanced ─────────────────────────────────────────────────
/**
 * Devuelve estadísticas avanzadas: rendimiento por liga y por mercado.
 * Útil para identificar en qué tipo de apuestas se tiene mejor tasa de acierto.
 * Solo administradores.
 */
router.get("/advanced", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let filtroFecha = "";
    const parametros: any[] = [];

    if (startDate && endDate) {
      filtroFecha = " AND p.match_date >= ? AND p.match_date <= ?";
      parametros.push(startDate, endDate);
    }

    // Rendimiento por liga: top 15 ligas con más picks resueltos
    const [porLiga]: any = await pool.query(
      `SELECT 
         l.name AS liga,
         COUNT(*) AS total_picks,
         SUM(CASE WHEN p.status = 'won'  THEN 1 ELSE 0 END) AS ganados,
         SUM(CASE WHEN p.status = 'lost' THEN 1 ELSE 0 END) AS perdidos,
         SUM(p.stake) AS total_staked,
         SUM(CASE 
           WHEN p.status = 'won'  THEN p.stake * (p.odds - 1)
           WHEN p.status = 'lost' THEN -p.stake
           ELSE 0 
         END) AS profit
       FROM picks p
       JOIN leagues l ON p.league_id = l.id
       WHERE p.status IN ('won', 'lost') ${filtroFecha}
       GROUP BY l.id, l.name
       ORDER BY total_picks DESC
       LIMIT 15`,
      parametros
    );

    // Rendimiento por mercado: top 15 mercados con más actividad
    const [porMercado]: any = await pool.query(
      `SELECT 
         p.pick AS mercado,
         COUNT(*) AS total_picks,
         SUM(CASE WHEN p.status = 'won'  THEN 1 ELSE 0 END) AS ganados,
         SUM(CASE WHEN p.status = 'lost' THEN 1 ELSE 0 END) AS perdidos,
         SUM(p.stake) AS total_staked,
         SUM(CASE 
           WHEN p.status = 'won'  THEN p.stake * (p.odds - 1)
           WHEN p.status = 'lost' THEN -p.stake
           ELSE 0 
         END) AS profit
       FROM picks p
       WHERE p.status IN ('won', 'lost') AND p.is_parlay = false ${filtroFecha}
       GROUP BY p.pick
       ORDER BY total_picks DESC
       LIMIT 15`,
      parametros
    );

    return res.json({
      byLeague: porLiga.map((l: any) => ({
        ...l,
        league: l.liga,
        yield: l.total_staked > 0
          ? ((l.profit / l.total_staked) * 100).toFixed(2)
          : "0.00",
        profit: Number(l.profit).toFixed(2),
      })),
      byMarket: porMercado.map((m: any) => ({
        ...m,
        market: m.mercado,
        yield: m.total_staked > 0
          ? ((m.profit / m.total_staked) * 100).toFixed(2)
          : "0.00",
        profit: Number(m.profit).toFixed(2),
      })),
    });
  } catch (error) {
    console.error("[STATS] Error obteniendo estadísticas avanzadas:", error);
    return res.status(500).json({ error: "Error al obtener estadísticas avanzadas" });
  }
});

// ─── GET /api/stats/historical-picks ─────────────────────────────────────────
/**
 * Devuelve el historial de picks resueltos para la nueva página pública de resultados.
 * Filtrable por período, liga, tipo y estado.
 */
router.get("/historical-picks", async (req, res) => {
  try {
    // Leemos filtros y el indicador que permite incluir pendientes para el registro.
    const { startDate, endDate, pickType, leagueId, includePending, limit = "50", offset = "0" } = req.query;

    // Detectamos sesión opcional para mostrar VIP pendientes solo a quien corresponde.
    const usuario = obtenerUsuarioOpcional(req);

    // Cargamos planes activos del usuario autenticado; visitantes quedan sin permisos VIP.
    const planesActivos = usuario ? await obtenerPlanesActivosUsuario(usuario.id) : [];

    // Construimos la query dinámicamente según los filtros recibidos
    const condiciones = [
      includePending === "1" || includePending === "true"
        ? "p.status IN ('pending', 'won', 'lost', 'void', 'half-won', 'half-lost')"
        : "p.status IN ('won', 'lost', 'void', 'half-won', 'half-lost')",
    ];
    const parametros: any[] = [];

    // Filtro de fechas
    if (startDate && endDate) {
      condiciones.push("p.match_date >= ? AND p.match_date <= ?");
      parametros.push(startDate, endDate);
    }

    // Filtro por tipo de pick
    if (pickType && pickType !== "all") {
      condiciones.push("pt.slug = ?");
      parametros.push(pickType);
    }

    // Filtro por liga
    if (leagueId && leagueId !== "all") {
      condiciones.push("p.league_id = ?");
      parametros.push(leagueId);
    }

    const whereSql = condiciones.join(" AND ");

    // Query principal con todos los datos necesarios para mostrar en la tabla
    const [picks] = await pool.query(
      `SELECT 
         p.id, p.match_date, p.match_name, p.pick, p.odds, p.stake, 
         p.status, p.analysis, p.is_parlay, p.selections, p.pick_type_id,
         pt.name AS pick_type_name, pt.slug AS pick_type_slug,
         COALESCE(l.name, p.league) AS league_name,
         m.label AS market_label, m.acronym AS market_acronym,
         c.name AS country_name, c.flag AS country_flag
       FROM picks p
       LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
       LEFT JOIN leagues    l  ON p.league_id = l.id
       LEFT JOIN markets    m  ON p.pick = m.id
       LEFT JOIN countries  c  ON l.country_id = c.id
       WHERE ${whereSql}
       ORDER BY p.match_date DESC
       LIMIT ? OFFSET ?`,
      [...parametros, parseInt(String(limit), 10), parseInt(String(offset), 10)]
    );

    // Consultamos ligas con país para enriquecer selecciones de parlays.
    const [ligas]: any = await pool.query(
      `SELECT l.id, l.name, c.name AS country_name, c.flag AS country_flag
       FROM leagues l
       LEFT JOIN countries c ON l.country_id = c.id`
    );

    // Consultamos mercados para mostrar pronósticos legibles en cada selección.
    const [mercados]: any = await pool.query("SELECT id, label, acronym FROM markets");

    // Indexamos ligas por ID para resolver selecciones sin consultas por fila.
    const leagueMap = new Map<string, any>(ligas.map((league: any) => [String(league.id), league]));

    // Indexamos mercados por ID para resolver selecciones sin consultas por fila.
    const marketMap = new Map<string, any>(mercados.map((market: any) => [String(market.id), market]));

    // Aplicamos reglas de visibilidad VIP antes de responder al frontend.
    const picksSeguros = (picks as any[]).map((pick) =>
      prepararPickStats(pick, usuario, planesActivos, leagueMap, marketMap)
    );

    // Contamos el total para la paginación en el frontend
    const [total]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM picks p
       LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
       WHERE ${whereSql}`,
      parametros
    );

    return res.json({
      /** Lista de picks del historial */
      picks: picksSeguros,
      /** Total de picks que cumplen el filtro (para paginación) */
      total: total[0].total,
    });
  } catch (error) {
    console.error("[STATS] Error obteniendo historial de picks:", error);
    return res.status(500).json({ error: "Error al obtener historial de picks" });
  }
});

// ─── GET /api/stats/monthly-group ────────────────────────────────────────────
/**
 * Devuelve el profit y yield acumulado mensual filtrado por grupo (slug del plan).
 * Usado por el ticket social para mostrar estadísticas del mes cuando el pick se gana.
 * Ruta pública (solo muestra datos acumulados, no detalle de picks).
 */
router.get("/monthly-group", async (req, res) => {
  try {
    // Leemos el slug del plan y el mes/año opcionales desde query params.
    const { slug, month, year } = req.query;

    // Usamos el mes y año actuales si no se envían.
    const now = new Date();
    const targetYear = year ? parseInt(String(year), 10) : now.getFullYear();
    const targetMonth = month ? parseInt(String(month), 10) : now.getMonth() + 1;

    // Construimos el string de mes en formato YYYY-MM para el filtro SQL.
    const mesStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;

    // Construimos filtro de tipo de pick según el slug recibido.
    const condicionSlug = slug && slug !== "all"
      ? "AND pt.slug = ?"
      : "";
    const parametros: any[] = slug && slug !== "all" ? [mesStr, slug] : [mesStr];

    // Consultamos picks resueltos del mes filtrado por grupo.
    const [filas]: any = await pool.query(
      `SELECT
         p.status,
         p.stake,
         p.odds,
         pt.slug AS pick_type_slug,
         pt.name AS pick_type_name
       FROM picks p
       LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
       WHERE p.status IN ('won', 'lost', 'void', 'half-won', 'half-lost')
         AND DATE_FORMAT(p.match_date, '%Y-%m') = ?
         ${condicionSlug}`,
      parametros
    );

    // Calculamos profit y stake total acumulados.
    let totalProfit = 0;
    let totalStaked = 0;
    let totalPicks = 0;
    let ganados = 0;

    filas.forEach((pick: any) => {
      const stake = Number(pick.stake) || 0;
      const odds = Number(pick.odds) || 1;

      if (pick.status === "won") {
        totalProfit += stake * (odds - 1);
        totalStaked += stake;
        ganados++;
        totalPicks++;
      } else if (pick.status === "lost") {
        totalProfit -= stake;
        totalStaked += stake;
        totalPicks++;
      } else if (pick.status === "half-won") {
        totalProfit += (stake * (odds - 1)) / 2;
        totalStaked += stake;
        ganados++;
        totalPicks++;
      } else if (pick.status === "half-lost") {
        totalProfit -= stake / 2;
        totalStaked += stake;
        totalPicks++;
      }
    });

    // Calculamos yield sobre el total apostado.
    const yieldPct = totalStaked > 0
      ? Number(((totalProfit / totalStaked) * 100).toFixed(2))
      : 0;

    // Construimos la etiqueta legible del mes en español.
    const fecha = new Date(targetYear, targetMonth - 1, 1);
    const mesLabel = fecha.toLocaleDateString("es-CO", {
      month: "long",
      year: "numeric",
      timeZone: "America/Bogota",
    }).replace(/^./, (c) => c.toUpperCase());

    return res.json({
      slug: slug || "all",
      mes: mesStr,
      mesLabel,
      totalPicks,
      ganados,
      profit: Number(totalProfit.toFixed(2)),
      yield: yieldPct,
      totalStaked: Number(totalStaked.toFixed(2)),
    });
  } catch (error) {
    console.error("[STATS] Error obteniendo stats mensuales por grupo:", error);
    return res.status(500).json({ error: "Error al obtener estadísticas mensuales por grupo" });
  }
});

// Exportamos el router
export default router;
