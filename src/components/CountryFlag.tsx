import React from "react";

export const CountryFlag = ({ code }: { code: string | any }) => {
  const codeStr = String(code || "").trim().toLowerCase();
  
  const renderContinentIcon = () => (
    <div className="w-5 h-4 rounded-sm bg-[#1e40af] flex items-center justify-center overflow-hidden border border-white/10 shadow-sm">
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
      className="inline-block rounded-sm"
      referrerPolicy="no-referrer"
    />
  );
};
