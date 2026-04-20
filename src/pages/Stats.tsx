import { useState, useEffect, useMemo } from "react";
import { TrendingUp, Activity, Target, CheckCircle2, XCircle, MinusCircle, Calendar, BarChart3, Trophy, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { CountryFlag } from "../components/CountryFlag";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, Legend, Cell
} from "recharts";
import { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";
import { es } from "date-fns/locale";

export function Stats() {
  const [picks, setPicks] = useState<any[]>([]);
  const [allPicks, setAllPicks] = useState<any[]>([]); // incluye pendientes para el registro
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("all");
  const [plan, setPlan] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 10;

  useEffect(() => {
    const fetchPicks = async () => {
      try {
        const res = await fetch("/api/picks");
        const data = await res.json();
        // Todos los picks para el registro de partidos
        setAllPicks(data);
        // Solo resueltos para las estadísticas/gráficos
        const resolvedPicks = data.filter((p: any) => p.status !== 'pending');
        setPicks(resolvedPicks);
      } catch (error) {
        console.error("Error fetching picks:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPicks();
  }, []);

  // Filtrar picks según el periodo y plan
  const filteredPicks = useMemo(() => {
    let filtered = picks;
    
    if (timeframe !== "all") {
      const now = new Date();
      filtered = filtered.filter(pick => {
        const pickDate = new Date(pick.match_date);
        if (timeframe === "this-year") {
          return pickDate.getFullYear() === now.getFullYear();
        }
        if (timeframe === "this-month") {
          return pickDate.getMonth() === now.getMonth() && pickDate.getFullYear() === now.getFullYear();
        }
        if (timeframe === "last-month") {
          const lastMonth = subMonths(now, 1);
          return pickDate.getMonth() === lastMonth.getMonth() && pickDate.getFullYear() === lastMonth.getFullYear();
        }
        if (timeframe === "last-3-months") {
          return pickDate >= subMonths(now, 3);
        }
        if (timeframe === "last-6-months") {
          return pickDate >= subMonths(now, 6);
        }
        if (timeframe === "last-year") {
          return pickDate >= subMonths(now, 12);
        }
        return true;
      });
    }

    if (plan !== "all") {
      filtered = filtered.filter(pick => {
        if (plan === "free") return pick.pick_type_slug === 'free';
        if (plan === "vip") return pick.pick_type_slug !== 'free';
        return pick.plan_id === plan;
      });
    }

    return filtered;
  }, [picks, timeframe, plan]);

  // Calcular estadísticas globales
  const globalStats = useMemo(() => {
    let totalStake = 0;
    let totalProfitUnits = 0;
    let wins = 0;
    let losses = 0;
    let voids = 0;

    filteredPicks.forEach(pick => {
      const stake = Number(pick.stake) || 0;
      const odds = Number(pick.odds) || 0;
      
      if (pick.status === 'won') {
        totalProfitUnits += stake * (odds - 1);
        wins++;
        totalStake += stake;
      } else if (pick.status === 'lost') {
        totalProfitUnits -= stake;
        losses++;
        totalStake += stake;
      } else if (pick.status === 'void') {
        voids++;
      }
    });

    const yieldVal = totalStake > 0 ? (totalProfitUnits / totalStake) * 100 : 0;
    const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
    const totalPicks = wins + losses + voids;
    
    return { totalProfitUnits, yieldVal, winRate, wins, losses, voids, totalPicks };
  }, [filteredPicks]);

  // Datos para el gráfico de beneficio mensual
  const monthlyData = useMemo(() => {
    if (filteredPicks.length === 0) return [];

    // Agrupar por mes
    const grouped = filteredPicks.reduce((acc: any, pick) => {
      const date = new Date(pick.match_date);
      const monthKey = format(date, 'yyyy-MM');
      
      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: monthKey,
          displayMonth: format(date, 'MMM yyyy', { locale: es }),
          profit: 0,
          yield: 0,
          totalStake: 0,
          wins: 0,
          losses: 0,
          voids: 0
        };
      }

      const stake = Number(pick.stake) || 0;
      const odds = Number(pick.odds) || 0;
      
      if (pick.status === 'won') {
        acc[monthKey].profit += stake * (odds - 1);
        acc[monthKey].wins++;
        acc[monthKey].totalStake += stake;
      } else if (pick.status === 'lost') {
        acc[monthKey].profit -= stake;
        acc[monthKey].losses++;
        acc[monthKey].totalStake += stake;
      } else if (pick.status === 'void') {
        acc[monthKey].voids++;
      }

      return acc;
    }, {});

    // Convertir a array y ordenar cronológicamente
    let result = Object.values(grouped).sort((a: any, b: any) => a.month.localeCompare(b.month));
    
    // Calcular Yield por mes y beneficio acumulado
    let cumulativeProfit = 0;
    result = result.map((item: any) => {
      cumulativeProfit += item.profit;
      return {
        ...item,
        yield: item.totalStake > 0 ? (item.profit / item.totalStake) * 100 : 0,
        cumulativeProfit: Number(cumulativeProfit.toFixed(2)),
        profit: Number(item.profit.toFixed(2))
      };
    });

    return result;
  }, [filteredPicks]);

  // Datos para el gráfico de deportes/ligas (Top 5 ligas más rentables)
  const leagueData = useMemo(() => {
    if (filteredPicks.length === 0) return [];

    const grouped = filteredPicks.reduce((acc: any, pick) => {
      const league = pick.league_name || pick.league || 'Otra';
      if (!acc[league]) {
        acc[league] = { name: league, profit: 0, picks: 0 };
      }
      
      const stake = Number(pick.stake) || 0;
      const odds = Number(pick.odds) || 0;
      
      if (pick.status === 'won') {
        acc[league].profit += stake * (odds - 1);
      } else if (pick.status === 'lost') {
        acc[league].profit -= stake;
      }
      
      acc[league].picks++;
      return acc;
    }, {});

    // Ordenar por beneficio y tomar las top 5
    return Object.values(grouped)
      .sort((a: any, b: any) => b.profit - a.profit)
      .slice(0, 5)
      .map((item: any) => ({
        ...item,
        profit: Number(item.profit.toFixed(2))
      }));
  }, [filteredPicks]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-white/10 p-4 rounded-lg shadow-xl">
          <p className="font-bold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}{entry.name.includes('Yield') ? '%' : ' U'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="py-12 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Estadísticas <span className="text-primary">Históricas</span></h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
          Transparencia total. Analiza nuestro rendimiento histórico, rentabilidad por mes y estadísticas detalladas de todos nuestros pronósticos verificados.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col items-center gap-4 mb-12">
        <div className="flex flex-wrap justify-center bg-white/5 border border-white/10 rounded-lg p-1 gap-1">
          <button 
            onClick={() => setTimeframe("all")}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${timeframe === "all" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            Todo
          </button>
          <button 
            onClick={() => setTimeframe("this-year")}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${timeframe === "this-year" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            Este Año
          </button>
          <button 
            onClick={() => setTimeframe("this-month")}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${timeframe === "this-month" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            Este Mes
          </button>
          <button 
            onClick={() => setTimeframe("last-month")}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${timeframe === "last-month" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            Mes Anterior
          </button>
          <button 
            onClick={() => setTimeframe("last-3-months")}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${timeframe === "last-3-months" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            3 Meses
          </button>
          <button 
            onClick={() => setTimeframe("last-6-months")}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${timeframe === "last-6-months" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            6 Meses
          </button>
          <button 
            onClick={() => setTimeframe("last-year")}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${timeframe === "last-year" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            Último Año
          </button>
        </div>
        <div className="inline-flex bg-white/5 border border-white/10 rounded-lg p-1">
          <button 
            onClick={() => setPlan("all")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${plan === "all" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            Todos los Planes
          </button>
          <button 
            onClick={() => setPlan("free")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${plan === "free" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            Gratis
          </button>
          <button 
            onClick={() => setPlan("vip")}
            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${plan === "vip" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-white"}`}
          >
            VIP
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : filteredPicks.length === 0 ? (
        <div className="bg-card border border-white/10 rounded-2xl p-12 text-center max-w-2xl mx-auto">
          <BarChart3 className="w-16 h-16 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-xl font-bold mb-2">No hay datos suficientes</h3>
          <p className="text-muted-foreground">Aún no hay picks resueltos en este periodo para mostrar estadísticas.</p>
        </div>
      ) : (
        <>
          {/* KPIs Principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="group p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 text-left relative overflow-hidden hover:border-emerald-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10"
            >
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Beneficio Neto</span>
              </div>
              <div className={`text-3xl font-black ${globalStats.totalProfitUnits >= 0 ? 'text-green-500' : 'text-red-500'} tabular-nums`}>
                {globalStats.totalProfitUnits >= 0 ? '+' : ''}{globalStats.totalProfitUnits.toFixed(2)} U
              </div>
            </motion.div>
            
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="group p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 text-left relative overflow-hidden hover:border-blue-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10"
            >
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <Activity className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Yield Global</span>
              </div>
              <div className={`text-3xl font-black ${globalStats.yieldVal >= 0 ? 'text-green-500' : 'text-red-500'} tabular-nums`}>
                {globalStats.yieldVal.toFixed(2)}%
              </div>
            </motion.div>
            
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="group p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 text-left relative overflow-hidden hover:border-orange-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-orange-500/10"
            >
              <div className="flex items-center gap-2 text-orange-400 mb-2">
                <Target className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Win Rate</span>
              </div>
              <div className="text-3xl font-black text-white tabular-nums">
                {globalStats.winRate.toFixed(1)}%
              </div>
            </motion.div>
            
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="group p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 text-left relative overflow-hidden hover:border-purple-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/10"
            >
              <div className="flex items-center gap-2 text-purple-400 mb-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Total Picks</span>
              </div>
              <div className="text-3xl font-black text-white tabular-nums">
                {globalStats.totalPicks}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {globalStats.wins}G - {globalStats.losses}P - {globalStats.voids}N
              </div>
            </motion.div>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            {/* Gráfico de Beneficio Acumulado */}
            <div className="bg-card border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Evolución del Beneficio (Unidades)
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F27D26" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="displayMonth" stroke="rgba(255,255,255,0.5)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickFormatter={(val) => `${val}U`} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                    <Area type="monotone" dataKey="cumulativeProfit" name="Beneficio Acumulado" stroke="#F27D26" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" isAnimationActive={true} animationDuration={1500} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico de Beneficio por Mes */}
            <div className="bg-card border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Beneficio Mensual (Unidades)
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="displayMonth" stroke="rgba(255,255,255,0.5)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickFormatter={(val) => `${val}U`} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                    <Bar 
                      dataKey="profit" 
                      name="Beneficio" 
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={true} 
                      animationDuration={1500}
                    >
                      {monthlyData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico de Yield Mensual */}
            <div className="bg-card border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Yield Mensual (%)
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="displayMonth" stroke="rgba(255,255,255,0.5)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickFormatter={(val) => `${val}%`} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                    <Line type="monotone" dataKey="yield" name="Yield" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} isAnimationActive={true} animationDuration={1500} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Ligas Rentables */}
            <div className="bg-card border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                Top 5 Ligas más Rentables
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leagueData} layout="vertical" margin={{ top: 10, right: 10, left: 40, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" stroke="rgba(255,255,255,0.5)" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.5)" fontSize={11} width={100} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                    <Bar dataKey="profit" name="Beneficio" fill="#F27D26" radius={[0, 4, 4, 0]} barSize={24} isAnimationActive={true} animationDuration={1500} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Tabla Resumen Mensual */}
          <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10">
              <h3 className="text-lg font-bold">Desglose Mensual</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-primary/20 border-b border-primary/30">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider">Mes</th>
                    <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider text-center">Picks</th>
                    <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider text-center">Aciertos</th>
                    <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider text-center">Win Rate</th>
                    <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider text-center">Yield</th>
                    <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider text-right">Beneficio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {monthlyData.slice().reverse().map((month: any, idx: number) => {
                    const totalPicks = month.wins + month.losses + month.voids;
                    const winRate = month.wins + month.losses > 0 ? (month.wins / (month.wins + month.losses)) * 100 : 0;
                    
                    return (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-bold capitalize">{month.displayMonth}</td>
                        <td className="px-6 py-4 text-center">{totalPicks}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-green-500">{month.wins}</span> - <span className="text-red-500">{month.losses}</span> - <span className="text-gray-400">{month.voids}</span>
                        </td>
                        <td className="px-6 py-4 text-center">{winRate.toFixed(1)}%</td>
                        <td className={`px-6 py-4 text-center font-bold ${month.yield >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {month.yield.toFixed(2)}%
                        </td>
                        <td className={`px-6 py-4 text-right font-bold ${month.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {month.profit >= 0 ? '+' : ''}{month.profit.toFixed(2)} U
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Registro de Partidos ──────────────────────────────────────────── */}
          {(() => {
            // Filtramos todos los picks (incluidos pendientes) según el plan y periodo
            const filteredAll = allPicks.filter(pick => {
              // Filtro de periodo
              if (timeframe !== 'all') {
                const now = new Date();
                const pickDate = new Date(pick.match_date);
                const { subMonths } = { subMonths: (d: Date, n: number) => { const r = new Date(d); r.setMonth(r.getMonth() - n); return r; } };
                if (timeframe === 'this-year' && pickDate.getFullYear() !== now.getFullYear()) return false;
                if (timeframe === 'this-month' && (pickDate.getMonth() !== now.getMonth() || pickDate.getFullYear() !== now.getFullYear())) return false;
                if (timeframe === 'last-month') { const lm = subMonths(now, 1); if (pickDate.getMonth() !== lm.getMonth() || pickDate.getFullYear() !== lm.getFullYear()) return false; }
                if (timeframe === 'last-3-months' && pickDate < subMonths(now, 3)) return false;
                if (timeframe === 'last-6-months' && pickDate < subMonths(now, 6)) return false;
                if (timeframe === 'last-year' && pickDate < subMonths(now, 12)) return false;
              }
              // Filtro de plan
              if (plan === 'free' && pick.pick_type_slug !== 'free') return false;
              if (plan === 'vip' && pick.pick_type_slug === 'free') return false;
              return true;
            });

            // Ordenamos de más reciente a más antiguo
            const sortedAll = [...filteredAll].sort(
              (a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime()
            );

            const totalPages = Math.ceil(sortedAll.length / HISTORY_PER_PAGE);
            const paginated = sortedAll.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE);

            const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
              won:        { label: 'Ganado',   color: 'text-green-400',   bg: 'bg-green-400/10',   border: 'border-green-400/25',   icon: <CheckCircle  className="w-4 h-4 text-green-400" /> },
              lost:       { label: 'Perdido',  color: 'text-red-400',     bg: 'bg-red-400/10',     border: 'border-red-400/25',     icon: <XCircle      className="w-4 h-4 text-red-400" /> },
              void:       { label: 'Anulado',  color: 'text-gray-400',    bg: 'bg-gray-400/10',    border: 'border-gray-400/25',    icon: <MinusCircle  className="w-4 h-4 text-gray-400" /> },
              'half-won': { label: 'Medio G',  color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/25', icon: <CheckCircle  className="w-4 h-4 text-emerald-400" /> },
              'half-lost':{ label: 'Medio P',  color: 'text-orange-400',  bg: 'bg-orange-400/10',  border: 'border-orange-400/25',  icon: <MinusCircle  className="w-4 h-4 text-orange-400" /> },
              pending:    { label: 'Pendiente',color: 'text-yellow-400',  bg: 'bg-yellow-400/10',  border: 'border-yellow-400/25',  icon: <Activity     className="w-4 h-4 text-yellow-400" /> },
            };

            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mt-16"
              >
                {/* Header de la sección */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                      <Calendar className="w-7 h-7 text-primary" />
                      Registro de <span className="text-primary">Partidos</span>
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {sortedAll.length} picks en el período · Transparencia total, pick a pick
                    </p>
                  </div>

                  {/* Badges de resumen */}
                  <div className="flex flex-wrap gap-2">
                    {(['won', 'lost', 'void', 'pending'] as const).map(s => {
                      const cnt = sortedAll.filter(p => p.status === s).length;
                      if (cnt === 0) return null;
                      const cfg = statusConfig[s];
                      return (
                        <div key={s} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                          {cfg.icon}
                          <span>{cnt} {cfg.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Lista de picks */}
                {paginated.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground bg-card border border-white/10 rounded-2xl">
                    <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="font-medium">No hay partidos para mostrar en este período.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {paginated.map(pick => {
                        const cfg = statusConfig[pick.status] || statusConfig['pending'];
                        const matchDate = new Date(pick.match_date);
                        const dateStr = matchDate.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
                        const timeStr = matchDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                        const profitLabel = pick.status === 'won'
                          ? `+${((Number(pick.odds) - 1) * Number(pick.stake)).toFixed(2)} U`
                          : pick.status === 'lost'
                          ? `-${Number(pick.stake).toFixed(2)} U`
                          : pick.status === 'void'
                          ? '0.00 U'
                          : '—';
                        const profitColor = pick.status === 'won' ? 'text-green-400' : pick.status === 'lost' ? 'text-red-400' : pick.status === 'void' ? 'text-gray-400' : 'text-yellow-400';

                        return (
                          <motion.div
                            key={pick.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2 }}
                            className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border bg-card/50 hover:bg-card transition-all duration-200 ${cfg.bg} ${cfg.border}`}
                          >
                            {/* Izquierda: estado + partido */}
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              {/* Badge estado escritorio */}
                              <div className={`hidden md:flex flex-col items-center justify-center w-[60px] h-[60px] rounded-xl border shrink-0 ${cfg.bg} ${cfg.border}`}>
                                {cfg.icon}
                                <span className={`text-[9px] font-black uppercase tracking-wider mt-0.5 ${cfg.color}`}>{cfg.label}</span>
                              </div>

                              <div className="min-w-0 flex-1">
                                {/* Cabecera del partido */}
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  {!Boolean(pick.is_parlay) && pick.country_flag && (
                                    <CountryFlag code={pick.country_flag} />
                                  )}
                                  {Boolean(pick.is_parlay) && (
                                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">PARLAY</span>
                                  )}
                                  <span className="font-semibold text-sm truncate">{pick.match_name}</span>
                                  {/* Estado en móvil */}
                                  <span className={`md:hidden ml-auto text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>{cfg.label}</span>
                                </div>
                                {/* Liga + fecha */}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                  {pick.league_name && (
                                    <span className="bg-white/5 px-2 py-0.5 rounded-full border border-white/5">{pick.league_name}</span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {dateStr} · {timeStr}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Derecha: métricas con anchos fijos para alineación perfecta */}
                            <div className="flex items-center gap-2 md:gap-4 shrink-0 pl-0 md:pl-4 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                              {/* Tipo de pick: muestra nombre específico (VIP 2+, VIP 5+, Free) */}
                              <div className="text-center hidden sm:flex flex-col items-center w-[72px] shrink-0">
                                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Tipo</div>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md leading-tight text-center ${
                                  pick.pick_type_slug !== 'free'
                                    ? 'bg-primary/20 text-primary border border-primary/30'
                                    : 'bg-white/10 text-white border border-white/10'
                                }`}>
                                  {pick.pick_type_slug !== 'free'
                                    ? (pick.pick_type_name || 'VIP').replace('VIP Cuota ', 'VIP ').replace('Gratis (Free)', 'Free')
                                    : 'Free'}
                                </span>
                              </div>

                              {/* Pronóstico */}
                              <div className="text-center hidden lg:flex flex-col items-center w-[100px] shrink-0">
                                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Pronóstico</div>
                                <div className="text-xs font-bold truncate w-full text-center">{pick.market_label || pick.market_acronym || pick.pick}</div>
                              </div>

                              {/* Cuota */}
                              <div className="flex flex-col items-center w-[60px] shrink-0 text-center">
                                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Cuota</div>
                                <div className="text-sm font-black text-yellow-400">@{Number(pick.odds).toFixed(2)}</div>
                              </div>

                              {/* Stake */}
                              <div className="flex flex-col items-center w-[50px] shrink-0 text-center">
                                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Stake</div>
                                <div className="text-sm font-bold">{pick.stake}U</div>
                              </div>

                              {/* Beneficio */}
                              <div className="flex flex-col items-center w-[72px] shrink-0 text-center">
                                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Beneficio</div>
                                <div className={`text-sm font-black tabular-nums ${profitColor}`}>{profitLabel}</div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Paginación */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-3 mt-8">
                        <button
                          onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                          disabled={historyPage === 1}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium"
                        >
                          <ChevronLeft className="w-4 h-4" /> Anterior
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const page = Math.max(1, Math.min(totalPages - 4, historyPage - 2)) + i;
                            return (
                              <button
                                key={page}
                                onClick={() => setHistoryPage(page)}
                                className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                                  historyPage === page
                                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                                    : 'bg-white/5 hover:bg-white/10 text-muted-foreground'
                                }`}
                              >
                                {page}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                          disabled={historyPage === totalPages}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium"
                        >
                          Siguiente <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            );
          })()}

        </>
      )}
    </div>
  );
}
