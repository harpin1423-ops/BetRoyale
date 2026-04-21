import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, ShieldCheck, Target, CheckCircle2, Crown, Flame, Quote, BarChart3, Users, Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getPickDisplay } from "../lib/constants";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const HERO_WORDS = [
  "Análisis Profesional",
  "Gestión de Banca",
  "Picks Rentables",
  "Información Exclusiva"
];

const TESTIMONIALS = [
  {
    name: "Carlos R.",
    role: "Miembro VIP desde 2023",
    content: "Increíble la consistencia. Al principio era escéptico, pero siguiendo el stake recomendado mi banca ha crecido un 40% en 4 meses.",
    avatar: "https://i.pravatar.cc/150?u=carlos"
  },
  {
    name: "Andrés M.",
    role: "Suscriptor Plan Cuota 3+",
    content: "Lo que más valoro es la transparencia. Si hay un día malo, se registra. Pero a largo plazo, los resultados hablan por sí solos.",
    avatar: "https://i.pravatar.cc/150?u=andres"
  },
  {
    name: "Juan P.",
    role: "Usuario VIP",
    content: "El análisis que envían con cada pick es de otro nivel. No solo te dan el pronóstico, te explican el porqué. He aprendido mucho.",
    avatar: "https://i.pravatar.cc/150?u=juan"
  }
];

