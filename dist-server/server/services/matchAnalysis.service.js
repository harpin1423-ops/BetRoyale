import { pool } from "../config/database.js";
import { apiFootballFetch, mapFixtureForAdmin } from "./scores.service.js";
import { modelVersion, numeric, priceMarkets, project, rankPicks, teamProfile, venueHistory, } from "./matchModel.js";
const minute = 60_000, tz = "America/Bogota";
const cache = new Map();
async function read(endpoint, params, ttl = 30 * minute) {
    const key = JSON.stringify([endpoint, params]), time = Date.now(), item = cache.get(key);
    if (item && item.until > time)
        return item.data;
    if (cache.size >= 160)
        cache.delete(cache.keys().next().value);
    const data = apiFootballFetch(endpoint, params).then((res) => {
        if (!Array.isArray(res.response))
            throw new Error("Respuesta incompleta del proveedor");
        return res.response;
    });
    cache.set(key, { until: time + ttl, data });
    try {
        return await data;
    }
    catch (error) {
        cache.delete(key);
        throw error;
    }
}
export function providerMessage(error) {
    const s = String(error);
    if (/limit|quota|429|too many/i.test(s))
        return "API-Football alcanzó el límite de consultas.";
    if (/plan|season|subscription/i.test(s))
        return "El plan de API-Football restringe esta consulta.";
    if (/key|token|401|403/i.test(s))
        return "Revisa las credenciales de API-Football en el servidor.";
    return "La fuente no respondió. Vuelve a intentarlo.";
}
const parseJson = (v) => (typeof v === "string" ? JSON.parse(v) : v);
function fixtureInfo(f) {
    return {
        ...mapFixtureForAdmin(f),
        timestamp: Number(f.fixture.timestamp),
        leagueId: f.league.id,
        homeLogo: f.teams.home.logo,
        awayLogo: f.teams.away.logo,
        flag: f.league.flag,
        season: f.league.season,
    };
}
export async function agenda(date) {
    const rows = await read("fixtures", { date, timezone: tz }, 10 * minute);
    const fixtures = rows
        .filter((f) => f.fixture.status.short === "NS" && f.fixture.timestamp * 1000 > Date.now())
        .map(fixtureInfo)
        .sort((a, b) => a.timestamp - b.timestamp);
    if (!fixtures.length)
        return [];
    const [past] = await pool.query(`SELECT s.fixture_id,s.report FROM match_analysis_snapshots s
    JOIN (SELECT fixture_id,MAX(captured) t FROM match_analysis_snapshots WHERE version=? AND fixture_id IN (?) GROUP BY fixture_id) u
    ON u.fixture_id=s.fixture_id AND u.t=s.captured WHERE s.version=?`, [modelVersion, fixtures.map((f) => f.id), modelVersion]);
    const summaries = new Map(past.map((r) => {
        const a = parseJson(r.report);
        const value = a.recommendation && Date.now() - Date.parse(a.recommendation.quote.time) < 6 * 3600000
            ? a.recommendation
            : null;
        return [
            String(r.fixture_id),
            { summary: a.model, value: value ? { label: value.label, ev: value.ev } : null },
        ];
    }));
    return fixtures.map((f) => ({ ...f, ...summaries.get(String(f.id)) }));
}
async function latest(id) {
    const [rows] = await pool.query("SELECT report FROM match_analysis_snapshots WHERE fixture_id=? AND version=? ORDER BY captured DESC LIMIT 1", [id, modelVersion]);
    return rows.length ? parseJson(rows[0].report) : null;
}
const inFlight = new Map();
export async function analyze(id, force = false) {
    const active = inFlight.get(id);
    if (active) {
        if (!force)
            return active;
        await active;
        return analyze(id, true);
    }
    const task = createReport(id, force);
    inFlight.set(id, task);
    try {
        return await task;
    }
    finally {
        inFlight.delete(id);
    }
}
async function createReport(id, force) {
    const now = Date.now(), saved = await latest(id);
    if (saved && (saved.fixture.timestamp * 1000 <= now || (!force && now - Date.parse(saved.at) < 15 * minute)))
        return saved;
    const [f] = await read("fixtures", { id, timezone: tz }, 5 * minute);
    if (!f || f.fixture.status.short !== "NS" || f.fixture.timestamp * 1000 <= now)
        throw new Error("PREMATCH_ONLY");
    const fixture = fixtureInfo(f), league = { league: f.league.id, season: f.league.season };
    const warnings = [];
    async function optional(label, endpoint, params, ttl) {
        try {
            return await read(endpoint, params, ttl);
        }
        catch (err) {
            warnings.push(label + " · " + providerMessage(err));
            return [];
        }
    }
    const season = await optional("Historial de liga", "fixtures", league, 180 * minute);
    const [local] = await pool.query("SELECT fixture FROM analyzer_fixture_history WHERE league_id=? AND season=?", [league.league, league.season]);
    const stored = local.map((r) => parseJson(r.fixture));
    const combined = new Map([...stored, ...season].map((g) => [g.fixture.id, g]));
    const played = [...combined.values()].filter((g) => g.fixture?.status?.short === "FT" &&
        g.fixture.timestamp < now / 1000 &&
        numeric(g.score?.fulltime?.home) !== null &&
        numeric(g.score?.fulltime?.away) !== null);
    const left = venueHistory(played, f.teams.home.id, "home", now / 1000), right = venueHistory(played, f.teams.away.id, "away", now / 1000);
    const ids = [...new Set([...left, ...right].map((g) => g.fixture.id))];
    const raw = ids.length
        ? await optional("Estadísticas de partidos", "fixtures", { ids: ids.join("-") }, 24 * 60 * minute)
        : [];
    const [extra] = ids.length
        ? await pool.query("SELECT * FROM analysis_event_metrics WHERE fixture_id IN (?)", [ids])
        : [[]];
    const stats = new Map([...stored, ...raw].filter((g) => g.statistics?.length).map((g) => [g.fixture.id, g])), supplements = new Map(extra.map((r) => [r.fixture_id + "/" + r.team_id, r]));
    const home = teamProfile(left, "home", stats, supplements), away = teamProfile(right, "away", stats, supplements);
    const model = project(home, away, played);
    const offers = await optional("Cuotas prepartido", "odds", { fixture: id });
    const quotes = offers.filter((o) => Number(o.fixture?.id) === id);
    const priced = model ? priceMarkets(model.p, quotes, Date.now()) : [];
    const benchmark = (await optional("Predicción del proveedor", "predictions", { fixture: id }, 60 * minute))[0]
        ?.predictions?.percent;
    const comparison = benchmark
        ? [numeric(benchmark.home), numeric(benchmark.draw), numeric(benchmark.away)]
        : null;
    const table = await optional("Clasificación", "standings", league, 180 * minute);
    const standings = (table[0]?.league?.standings || []).flat();
    const unavailable = await optional("Bajas", "injuries", { fixture: id }, 120 * minute);
    const lineups = await optional("Alineaciones", "fixtures/lineups", { fixture: id }, 15 * minute);
    const context = (team) => ({
        rank: standings.find((r) => r.team?.id === team)?.rank ?? null,
        absences: unavailable
            .filter((r) => r.team?.id === team)
            .map((r) => r.player?.name)
            .filter(Boolean),
        formation: lineups.find((r) => r.team?.id === team)?.formation || null,
        xi: (lineups.find((r) => r.team?.id === team)?.startXI || []).map((r) => r.player?.name).filter(Boolean),
    });
    const h2h = played
        .filter((g) => [g.teams.home.id, g.teams.away.id].includes(f.teams.home.id) &&
        [g.teams.home.id, g.teams.away.id].includes(f.teams.away.id))
        .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
        .slice(0, 5)
        .map((g) => ({
        home: g.teams.home.name,
        away: g.teams.away.name,
        score: g.score.fulltime.home + " – " + g.score.fulltime.away,
        date: g.fixture.date,
    }));
    const recommendation = rankPicks(home, away, played, priced);
    const report = {
        fixture,
        at: new Date().toISOString(),
        version: modelVersion,
        leagueSample: played.length,
        home,
        away,
        model,
        markets: priced,
        recommendation,
        provider1x2: comparison?.every((p) => p !== null && p <= 100) &&
            Math.abs(comparison.reduce((s, p) => s + p, 0) - 100) <= 1
            ? comparison
            : null,
        context: { home: context(f.teams.home.id), away: context(f.teams.away.id), h2h },
        warnings,
    };
    const captured = Date.now();
    if (captured >= fixture.timestamp * 1000)
        throw new Error("PREMATCH_ONLY");
    // Preserve independent pre-match observations, including a later import or a price change.
    await pool.query("INSERT IGNORE INTO match_analysis_snapshots (fixture_id,bucket,version,kickoff,captured,report) VALUES (?,?,?,?,?,?)", [id, captured, modelVersion, fixture.timestamp, captured, JSON.stringify(report)]);
    return report;
}
export async function archivedReport(id) {
    const [rows] = await pool.query("SELECT report FROM match_analysis_snapshots WHERE fixture_id=? AND version=? AND JSON_TYPE(JSON_EXTRACT(report,'$.model'))='OBJECT' ORDER BY captured LIMIT 1", [id, modelVersion]);
    return rows.length ? parseJson(rows[0].report) : null;
}
export async function archive() {
    const [rows] = await pool.query(`SELECT a.report,a.final_home,a.final_away FROM match_analysis_snapshots a
    JOIN (SELECT fixture_id,MIN(captured) first_capture FROM match_analysis_snapshots
      WHERE version=? AND JSON_TYPE(JSON_EXTRACT(report,'$.model'))='OBJECT' GROUP BY fixture_id) b
    ON a.fixture_id=b.fixture_id AND a.captured=b.first_capture WHERE a.version=? ORDER BY a.kickoff DESC LIMIT 100`, [modelVersion, modelVersion]);
    return rows.map((r) => {
        const a = parseJson(r.report);
        return {
            id: a.fixture.id,
            name: a.fixture.name,
            league: a.fixture.league,
            date: a.fixture.date,
            at: a.at,
            p: a.model.p,
            score: r.final_home == null ? null : [r.final_home, r.final_away],
        };
    });
}
export async function settleArchive() {
    const [rows] = await pool.query(`SELECT DISTINCT fixture_id FROM match_analysis_snapshots WHERE final_home IS NULL
    AND kickoff BETWEEN UNIX_TIMESTAMP()-86400*30 AND UNIX_TIMESTAMP()-7200 ORDER BY fixture_id DESC LIMIT 20`);
    if (!rows.length)
        return;
    const results = await read("fixtures", { ids: rows.map((r) => r.fixture_id).join("-") }, 60 * minute);
    for (const f of results) {
        if (!["FT", "AET", "PEN"].includes(f.fixture.status.short))
            continue;
        const h = numeric(f.score?.fulltime?.home), a = numeric(f.score?.fulltime?.away);
        if (h !== null && a !== null)
            await pool.query("UPDATE match_analysis_snapshots SET final_home=?,final_away=? WHERE fixture_id=? AND final_home IS NULL", [h, a, f.fixture.id]);
    }
}
export async function dailyScan() {
    const ids = (process.env.ANALYZER_LEAGUES || "39,140,78").split(",").map(Number);
    const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const date = fmt.format(new Date());
    const yesterday = fmt.format(new Date(Date.now() - 86400_000));
    // Accumulate finished matches even if the subscription later restricts season-wide queries.
    const completed = (await read("fixtures", { date: yesterday, timezone: tz })).filter((g) => ids.includes(g.league.id) && g.fixture.status.short === "FT");
    for (let i = 0; i < completed.length; i += 20) {
        const batch = completed.slice(i, i + 20);
        const detailed = await read("fixtures", { ids: batch.map((f) => f.fixture.id).join("-") }).catch(() => []);
        const details = new Map(detailed.map((f) => [f.fixture.id, f]));
        await pool.query("INSERT INTO analyzer_fixture_history (fixture_id,league_id,season,fixture) VALUES ? ON DUPLICATE KEY UPDATE fixture=VALUES(fixture)", [
            batch.map((f) => [
                f.fixture.id,
                f.league.id,
                f.league.season,
                JSON.stringify(details.get(f.fixture.id) ?? f),
            ]),
        ]);
    }
    const games = (await agenda(date)).filter((g) => ids.includes(g.leagueId)).slice(0, 6);
    for (const g of games) {
        try {
            await analyze(Number(g.id));
        }
        catch (error) {
            console.warn("[Analizador]", providerMessage(error));
        }
    }
}
