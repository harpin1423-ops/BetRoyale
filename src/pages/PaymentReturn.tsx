import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2, Clock, ExternalLink, RefreshCw, Send } from 'lucide-react';
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
  /** Estado del link privado según backend y webhook de Telegram. */
  status?: "available" | "used" | "expired";
  /** Fecha en que Telegram confirmó el ingreso al canal. */
  used_at?: string | null;
  /** Username de Telegram reportado al ingresar. */
  telegram_username?: string | null;
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
  const [isRefreshingTelegramLinks, setIsRefreshingTelegramLinks] = useState(false);
  const [telegramLinksMessage, setTelegramLinksMessage] = useState<string | null>(null);
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

  /**
   * Regenera links VIP no usados cuando el usuario no alcanzó a entrar a Telegram.
   */
  const refreshTelegramLinks = async () => {
    // Sin sesión no se pueden emitir links privados de planes pagos.
    if (!token) return;

    // Activamos el estado visual de carga del botón.
    setIsRefreshingTelegramLinks(true);

    // Limpiamos mensajes anteriores antes de pedir nuevos links.
    setTelegramLinksMessage(null);

    try {
      // Pedimos al backend revocar links vigentes no usados y emitir otros nuevos.
      const linksRes = await fetch("/api/user/telegram-links?refresh=1", {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Si el backend falla, mostramos un mensaje controlado.
      if (!linksRes.ok) {
        throw new Error("No se pudieron regenerar los enlaces.");
      }

      // Parseamos la respuesta con estado available/used.
      const linksData = await linksRes.json();

      // Actualizamos los botones visibles tras el pago.
      setTelegramLinks(linksData);

      // Confirmamos la actualización al usuario.
      setTelegramLinksMessage("Enlaces actualizados. Usa el nuevo link si todavía no ingresaste.");
    } catch (error) {
      // Informamos el error sin bloquear el resto del flujo de pago.
      setTelegramLinksMessage("No pudimos generar un nuevo enlace ahora. Intenta desde tu zona VIP.");
    } finally {
      // Apagamos el estado de carga.
      setIsRefreshingTelegramLinks(false);
    }
  };

  /**
   * Construye el texto de estado para cada link VIP de Telegram.
   *
   * @param item - Link VIP que se va a renderizar en pantalla.
   * @returns Texto corto para explicar si el link está disponible o ya fue usado.
   */
  const getTelegramStatusText = (item: TelegramVipLink) => {
    // Si Telegram confirmó el ingreso, avisamos que el canal ya está activo.
    if (item.status === "used") {
      return item.telegram_username
        ? `Ya ingresaste como @${item.telegram_username}`
        : "Ya ingresaste a este canal";
    }

    // Si no hay link activo, pedimos regenerarlo desde el botón.
    if (!item.link || item.link === "#" || item.status === "expired") {
      return "Enlace vencido; genera uno nuevo";
    }

    // Si el link está disponible, recordamos que es privado y de un solo ingreso.
    return "Link privado de 1 ingreso, expira en 7 días";
  };

  // Filtramos canales VIP sin link real para no mostrar botones rotos.
  const vipLinks = telegramLinks?.vip || [];

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

                {vipLinks.map((item) => {
                  // Determinamos si el link todavía permite ingresar a Telegram.
                  const linkDisponible = item.status !== "used" && item.link && item.link !== "#";

                  // Identificamos si el estado cerrado corresponde a ingreso confirmado.
                  const ingresoConfirmado = item.status === "used";

                  // Si el usuario ya ingresó, mostramos estado activo sin abrir un link viejo.
                  if (!linkDisponible) {
                    return (
                      <div
                        key={`${item.name}-${item.status || "sin-link"}`}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left font-bold ${
                          ingresoConfirmado
                            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                            : "border-amber-400/30 bg-amber-500/10 text-amber-100"
                        }`}
                      >
                        <span>
                          <span className="block">{item.name}</span>
                          <span className="block text-xs font-medium opacity-70">
                            {getTelegramStatusText(item)}
                          </span>
                        </span>
                        {ingresoConfirmado ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 shrink-0" />
                        )}
                      </div>
                    );
                  }

                  // Si el link está disponible, lo abrimos en Telegram.
                  return (
                    <a
                      key={`${item.name}-${item.link}`}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-left font-bold text-primary transition-colors hover:bg-primary/20"
                    >
                      <span>
                        <span className="block">{item.name}</span>
                        <span className="block text-xs font-medium text-primary/70">
                          {getTelegramStatusText(item)}
                        </span>
                      </span>
                      <ExternalLink className="w-4 h-4 shrink-0" />
                    </a>
                  );
                })}

                {telegramLinksMessage && (
                  <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                    {telegramLinksMessage}
                  </div>
                )}

                {vipLinks.length > 0 && (
                  <button
                    type="button"
                    onClick={refreshTelegramLinks}
                    disabled={isRefreshingTelegramLinks}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshingTelegramLinks ? "animate-spin" : ""}`} />
                    Generar nuevo enlace VIP
                  </button>
                )}

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
