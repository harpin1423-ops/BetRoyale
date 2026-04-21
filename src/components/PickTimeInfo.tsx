import { Clock, Globe2 } from "lucide-react";
import { getBetRoyaleTimeLabels } from "../lib/time";

/**
 * Props para mostrar horario oficial BetRoyale y horario local del usuario.
 */
type PickTimeInfoProps = {
  /** Fecha del pick o de la selección de parlay. */
  value: unknown;
  /** Activa una versión más compacta para chips y tablas. */
  compact?: boolean;
  /** Indica si se debe mostrar la fecha además de la hora. */
  showDate?: boolean;
  /** Clases adicionales para ajustar el contenedor en cada pantalla. */
  className?: string;
};

/**
 * @summary Muestra hora oficial BetRoyale y, cuando aplica, hora local del usuario.
 * @param value - Fecha del pick o selección que se debe representar.
 * @param compact - Define si se usa el modo reducido.
 * @param showDate - Define si se incluye la fecha junto a la hora.
 * @param className - Clases CSS adicionales del contenedor.
 * @returns Elemento visual con horario oficial y local.
 */
export function PickTimeInfo({ value, compact = false, showDate = true, className = "" }: PickTimeInfoProps) {
  // Calculamos las etiquetas horarias centralizadas para evitar desfases.
  const labels = getBetRoyaleTimeLabels(value);

  // Construimos el texto oficial según el espacio disponible.
  const officialText = showDate
    ? `${labels.officialDate} · ${labels.officialTime} ${labels.officialZone}`
    : `${labels.officialTime} COL`;

  // Construimos el texto local según el espacio disponible.
  const localText = showDate
    ? `${labels.localDate} · ${labels.localTime} ${labels.localZone}`
    : labels.localDate !== labels.officialDate
      ? `${labels.localDate} · ${labels.localTime} ${labels.localZone}`
      : `${labels.localTime} ${labels.localZone}`;

  // Renderizamos el formato compacto para badges, tablas y selección de parlay.
  if (compact) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground ${className}`}>
        <Clock className="w-2.5 h-2.5" />
        <span>{officialText}</span>
        {labels.showLocal && (
          <>
            <span className="text-white/30">·</span>
            <Globe2 className="w-2.5 h-2.5 text-primary/80" />
            <span>{localText}</span>
          </>
        )}
      </span>
    );
  }

  // Renderizamos el formato completo para cards principales.
  return (
    <div className={`inline-flex flex-col gap-1 rounded-xl bg-black/20 px-4 py-2 text-sm text-muted-foreground ${className}`}>
      <span className="inline-flex items-center gap-2">
        <Clock className="w-4 h-4 text-primary" />
        <span>Hora BetRoyale: {officialText}</span>
      </span>
      {labels.showLocal && (
        <span className="inline-flex items-center gap-2 text-blue-200/80">
          <Globe2 className="w-4 h-4 text-blue-300" />
          <span>Tu hora local: {localText}</span>
        </span>
      )}
    </div>
  );
}
