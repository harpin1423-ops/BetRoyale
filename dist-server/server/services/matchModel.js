// All inputs are pre-match observations. Unknown statistics stay null throughout.
export const modelVersion = "dc-venue-v1";
export const metrics = {
    gf: "Goles a favor",
    ga: "Goles recibidos",
    xg: "xG",
    xga: "xG concedido",
    shots: "Remates",
    target: "Remates al arco",
    box: "Remates en el área",
    possession: "Posesión (%)",
    corners: "Córners a favor",
    againstCorners: "Córners concedidos",
    yellow: "Amarillas propias",
    rivalYellow: "Amarillas del rival",
    fouls: "Faltas",
    xt: "Amenaza esperada (xT)",
    sca: "Acciones de creación de tiro (SCA/90)",
    touches: "Toques en el área",
};
export const numeric = (v) => {
    if (typeof v !== "number" && (typeof v !== "string" || !v.trim()))
        return null;
    const n = Number(typeof v === "string" ? v.replace(/%$/, "") : v);
    return Number.isFinite(n) && n >= 0 ? n : null;
};
export function venueHistory(fixtures, team, side, cutoff) {
    return fixtures
        .filter((f) => f.teams?.[side]?.id === team &&
        f.fixture?.status?.short === "FT" &&
        f.fixture.timestamp < cutoff &&
        numeric(f.score?.fulltime?.home) !== null &&
        numeric(f.score?.fulltime?.away) !== null)
        .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
        .slice(0, 5);
}
export function teamProfile(games, side, detailed, supplements) {
    const opposite = side === "home" ? "away" : "home";
    const rows = games.map((game) => {
        const data = detailed.get(game.fixture.id)?.statistics || [];
        const stat = (who, key) => numeric(data.find((s) => s.team.id === game.teams[who].id)?.statistics?.find((s) => s.type === key)
            ?.value);
        const extra = supplements.get(game.fixture.id + "/" + game.teams[side].id);
        const gf = Number(game.score.fulltime[side]), ga = Number(game.score.fulltime[opposite]);
        const values = {
            gf,
            ga,
            xg: stat(side, "expected_goals"),
            xga: stat(opposite, "expected_goals"),
            shots: stat(side, "Total Shots"),
            target: stat(side, "Shots on Goal"),
            box: stat(side, "Shots insidebox"),
            possession: stat(side, "Ball Possession"),
            corners: stat(side, "Corner Kicks"),
            againstCorners: stat(opposite, "Corner Kicks"),
            yellow: stat(side, "Yellow Cards"),
            rivalYellow: stat(opposite, "Yellow Cards"),
            fouls: stat(side, "Fouls"),
            xt: extra?.xt != null && Number.isFinite(Number(extra.xt)) ? Number(extra.xt) : null,
            sca: numeric(extra?.sca),
            touches: numeric(extra?.touches),
        };
        return {
            id: game.fixture.id,
            teamId: game.teams[side].id,
            date: game.fixture.date,
            opponent: game.teams[opposite].name,
            gf,
            ga,
            form: gf > ga ? "G" : gf < ga ? "P" : "E",
            source: extra?.source || null,
            values,
        };
    });
    return summarize(rows);
}
function summarize(rows) {
    const stats = Object.fromEntries(Object.keys(metrics).map((k) => {
        const values = rows.map((row) => row.values[k]).filter((v) => v !== null);
        return [
            k,
            {
                label: metrics[k],
                value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
                n: values.length,
            },
        ];
    }));
    return { rows, stats };
}
export const markets = [
    ["1", "Gana local", 1, "Home"],
    ["X", "Empate", 1, "Draw"],
    ["2", "Gana visitante", 1, "Away"],
    ["1X", "Local o empate", 12, "Home/Draw"],
    ["X2", "Visitante o empate", 12, "Draw/Away"],
    ["+1.5", "Más de 1.5 goles", 5, "Over 1.5"],
    ["+2.5", "Más de 2.5 goles", 5, "Over 2.5"],
    ["-2.5", "Menos de 2.5 goles", 5, "Under 2.5"],
    ["AEM", "Ambos marcan", 8, "Yes"],
    ["GL0.5", "Gol local", 16, "Over 0.5"],
    ["GV0.5", "Gol visitante", 17, "Over 0.5"],
    ["CORNERS_+9.5", "Más de 9.5 córners", 45, "Over 9.5"],
    ["YELLOW_+4.5", "Más de 4.5 amarillas", 0, ""],
];
function poisson(mean) {
    const p = [Math.exp(-mean)];
    for (let i = 1; i <= Math.max(16, Math.ceil(mean + 9 * Math.sqrt(mean))); i++)
        p.push((p[i - 1] * mean) / i);
    return p;
}
// League low-score correction, estimated by maximizing the Dixon-Coles adjustment to the likelihood.
function fitRho(games, h, a) {
    if (games.length < 30)
        return 0;
    const counts = [0, 0, 0, 0];
    for (const { score: { fulltime: { home, away }, }, } of games)
        if (home <= 1 && away <= 1)
            counts[2 * home + away]++;
    let best = 0, bestLL = 0;
    for (let step = -15; step <= 15; step++) {
        const r = step / 100, terms = [1 - h * a * r, 1 + h * r, 1 + a * r, 1 - r];
        if (terms.some((v) => v <= 0))
            continue;
        const ll = terms.reduce((sum, v, i) => sum + counts[i] * Math.log(v), 0);
        if (ll > bestLL) {
            bestLL = ll;
            best = r;
        }
    }
    return best;
}
export function project(home, away, league) {
    if (home.rows.length < 3 || away.rows.length < 3 || league.length < 10)
        return null;
    const base = (side) => league.reduce((s, f) => s + Number(f.score.fulltime[side]), 0) / league.length;
    const hBase = base("home"), aBase = base("away");
    const attack = (p, scored, prior) => {
        const observed = p.stats[scored ? "gf" : "ga"], xg = p.stats[scored ? "xg" : "xga"];
        const value = xg.n >= 3 ? (observed.value + xg.value) / 2 : observed.value;
        return (value * observed.n + prior * 3) / (observed.n + 3);
    };
    const h = (attack(home, true, hBase) + attack(away, false, hBase)) / 2;
    const a = (attack(away, true, aBase) + attack(home, false, aBase)) / 2;
    const rho = Math.min(fitRho(league, hBase, aBase), 0.99 / Math.max(1, h * a));
    const safeRho = Math.max(rho, -0.99 / Math.max(1, h, a));
    const ph = poisson(h), pa = poisson(a);
    const p = { "1": 0, X: 0, "2": 0, "+1.5": 0, "+2.5": 0, AEM: 0, "GL0.5": 0, "GV0.5": 0 };
    let mode = { home: 0, away: 0, p: 0 }, mass = 0;
    ph.forEach((x, i) => pa.forEach((y, j) => {
        const correction = i > 1 || j > 1 ? 1 : [1 - h * a * safeRho, 1 + h * safeRho, 1 + a * safeRho, 1 - safeRho][2 * i + j];
        const prob = x * y * correction;
        mass += prob;
        if (prob > mode.p)
            mode = { home: i, away: j, p: prob };
        p[i > j ? "1" : i === j ? "X" : "2"] += prob;
        if (i + j >= 2)
            p["+1.5"] += prob;
        if (i + j >= 3)
            p["+2.5"] += prob;
        if (i && j)
            p.AEM += prob;
        if (i)
            p["GL0.5"] += prob;
        if (j)
            p["GV0.5"] += prob;
    }));
    for (const k of Object.keys(p))
        p[k] /= mass;
    mode.p /= mass;
    p["1X"] = p["1"] + p.X;
    p.X2 = p["2"] + p.X;
    p["-2.5"] = 1 - p["+2.5"];
    // Empirical incidence with a symmetric Beta(1,1) prior, using only complete observed matches.
    for (const [id, own, other, line] of [
        ["CORNERS_+9.5", "corners", "againstCorners", 9.5],
        ["YELLOW_+4.5", "yellow", "rivalYellow", 4.5],
    ]) {
        const eligible = (s) => s.rows.filter((r) => r.values[own] !== null && r.values[other] !== null);
        const left = eligible(home), right = eligible(away);
        if (left.length < 3 || right.length < 3)
            continue;
        const sample = [...new Map([...left, ...right].map((r) => [r.id, r])).values()];
        p[id] = (1 + sample.filter((r) => r.values[own] + r.values[other] > line).length) / (sample.length + 2);
    }
    return { p, mode, h, a, rho: safeRho };
}
export function priceMarkets(p, offers, now) {
    return markets
        .filter(([id]) => p[id] > 0)
        .map(([id, label, bet, selection]) => {
        let quote = null;
        for (const row of offers) {
            const t = Date.parse(row.update);
            if (!Number.isFinite(t) || t > now || now - t > 6 * 3600_000)
                continue;
            for (const book of row.bookmakers || []) {
                const market = book.bets?.find((b) => {
                    // Bookmakers distinguish match totals, team totals, corners and card points.
                    if (id === "YELLOW_+4.5")
                        return /^yellow cards (?:over\s*\/\s*under|total)$/i.test(b.name);
                    if (id === "GL0.5" || id === "GV0.5")
                        return b.name === (id === "GL0.5" ? "Total - Home" : "Total - Away");
                    if (id === "CORNERS_+9.5")
                        return /^corners over\s*\/\s*under$/i.test(b.name);
                    return b.id === bet;
                });
                const odds = numeric(market?.values?.find((v) => v.value === selection)?.odd);
                if (odds !== null && odds > 1 && (!quote || odds > quote.odds))
                    quote = { odds, book: book.name, time: row.update };
            }
        }
        return { id, label, p: p[id], fair: 1 / p[id], quote, ev: quote ? p[id] * quote.odds - 1 : null };
    });
}
// Sensitivity range across plausible inputs, not a statistical confidence interval.
export function rankPicks(home, away, league, priced) {
    const models = [];
    const add = (h, a) => {
        const result = project(h, a, league);
        if (result)
            models.push(result.p);
    };
    if (home.rows.length >= 4 && away.rows.length >= 4) {
        add(home, away);
        for (const r of home.rows)
            add(summarize(home.rows.filter((g) => g.id !== r.id)), away);
        for (const r of away.rows)
            add(home, summarize(away.rows.filter((g) => g.id !== r.id)));
        const goalsOnly = (s) => summarize(s.rows.map((g) => ({ ...g, values: { ...g.values, xg: null, xga: null } })));
        add(goalsOnly(home), goalsOnly(away));
    }
    const candidates = priced
        .flatMap((m) => {
        if (!m.quote || !models.length || m.ev === null || m.ev > 0.5)
            return [];
        const estimates = models.map((p) => p[m.id]);
        if (estimates.some((p) => !Number.isFinite(p)))
            return [];
        const low = Math.min(...estimates), high = Math.max(...estimates);
        const floorEV = low * m.quote.odds - 1;
        return floorEV > 0
            ? [{ ...m, low, high, floorEV, scenarios: models.length, breakeven: 1 / m.quote.odds }]
            : [];
    })
        .sort((a, b) => b.floorEV - a.floorEV || b.p - a.p);
    return candidates[0] ?? null;
}
