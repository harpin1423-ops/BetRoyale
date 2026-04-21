import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Representa un canal VIP disponible para el usuario después del pago.
 */
type TelegramVipLink = {
  /** Nombre visible del plan o canal. */
  name: string;
  /** Link privado de invitación generado para el usuario. */
  link: string;
  /** Fecha de vencimiento del link privado. */
  expires_at?: string | null;
};

/**
 * Representa los enlaces de Telegram devueltos por el backend.
 */
type TelegramLinks = {
  /** Link del canal gratuito, si está configurado. */
  free?: string;
  /** Canales VIP habilitados por la suscripción activa. */
  vip: TelegramVipLink[];
};

export default function PaymentReturn() {
  const [message, setMessage] = useState('Procesando pago...');
  const [isSuccess, setIsSuccess] = useState(false);
  const [telegramLinks, setTelegramLinks] = useState<TelegramLinks | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // Mercado Pago puede devolver payment_id o collection_id según el flujo.
    const paymentId = params.get("payment_id") || params.get("collection_id");
    const status = params.get("status");

    if (!paymentId) {
      setMessage("No se recibió información del pago.");
      setTimeout(() => navigate("/pricing"), 3000);
      return;
    }

    const run = async () => {
      try {
        // Llamada al backend para sincronizar
        const res = await fetch(`/api/payments/sync?payment_id=${paymentId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setIsSuccess(true);
          setMessage("¡Pago exitoso! Tu suscripción quedó activa.");

          // Si hay sesión, cargamos los canales Telegram del plan recién activado.
          if (token) {
            const linksRes = await fetch("/api/user/telegram-links", {
              headers: { Authorization: `Bearer ${token}` }
            });

            // Solo mostramos enlaces cuando el backend los devuelve correctamente.
            if (linksRes.ok) {
              const linksData = await linksRes.json();
              setTelegramLinks(linksData);
            }
          }
        } else {
          setMessage(data.message || `Estado del pago: ${status}`);
          setTimeout(() => navigate("/pricing"), 3000);
        }
      } catch (error) {
        setMessage("Error al validar el pago. Por favor contacta soporte.");
        setTimeout(() => navigate("/pricing"), 3000);
      }
    };

    run();
  }, [location.search, navigate, token]);

  // Filtramos canales VIP sin link real para no mostrar botones rotos.
  const vipLinks = telegramLinks?.vip?.filter((item) => item.link && item.link !== "#") || [];

  // Filtramos el canal gratuito cuando todavía no está configurado.
  const freeLink = telegramLinks?.free && telegramLinks.free !== "#" ? telegramLinks.free : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-white">
      <div className="w-full max-w-lg text-center p-8 bg-card rounded-2xl border border-white/10 shadow-xl">
        {isSuccess ? (
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
        ) : (
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        )}
        <h2 className="text-2xl font-bold mb-4">{isSuccess ? "Pago Confirmado" : "Verificando Pago"}</h2>
        <p className="text-muted-foreground">{message}</p>

        {isSuccess && (
          <div className="mt-8 space-y-4">
            {(vipLinks.length > 0 || freeLink) && (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 text-sm font-bold text-primary">
                  <Send className="w-4 h-4" />
                  Canales disponibles
                </div>

                {vipLinks.map((item) => (
                  <a
                    key={`${item.name}-${item.link}`}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-left font-bold text-primary transition-colors hover:bg-primary/20"
                  >
                    <span>
                      <span className="block">{item.name}</span>
                      {item.expires_at && (
                        <span className="block text-xs font-medium text-primary/70">
                          Link privado, expira en 24h
                        </span>
                      )}
                    </span>
                    <ExternalLink className="w-4 h-4 shrink-0" />
                  </a>
                ))}

                {freeLink && (
                  <a
                    href={freeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left font-bold text-white transition-colors hover:bg-white/10"
                  >
                    <span>Canal gratuito</span>
                    <ExternalLink className="w-4 h-4 shrink-0" />
                  </a>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate("/profile?payment=ok")}
              className="w-full rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Ir a mi perfil
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
