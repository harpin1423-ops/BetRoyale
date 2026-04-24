import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import html2canvas from "html2canvas";

// Tipamos cada selección interna de un parlay para generar tickets sociales claros.
interface PickSelection {
  // Nombre del evento o partido.
  match_name: string;
  // Mercado o pick guardado en base de datos.
  pick: string;
  // Etiqueta legible del mercado.
  market_label?: string;
  // Acrónimo legible del mercado.
  market_acronym?: string;
  // Cuota individual de la selección.
  odds: number | string;
  // Nombre de la liga cuando el backend ya la resolvió.
  league_name?: string;
  // Nombre legacy de liga.
  league?: string;
  // Nombre del país cuando el backend ya lo resolvió.
  country_name?: string;
  // Bandera o código ISO del país.
  country_flag?: string;
  // Fecha y hora propia de la selección.
  match_time: string;
  // Goles locales si el pick ya fue resuelto.
  score_home?: number | null;
  // Goles visitantes si el pick ya fue resuelto.
  score_away?: number | null;
}

// Tipamos el pick completo recibido desde el panel de administración.
interface PickData {
  // ID del pick para nombre de archivo.
  id: number;
  // Evento principal del pick.
  match_name: string;
  // Mercado o pick guardado en base de datos.
  pick: string;
  // Etiqueta legible del mercado.
  market_label?: string;
  // Acrónimo legible del mercado.
  market_acronym?: string;
  // Cuota total o cuota del pick simple.
  odds: number | string;
  // Stake recomendado en unidades.
  stake: number | string;
  // Liga legacy del pick simple.
  league?: string;
  // Liga resuelta del pick simple.
  league_name?: string;
  // País resuelto del pick simple.
  country_name?: string;
  // Bandera o código ISO del país.
  country_flag?: string;
  // Fecha principal del pick.
  match_date: string;
  // Estado actual del pick.
  status: string;
  // Tipo legacy del pick.
  pick_type?: string;
  // Nombre visible del plan.
  pick_type_name?: string;
  // Slug del plan.
  pick_type_slug?: string;
  // Goles locales si el pick ya fue resuelto.
  score_home?: number | null;
  // Goles visitantes si el pick ya fue resuelto.
  score_away?: number | null;
  // Indica si la pieza es parlay.
  is_parlay?: boolean | number;
  // Selecciones internas cuando la pieza es parlay.
  selections?: PickSelection[];
}

// Definimos el tema visual para diferenciar cada canal o grupo.
interface TicketTheme {
  // Etiqueta corta mostrada en el badge.
  label: string;
  // Color principal del canal.
  accent: string;
  // Color secundario de apoyo.
  secondary: string;
  // Fondo base del canal.
  background: string;
  // Fondo del panel lateral.
  panel: string;
  // Color de brillo ambiental.
  glow: string;
  // Color de línea sutil.
  line: string;
}

// Definimos la presentación visual de cada estado.
interface StatusTheme {
  // Etiqueta visible del estado.
  label: string;
  // Color principal del estado.
  color: string;
  // Fondo del badge de estado.
  background: string;
  // Borde del badge de estado.
  border: string;
}

// Estado visual de picks para redes.
const STATUS: Record<string, StatusTheme> = {
  // Estado pendiente con dorado visible.
  pending: { label: "PENDIENTE", color: "#facc15", background: "rgba(250, 204, 21, 0.14)", border: "rgba(250, 204, 21, 0.68)" },
  // Estado ganado con verde premium.
  won: { label: "GANADO", color: "#34d399", background: "rgba(16, 185, 129, 0.16)", border: "rgba(52, 211, 153, 0.72)" },
  // Estado perdido con rojo elegante.
  lost: { label: "PERDIDO", color: "#fb7185", background: "rgba(251, 113, 133, 0.14)", border: "rgba(251, 113, 133, 0.66)" },
  // Estado nulo con gris claro.
  void: { label: "NULO", color: "#cbd5e1", background: "rgba(148, 163, 184, 0.14)", border: "rgba(203, 213, 225, 0.48)" },
  // Estado medio ganado para compatibilidad con estados permitidos.
  "half-won": { label: "MEDIO GANADO", color: "#5eead4", background: "rgba(45, 212, 191, 0.14)", border: "rgba(94, 234, 212, 0.54)" },
  // Estado medio perdido para compatibilidad con estados permitidos.
  "half-lost": { label: "MEDIO PERDIDO", color: "#fdba74", background: "rgba(251, 146, 60, 0.14)", border: "rgba(253, 186, 116, 0.54)" },
};

// Ancho fijo del ticket para redes sociales (px).
const TICKET_WIDTH = 960;

// Alto fijo 4:3 estricto (960 × 3/4 = 720 px).
const TICKET_HEIGHT = 720;

// Alto del header del ticket.
const TICKET_HEADER_HEIGHT = 105;

// Alto del footer del ticket.
const TICKET_FOOTER_HEIGHT = 40;

// Alto disponible para el cuerpo (main) del ticket.
const TICKET_MAIN_HEIGHT = TICKET_HEIGHT - TICKET_HEADER_HEIGHT - TICKET_FOOTER_HEIGHT;

// Padding vertical del contenedor de selecciones (arriba + abajo).
const SEL_PANEL_PADDING = 28;

