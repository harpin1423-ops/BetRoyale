const fields = { corners: "Corner Kicks", amarillas: "Yellow Cards", xG: "expected_goals" };
const observed = value => (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(value)) && Number(value) >= 0;

// Count both teams against the original fixture sample. A missing detail row is not a zero.
export function coverage(games, details) {
  const byId = new Map(details.map(d => [d.fixture?.id, d]));
  const counts = { marcador: 0, corners: 0, amarillas: 0, xG: 0 };
  for (const g of games) {
    if (["home", "away"].every(side => observed(g.score?.fulltime?.[side]))) counts.marcador++;
    const d = byId.get(g.fixture.id);
    for (const [name, type] of Object.entries(fields)) {
      if (["home", "away"].every(side => {
        const id = g.teams?.[side]?.id;
        return Number.isInteger(id) && d?.statistics?.find(t => t.team?.id === id)?.statistics
          ?.some(s => s.type === type && observed(s.value));
      })) counts[name]++;
    }
  }
  return { muestra: games.length, ...counts };
}

export async function auditLeague(id, read, now = Date.now()) {
  const rows = await read("leagues", { id, current: "true" });
  const league = rows.find(r => r.league?.id === id);
  const seasons = league?.seasons?.filter(s => s.current && Number.isInteger(s.year)) || [];
  if (seasons.length !== 1) throw new Error("Sin temporada actual identificable en esta cuenta.");
  const season = seasons[0].year;
  const calendar = await read("fixtures", { league: id, season, status: "FT" });
  const played = calendar.filter(f => f.fixture?.status?.short === "FT" && Number.isInteger(f.fixture?.id) &&
    f.fixture.timestamp > 0 && f.fixture.timestamp * 1000 <= now && f.league?.id === id && f.league.season === season);
  const games = [...new Map(played.map(g => [g.fixture.id, g])).values()]
    .sort((a,b) => b.fixture.timestamp - a.fixture.timestamp || b.fixture.id - a.fixture.id).slice(0,20);
  const details = games.length ? await read("fixtures", { ids: games.map(g => g.fixture.id).join("-") }) : [];
  return { liga: league.league.name, pais: league.country?.name, temporada: season,
    desde: games.at(-1)?.fixture.date?.slice(0,10) ?? null, hasta: games[0]?.fixture.date?.slice(0,10) ?? null,
    estadisticas_declaradas: seasons[0].coverage?.fixtures?.statistics_fixtures ?? null,
    ...coverage(games, details) };
}
