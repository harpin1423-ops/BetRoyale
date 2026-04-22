/**
 * @file schema.ts
 * @description Inicialización del esquema de base de datos.
 * Crea todas las tablas si no existen (CREATE TABLE IF NOT EXISTS),
 * ejecuta migraciones de columnas faltantes y siembra datos iniciales.
 * Se ejecuta una vez al arrancar el servidor.
 */

import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";

// ─── Mapeo de países a códigos ISO para banderas ─────────────────────────────
// Usado para poblar la columna 'flag' en la tabla countries
const PAISES_ISO: Record<string, string> = {
  "afganistán": "af", "afghanistan": "af", "albania": "al", "alemania": "de",
  "germany": "de", "andorra": "ad", "angola": "ao", "argentina": "ar",
  "armenia": "am", "australia": "au", "austria": "at", "azerbaiyán": "az",
  "bélgica": "be", "belgium": "be", "bolivia": "bo", "bosnia y herzegovina": "ba",
  "brasil": "br", "brazil": "br", "bulgaria": "bg", "canadá": "ca", "canada": "ca",
  "chile": "cl", "china": "cn", "colombia": "co", "corea del norte": "kp",
  "corea del sur": "kr", "south korea": "kr", "costa rica": "cr", "croacia": "hr",
  "cuba": "cu", "dinamarca": "dk", "denmark": "dk", "ecuador": "ec",
  "egipto": "eg", "el salvador": "sv", "emiratos árabes unidos": "ae",
  "eslovaquia": "sk", "eslovenia": "si", "españa": "es", "spain": "es",
  "estados unidos": "us", "united states": "us", "estonia": "ee", "etiopía": "et",
  "filipinas": "ph", "finlandia": "fi", "finland": "fi", "francia": "fr",
  "france": "fr", "georgia": "ge", "grecia": "gr", "greece": "gr",
  "guatemala": "gt", "guinea": "gn", "haití": "ht", "honduras": "hn",
  "hong kong": "hk", "hungría": "hu", "hungary": "hu", "india": "in",
  "indonesia": "id", "irán": "ir", "iraq": "iq", "irlanda": "ie",
  "islandia": "is", "israel": "il", "italia": "it", "italy": "it",
  "jamaica": "jm", "japón": "jp", "japan": "jp", "jordania": "jo",
  "kazajistán": "kz", "kenia": "ke", "kuwait": "kw", "líbano": "lb",
  "liberia": "lr", "libia": "ly", "lituania": "lt", "luxemburgo": "lu",
  "macedonia": "mk", "malasia": "my", "malta": "mt", "marruecos": "ma",
  "méxico": "mx", "mexico": "mx", "moldavia": "md", "mónaco": "mc",
  "mongolia": "mn", "mozambique": "mz", "myanmar": "mm", "nepal": "np",
  "nicaragua": "ni", "nigeria": "ng", "noruega": "no", "norway": "no",
  "nueva zelanda": "nz", "new zealand": "nz", "países bajos": "nl",
  "netherlands": "nl", "holanda": "nl", "pakistán": "pk", "panamá": "pa",
  "paraguay": "py", "perú": "pe", "peru": "pe", "polonia": "pl",
  "poland": "pl", "portugal": "pt", "puerto rico": "pr", "qatar": "qa",
  "reino unido": "gb", "united kingdom": "gb", "inglaterra": "gb",
  "england": "gb", "escocia": "gb", "scotland": "gb", "república checa": "cz",
  "czech republic": "cz", "república dominicana": "do", "rumania": "ro",
  "rusia": "ru", "russia": "ru", "arabia saudita": "sa", "saudi arabia": "sa",
  "senegal": "sn", "serbia": "rs", "singapur": "sg", "siria": "sy",
  "sudáfrica": "za", "south africa": "za", "suecia": "se", "sweden": "se",
  "suiza": "ch", "switzerland": "ch", "tailandia": "th", "taiwán": "tw",
  "tanzania": "tz", "túnez": "tn", "turquía": "tr", "turkey": "tr",
  "ucrania": "ua", "ukraine": "ua", "uganda": "ug", "uruguay": "uy",
  "uzbekistán": "uz", "venezuela": "ve", "vietnam": "vn", "zimbabue": "zw",
  "europa": "eu", "europe": "eu", "mundo": "mundo", "world": "mundo",
};

