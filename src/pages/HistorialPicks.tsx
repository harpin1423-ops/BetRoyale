/**
 * @file HistorialPicks.tsx
 * @description Página pública de Historial de Resultados.
 * Muestra todos los picks resueltos con sus métricas de rendimiento:
 * Yield, Winrate (Hit Rate) y tabla filtrable por período, liga y tipo.
 * Implementa el Pendiente #3 del STATUS.md.
 */

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Filter,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  MinusCircle,
  BarChart2,
  Calendar,
  Search,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Estructura de un pick del historial */
interface PickHistorial {
  id: number;
  match_date: string;
  match_name: string;
  pick: string;
  odds: number;
  stake: number;
  status: "won" | "lost" | "void" | "half-won" | "half-lost";
  pick_type_name: string;
  pick_type_slug: string;
  league_name: string;
  market_label: string;
  market_acronym: string;
  country_flag: string;
  is_parlay: boolean;
  score_home?: number | null;
  score_away?: number | null;
  selections?: any[];
  analysis?: string;
}

/** Resumen de métricas calculadas */
interface Metricas {
  totalPicks: number;
  ganados: number;
  perdidos: number;
  anulados: number;
  hitRate: number;
  yield: number;
  profitTotal: number;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/**
 * Calcula el profit de un pick según su resultado.
 */
function calcularProfit(pick: PickHistorial): number {
  const stake = Number(pick.stake) || 1;
  const odds = Number(pick.odds) || 1;

  switch (pick.status) {
    case "won":      return stake * (odds - 1);         // Ganamos la cuota
    case "lost":     return -stake;                      // Perdemos el stake
    case "half-won": return (stake / 2) * (odds - 1);  // Ganamos la mitad
    case "half-lost":return -stake / 2;                 // Perdemos la mitad
    default:         return 0;                           // void: sin efecto
  }
}

/**
 * Calcula las métricas globales de una lista de picks.
 */
function calcularMetricas(picks: PickHistorial[]): Metricas {
  // Iniciamos los acumuladores en cero
  let ganados = 0, perdidos = 0, anulados = 0;
  let totalStaked = 0, profitTotal = 0, wins = 0;

  picks.forEach((pick) => {
    const stake = Number(pick.stake) || 1;
    const profit = calcularProfit(pick);

    profitTotal += profit;

    // Clasificamos el resultado para las estadísticas
    if (pick.status === "won") { ganados++; wins++; totalStaked += stake; }
    else if (pick.status === "lost") { perdidos++; totalStaked += stake; }
    else if (pick.status === "half-won") { ganados++; wins += 0.5; totalStaked += stake; }
    else if (pick.status === "half-lost") { perdidos++; totalStaked += stake; }
    else { anulados++; } // void
  });

  // La base del hitRate son picks resueltos (sin nulos)
  const resueltos = ganados + perdidos;

  return {
    totalPicks: picks.length,
    ganados,
    perdidos,
    anulados,
    hitRate: resueltos > 0 ? (wins / resueltos) * 100 : 0,
    yield: totalStaked > 0 ? (profitTotal / totalStaked) * 100 : 0,
    profitTotal,
  };
}

// ─── Componente de Tarjeta de Métrica ─────────────────────────────────────────

/**
 * Tarjeta que muestra una métrica individual con icono y color según valor.
 */
const TarjetaMetrica: React.FC<{
  titulo: string;
  valor: string;
  icono: React.ReactNode;
  positivo?: boolean;
  neutro?: boolean;
}> = ({ titulo, valor, icono, positivo, neutro }) => {
  // Determinamos el color según si el valor es positivo, negativo o neutro
  const colorClase = neutro
    ? "text-blue-400"
    : positivo
    ? "text-emerald-400"
    : "text-red-400";

  const bgClase = neutro
    ? "bg-blue-500/10 border-blue-500/20"
    : positivo
    ? "bg-emerald-500/10 border-emerald-500/20"
    : "bg-red-500/10 border-red-500/20";

  return (
    <motion.div
      // Animación de entrada con efecto de deslizamiento hacia arriba
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-5 ${bgClase}`}
    >
      {/* Icono y etiqueta del título */}
      <div className="flex items-center gap-2 mb-3">
        <div className={colorClase}>{icono}</div>
        <span className="text-sm text-gray-400 font-medium">{titulo}</span>
      </div>

      {/* Valor principal de la métrica */}
      <p className={`text-3xl font-bold ${colorClase}`}>{valor}</p>
    </motion.div>
  );
};

// ─── Componente de Fila de Pick ───────────────────────────────────────────────

/**
 * Fila de la tabla para un pick individual con expansión de análisis.
 */
const FilaPick: React.FC<{ pick: PickHistorial; indice: number }> = ({ pick, indice }) => {
  // Estado para expandir/colapsar el análisis del pick
  const [expandido, setExpandido] = useState(false);

  // Calculamos el profit de este pick
  const profit = calcularProfit(pick);

  // Configuración visual según el estado del pick
  const configEstado = {
    won: { icono: <CheckCircle className="w-4 h-4" />, clase: "text-emerald-400 bg-emerald-500/10", texto: "Ganado" },
    lost: { icono: <XCircle className="w-4 h-4" />, clase: "text-red-400 bg-red-500/10", texto: "Perdido" },
    void: { icono: <MinusCircle className="w-4 h-4" />, clase: "text-gray-400 bg-gray-500/10", texto: "Nulo" },
    "half-won": { icono: <CheckCircle className="w-4 h-4" />, clase: "text-yellow-400 bg-yellow-500/10", texto: "½ Ganado" },
    "half-lost": { icono: <XCircle className="w-4 h-4" />, clase: "text-orange-400 bg-orange-500/10", texto: "½ Perdido" },
  }[pick.status] || { icono: null, clase: "text-gray-400", texto: pick.status };

  // Formateamos la fecha del partido
  const fecha = new Date(pick.match_date).toLocaleDateString("es-ES", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });

  return (
    <>
      {/* Fila principal del pick */}
      <motion.tr
        // Animación escalonada basada en el índice de la fila
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: indice * 0.03 }}
        className={`border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors 
                    ${pick.analysis ? "cursor-pointer" : ""}`}
        onClick={() => pick.analysis && setExpandido(!expandido)}
      >
        {/* Fecha del partido */}
        <td className="py-3 px-4 text-gray-400 text-sm whitespace-nowrap">{fecha}</td>

        {/* Nombre del partido o liga */}
        <td className="py-3 px-4">
          <div className="font-medium text-white text-sm flex items-center gap-2">
            {pick.match_name}
            {!pick.is_parlay && pick.score_home !== undefined && pick.score_home !== null && (
              <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">
                {pick.score_home} - {pick.score_away}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{pick.league_name}</div>
          
          {/* Detalles de Parlay si aplica */}
          {pick.is_parlay && Array.isArray(pick.selections) && pick.selections.length > 0 && (
            <div className="mt-2 space-y-1">
              {pick.selections.map((sel: any, sIdx: number) => (
                <div key={sIdx} className="text-[10px] text-gray-400 border-l border-white/10 pl-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-gray-300">{sel.match_name}</span>
                    {sel.score_home !== undefined && sel.score_home !== null && (
                      <span className="text-primary font-bold">({sel.score_home}-{sel.score_away})</span>
                    )}
                  </div>
                  <div className="opacity-60">
                    {sel.market_label || sel.pick} @{Number(sel.odds).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </td>

        {/* Pronóstico (mercado) */}
        <td className="py-3 px-4">
          <span className="bg-slate-700/50 text-gray-300 text-xs px-2 py-1 rounded-lg font-mono">
            {pick.is_parlay ? "Combinada" : (pick.market_acronym || pick.pick)}
          </span>
        </td>

        {/* Cuota */}
        <td className="py-3 px-4 text-right text-yellow-400 font-bold text-sm">
          @{Number(pick.odds).toFixed(2)}
        </td>

        {/* Stake */}
        <td className="py-3 px-4 text-right text-gray-400 text-sm">
          {pick.stake}/10
        </td>

        {/* Estado (ganado/perdido/nulo) */}
        <td className="py-3 px-4">
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${configEstado.clase}`}>
            {configEstado.icono}
            {configEstado.texto}
          </span>
        </td>

        {/* Profit calculado */}
        <td className={`py-3 px-4 text-right font-bold text-sm ${
          profit > 0 ? "text-emerald-400" : profit < 0 ? "text-red-400" : "text-gray-400"
        }`}>
          {profit > 0 ? "+" : ""}{profit.toFixed(2)}u
        </td>

        {/* Indicador de análisis expandible */}
        <td className="py-3 px-4 text-center">
          {pick.analysis && (
            <span className="text-gray-500">
              {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          )}
        </td>
      </motion.tr>

      {/* Fila expandida con análisis (colapsable) */}
      <AnimatePresence>
        {expandido && pick.analysis && (
          <motion.tr
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <td colSpan={8} className="px-4 py-3 bg-slate-800/30">
              <div className="flex gap-2 text-sm text-gray-300">
                {/* Icono de análisis */}
                <BarChart2 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">{pick.analysis}</p>
              </div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
};

// ─── Componente Principal ─────────────────────────────────────────────────────

/**
 * Página de Historial de Picks.
 * Muestra el registro completo de todos los pronósticos resueltos
 * con estadísticas de rendimiento y filtros interactivos.
 */
export const HistorialPicks: React.FC = () => {
  // Estado de los picks cargados del servidor
  const [picks, setPicks] = useState<PickHistorial[]>([]);

  // Estado de carga de datos
  const [cargando, setCargando] = useState(true);

  // Filtros de búsqueda
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("all");
  const [filtroTipo, setFiltroTipo] = useState<string>("all");
  const [filtroBusqueda, setFiltroBusqueda] = useState<string>("");
  const [ordenCampo, setOrdenCampo] = useState<"match_date" | "odds" | "profit">("match_date");
  const [ordenDir, setOrdenDir] = useState<"desc" | "asc">("desc");

  // Cargamos el historial al montar el componente
  useEffect(() => {
    async function cargarHistorial() {
      try {
        setCargando(true);

        // Construimos la URL con los filtros de fecha si aplica
        let url = "/api/stats/historical-picks?limit=200";
        const hoy = new Date();

        // Aplicamos el filtro de período de tiempo
        if (filtroPeriodo !== "all") {
          const fechaInicio = new Date();
          if (filtroPeriodo === "30") fechaInicio.setDate(hoy.getDate() - 30);
          else if (filtroPeriodo === "90") fechaInicio.setDate(hoy.getDate() - 90);
          else if (filtroPeriodo === "180") fechaInicio.setDate(hoy.getDate() - 180);
          else if (filtroPeriodo === "365") fechaInicio.setFullYear(hoy.getFullYear() - 1);

          const inicio = fechaInicio.toISOString().split("T")[0];
          const fin = hoy.toISOString().split("T")[0];
          url += `&startDate=${inicio}&endDate=${fin}`;
        }

        // Añadimos filtro por tipo si no es "todos"
        if (filtroTipo !== "all") {
          url += `&pickType=${filtroTipo}`;
        }

        const respuesta = await fetch(url);
        const datos = await respuesta.json();
        setPicks(datos.picks || []);
      } catch (error) {
        console.error("[HISTORIAL] Error cargando picks:", error);
      } finally {
        setCargando(false);
      }
    }

    cargarHistorial();
  }, [filtroPeriodo, filtroTipo]); // Recargamos cuando cambien los filtros del servidor

  // Filtramos y ordenamos los picks en el cliente
  const picksFiltrados = useMemo(() => {
    let resultado = [...picks];

    // Filtro de búsqueda por texto (partido, liga, mercado)
    if (filtroBusqueda.trim()) {
      const busqueda = filtroBusqueda.toLowerCase();
      resultado = resultado.filter(
        (p) =>
          p.match_name.toLowerCase().includes(busqueda) ||
          p.league_name?.toLowerCase().includes(busqueda) ||
          p.market_label?.toLowerCase().includes(busqueda)
      );
    }

    // Ordenamiento de la tabla
    resultado.sort((a, b) => {
      let comparacion = 0;
      if (ordenCampo === "match_date") {
        comparacion = new Date(a.match_date).getTime() - new Date(b.match_date).getTime();
      } else if (ordenCampo === "odds") {
        comparacion = Number(a.odds) - Number(b.odds);
      } else if (ordenCampo === "profit") {
        comparacion = calcularProfit(a) - calcularProfit(b);
      }
      // Aplicamos la dirección del orden
      return ordenDir === "desc" ? -comparacion : comparacion;
    });

    return resultado;
  }, [picks, filtroBusqueda, ordenCampo, ordenDir]);

  // Calculamos las métricas de los picks filtrados
  const metricas = useMemo(() => calcularMetricas(picksFiltrados), [picksFiltrados]);

  /**
   * Cambia el campo de ordenamiento. Si ya estaba activo, alterna la dirección.
   */
  const cambiarOrden = (campo: typeof ordenCampo) => {
    if (ordenCampo === campo) {
      // Alternamos la dirección si ya estaba seleccionado este campo
      setOrdenDir((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      // Nuevo campo: empezamos descendente
      setOrdenCampo(campo);
      setOrdenDir("desc");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pt-8 pb-20 px-4">
      <div className="max-w-7xl mx-auto">

        {/* ── Encabezado de la página ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          {/* Badge de sección */}
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 
                          rounded-full px-4 py-2 text-emerald-400 text-sm font-medium mb-6">
            <BarChart2 className="w-4 h-4" />
            Historial de Resultados
          </div>

          {/* Título principal */}
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white to-gray-400 
                         bg-clip-text text-transparent mb-4">
            Transparencia Total
          </h1>

          {/* Descripción */}
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Todos nuestros picks publicados con su resultado real.
            Sin ocultar nada — aquí está nuestro historial completo.
          </p>
        </motion.div>

        {/* ── Tarjetas de métricas ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {/* Hit Rate */}
          <TarjetaMetrica
            titulo="Hit Rate"
            valor={`${metricas.hitRate.toFixed(1)}%`}
            icono={<Target className="w-5 h-5" />}
            positivo={metricas.hitRate >= 55}
            neutro={metricas.hitRate >= 45 && metricas.hitRate < 55}
          />

          {/* Yield */}
          <TarjetaMetrica
            titulo="Yield"
            valor={`${metricas.yield >= 0 ? "+" : ""}${metricas.yield.toFixed(1)}%`}
            icono={<TrendingUp className="w-5 h-5" />}
            positivo={metricas.yield > 0}
          />

          {/* Profit total */}
          <TarjetaMetrica
            titulo="Profit Total"
            valor={`${metricas.profitTotal >= 0 ? "+" : ""}${metricas.profitTotal.toFixed(1)}u`}
            icono={metricas.profitTotal >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            positivo={metricas.profitTotal > 0}
          />

          {/* Total de picks */}
          <TarjetaMetrica
            titulo="Picks Totales"
            valor={`${metricas.totalPicks}`}
            icono={<Award className="w-5 h-5" />}
            neutro
          />
        </div>

        {/* ── Barra de filtros ── */}
        <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Icono de filtros */}
            <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />

            {/* Filtro de período */}
            <select
              value={filtroPeriodo}
              onChange={(e) => setFiltroPeriodo(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg 
                         px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="all">Todo el tiempo</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 3 meses</option>
              <option value="180">Últimos 6 meses</option>
              <option value="365">Último año</option>
            </select>

            {/* Filtro por tipo de pick */}
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg 
                         px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="all">Todos los planes</option>
              <option value="free">Free</option>
              <option value="cuota_2">VIP Cuota 2+</option>
              <option value="cuota_3">VIP Cuota 3+</option>
              <option value="cuota_4">VIP Cuota 4+</option>
              <option value="cuota_5">VIP Cuota 5+</option>
            </select>

            {/* Buscador de texto */}
            <div className="relative flex-1 min-w-48">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar partido, liga..."
                value={filtroBusqueda}
                onChange={(e) => setFiltroBusqueda(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-300 text-sm 
                           rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-emerald-500 
                           focus:border-transparent placeholder:text-gray-600"
              />
            </div>

            {/* Resumen de resultados */}
            <div className="flex items-center gap-3 text-xs text-gray-500 ml-auto">
              <span className="text-emerald-400 font-semibold">{metricas.ganados}G</span>
              <span className="text-red-400 font-semibold">{metricas.perdidos}P</span>
              <span className="text-gray-500">{metricas.anulados}N</span>
            </div>
          </div>
        </div>

        {/* ── Tabla de picks ── */}
        <div className="bg-gray-900/50 backdrop-blur border border-gray-800 rounded-2xl overflow-hidden">
          {cargando ? (
            /* Estado de carga */
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 
                              rounded-full animate-spin" />
            </div>
          ) : picksFiltrados.length === 0 ? (
            /* Estado vacío */
            <div className="text-center py-20 text-gray-500">
              <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No hay picks que coincidan con los filtros seleccionados.</p>
            </div>
          ) : (
            /* Tabla de resultados */
            <div className="overflow-x-auto">
              <table className="w-full">
                {/* Encabezado de la tabla */}
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/80">
                    {/* Columna fecha con ordenamiento */}
                    <th
                      className="text-left py-3 px-4 text-xs font-semibold text-gray-500 
                                 uppercase tracking-wider cursor-pointer hover:text-gray-300 
                                 transition-colors select-none"
                      onClick={() => cambiarOrden("match_date")}
                    >
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Fecha
                        {ordenCampo === "match_date" && (
                          ordenDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                        )}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Partido</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pick</th>

                    {/* Columna cuota con ordenamiento */}
                    <th
                      className="text-right py-3 px-4 text-xs font-semibold text-gray-500 
                                 uppercase tracking-wider cursor-pointer hover:text-gray-300 
                                 transition-colors select-none"
                      onClick={() => cambiarOrden("odds")}
                    >
                      <div className="flex items-center gap-1 justify-end">
                        Cuota
                        {ordenCampo === "odds" && (
                          ordenDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                        )}
                      </div>
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stake</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Resultado</th>

                    {/* Columna profit con ordenamiento */}
                    <th
                      className="text-right py-3 px-4 text-xs font-semibold text-gray-500 
                                 uppercase tracking-wider cursor-pointer hover:text-gray-300 
                                 transition-colors select-none"
                      onClick={() => cambiarOrden("profit")}
                    >
                      <div className="flex items-center gap-1 justify-end">
                        Profit
                        {ordenCampo === "profit" && (
                          ordenDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>

                {/* Cuerpo de la tabla con filas de picks */}
                <tbody>
                  {picksFiltrados.map((pick, idx) => (
                    <FilaPick key={pick.id} pick={pick} indice={idx} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Nota de transparencia ── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-gray-600 text-sm mt-8"
        >
          📊 Todos los picks son publicados antes del partido.
          El historial se actualiza automáticamente con los resultados reales.
        </motion.p>
      </div>
    </div>
  );
};
