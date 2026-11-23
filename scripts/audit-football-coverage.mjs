import { pathToFileURL } from "node:url";
import { auditLeague } from "../server/services/footballCoverage.mjs";

const priorityLeagues = [79, 40, 262, 119, 233, 239];

async function run() {
  const key = process.env.APIFOOTBALL_API_KEY;
  if (!key) throw new Error("Falta APIFOOTBALL_API_KEY en el entorno privado. No se hicieron consultas.");
  const args = process.argv.slice(2);
  if (args.some(v => !/^[1-9]\d{0,5}$/.test(v))) throw new Error("Indica IDs numéricos de ligas.");
  const ids = [...new Set(args.length ? args.map(Number) : priorityLeagues)];
  const read = async (path, params) => {
    const response = await fetch("https://v3.football.api-sports.io/" + path + "?" + new URLSearchParams(params),
      { headers: { "x-apisports-key": key }, redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Proveedor: HTTP " + response.status);
    const body = await response.json();
    if (!Array.isArray(body.response) || Object.keys(body.errors || {}).length) {
      const codes = Object.keys(body.errors || {}).join(", ");
      throw new Error("Consulta no autorizada o no disponible" + (codes ? " (" + codes + ")" : "") + ".");
    }
    return body.response;
  };
  const rows = [];
  for (const id of ids) {
    try { rows.push(await auditLeague(id, read)); }
    catch (err) {
      console.error("Liga " + id + ": " + err.message);
      process.exitCode = 1;
      if (/401|403|429|requests|rateLimit|token|key/i.test(err.message)) break;
    }
  }
  if (rows.length) console.table(rows);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(err => { console.error(err.message); process.exitCode = 1; });
}
