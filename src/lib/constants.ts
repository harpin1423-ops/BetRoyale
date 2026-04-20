export const NORMALIZED_PICKS = [
  { id: '1', label: 'Gana Local', acronym: '1' },
  { id: '2', label: 'Gana Visitante', acronym: '2' },
  { id: '1X', label: 'Gana/Empate Local', acronym: '1X' },
  { id: 'X2', label: 'Gana/Empate Visitante', acronym: 'X2' },
  { id: 'AEM', label: 'Ambos Marcan', acronym: 'AEM' },
  { id: '+1.5', label: 'Más de 1.5 Goles', acronym: '+1.5' },
  { id: '+2.5', label: 'Más de 2.5 Goles', acronym: '+2.5' },
  { id: 'AEM_+2.5', label: 'Ambos marcan y más de 2.5 goles', acronym: 'AEM & +2.5' },
];

export function getPickDisplay(pickId: string) {
  const pick = NORMALIZED_PICKS.find(p => p.id === pickId);
  if (pick) {
    return { label: pick.label, acronym: pick.acronym };
  }
  // Fallback for legacy free-text picks
  return { label: pickId, acronym: pickId };
}

export const getPlanName = (id: string) => {
  const plans: Record<string, string> = {
    'cuota_2': 'VIP Cuota 2+',
    'cuota_3': 'VIP Cuota 3+',
    'cuota_4': 'VIP Cuota 4+',
    'cuota_5': 'VIP Cuota 5+',
    'all_plans': 'VIP Full Access (Todos los Planes)'
  };
  return plans[id] || id;
};
