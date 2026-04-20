import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";

console.log("[DEBUG] server.ts is being executed");
import path from "path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { MercadoPagoConfig, Preference, Payment, MerchantOrder } from 'mercadopago';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-production";
const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const mercadopago = new MercadoPagoConfig({ accessToken: mpAccessToken });

// Log token type for debugging (safely)
if (mpAccessToken) {
  const tokenType = mpAccessToken.startsWith('TEST-') ? 'TEST (Sandbox)' : 'PRODUCTION (Live)';
  console.log(`Mercado Pago initialized with ${tokenType} token.`);
  if (mpAccessToken.startsWith('APP_USR-')) {
    console.warn('Warning: Using a production token (APP_USR-). Ensure this is intended.');
  }
} else {
  console.error('CRITICAL: MERCADOPAGO_ACCESS_TOKEN is missing in environment variables.');
}

// Create MySQL connection pool with query logging
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'test',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Wrapper for pool.query to log slow queries
const originalQuery = pool.query.bind(pool);
(pool as any).query = async (...args: any[]) => {
  const start = Date.now();
  try {
    const result = await originalQuery(...args);
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`[SLOW QUERY] took ${duration}ms: ${args[0].substring(0, 100)}...`);
    }
    return result;
  } catch (error: any) {
    const duration = Date.now() - start;
    if (error.code !== 'ER_DUP_ENTRY') {
      console.error(`[QUERY ERROR] took ${duration}ms: ${args[0].substring(0, 100)}...`, error);
    }
    throw error;
  }
};

