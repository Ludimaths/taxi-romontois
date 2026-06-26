export const C = {
  navy: "#0D3B7A",
  navyL: "#1565C0",
  sky: "#42A5F5",
  skyL: "#E3F2FD",
  blue: "#3B82F6",
  blueL: "#DBEAFE",
  green: "#16A34A",
  greenL: "#DCFCE7",
  greenD: "#15803D",
  red: "#DC2626",
  redL: "#FEE2E2",
  amber: "#D97706",
  amberL: "#FEF3C7",
  purple: "#7C3AED",
  purpleL: "#EDE9FE",
  gray: "#64748B",
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray400: "#94A3B8",
  gray600: "#475569",
  gray800: "#1E293B",
  white: "#FFFFFF",
} as const;

export const CERCLES_SCOLAIRES = [
  "Mérine", "AISMLE", "CESL", "Siviriez", "Cugy-ASISE", "Saint Prex-ASISE",
  "Verdeil-Yverdon", "Verdeil-Payerne", "Perceval", "Carré d'As", "Lucens",
  "Espérance", "TEM", "Clos Fleury", "Cheiry-Surpierre", "Romont",
] as const;

export const CIRCUITS_DATA = [
  { id: "C001", name: "Hélico",      emoji: "🚁", num: "06", cercle: "Mérine",          enfants: 6,  km: 20 },
  { id: "C002", name: "Paresseux",   emoji: "🦥", num: "06", cercle: "Verdeil-Yverdon", enfants: 7,  km: 33 },
  { id: "C003", name: "Éléphant",    emoji: "🐘", num: "03", cercle: "AISMLE",          enfants: 7,  km: 31 },
  { id: "C004", name: "Libellule",   emoji: "🦗", num: "03", cercle: "CESL",            enfants: 5,  km: 17 },
  { id: "C005", name: "Varan Vert",  emoji: "🦎", num: "02", cercle: "Cugy-ASISE",      enfants: 5,  km: 19 },
  { id: "C006", name: "Fourmi",      emoji: "🐜", num: "02", cercle: "CESL",            enfants: 5,  km: 15 },
  { id: "C007", name: "Chat",        emoji: "🐱", num: "03", cercle: "Saint Prex-ASISE",enfants: 9,  km: 24 },
  { id: "C008", name: "Tortue Verte",emoji: "🐢", num: "03", cercle: "Siviriez",        enfants: 6,  km: 18 },
  { id: "C009", name: "Ours",        emoji: "🐻", num: "02", cercle: "Mérine",          enfants: 8,  km: 22 },
  { id: "C010", name: "Zèbre",       emoji: "🦓", num: "03", cercle: "Lucens",          enfants: 7,  km: 26 },
  { id: "C011", name: "Cheval",      emoji: "🐴", num: "01", cercle: "Verdeil-Payerne", enfants: 6,  km: 28 },
  { id: "C012", name: "Lémurien",    emoji: "🐒", num: "08", cercle: "Verdeil-Yverdon", enfants: 4,  km: 35 },
  { id: "C013", name: "Raisin",      emoji: "🍇", num: "01", cercle: "Espérance",       enfants: 5,  km: 21 },
  { id: "C014", name: "Panthère",    emoji: "🐆", num: "06", cercle: "Mérine",          enfants: 7,  km: 22 },
  { id: "C015", name: "Rhinocéros",  emoji: "🦏", num: "02", cercle: "Saint Prex-ASISE",enfants: 6,  km: 24 },
  { id: "C016", name: "Baleine",     emoji: "🐋", num: "02", cercle: "Saint Prex-ASISE",enfants: 5,  km: 22 },
  { id: "C017", name: "Lapin Rose",  emoji: "🐰", num: "02", cercle: "Siviriez",        enfants: 6,  km: 16 },
  { id: "C018", name: "Soleil",      emoji: "☀️", num: "05", cercle: "Verdeil-Payerne", enfants: 8,  km: 30 },
  { id: "C019", name: "Poussin",     emoji: "🐥", num: "03", cercle: "Mérine",          enfants: 5,  km: 20 },
  { id: "C020", name: "Banane",      emoji: "🍌", num: "02", cercle: "Espérance",       enfants: 6,  km: 23 },
  { id: "C021", name: "Hérisson",    emoji: "🦔", num: "02", cercle: "CESL",            enfants: 4,  km: 14 },
  { id: "C022", name: "Perroquet",   emoji: "🦜", num: "09", cercle: "Verdeil-Payerne", enfants: 7,  km: 32 },
  { id: "C023", name: "Hippopotame", emoji: "🦛", num: "05", cercle: "Cugy-ASISE",      enfants: 6,  km: 27 },
  { id: "C024", name: "Ours Brun",   emoji: "🐻", num: "01", cercle: "Siviriez",        enfants: 5,  km: 18 },
  { id: "C025", name: "Panda",       emoji: "🐼", num: "04", cercle: "CESL",            enfants: 7,  km: 16 },
  { id: "C026", name: "Lion",        emoji: "🦁", num: "04", cercle: "Mérine",          enfants: 8,  km: 20 },
  { id: "C027", name: "Hérisson 03", emoji: "🦔", num: "03", cercle: "Verdeil-Yverdon", enfants: 5,  km: 29 },
  { id: "C028", name: "Arc en ciel", emoji: "🌈", num: "05", cercle: "Verdeil-Yverdon", enfants: 7,  km: 31 },
  { id: "C029", name: "Tigre",       emoji: "🐯", num: "02", cercle: "AISMLE",          enfants: 6,  km: 28 },
  { id: "C030", name: "Biche",       emoji: "🦌", num: "01", cercle: "Perceval",        enfants: 5,  km: 22 },
  { id: "C031", name: "Cheval 08",   emoji: "🐴", num: "08", cercle: "Verdeil-Yverdon", enfants: 6,  km: 33 },
  { id: "C032", name: "Vache",       emoji: "🐄", num: "03", cercle: "TEM",             enfants: 7,  km: 19 },
  { id: "C033", name: "Pic Vert",    emoji: "🐦", num: "06", cercle: "Perceval",        enfants: 5,  km: 25 },
  { id: "C034", name: "Licorne",     emoji: "🦄", num: "05", cercle: "CESL",            enfants: 8,  km: 17 },
  { id: "C035", name: "Colibri",     emoji: "🐦", num: "02", cercle: "Verdeil-Yverdon", enfants: 4,  km: 28 },
  { id: "C036", name: "Lézard",      emoji: "🦎", num: "12", cercle: "Verdeil-Yverdon", enfants: 8,  km: 28 },
  { id: "C037", name: "Coccinelle",  emoji: "🐞", num: "01", cercle: "Mérine",          enfants: 6,  km: 21 },
  { id: "C038", name: "Hibou",       emoji: "🦉", num: "04", cercle: "Perceval",        enfants: 5,  km: 24 },
  { id: "C039", name: "Suricate",    emoji: "🦡", num: "11", cercle: "Carré d'As",      enfants: 7,  km: 26 },
  { id: "C040", name: "Crocodile",   emoji: "🐊", num: "03", cercle: "Carré d'As",      enfants: 6,  km: 22 },
  { id: "C041", name: "Kangourou",   emoji: "🦘", num: "04", cercle: "Carré d'As",      enfants: 5,  km: 23 },
  { id: "C042", name: "Tigre 09",    emoji: "🐯", num: "09", cercle: "Carré d'As",      enfants: 6,  km: 25 },
  { id: "C043", name: "Chat 12",     emoji: "🐱", num: "12", cercle: "Carré d'As",      enfants: 7,  km: 24 },
  { id: "C044", name: "Tortue",      emoji: "🐢", num: "03", cercle: "Mérine",          enfants: 5,  km: 19 },
  { id: "C045", name: "Lapin",       emoji: "🐰", num: "05", cercle: "Mérine",          enfants: 6,  km: 21 },
  { id: "C046", name: "Étoile",      emoji: "⭐", num: "02", cercle: "Verdeil-Payerne", enfants: 5,  km: 31 },
  { id: "C047", name: "Lune",        emoji: "🌙", num: "08", cercle: "Verdeil-Payerne", enfants: 6,  km: 33 },
  { id: "C048", name: "Impala",      emoji: "🦌", num: "07", cercle: "Carré d'As",      enfants: 5,  km: 24 },
  { id: "C049", name: "Tortue 01",   emoji: "🐢", num: "01", cercle: "TEM",             enfants: 7,  km: 20 },
  { id: "C050", name: "Panda Roux",  emoji: "🦊", num: "04", cercle: "Cugy-ASISE",      enfants: 5,  km: 22 },
  { id: "C051", name: "Abeille",     emoji: "🐝", num: "01", cercle: "Saint Prex-ASISE",enfants: 6,  km: 21 },
  { id: "C052", name: "Ours 05",     emoji: "🐻", num: "05", cercle: "Perceval",        enfants: 5,  km: 23 },
  { id: "C053", name: "Bus A",       emoji: "🚌", num: "01", cercle: "Cheiry-Surpierre",enfants: 8,  km: 25 },
  { id: "C054", name: "Bus B",       emoji: "🚌", num: "02", cercle: "Cheiry-Surpierre",enfants: 7,  km: 25 },
] as const;

