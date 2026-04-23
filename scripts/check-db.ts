import { pool } from "../server/config/database.js";
import dotenv from "dotenv";

dotenv.config();

async function check() {
  try {
    const [c]: any = await pool.query("SELECT COUNT(*) as count FROM countries");
    const [l]: any = await pool.query("SELECT COUNT(*) as count FROM leagues");
    const [t]: any = await pool.query("SELECT COUNT(*) as count FROM teams");
    
    console.log("--- DB STATUS ---");
    console.log("Countries:", c[0].count);
    console.log("Leagues:  ", l[0].count);
    console.log("Teams:    ", t[0].count);
    
    if (t[0].count > 0) {
        const [sample]: any = await pool.query("SELECT * FROM teams LIMIT 1");
        console.log("Sample Team:", sample[0]);
    }

    process.exit(0);
  } catch (err: any) {
    console.error("Error connecting to DB:", err.message);
    process.exit(1);
  }
}

check();