// Gap entre tarjetas de selección (px).
const SEL_CARD_GAP = 8;

// Escala de exportación: 2× = imagen final de 1920 × 1440 px.
const TICKET_EXPORT_SCALE = 2;

/**
 * <summary>
 * Obtiene el branding visual del ticket según el plan o canal.
 * </summary>
 * @param slug - Slug interno del tipo de pick.
 * @param name - Nombre visible del tipo de pick.
 * @returns Tema visual completo para el ticket.
 */
function getTicketTheme(slug: string, name: string): TicketTheme {
  // Normalizamos slug y nombre para tolerar distintas nomenclaturas del proyecto.
  const normalized = `${slug} ${name}`.toLowerCase();

  // Tema FREE con azul/cian para distinguirlo de los canales pagos.
  if (normalized.includes("free")) {
    return {
      label: "FREE PICKS",
      accent: "#22d3ee",
      secondary: "#38bdf8",
      background: "#071827",
      panel: "#061321",
      glow: "rgba(34, 211, 238, 0.24)",
      line: "rgba(34, 211, 238, 0.30)",
    };
  }

  // Tema FULL ACCESS con blanco/dorado institucional.
  if (normalized.includes("full") || normalized.includes("todos") || normalized.includes("all_plans") || normalized.includes("acceso")) {
    return {
      label: "FULL ACCESS",
      accent: "#f8fafc",
      secondary: "#eab308",
      background: "#111827",
      panel: "#080f1d",
      glow: "rgba(234, 179, 8, 0.26)",
      line: "rgba(234, 179, 8, 0.34)",
    };
  }

  // Tema VIP 5+ con rojo premium y dorado.
  if (normalized.includes("5")) {
    return {
      label: "VIP CUOTA 5+",
      accent: "#fb7185",
      secondary: "#facc15",
      background: "#210d14",
      panel: "#160913",
      glow: "rgba(251, 113, 133, 0.26)",
      line: "rgba(251, 113, 133, 0.34)",
    };
  }

  // Tema VIP 4+ con violeta sobrio y acento dorado.
  if (normalized.includes("4")) {
    return {
      label: "VIP CUOTA 4+",
      accent: "#a78bfa",
      secondary: "#fbbf24",
      background: "#100f24",
      panel: "#0b0b1f",
      glow: "rgba(167, 139, 250, 0.28)",
      line: "rgba(167, 139, 250, 0.36)",
    };
  }

  // Tema VIP 3+ con verde/teal para un canal intermedio distinto.
  if (normalized.includes("3")) {
    return {
      label: "VIP CUOTA 3+",
      accent: "#10b981",
      secondary: "#2dd4bf",
      background: "#071b16",
      panel: "#061711",
      glow: "rgba(16, 185, 129, 0.25)",
      line: "rgba(16, 185, 129, 0.34)",
    };
  }

  // Tema VIP 2+ por defecto con dorado y verde BetRoyale.
  return {
    label: "VIP CUOTA 2+",
    accent: "#eab308",
    secondary: "#22c55e",
    background: "#07111f",
    panel: "#07101c",
    glow: "rgba(234, 179, 8, 0.28)",
    line: "rgba(234, 179, 8, 0.36)",
  };
}

/**
 * <summary>
 * Convierte un número o texto a número seguro.
 * </summary>
 * @param value - Valor recibido desde API o formulario.
 * @param fallback - Valor alternativo cuando no se puede convertir.
 * @returns Número normalizado.
 */
function parseNumber(value: number | string | undefined | null, fallback = 0): number {
  // Convertimos el valor a número real.
  const parsed = Number(value);

  // Devolvemos fallback cuando el valor no es finito.
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * <summary>
 * Normaliza una fecha guardada como UTC o datetime local Colombia.
 * </summary>
 * @param value - Fecha recibida desde el backend.
 * @returns Objeto Date listo para formatear en Colombia.
 */
function toColombiaDate(value: string): Date {
  // Normalizamos el separador para soportar MySQL y datetime-local.
  const normalized = String(value || "").trim().replace(" ", "T");

  // Detectamos si el texto ya incluye zona horaria explícita.
  const hasTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized);

  // Si ya hay zona horaria, usamos el valor tal cual.
  if (hasTimeZone) {
    return new Date(normalized);
  }

  // Agregamos segundos si el valor viene como YYYY-MM-DDTHH:mm.
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;

  // Interpretamos datetimes sin zona como hora Colombia.
  return new Date(`${withSeconds}-05:00`);
}

/**
 * <summary>
 * Formatea la fecha del ticket en español para Colombia.
 * </summary>
 * @param value - Fecha recibida desde el backend.
 * @returns Fecha corta en mayúsculas.
 */
function formatDate(value: string): string {
  // Convertimos a fecha Colombia antes de formatear.
  const date = toColombiaDate(value);

  // Formateamos fecha legible para redes.
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(date).toUpperCase();
}

/**
 * <summary>
 * Formatea la hora del ticket en Colombia.
 * </summary>
 * @param value - Fecha recibida desde el backend.
 * @returns Hora HH:mm con ciclo 24h.
 */
function formatTime(value: string): string {
  // Convertimos a fecha Colombia antes de formatear.
  const date = toColombiaDate(value);

  // Formateamos hora en 24 horas.
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Bogota",
  }).format(date);
}