export const VEHICLES_DATA = [
  { id: "FR-13",      plaque: "FR 13",      marque: "Mercedes",   modele: "Vito",        places: 9,  handi: 0,  km: 87432  },
  { id: "FR-80058",   plaque: "FR 80058",   marque: "Seat",       modele: "Alhambra",    places: 7,  handi: 0,  km: 62100  },
  { id: "FR-76343",   plaque: "FR 76343",   marque: "Volkswagen", modele: "Transporter", places: 9,  handi: 0,  km: 54100  },
  { id: "FR-150291",  plaque: "FR 150291",  marque: "Mercedes",   modele: "Sprinter",    places: 14, handi: 0,  km: 102300 },
  { id: "FR-150292",  plaque: "FR 150292",  marque: "Fiat",       modele: "Ducato",      places: 7,  handi: 2,  km: 78500  },
  { id: "FR-150295",  plaque: "FR 150295",  marque: "Mercedes",   modele: "Sprinter",    places: 12, handi: 0,  km: 91200  },
  { id: "FR-150296",  plaque: "FR 150296",  marque: "Beulas",     modele: "Mythos",      places: 49, handi: 13, km: 145200 },
  { id: "FR-150299",  plaque: "FR 150299",  marque: "Mercedes",   modele: "Sprinter",    places: 35, handi: 0,  km: 118000 },
  { id: "FR-150374",  plaque: "FR 150374",  marque: "Mercedes",   modele: "Vito",        places: 9,  handi: 0,  km: 78900  },
  { id: "FR-151220",  plaque: "FR 151220",  marque: "Volkswagen", modele: "Crafter",     places: 17, handi: 0,  km: 91000  },
  { id: "FR-151322",  plaque: "FR 151322",  marque: "Seat",       modele: "Alhambra",    places: 7,  handi: 0,  km: 138000 },
  { id: "FR-151323",  plaque: "FR 151323",  marque: "Mercedes",   modele: "Sprinter",    places: 24, handi: 0,  km: 67400  },
  { id: "FR-151324",  plaque: "FR 151324",  marque: "Mercedes",   modele: "Sprinter",    places: 24, handi: 0,  km: 72100  },
  { id: "FR-378163",  plaque: "FR 378163",  marque: "Citroën",    modele: "Jumpy",       places: 8,  handi: 0,  km: 115000 },
  { id: "FR-386060",  plaque: "FR 386060",  marque: "Fiat",       modele: "Handicap",    places: 3,  handi: 3,  km: 88000  },
  { id: "FR-394931",  plaque: "FR 394931",  marque: "Opel",       modele: "Movano",      places: 3,  handi: 2,  km: 95000  },
  { id: "FR-401713",  plaque: "FR 401713",  marque: "Volkswagen", modele: "Crafter",     places: 7,  handi: 2,  km: 44000  },
  { id: "VD-453460",  plaque: "VD 453460",  marque: "Mercedes",   modele: "Sprinter",    places: 9,  handi: 4,  km: 68000  },
  { id: "VD-453482",  plaque: "VD 453482",  marque: "Mercedes",   modele: "Sprinter",    places: 9,  handi: 4,  km: 71000  },
  { id: "VD-466679",  plaque: "VD 466679",  marque: "Mercedes",   modele: "Vito",        places: 9,  handi: 0,  km: 59000  },
  { id: "VD-577285",  plaque: "VD 577285",  marque: "Volkswagen", modele: "Crafter",     places: 9,  handi: 4,  km: 52000  },
  { id: "VD-578241",  plaque: "VD 578241",  marque: "Volkswagen", modele: "Crafter",     places: 9,  handi: 4,  km: 48000  },
  { id: "VD-601758",  plaque: "VD 601758",  marque: "Volkswagen", modele: "Transporter", places: 9,  handi: 0,  km: 38000  },
  { id: "VD-633137",  plaque: "VD 633137",  marque: "Mercedes",   modele: "Vito",        places: 8,  handi: 0,  km: 31000  },
] as const;

