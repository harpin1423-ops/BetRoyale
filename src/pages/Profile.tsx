import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { User, Shield, Calendar, Key, AlertCircle, CheckCircle2, Crown, TrendingUp, DollarSign, Activity, Save, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getPlanName } from '../lib/constants';

export default function Profile() {
  const { user, token, logout, loading: authLoading } = useAuth();
  const location = useLocation();
  const [profileData, setProfileData] = useState<any>(null);
  const [metricsData, setMetricsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  
  // Bankroll state
  const [bankroll, setBankroll] = useState('');
  const [isEditingBankroll, setIsEditingBankroll] = useState(false);
  const [bankrollLoading, setBankrollLoading] = useState(false);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [syncingPayment, setSyncingPayment] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return; // Wait for auth to finish loading
    if (!token) {
      setLoading(false);
      return;
    }

    // Check for payment parameters
    const params = new URLSearchParams(location.search);
    const mpStatus = params.get('status'); // Mercado Pago returns 'approved', 'pending', 'rejected'
    // Mercado Pago appends collection_id or payment_id to the return URL
    const paymentId = params.get('payment_id') || params.get('collection_id');

    const fetchData = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      try {
        const [profileRes, metricsRes] = await Promise.all([
          fetch('/api/user/profile', { 
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
          }),
          fetch('/api/user/metrics', { 
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
          })
        ]);

        clearTimeout(timeoutId);

        if (profileRes.ok) {
          const pData = await profileRes.json();
          setProfileData(pData);
          setBankroll(pData.initial_bankroll?.toString() || '0');
        }
        
        if (metricsRes.ok) {
          const mData = await metricsRes.json();
          setMetricsData(mData);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.error('Fetch data timed out');
        } else {
          console.error('Error fetching data:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, authLoading]);

  const handleUpdateBankroll = async () => {
    setBankrollLoading(true);
    try {
      const res = await fetch('/api/user/bankroll', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ initial_bankroll: Number(bankroll) })
      });
      if (res.ok) {
        setIsEditingBankroll(false);
        // Refetch metrics to update chart
        const metricsRes = await fetch('/api/user/metrics', { headers: { 'Authorization': `Bearer ${token}` } });
        if (metricsRes.ok) {
          setMetricsData(await metricsRes.json());
        }
      }
    } catch (error) {
      console.error('Error updating bankroll:', error);
    } finally {
      setBankrollLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (newPassword !== confirmPassword) {
      setPwdError('Las contraseñas nuevas no coinciden');
      return;
    }

    if (newPassword.length < 6) {
      setPwdError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }

    setPwdLoading(true);

    try {
      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        setPwdSuccess('Contraseña actualizada correctamente');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwdError(data.error || 'Error al actualizar la contraseña');
      }
    } catch (err) {
      setPwdError('Ocurrió un error. Por favor, inténtalo de nuevo.');
    } finally {
      setPwdLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 flex justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isVip = profileData?.role === 'vip' || profileData?.role === 'admin';
  const vipDate = profileData?.vip_until ? new Date(profileData.vip_until) : null;
  const isVipActive = vipDate ? vipDate > new Date() : false;
  const createdDate = profileData?.created_at ? new Date(profileData.created_at) : null;
  const rawVipSinceDate = profileData?.vip_since ? new Date(profileData.vip_since) : null;
  
  // Ensure "Activo desde" is not before "Miembro desde"
  const vipSinceDate = (rawVipSinceDate && createdDate && rawVipSinceDate < createdDate) 
    ? createdDate 
    : rawVipSinceDate;

  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatPaymentMethod = (method: string | null) => {
    if (!method) return 'Mercado Pago';
    const methods: Record<string, string> = {
      'master': 'Mastercard',
      'visa': 'Visa',
      'amex': 'American Express',
      'diners': 'Diners Club',
      'pse': 'PSE',
      'efecty': 'Efecty',
      'account_money': 'Saldo Mercado Pago'
    };
    return methods[method.toLowerCase()] || method.charAt(0).toUpperCase() + method.slice(1);
  };

  return (
    <div className="min-h-screen pt-24 md:pt-32 pb-20 px-4 md:px-8 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8"
      >
        <div>
          <h1 className="text-2xl md:text-4xl font-bold mb-2">Mi Perfil</h1>
          <p className="text-sm md:text-base text-muted-foreground">Gestiona tu cuenta y suscripción</p>
        </div>

        <AnimatePresence>
          {syncingPayment && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
            >
              <div className="bg-primary/10 border border-primary/50 backdrop-blur-md p-4 rounded-2xl flex items-center gap-4 shadow-2xl">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shrink-0 animate-pulse">
                  <Activity className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-bold">Sincronizando Pago...</h3>
                  <p className="text-xs text-muted-foreground">Estamos activando tu suscripción VIP, un momento por favor.</p>
                </div>
              </div>
            </motion.div>
          )}

          {syncError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
            >
              <div className="bg-red-500/10 border border-red-500/50 backdrop-blur-md p-4 rounded-2xl flex items-center gap-4 shadow-2xl">
                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shrink-0">
                  <X className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-bold">Error de Sincronización</h3>
                  <p className="text-red-200/80 text-sm">{syncError}</p>
                </div>
                <button 
                  onClick={() => setSyncError(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>
            </motion.div>
          )}

          {showPaymentSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
            >
              <div className="bg-green-500/10 border border-green-500/50 backdrop-blur-md p-4 rounded-2xl flex items-center gap-4 shadow-2xl">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-bold">¡Pago Exitoso!</h3>
                  <p className="text-green-200/80 text-sm">Tu suscripción VIP se está activando.</p>
                </div>
                <button 
                  onClick={() => setShowPaymentSuccess(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white/50" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <button 
          onClick={() => logout()}
          className="self-start md:self-auto px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-bold"
        >
          Cerrar Sesión
        </button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: User Info & Status */}
        <div className="lg:col-span-4 space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card border border-white/10 rounded-2xl p-6"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-primary mb-4">
                <User className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-bold mb-1 truncate w-full">{profileData?.email}</h2>
              <div className="flex items-center gap-2 mt-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground capitalize">Rol: {profileData?.role}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Miembro desde: {formatDate(createdDate)}</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`bg-card border rounded-2xl p-5 md:p-6 ${isVipActive ? 'border-primary/50 shadow-[0_0_20px_rgba(242,125,38,0.1)]' : 'border-white/10'}`}
          >
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Crown className={`w-5 h-5 ${isVipActive ? 'text-primary' : 'text-muted-foreground'}`} />
              Estado VIP
            </h3>
            
            {isVipActive ? (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  Suscripción Activa
                </div>
                
                <div className="space-y-3">
                  {profileData?.subscriptions && profileData.subscriptions.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-muted-foreground uppercase bg-white/5">
                          <tr>
                            <th className="px-4 py-3">Plan</th>
                            <th className="px-4 py-3">Periodicidad</th>
                            <th className="px-4 py-3">Costo (COP)</th>
                            <th className="px-4 py-3">Costo (USD)</th>
                            <th className="px-4 py-3">Pago</th>
                            <th className="px-4 py-3">Vence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileData.subscriptions.map((sub: any, idx: number) => (
                            <tr key={idx} className="border-b border-white/5">
                              <td className="px-4 py-3 font-medium text-white">{getPlanName(sub.plan_id)}</td>
                              <td className="px-4 py-3 text-white capitalize">{sub.periodicity || 'mensual'}</td>
                              <td className="px-4 py-3 text-primary font-bold">
                                {sub.amount ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: sub.currency || 'COP', minimumFractionDigits: 0 }).format(sub.amount) : 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-primary font-bold">
                                {sub.amount_usd 
                                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(sub.amount_usd) 
                                  : sub.amount 
                                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(sub.amount / 4000)
                                    : 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-white">{formatPaymentMethod(sub.payment_method)}</td>
                              <td className="px-4 py-3 text-white">{formatDate(new Date(sub.expires_at))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-white/5 rounded-lg p-4 space-y-3">
                      {profileData?.plan_type && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Plan Actual:</div>
                          <div className="font-bold text-white capitalize">{getPlanName(profileData.plan_type)}</div>
                        </div>
                      )}
                      
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Válido hasta:</div>
                        <div className="font-bold text-primary">
                          {formatDate(vipDate)}
                        </div>
                      </div>
                    </div>
                  )}

                  {vipSinceDate && (
                    <div className="px-4 py-2 bg-white/5 rounded-lg flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Activo desde:</span>
                      <span className="text-xs font-medium text-white">{formatDate(vipSinceDate)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-muted-foreground text-sm font-bold">
                  Sin Suscripción
                </div>
                <p className="text-sm text-muted-foreground">
                  No tienes una suscripción VIP activa en este momento.
                </p>
                <a 
                  href="/pricing"
                  className="block w-full py-2 bg-primary text-primary-foreground text-center rounded-lg font-bold hover:bg-primary/90 transition-colors"
                >
                  Ver Planes VIP
                </a>

                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-muted-foreground mb-2">¿Ya pagaste y no se activa?</p>
                  <button
                    onClick={() => {
                      const id = prompt("Ingresa el ID de pago de Mercado Pago (está en el comprobante o URL):");
                      if (id) {
                        const params = new URLSearchParams(location.search);
                        params.set('payment', 'success');
                        params.set('payment_id', id);
                        window.history.replaceState({}, '', `${location.pathname}?${params.toString()}`);
                        window.location.reload();
                      }
                    }}
                    className="text-xs text-primary hover:underline font-bold flex items-center gap-1"
                  >
                    <Activity className="w-3 h-3" />
                    Sincronizar pago manualmente
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right Column: Settings & Metrics */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Metrics Section (Only for VIPs) */}
          {isVipActive && metricsData && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card border border-white/10 rounded-2xl p-5 md:p-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h3 className="text-lg md:text-xl font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Rendimiento
                </h3>
                
                <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-lg self-start sm:self-auto">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Bank Inicial:</span>
                  {isEditingBankroll ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        value={bankroll}
                        onChange={(e) => setBankroll(e.target.value)}
                        className="w-20 bg-background border border-white/10 rounded px-2 py-1 text-sm text-white"
                      />
                      <button 
                        onClick={handleUpdateBankroll}
                        disabled={bankrollLoading}
                        className="text-primary hover:text-primary/80"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{bankroll} U</span>
                      <button 
                        onClick={() => setIsEditingBankroll(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        Editar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <DollarSign className="w-5 h-5" />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Bank Actual</span>
                  </div>
                  <div className="text-3xl md:text-4xl font-black text-white tabular-nums">{metricsData.summary.currentBankroll.toFixed(2)} U</div>
                </div>
                <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Beneficio</span>
                  </div>
                  <div className={`text-3xl md:text-4xl font-black tabular-nums ${metricsData.summary.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {metricsData.summary.totalProfit > 0 ? '+' : ''}{metricsData.summary.totalProfit.toFixed(2)} U
                  </div>
                </div>
                <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Activity className="w-5 h-5" />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Yield</span>
                  </div>
                  <div className={`text-3xl md:text-4xl font-black tabular-nums ${metricsData.summary.yield >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {metricsData.summary.yield > 0 ? '+' : ''}{metricsData.summary.yield.toFixed(1)}%
                  </div>
                </div>
                <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Acierto</span>
                  </div>
                  <div className="text-3xl md:text-4xl font-black text-white tabular-nums">
                    {metricsData.summary.hitRate.toFixed(1)}%
                  </div>
                </div>
              </div>

              {metricsData.metrics && metricsData.metrics.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metricsData.metrics} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="#888" 
                        fontSize={10}
                        tickFormatter={(val) => new Date(val).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                        minTickGap={25}
                      />
                      <YAxis 
                        stroke="#888" 
                        fontSize={10}
                        domain={['auto', 'auto']}
                        tickFormatter={(val) => `${val}U`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#141414', borderColor: '#333', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                        labelFormatter={(val) => new Date(val).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="bankroll" 
                        stroke="#F27D26" 
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#F27D26', strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: '#fff', stroke: '#F27D26', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-white/5 rounded-xl">
                  <Activity className="w-8 h-8 mb-2 opacity-50" />
                  <p>Aún no hay picks resueltos en tu periodo VIP</p>
                </div>
              )}
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card border border-white/10 rounded-2xl p-6 md:p-8"
          >
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Cambiar Contraseña
            </h3>

            {pwdError && (
              <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {pwdError}
              </div>
            )}

            {pwdSuccess && (
              <div className="mb-6 bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {pwdSuccess}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Contraseña Actual</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-background border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="••••••••"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Nueva Contraseña</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-background border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Confirmar Nueva Contraseña</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-background border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="bg-white/10 text-white font-bold py-3 px-6 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                >
                  {pwdLoading ? 'Actualizando...' : 'Actualizar Contraseña'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