/**
 * <summary>
 * Convierte código ISO de país a bandera o devuelve la bandera recibida.
 * </summary>
 * @param code - Código ISO o emoji de bandera.
 * @returns Bandera lista para mostrar.
 */
function normalizeCountryCode(code?: string): string {
  // Evitamos procesar valores vacíos.
  if (!code) return "";

  // Normalizamos el valor recibido desde base de datos.
  const normalized = code.trim().toLowerCase();

  // Mapeamos banderas emoji conocidas a ISO para evitar render raro en Windows.
  const emojiMap: Record<string, string> = {
    "🇦🇷": "ar",
    "🇧🇷": "br",
    "🇨🇴": "co",
    "🇩🇪": "de",
    "🇪🇸": "es",
    "🇫🇷": "fr",
    "🇬🇧": "gb",
    "🇮🇹": "it",
    "🇲🇽": "mx",
    "🇳🇱": "nl",
    "🇵🇹": "pt",
    "🇺🇸": "us",
  };

  // Devolvemos el ISO equivalente cuando llega emoji.
  if (emojiMap[code]) return emojiMap[code];

  // Permitimos códigos ISO puros de dos letras.
  if (/^[a-z]{2}$/i.test(normalized)) return normalized;

  // Soportamos alias comunes para Inglaterra/Reino Unido.
  if (["uk", "england", "inglaterra"].includes(normalized)) return "gb";

  // Soportamos nombres comunes usados en ligas.
  if (["espana", "españa", "spain"].includes(normalized)) return "es";

  // Devolvemos vacío si no podemos inferir una bandera confiable.
  return "";
}

/**
 * <summary>
 * Genera un fondo CSS tipo bandera sin depender de emojis del sistema operativo.
 * </summary>
 * @param code - Código ISO normalizado del país.
 * @returns Fondo CSS para pintar la bandera dentro del ticket.
 */
function getFlagBackground(code: string): string {
  // Definimos banderas frecuentes del fútbol europeo y latino.
  const flags: Record<string, string> = {
    ar: "linear-gradient(to bottom, #74acdf 0 33%, #ffffff 33% 66%, #74acdf 66% 100%)",
    br: "radial-gradient(circle at 50% 50%, #002776 0 18%, transparent 19%), linear-gradient(135deg, transparent 28%, #ffdf00 29% 48%, transparent 49%), linear-gradient(45deg, transparent 28%, #ffdf00 29% 48%, transparent 49%), #009b3a",
    co: "linear-gradient(to bottom, #fcd116 0 50%, #003893 50% 75%, #ce1126 75% 100%)",
    de: "linear-gradient(to bottom, #000000 0 33%, #dd0000 33% 66%, #ffce00 66% 100%)",
    es: "linear-gradient(to bottom, #aa151b 0 25%, #f1bf00 25% 75%, #aa151b 75% 100%)",
    fr: "linear-gradient(to right, #0055a4 0 33%, #ffffff 33% 66%, #ef4135 66% 100%)",
    gb: "linear-gradient(33deg, transparent 42%, #ffffff 42% 46%, #c8102e 46% 54%, #ffffff 54% 58%, transparent 58%), linear-gradient(147deg, transparent 42%, #ffffff 42% 46%, #c8102e 46% 54%, #ffffff 54% 58%, transparent 58%), linear-gradient(to bottom, transparent 41%, #ffffff 41% 45%, #c8102e 45% 55%, #ffffff 55% 59%, transparent 59%), linear-gradient(to right, transparent 41%, #ffffff 41% 45%, #c8102e 45% 55%, #ffffff 55% 59%, transparent 59%), #012169",
    it: "linear-gradient(to right, #009246 0 33%, #ffffff 33% 66%, #ce2b37 66% 100%)",
    mx: "linear-gradient(to right, #006847 0 33%, #ffffff 33% 66%, #ce1126 66% 100%)",
    nl: "linear-gradient(to bottom, #ae1c28 0 33%, #ffffff 33% 66%, #21468b 66% 100%)",
    pt: "linear-gradient(to right, #006600 0 42%, #ff0000 42% 100%)",
    us: "linear-gradient(to bottom, #b22234 0 8%, #ffffff 8% 16%, #b22234 16% 24%, #ffffff 24% 32%, #b22234 32% 40%, #ffffff 40% 48%, #b22234 48% 56%, #ffffff 56% 64%, #b22234 64% 72%, #ffffff 72% 80%, #b22234 80% 88%, #ffffff 88% 96%, #b22234 96% 100%)",
  };

  // Devolvemos la bandera conocida o un fondo neutro para países no mapeados.
  return flags[code] || "linear-gradient(135deg, #334155, #0f172a)";
}

/**
 * <summary>
 * Renderiza una bandera compacta compatible con html2canvas y Windows.
 * </summary>
 * @param code - Código ISO o emoji recibido desde el backend.
 * @param size - Alto visual de la bandera en pixeles.
 * @returns Bandera CSS para la fila del ticket.
 */