// Initialize Database Schema
async function initDB() {
  let connection;
  try {
    connection = await pool.getConnection();
    
    // 1. Create pick_types table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pick_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        telegram_channel_id VARCHAR(255),
        telegram_invite_link VARCHAR(255)
      )
    `);

    // Add columns if they don't exist (for existing tables)
    await connection.query(`ALTER TABLE pick_types ADD COLUMN IF NOT EXISTS telegram_channel_id VARCHAR(255)`).catch(() => {});
    await connection.query(`ALTER TABLE pick_types ADD COLUMN IF NOT EXISTS telegram_invite_link VARCHAR(255)`).catch(() => {});

    // 2. Insert default pick types
    await connection.query(`
      INSERT INTO pick_types (name, slug) VALUES 
      ('Gratis (Free)', 'free'), 
      ('VIP Cuota 2+', 'cuota_2'), 
      ('VIP Cuota 3+', 'cuota_3'), 
      ('VIP Cuota 4+', 'cuota_4'),
      ('VIP Cuota 5+', 'cuota_5')
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `);

    // Safe migration: only update if both exist
    await connection.query(`
      UPDATE picks p
      JOIN pick_types old_pt ON p.pick_type_id = old_pt.id
      JOIN pick_types new_pt ON new_pt.slug = 'cuota_4'
      SET p.pick_type_id = new_pt.id
      WHERE old_pt.slug = 'full'
    `).catch(() => {});

    await connection.query(`
      UPDATE picks p
      JOIN pick_types old_pt ON p.pick_type_id = old_pt.id
      JOIN pick_types new_pt ON new_pt.slug = 'cuota_5'
      SET p.pick_type_id = new_pt.id
      WHERE old_pt.slug = 'cuota_10'
    `).catch(() => {});

    // Delete old slugs
    await connection.query(`DELETE FROM pick_types WHERE slug = 'full'`).catch(() => {});
    await connection.query(`DELETE FROM pick_types WHERE slug = 'cuota_10'`).catch(() => {});

    // 3. Create picks table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS picks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        match_date DATETIME NOT NULL,
        league VARCHAR(255) NOT NULL,
        match_name VARCHAR(255) NOT NULL,
        pick VARCHAR(255) NOT NULL,
        odds DECIMAL(5,2) NOT NULL,
        stake INT NOT NULL,
        pick_type_id INT,
        pick_type VARCHAR(50) DEFAULT 'free',
        analysis TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pick_type_id) REFERENCES pick_types(id)
      )
    `);

    // Update existing picks to have correct pick_type based on pick_type_id
    await connection.query(`
      UPDATE picks p 
      JOIN pick_types pt ON p.pick_type_id = pt.id 
      SET p.pick_type = pt.slug
    `);

    // 4. Create pick_tracking table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS pick_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pick_id INT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pick_id) REFERENCES picks(id) ON DELETE CASCADE
      )
    `);

    // 4.5 Create markets table for normalized picks
    await connection.query(`
      CREATE TABLE IF NOT EXISTS markets (
        id VARCHAR(50) PRIMARY KEY,
        label VARCHAR(255) NOT NULL,
        acronym VARCHAR(50) NOT NULL
      )
    `);

    // 4.6 Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        vip_until DATETIME NULL,
        vip_since DATETIME NULL,
        initial_bankroll DECIMAL(10,2) DEFAULT 1000,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add columns to users if they don't exist
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN vip_since DATETIME NULL`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }
    
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN initial_bankroll DECIMAL(10,2) DEFAULT 1000`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }

    // 4.65 Create countries table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS countries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE
      )
    `);

    // Add flag to countries if it doesn't exist
    try {
      await connection.query(`ALTER TABLE countries ADD COLUMN flag VARCHAR(10)`);
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME') {
        console.error("Error adding flag to countries:", e);
      }
    }

    // Populate flag column if empty
    try {
      const mapping: Record<string, string> = {
        "afganistán": "af", "afghanistan": "af", "albania": "al", "alemania": "de", "germany": "de", "andorra": "ad", "angola": "ao", "anguila": "ai", "antártida": "aq", "antigua y barbuda": "ag", "arabia saudita": "sa", "saudi arabia": "sa", "argelia": "dz", "argentina": "ar", "armenia": "am", "aruba": "aw", "australia": "au", "austria": "at", "azerbaiyán": "az", "bahamas": "bs", "bahrein": "bh", "bangladesh": "bd", "barbados": "bb", "bélgica": "be", "belgium": "be", "belice": "bz", "benín": "bj", "bermudas": "bm", "bielorrusia": "by", "bolivia": "bo", "bosnia y herzegovina": "ba", "botswana": "bw", "brasil": "br", "brazil": "br", "brunéi": "bn", "bulgaria": "bg", "burkina faso": "bf", "burundi": "bi", "cabo verde": "cv", "camboya": "kh", "camerún": "cm", "canadá": "ca", "canada": "ca", "chad": "td", "chile": "cl", "china": "cn", "chipre": "cy", "colombia": "co", "comoras": "km", "congo": "cg", "corea del norte": "kp", "corea del sur": "kr", "south korea": "kr", "costa de marfil": "ci", "costa rica": "cr", "croacia": "hr", "cuba": "cu", "curazao": "cw", "dinamarca": "dk", "denmark": "dk", "djibouti": "dj", "dominica": "dm", "ecuador": "ec", "egipto": "eg", "el salvador": "sv", "emiratos árabes unidos": "ae", "eritrea": "er", "eslovaquia": "sk", "eslovenia": "si", "españa": "es", "spain": "es", "estados unidos": "us", "united states": "us", "estonia": "ee", "etiopía": "et", "fiji": "fj", "filipinas": "ph", "finlandia": "fi", "francia": "fr", "france": "fr", "gabón": "ga", "gambia": "gm", "georgia": "ge", "ghana": "gh", "gibraltar": "gi", "granada": "gd", "grecia": "gr", "greece": "gr", "groenlandia": "gl", "guadalupe": "gp", "guam": "gu", "guatemala": "gt", "guayana francesa": "gf", "guinea": "gn", "guinea ecuatorial": "gq", "guinea-bissau": "gw", "guyana": "gy", "haití": "ht", "honduras": "hn", "hong kong": "hk", "hungría": "hu", "hungary": "hu", "india": "in", "indonesia": "id", "irán": "ir", "iraq": "iq", "irlanda": "ie", "islandia": "is", "islas caimán": "ky", "islas cook": "ck", "islas falkland": "fk", "islas feroe": "fo", "islas marshall": "mh", "islas salomón": "sb", "islas vírgenes": "vi", "israel": "il", "italia": "it", "italy": "it", "jamaica": "jm", "japón": "jp", "japan": "jp", "jordania": "jo", "kazajistán": "kz", "kenia": "ke", "kirguistán": "kg", "kiribati": "ki", "kuwait": "kw", "laos": "la", "lesotho": "ls", "letonia": "lv", "líbano": "lb", "liberia": "lr", "libia": "ly", "liechtenstein": "li", "lituania": "lt", "luxemburgo": "lu", "macao": "mo", "macedonia": "mk", "madagascar": "mg", "malasia": "my", "malawi": "mw", "maldivas": "mv", "mali": "ml", "malta": "mt", "marruecos": "ma", "martinica": "mq", "mauricio": "mu", "mauritania": "mr", "méxico": "mx", "mexico": "mx", "micronesia": "fm", "moldavia": "md", "mónaco": "mc", "mongolia": "mn", "montenegro": "me", "montserrat": "ms", "mozambique": "mz", "myanmar": "mm", "namibia": "na", "nauru": "nr", "nepal": "np", "nicaragua": "ni", "níger": "ne", "nigeria": "ng", "niue": "nu", "noruega": "no", "norway": "no", "nueva caledonia": "nc", "nueva zelanda": "nz", "new zealand": "nz", "omán": "om", "países bajos": "nl", "netherlands": "nl", "holanda": "nl", "pakistán": "pk", "palau": "pw", "palestina": "ps", "panamá": "pa", "papúa nueva guinea": "pg", "paraguay": "py", "perú": "pe", "peru": "pe", "polinesia francesa": "pf", "polonia": "pl", "poland": "pl", "portugal": "pt", "puerto rico": "pr", "qatar": "qa", "reino unido": "gb", "united kingdom": "gb", "inglaterra": "gb", "england": "gb", "escocia": "gb", "scotland": "gb", "república centroafricana": "cf", "república checa": "cz", "czech republic": "cz", "república dominicana": "do", "reunión": "re", "ruanda": "rw", "rumania": "ro", "rusia": "ru", "russia": "ru", "samoa": "ws", "samoa americana": "as", "san cristóbal y nieves": "kn", "san marino": "sm", "san pedro y miquelón": "pm", "san vicente y las granadinas": "vc", "santa lucía": "lc", "santo tomé y príncipe": "st", "senegal": "sn", "serbia": "rs", "seychelles": "sc", "sierra leona": "sl", "singapur": "sg", "siria": "sy", "somalia": "so", "sri lanka": "lk", "suazilandia": "sz", "sudáfrica": "za", "south africa": "za", "sudan": "sd", "suecia": "se", "sweden": "se", "suiza": "ch", "switzerland": "ch", "surinam": "sr", "tailandia": "th", "taiwán": "tw", "tanzania": "tz", "tayikistán": "tj", "timor oriental": "tl", "togo": "tg", "tonga": "to", "trinidad y tobago": "tt", "túnez": "tn", "turkmenistán": "tm", "turquía": "tr", "turkey": "tr", "tuvalu": "tv", "ucrania": "ua", "ukraine": "ua", "uganda": "ug", "uzbekistán": "uz", "vanuatu": "vu", "vaticano": "va", "venezuela": "ve", "vietnam": "vn", "yemen": "ye", "yibuti": "dj", "zambia": "zm", "zimbabue": "zw",
        "europa": "eu", "europe": "eu",
        "américa": "america", "america": "america", "americano": "america",
        "asia": "asia",
        "oceanía": "oceania", "oceania": "oceania",
        "mundo": "mundo", "world": "mundo"
      };
      
      // Populate/Update flag column for all countries
      const [countries]: any = await connection.query('SELECT id, name FROM countries');
      for (const country of countries) {
        const isoCode = mapping[country.name.toLowerCase().trim()];
        if (isoCode) {
          await connection.query('UPDATE countries SET flag = ? WHERE id = ?', [isoCode, country.id]);
        }
      }
    } catch (e) {
      console.error("Error populating flags:", e);
    }

    // 4.66 Create user_plan_settings table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_plan_settings (
        user_id INT NOT NULL,
        pick_type_id INT NOT NULL,
        initial_bankroll DECIMAL(10,2) DEFAULT 1000,
        PRIMARY KEY (user_id, pick_type_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (pick_type_id) REFERENCES pick_types(id) ON DELETE CASCADE
      )
    `);

    // 4.67 Create user_subscriptions table to support multiple concurrent plans
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        plan_id VARCHAR(50) NOT NULL,
        amount DECIMAL(10,2) DEFAULT 0,
        payment_method VARCHAR(50) DEFAULT 'Mercado Pago',
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Add columns to user_subscriptions if they don't exist
    try {
      await connection.query(`ALTER TABLE user_subscriptions ADD COLUMN amount DECIMAL(10,2) DEFAULT 0`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }
    
    try {
      await connection.query(`ALTER TABLE user_subscriptions ADD COLUMN payment_method VARCHAR(50) DEFAULT 'Mercado Pago'`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }

    try {
      await connection.query(`ALTER TABLE user_subscriptions ADD COLUMN periodicity VARCHAR(50)`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }

    try {
      await connection.query(`ALTER TABLE user_subscriptions ADD COLUMN currency VARCHAR(10)`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }

    try {
      await connection.query(`ALTER TABLE user_subscriptions ADD COLUMN amount_usd DECIMAL(10, 2)`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }

    // 4.68 Create payments table for history
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        mp_payment_id VARCHAR(100) UNIQUE,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'COP',
        status VARCHAR(50) NOT NULL,
        plan_id VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 4.69 Create webhook_logs table for debugging
    await connection.query(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        topic VARCHAR(50),
        resource_id VARCHAR(100),
        raw_body TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4.7 Create leagues table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS leagues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        country_id INT,
        UNIQUE KEY unique_league_country (name, country_id),
        FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL
      )
    `);

    // 4.8 Create promo_codes table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        discount_percentage INT NOT NULL,
        max_uses INT DEFAULT NULL,
        current_uses INT DEFAULT 0,
        valid_until DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add country_id to leagues if it doesn't exist
    try {
      await connection.query(`ALTER TABLE leagues ADD COLUMN country_id INT`);
      console.log("Added country_id column to leagues");
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error("Error adding country_id to leagues:", e.message); }

    try {
      await connection.query(`ALTER TABLE leagues ADD FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL`);
      console.log("Added foreign key to leagues");
    } catch (e: any) { if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_FK_DUP_NAME') console.error("Error adding FK to leagues:", e.message); }
    
    // Drop old unique index on name if it exists (to allow same name in different countries)
    const indexesToDrop = ['name', 'leagues_name_unique', 'unique_name', 'leagues_name_key', 'name_UNIQUE'];
    for (const idx of indexesToDrop) {
      try {
        await connection.query(`ALTER TABLE leagues DROP INDEX ${idx}`);
        console.log(`Dropped index ${idx} from leagues`);
      } catch (e) {}
    }

    // Clean up duplicates before adding unique index
    try {
      await connection.query(`
        DELETE l1 FROM leagues l1
        INNER JOIN leagues l2 
        WHERE l1.id > l2.id 
          AND l1.name = l2.name 
          AND (l1.country_id = l2.country_id OR (l1.country_id IS NULL AND l2.country_id IS NULL))
      `);
      console.log("Cleaned up duplicate leagues");
    } catch (e: any) { console.error("Error cleaning up duplicate leagues:", e.message); }
    
    try {
      await connection.query(`ALTER TABLE leagues ADD UNIQUE KEY unique_league_country (name, country_id)`);
      console.log("Added unique_league_country index to leagues");
    } catch (e: any) { 
      if (e.code !== 'ER_DUP_KEYNAME') {
        console.error("Error adding unique_league_country to leagues:", e.message);
      }
    }

    // Remove non-soccer leagues if they were previously added
    await connection.query(`
      DELETE FROM leagues WHERE name IN ('NBA', 'NFL', 'MLB', 'NHL')
    `);

    // Fetch and insert football leagues from API for major countries
    try {
      console.log("Seeding soccer leagues...");
      const staticLeagues = [
        { country: 'Inglaterra', leagues: ['Premier League', 'Championship', 'League One', 'League Two', 'FA Cup', 'EFL Cup'] },
        { country: 'España', leagues: ['La Liga', 'Segunda División', 'Copa del Rey'] },
        { country: 'Italia', leagues: ['Serie A', 'Serie B', 'Coppa Italia'] },
        { country: 'Alemania', leagues: ['Bundesliga', '2. Bundesliga', 'DFB Pokal'] },
        { country: 'Francia', leagues: ['Ligue 1', 'Ligue 2', 'Coupe de France'] },
        { country: 'Brasil', leagues: ['Serie A', 'Serie B', 'Copa do Brasil', 'Paulista', 'Carioca'] },
        { country: 'Argentina', leagues: ['Liga Profesional', 'Primera Nacional', 'Copa Argentina', 'Copa de la Liga Profesional'] },
        { country: 'Colombia', leagues: ['Liga BetPlay', 'Torneo BetPlay', 'Copa Colombia'] },
        { country: 'México', leagues: ['Liga MX', 'Liga de Expansión MX'] },
        { country: 'Estados Unidos', leagues: ['MLS', 'USL Championship', 'US Open Cup'] },
        { country: 'Países Bajos', leagues: ['Eredivisie', 'Eerste Divisie', 'KNVB Beker'] },
        { country: 'Portugal', leagues: ['Primeira Liga', 'Liga Portugal 2', 'Taça de Portugal'] },
        { country: 'Europa', leagues: ['UEFA Champions League', 'UEFA Europa League', 'UEFA Europa Conference League', 'UEFA Nations League', 'Eurocopa'] },
        { country: 'Mundo', leagues: ['Copa del Mundo FIFA', 'Mundial de Clubes', 'Amistosos'] },
        { country: 'Uruguay', leagues: ['Primera División'] },
        { country: 'Chile', leagues: ['Primera División'] },
        { country: 'Perú', leagues: ['Liga 1'] },
        { country: 'Ecuador', leagues: ['Liga Pro'] },
        { country: 'Paraguay', leagues: ['Primera División'] },
        { country: 'Bolivia', leagues: ['Primera División'] },
        { country: 'Venezuela', leagues: ['Primera División'] },
        { country: 'Bélgica', leagues: ['Pro League'] },
        { country: 'Turquía', leagues: ['Super Lig'] },
        { country: 'Grecia', leagues: ['Super League 1'] },
        { country: 'Escocia', leagues: ['Premiership'] },
        { country: 'Japón', leagues: ['J1 League'] },
        { country: 'Arabia Saudita', leagues: ['Pro League'] }
      ];
      
      for (const { country, leagues } of staticLeagues) {
        try {
          // Insert country if it doesn't exist
          await connection.query('INSERT IGNORE INTO countries (name) VALUES (?)', [country]);
          const [countryRows]: any = await connection.query('SELECT id FROM countries WHERE name = ?', [country]);
          const countryId = countryRows[0]?.id;
          
          if (!countryId) continue;

          for (const leagueName of leagues) {
            try {
              await connection.query('INSERT IGNORE INTO leagues (name, country_id) VALUES (?, ?)', [leagueName, countryId]);
            } catch (e) {
              // Ignore duplicates
            }
          }
        } catch (err) {
          console.error(`Error seeding leagues for ${country}:`, err);
        }
      }
      
      console.log("Successfully seeded soccer leagues.");
    } catch (error) {
      console.error("Failed to seed leagues:", error);
    }

    // Add new columns to users table if they don't exist
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN vip_until DATETIME NULL`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN plan_type VARCHAR(50) NULL`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN vip_since DATETIME NULL`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }
    try {
      await connection.query(`ALTER TABLE users ADD COLUMN initial_bankroll DECIMAL(10,2) DEFAULT 0`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }

    // Insert default admin user if not exists
    const [adminRows] = await connection.query(`SELECT * FROM users WHERE email = 'admin@betroyale.club'`);
    if ((adminRows as any[]).length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await connection.query(`
        INSERT INTO users (email, password_hash, role) VALUES ('admin@betroyale.club', ?, 'admin')
      `, [hashedPassword]);
    }

    // Insert or update a test VIP user
    const [vipRows] = await connection.query(`SELECT * FROM users WHERE email = 'vip@betroyale.club'`);
    const hashedVipPassword = await bcrypt.hash('vip123', 10);
    const now = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const formattedDate = nextMonth.toISOString().slice(0, 19).replace('T', ' ');
    const formattedLastMonth = lastMonth.toISOString().slice(0, 19).replace('T', ' ');
    
    if ((vipRows as any[]).length === 0) {
      await connection.query(`
        INSERT INTO users (email, password_hash, role, vip_until, plan_type, vip_since, initial_bankroll) 
        VALUES ('vip@betroyale.club', ?, 'vip', ?, 'Mensual', ?, 1000)
      `, [hashedVipPassword, formattedDate, formattedLastMonth]);
    } else {
      await connection.query(`
        UPDATE users SET password_hash = ?, role = 'vip', vip_until = ?, plan_type = 'Mensual', vip_since = ?, initial_bankroll = 1000 WHERE email = 'vip@betroyale.club'
      `, [hashedVipPassword, formattedDate, formattedLastMonth]);
    }

    // Insert a brand new VIP user just in case
    const [nuevoRows] = await connection.query(`SELECT * FROM users WHERE email = 'nuevo@betroyale.club'`);
    if ((nuevoRows as any[]).length === 0) {
      const hashedNuevoPassword = await bcrypt.hash('nuevo123', 10);
      await connection.query(`
        INSERT INTO users (email, password_hash, role, vip_until, plan_type, vip_since, initial_bankroll) 
        VALUES ('nuevo@betroyale.club', ?, 'vip', ?, 'Trimestral', ?, 500)
      `, [hashedNuevoPassword, formattedDate, formattedLastMonth]);
    } else {
      const hashedNuevoPassword = await bcrypt.hash('nuevo123', 10);
      await connection.query(`
        UPDATE users SET password_hash = ?, role = 'vip', vip_until = ?, plan_type = 'Trimestral', vip_since = ?, initial_bankroll = 500 WHERE email = 'nuevo@betroyale.club'
      `, [hashedNuevoPassword, formattedDate, formattedLastMonth]);
    }

    // Insert default markets
    await connection.query(`
      INSERT IGNORE INTO markets (id, label, acronym) VALUES 
      ('1', 'Gana Local', '1'),
      ('2', 'Gana Visitante', '2'),
      ('1X', 'Gana/Empate Local', '1X'),
      ('X2', 'Gana/Empate Visitante', 'X2'),
      ('AEM', 'Ambos Marcan', 'AEM'),
      ('+1.5', 'Más de 1.5 Goles', '+1.5'),
      ('+2.5', 'Más de 2.5 Goles', '+2.5'),
      ('AEM_+2.5', 'Ambos marcan y más de 2.5 goles', 'AEM & +2.5')
    `);
    
    // 5. Migrations for existing picks table
    const alterQueries = [
      `ALTER TABLE picks ADD COLUMN match_date DATETIME NOT NULL AFTER id`,
      `ALTER TABLE picks ADD COLUMN league VARCHAR(255) NOT NULL AFTER match_date`,
      `ALTER TABLE picks ADD COLUMN pick_type_id INT AFTER stake`,
      `ALTER TABLE picks ADD COLUMN analysis TEXT AFTER pick_type_id`,
      `ALTER TABLE picks ADD COLUMN status VARCHAR(20) DEFAULT 'pending' AFTER analysis`,
      `ALTER TABLE picks ADD CONSTRAINT fk_pick_type FOREIGN KEY (pick_type_id) REFERENCES pick_types(id)`
    ];

    for (const query of alterQueries) {
      try {
        await connection.query(query);
      } catch (e) {
        // Ignore individual column existence errors
      }
    }

    // 6. Migrate old pick_type string to pick_type_id
    try {
      await connection.query(`
        UPDATE picks p 
        JOIN pick_types pt ON p.pick_type = pt.slug 
        SET p.pick_type_id = pt.id 
        WHERE p.pick_type_id IS NULL
      `);
    } catch (e) {}

    // 7. Migrate old text picks to normalized IDs
    try {
      await connection.query(`UPDATE picks SET pick = 'AEM_+2.5' WHERE (pick LIKE '%Ambos Marcan%' OR pick LIKE '%AEM%') AND pick LIKE '%2.5%'`);
      await connection.query(`UPDATE picks SET pick = 'AEM' WHERE (pick LIKE '%Ambos Marcan%' OR pick LIKE '%AEM%') AND pick NOT LIKE '%2.5%'`);
      await connection.query(`UPDATE picks SET pick = '+1.5' WHERE pick LIKE '%1.5%' AND pick NOT LIKE '%Ambos Marcan%'`);
      await connection.query(`UPDATE picks SET pick = '+2.5' WHERE pick LIKE '%2.5%' AND pick NOT LIKE '%Ambos Marcan%'`);
      await connection.query(`UPDATE picks SET pick = '1X' WHERE pick LIKE '%Gana/Empate Local%' OR pick LIKE '%Gana o Empate Local%'`);
      await connection.query(`UPDATE picks SET pick = 'X2' WHERE pick LIKE '%Gana/Empate Visitante%' OR pick LIKE '%Gana o Empate Visitante%'`);
      await connection.query(`UPDATE picks SET pick = '1' WHERE pick LIKE '%Gana Local%' AND pick NOT LIKE '%Empate%'`);
      await connection.query(`UPDATE picks SET pick = '2' WHERE pick LIKE '%Gana Visitante%' AND pick NOT LIKE '%Empate%'`);
    } catch (e) {
      console.error("Error migrating text picks:", e);
    }

    // 8. Migrate leagues
    try {
      // Allow league to be null
      await connection.query(`ALTER TABLE picks MODIFY COLUMN league VARCHAR(255) NULL`);
    } catch (e) {}

    try {
      await connection.query(`ALTER TABLE picks ADD COLUMN league_id INT`);
      await connection.query(`ALTER TABLE picks ADD CONSTRAINT fk_league FOREIGN KEY (league_id) REFERENCES leagues(id)`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }

    try {
      await connection.query(`ALTER TABLE picks ADD COLUMN is_parlay BOOLEAN DEFAULT FALSE`);
      await connection.query(`ALTER TABLE picks ADD COLUMN selections JSON`);
    } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') console.error(e); }

    try {
      // Insert any existing leagues from picks that aren't in leagues table
      await connection.query(`
        INSERT IGNORE INTO leagues (name)
        SELECT DISTINCT league FROM picks WHERE league IS NOT NULL AND league != ''
      `);
      // Update picks with the corresponding league_id
      await connection.query(`
        UPDATE picks p
        JOIN leagues l ON p.league = l.name
        SET p.league_id = l.id
        WHERE p.league_id IS NULL
      `);
    } catch (e) {
      console.error("Error migrating leagues:", e);
    }

    // 9. Translate existing countries and leagues to Spanish
    try {
      const translations = [
        { en: 'England', es: 'Inglaterra' },
        { en: 'Spain', es: 'España' },
        { en: 'Italy', es: 'Italia' },
        { en: 'Germany', es: 'Alemania' },
        { en: 'France', es: 'Francia' },
        { en: 'Brazil', es: 'Brasil' },
        { en: 'Mexico', es: 'México' },
        { en: 'USA', es: 'Estados Unidos' },
        { en: 'Netherlands', es: 'Países Bajos' },
        { en: 'Europe', es: 'Europa' },
        { en: 'World', es: 'Mundo' },
        { en: 'Peru', es: 'Perú' },
        { en: 'Belgium', es: 'Bélgica' },
        { en: 'Turkey', es: 'Turquía' },
        { en: 'Greece', es: 'Grecia' },
        { en: 'Scotland', es: 'Escocia' },
        { en: 'Japan', es: 'Japón' },
        { en: 'Saudi Arabia', es: 'Arabia Saudita' }
      ];

      for (const { en, es } of translations) {
        try {
          const [enRows]: any = await connection.query('SELECT id FROM countries WHERE name = ?', [en]);
          if (enRows.length === 0) continue;
          const enId = enRows[0].id;

          const [esRows]: any = await connection.query('SELECT id FROM countries WHERE name = ?', [es]);
          if (esRows.length > 0) {
            const esId = esRows[0].id;
            await connection.query('UPDATE IGNORE leagues SET country_id = ? WHERE country_id = ?', [esId, enId]);
            await connection.query('DELETE FROM countries WHERE id = ?', [enId]);
          } else {
            await connection.query('UPDATE countries SET name = ? WHERE id = ?', [es, enId]);
          }
        } catch (err) {
          console.error(`Error translating country ${en} to ${es}:`, err);
        }
      }

      const leagueTranslations = [
        { en: 'Segunda Division', es: 'Segunda División' },
        { en: 'Liga de Expansion MX', es: 'Liga de Expansión MX' },
        { en: 'Taca de Portugal', es: 'Taça de Portugal' },
        { en: 'Euro Championship', es: 'Eurocopa' },
        { en: 'FIFA World Cup', es: 'Copa del Mundo FIFA' },
        { en: 'Club World Cup', es: 'Mundial de Clubes' },
        { en: 'Friendlies', es: 'Amistosos' },
        { en: 'Primera Division', es: 'Primera División' }
      ];

      for (const { en, es } of leagueTranslations) {
        try {
          const [enRows]: any = await connection.query('SELECT id FROM leagues WHERE name = ?', [en]);
          if (enRows.length === 0) continue;
          const enId = enRows[0].id;

          const [esRows]: any = await connection.query('SELECT id FROM leagues WHERE name = ?', [es]);
          if (esRows.length > 0) {
            const esId = esRows[0].id;
            await connection.query('UPDATE picks SET league_id = ? WHERE league_id = ?', [esId, enId]);
            await connection.query('DELETE FROM leagues WHERE id = ?', [enId]);
          } else {
            await connection.query('UPDATE leagues SET name = ? WHERE id = ?', [es, enId]);
          }
        } catch (err) {
          console.error(`Error translating league ${en} to ${es}:`, err);
        }
      }
    } catch (e) {
      console.error("Error translating countries and leagues:", e);
    }

    console.log("Database schema initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize database schema:", error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Run initialization
initDB();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  console.log(`[DEBUG] NODE_ENV: ${process.env.NODE_ENV}`);

  app.use("/api/*", (req, res, next) => {
    console.log(`[API REQUEST] ${req.method} ${req.url}`);
    next();
  });

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    const { method, url } = req;
    
    // Log when request starts
    console.log(`[START] ${method} ${url}`);

    res.on('finish', () => {
      const duration = Date.now() - start;
      if (duration > 1000) {
        console.warn(`[SLOW REQUEST] ${method} ${url} took ${duration}ms - Status: ${res.statusCode}`);
      } else {
        console.log(`[END] ${method} ${url} - ${duration}ms - Status: ${res.statusCode}`);
      }
    });

    // Handle potential hangs by logging if a request takes too long without finishing
    const timeoutLogger = setTimeout(() => {
      if (!res.writableEnded) {
        console.error(`[POTENTIAL HANG] ${method} ${url} has been running for 10s`);
      }
    }, 10000);

    res.on('finish', () => clearTimeout(timeoutLogger));
    res.on('close', () => clearTimeout(timeoutLogger));

    next();
  });

  // Auth Middleware
  // --- Telegram Bot Helper ---
async function sendTelegramMessage(channelId: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !channelId) return;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    const data = await response.json();
    if (!data.ok) {
      console.error('[TELEGRAM ERROR]', data.description);
    }
  } catch (error) {
    console.error('[TELEGRAM FETCH ERROR]', error);
  }
}

function formatPickForTelegram(pick: any, statusUpdate = false) {
  const statusEmoji = {
    pending: '⏳',
    won: '✅',
    lost: '❌',
    void: '🔄'
  }[pick.status as string] || '📌';

  const header = statusUpdate 
    ? `<b>🚨 ACTUALIZACIÓN DE PICK ${statusEmoji}</b>\n\n`
    : `<b>🔥 NUEVO PICK DISPONIBLE ${statusEmoji}</b>\n\n`;

  const date = new Date(pick.match_date).toLocaleString('es-ES', { 
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
  });

  let msg = `${header}`;
  msg += `<b>🏆 Evento:</b> ${pick.match_name}\n`;
  msg += `<b>📅 Fecha:</b> ${date}\n`;
  msg += `<b>⚽ Liga:</b> ${pick.league}\n`;
  msg += `<b>🎯 Pronóstico:</b> ${pick.pick}\n`;
  msg += `<b>📈 Cuota:</b> ${pick.odds}\n`;
  msg += `<b>💰 Stake:</b> ${pick.stake}/10\n`;
  
  if (pick.status !== 'pending') {
    msg += `\n<b>📊 Resultado:</b> ${pick.status.toUpperCase()} ${statusEmoji}\n`;
  }

  if (pick.analysis && !statusUpdate) {
    msg += `\n<b>📝 Análisis:</b>\n<i>${pick.analysis.substring(0, 500)}${pick.analysis.length > 500 ? '...' : ''}</i>\n`;
  }

  msg += `\n🚀 <b>BetRoyale Club</b> - <i>Invirtiendo con Inteligencia</i>`;
  return msg;
}

const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
      console.warn(`[AUTH] No token provided for path: ${req.path}`);
      return res.status(401).json({ error: "No token provided" });
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        if (err.message !== 'jwt expired') {
          console.warn(`[AUTH] Invalid token for path: ${req.path}. Error: ${err.message}`);
        }
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      req.user = user;
      next();
    });
  };

  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    next();
  };

  // --- USER PROFILE API ---
  app.get("/api/user/profile", authenticateToken, async (req: any, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, email, role, vip_until, plan_type, vip_since, initial_bankroll, created_at FROM users WHERE id = ?',
        [req.user.id]
      );
      const users = rows as any[];
      if (users.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
      
      const user = users[0];
      
      // Fetch active subscriptions with more details
      const [subs] = await pool.query(
        'SELECT plan_id, expires_at, amount, payment_method, created_at, periodicity, currency, amount_usd FROM user_subscriptions WHERE user_id = ? AND expires_at > NOW()',
        [req.user.id]
      );
      user.subscriptions = subs;
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Error al obtener perfil" });
    }
  });

  app.put("/api/user/bankroll", authenticateToken, async (req: any, res) => {
    const { initial_bankroll } = req.body;
    try {
      await pool.query('UPDATE users SET initial_bankroll = ? WHERE id = ?', [initial_bankroll, req.user.id]);
      res.json({ message: "Bankroll actualizado exitosamente" });
    } catch (error) {
      console.error("Error updating bankroll:", error);
      res.status(500).json({ error: "Error al actualizar bankroll" });
    }
  });

  // Get User Telegram Links
  app.get("/api/user/telegram-links", authenticateToken, async (req: any, res) => {
    try {
      // Get user's active plans
      const [subs]: any = await pool.query(`
        SELECT pt.name, pt.telegram_invite_link 
        FROM user_subscriptions us
        JOIN pick_types pt ON us.plan_id = pt.slug
        WHERE us.user_id = ? AND us.expires_at > NOW()
      `, [req.user.id]);

      const freeLink = process.env.TELEGRAM_FREE_INVITE_LINK || "#";
      
      res.json({
        free: freeLink,
        vip: subs.map((s: any) => ({ name: s.name, link: s.telegram_invite_link }))
      });
    } catch (error) {
      console.error("Error fetching telegram links:", error);
      res.status(500).json({ error: "Error al obtener links de Telegram" });
    }
  });

  app.get("/api/user/plan-settings", authenticateToken, async (req: any, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT pick_type_id, initial_bankroll FROM user_plan_settings WHERE user_id = ?',
        [req.user.id]
      );
      res.json(rows);
    } catch (error) {
      console.error("Error fetching plan settings:", error);
      res.status(500).json({ error: "Error al obtener configuración de planes" });
    }
  });

  app.put("/api/user/plan-settings", authenticateToken, async (req: any, res) => {
    const { pick_type_id, initial_bankroll } = req.body;
    try {
      await pool.query(
        `INSERT INTO user_plan_settings (user_id, pick_type_id, initial_bankroll) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE initial_bankroll = VALUES(initial_bankroll)`,
        [req.user.id, pick_type_id, initial_bankroll]
      );
      res.json({ message: "Configuración de plan actualizada exitosamente" });
    } catch (error) {
      console.error("Error updating plan settings:", error);
      res.status(500).json({ error: "Error al actualizar configuración de plan" });
    }
  });

  app.get("/api/user/metrics", authenticateToken, async (req: any, res) => {
    try {
      // Get user's vip_since date and initial bankroll
      const [userRows] = await pool.query('SELECT vip_since, initial_bankroll FROM users WHERE id = ?', [req.user.id]);
      const user = (userRows as any[])[0];
      
      if (!user || !user.vip_since) {
        return res.json({ metrics: [], summary: { totalProfit: 0, yield: 0, hitRate: 0, currentBankroll: user?.initial_bankroll || 0 } });
      }

      // Fetch VIP picks since the user became VIP
      const [pickRows] = await pool.query(`
        SELECT match_date as date, status, odds, stake 
        FROM picks 
        WHERE pick_type_id != 1 AND match_date >= ? AND status IN ('won', 'lost', 'half-won', 'half-lost', 'void')
        ORDER BY match_date ASC
      `, [user.vip_since]);
      
      const picks = pickRows as any[];
      let currentBankroll = Number(user.initial_bankroll) || 0;
      let totalStaked = 0;
      let totalProfit = 0;
      let wins = 0;
      let totalResolved = 0;

      // Group by date to create chart data
      const chartDataMap = new Map();

      picks.forEach(pick => {
        const stake = Number(pick.stake) || 1;
        const odds = Number(pick.odds) || 1;
        let profit = 0;

        totalResolved++;
        totalStaked += stake;

        if (pick.status === 'won') {
          profit = stake * (odds - 1);
          wins++;
        } else if (pick.status === 'lost') {
          profit = -stake;
        } else if (pick.status === 'half-won') {
          profit = (stake / 2) * (odds - 1);
          wins += 0.5;
        } else if (pick.status === 'half-lost') {
          profit = -stake / 2;
        }

        totalProfit += profit;
        currentBankroll += profit;

        const dateStr = new Date(pick.date).toISOString().split('T')[0];
        if (!chartDataMap.has(dateStr)) {
          chartDataMap.set(dateStr, { date: dateStr, bankroll: currentBankroll, profit: 0 });
        }
        const dayData = chartDataMap.get(dateStr);
        dayData.bankroll = currentBankroll;
        dayData.profit += profit;
      });

      const metrics = Array.from(chartDataMap.values());
      const yield_pct = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
      const hitRate = totalResolved > 0 ? (wins / totalResolved) * 100 : 0;

      res.json({
        metrics,
        summary: {
          totalProfit,
          yield: yield_pct,
          hitRate,
          currentBankroll
        }
      });

    } catch (error) {
      console.error("Error calculating metrics:", error);
      res.status(500).json({ error: "Error al calcular métricas" });
    }
  });

  // --- AUTH API ---
  app.post("/api/auth/register", async (req, res) => {
    const { email, password } = req.body;
    try {
      if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son requeridos" });
      }
      
      const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if ((existing as any[]).length > 0) {
        return res.status(400).json({ error: "El email ya está registrado" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [result] = await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        [email, hashedPassword, 'user']
      );
      
      const insertId = (result as any).insertId;
      const token = jwt.sign({ id: insertId, email, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });
      
      res.status(201).json({ token, user: { id: insertId, email, role: 'user', subscriptions: [] } });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Error al registrar usuario" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      const users = rows as any[];
      if (users.length === 0) return res.status(401).json({ error: "Credenciales inválidas" });

      const user = users[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) return res.status(401).json({ error: "Credenciales inválidas" });

      // Fetch active subscriptions with more details
      const [subs] = await pool.query(
        'SELECT plan_id, expires_at, amount, payment_method, created_at, periodicity, currency, amount_usd FROM user_subscriptions WHERE user_id = ?',
        [user.id]
      );

      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, email: user.email, role: user.role, subscriptions: subs } });
    } catch (error) {
      res.status(500).json({ error: "Error en el servidor" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    try {
      // Fetch fresh user data to get updated vip_until
      const [rows] = await pool.query('SELECT id, email, role, vip_until, created_at FROM users WHERE id = ?', [req.user.id]);
      const users = rows as any[];
      if (users.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
      
      const user = users[0];

      // Fetch active subscriptions with more details
      const [subs] = await pool.query(
        'SELECT plan_id, expires_at, amount, payment_method, created_at, periodicity, currency, amount_usd FROM user_subscriptions WHERE user_id = ?',
        [req.user.id]
      );
      user.subscriptions = subs;
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Error al obtener perfil" });
    }
  });

  app.put("/api/auth/password", authenticateToken, async (req: any, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
      const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      const users = rows as any[];
      if (users.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

      const validPassword = await bcrypt.compare(currentPassword, users[0].password_hash);
      if (!validPassword) return res.status(401).json({ error: "La contraseña actual es incorrecta" });

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashedNewPassword, req.user.id]);
      
      res.json({ success: true, message: "Contraseña actualizada correctamente" });
    } catch (error) {
      res.status(500).json({ error: "Error al actualizar contraseña" });
    }
  });

  // --- Promo Codes Endpoints ---
  app.get("/api/promo-codes", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const [codes] = await pool.query('SELECT * FROM promo_codes ORDER BY created_at DESC');
      res.json(codes);
    } catch (error) {
      res.status(500).json({ error: "Error al obtener códigos de descuento" });
    }
  });

  app.post("/api/promo-codes", authenticateToken, requireAdmin, async (req, res) => {
    const { code, discount_percentage, max_uses, valid_until } = req.body;
    try {
      await pool.query(
        'INSERT INTO promo_codes (code, discount_percentage, max_uses, valid_until) VALUES (?, ?, ?, ?)',
        [code.toUpperCase(), discount_percentage, max_uses || null, valid_until || null]
      );
      res.json({ success: true });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: "El código ya existe" });
      }
      res.status(500).json({ error: "Error al crear código de descuento" });
    }
  });

  app.delete("/api/promo-codes/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
      await pool.query('DELETE FROM promo_codes WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error al eliminar código de descuento" });
    }
  });

  app.post("/api/promo-codes/validate", authenticateToken, async (req, res) => {
    const { code } = req.body;
    try {
      const [rows] = await pool.query('SELECT * FROM promo_codes WHERE code = ?', [code.toUpperCase()]);
      const codes = rows as any[];
      
      if (codes.length === 0) {
        return res.status(404).json({ error: "Código inválido" });
      }
      
      const promo = codes[0];
      
      if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
        return res.status(400).json({ error: "El código ha alcanzado su límite de uso" });
      }
      
      if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
        return res.status(400).json({ error: "El código ha expirado" });
      }
      
      res.json({ discount_percentage: promo.discount_percentage, id: promo.id, code: promo.code });
    } catch (error) {
      res.status(500).json({ error: "Error al validar código" });
    }
  });

  // --- USERS API (Admin Only) ---
  app.get("/api/users", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const [users] = await pool.query(`
        SELECT u.id, u.email, u.role, u.vip_until, u.created_at, 
               s.plan_id, s.expires_at, s.amount, s.payment_method, s.created_at as sub_created_at, s.periodicity, s.currency, s.amount_usd
        FROM users u
        LEFT JOIN user_subscriptions s ON u.id = s.user_id
        ORDER BY u.created_at DESC
      `);
      
      const usersMap = new Map();
      (users as any[]).forEach(row => {
        if (!usersMap.has(row.id)) {
          usersMap.set(row.id, {
            id: row.id,
            email: row.email,
            role: row.role,
            vip_until: row.vip_until,
            created_at: row.created_at,
            subscriptions: []
          });
        }
        if (row.plan_id) {
          usersMap.get(row.id).subscriptions.push({
            plan_id: row.plan_id,
            expires_at: row.expires_at,
            amount: row.amount,
            payment_method: row.payment_method,
            created_at: row.sub_created_at,
            periodicity: row.periodicity,
            currency: row.currency,
            amount_usd: row.amount_usd
          });
        }
      });
      
      res.json(Array.from(usersMap.values()));
    } catch (error) {
      res.status(500).json({ error: "Error al obtener usuarios" });
    }
  });

  app.put("/api/users/:id/vip", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { days } = req.body;
    
    try {
      const [userRows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
      const user = (userRows as any[])[0];
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      let newVipUntil = new Date();
      if (user.vip_until && new Date(user.vip_until) > new Date()) {
        newVipUntil = new Date(user.vip_until);
      }
      newVipUntil.setDate(newVipUntil.getDate() + (days || 30));
      
      const formattedDate = newVipUntil.toISOString().slice(0, 19).replace('T', ' ');

      await pool.query("UPDATE users SET role = 'vip', vip_until = ? WHERE id = ?", [formattedDate, id]);
      res.json({ message: "Suscripción VIP actualizada", vip_until: formattedDate });
    } catch (error) {
      res.status(500).json({ error: "Error al actualizar suscripción" });
    }
  });

  app.delete("/api/users/:id/vip", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query("UPDATE users SET role = 'user', vip_until = NULL WHERE id = ?", [id]);
      res.json({ message: "Suscripción VIP cancelada" });
    } catch (error) {
      res.status(500).json({ error: "Error al cancelar suscripción" });
    }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Backend is running and ready for MySQL" });
  });

  // Test Database Connection Endpoint
  app.get("/api/test-db", async (req, res) => {
    try {
      await initDB(); // Re-run initialization to ensure schema is correct
      res.json({ status: "success", message: "¡Conexión a la base de datos exitosa y esquema verificado!" });
    } catch (error: any) {
      console.error("Database connection error:", error);
      res.status(500).json({ 
        status: "error", 
        message: "Error conectando a la base de datos", 
        details: error.message,
        hint: "Si el error es 'ETIMEDOUT' o 'Access denied', asegúrate de haber habilitado el 'MySQL Remoto' en Hostinger para la IP de este servidor (o usando '%' temporalmente) y que el DB_HOST sea correcto (a veces es la IP del servidor en lugar del dominio)."
      });
    }
  });

  // Get Markets
  app.get("/api/markets", async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM markets ORDER BY id');
      res.json(rows);
    } catch (error) {
      console.error("Error fetching markets:", error);
      res.status(500).json({ error: "Failed to fetch markets" });
    }
  });

  // Create Market
  app.post("/api/markets", authenticateToken, requireAdmin, async (req, res) => {
    const { label, acronym } = req.body;
    if (!label || !acronym) return res.status(400).json({ error: "Faltan campos" });
    try {
      // Check if market already exists (using acronym as id)
      const id = acronym.trim();
      const [existing]: any = await pool.query('SELECT id FROM markets WHERE id = ?', [id]);
      if (existing.length > 0) {
        return res.status(400).json({ error: "El mercado ya existe" });
      }
      await pool.query('INSERT INTO markets (id, label, acronym) VALUES (?, ?, ?)', [id, label, acronym]);
      res.status(201).json({ id, message: "Mercado creado" });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "El mercado ya existe" });
      console.error("Error creating market:", error);
      res.status(500).json({ error: "Error al crear mercado" });
    }
  });

  // Update Market
  app.put("/api/markets/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { label, acronym } = req.body;
    if (!label || !acronym) return res.status(400).json({ error: "Faltan campos" });
    try {
      // Check if another market with the same acronym already exists
      const newId = acronym.trim();
      if (newId !== id) {
        const [existing]: any = await pool.query('SELECT id FROM markets WHERE id = ?', [newId]);
        if (existing.length > 0) {
          return res.status(400).json({ error: "El mercado ya existe" });
        }
      }
      await pool.query('UPDATE markets SET id = ?, label = ?, acronym = ? WHERE id = ?', [newId, label, acronym, id]);
      res.json({ message: "Mercado actualizado" });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "El mercado ya existe" });
      console.error("Error updating market:", error);
      res.status(500).json({ error: "Error al actualizar mercado" });
    }
  });

  // Delete Market
  app.delete("/api/markets/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM markets WHERE id = ?', [id]);
      res.json({ message: "Mercado eliminado" });
    } catch (error) {
      console.error("Error deleting market:", error);
      res.status(500).json({ error: "Error al eliminar mercado" });
    }
  });

  // --- COUNTRIES API ---
  // Get Countries
  app.get("/api/countries", async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM countries ORDER BY id DESC');
      res.json(rows);
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ error: "Failed to fetch countries" });
    }
  });

  // Create Country
  app.post("/api/countries", authenticateToken, requireAdmin, async (req, res) => {
    const { name, flag } = req.body;
    if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
    try {
      // Check if country already exists
      const [existing]: any = await pool.query('SELECT id FROM countries WHERE name = ?', [name]);
      if (existing.length > 0) {
        return res.status(400).json({ error: "El país ya existe" });
      }
      const [result] = await pool.query('INSERT INTO countries (name, flag) VALUES (?, ?)', [name, flag || null]);
      res.status(201).json({ id: (result as any).insertId, message: "País creado" });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "El país ya existe" });
      console.error("Error creating country:", error);
      res.status(500).json({ error: "Error al crear país" });
    }
  });

  // Update Country
  app.put("/api/countries/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, flag } = req.body;
    if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
    try {
      // Check if another country with the same name already exists
      const [existing]: any = await pool.query('SELECT id FROM countries WHERE name = ? AND id != ?', [name, id]);
      if (existing.length > 0) {
        return res.status(400).json({ error: "El país ya existe" });
      }
      await pool.query('UPDATE countries SET name = ?, flag = ? WHERE id = ?', [name, flag || null, id]);
      res.json({ message: "País actualizado" });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "El país ya existe" });
      console.error("Error updating country:", error);
      res.status(500).json({ error: "Error al actualizar país" });
    }
  });

  // Delete Country
  app.delete("/api/countries/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM countries WHERE id = ?', [id]);
      res.json({ message: "País eliminado" });
    } catch (error: any) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ error: "No se puede eliminar porque hay ligas asociadas a este país" });
      console.error("Error deleting country:", error);
      res.status(500).json({ error: "Error al eliminar país" });
    }
  });

  // --- LEAGUES API ---
  // Get Leagues
  app.get("/api/leagues", async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT l.*, c.name as country_name 
        FROM leagues l 
        LEFT JOIN countries c ON l.country_id = c.id 
        ORDER BY l.id DESC
      `);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching leagues:", error);
      res.status(500).json({ error: "Failed to fetch leagues" });
    }
  });

  // Create League
  app.post("/api/leagues", authenticateToken, requireAdmin, async (req, res) => {
    const { name, country_id } = req.body;
    const finalCountryId = country_id && country_id !== "" ? parseInt(country_id.toString()) : null;
    console.log(`Creating league: ${name}, country_id: ${finalCountryId}`);
    if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
    try {
      // Check if league already exists in this country
      const query = finalCountryId 
        ? 'SELECT id FROM leagues WHERE name = ? AND country_id = ?'
        : 'SELECT id FROM leagues WHERE name = ? AND country_id IS NULL';
      const params = finalCountryId ? [name, finalCountryId] : [name];
      
      const [existing]: any = await pool.query(query, params);
      if (existing.length > 0) {
        return res.status(400).json({ error: "La liga ya existe en este país" });
      }
      const [result] = await pool.query('INSERT INTO leagues (name, country_id) VALUES (?, ?)', [name, finalCountryId]);
      res.status(201).json({ id: (result as any).insertId, message: "Liga creada" });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "La liga ya existe en este país" });
      console.error("Error creating league:", error);
      res.status(500).json({ error: "Error al crear liga" });
    }
  });

  // Update League
  app.put("/api/leagues/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, country_id } = req.body;
    const finalCountryId = country_id && country_id !== "" ? parseInt(country_id.toString()) : null;
    console.log(`Updating league ${id}: ${name}, country_id: ${finalCountryId}`);
    if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
    try {
      // Check if another league with the same name already exists in this country
      const query = finalCountryId 
        ? 'SELECT id FROM leagues WHERE name = ? AND country_id = ? AND id != ?'
        : 'SELECT id FROM leagues WHERE name = ? AND country_id IS NULL AND id != ?';
      const params = finalCountryId ? [name, finalCountryId, id] : [name, id];

      const [existing]: any = await pool.query(query, params);
      if (existing.length > 0) {
        return res.status(400).json({ error: "La liga ya existe en este país" });
      }
      await pool.query('UPDATE leagues SET name = ?, country_id = ? WHERE id = ?', [name, finalCountryId, id]);
      res.json({ message: "Liga actualizada" });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "La liga ya existe en este país" });
      console.error("Error updating league:", error);
      res.status(500).json({ error: "Error al actualizar liga" });
    }
  });

  // Delete League
  app.delete("/api/leagues/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM leagues WHERE id = ?', [id]);
      res.json({ message: "Liga eliminada" });
    } catch (error: any) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ error: "No se puede eliminar porque hay picks asociados a esta liga" });
      console.error("Error deleting league:", error);
      res.status(500).json({ error: "Error al eliminar liga" });
    }
  });

  // Bulk Delete Leagues
  app.post("/api/leagues/bulk-delete", authenticateToken, requireAdmin, async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "IDs inválidos" });
    try {
      await pool.query('DELETE FROM leagues WHERE id IN (?)', [ids]);
      res.json({ message: "Ligas eliminadas" });
    } catch (error: any) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ error: "No se pueden eliminar algunas ligas porque tienen picks asociados" });
      console.error("Error deleting leagues:", error);
      res.status(500).json({ error: "Error al eliminar ligas" });
    }
  });

  // Bulk Delete Countries
  app.post("/api/countries/bulk-delete", authenticateToken, requireAdmin, async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "IDs inválidos" });
    try {
      await pool.query('DELETE FROM countries WHERE id IN (?)', [ids]);
      res.json({ message: "Países eliminados" });
    } catch (error: any) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ error: "No se pueden eliminar algunos países porque tienen ligas asociadas" });
      console.error("Error deleting countries:", error);
      res.status(500).json({ error: "Error al eliminar países" });
    }
  });

  // --- PICKS API ---

  // Get pick types
  app.get("/api/pick-types", async (req, res) => {
    try {
      const [types] = await pool.query("SELECT * FROM pick_types ORDER BY id ASC");
      res.json(types);
    } catch (error) {
      res.status(500).json({ error: "Error al obtener tipos de pick" });
    }
  });

  // Get all picks
  app.get("/api/picks", async (req, res) => {
    console.log("[DEBUG] /api/picks route hit");
    try {
      const [picks] = await pool.query(`
        SELECT p.*, pt.slug as pick_type_slug, pt.name as pick_type_name,
               m.label as market_label, m.acronym as market_acronym,
               COALESCE(l.name, p.league) as league_name,
               c.flag as country_flag
        FROM picks p 
        LEFT JOIN pick_types pt ON p.pick_type_id = pt.id 
        LEFT JOIN markets m ON p.pick = m.id
        LEFT JOIN leagues l ON p.league_id = l.id
        LEFT JOIN countries c ON l.country_id = c.id
        ORDER BY p.match_date DESC
      `);
      
      const [tracking] = await pool.query(`SELECT * FROM pick_tracking ORDER BY created_at ASC`);
      
      const [leagues] = await pool.query(`SELECT id, name FROM leagues`);
      const [markets] = await pool.query(`SELECT id, label, acronym FROM markets`);
      
      const picksWithTracking = (picks as any[]).map(p => {
        // Force UTC interpretation so the browser shows it in the user's local time
        const dateObj = p.match_date instanceof Date ? p.match_date : new Date(p.match_date + 'Z');
        
        let parsedSelections = [];
        if (p.selections) {
          if (typeof p.selections === 'string') {
            try {
              parsedSelections = JSON.parse(p.selections);
            } catch (e) {
              console.error("Error parsing selections:", e);
            }
          } else if (Array.isArray(p.selections)) {
            parsedSelections = p.selections;
          }
          
          // Populate league_name and market_label for each selection
          parsedSelections = parsedSelections.map((sel: any) => {
            const league = (leagues as any[]).find(l => l.id.toString() === sel.league_id?.toString());
            const market = (markets as any[]).find(m => m.id.toString() === sel.pick?.toString());
            return {
              ...sel,
              league_name: league ? league.name : sel.league_id,
              market_label: market ? market.label : sel.pick,
              market_acronym: market ? market.acronym : ''
            };
          });
        }

        return {
          ...p,
          match_date: dateObj.toISOString(),
          selections: parsedSelections,
          tracking: (tracking as any[]).filter(t => t.pick_id === p.id)
        };
      });
      
      res.json(picksWithTracking);
    } catch (error: any) {
      console.error("Error fetching picks:", error);
      res.status(500).json({ error: "Error al obtener los picks" });
    }
  });

  // Create a new pick
  app.post("/api/picks", authenticateToken, requireAdmin, async (req, res) => {
    const { match_date, league_id, match_name, pick, odds, stake, pick_type_id, analysis, is_parlay, selections } = req.body;
    
    if (is_parlay) {
      if (!match_date || !odds || !stake || !pick_type_id || !selections || selections.length === 0) {
        return res.status(400).json({ error: "Faltan campos obligatorios para el parlay" });
      }
    } else {
      if (!match_date || !league_id || !match_name || !pick || !odds || !stake || !pick_type_id) {
        return res.status(400).json({ error: "Faltan campos obligatorios" });
      }
    }

    try {
      // Get the slug for the pick_type_id
      const [types]: any = await pool.query("SELECT slug FROM pick_types WHERE id = ?", [pick_type_id]);
      const pickTypeSlug = types.length > 0 ? types[0].slug : 'free';

      // match_date comes from Colombia (UTC-5)
      // Example: "2026-03-24T15:00" -> "2026-03-24T15:00:00-05:00"
      const colDate = new Date(match_date + ":00-05:00");
      const formattedDate = colDate.toISOString().slice(0, 19).replace('T', ' '); // UTC string for MySQL

      const [result] = await pool.query(
        "INSERT INTO picks (match_date, league_id, match_name, pick, odds, stake, pick_type_id, analysis, is_parlay, selections, league, pick_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          formattedDate, 
          is_parlay ? null : league_id, 
          is_parlay ? 'Parlay' : match_name, 
          is_parlay ? 'Parlay' : pick, 
          odds, 
          stake, 
          pick_type_id, 
          analysis || null,
          is_parlay ? true : false,
          is_parlay ? JSON.stringify(selections) : null,
          is_parlay ? 'Parlay' : '', // league is required in original schema, though we added league_id
          pickTypeSlug
        ]
      );

      // Telegram Notification
      try {
        const [typeRows]: any = await pool.query("SELECT telegram_channel_id FROM pick_types WHERE id = ?", [pick_type_id]);
        const channelId = typeRows[0]?.telegram_channel_id || (pickTypeSlug === 'free' ? process.env.TELEGRAM_FREE_CHANNEL_ID : null);
        
        if (channelId) {
          const telegramMsg = formatPickForTelegram({ 
            match_date: formattedDate, 
            match_name: is_parlay ? 'Parlay' : match_name, 
            league: is_parlay ? 'Parlay' : '', 
            pick: is_parlay ? 'Parlay' : pick, 
            odds, 
            stake, 
            analysis, 
            status: 'pending' 
          });
          await sendTelegramMessage(channelId, telegramMsg);
        }
      } catch (tgErr) {
        console.error('[PICK CREATE TG ERROR]', tgErr);
      }

      res.status(201).json({ id: (result as any).insertId, message: "Pick creado exitosamente" });
    } catch (error: any) {
      console.error("Error creating pick:", error);
      res.status(500).json({ error: "Error al crear el pick", details: error.message });
    }
  });

  // Add tracking to a pick
  app.post("/api/picks/:id/tracking", authenticateToken, requireAdmin, async (req, res) => {
    const { message } = req.body;
    const pickId = req.params.id;
    
    if (!message) return res.status(400).json({ error: "El mensaje es obligatorio" });

    try {
      const [result] = await pool.query(
        "INSERT INTO pick_tracking (pick_id, message) VALUES (?, ?)",
        [pickId, message]
      );
      res.status(201).json({ id: (result as any).insertId, message: "Seguimiento añadido" });
    } catch (error: any) {
      res.status(500).json({ error: "Error al añadir seguimiento", details: error.message });
    }
  });

  // Update a pick
  app.put("/api/picks/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { match_date, league_id, match_name, pick, odds, stake, pick_type_id, analysis, is_parlay, selections } = req.body;
    
    if (is_parlay) {
      if (!match_date || !odds || !stake || !pick_type_id || !selections || selections.length === 0) {
        return res.status(400).json({ error: "Faltan campos obligatorios para el parlay" });
      }
    } else {
      if (!match_date || !league_id || !match_name || !pick || !odds || !stake || !pick_type_id) {
        return res.status(400).json({ error: "Faltan campos obligatorios" });
      }
    }

    try {
      // Get the slug for the pick_type_id
      const [types]: any = await pool.query("SELECT slug FROM pick_types WHERE id = ?", [pick_type_id]);
      const pickTypeSlug = types.length > 0 ? types[0].slug : 'free';

      const colDate = new Date(match_date + ":00-05:00");
      const formattedDate = colDate.toISOString().slice(0, 19).replace('T', ' ');

      await pool.query(
        "UPDATE picks SET match_date = ?, league_id = ?, match_name = ?, pick = ?, odds = ?, stake = ?, pick_type_id = ?, analysis = ?, is_parlay = ?, selections = ?, league = ?, pick_type = ? WHERE id = ?",
        [
          formattedDate, 
          is_parlay ? null : league_id, 
          is_parlay ? 'Parlay' : match_name, 
          is_parlay ? 'Parlay' : pick, 
          odds, 
          stake, 
          pick_type_id, 
          analysis || null,
          is_parlay ? true : false,
          is_parlay ? JSON.stringify(selections) : null,
          is_parlay ? 'Parlay' : '',
          pickTypeSlug,
          id
        ]
      );

      // Telegram Notification on Update
      try {
        const [pickRows]: any = await pool.query("SELECT * FROM picks WHERE id = ?", [id]);
        const updatedPick = pickRows[0];
        const [typeRows]: any = await pool.query("SELECT telegram_channel_id FROM pick_types WHERE id = ?", [updatedPick.pick_type_id]);
        const channelId = typeRows[0]?.telegram_channel_id || (updatedPick.pick_type === 'free' ? process.env.TELEGRAM_FREE_CHANNEL_ID : null);
        
        if (channelId) {
          const telegramMsg = formatPickForTelegram(updatedPick, true);
          await sendTelegramMessage(channelId, telegramMsg);
        }
      } catch (tgErr) {
        console.error('[PICK UPDATE TG ERROR]', tgErr);
      }

      res.json({ message: "Pick actualizado exitosamente" });
    } catch (error: any) {
      console.error("Error updating pick:", error);
      res.status(500).json({ error: "Error al actualizar el pick", details: error.message });
    }
  });

  // Update pick status
  app.patch("/api/picks/:id/status", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'won', 'lost', 'void', 'pending'
    
    try {
      await pool.query("UPDATE picks SET status = ? WHERE id = ?", [status, id]);

      // Telegram Notification on Status Update
      try {
        const [pickRows]: any = await pool.query("SELECT * FROM picks WHERE id = ?", [id]);
        const updatedPick = pickRows[0];
        const [typeRows]: any = await pool.query("SELECT telegram_channel_id FROM pick_types WHERE id = ?", [updatedPick.pick_type_id]);
        const channelId = typeRows[0]?.telegram_channel_id || (updatedPick.pick_type === 'free' ? process.env.TELEGRAM_FREE_CHANNEL_ID : null);
        
        if (channelId) {
          const telegramMsg = formatPickForTelegram(updatedPick, true);
          await sendTelegramMessage(channelId, telegramMsg);
        }
      } catch (tgErr) {
        console.error('[PICK STATUS TG ERROR]', tgErr);
      }

      res.json({ message: "Estado actualizado exitosamente" });
    } catch (error: any) {
      console.error("Error updating pick status:", error);
      res.status(500).json({ error: "Error al actualizar el estado" });
    }
  });

  // Bulk update pick status
  app.patch("/api/picks/bulk/status", authenticateToken, requireAdmin, async (req, res) => {
    const { pickIds, status } = req.body;
    if (!pickIds || !Array.isArray(pickIds) || pickIds.length === 0) {
      return res.status(400).json({ error: "No se proporcionaron IDs válidos" });
    }
    
    try {
      const placeholders = pickIds.map(() => '?').join(',');
      await pool.query(`UPDATE picks SET status = ? WHERE id IN (${placeholders})`, [status, ...pickIds]);
      res.json({ message: "Estados actualizados exitosamente" });
    } catch (error: any) {
      console.error("Error bulk updating pick status:", error);
      res.status(500).json({ error: "Error al actualizar los estados" });
    }
  });

  // Delete a pick
  app.delete("/api/picks/:id", authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query("DELETE FROM picks WHERE id = ?", [id]);
      res.json({ message: "Pick eliminado exitosamente" });
    } catch (error: any) {
      console.error("Error deleting pick:", error);
      res.status(500).json({ error: "Error al eliminar el pick" });
    }
  });

  // Bulk delete picks
  app.post("/api/picks/bulk/delete", authenticateToken, requireAdmin, async (req, res) => {
    const { pickIds } = req.body;
    if (!pickIds || !Array.isArray(pickIds) || pickIds.length === 0) {
      return res.status(400).json({ error: "No se proporcionaron IDs válidos" });
    }
    
    try {
      const placeholders = pickIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM picks WHERE id IN (${placeholders})`, pickIds);
      res.json({ message: "Picks eliminados exitosamente" });
    } catch (error: any) {
      console.error("Error bulk deleting picks:", error);
      res.status(500).json({ error: "Error al eliminar los picks" });
    }
  });

// Cache for exchange rate
let cachedRate: { rate: number; timestamp: number } | null = null;

async function getExchangeRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate && now - cachedRate.timestamp < 3600000) { // 1 hour cache
    return cachedRate.rate;
  }
  try {
    // Using a free exchange rate API with a 5s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal
    });
    const data = await response.json() as any;
    clearTimeout(timeoutId);
    
    const rate = data.rates.COP;
    cachedRate = { rate, timestamp: now };
    return rate;
  } catch (error) {
    console.error("Error fetching exchange rate, using fallback:", error);
    return 4000; // Fallback rate
  }
}

// --- PAYMENT API ---
  app.post("/api/payments/mercadopago", authenticateToken, async (req: any, res) => {
    const { title, description, quantity, unit_price, planId, period, promoCode, origin: frontendOrigin } = req.body;
    
    // Re-initialize with latest env vars to avoid stale secrets
    const currentToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    const mpClient = new MercadoPagoConfig({ accessToken: currentToken });
    
    try {
      const rate = await getExchangeRate();
      const priceCOP = Math.round(unit_price * rate);

      console.log(`[PAYMENT] Creating preference. Token Prefix: ${currentToken.substring(0, 5)}...`);
      
      if (!currentToken) {
        throw new Error("MERCADOPAGO_ACCESS_TOKEN no configurado en los Secrets.");
      }

      if (!process.env.APP_URL) {
        throw new Error("APP_URL no configurado en los Secrets.");
      }
      const cleanAppUrl = process.env.APP_URL.replace(/\/$/, '');

      const externalReference = `sub:${req.user.id}:${planId}:${period}${promoCode ? `:${promoCode}` : ''}`;

      const preference = new Preference(mpClient);
      const result = await preference.create({
        body: {
          items: [{ 
            id: planId, 
            title: title || `Suscripción VIP ${planId}`, 
            description: description || `Plan ${planId} - ${period}`, 
            quantity: Number(quantity) || 1, 
            unit_price: priceCOP, 
            currency_id: 'COP' 
          }],
          payer: {
            email: req.user.email,
          },
          payment_methods: {
            excluded_payment_types: [],
            excluded_payment_methods: [],
            installments: 12,
          },
          external_reference: externalReference,
          notification_url: `${cleanAppUrl}/api/payments/webhook`,
          back_urls: {
            success: `${cleanAppUrl}/payment-return`,
            failure: `${cleanAppUrl}/payment-return`,
            pending: `${cleanAppUrl}/payment-return`
          },
          auto_return: "approved",
          binary_mode: true,
          statement_descriptor: "BETROYALE VIP"
        },
      });
      
      console.log('[PAYMENT] Preference created:', result.id);
      res.json({ 
        id: result.id,
        init_point: result.init_point,
        sandbox_init_point: result.sandbox_init_point
      });
    } catch (error: any) {
      console.error("Mercado Pago error:", error);
      res.status(500).json({ error: error.message || "Error al crear pago con Mercado Pago" });
    }
  });

  // Sync Payment
  app.get("/api/payments/sync", authenticateToken, async (req: any, res) => {
    const { payment_id } = req.query;
    if (!payment_id) return res.status(400).json({ error: "Falta payment_id" });
    
    const currentToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    const mpClient = new MercadoPagoConfig({ accessToken: currentToken });
    
    try {
      const paymentClient = new Payment(mpClient);
      const payment = await paymentClient.get({ id: payment_id.toString() });

      if ((payment.status === 'approved' || payment.status === 'authorized') && payment.external_reference) {
        const extRef = typeof payment.external_reference === 'string' ? payment.external_reference : '';
        const [_, userId, planId, period] = extRef.split(':');
        
        if (userId !== req.user.id.toString()) {
          return res.status(403).json({ error: "Este pago no pertenece a tu cuenta" });
        }
        
        const actualPeriod = period || 'mensual';
        let days = 30;
        if (actualPeriod === 'trimestral') days = 90;
        else if (actualPeriod === 'semestral') days = 180;
        else if (actualPeriod === 'anual') days = 365;
        
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
        const formattedExpiresAt = newExpiresAt.toISOString().slice(0, 19).replace('T', ' ');
        const amount = payment.transaction_amount;
        const currency = payment.currency_id;
        const rate = await getExchangeRate();
        const amount_usd = (amount / rate).toFixed(2);
        const paymentMethod = payment.payment_method_id;

        const [subRows]: any = await pool.query(
          "SELECT id FROM user_subscriptions WHERE user_id = ? AND plan_id = ?",
          [userId, planId]
        );

        if (subRows.length > 0) {
          await pool.query(
            "UPDATE user_subscriptions SET expires_at = ?, amount = ?, payment_method = ?, periodicity = ?, currency = ?, amount_usd = ? WHERE id = ?",
            [formattedExpiresAt, amount, paymentMethod, actualPeriod, currency, amount_usd, subRows[0].id]
          );
        } else {
          await pool.query(
            "INSERT INTO user_subscriptions (user_id, plan_id, expires_at, amount, payment_method, periodicity, currency, amount_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [userId, planId, formattedExpiresAt, amount, paymentMethod, actualPeriod, currency, amount_usd]
          );
        }

        const [allSubs]: any = await pool.query(
          "SELECT MAX(expires_at) as max_expires FROM user_subscriptions WHERE user_id = ?",
          [userId]
        );
        const maxExpires = allSubs[0].max_expires;
        const formattedMaxExpires = new Date(maxExpires).toISOString().slice(0, 19).replace('T', ' ');

        await pool.query(
          "UPDATE users SET role = 'vip', vip_until = ?, plan_type = ?, vip_since = COALESCE(vip_since, NOW()) WHERE id = ?",
          [formattedMaxExpires, planId, userId]
        );

        console.log(`[SYNC SUCCESS] User ${userId} updated`);
        return res.json({ success: true, message: "Suscripción activada" });
      }
      res.json({ success: false, status: payment.status, message: `Estado: ${payment.status}` });
    } catch (error: any) {
      console.error("[SYNC ERROR]", error);
      res.status(500).json({ error: "Error al sincronizar: " + error.message });
    }
  });

  // Webhook
  app.post("/api/payments/webhook", async (req: any, res) => {
    res.status(200).send("OK");
    try {
      const { query, body } = req;
      const topic = query.topic || query.type || body.type || body.topic;
      const id = query.id || query['data.id'] || (body.data && body.data.id) || body.id;
      if (!id) return;

      const mpClient = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || "" });
      const paymentClient = new Payment(mpClient);
      const payment = await paymentClient.get({ id: String(id) });
      if (payment.status === "approved" && payment.external_reference) {
        console.log(`[WEBHOOK] Pago aprobado: ${id}, Ref: ${payment.external_reference}`);
        const extRef = typeof payment.external_reference === 'string' ? payment.external_reference : '';
        const [_, userId, planId, period, promoCode] = extRef.split(':');
        
        const actualPeriod = period || 'mensual';
        let days = 30;
        if (actualPeriod === 'trimestral') days = 90;
        else if (actualPeriod === 'semestral') days = 180;
        else if (actualPeriod === 'anual') days = 365;
        
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + days);
        const formattedExpiresAt = newExpiresAt.toISOString().slice(0, 19).replace('T', ' ');
        const amount = payment.transaction_amount;
        const currency = payment.currency_id;
        const rate = await getExchangeRate();
        const amount_usd = (amount / rate).toFixed(2);
        const paymentMethod = payment.payment_method_id;

        const [subRows]: any = await pool.query(
          "SELECT id FROM user_subscriptions WHERE user_id = ? AND plan_id = ?",
          [userId, planId]
        );

        if (subRows.length > 0) {
          await pool.query(
            "UPDATE user_subscriptions SET expires_at = ?, amount = ?, payment_method = ?, periodicity = ?, currency = ?, amount_usd = ? WHERE id = ?",
            [formattedExpiresAt, amount, paymentMethod, actualPeriod, currency, amount_usd, subRows[0].id]
          );
        } else {
          await pool.query(
            "INSERT INTO user_subscriptions (user_id, plan_id, expires_at, amount, payment_method, periodicity, currency, amount_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [userId, planId, formattedExpiresAt, amount, paymentMethod, actualPeriod, currency, amount_usd]
          );
        }

        const [allSubs]: any = await pool.query(
          "SELECT MAX(expires_at) as max_expires FROM user_subscriptions WHERE user_id = ?",
          [userId]
        );
        const maxExpires = allSubs[0].max_expires;
        const formattedMaxExpires = new Date(maxExpires).toISOString().slice(0, 19).replace('T', ' ');

        await pool.query(
          "UPDATE users SET role = 'vip', vip_until = ?, plan_type = ?, vip_since = COALESCE(vip_since, NOW()) WHERE id = ?",
          [formattedMaxExpires, planId, userId]
        );

        if (promoCode) {
          await pool.query(
            "UPDATE promo_codes SET current_uses = current_uses + 1 WHERE code = ?",
            [promoCode]
          );
        }
        console.log(`[WEBHOOK SUCCESS] User ${userId} updated`);
      }
    } catch (e) {
      console.error("Webhook error", e);
    }
  });

  // --- STATS ENDPOINTS ---
  
  // Public performance stats
  app.get("/api/stats/performance", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = "";
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = " AND p.match_date >= ? AND p.match_date <= ?";
        params.push(startDate, endDate);
      }

      // Get all resolved picks with their type
      const [picks]: any = await pool.query(`
        SELECT p.status, p.stake, p.odds, pt.slug as pick_type_slug 
        FROM picks p 
        LEFT JOIN pick_types pt ON p.pick_type_id = pt.id 
        WHERE p.status IN ('won', 'lost', 'void') ${dateFilter}
      `, params);

      const statsByPlan: any = {
        all: { totalPicks: 0, won: 0, lost: 0, voided: 0, profit: 0, totalStaked: 0 }
      };

      picks.forEach((pick: any) => {
        const stake = Number(pick.stake) || 0;
        const odds = Number(pick.odds) || 1;
        const plan = pick.pick_type_slug || 'free';

        if (!statsByPlan[plan]) {
          statsByPlan[plan] = { totalPicks: 0, won: 0, lost: 0, voided: 0, profit: 0, totalStaked: 0 };
        }

        // Update global
        statsByPlan.all.totalPicks++;
        // Update plan
        statsByPlan[plan].totalPicks++;

        if (pick.status === 'won') {
          statsByPlan.all.won++;
          statsByPlan.all.totalStaked += stake;
          statsByPlan.all.profit += stake * (odds - 1);

          statsByPlan[plan].won++;
          statsByPlan[plan].totalStaked += stake;
          statsByPlan[plan].profit += stake * (odds - 1);
        } else if (pick.status === 'lost') {
          statsByPlan.all.lost++;
          statsByPlan.all.totalStaked += stake;
          statsByPlan.all.profit -= stake;

          statsByPlan[plan].lost++;
          statsByPlan[plan].totalStaked += stake;
          statsByPlan[plan].profit -= stake;
        } else if (pick.status === 'void') {
          statsByPlan.all.voided++;
          statsByPlan[plan].voided++;
        }
      });

      // Calculate hitRate and yield for all
      for (const key in statsByPlan) {
        const s = statsByPlan[key];
        s.hitRate = (s.won + s.lost) > 0 ? ((s.won / (s.won + s.lost)) * 100).toFixed(2) : "0.00";
        s.yield = s.totalStaked > 0 ? ((s.profit / s.totalStaked) * 100).toFixed(2) : "0.00";
        s.profit = s.profit.toFixed(2);
      }

      res.json(statsByPlan);
    } catch (error) {
      console.error("Error fetching performance stats:", error);
      res.status(500).json({ error: "Error fetching performance stats" });
    }
  });

  app.get("/api/stats/monthly-yield", async (req, res) => {
    try {
      // Get monthly yield for the last 6 months
      const [rows]: any = await pool.query(`
        SELECT 
          DATE_FORMAT(match_date, '%Y-%m') as month,
          SUM(CASE 
            WHEN status = 'won' THEN stake * (odds - 1)
            WHEN status = 'lost' THEN -stake
            ELSE 0 
          END) as profit,
          SUM(CASE 
            WHEN status IN ('won', 'lost') THEN stake
            ELSE 0 
          END) as total_staked
        FROM picks
        WHERE status IN ('won', 'lost', 'void')
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
      `);

      const monthlyData = rows.reverse().map((row: any) => {
        const profit = Number(row.profit) || 0;
        const totalStaked = Number(row.total_staked) || 0;
        return {
          month: row.month,
          yield: totalStaked > 0 ? Number(((profit / totalStaked) * 100).toFixed(2)) : 0,
          profit: Number(profit.toFixed(2))
        };
      });

      res.json(monthlyData);
    } catch (error) {
      console.error("Error fetching monthly yield:", error);
      res.status(500).json({ error: "Error fetching monthly yield" });
    }
  });

  // Admin revenue stats
  app.get("/api/stats/revenue", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = "";
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = " WHERE created_at >= ? AND created_at <= ?";
        params.push(startDate, endDate);
      }

      // Revenue by day grouped by plan
      const [revenueByDay]: any = await pool.query(`
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m-%d') as date,
          plan_id,
          SUM(amount) as total_cop,
          SUM(amount_usd) as total_usd
        FROM user_subscriptions
        ${dateFilter}
        GROUP BY date, plan_id
        ORDER BY date ASC
      `, params);

      // Plan distribution (active plans) - usually we want current active, but if filtered, maybe active in that period?
      // Let's keep it as current active plans, it's a snapshot.
      const [planDistribution]: any = await pool.query(`
        SELECT plan_id, COUNT(*) as count
        FROM user_subscriptions
        WHERE expires_at > NOW()
        GROUP BY plan_id
      `);

      // Total revenue by plan
      const [totalRevenue]: any = await pool.query(`
        SELECT 
          plan_id,
          SUM(amount) as total_cop,
          SUM(amount_usd) as total_usd
        FROM user_subscriptions
        ${dateFilter}
        GROUP BY plan_id
      `, params);

      res.json({
        revenueByDay,
        planDistribution,
        totalRevenue
      });
    } catch (error) {
      console.error("Error fetching revenue stats:", error);
      res.status(500).json({ error: "Error fetching revenue stats" });
    }
  });

  // Advanced Admin Stats (Yield by League and Market)
  app.get("/api/stats/advanced", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = "";
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = " AND p.match_date >= ? AND p.match_date <= ?";
        params.push(startDate, endDate);
      }

      // Yield by League
      const [byLeague]: any = await pool.query(`
        SELECT 
          l.name as league,
          COUNT(*) as total_picks,
          SUM(CASE WHEN p.status = 'won' THEN 1 ELSE 0 END) as won,
          SUM(CASE WHEN p.status = 'lost' THEN 1 ELSE 0 END) as lost,
          SUM(p.stake) as total_staked,
          SUM(CASE 
            WHEN p.status = 'won' THEN p.stake * (p.odds - 1)
            WHEN p.status = 'lost' THEN -p.stake
            ELSE 0 
          END) as profit
        FROM picks p
        JOIN leagues l ON p.league_id = l.id
        WHERE p.status IN ('won', 'lost') ${dateFilter}
        GROUP BY l.id, l.name
        ORDER BY total_picks DESC
        LIMIT 15
      `, params);

      // Yield by Market (using 'pick' column as a proxy for market)
      const [byMarket]: any = await pool.query(`
        SELECT 
          p.pick as market,
          COUNT(*) as total_picks,
          SUM(CASE WHEN p.status = 'won' THEN 1 ELSE 0 END) as won,
          SUM(CASE WHEN p.status = 'lost' THEN 1 ELSE 0 END) as lost,
          SUM(p.stake) as total_staked,
          SUM(CASE 
            WHEN p.status = 'won' THEN p.stake * (p.odds - 1)
            WHEN p.status = 'lost' THEN -p.stake
            ELSE 0 
          END) as profit
        FROM picks p
        WHERE p.status IN ('won', 'lost') AND p.is_parlay = false ${dateFilter}
        GROUP BY p.pick
        ORDER BY total_picks DESC
        LIMIT 15
      `, params);

      res.json({
        byLeague: byLeague.map((l: any) => ({
          ...l,
          yield: l.total_staked > 0 ? ((l.profit / l.total_staked) * 100).toFixed(2) : "0.00",
          profit: Number(l.profit).toFixed(2)
        })),
        byMarket: byMarket.map((m: any) => ({
          ...m,
          yield: m.total_staked > 0 ? ((m.profit / m.total_staked) * 100).toFixed(2) : "0.00",
          profit: Number(m.profit).toFixed(2)
        }))
      });
    } catch (error) {
      console.error("Error fetching advanced stats:", error);
      res.status(500).json({ error: "Error fetching advanced stats" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
