import { useState } from "react";
import { Check, Star, Shield, Zap, Target, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export function Pricing() {
  const [loading, setLoading] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<"mensual" | "trimestral" | "semestral" | "anual">("mensual");
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState<number>(0);
  const [promoError, setPromoError] = useState("");
  const [promoSuccess, setPromoSuccess] = useState("");
  const [validatingPromo, setValidatingPromo] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const periods = [
    { id: "mensual", label: "Mensual", discount: null },
    { id: "trimestral", label: "Trimestral", discount: "Ahorra 10%" },
    { id: "semestral", label: "Semestral", discount: "Ahorra 20%" },
    { id: "anual", label: "Anual", discount: "Ahorra 30%" }
  ];

  const getPrice = (basePrice: number) => {
    let price = basePrice;
    if (selectedPeriod === "trimestral") price = Math.round(basePrice * 3 * 0.9);
    else if (selectedPeriod === "semestral") price = Math.round(basePrice * 6 * 0.8);
    else if (selectedPeriod === "anual") price = Math.round(basePrice * 12 * 0.7);
    
    if (promoDiscount > 0) {
      price = Math.round(price * (1 - promoDiscount / 100));
    }
    return price;
  };

  const handleValidatePromo = async () => {
    if (!promoCode.trim()) return;
    
    if (!user) {
      navigate('/login');
      return;
    }

    setValidatingPromo(true);
    setPromoError("");
    setPromoSuccess("");

    try {
      const response = await fetch('/api/promo-codes/validate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ code: promoCode })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al validar el código");
      }

      setPromoDiscount(data.discount_percentage);
      setPromoSuccess(`¡Código aplicado! ${data.discount_percentage}% de descuento.`);
    } catch (error: any) {
      setPromoError(error.message);
      setPromoDiscount(0);
    } finally {
      setValidatingPromo(false);
    }
  };

  const plans = [
    { id: "cuota_2", name: "VIP Cuota 2+", priceUSD: 10, icon: <Zap className="w-6 h-6 text-blue-400" />, features: ["Picks diarios (Cuotas 2.0-2.9)", "Stake recomendado (1-3%)", "Análisis técnico de ligas top", "Notificaciones vía Web", "Soporte VIP 24/7"] },
    { id: "cuota_3", name: "VIP Cuota 3+", priceUSD: 15, icon: <Star className="w-6 h-6 text-primary" />, popular: true, features: ["Picks diarios (Cuotas 3.0-3.9)", "Stake recomendado (1-2%)", "Acceso a Combinadas Especiales", "Grupo Exclusivo de Telegram", "Soporte VIP 24/7"] },
    { id: "cuota_4", name: "VIP Cuota 4+", priceUSD: 20, icon: <Shield className="w-6 h-6 text-purple-400" />, features: ["Picks de Valor (Cuotas 4.0-4.9)", "Stake conservador (0.5-1%)", "Estrategia de Alto Rendimiento", "Contacto Directo 1 a 1", "Soporte VIP 24/7"] },
    { id: "cuota_5", name: "VIP Cuota 5+", priceUSD: 25, icon: <Target className="w-6 h-6 text-red-400" />, features: ["Picks Exclusivos (Cuotas 5.0+)", "Stake Mínimo (0.25-0.5%)", "Información de Ligas Exóticas", "Atención Prioritaria 24/7", "Soporte VIP 24/7"] },
    { id: "all_plans", name: "Todos los Planes", priceUSD: 56, icon: <Crown className="w-6 h-6 text-yellow-400" />, popular: true, discount: "Ahorra 20%", features: ["Acceso Total a todos los VIP", "Todas las cuotas (2.0 a 5.0+)", "Soporte VIP 24/7", "Análisis de Mercados en Vivo", "Auditoría de Bankroll Mensual"] }
  ];

  const handlePayment = async (plan: typeof plans[0]) => {
    if (!user) {
      navigate('/login');
      return;
    }

    setLoading(plan.id);
    const priceUSD = getPrice(plan.priceUSD);
    const periodLabel = periods.find(p => p.id === selectedPeriod)?.label || "Mensual";
    
    // Debug info for the user
    const mpPublicKey = (import.meta as any).env.VITE_MERCADOPAGO_PUBLIC_KEY || '';
    const isTestKey = mpPublicKey.startsWith('TEST-');
    console.log(`[PAYMENT DEBUG] Using ${isTestKey ? 'SANDBOX' : 'PRODUCTION'} Public Key`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      const response = await fetch('/api/payments/mercadopago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        signal: controller.signal,
        body: JSON.stringify({ 
          title: `<b>Plan:</b> ${plan.name}\n<b>Suscripción:</b> ${periodLabel}\n<b>Valor:</b> ${priceUSD} USD`, 
          description: `<b>Plan:</b> ${plan.name}\n<b>Suscripción:</b> ${periodLabel}\n<b>Valor:</b> ${priceUSD} USD`,
          quantity: 1, 
          unit_price: priceUSD,
          planId: plan.id,
          period: selectedPeriod,
          promoCode: promoDiscount > 0 ? promoCode : undefined,
          origin: window.location.origin
        }),
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response:", text);
        throw new Error("El servidor devolvió una respuesta inválida.");
      }
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Error al crear la preferencia de pago");
      }

      // Force direct redirect to Mercado Pago for maximum reliability
      // The SDK modal sometimes fails to redirect back properly.
      // Usamos la marca del backend porque el token privado es la fuente real del entorno.
      const shouldUseSandboxCheckout = Boolean(data.is_sandbox);
      // En sandbox usamos el link de prueba; en producción priorizamos el link real.
      const paymentUrl = shouldUseSandboxCheckout
        ? data.sandbox_init_point || data.init_point
        : data.init_point || data.sandbox_init_point;
      if (paymentUrl) {
        window.location.href = paymentUrl;
      } else if (data.id) {
        window.location.href = `https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=${data.id}`;
      }
    } catch (error: any) {
      console.error("Error:", error);
      if (error.name === 'AbortError') {
        alert("La solicitud tardó demasiado tiempo. Por favor, inténtalo de nuevo.");
      } else {
        alert("Error al procesar el pago: " + (error instanceof Error ? error.message : "Error desconocido"));
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">Elige tu Plan <span className="text-primary">VIP</span></h1>
      </div>

      {/* Period Toggle */}
      <div className="flex justify-center mb-16 px-2 mt-4">
        <div className="bg-card border border-white/10 p-3 pt-6 pb-3 sm:p-2 sm:pt-3 sm:pr-4 rounded-2xl grid grid-cols-2 sm:flex sm:flex-row gap-y-6 gap-x-3 sm:gap-1 w-full sm:w-auto max-w-md sm:max-w-none">
          {periods.map((period) => (
            <button
              key={period.id}
              onClick={() => setSelectedPeriod(period.id as any)}
              className={`relative px-2 sm:px-6 py-3 rounded-xl text-sm font-bold transition-all w-full sm:w-auto ${
                selectedPeriod === period.id 
                  ? 'bg-primary text-primary-foreground shadow-lg' 
                  : 'text-muted-foreground hover:text-white hover:bg-white/5'
              }`}
            >
              {period.label}
              {period.discount && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-2 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                  selectedPeriod === period.id ? 'bg-white text-primary' : 'bg-primary/20 text-primary'
                }`}>
                  {period.discount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Promo Code Input */}
      <div className="flex justify-center mb-12 px-4">
        <div className="flex flex-col items-center w-full max-w-md">
          <div className="flex w-full gap-2">
            <input
              type="text"
              placeholder="¿Tienes un código de descuento?"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              disabled={promoDiscount > 0 || validatingPromo}
              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
            />
            {promoDiscount > 0 ? (
              <button
                onClick={() => {
                  setPromoCode("");
                  setPromoDiscount(0);
                  setPromoSuccess("");
                }}
                className="px-4 py-3 rounded-xl bg-destructive/20 text-destructive font-bold text-sm hover:bg-destructive/30 transition-colors"
              >
                Quitar
              </button>
            ) : (
              <button
                onClick={handleValidatePromo}
                disabled={!promoCode.trim() || validatingPromo}
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {validatingPromo ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : "Aplicar"}
              </button>
            )}
          </div>
          {promoError && <p className="text-destructive text-xs mt-2 font-medium">{promoError}</p>}
          {promoSuccess && <p className="text-emerald-400 text-xs mt-2 font-medium">{promoSuccess}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan, index) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * (index + 1) }}
            className={`relative flex flex-col bg-card border rounded-3xl p-8 ${plan.popular ? 'border-primary shadow-[0_0_30px_rgba(242,125,38,0.15)]' : 'border-white/10'}`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider py-1 px-4 rounded-full">
                {plan.discount || "Más Popular"}
              </div>
            )}
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-white/5">{plan.icon}</div>
              <h3 className="text-xl font-bold">{plan.name}</h3>
            </div>
            <div className="text-4xl font-bold mb-6">{getPrice(plan.priceUSD)} USD</div>
            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  <span className="text-gray-300 leading-tight">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handlePayment(plan)}
              disabled={loading === plan.id}
              className="w-full py-3.5 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
            >
              {loading === plan.id ? "Procesando..." : "Suscribirse"}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
