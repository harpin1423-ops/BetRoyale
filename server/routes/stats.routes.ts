/**
 * @file stats.routes.ts
 * @description Rutas de estadísticas y análisis de rendimiento.
 * Incluye: estadísticas públicas de picks, yield mensual,
 * ingresos del admin y estadísticas avanzadas por liga y mercado.
 */

import { Router } from "express";
import { pool } from "../config/database";
import { authenticateToken, requireAdmin } from "../middleware/auth";

// Creamos el router para las rutas de estadísticas
const router = Router();

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
    // Agrupamos picks por mes y calculamos profit y total staked por mes
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
      GROUP BY mes
      ORDER BY mes DESC
      LIMIT 6
    `);

    // Invertimos el orden para que el más antiguo esté primero (para el gráfico)
    const dataMensual = filas.reverse().map((fila: any) => {
      const profit = Number(fila.profit) || 0;
      const totalStaked = Number(fila.total_staked) || 0;
      return {
        /** Mes en formato YYYY-MM */
        mes: fila.mes,
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
    const { startDate, endDate, pickType, leagueId, limit = "50", offset = "0" } = req.query;

    // Construimos la query dinámicamente según los filtros recibidos
    let condiciones = ["p.status IN ('won', 'lost', 'void', 'half-won', 'half-lost')"];
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
         p.status, p.analysis, p.is_parlay,
         pt.name AS pick_type_name, pt.slug AS pick_type_slug,
         COALESCE(l.name, p.league) AS league_name,
         m.label AS market_label, m.acronym AS market_acronym,
         c.flag AS country_flag
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

    // Contamos el total para la paginación en el frontend
    const [total]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM picks p
       LEFT JOIN pick_types pt ON p.pick_type_id = pt.id
       WHERE ${whereSql}`,
      parametros
    );

    return res.json({
      /** Lista de picks del historial */
      picks,
      /** Total de picks que cumplen el filtro (para paginación) */
      total: total[0].total,
    });
  } catch (error) {
    console.error("[STATS] Error obteniendo historial de picks:", error);
    return res.status(500).json({ error: "Error al obtener historial de picks" });
  }
});

// Exportamos el router
export default router;
