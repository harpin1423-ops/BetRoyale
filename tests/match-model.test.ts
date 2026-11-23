import test from "node:test";
import assert from "node:assert/strict";
import {
  numeric,
  venueHistory,
  teamProfile,
  project,
  priceMarkets,
  rankPicks,
} from "../server/services/matchModel.js";
const epoch = 1_700_000_000;
function fixture(id: number) {
  const home = id % 3,
    away = id % 2;
  return {
    fixture: {
      id,
      timestamp: epoch - id,
      date: new Date((epoch - id) * 1000).toISOString(),
      status: { short: "FT" },
    },
    teams: { home: { id: 1, name: "Local" }, away: { id: 2, name: "Visitante" } },
    score: { fulltime: { home, away } },
  };
}
const league = Array.from({ length: 40 }, (_, i) => fixture(i + 1));
test("muestra por sede excluye datos futuros, prórrogas y marcadores incompletos", () => {
  const future = fixture(-1),
    aet = fixture(0),
    missing = fixture(99);
  aet.fixture.status.short = "AET";
  missing.score.fulltime.away = null!;
  assert.deepEqual(
    venueHistory([future, aet, missing, ...league], 1, "home", epoch).map((f) => f.fixture.id),
    [1, 2, 3, 4, 5],
  );
  assert.equal(venueHistory(league, 1, "away", epoch).length, 0);
});
test("estadísticas ausentes, cero observado y fuente suplementaria se conservan", () => {
  const g = league[0];
  const detailed = new Map([
    [g.fixture.id, { statistics: [{ team: { id: 1 }, statistics: [{ type: "Corner Kicks", value: 0 }] }] }],
  ]);
  const p = teamProfile([g], "home", detailed, new Map([["1/1", { xt: -0.1, source: "Proveedor" }]]));
  assert.equal(p.stats.xt.value, -0.1);
  assert.equal(p.stats.corners.value, 0);
  assert.equal(p.stats.xg.n, 0);
  assert.equal(p.stats.againstCorners.value, null);
  for (const bad of [null, "", true, Infinity, "  "]) assert.equal(numeric(bad), null);
});
test("las probabilidades coherentes no generan mercados con muestra insuficiente", () => {
  const hp = teamProfile(league.slice(0, 5), "home", new Map(), new Map());
  const ap = teamProfile(league.slice(0, 5), "away", new Map(), new Map());
  assert.equal(project(hp, teamProfile([], "away", new Map(), new Map()), league), null);
  const { p, mode } = project(hp, ap, league)!;
  assert.ok(Math.abs(p["1"] + p.X + p["2"] - 1) < 1e-10);
  assert.ok(p["+2.5"] <= p["+1.5"] && p.AEM <= p["GL0.5"]);
  assert.ok(mode.p > 0 && mode.p < 1);
  assert.equal(p["CORNERS_+9.5"], undefined);
});
test("EV exige el mismo mercado, selección y precio reciente", () => {
  const now = epoch * 1000;
  const quote = (odd: number, age: number, id = 1) => ({
    update: new Date(now - age).toISOString(),
    bookmakers: [{ name: "Casa", bets: [{ id, values: [{ value: "Home", odd }] }] }],
  });
  const [m] = priceMarkets({ "1": 0.55 }, [quote(1.95, 3600), quote(12, 7 * 3600000), quote(9, 0, 5)], now);
  assert.equal(m.quote?.odds, 1.95);
  assert.ok(Math.abs(m.ev! - 0.0725) < 1e-10);
  assert.equal(priceMarkets({ "1": 0.55 }, [], now)[0].ev, null);
});
test("el pick principal supera el punto de equilibrio en todos los escenarios", () => {
  const h = teamProfile(league.slice(0, 5), "home", new Map(), new Map()),
    a = teamProfile(league.slice(0, 5), "away", new Map(), new Map());
  const model = project(h, a, league)!;
  const odds = 1.4 / model.p["+1.5"];
  const quotes = [
    {
      update: new Date(epoch * 1000).toISOString(),
      bookmakers: [{ name: "Prueba", bets: [{ id: 5, values: [{ value: "Over 1.5", odd: odds }] }] }],
    },
  ];
  const m = priceMarkets(model.p, quotes, epoch * 1000);
  const pick = rankPicks(h, a, league, m);
  assert.equal(pick?.id, "+1.5");
  assert.ok(pick!.floorEV > 0 && pick!.low > 1 / odds);
  assert.equal(rankPicks(h, a, league, priceMarkets(model.p, [], epoch * 1000)), null);
});
