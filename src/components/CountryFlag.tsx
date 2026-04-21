import React from "react";

/**
 * Props compatibles con los usos históricos del componente de bandera.
 */
type CountryFlagProps = {
  /** Código ISO principal del país. */
  code?: string | any;
  /** Alias heredado usado por algunos selects del panel admin. */
  countryCode?: string | any;
  /** Clases visuales opcionales para ajustar tamaño en contextos concretos. */
  className?: string;
};

export const CountryFlag = ({ code, countryCode, className = "" }: CountryFlagProps) => {
  // Permitimos code y countryCode para mantener compatibilidad con pantallas existentes.
  const codeStr = String(code || countryCode || "").trim().toLowerCase();
  
  const renderContinentIcon = () => (
    <div className={`w-5 h-4 rounded-sm bg-[#1e40af] flex items-center justify-center overflow-hidden border border-white/10 shadow-sm ${className}`}>
      <svg 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="#fbbf24" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="w-3.5 h-3.5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    </div>
  );

  if (["mundo", "eu", "europa", "america", "americano", "asia", "oceania"].includes(codeStr)) {
    return renderContinentIcon();
  }

  if (!codeStr || codeStr.length !== 2) return null;
  
  return (
    <img 
      src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/${codeStr}.svg`} 
      width="20"
      alt={codeStr}
      className={`inline-block rounded-sm ${className}`}
      referrerPolicy="no-referrer"
    />
  );
};
