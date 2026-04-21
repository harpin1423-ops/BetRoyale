import { useState, useEffect, useMemo, useCallback } from "react";
import { Calendar, TrendingUp, CheckCircle, XCircle, Clock, MinusCircle, Trophy, Activity, ChevronRight, Filter, Lock, Save, DollarSign } from "lucide-react";
import { getPickDisplay } from "../lib/constants";
import { getLocalizedStatus } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { CountryFlag } from "../components/CountryFlag";

export function VipPicks() {
  const [picks, setPicks] = useState<any[]>([]);
  const [pickTypes, setPickTypes] = useState<any[]>([]);
  const [planSettings, setPlanSettings] = useState<any[]>([]);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [telegramLinks, setTelegramLinks] = useState<{ free: string, vip: { name: string, link: string, expires_at?: string | null }[] }>({ free: "#", vip: [] });
  const { token, user } = useAuth();
  
  const [initialBank, setInitialBank] = useState<number>(1000);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>("all");

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Preparamos headers autenticados para endpoints que dependen del usuario.
        const authHeaders = token ? { "Authorization": `Bearer ${token}` } : {};

        const [picksRes, typesRes, settingsRes, tgRes] = await Promise.all([
          fetch("/api/picks", { headers: authHeaders }),
          fetch("/api/pick-types", { headers: authHeaders }),
          fetch("/api/user/plan-settings", { headers: authHeaders }),
          fetch("/api/user/telegram-links", { headers: authHeaders })
        ]);

        // Usamos arreglos seguros si algún endpoint responde error.
        const picksData = picksRes.ok ? await picksRes.json() : [];
        const typesData = typesRes.ok ? await typesRes.json() : [];
        const settingsData = settingsRes.ok ? await settingsRes.json() : [];
        const tgData = tgRes.ok ? await tgRes.json() : { free: "#", vip: [] };

        const vipPicks = Array.isArray(picksData) ? picksData.filter((p: any) => p.pick_type_slug !== 'free') : [];
        setPicks(vipPicks);
        
        const vipTypes = Array.isArray(typesData) ? typesData.filter((t: any) => t.slug !== 'free') : [];
        setPickTypes(vipTypes);
        setPlanSettings(Array.isArray(settingsData) ? settingsData : []);
        setTelegramLinks(tgData);

        if (vipTypes.length > 0 && activePlanId === null) {
          setActivePlanId(vipTypes[0].id);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (activePlanId !== null) {
      const setting = planSettings.find(s => s.pick_type_id === activePlanId);
      setInitialBank(setting ? Number(setting.initial_bankroll) : 1000);
    }
  }, [activePlanId, planSettings]);

  const saveBankroll = async () => {
    if (activePlanId === null) return;
    setIsSavingBank(true);
    try {
      await fetch("/api/user/plan-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          pick_type_id: activePlanId,
          initial_bankroll: initialBank
        })
      });
      // Update local state
      setPlanSettings(prev => {
        const existing = prev.find(s => s.pick_type_id === activePlanId);
        if (existing) {
          return prev.map(s => s.pick_type_id === activePlanId ? { ...s, initial_bankroll: initialBank } : s);
        }
        return [...prev, { pick_type_id: activePlanId, initial_bankroll: initialBank }];
      });
    } catch (error) {
      console.error("Error saving bankroll:", error);
    } finally {
      setIsSavingBank(false);
    }
  };

  const filteredPicks = useMemo(() => {
    let filtered = picks;
    
    if (activePlanId !== null) {
      filtered = filtered.filter(p => p.pick_type_id?.toString() === activePlanId.toString());
    }

    if (dateFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter(pick => {
        const pickDate = new Date(pick.match_date);
        if (dateFilter === "today") {
          return pickDate.toDateString() === now.toDateString();
        }
        if (dateFilter === "this-month") {
          return pickDate.getMonth() === now.getMonth() && pickDate.getFullYear() === now.getFullYear();
        }
        if (dateFilter === "last-month") {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return pickDate.getMonth() === lastMonth.getMonth() && pickDate.getFullYear() === lastMonth.getFullYear();
        }
        if (dateFilter === "this-year") {
          return pickDate.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }
    
    return filtered;
  }, [picks, dateFilter, activePlanId]);

  const calculateStats = () => {
    let totalStake = 0;
    let totalProfitUnits = 0;
    let wins = 0;
    let losses = 0;
    let voids = 0;
    let currentStreak = 0;
    let streakType = '';

    // Calculate streak from most recent resolved picks
    for (const pick of filteredPicks) {
      if (pick.status === 'won') {
        if (streakType === '' || streakType === 'W') {
          streakType = 'W';
          currentStreak++;
        } else break;
      } else if (pick.status === 'lost') {
        if (streakType === '' || streakType === 'L') {
          streakType = 'L';
          currentStreak++;
        } else break;
      }
    }

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
    const unitValue = initialBank / 100;
    const profitCurrency = totalProfitUnits * unitValue;
    const currentBank = initialBank + profitCurrency;
    const roi = initialBank > 0 ? (profitCurrency / initialBank) * 100 : 0;
    
    return { 
      totalProfitUnits, 
      profitCurrency, 
      currentBank, 
      yieldVal, 
      wins, 
      losses, 
      voids, 
      totalStake,
      roi,
      streak: `${currentStreak}${streakType}`
    };
  };

  const activePlan = useMemo(() => {
    return pickTypes.find(t => t.id === activePlanId);
  }, [pickTypes, activePlanId]);

  const hasAccess = useMemo(() => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!activePlan) return false;
    
    // Check if user has a subscription for this plan OR for all_plans
    return user.subscriptions?.some(sub => 
      sub.plan_id === activePlan.slug || sub.plan_id === 'all_plans'
    ) || false;
  }, [user, activePlan]);

  const stats = calculateStats();

  const getStatusBadge = (status: string) => {
    const localized = getLocalizedStatus(status);
    switch (status) {
      case 'won':
        return <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/20 text-green-500 text-xs font-bold uppercase tracking-wider"><CheckCircle className="w-3 h-3" /> {localized}</span>;
      case 'lost':
        return <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider"><XCircle className="w-3 h-3" /> {localized}</span>;
      case 'void':
        return <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-500/20 text-gray-400 text-xs font-bold uppercase tracking-wider"><MinusCircle className="w-3 h-3" /> {localized}</span>;
      default:
        return <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-500 text-xs font-bold uppercase tracking-wider"><Clock className="w-3 h-3" /> {localized}</span>;
    }
  };

  const pickOfTheDay = filteredPicks.length > 0 ? filteredPicks[0] : null;
  const pastPicks = filteredPicks.length > 1 ? filteredPicks.slice(1) : [];

  return (
    <div className="py-12 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-primary/20 text-primary px-4 py-2 rounded-full font-bold uppercase tracking-wider text-sm mb-4">
          <Lock className="w-4 h-4" /> Zona VIP
        </div>
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Picks <span className="text-primary">Exclusivos</span></h1>
        <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
          Bienvenido a la zona premium. Aquí encontrarás nuestros pronósticos de mayor confianza y rentabilidad.
        </p>
      </div>

      {pickTypes.length > 0 && (
        <div className="flex overflow-x-auto pb-4 mb-6 hide-scrollbar gap-2">
          {pickTypes.map(type => (
            <button
              key={type.id}
              onClick={() => setActivePlanId(type.id)}
              className={`px-6 py-3 rounded-xl font-bold whitespace-nowrap transition-all ${
                activePlanId === type.id 
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' 
                  : 'bg-card border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20'
              }`}
            >
              {type.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-card border border-white/10 rounded-2xl p-4 mb-8">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Filter className="w-5 h-5 text-primary" />
          <select 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-background border border-white/10 rounded-lg px-4 py-2 text-foreground focus:outline-none focus:border-primary w-full md:w-auto"
          >
            <option value="all">Todo el histórico</option>
            <option value="today">Hoy</option>
            <option value="this-month">Este Mes</option>
            <option value="last-month">Mes Pasado</option>
            <option value="this-year">Este Año</option>
          </select>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Bank Inicial:</label>
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <input 
                type="number" 
                value={initialBank} 
                onChange={(e) => setInitialBank(Number(e.target.value) || 0)}
                className="bg-background border border-white/10 rounded-lg pl-8 pr-4 py-2 text-foreground focus:outline-none focus:border-primary w-full md:w-32 font-bold"
              />
            </div>
            <button 
              onClick={saveBankroll}
              disabled={isSavingBank}
              className="bg-primary/20 text-primary hover:bg-primary/30 p-2 rounded-lg transition-colors disabled:opacity-50"
              title="Guardar Bankroll"
            >
              <Save className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Telegram Links Section */}
      {hasAccess && telegramLinks.vip.length > 0 && (
        <div className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-blue-600/20 to-primary/20 border border-blue-500/30">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">¡Únete a nuestros canales de Telegram!</h3>
                <p className="text-sm text-blue-200/70">Recibe notificaciones instantáneas de cada pick directamente en tu móvil.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {telegramLinks.vip.map((vip, idx) => (
                <a 
                  key={idx}
                  href={vip.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20"
                >
                  <span>
                    <span className="block">Canal {vip.name}</span>
                    {vip.expires_at && (
                      <span className="block text-[10px] font-medium text-blue-100/80">
                        Link privado, expira en 24h
                      </span>
                    )}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isLoading && filteredPicks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <DollarSign className="w-5 h-5" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Bank Actual</span>
            </div>
            <div className="text-3xl md:text-4xl font-black text-white tabular-nums">${stats.currentBank.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">1 Unidad = ${(initialBank / 100).toFixed(2)}</div>
          </div>
          <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="w-5 h-5" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Beneficio Neto</span>
            </div>
            <div className={`text-3xl md:text-4xl font-black tabular-nums ${stats.profitCurrency >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.profitCurrency >= 0 ? '+' : ''}${stats.profitCurrency.toFixed(2)}
            </div>
            <div className={`text-xs mt-1 ${stats.totalProfitUnits >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
              {stats.totalProfitUnits >= 0 ? '+' : ''}{stats.totalProfitUnits.toFixed(2)} Unidades
            </div>
          </div>
          <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Activity className="w-5 h-5" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Yield / ROI</span>
            </div>
            <div className="flex items-end gap-2">
              <div className={`text-3xl md:text-4xl font-black tabular-nums ${stats.yieldVal >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {stats.yieldVal.toFixed(2)}%
              </div>
              <div className={`text-sm mb-1 ${stats.roi >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                ({stats.roi.toFixed(2)}%)
              </div>
            </div>
          </div>
          <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Trophy className="w-5 h-5" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Win Rate</span>
            </div>
            <div className="flex items-end gap-2">
              <div className="text-3xl md:text-4xl font-black text-white tabular-nums">
                {stats.wins + stats.losses > 0 ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1) : 0}%
              </div>
              <div className={`text-sm mb-1 font-bold ${stats.streak.includes('W') ? 'text-green-500' : stats.streak.includes('L') ? 'text-red-500' : 'text-muted-foreground'}`}>
                {stats.streak !== '0' ? stats.streak : '-'}
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.wins}G - {stats.losses}P - {stats.voids}N
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : !hasAccess ? (
        <div className="bg-card border border-primary/30 rounded-3xl p-12 text-center max-w-2xl mx-auto mb-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-2xl rounded-full -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">Plan {activePlan?.name} Bloqueado</h2>
            <p className="text-muted-foreground mb-8 text-lg">
              No tienes una suscripción activa para este plan. Suscríbete ahora para acceder a los mejores pronósticos y análisis detallados.
            </p>
            <Link 
              to="/pricing" 
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-xl font-bold text-lg hover:bg-primary/90 transition-all shadow-lg shadow-primary/25"
            >
              Ver Planes y Precios <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      ) : filteredPicks.length === 0 ? (
        <div className="bg-card border border-white/10 rounded-2xl p-12 text-center max-w-2xl mx-auto">
          <Trophy className="w-16 h-16 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-xl font-bold mb-2">No hay picks VIP para este periodo</h3>
          <p className="text-muted-foreground">Prueba cambiando el filtro de fechas o vuelve más tarde.</p>
        </div>
      ) : (
        <>
          {pickOfTheDay && (
            <div className="mb-16">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-2 bg-primary rounded-full"></div>
                <h2 className="text-2xl font-display font-bold">Pick VIP Destacado</h2>
              </div>
              
              <div className="bg-gradient-to-br from-card to-card/50 border border-primary/30 rounded-3xl overflow-hidden shadow-[0_0_30px_rgba(242,125,38,0.1)] relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-3xl rounded-full -mr-20 -mt-20 pointer-events-none"></div>
                
                <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8 items-center relative z-10">
                  <div className="flex-1 w-full">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        {!pickOfTheDay.is_parlay ? (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              {pickOfTheDay.country_flag && <CountryFlag code={pickOfTheDay.country_flag} />}
                              <div className="text-sm font-bold text-primary uppercase tracking-wider">{pickOfTheDay.league_name || pickOfTheDay.league}</div>
                              <div className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded flex items-center gap-1 ml-2">
                                <Clock className="w-2.5 h-2.5" /> {new Date(pickOfTheDay.match_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            <h3 className="text-2xl md:text-3xl font-bold leading-tight">{pickOfTheDay.match_name}</h3>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="text-sm font-bold text-primary uppercase tracking-wider">Apuesta Combinada</div>
                            </div>
                            <h3 className="text-2xl md:text-3xl font-bold leading-tight">Parlay ({pickOfTheDay.selections?.length || 0} Selecciones)</h3>
                          </>
                        )}
                      </div>
                      {getStatusBadge(pickOfTheDay.status)}
                    </div>
                    
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8 bg-black/20 inline-flex px-4 py-2 rounded-lg">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span>{new Date(pickOfTheDay.match_date.toString().replace(' ', 'T')).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                    </div>

                    {Boolean(pickOfTheDay.is_parlay) && pickOfTheDay.selections && pickOfTheDay.selections.length > 0 && (
                      <div className="mb-6 space-y-3">
                        {pickOfTheDay.selections.map((sel: any, idx: number) => (
                          <div key={idx} className="bg-white/5 rounded-xl p-4 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="text-[10px] font-bold text-primary uppercase tracking-wider">{sel.league_name || 'Liga'}</div>
                                <div className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" /> 
                                  {sel.match_time ? (
                                    new Date(sel.match_time.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  ) : (
                                    new Date(pickOfTheDay.match_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  )}
                                </div>
                              </div>
                              <div className="font-bold text-white">{sel.match_name}</div>
                            </div>
                            <div className="flex items-center gap-3 bg-black/30 px-3 py-2 rounded-lg">
                              <div className="text-sm font-medium text-primary">{sel.market_label || sel.pick}</div>
                              <div className="w-px h-4 bg-white/20"></div>
                              <div className="font-bold text-white">{sel.odds}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-5 border border-white/5 md:col-span-2">
                        <div className="text-sm text-muted-foreground mb-2">Pronóstico</div>
                        <div className="flex items-center gap-3">
                          {pickOfTheDay.is_parlay ? (
                            <div className="font-bold text-xl text-white">Combinada</div>
                          ) : (
                            <>
                              <span className="px-3 py-1 rounded bg-primary/20 text-sm font-bold text-primary">{pickOfTheDay.market_acronym || getPickDisplay(pickOfTheDay.pick).acronym}</span>
                              <div className="font-bold text-xl text-white">{pickOfTheDay.market_label || getPickDisplay(pickOfTheDay.pick).label}</div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-5 border border-white/5 flex flex-col justify-center items-center text-center">
                        <div className="text-sm text-muted-foreground mb-1">Cuota</div>
                        <div className="font-bold text-3xl text-primary">{pickOfTheDay.odds}</div>
                        <div className="text-xs text-muted-foreground mt-1">Stake {pickOfTheDay.stake}/10</div>
                      </div>
                    </div>

                    {pickOfTheDay.analysis && (
                      <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                        <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-primary" /> Análisis VIP
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {pickOfTheDay.analysis}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {pastPicks.length > 0 && (
            <div className="mb-16">
              <div className="flex justify-between items-end mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-1.5 bg-muted-foreground/50 rounded-full"></div>
                  <h2 className="text-xl font-display font-bold text-muted-foreground">Picks VIP Anteriores</h2>
                </div>
                <div className="text-sm text-muted-foreground">
                  Desliza para ver más <ChevronRight className="inline w-4 h-4" />
                </div>
              </div>
              
              <div className="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory hide-scrollbar">
                {pastPicks.map((pick) => (
                  <div key={pick.id} className="min-w-[300px] md:min-w-[350px] max-w-[350px] bg-card border border-white/10 rounded-2xl overflow-hidden hover:border-white/30 transition-colors snap-start flex flex-col">
                    <div className="bg-white/5 p-4 border-b border-white/10 flex justify-between items-center">
                      <div className="text-xs text-muted-foreground">
                        {new Date(pick.match_date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                      </div>
                      {getStatusBadge(pick.status)}
                    </div>
                    
                    <div className="p-5 flex-1 flex flex-col">
                      {!pick.is_parlay ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            {pick.country_flag ? <CountryFlag code={pick.country_flag} /> : <CountryFlag code="mundo" />}
                            <div className="text-[10px] font-bold text-primary uppercase tracking-wider truncate">{pick.league_name || pick.league}</div>
                          </div>
                          <h3 className="text-base font-bold mb-4 line-clamp-2 leading-tight">{pick.match_name}</h3>
                          
                          <div className="bg-background rounded-xl p-3 border border-white/5 mb-4 mt-auto">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-primary/20 text-[10px] font-bold text-primary">{pick.market_acronym || getPickDisplay(pick.pick).acronym}</span>
                              <div className="font-bold text-sm text-white truncate">{pick.market_label || getPickDisplay(pick.pick).label}</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="text-[10px] font-bold text-primary uppercase tracking-wider truncate">Apuesta Combinada</div>
                          </div>
                          <h3 className="text-base font-bold mb-4 line-clamp-2 leading-tight">Parlay ({pick.selections?.length || 0} Selecciones)</h3>
                          
                          {Boolean(pick.is_parlay) && pick.selections && (
                            <div className="mb-4 space-y-2">
                              {pick.selections.slice(0, 3).map((sel: any, idx: number) => (
                                <div key={idx} className="text-[10px] text-muted-foreground border-l border-white/10 pl-2">
                                  <span className="font-bold text-primary/70">{sel.match_name}</span> - {sel.market_label || sel.pick}
                                </div>
                              ))}
                              {pick.selections.length > 3 && (
                                <div className="text-[10px] text-muted-foreground italic pl-2">
                                  + {pick.selections.length - 3} más...
                                </div>
                              )}
                            </div>
                          )}

                          <div className="bg-background rounded-xl p-3 border border-white/5 mb-4 mt-auto">
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-sm text-white truncate">Combinada</div>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-4 h-4 text-muted-foreground" />
                          <span className="font-bold text-primary">{pick.odds}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Stake <span className="text-white font-bold">{pick.stake}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial de Picks VIP en Tabla */}
          {!isLoading && filteredPicks.length > 0 && (
            <div className="mt-16">
              <div className="flex items-center gap-3 mb-6">
                <Trophy className="w-6 h-6 text-primary" />
                <h2 className="text-2xl font-display font-bold">Historial de Picks VIP</h2>
              </div>
              <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary/20 border-b border-primary/30">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider">Fecha</th>
                        <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider">Liga</th>
                        <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider">Partido</th>
                        <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider">Pronóstico</th>
                        <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider">Cuota</th>
                        <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider">Stake</th>
                        <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider">Resultado</th>
                        <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider text-right">Beneficio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {filteredPicks.map((pick) => {
                        const stake = Number(pick.stake) || 0;
                        const odds = Number(pick.odds) || 0;
                        let unitsResult = 0;
                        if (pick.status === 'won') unitsResult = stake * (odds - 1);
                        else if (pick.status === 'lost') unitsResult = -stake;

                        return (
                          <tr key={pick.id} className="bg-white/5 hover:bg-white/10 transition-colors">
                            <td className="px-6 py-4 text-primary/80 font-mono text-xs whitespace-nowrap">
                              {new Date(pick.match_date.toString().replace(' ', 'T')).toLocaleString(undefined, {
                                year: 'numeric', month: 'short', day: 'numeric'
                              })}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {!pick.is_parlay && pick.country_flag && <CountryFlag code={pick.country_flag} />}
                                <span className="text-xs font-bold text-primary uppercase tracking-wider">
                                  {pick.is_parlay ? 'Apuesta Combinada' : (pick.league_name || pick.league)}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-bold text-white">
                              {!pick.is_parlay ? (
                                <div className="flex flex-col">
                                  <span>{pick.match_name}</span>
                                  <span className="text-[10px] text-muted-foreground font-normal flex items-center gap-1 mt-1">
                                    <Clock className="w-2.5 h-2.5" /> {new Date(pick.match_date.toString().replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              ) : (
                                `Parlay (${pick.selections?.length || 0} Selecciones)`
                              )}
                              {Boolean(pick.is_parlay) && pick.selections && (
                                <div className="mt-2 space-y-1 font-normal">
                                  {pick.selections.map((sel: any, idx: number) => (
                                    <div key={idx} className="text-[10px] text-muted-foreground border-l border-white/10 pl-2">
                                      <span className="font-bold text-primary/70">{sel.match_name}</span>
                                      <span className="ml-1 opacity-60">
                                        ({sel.match_time ? new Date(sel.match_time.toString().replace(' ', 'T')).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : new Date(pick.match_date.toString().replace(' ', 'T')).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})})
                                      </span>
                                      <span className="mx-1">-</span>
                                      {sel.market_label || sel.pick} ({sel.odds})
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {pick.is_parlay ? (
                                <div className="text-foreground/90 font-medium">Combinada</div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded bg-primary/20 text-xs font-bold text-primary">{pick.market_acronym || getPickDisplay(pick.pick).acronym}</span>
                                  <span className="text-foreground/90 font-medium">{pick.market_label || getPickDisplay(pick.pick).label}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 font-bold text-white">
                              {pick.odds}
                            </td>
                            <td className="px-6 py-4 text-white">
                              {pick.stake}/10
                            </td>
                            <td className="px-6 py-4">
                              {getStatusBadge(pick.status)}
                            </td>
                            <td className={`px-6 py-4 text-right font-bold ${
                              pick.status === 'won' ? 'text-green-500' : 
                              pick.status === 'lost' ? 'text-red-500' : 
                              'text-muted-foreground'
                            }`}>
                              {pick.status === 'won' ? '+' : ''}{pick.status === 'pending' ? '-' : `${unitsResult.toFixed(2)} U`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