// ─── Ligas predefinidas por país ─────────────────────────────────────────────
// Se usan para sembrar la BD con ligas de fútbol populares al iniciar
const LIGAS_INICIALES = [
  { pais: "Inglaterra", ligas: ["Premier League", "Championship", "FA Cup", "EFL Cup"] },
  { pais: "España", ligas: ["La Liga", "Segunda División", "Copa del Rey"] },
  { pais: "Italia", ligas: ["Serie A", "Serie B", "Coppa Italia"] },
  { pais: "Alemania", ligas: ["Bundesliga", "2. Bundesliga", "DFB Pokal"] },
  { pais: "Francia", ligas: ["Ligue 1", "Ligue 2", "Coupe de France"] },
  { pais: "Brasil", ligas: ["Serie A", "Serie B", "Copa do Brasil"] },
  { pais: "Argentina", ligas: ["Liga Profesional", "Copa Argentina", "Copa de la Liga Profesional"] },
  { pais: "Colombia", ligas: ["Liga BetPlay", "Torneo BetPlay", "Copa Colombia"] },
  { pais: "México", ligas: ["Liga MX", "Liga de Expansión MX"] },
  { pais: "Estados Unidos", ligas: ["MLS", "USL Championship"] },
  { pais: "Países Bajos", ligas: ["Eredivisie", "Eerste Divisie"] },
  { pais: "Portugal", ligas: ["Primeira Liga", "Taça de Portugal"] },
  { pais: "Europa", ligas: ["UEFA Champions League", "UEFA Europa League", "UEFA Europa Conference League", "Eurocopa"] },
  { pais: "Mundo", ligas: ["Copa del Mundo FIFA", "Mundial de Clubes", "Amistosos"] },
  { pais: "Uruguay", ligas: ["Primera División"] },
  { pais: "Chile", ligas: ["Primera División"] },
  { pais: "Perú", ligas: ["Liga 1"] },
  { pais: "Ecuador", ligas: ["Liga Pro"] },
  { pais: "Paraguay", ligas: ["Primera División"] },
  { pais: "Bolivia", ligas: ["Primera División"] },
  { pais: "Venezuela", ligas: ["Primera División"] },
  { pais: "Bélgica", ligas: ["Pro League"] },
  { pais: "Turquía", ligas: ["Super Lig"] },
  { pais: "Grecia", ligas: ["Super League 1"] },
  { pais: "Escocia", ligas: ["Premiership"] },
  { pais: "Japón", ligas: ["J1 League"] },
  { pais: "Arabia Saudita", ligas: ["Pro League"] },
];