export const statusColor = (s: string): string =>
  ({ en_service: "green", termine: "gray", en_attente: "amber", absent: "red", disponible: "blue" }[s] ?? "gray");

export const statusLabel = (s: string): string =>
  ({ en_service: "En service", termine: "Terminé", en_attente: "En attente", absent: "Absent", disponible: "Disponible" }[s] ?? s);

export const nowStr = () =>
  new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const todayStr = () =>
  new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export const SEUIL_REPARATION_CHF = 1000;

// Format date standard : 2026/06/23
export const fmtDate = (d?: string | null): string => {
  if (!d) return "—";
  const p = d.slice(0, 10).split("-");
  if (p.length !== 3) return d.slice(0, 10);
  return `${p[2]}/${p[1]}/${p[0]}`;
};

// Format date+heure : 23/06/2026 à 14h30
export const fmtDateTime = (d?: string | null): string => {
  if (!d) return "—";
  const dt = new Date(d);
  const day   = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year  = dt.getFullYear();
  const h     = String(dt.getHours()).padStart(2, "0");
  const m     = String(dt.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} à ${h}h${m}`;
};

// Date ISO du jour : "2026-06-24"
export const isoToday = (): string => new Date().toISOString().slice(0, 10);

// Heure HH:MM depuis une date ISO timestamp
export const fmtTime = (d: string): string =>
  new Date(d).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });

// Heure HH:MM depuis un timestamp ISO ou une chaîne "HH:MM:SS"
export const fmtHHMM = (d?: string | null): string => {
  if (!d) return "—";
  const t = d.includes("T") ? new Date(d) : new Date(`1970-01-01T${d}`);
  return t.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
};

// Heure courante pour insertion DB : "14:30:00"
export const nowTimeStr = (): string => new Date().toTimeString().slice(0, 8);

// Affichage anonymisé enfant : "Martin A."
export const fmtEnfant = (prenom?: string | null, nom?: string | null): string => {
  const n = nom?.trim() ?? "";
  const p = prenom?.trim() ?? "";
  if (!n && !p) return "—";
  if (!p) return n;
  return `${n} ${p[0].toUpperCase()}.`;
};

// Email conducteur depuis prenom + nom
export const conducteurEmail = (prenom: string, nom: string): string => {
  const clean = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, ".");
  return `${clean(prenom)}.${clean(nom)}@taxi-romontois.ch`;
};