export function Home() {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [picks, setPicks] = useState<any[]>([]);
  const [stats, setStats] = useState({
    yieldVal: "0.0",
    winRate: "0.0",
    profit: "0.0",
    totalPicks: 0
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % HERO_WORDS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const [activeTab, setActiveTab] = useState<'all' | 'vip' | 'free'>('all');
  const [allStats, setAllStats] = useState<any>(null);
  const [monthlyYield, setMonthlyYield] = useState<any[]>([]);
  const [wonToday, setWonToday] = useState(0);

  useEffect(() => {
    const fetchPicksAndStats = async () => {
      try {
        const [picksRes, statsRes, monthlyRes] = await Promise.all([
          fetch("/api/picks"),
          fetch("/api/stats/performance"),
          fetch("/api/stats/monthly-yield")
        ]);
        const picksData = await picksRes.json();
        const statsData = await statsRes.json();
        const monthlyData = await monthlyRes.json();

        // Normalizamos los puntos mensuales porque producción puede devolver "mes" y la gráfica usa "month".
        const normalizedMonthlyData = Array.isArray(monthlyData)
          ? monthlyData.map((point: any) => ({
              // Conservamos la clave principal que usa el eje X.
              month: point.month || point.mes,
              // Conservamos la clave legacy que devuelve el backend para compatibilidad.
              mes: point.mes || point.month,
              // Convertimos yield a número para que Recharts pueda dibujar la línea.
              yield: Number(point.yield) || 0,
              // Convertimos profit a número para mantener tooltips y futuros cálculos estables.
              profit: Number(point.profit) || 0,
            }))
          : [];
        
        setPicks(picksData);
        setAllStats(statsData);
        setMonthlyYield(normalizedMonthlyData);

        // Calculate won today
        const today = new Date().toISOString().split('T')[0];
        const wonCount = picksData.filter((p: any) => 
          p.status === 'won' && p.match_date.startsWith(today)
        ).length;
        setWonToday(wonCount);
        
        // Initial stats for 'all'
        setStats({
          yieldVal: statsData.all?.yield || "0.00",
          winRate: statsData.all?.hitRate || "0.00",
          profit: statsData.all?.profit || "0.00",
          totalPicks: statsData.all?.totalPicks || 0
        });
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchPicksAndStats();
  }, []);

  // Update stats when tab changes
  useEffect(() => {
    if (!allStats) return;

    if (activeTab === 'all') {
      setStats({
        yieldVal: allStats.all?.yield || "0.00",
        winRate: allStats.all?.hitRate || "0.00",
        profit: allStats.all?.profit || "0.00",
        totalPicks: allStats.all?.totalPicks || 0
      });
    } else if (activeTab === 'free') {
      setStats({
        yieldVal: allStats.free?.yield || "0.00",
        winRate: allStats.free?.hitRate || "0.00",
        profit: allStats.free?.profit || "0.00",
        totalPicks: allStats.free?.totalPicks || 0
      });
    } else if (activeTab === 'vip') {
      // Aggregate all cuota_* stats for VIP
      let totalPicks = 0;
      let won = 0;
      let lost = 0;
      let profit = 0;
      let totalStaked = 0;

      Object.keys(allStats).forEach(key => {
        if (key.startsWith('cuota_')) {
          const s = allStats[key];
          totalPicks += s.totalPicks;
          won += s.won;
          lost += s.lost;
          profit += Number(s.profit);
          totalStaked += s.totalStaked;
        }
      });

      const yieldVal = totalStaked > 0 ? ((profit / totalStaked) * 100).toFixed(2) : "0.00";
      const winRate = (won + lost) > 0 ? ((won / (won + lost)) * 100).toFixed(2) : "0.00";

      setStats({
        yieldVal,
        winRate,
        profit: profit.toFixed(2),
        totalPicks
      });
    }
  }, [activeTab, allStats]);

  const recentWinners = useMemo(() => {
    return picks.filter(p => p.status === 'won').slice(0, 5);
  }, [picks]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden">
        {/* Professional Background */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-40 transition-opacity duration-1000 blur-[2px]"
            style={{ 
              backgroundImage: 'url("https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=2000")',
              backgroundAttachment: 'scroll'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background"></div>
          
          {/* Animated Glows */}
          <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[120px] animate-pulse delay-700"></div>
        </div>
        
        <div className="container mx-auto px-4 md:px-6 relative z-10 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="group relative inline-flex items-center gap-3 px-6 py-2 rounded-full bg-black/20 border border-white/10 text-sm font-bold text-white mb-10 overflow-hidden transition-all hover:border-primary/50 hover:shadow-[0_0_20px_rgba(212,175,55,0.2)]"
          >
            {/* Shimmer Effect */}
            <motion.div 
              animate={{ x: ['-100%', '200%'] }}
              transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 z-0"
            />
            
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"></div>
            
            <div className="relative z-10 flex items-center gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 text-primary shadow-[0_0_10px_rgba(212,175,55,0.3)]">
                <Flame className="w-4 h-4 animate-pulse" />
              </div>
              <div className="flex flex-col items-start leading-none">
                <span className="tracking-[0.15em] uppercase text-[9px] sm:text-[10px] text-muted-foreground font-black">Estrategia Verificada</span>
                <span className="text-[11px] sm:text-xs font-bold">Rentabilidad Mensual Demostrada</span>
              </div>
              <div className="h-6 w-[1px] bg-white/10 mx-1"></div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-black shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                <TrendingUp className="w-3 h-3" />
                {allStats?.all?.yield ? `${Number(allStats.all.yield) > 0 ? '+' : ''}${allStats.all.yield}%` : '+15.4%'} YIELD
              </div>
            </div>
          </motion.div>
          
          <h1 className="text-lg sm:text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter mb-6 max-w-5xl mx-auto leading-[1.1] md:leading-[1.1] uppercase drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] px-2">
            Domina las apuestas con <br />
            <span className="inline-flex relative min-h-[1.5em] w-full items-center justify-center align-bottom py-1">
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={currentWordIndex}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-primary absolute inset-0 flex items-center justify-center px-2 drop-shadow-[0_0_30px_rgba(212,175,55,0.4)] text-center leading-tight"
                >
                  {HERO_WORDS[currentWordIndex]}
                </motion.span>
              </AnimatePresence>
              {/* Responsive placeholder to maintain width and height without overflow */}
              <span className="invisible px-2 py-1 text-center leading-tight">Información Exclusiva</span>
            </span>
          </h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-base md:text-xl text-white font-medium mb-12 max-w-2xl mx-auto leading-relaxed px-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
          >
            BetRoyale Club – Exclusividad, análisis y precisión. Accede a pronósticos deportivos de alto rendimiento con transparencia total y estadísticas verificadas.
          </motion.p>
          
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 px-4"
            >
              <Link to="/pricing" className="w-full sm:w-auto px-10 py-4 rounded-xl bg-primary text-primary-foreground font-bold text-lg hover:bg-primary/90 transition-all shadow-[0_10px_30px_rgba(212,175,55,0.4)] hover:shadow-[0_15px_40px_rgba(212,175,55,0.6)] flex items-center justify-center gap-2 transform hover:-translate-y-1">
                <Crown className="w-5 h-5" />
                Hazte VIP Ahora
              </Link>
              <Link to="/free-picks" className="w-full sm:w-auto px-10 py-4 rounded-xl bg-black/40 border border-white/20 text-white font-semibold text-lg hover:bg-black/60 transition-all flex items-center justify-center gap-2 backdrop-blur-xl shadow-2xl">
                Ver Picks Gratis
              </Link>
            </motion.div>

            {/* Picks Won Today Counter */}
            {wonToday > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-24"
              >
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-background bg-emerald-500 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                  ))}
                </div>
                <div className="text-left">
                  <p className="text-sm font-black uppercase tracking-wider leading-none">{wonToday} Picks Ganados Hoy</p>
                  <p className="text-[10px] opacity-70 font-bold uppercase tracking-widest">Resultados Verificados</p>
                </div>
              </motion.div>
            )}

          {/* Dynamic Winners Marquee - Professional Design */}
          {recentWinners.length > 0 && (
            <div className="w-full overflow-hidden relative py-6 border-y border-white/5 bg-background/40 backdrop-blur-md">
              <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10"></div>
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10"></div>
              
              <motion.div 
                animate={{ x: [0, -1500] }}
                transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
                className="flex gap-8 whitespace-nowrap w-max px-4"
              >
                {[...recentWinners, ...recentWinners, ...recentWinners, ...recentWinners].map((winner, i) => (
                  <div key={i} className="flex flex-col items-center gap-4 px-8 py-5 rounded-2xl bg-gradient-to-br from-white/10 to-white/[0.02] backdrop-blur-xl border border-white/10 shadow-2xl group hover:border-primary/40 transition-all duration-500 transform hover:scale-[1.02]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center justify-center gap-2">
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Verificado</span>
                        <span className={`text-[10px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-md ${winner.pick_type_slug !== 'free' ? 'bg-primary text-primary-foreground' : 'bg-white/20 text-white'}`}>
                          {winner.pick_type_slug !== 'free' ? 'VIP' : 'Gratis'}
                        </span>
                        {Boolean(winner.is_parlay) && (
                          <span className="text-[10px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-md bg-indigo-600 text-white">
                            Parlay
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-base font-bold text-white group-hover:text-primary transition-colors text-center">
                          {winner.is_parlay ? `Combinada x${winner.selections?.length || 0}` : winner.match_name}
                        </span>
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-lg font-black text-primary">@{winner.odds}</span>
                          <div className="h-4 w-[1px] bg-white/10"></div>
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Stake {winner.stake}</span>
                            <span className="text-[9px] font-bold text-primary/80 uppercase tracking-tighter">{winner.pick_type_name || 'Premium'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          )}
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-card/30 backdrop-blur-3xl border-y border-white/5"></div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="flex flex-col items-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-4">
              <ShieldCheck className="w-3 h-3" />
              Datos 100% Auditados
            </div>
            <h2 className="text-3xl md:text-5xl font-black mb-4 uppercase tracking-tighter text-center">
              Resultados <span className="text-primary">Reales</span>
            </h2>
            <p className="text-muted-foreground text-center max-w-xl mb-10 text-sm md:text-base">
              Nuestra transparencia es nuestra mayor garantía. Filtra las estadísticas por tipo de membresía para ver el rendimiento específico.
            </p>

            <div className="flex p-1.5 bg-black/40 rounded-2xl border border-white/10 backdrop-blur-2xl shadow-2xl">
              <button 
                onClick={() => setActiveTab('all')}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-300 ${activeTab === 'all' ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(212,175,55,0.4)]' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}
              >
                <TrendingUp className="w-4 h-4" />
                Global
              </button>
              <button 
                onClick={() => setActiveTab('vip')}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-300 ${activeTab === 'vip' ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(212,175,55,0.4)]' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}
              >
                <Crown className="w-4 h-4" />
                VIP Premium
              </button>
              <button 
                onClick={() => setActiveTab('free')}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-300 ${activeTab === 'free' ? 'bg-primary text-primary-foreground shadow-[0_0_20px_rgba(212,175,55,0.4)]' : 'text-muted-foreground hover:text-white hover:bg-white/5'}`}
              >
                <Target className="w-4 h-4" />
                Modo Gratis
              </button>
            </div>
            
            <div className="mt-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Mostrando: <span className="text-primary">{activeTab === 'all' ? 'Todos los pronósticos' : activeTab === 'vip' ? 'Solo planes de pago' : 'Pronósticos abiertos'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 max-w-6xl mx-auto">
            <motion.div 
              key={activeTab + 'yield'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.05 }}
              className="group p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 text-left relative overflow-hidden hover:border-emerald-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10"
            >
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Yield Histórico</span>
              </div>
              <h3 className={`text-3xl md:text-4xl font-black ${Number(stats.yieldVal) > 0 ? 'text-green-500' : 'text-white'} tabular-nums`}>
                {Number(stats.yieldVal) > 0 ? '+' : ''}{stats.yieldVal}%
              </h3>
            </motion.div>

            <motion.div 
              key={activeTab + 'win'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              whileHover={{ scale: 1.05 }}
              className="group p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 text-left relative overflow-hidden hover:border-blue-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10"
            >
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <Target className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Porcentaje Acierto</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-black text-white tabular-nums">
                {stats.winRate}%
              </h3>
            </motion.div>

            <motion.div 
              key={activeTab + 'profit'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              whileHover={{ scale: 1.05 }}
              className="group p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 text-left relative overflow-hidden hover:border-orange-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-orange-500/10"
            >
              <div className="flex items-center gap-2 text-orange-400 mb-2">
                <Flame className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Unidades Ganadas</span>
              </div>
              <h3 className={`text-3xl md:text-4xl font-black ${Number(stats.profit) > 0 ? 'text-green-500' : 'text-white'} tabular-nums`}>
                {Number(stats.profit) > 0 ? '+' : ''}{stats.profit}
              </h3>
            </motion.div>

            <motion.div 
              key={activeTab + 'picks'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              whileHover={{ scale: 1.05 }}
              className="group p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 text-left relative overflow-hidden hover:border-purple-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/10"
            >
              <div className="flex items-center gap-2 text-purple-400 mb-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Picks Verificados</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-black text-white tabular-nums">
                {stats.totalPicks}
              </h3>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Yield Growth Chart Section */}
      {monthlyYield.length > 0 && (
        <section className="py-24 bg-card/10">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex flex-col items-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-4">
                <BarChart3 className="w-3 h-3" />
                Crecimiento Sostenible
              </div>
              <h2 className="text-3xl md:text-5xl font-black mb-4 uppercase tracking-tighter text-center">
                Rentabilidad <span className="text-primary">Mensual</span>
              </h2>
              <p className="text-muted-foreground text-center max-w-xl text-sm md:text-base">
                Visualiza el rendimiento de nuestra estrategia a lo largo del tiempo. El Yield representa el beneficio neto sobre el total apostado.
              </p>
            </div>

            <div className="max-w-5xl mx-auto bg-black/20 border border-white/5 rounded-3xl p-6 md:p-10 backdrop-blur-xl">
              <div className="h-[300px] md:h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyYield}>
                    <defs>
                      <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f27d26" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f27d26" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      stroke="#ffffff40" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => {
                        // Evitamos romper el render si llega un valor vacío desde datos antiguos.
                        if (!val) return "";
                        // Separamos el formato YYYY-MM para mostrarlo en español compacto.
                        const [year, month] = val.split('-');
                        // Nombres cortos de meses para el eje X.
                        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                        // Mostramos mes y año corto en el gráfico.
                        return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
                      }}
                    />
                    <YAxis 
                      stroke="#ffffff40" 
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      itemStyle={{ color: '#f27d26' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="yield" 
                      stroke="#f27d26" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorYield)" 
                      /* Punto visible para que un único mes con datos no se vea como gráfico vacío. */
                      dot={{ r: 5, fill: "#f27d26", stroke: "#0b1220", strokeWidth: 2 }}
                      /* Punto destacado al pasar el cursor sobre el gráfico. */
                      activeDot={{ r: 7, fill: "#f27d26", stroke: "#ffffff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">¿Por qué elegir BetRoyale Club?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">No vendemos humo. Ofrecemos un servicio basado en datos, análisis exhaustivo y gestión de banca estricta.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl bg-card border border-white/5 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Transparencia Total</h3>
              <p className="text-muted-foreground">Todos nuestros picks, ganados o perdidos, quedan registrados en nuestro historial público. Sin borrar fallos.</p>
            </div>
            <div className="p-6 rounded-2xl bg-card border border-white/5 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Análisis Profundo</h3>
              <p className="text-muted-foreground">Estudiamos alineaciones, bajas, clima, motivación y estadísticas avanzadas antes de lanzar cualquier pronóstico.</p>
            </div>
            <div className="p-6 rounded-2xl bg-card border border-white/5 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Gestión de Banca</h3>
              <p className="text-muted-foreground">Te enseñamos a gestionar tu capital con un sistema de stakes profesional para asegurar rentabilidad a largo plazo.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-4">
              <Users className="w-3 h-3" />
              Comunidad Real
            </div>
            <h2 className="text-3xl md:text-5xl font-black mb-4 uppercase tracking-tighter text-center">
              Lo que dicen nuestros <span className="text-primary">Miembros</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {TESTIMONIALS.map((testimonial, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-8 rounded-3xl bg-card border border-white/5 relative group hover:border-primary/30 transition-all duration-500"
              >
                <Quote className="absolute top-6 right-8 w-10 h-10 text-primary/10 group-hover:text-primary/20 transition-colors" />
                <div className="flex items-center gap-4 mb-6">
                  <img 
                    src={testimonial.avatar} 
                    alt={testimonial.name} 
                    className="w-12 h-12 rounded-full border-2 border-primary/20"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <h4 className="font-bold text-white">{testimonial.name}</h4>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{testimonial.role}</p>
                  </div>
                </div>
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-3 h-3 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-muted-foreground italic leading-relaxed">
                  "{testimonial.content}"
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-24 bg-card/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Membresías VIP</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Elige el plan que mejor se adapte a tu estilo de inversión.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
            {/* Plan 1 */}
            <div className="p-6 rounded-3xl bg-card border border-white/10 flex flex-col group hover:border-blue-400/30 transition-all">
              <h3 className="text-xl font-bold mb-2">VIP Cuota 2+</h3>
              <p className="text-sm text-muted-foreground mb-4">Ideal para quienes buscan consistencia y bajo riesgo.</p>
              <div className="mb-6">
                <span className="text-3xl font-bold">$10</span>
                <span className="text-sm text-muted-foreground">/mes</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1 text-sm">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Picks diarios (Cuotas 2.0-2.9)</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Stake recomendado (1-3%)</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Análisis técnico de ligas top</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Notificaciones vía Web</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Soporte VIP 24/7</li>
              </ul>
              <Link to="/pricing" className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-center transition-colors text-sm">Seleccionar</Link>
            </div>

            {/* Plan 2 */}
            <div className="p-6 rounded-3xl bg-card border border-primary/50 relative flex flex-col shadow-[0_0_30px_rgba(242,125,38,0.1)] group hover:scale-[1.02] transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider py-0.5 px-3 rounded-full">
                Más Popular
              </div>
              <h3 className="text-xl font-bold mb-2">VIP Cuota 3+</h3>
              <p className="text-sm text-muted-foreground mb-4">El equilibrio perfecto entre riesgo y alta rentabilidad.</p>
              <div className="mb-6">
                <span className="text-3xl font-bold">$15</span>
                <span className="text-sm text-muted-foreground">/mes</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1 text-sm">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Picks diarios (Cuotas 3.0-3.9)</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Stake recomendado (1-2%)</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Acceso a Combinadas Especiales</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Grupo Exclusivo de Telegram</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Soporte VIP 24/7</li>
              </ul>
              <Link to="/pricing" className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-center transition-colors text-sm">Seleccionar</Link>
            </div>

            {/* Plan 3 */}
            <div className="p-6 rounded-3xl bg-card border border-white/10 flex flex-col group hover:border-purple-400/30 transition-all">
              <h3 className="text-xl font-bold mb-2">VIP Cuota 4+</h3>
              <p className="text-sm text-muted-foreground mb-4">Para inversores agresivos buscando grandes beneficios.</p>
              <div className="mb-6">
                <span className="text-3xl font-bold">$20</span>
                <span className="text-sm text-muted-foreground">/mes</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1 text-sm">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Picks de Valor (Cuotas 4.0-4.9)</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Stake conservador (0.5-1%)</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Estrategia de Alto Rendimiento</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Contacto Directo 1 a 1</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Soporte VIP 24/7</li>
              </ul>
              <Link to="/pricing" className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-center transition-colors text-sm">Seleccionar</Link>
            </div>

            {/* Plan 4 */}
            <div className="p-6 rounded-3xl bg-card border border-white/10 flex flex-col group hover:border-red-400/30 transition-all">
              <h3 className="text-xl font-bold mb-2">VIP Cuota 5+</h3>
              <p className="text-sm text-muted-foreground mb-4">Información privilegiada y cuotas explosivas.</p>
              <div className="mb-6">
                <span className="text-3xl font-bold">$25</span>
                <span className="text-sm text-muted-foreground">/mes</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1 text-sm">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Picks Exclusivos (Cuotas 5.0+)</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Stake Mínimo (0.25-0.5%)</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Información de Ligas Exóticas</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Acceso a todos los planes</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Soporte VIP 24/7</li>
              </ul>
              <Link to="/pricing" className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-center transition-colors text-sm">Seleccionar</Link>
            </div>

            {/* Plan 5 - Highlighted */}
            <div className="p-6 rounded-3xl bg-gradient-to-b from-card to-secondary/40 border-2 border-primary relative flex flex-col transform md:-translate-y-2 shadow-[0_0_40px_rgba(212,175,55,0.15)] group hover:scale-[1.05] transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider py-0.5 px-3 rounded-full whitespace-nowrap">
                Ahorra 20%
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-accent" />
                <h3 className="text-xl font-bold">Todos los Planes</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">La experiencia definitiva para el apostador profesional.</p>
              <div className="mb-6">
                <span className="text-3xl font-bold">$56</span>
                <span className="text-sm text-muted-foreground">/mes</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1 text-sm">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Acceso Total a todos los VIP</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Todas las cuotas (2.0 a 5.0+)</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Análisis de Mercados en Vivo</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Auditoría de Bankroll Mensual</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Soporte VIP 24/7</li>
              </ul>
              <Link to="/pricing" className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-center transition-colors text-sm">Empezar Ahora</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
