import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLocalizedStatus(status: string): string {
  // Get browser language, default to 'es'
  const userLang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.split('-')[0] : 'es';
  
  const translations: Record<string, Record<string, string>> = {
    es: {
      pending: 'Pendiente',
      won: 'Ganado',
      lost: 'Perdido',
      void: 'Nulo',
      half_won: 'Medio Ganado',
      half_lost: 'Medio Perdido'
    },
    en: {
      pending: 'Pending',
      won: 'Won',
      lost: 'Lost',
      void: 'Void',
      half_won: 'Half Won',
      half_lost: 'Half Lost'
    },
    pt: {
      pending: 'Pendente',
      won: 'Ganho',
      lost: 'Perdido',
      void: 'Nulo',
      half_won: 'Meio Ganho',
      half_lost: 'Meio Perdido'
    }
  };

  const langMap = translations[userLang] || translations['es'];
  return langMap[status.toLowerCase()] || status.toUpperCase();
}