// ─── Equipos iniciales por liga y país ───────────────────────────────────────
// Se usan para poblar la tabla 'teams' al iniciar el servidor
const EQUIPOS_INICIALES = [
  {
    pais: "España",
    liga: "La Liga",
    equipos: [
      "Deportivo Alavés", "Athletic Club", "Atlético de Madrid", "F. C. Barcelona",
      "Real Betis Balompié", "Celta de Vigo", "Elche C. F.", "R. C. D. Espanyol",
      "Getafe C. F.", "Girona F. C.", "Levante U. D.", "R. C. D. Mallorca",
      "C. A. Osasuna", "Real Oviedo", "Rayo Vallecano", "Real Madrid C. F.",
      "Real Sociedad", "Sevilla F. C.", "Valencia C. F.", "Villarreal C. F."
    ]
  },
  {
    pais: "Inglaterra",
    liga: "Premier League",
    equipos: [
      "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton & Hove Albion",
      "Chelsea", "Crystal Palace", "Everton", "Fulham", "Ipswich Town",
      "Leicester City", "Liverpool", "Manchester City", "Manchester United",
      "Newcastle United", "Nottingham Forest", "Southampton", "Tottenham Hotspur",
      "West Ham United", "Wolverhampton Wanderers"
    ]
  },
  {
    pais: "Italia",
    liga: "Serie A",
    equipos: [
      "Atalanta", "Bolonia", "Cagliari", "Como 1907", "Empoli", "Fiorentina", "Genoa",
      "Hellas Verona", "Inter de Milán", "Juventus", "Lazio", "Lecce", "Milan",
      "Monza", "Nápoles", "Parma", "Roma", "Torino", "Udinese", "Venezia"
    ]
  },
  {
    pais: "Alemania",
    liga: "Bundesliga",
    equipos: [
      "Augsburgo", "Bayer Leverkusen", "Bayern de Múnich", "Bochum", "Borussia Dortmund",
      "Borussia Mönchengladbach", "Eintracht Fráncfort", "Friburgo", "Heidenheim",
      "Holstein Kiel", "Hoffenheim", "Mainz 05", "RB Leipzig", "St. Pauli",
      "Stuttgart", "Unión Berlín", "Werder Bremen", "Wolfsburgo"
    ]
  },
  {
    pais: "Francia",
    liga: "Ligue 1",
    equipos: [
      "Angers", "Auxerre", "Le Havre", "Lens", "Lille", "Lyon", "Marsella", "Mónaco",
      "Montpellier", "Nantes", "Niza", "Paris Saint-Germain", "Reims", "Rennes",
      "Saint-Étienne", "Estrasburgo", "Toulouse", "Brest"
    ]
  },
  {
    pais: "Argentina",
    liga: "Liga Profesional",
    equipos: [
      "Argentinos Juniors", "Atlético Tucumán", "Banfield", "Barracas Central", "Belgrano",
      "Boca Juniors", "Central Córdoba (SdE)", "Defensa y Justicia", "Deportivo Riestra",
      "Estudiantes de La Plata", "Gimnasia LP", "Godoy Cruz", "Huracán", "Independiente",
      "Independiente Rivadavia", "Instituto", "Lanús", "Newell's Old Boys", "Platense",
      "Racing Club", "River Plate", "Rosario Central", "San Lorenzo", "Sarmiento",
      "Talleres (Córdoba)", "Tigre", "Unión (Santa Fe)", "Vélez Sarsfield"
    ]
  },
  {
    pais: "Brasil",
    liga: "Serie A",
    equipos: [
      "Athletico Paranaense", "Atlético Goianiense", "Atlético Mineiro", "Bahia", "Botafogo",
      "Corinthians", "Criciúma", "Cruzeiro", "Cuiabá", "Flamengo", "Fluminense",
      "Fortaleza", "Grêmio", "Internacional", "Juventude", "Palmeiras",
      "Red Bull Bragantino", "São Paulo", "Vasco da Gama", "Vitória"
    ]
  },
  {
    pais: "Países Bajos",
    liga: "Eredivisie",
    equipos: [
      "Ajax", "Almere City", "AZ Alkmaar", "Feyenoord", "Fortuna Sittard", "Go Ahead Eagles",
      "Groningen", "Heerenveen", "Heracles Almelo", "NAC Breda", "NEC Nimega",
      "PEC Zwolle", "PSV Eindhoven", "RKC Waalwijk", "Sparta Rotterdam", "Twente",
      "Utrecht", "Willem II"
    ]
  },
  {
    pais: "Portugal",
    liga: "Primeira Liga",
    equipos: [
      "Arouca", "AVS", "Benfica", "Boavista", "Braga", "Casa Pia", "Estoril",
      "Estrela da Amadora", "Famalicão", "Farense", "Gil Vicente", "Moreirense",
      "Nacional", "Porto", "Rio Ave", "Santa Clara", "Sporting de Portugal", "Vitória Guimarães"
    ]
  },
  {
    pais: "Estados Unidos",
    liga: "MLS",
    equipos: [
      "Atlanta United", "Charlotte FC", "Chicago Fire", "Cincinnati", "Columbus Crew",
      "DC United", "Inter Miami", "CF Montréal", "Nashville SC", "New England Revolution",
      "New York City FC", "New York Red Bulls", "Orlando City", "Philadelphia Union",
      "Toronto FC", "Austin FC", "Colorado Rapids", "FC Dallas", "Houston Dynamo",
      "LA Galaxy", "LAFC", "Minnesota United", "Portland Timbers", "Real Salt Lake",
      "San Jose Earthquakes", "Seattle Sounders", "Sporting Kansas City", "St. Louis City SC",
      "Vancouver Whitecaps"
    ]
  },
  {
    pais: "Arabia Saudita",
    liga: "Pro League",
    equipos: [
      "Al-Ahli", "Al-Ettifaq", "Al-Fateh", "Al-Fayha", "Al-Hilal", "Al-Ittihad",
      "Al-Khaleej", "Al-Kholood", "Al-Nassr", "Al-Okhdood", "Al-Orobah", "Al-Qadsiah",
      "Al-Raed", "Al-Riyadh", "Al-Shabab", "Al-Taawoun", "Al-Wehda", "Damac"
    ]
  },
  {
    pais: "Suiza",
    liga: "Super League",
    equipos: [
      "BSC Young Boys", "Servette FC", "FC Lugano", "FC Lucerna", "FC Winterthur",
      "FC San Galo", "FC Zúrich", "Grasshopper Club Zúrich", "FC Basilea",
      "FC Lausana-Sport", "Yverdon-Sport", "FC Sion"
    ]
  },
  {
    pais: "Perú",
    liga: "Liga 1",
    equipos: [
      "Universitario de Deportes", "Alianza Lima", "Sporting Cristal", "FBC Melgar",
      "Cusco FC", "ADT de Tarma", "Atlético Grau", "Sport Huancayo", "Cienciano",
      "Deportivo Garcilaso", "Los Chankas", "Sport Boys", "UTC de Cajamarca",
      "Comerciantes Unidos", "Alianza Atlético", "Juan Pablo II", "FC Cajamarca",
      "Deportivo Moquegua"
    ]
  },
  {
    pais: "Ecuador",
    liga: "Liga Pro",
    equipos: [
      "Independiente del Valle", "Liga de Quito (LDU)", "Barcelona Sporting Club",
      "Club Sport Emelec", "Aucas", "Universidad Católica", "Orense Sporting Club",
      "Mushuc Runa", "Macará", "Técnico Universitario", "Delfín Sporting Club",
      "Deportivo Cuenca", "Libertad FC", "Manta FC", "El Nacional"
    ]
  },
  {
    pais: "Colombia",
    liga: "Liga BetPlay",
    equipos: [
      "Águilas Doradas", "Alianza FC", "América de Cali", "Atlético Bucaramanga",
      "Atlético Nacional", "Boyacá Chicó", "Deportes Tolima", "Deportivo Cali",
      "Deportivo Pasto", "Deportivo Pereira", "Envigado FC", "Fortaleza CEIF",
      "Independiente Santa Fe", "Jaguares de Córdoba", "Junior de Barranquilla",
      "La Equidad", "Millonarios", "Once Caldas", "Patriotas Boyacá", "Independiente Medellín"
    ]
  },
  {
    pais: "México",
    liga: "Liga MX",
    equipos: [
      "Club América", "Atlas", "Atlético de San Luis", "Cruz Azul", "Chivas Guadalajara",
      "FC Juárez", "Club León", "Mazatlán FC", "Monterrey", "Necaxa",
      "Pachuca", "Puebla", "Pumas UNAM", "Querétaro", "Santos Laguna",
      "Tigres UANL", "Toluca", "Tijuana"
    ]
  }
];