// Usamos la misma metodología que CountryFlag.tsx: flag-icons CDN por código ISO.
function TicketFlag({ code, size = 18 }: { code?: string; size?: number }) {
  // Normalizamos el valor recibido desde el backend.
  const raw = String(code || "").trim().toLowerCase();

  // Sin código no renderizamos nada.
  if (!raw) return null;

  // Soportamos alias comunes que el backend puede guardar.
  const aliasMap: Record<string, string> = {
    uk: "gb", england: "gb", inglaterra: "gb",
    espana: "es", españa: "es", spain: "es",
    alemania: "de", germany: "de",
    france: "fr", francia: "fr",
    italy: "it", italia: "it",
    brazil: "br", brasil: "br",
    netherlands: "nl", holanda: "nl", "países bajos": "nl",
    portugal: "pt", mexico: "mx", colombia: "co",
    usa: "us", eeuu: "us", "estados unidos": "us",
    argentina: "ar", austria: "at", belgica: "be", belgium: "be",
    scotland: "gb-sct", turkey: "tr", turquia: "tr",
    russia: "ru", rusia: "ru", greece: "gr", grecia: "gr",
    switzerland: "ch", suiza: "ch", sweden: "se", suecia: "se",
    norway: "no", noruega: "no", denmark: "dk", dinamarca: "dk",
    japan: "jp", japon: "jp", china: "cn", australia: "au",
    "south korea": "kr", corea: "kr", saudi: "sa", "saudi arabia": "sa",
  };

  // Resolvemos alias o usamos el valor directo.
  const iso = aliasMap[raw] || raw;

  // Solo aceptamos códigos ISO de 2 letras válidos para la CDN.
  if (!/^[a-z]{2}(-[a-z]{3})?$/.test(iso)) return null;

  // Renderizamos con la misma URL que usa CountryFlag.tsx en el proyecto.
  return (
    <img
      src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/${iso}.svg`}
      alt={iso.toUpperCase()}
      referrerPolicy="no-referrer"
      style={{
        width: Math.round(size * 1.36),
        height: size,
        flexShrink: 0,
        display: "inline-block",
        borderRadius: 3,
        objectFit: "cover",
        border: "1px solid rgba(255, 255, 255, 0.22)",
        verticalAlign: "middle",
      }}
    />
  );
}


/**
 * <summary>
 * Devuelve el pronóstico legible desde mercado enriquecido o valor original.
 * </summary>
 * @param pick - Pick o selección que contiene market_label y pick.
 * @returns Texto de pronóstico para redes.
 */
function getPredictionLabel(pick: PickData | PickSelection): string {
  // Priorizamos el label legible del mercado.
  return pick.market_label || pick.pick || "Pronóstico";
}

/**
 * <summary>
 * Devuelve el acrónimo del mercado si está disponible.
 * </summary>
 * @param pick - Pick o selección que contiene market_acronym.
 * @returns Acrónimo listo para mostrar o vacío.
 */
function getMarketAcronym(pick: PickData | PickSelection): string {
  // Mostramos acrónimo solo si existe.
  return pick.market_acronym ? ` (${pick.market_acronym})` : "";
}

/**
 * <summary>
 * Construye el texto de país y liga para una fila del ticket.
 * </summary>
 * @param item - Pick simple o selección de parlay.
 * @returns Texto compuesto por país y liga.
 */
function getRegionLabel(item: PickData | PickSelection): string {
  // Tomamos país si el backend lo entregó enriquecido.
  const country = item.country_name || "";

  // Tomamos liga desde el campo enriquecido o legacy.
  const league = item.league_name || item.league || "";

  // Unimos país y liga solo con datos disponibles.
  // Aseguramos que si hay país, se muestre siempre.
  return [country, league].filter(Boolean).join(" · ");
}

/**
 * <summary>
 * Calcula profit según stake y cuota cuando el pick está ganado.
 * </summary>
 * @param stake - Stake en unidades.
 * @param odds - Cuota total.
 * @param status - Estado del pick.
 * @returns Profit en unidades.
 */
function calculateProfit(stake: number | string, odds: number | string, status: string): number {
  // Convertimos stake a número seguro.
  const stakeUnits = parseNumber(stake);

  // Convertimos cuota a número seguro.
  const totalOdds = parseNumber(odds, 1);

  // Picks ganados devuelven ganancia neta.
  if (status === "won") return (stakeUnits * totalOdds) - stakeUnits;

  // Picks perdidos descuentan el stake completo.
  if (status === "lost") return -stakeUnits;

  // Picks nulos o pendientes no muestran profit operativo.
  return 0;
}

/**
 * <summary>
 * Crea una etiqueta de unidades con signo.
 * </summary>
 * @param units - Valor de unidades.
 * @returns Texto con signo y sufijo u.
 */
function formatUnits(units: number): string {
  // Usamos signo positivo explícito para reforzar resultados ganados.
  const sign = units > 0 ? "+" : "";

  // Redondeamos a dos decimales para consistencia visual.
  return `${sign}${units.toFixed(2)}u`;
}

/**
 * <summary>
 * Construye el fondo premium del ticket según el tema.
 * </summary>
 * @param theme - Tema visual del plan.
 * @returns Estilos CSS del fondo.
 */
function getTicketBackground(theme: TicketTheme): CSSProperties {
  // Usamos capas sutiles para que el ticket se sienta premium sin perder legibilidad.
  return {
    background:
      `radial-gradient(circle at 15% -5%, ${theme.glow} 0, transparent 28%), ` +
      `radial-gradient(circle at 88% 12%, rgba(34, 197, 94, 0.10) 0, transparent 25%), ` +
      `linear-gradient(135deg, ${theme.background} 0%, #060b14 50%, #030712 100%)`,
  };
}

/**
 * <summary>
 * Renderiza el logo real de BetRoyale dentro del ticket.
 * </summary>
 * @param size - Tamaño en pixeles del logo.
 * @returns Imagen de marca usada por html2canvas.
 */
function BrandLogo({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        alt="BetRoyale Club"
        src="/logo_final_80.png"
        style={{
          width: "160%",
          height: "160%",
          maxWidth: "none", // CRUCIAL: Rompe el límite global de max-width: 100% de CSS
          maxHeight: "none",
          flexShrink: 0,
          objectFit: "contain",
          imageRendering: "high-quality",
        }}
        crossOrigin="anonymous"
      />
    </div>
  );
}

/**
 * <summary>
 * Genera el ticket social 4:3 desde el modal existente del panel admin.
 * </summary>
 * @param pick - Pick o parlay que se exportará como imagen.
 */
export function PickTicket({ pick }: { pick: PickData }) {
  // Referencia al nodo exacto que se convierte en PNG.
  const ticketRef = useRef<HTMLDivElement>(null);

  // Estado de generación para bloquear doble clic.
  const [generating, setGenerating] = useState(false);

  // Stats mensuales del grupo para mostrar cuando el pick está ganado.
  const [monthlyStats, setMonthlyStats] = useState<{
    profit: number;
    yield: number;
    totalPicks: number;
    mesLabel: string;
  } | null>(null);

  // Tema diferenciado por tipo de grupo.
  const theme = useMemo(() => getTicketTheme(pick.pick_type_slug || pick.pick_type || "", pick.pick_type_name || ""), [pick.pick_type_slug, pick.pick_type, pick.pick_type_name]);

  // Estado visual del ticket.
  const status = STATUS[pick.status] || STATUS.pending;

  // Normalizamos bandera de parlay.
  const isParlay = Boolean(Number(pick.is_parlay) || pick.is_parlay === true);

  // Selecciones seguras para renderizado.
  const selections = Array.isArray(pick.selections) ? pick.selections : [];

  // Cantidad visible de selecciones.
  const selectionCount = selections.length;

  // Determinamos si el pick ya está resuelto con resultado positivo o negativo.
  const isResolved = pick.status !== "pending";
  const isWon = pick.status === "won" || pick.status === "half-won";
  const isLost = pick.status === "lost" || pick.status === "half-lost";

  // Profit calculado para el estado actual.
  const profitUnits = calculateProfit(pick.stake, pick.odds, pick.status);

  // Yield calculado sobre stake cuando aplica.
  const yieldValue = parseNumber(pick.stake) > 0 ? (profitUnits / parseNumber(pick.stake)) * 100 : 0;

  // Fecha principal del ticket.
  const primaryDate = isParlay && selections[0]?.match_time ? selections[0].match_time : pick.match_date;

  // Texto principal de tipo de ticket.
  const ticketTypeLabel = isParlay ? "PARLAY" : "PICK";

  // Texto secundario de cantidad.
  const selectionLabel = isParlay ? `${selectionCount || 0} SELECCIONES` : "PICK SIMPLE";

  // Ajustamos tamaño de tarjetas para parlays largos.
  const compactParlay = isParlay && selectionCount >= 4;

  // Cargamos las estadísticas mensuales del grupo cuando el pick está ganado o perdido.
  // Ahora pasamos la fecha exacta del partido (o del parlay) para que el backend
  // calcule las estadísticas acumuladas desde el día 1 del mes HASTA este día en particular.
  useMemo(() => {
    if (!isWon && !isLost) { setMonthlyStats(null); return; }
    const slug = pick.pick_type_slug || pick.pick_type || "";
    
    // Si no tenemos match_date, el backend usará el mes/día actual por defecto
    const dateQuery = pick.match_date ? `date=${encodeURIComponent(pick.match_date)}` : "";
    const idQuery = pick.id ? `pickId=${pick.id}` : "";
    
    // Unimos los query params
    const queryParams = [slug ? `slug=${encodeURIComponent(slug)}` : "", dateQuery, idQuery].filter(Boolean).join("&");
    
    fetch(`/api/stats/monthly-group?${queryParams}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setMonthlyStats({
            profit: data.profit,
            yield: data.yield,
            totalPicks: data.totalPicks,
            mesLabel: data.mesLabel,
          });
        }
      })
      .catch(() => setMonthlyStats(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick.id, pick.status]);

  /**
   * <summary>
   * Descarga el ticket actual como imagen PNG 4:3 de alta calidad.
   * </summary>
   */
  const download = async () => {
    // Evitamos intentar exportar si el nodo todavía no está montado.
    if (!ticketRef.current) return;

    // Activamos estado de generación.
    setGenerating(true);

    try {
      // Capturamos el ticket en escala alta para redes.
      const canvas = await html2canvas(ticketRef.current, {
        scale: TICKET_EXPORT_SCALE,
        useCORS: true,
        allowTaint: true,
        backgroundColor: theme.background,
        logging: false,
      });

      // Creamos el enlace temporal de descarga.
      const link = document.createElement("a");

      // Nombramos el archivo con datos del pick.
      link.download = `BetRoyale-${ticketTypeLabel}-${theme.label}-${pick.id}-${pick.status}.png`.replace(/\s+/g, "-");

      // Asignamos la imagen generada al enlace.
      link.href = canvas.toDataURL("image/png");

      // Ejecutamos la descarga.
      link.click();
    } catch (error) {
      // Reportamos el error para depuración sin romper el modal.
      console.error("[PickTicket] Error generando ticket:", error);
    } finally {
      // Desactivamos el estado de generación.
      setGenerating(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
      }}
    >
      <div
        ref={ticketRef}
        style={{
          ...getTicketBackground(theme),
          width: TICKET_WIDTH,
          // Altura fija 4:3 — el contenido se adapta a este espacio, nunca al revés.
          height: TICKET_HEIGHT,
          // Flex column para header → main → footer.
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          color: "#f8fafc",
          border: `1px solid ${theme.line}`,
          boxShadow: `0 30px 120px ${theme.glow}`,
        }}
      >
        {/* Listón de Estado (Ribbon) - Posicionado en la esquina superior derecha sin tapar el badge del plan */}
        {isResolved && (
          <div
            style={{
              position: "absolute",
              top: 14,
              right: -50,
              width: 220,
              height: 36,
              background: status.background.replace("0.14", "0.95").replace("0.16", "0.95"),
              borderTop: `2px solid ${status.border}`,
              borderBottom: `2px solid ${status.border}`,
              boxShadow: `0 10px 40px ${status.color}55`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: "rotate(32deg)",
              zIndex: 100,
              backdropFilter: "blur(4px)",
            }}
          >
            <span
              style={{
                color: status.color,
                fontSize: status.label.length > 8 ? 11 : 15,
                fontWeight: 950,
                letterSpacing: "0.18em",
                textShadow: "0 2px 10px rgba(0,0,0,0.5)",
              }}
            >
              {status.label}
            </span>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.075,
            backgroundImage: "linear-gradient(135deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "38%",
            height: "100%",
            background: "linear-gradient(90deg, rgba(15, 23, 42, 0.94), rgba(15, 23, 42, 0.55), transparent)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -130,
            bottom: -130,
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: theme.glow,
            filter: "blur(44px)",
            pointerEvents: "none",
          }}
        />

        <header
          style={{
            position: "relative",
            zIndex: 2,
            height: TICKET_HEADER_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 32px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <BrandLogo size={100} />
            <div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 950,
                  lineHeight: 1,
                  letterSpacing: "0.22em",
                  color: theme.accent,
                  textTransform: "uppercase",
                }}
              >
                BetRoyale Club
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.34em",
                  color: "#cbd5e1",
                  textTransform: "uppercase",
                }}
              >
                Invirtiendo con Inteligencia
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, marginTop: 4, marginRight: isResolved ? 84 : 0 }}>
            <div
              style={{
                padding: "7px 21px",
                borderRadius: 999,
                border: `1.5px solid ${theme.accent}`,
                color: theme.accent,
                background: "rgba(0, 0, 0, 0.18)",
                fontSize: 18,
                fontWeight: 950,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
              }}
            >
              {theme.label}
            </div>
            {/* Solo mostramos el badge de estado en el header si NO hay ribbon (ej: pendiente) */}
            {!isResolved && (
              <div
                style={{
                  padding: "6px 21px",
                  borderRadius: 999,
                  border: `1.5px solid ${status.border}`,
                  color: status.color,
                  background: status.background,
                  fontSize: 12,
                  fontWeight: 950,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                }}
              >
                {status.label}
              </div>
            )}
          </div>
        </header>

        <main
          style={{
            position: "relative",
            zIndex: 2,
            // Crece para llenar el espacio entre header y footer.
            flex: 1,
            display: "grid",
            gridTemplateColumns: "228px 1fr",
          }}
        >
          <aside
           style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "14px 20px 12px",
              background: `linear-gradient(180deg, ${theme.panel}, rgba(2, 6, 23, 0.82))`,
              borderRight: "1px solid rgba(255, 255, 255, 0.08)",
              overflow: "hidden",
              maxWidth: 228,
              minWidth: 228,
              width: 228,
              boxSizing: "border-box" as const,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 950,
                  letterSpacing: "0.06em",
                  lineHeight: 1,
                  color: "#f8fafc",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {ticketTypeLabel}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  fontWeight: 950,
                  letterSpacing: "0.28em",
                  color: theme.accent,
                  textTransform: "uppercase",
                }}
              >
                {selectionLabel}
              </div>
              <div
                style={{
                  marginTop: 10,
                  height: 1,
                  width: "100%",
                  background: `linear-gradient(90deg, ${theme.line}, transparent)`,
                }}
              />
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: "0.24em", color: "#64748b", textTransform: "uppercase" }}>
                  Stake
                </div>
                <div style={{ marginTop: 4, fontSize: 28, fontWeight: 950, color: "#f8fafc" }}>
                  {parseNumber(pick.stake).toFixed(parseNumber(pick.stake) % 1 === 0 ? 0 : 1)}u
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: "0.24em", color: "#64748b", textTransform: "uppercase" }}>
                  Cuota Total
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 48,
                    fontWeight: 950,
                    lineHeight: 0.95,
                    color: theme.accent,
                    textShadow: `0 0 28px ${theme.glow}`,
                  }}
                >
                  @{parseNumber(pick.odds, 1).toFixed(2)}
                </div>
              </div>
              {isResolved && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(255, 255, 255, 0.10)",
                    background: "rgba(255, 255, 255, 0.045)",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: "0.20em", color: "#64748b", textTransform: "uppercase" }}>
                    Profit
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 26,
                      fontWeight: 950,
                      color: profitUnits >= 0 ? "#34d399" : "#fb7185",
                    }}
                  >
                    {formatUnits(profitUnits)}
                  </div>
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", color: "#64748b", textTransform: "uppercase" }}>
                        Yield
                      </div>
                      <div style={{ marginTop: 2, fontSize: 15, fontWeight: 950, color: theme.secondary, whiteSpace: "nowrap" }}>
                        {yieldValue > 0 ? "+" : ""}{yieldValue.toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", color: "#64748b", textTransform: "uppercase" }}>
                        Estado
                      </div>
                      <div style={{ marginTop: 2, fontSize: 15, fontWeight: 950, color: status.color, whiteSpace: "nowrap" }}>
                        {status.label}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Bloque de stats mensuales acumuladas del grupo — cuando el pick está resuelto y hay stats */}
              {(isWon || isLost) && monthlyStats && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: `1px solid ${theme.accent}44`,
                    background: `linear-gradient(135deg, ${theme.glow}, rgba(0,0,0,0.25))`,
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.20em", color: theme.accent, textTransform: "uppercase", marginBottom: 2 }}>
                    Stats {theme.label}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>
                    {monthlyStats.mesLabel}
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.05em", color: "#64748b", textTransform: "uppercase" }}>PROFIT</div>
                      <div style={{ marginTop: 3, fontSize: 14, fontWeight: 950, color: monthlyStats.profit >= 0 ? "#34d399" : "#fb7185", whiteSpace: "nowrap" }}>
                        {monthlyStats.profit >= 0 ? "+" : ""}{monthlyStats.profit.toFixed(2)}u
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.05em", color: "#64748b", textTransform: "uppercase" }}>YIELD</div>
                      <div style={{ marginTop: 3, fontSize: 14, fontWeight: 950, color: theme.secondary, whiteSpace: "nowrap" }}>
                        {monthlyStats.yield >= 0 ? "+" : ""}{monthlyStats.yield.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.05em", color: "#64748b", textTransform: "uppercase" }}>PICKS</div>
                      <div style={{ marginTop: 3, fontSize: 14, fontWeight: 950, color: "#f8fafc", whiteSpace: "nowrap" }}>
                        {monthlyStats.totalPicks}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8" }}>Únete a BetRoyale Club</div>
              <div style={{ marginTop: 3, fontSize: 15, fontWeight: 950, color: theme.accent }}>betroyaleclub.com</div>
              <div style={{ marginTop: 2, fontSize: 9, fontStyle: "italic", lineHeight: 1.3, color: "#64748b" }}>
                Análisis, disciplina y gestión de banca.
              </div>
            </div>
          </aside>

          <section style={{ minWidth: 0, display: "flex", flexDirection: "column", padding: "10px 22px", height: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: theme.accent, boxShadow: `0 0 18px ${theme.accent}`, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 950, letterSpacing: "0.20em", color: theme.accent, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {formatDate(primaryDate)} · COL (GMT-5)
                </span>
              </div>
            </div>

            {!isParlay ? (
              <article
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  borderRadius: 24,
                  border: `1px solid ${theme.line}`,
                  borderLeft: `8px solid ${theme.accent}`,
                  background: "rgba(2, 6, 23, 0.68)",
                  padding: "32px 36px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 950, letterSpacing: "0.16em", color: theme.accent, textTransform: "uppercase" }}>
                  <TicketFlag code={pick.country_flag} size={20} />
                  <span>{getRegionLabel(pick)}</span>
                </div>
                <div style={{ marginTop: 19, fontSize: 32, lineHeight: 1.1, fontWeight: 950, color: "#f8fafc" }}>
                  {pick.match_name}
                </div>
                <div style={{ marginTop: 16, fontSize: 14, fontWeight: 800, color: "#94a3b8" }}>
                  {formatTime(pick.match_date)} COL · GMT-5
                </div>
                <div style={{ marginTop: 34, fontSize: 12, fontWeight: 950, letterSpacing: "0.24em", color: "#64748b", textTransform: "uppercase" }}>
                  Pronóstico
                </div>
                <div style={{ marginTop: 8, fontSize: 42, lineHeight: 1.05, fontWeight: 950, color: "#f8fafc" }}>
                  {getPredictionLabel(pick)}{getMarketAcronym(pick)}
                </div>
                {isResolved && pick.score_home !== null && pick.score_home !== undefined && pick.score_away !== null && pick.score_away !== undefined && (
                  <div 
                    style={{ 
                      marginTop: 26, 
                      padding: "8px 18px",
                      borderRadius: 12,
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      display: "inline-block",
                      alignSelf: "flex-start"
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 950, letterSpacing: "0.1em", color: "#94a3b8", textTransform: "uppercase", marginRight: 10 }}>Resultado Final</span>
                    <span style={{ fontSize: 24, fontWeight: 950, color: "#f8fafc" }}>{pick.score_home} - {pick.score_away}</span>
                  </div>
                )}
              </article>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: compactParlay ? 4 : 7, overflow: "hidden" }}>
                {selections.map((selection, index) => {
                  // Calculamos si hay marcador completo para mostrarlo solo en resueltos.
                  const hasScore = selection.score_home !== null && selection.score_home !== undefined && selection.score_away !== null && selection.score_away !== undefined;

                  // Construimos la región visible de la selección.
                  const regionLabel = getRegionLabel(selection);

                  return (
                    <article
                      key={`${selection.match_name}-${index}`}
                      style={{
                        position: "relative",
                        flex: 1,
                        minHeight: 0,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "stretch",
                        justifyContent: "space-between",
                        gap: 15,
                        padding: compactParlay ? "6px 15px" : "10px 18px",
                        borderRadius: 14,
                        border: `1px solid ${theme.line}`,
                        borderLeft: `6px solid ${theme.accent}`,
                        background: "rgba(2, 6, 23, 0.70)",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: compactParlay ? 11 : 12, fontWeight: 950, letterSpacing: "0.16em", color: theme.accent, textTransform: "uppercase" }}>
                          <TicketFlag code={selection.country_flag} size={compactParlay ? 15 : 17} />
                          <span>{regionLabel || "Liga"}</span>
                        </div>
                        <div style={{ marginTop: compactParlay ? 3 : 6, fontSize: compactParlay ? 18 : 21, lineHeight: 1.08, fontWeight: 950, color: "#f8fafc" }}>
                          {selection.match_name}
                        </div>
                        
                        <div style={{ marginTop: "auto", paddingTop: compactParlay ? 6 : 9, display: "grid", gridTemplateColumns: "90px 1fr", alignItems: "baseline" }}>
                          <div style={{ fontSize: compactParlay ? 9 : 10, fontWeight: 950, letterSpacing: "0.20em", color: "#64748b", textTransform: "uppercase" }}>
                            Pronóstico
                          </div>
                          <div style={{ fontSize: compactParlay ? 17 : 20, lineHeight: 1.05, fontWeight: 950, color: "#f8fafc" }}>
                            {getPredictionLabel(selection)}{getMarketAcronym(selection)}
                          </div>
                        </div>
                      </div>

                      <div style={{ width: 112, display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", textAlign: "right", flexShrink: 0 }}>
                        <div>
                          <div style={{ fontSize: 8, fontWeight: 950, letterSpacing: "0.20em", color: "#64748b", textTransform: "uppercase" }}>
                            Hora
                          </div>
                          <div style={{ marginTop: 4, fontSize: compactParlay ? 15 : 17, fontWeight: 950, color: "#e2e8f0" }}>
                            {formatTime(selection.match_time)} COL
                          </div>
                          <div style={{ marginTop: 2, fontSize: 9, fontWeight: 800, color: "#64748b" }}>
                            GMT-5
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                          <div
                            style={{
                              padding: "5px 12px",
                              borderRadius: 999,
                              border: `1.5px solid ${theme.accent}`,
                              background: "rgba(0, 0, 0, 0.20)",
                              color: theme.accent,
                              fontSize: compactParlay ? 14 : 16,
                              fontWeight: 950,
                            }}
                          >
                            @{parseNumber(selection.odds, 1).toFixed(2)}
                          </div>
                          {isResolved && hasScore && (
                            <div 
                              style={{ 
                                padding: "6px 14px", 
                                borderRadius: 10, 
                                background: "rgba(255, 255, 255, 0.12)", 
                                border: "1px solid rgba(255, 255, 255, 0.20)",
                                color: "#f8fafc", 
                                fontSize: 12, 
                                fontWeight: 950,
                                boxShadow: "0 4px 12px rgba(0,0,0,0.25)"
                              }}
                            >
                              FINAL: {selection.score_home} - {selection.score_away}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>

        <footer
          style={{
            position: "relative",
            zIndex: 2,
            height: TICKET_FOOTER_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(0, 0, 0, 0.34)",
            fontSize: 11,
            fontWeight: 950,
          }}
        >
          <span style={{ color: theme.accent }}>betroyaleclub.com</span>
          <span style={{ color: "#475569" }}>•</span>
          <span style={{ color: "#94a3b8" }}>Invirtiendo con Inteligencia</span>
          <span style={{ color: "#475569" }}>•</span>
          <span style={{ color: "#94a3b8" }}>@BetRoyaleClub</span>
        </footer>
      </div>

      <button
        disabled={generating}
        onClick={download}
        style={{
          width: TICKET_WIDTH,
          maxWidth: "100%",
          padding: "15px 0",
          borderRadius: 8,
          border: "none",
          background: generating ? "#1e293b" : `linear-gradient(90deg, ${theme.accent}, ${theme.secondary})`,
          color: "#020617",
          fontWeight: 950,
          fontSize: 15,
          letterSpacing: "0.08em",
          cursor: generating ? "not-allowed" : "pointer",
          opacity: generating ? 0.6 : 1,
        }}
        type="button"
      >
        {generating ? "Generando imagen..." : "Descargar imagen"}
      </button>
    </div>
  );
}
