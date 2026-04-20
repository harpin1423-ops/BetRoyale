export const countryMapping: Record<string, string> = {
  "colombia": "co",
  "españa": "es",
  "méxico": "mx",
  "argentina": "ar",
  "chile": "cl",
  "perú": "pe",
  "ecuador": "ec",
  "venezuela": "ve",
  "bolivia": "bo",
  "paraguay": "py",
  "uruguay": "uy",
  "brasil": "br",
  "estados unidos": "us",
  "italia": "it",
  "francia": "fr",
  "alemania": "de",
  "reino unido": "gb",
  "portugal": "pt",
  "japon": "jp",
  "china": "cn",
  "corea del sur": "kr",
  "canada": "ca",
  "mexico": "mx",
  "peru": "pe"
};

export const getIsoCode = (name: string): string => {
  const normalized = name.toLowerCase().trim();
  return countryMapping[normalized] || normalized;
};