/**
 * Inicializa el esquema completo de la base de datos.
 * Crea tablas, ejecuta migraciones y siembra datos iniciales.
 * Es idempotente: puede ejecutarse múltiples veces sin efectos secundarios.
 */
export async function initDB(): Promise<void> {
  // Obtenemos una conexión dedicada del pool para la inicialización
  let conexion;
  try {
    conexion = await pool.getConnection();
    console.log("[DB] Iniciando inicialización del esquema...");

    // ── 1. Tabla: pick_types ──────────────────────────────────────────────────
    // Define los tipos de picks disponibles (free, cuota_2, cuota_3, etc.)
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS pick_types (
        id                   INT AUTO_INCREMENT PRIMARY KEY,
        name                 VARCHAR(100) NOT NULL,
        slug                 VARCHAR(100) NOT NULL UNIQUE,
        telegram_channel_id  VARCHAR(255),
        telegram_invite_link VARCHAR(255)
      )
    `);

    // Añadimos columnas de Telegram si no existen (migración segura)
    await conexion.query(`ALTER TABLE pick_types ADD COLUMN IF NOT EXISTS telegram_channel_id VARCHAR(255)`).catch(() => {});
    await conexion.query(`ALTER TABLE pick_types ADD COLUMN IF NOT EXISTS telegram_invite_link VARCHAR(255)`).catch(() => {});

    // Datos iniciales: tipos de pick predefinidos
    await conexion.query(`
      INSERT INTO pick_types (name, slug) VALUES
        ('Gratis (Free)', 'free'),
        ('VIP Cuota 2+',  'cuota_2'),
        ('VIP Cuota 3+',  'cuota_3'),
        ('VIP Cuota 4+',  'cuota_4'),
        ('VIP Cuota 5+',  'cuota_5')
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `);

    // ── 2. Tabla: countries ──────────────────────────────────────────────────
    // Almacena los países con su código de bandera emoji
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS countries (
        id   INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        flag VARCHAR(10)
      )
    `);

    // Añadimos columna de bandera si no existe
    await conexion.query(`ALTER TABLE countries ADD COLUMN IF NOT EXISTS flag VARCHAR(10)`).catch(() => {});

    // ── 3. Tabla: leagues ────────────────────────────────────────────────────
    // Liga deportiva asociada a un país (ej: "Premier League" → "Inglaterra")
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS leagues (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        country_id INT,
        UNIQUE KEY unique_liga_pais (name, country_id),
        FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL
      )
    `);

    // ── 4. Tabla: markets ────────────────────────────────────────────────────
    // Mercados de apuestas (ej: "Gana Local"="1", "Ambos Marcan"="AEM")
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS markets (
        id      VARCHAR(50)  PRIMARY KEY,
        label   VARCHAR(255) NOT NULL,
        acronym VARCHAR(50)  NOT NULL
      )
    `);

    // Mercados predefinidos del sistema
    await conexion.query(`
      INSERT IGNORE INTO markets (id, label, acronym) VALUES
        ('1',       'Gana Local',                      '1'),
        ('2',       'Gana Visitante',                  '2'),
        ('1X',      'Gana/Empate Local',                '1X'),
        ('X2',      'Gana/Empate Visitante',            'X2'),
        ('AEM',     'Ambos Marcan',                    'AEM'),
        ('+1.5',    'Más de 1.5 Goles',               '+1.5'),
        ('+2.5',    'Más de 2.5 Goles',               '+2.5'),
        ('AEM_+2.5','Ambos marcan y más de 2.5 goles', 'AEM & +2.5')
    `);

    // ── 5. Tabla: users ──────────────────────────────────────────────────────
    // Usuarios registrados en la plataforma
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        email           VARCHAR(255) NOT NULL UNIQUE,
        password_hash   VARCHAR(255) NOT NULL,
        role            VARCHAR(50)  DEFAULT 'user',
        vip_until       DATETIME     NULL,
        vip_since       DATETIME     NULL,
        plan_type       VARCHAR(50)  NULL,
        initial_bankroll DECIMAL(10,2) DEFAULT 0,
        created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migraciones: añadimos columnas faltantes de forma segura
    const columnasUsers = [
      `ALTER TABLE users ADD COLUMN vip_since DATETIME NULL`,
      `ALTER TABLE users ADD COLUMN plan_type VARCHAR(50) NULL`,
      `ALTER TABLE users ADD COLUMN initial_bankroll DECIMAL(10,2) DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN vip_until DATETIME NULL`,
    ];
    for (const query of columnasUsers) {
      await conexion.query(query).catch((e: any) => {
        if (e.code !== "ER_DUP_FIELDNAME") console.warn("[DB] Migración usuarios:", e.message);
      });
    }

    // ── 6. Tabla: picks ──────────────────────────────────────────────────────
    // Pronósticos deportivos publicados por el administrador
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS picks (
        id           INT  AUTO_INCREMENT PRIMARY KEY,
        match_date   DATETIME NOT NULL,
        league       VARCHAR(255),
        league_id    INT,
        match_name   VARCHAR(255) NOT NULL,
        pick         VARCHAR(255) NOT NULL,
        odds         DECIMAL(5,2) NOT NULL,
        stake        INT NOT NULL,
        pick_type_id INT,
        pick_type    VARCHAR(50) DEFAULT 'free',
        analysis     TEXT,
        status       VARCHAR(20) DEFAULT 'pending',
        is_parlay    BOOLEAN DEFAULT FALSE,
        selections   JSON,
        home_team_id INT,
        away_team_id INT,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pick_type_id) REFERENCES pick_types(id),
        FOREIGN KEY (league_id)    REFERENCES leagues(id),
        FOREIGN KEY (home_team_id) REFERENCES teams(id) ON DELETE SET NULL,
        FOREIGN KEY (away_team_id) REFERENCES teams(id) ON DELETE SET NULL
      )
    `);

    // ── 6.1. Migraciones de picks ───────────────────────────────────────────
    await conexion.query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS home_team_id INT`).catch(() => {});
    await conexion.query(`ALTER TABLE picks ADD COLUMN IF NOT EXISTS away_team_id INT`).catch(() => {});

    // ── 7. Tabla: pick_tracking ──────────────────────────────────────────────
    // Mensajes de seguimiento opcionales para un pick (ej: "Partido suspendido")
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS pick_tracking (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        pick_id    INT NOT NULL,
        message    TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pick_id) REFERENCES picks(id) ON DELETE CASCADE
      )
    `);

    // ── 8. Tabla: user_subscriptions ─────────────────────────────────────────
    // Suscripciones activas e históricas de usuarios
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        user_id        INT NOT NULL,
        plan_id        VARCHAR(50) NOT NULL,
        expires_at     DATETIME NOT NULL,
        amount         DECIMAL(10,2) DEFAULT 0,
        payment_method VARCHAR(50) DEFAULT 'Mercado Pago',
        periodicity    VARCHAR(50),
        currency       VARCHAR(10),
        amount_usd     DECIMAL(10,2),
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Migraciones en user_subscriptions
    const columnasSubscriptions = [
      `ALTER TABLE user_subscriptions ADD COLUMN amount DECIMAL(10,2) DEFAULT 0`,
      `ALTER TABLE user_subscriptions ADD COLUMN payment_method VARCHAR(50) DEFAULT 'Mercado Pago'`,
      `ALTER TABLE user_subscriptions ADD COLUMN periodicity VARCHAR(50)`,
      `ALTER TABLE user_subscriptions ADD COLUMN currency VARCHAR(10)`,
      `ALTER TABLE user_subscriptions ADD COLUMN amount_usd DECIMAL(10,2)`,
    ];
    for (const query of columnasSubscriptions) {
      await conexion.query(query).catch((e: any) => {
        if (e.code !== "ER_DUP_FIELDNAME") console.warn("[DB] Migración subs:", e.message);
      });
    }

    // ── 8.1. Tabla: password_reset_tokens ───────────────────────────────────
    // Tokens hasheados para recuperación segura de contraseña.
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        token_hash  VARCHAR(128) NOT NULL UNIQUE,
        expires_at  DATETIME NOT NULL,
        used_at     DATETIME DEFAULT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_password_reset_user (user_id),
        INDEX idx_password_reset_expires (expires_at)
      )
    `);

    // ── 9. Tabla: user_plan_settings ─────────────────────────────────────────
    // Bankroll personalizado por usuario y tipo de pick
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS user_plan_settings (
        user_id          INT NOT NULL,
        pick_type_id     INT NOT NULL,
        initial_bankroll DECIMAL(10,2) DEFAULT 1000,
        PRIMARY KEY (user_id, pick_type_id),
        FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE,
        FOREIGN KEY (pick_type_id) REFERENCES pick_types(id) ON DELETE CASCADE
      )
    `);

    // ── 10. Tabla: payments ──────────────────────────────────────────────────
    // Historial de pagos procesados por Mercado Pago
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        user_id        INT NOT NULL,
        mp_payment_id  VARCHAR(100) UNIQUE,
        amount         DECIMAL(10,2) NOT NULL,
        currency       VARCHAR(10) DEFAULT 'COP',
        status         VARCHAR(50) NOT NULL,
        plan_id        VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50),
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── 11. Tabla: webhook_logs ──────────────────────────────────────────────
    // Log de notificaciones de Mercado Pago para auditoría y debugging
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        topic       VARCHAR(50),
        resource_id VARCHAR(100),
        raw_body    TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── 12. Tabla: promo_codes ───────────────────────────────────────────────
    // Códigos de descuento para suscripciones
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        code                VARCHAR(50) NOT NULL UNIQUE,
        discount_percentage INT NOT NULL,
        max_uses            INT DEFAULT NULL,
        current_uses        INT DEFAULT 0,
        valid_until         DATETIME DEFAULT NULL,
        created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── 13. Tabla: teams ─────────────────────────────────────────────────────
    // Almacena equipos deportivos vinculados a una liga y país
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        league_id  INT,
        country_id INT,
        UNIQUE KEY unique_team_league (name, league_id),
        FOREIGN KEY (league_id)  REFERENCES leagues(id) ON DELETE CASCADE,
        FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
      )
    `);

    // ── 14. Tabla: app_settings ─────────────────────────────────────────────
    // Configuraciones globales del panel que no pertenecen a una entidad normal.
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key   VARCHAR(100) PRIMARY KEY,
        setting_value TEXT,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // ── 14. Tabla: telegram_user_invites ────────────────────────────────────
    // Guarda links privados temporales para canales VIP de usuarios pagos.
    await conexion.query(`
      CREATE TABLE IF NOT EXISTS telegram_user_invites (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        plan_id     VARCHAR(50) NOT NULL,
        channel_id  VARCHAR(255) NOT NULL,
        invite_link VARCHAR(512) NOT NULL,
        expires_at  DATETIME NOT NULL,
        used_at     DATETIME DEFAULT NULL,
        telegram_user_id  VARCHAR(64) DEFAULT NULL,
        telegram_username VARCHAR(255) DEFAULT NULL,
        revoked_at  DATETIME DEFAULT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_plan_channel (user_id, plan_id, channel_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Registramos cuándo Telegram confirmó que el link ya fue usado.
    await conexion.query(`ALTER TABLE telegram_user_invites ADD COLUMN IF NOT EXISTS used_at DATETIME DEFAULT NULL`).catch(() => {});
    // Guardamos el ID de Telegram reportado por el webhook para auditoría.
    await conexion.query(`ALTER TABLE telegram_user_invites ADD COLUMN IF NOT EXISTS telegram_user_id VARCHAR(64) DEFAULT NULL`).catch(() => {});
    // Guardamos el username de Telegram reportado por el webhook para mostrarlo al usuario.
    await conexion.query(`ALTER TABLE telegram_user_invites ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(255) DEFAULT NULL`).catch(() => {});
    // Marcamos links revocados cuando se regenera uno nuevo antes de vencer.
    await conexion.query(`ALTER TABLE telegram_user_invites ADD COLUMN IF NOT EXISTS revoked_at DATETIME DEFAULT NULL`).catch(() => {});

    // ── Sembrar ligas y países iniciales ─────────────────────────────────────
    for (const { pais, ligas } of LIGAS_INICIALES) {
      try {
        // Insertamos el país si no existe
        await conexion.query("INSERT IGNORE INTO countries (name) VALUES (?)", [pais]);
        const [filas]: any = await conexion.query(
          "SELECT id FROM countries WHERE name = ?",
          [pais]
        );
        const idPais = filas[0]?.id;
        if (!idPais) continue;

        // Asignamos la bandera al país si la conocemos
        const codisoFlag = PAISES_ISO[pais.toLowerCase().trim()];
        if (codisoFlag) {
          await conexion.query(
            "UPDATE countries SET flag = ? WHERE id = ? AND (flag IS NULL OR flag = '')",
            [codisoFlag, idPais]
          );
        }

        // Insertamos las ligas del país
        for (const nombreLiga of ligas) {
          await conexion
            .query("INSERT IGNORE INTO leagues (name, country_id) VALUES (?, ?)", [nombreLiga, idPais])
            .catch(() => {}); // Ignoramos duplicados
        }
      } catch (err) {
        console.error(`[DB] Error sembrando ligas para ${pais}:`, err);
      }
    }

    // ── Crear usuario administrador por defecto ───────────────────────────────
    const [admins] = await conexion.query(
      "SELECT * FROM users WHERE email = 'admin@betroyale.club'"
    );
    if ((admins as any[]).length === 0) {
      // Solo creamos el admin si no existe (no sobreescribimos contraseñas)
      const hashAdmin = await bcrypt.hash("admin123", 10);
      await conexion.query(
        "INSERT INTO users (email, password_hash, role) VALUES ('admin@betroyale.club', ?, 'admin')",
        [hashAdmin]
      );
      console.log("[DB] ✅ Usuario admin creado: admin@betroyale.club / admin123");
    }

    // ── Sembrar equipos iniciales ─────────────────────────────────────────────
    console.log("[DB] Sembrando equipos iniciales...");
    for (const item of EQUIPOS_INICIALES) {
      try {
        // Obtenemos el ID del país
        const [filasPais]: any = await conexion.query(
          "SELECT id FROM countries WHERE name = ?",
          [item.pais]
        );
        const idPais = filasPais[0]?.id;
        if (!idPais) continue;

        // Obtenemos el ID de la liga
        const [filasLiga]: any = await conexion.query(
          "SELECT id FROM leagues WHERE name = ? AND country_id = ?",
          [item.liga, idPais]
        );
        const idLiga = filasLiga[0]?.id;
        if (!idLiga) continue;

        // Insertamos los equipos
        for (const nombreEquipo of item.equipos) {
          await conexion.query(
            "INSERT IGNORE INTO teams (name, league_id, country_id) VALUES (?, ?, ?)",
            [nombreEquipo, idLiga, idPais]
          ).catch(() => {});
        }
      } catch (err) {
        console.error(`[DB] Error sembrando equipos para ${item.liga}:`, err);
      }
    }

    console.log("[DB] ✅ Esquema inicializado correctamente");
  } catch (error) {
    console.error("[DB] ❌ Error inicializando esquema:", error);
    throw error; // Re-lanzamos para que el servidor no arrange con BD incompleta
  } finally {
    // Siempre liberamos la conexión de vuelta al pool
    if (conexion) conexion.release();
  }
}
