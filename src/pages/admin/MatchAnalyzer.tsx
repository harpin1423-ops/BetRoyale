import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  FilePlus2,
  History,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { api } from "../../lib/api";
import type { project, priceMarkets, teamProfile, rankPicks } from "../../../server/services/matchModel";
import "./match-analyzer.css";

type Model = ReturnType<typeof project>;
type Fixture = {
  id: string;
  name: string;
  country: string;
  league: string;
  homeTeamName: string;
  awayTeamName: string;
  homeLogo: string;
  awayLogo: string;
  flag: string;
  date: string;
  time: string;
  timestamp: number;
  summary?: Model;
  value?: { label: string; ev: number };
};
type Profile = ReturnType<typeof teamProfile>;
type Market = ReturnType<typeof priceMarkets>[number];
type Context = { rank: number | null; absences: string[]; formation: string | null; xi: string[] };
type Report = {
  fixture: Fixture;
  at: string;
  version: string;
  leagueSample: number;
  home: Profile;
  away: Profile;
  model: Model;
  markets: Market[];
  provider1x2: number[] | null;
  recommendation: ReturnType<typeof rankPicks>;
  warnings: string[];
  context: { home: Context; away: Context; h2h: { date: string; home: string; away: string; score: string }[] };
};
type Archived = {
  id: string;
  name: string;
  league: string;
  date: string;
  at: string;
  p: Record<string, number>;
  score: number[] | null;
};
const pct = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 }).format(v);
const dec = (v: number | null) => (v == null ? "—" : v.toLocaleString("es-CO", { maximumFractionDigits: 2 }));
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date());
const stamp = (v: string) =>
  new Date(v).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
function Crest({ url, name }: { url: string; name: string }) {
  return url ? (
    <img className="ma-crest" src={url} alt="" loading="lazy" />
  ) : (
    <span className="ma-initials">{name.slice(0, 2)}</span>
  );
}
function OutcomeBar({ p }: { p: Record<string, number> }) {
  return (
    <div className="ma-distribution">
      <div>
        {["1", "X", "2"].map((k, i) => (
          <span key={k}>
            <b>{["Local", "Empate", "Visitante"][i]}</b> {pct(p[k])}
          </span>
        ))}
      </div>
      <div className="ma-bar" aria-hidden="true">
        {["1", "X", "2"].map((k) => (
          <i key={k} style={{ flex: p[k] }} />
        ))}
      </div>
    </div>
  );
}
function Summary({ f, model, report }: { f: Fixture; model?: Model; report?: Report }) {
  function teamLine(side: "home" | "away") {
    if (!report) return null;
    const s = report[side].stats,
      rank = report.context[side].rank;
    return (
      <small>
        {rank ? "#" + rank + " · " : ""}xG {dec(s.xg.value)}
        <br />
        xT {dec(s.xt.value)} · SCA/90 {dec(s.sca.value)}
      </small>
    );
  }
  return (
    <>
      <div className="ma-meta">
        {f.flag && <img src={f.flag} alt="" />}
        {f.country} · {f.league}
        <span>
          <Clock3 size={13} /> {f.time} COL
        </span>
      </div>
      <div className="ma-teams">
        <div>
          <Crest name={f.homeTeamName} url={f.homeLogo} />
          <strong>{f.homeTeamName}</strong>
          {teamLine("home")}
        </div>
        <div className="ma-score">
          <b>{model ? model.mode.home + " – " + model.mode.away : "vs"}</b>
          {model && <small>PROYECCIÓN · {pct(model.mode.p)}</small>}
        </div>
        <div>
          <Crest name={f.awayTeamName} url={f.awayLogo} />
          <strong>{f.awayTeamName}</strong>
          {teamLine("away")}
        </div>
      </div>
      {model && (
        <>
          <OutcomeBar p={model.p} />
          <div className="ma-kpis">
            <div>
              Más de 2.5<strong>{pct(model.p["+2.5"])}</strong>
            </div>
            <div>
              Ambos marcan<strong>{pct(model.p.AEM)}</strong>
            </div>
            <div>
              Goles previstos<strong>{dec(model.h + model.a)}</strong>
            </div>
          </div>
        </>
      )}
    </>
  );
}
function QuoteCheck({ markets }: { markets: Market[] }) {
  const [market, setMarket] = useState("1"), [odd, setOdd] = useState("");
  const selected = markets.find(m => m.id === market);
  const number = Number(odd.replace(",", "."));
  return <div className="ma-toolbar">
    <label>Mercado<select value={market} onChange={e=>setMarket(e.target.value)}>
      {markets.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
    </select></label>
    <label>Cuota de tu casa<input inputMode="decimal" placeholder="Ej. 2,15" value={odd} onChange={e=>setOdd(e.target.value)} /></label>
    <output aria-live="polite">{selected && Number.isFinite(number) && number>1 ?
      "EV estimado: "+pct(number*selected.p-1)+" · Cuota justa: "+dec(selected.fair) : "Introduce una cuota decimal mayor que 1."}</output>
  </div>;
}
function insight(r: Report) {
  const [h, a] = [r.home.stats, r.away.stats];
  if (!r.model) return "La muestra disponible aún es insuficiente para proyectar este encuentro.";
  return (
    r.fixture.homeTeamName +
    " promedia " +
    dec(h.gf.value) +
    " goles a favor en sus últimos " +
    h.gf.n +
    " partidos de liga en casa. " +
    r.fixture.awayTeamName +
    " concede " +
    dec(a.ga.value) +
    " fuera y anota " +
    dec(a.gf.value) +
    ", frente a " +
    dec(h.ga.value) +
    " que permite el local. El modelo estima " +
    dec(r.model.h) +
    " goles locales y " +
    dec(r.model.a) +
    " visitantes."
  );
}
function ContextBlock({ name, ctx, profile }: { name: string; ctx: Context; profile: Profile }) {
  return (
    <div>
      <h4>{name}</h4>
      <p>
        {ctx.rank ? "Puesto " + ctx.rank : "Posición sin dato"} · {ctx.formation || "Esquema sin confirmar"}
      </p>
      <p>Bajas reportadas · {ctx.absences.join(", ") || "Sin información confirmada"}</p>
      {ctx.xi.length > 0 && <p>Titulares · {ctx.xi.join(", ")}</p>}
      {profile.rows.map((r) => (
        <div className="ma-game" key={r.id}>
          <b data-form={r.form}>{r.form}</b>
          <span>
            {r.opponent}
            <small>{r.date.slice(0, 10)}</small>
          </span>
          <strong>
            {r.gf} – {r.ga}
          </strong>
        </div>
      ))}
    </div>
  );
}
function Archive({ items, onOpen }: { items: Archived[]; onOpen: (id: string) => void }) {
  const closed = items.filter((i) => i.score !== null);
  const brier = closed.length
    ? closed.reduce((s, i) => {
        const [h, a] = i.score!,
          actual = h > a ? "1" : h < a ? "2" : "X";
        return s + ["1", "X", "2"].reduce((sum, k) => sum + (i.p[k] - Number(k === actual)) ** 2, 0);
      }, 0) / closed.length
    : null;
  return (
    <>
      <div className="ma-kpis">
        <div>
          Pronósticos<strong>{items.length}</strong>
        </div>
        <div>
          Con resultado<strong>{closed.length}</strong>
        </div>
        <div title="Error cuadrático multiclase de 0 a 2. Menor es mejor.">
          Brier 1X2<strong>{dec(brier)}</strong>
        </div>
      </div>
      <p className="ma-muted">Primer pronóstico por partido · hasta 100 encuentros</p>
      {closed.length > 0 && (
        <details>
          <summary>Calibración de probabilidades 1X2</summary>
          <table>
            <thead>
              <tr>
                <th>Probabilidad estimada</th>
                <th>Casos</th>
                <th>Frecuencia real</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((bin) => {
                const cases = closed.flatMap((i) =>
                  ["1", "X", "2"]
                    .filter((k) => Math.min(4, Math.floor(i.p[k] * 5)) === bin)
                    .map((k) => {
                      const [h, a] = i.score!;
                      return Number(k === (h > a ? "1" : h < a ? "2" : "X"));
                    }),
                );
                return (
                  <tr key={bin}>
                    <th>
                      {bin * 20}–{(bin + 1) * 20}%
                    </th>
                    <td>{cases.length}</td>
                    <td>{cases.length ? pct(cases.reduce((s, v) => s + v, 0) / cases.length) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
      {items.length === 0 && <p className="ma-empty">Todavía no hay pronósticos con muestra suficiente.</p>}
      {items.map((i) => (
        <button className="ma-history" onClick={() => onOpen(i.id)} key={i.id}>
          <span>
            {i.name}
            <small>
              {i.league} · {i.date}
            </small>
          </span>
          <b>{i.score ? i.score.join(" – ") : "Por resolver"}</b>
          <ChevronRight size={16} />
        </button>
      ))}
    </>
  );
}
export function MatchAnalyzer({ onDraft, standalone }: { onDraft?: (f: Fixture, m: Market, analysis: string) => void;
  standalone?: { source:string; get:<T>(url:string)=>Promise<T> } }) {
  const [day, setDay] = useState(() => standalone?.source === "OpenLigaDB" ? "" : today()),
    [view, setView] = useState<"agenda" | "archive">("agenda"),
    [query, setQuery] = useState(""),
    [league, setLeague] = useState("");
  const [list, setList] = useState<Fixture[]>([]),
    [history, setHistory] = useState<Archived[]>([]),
    [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [reload, refresh] = useState(0);
  const [comment, setComment] = useState("");
  const [valueOnly, setValueOnly] = useState(false),
    [limit, setLimit] = useState(24);
  const request = useRef(0),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = ++request.current;
    setBusy(true);
    setError("");
    setReport(null);
    setList([]);
    setHistory([]);
    const url = view === "agenda" ? "/api/match-analysis/fixtures?date=" + day : "/api/match-analysis/archive";
    (standalone || api)
      .get<any[]>(url)
      .then((rows) => {
        if (id === request.current) (view === "agenda" ? setList : setHistory)(rows);
      })
      .catch((e) => {
        if (id === request.current) setError(e.message);
      })
      .finally(() => {
        if (id === request.current) setBusy(false);
      });
    return () => {
      request.current++;
    };
  }, [day, view, reload, standalone]);
  async function open(id: string) {
    const seq = ++request.current;
    setBusy(true);
    setError("");
    setComment("");
    try {
      const data = await (standalone || api).get<Report>(
        "/api/match-analysis/" + id + (view === "archive" ? "?snapshot=first" : ""),
      );
      if (seq === request.current) {
        setReport(data);
        const value = data.recommendation;
        setList((prev) => prev.map((f) => (f.id === id ? { ...f, summary: data.model, value } : f)));
      }
    } catch (e) {
      if (seq === request.current) setError((e as Error).message);
    } finally {
      if (seq === request.current) setBusy(false);
    }
  }
  async function importStats(input: File) {
    if (!report) return;
    const seq = ++request.current;
    setBusy(true);
    setError("");
    try {
      if (input.size > 64000) throw new Error("El archivo supera 64 KB.");
      const rows = JSON.parse(await input.text());
      const data = await api.post<Report>("/api/match-analysis/" + report.fixture.id + "/metrics", { rows });
      if (seq === request.current) {
        setReport(data);
        setComment("");
      }
    } catch (e) {
      if (seq === request.current) setError((e as Error).message);
    } finally {
      if (seq === request.current) setBusy(false);
    }
  }
  function downloadTemplate(r: Report) {
    const rows = [...r.home.rows, ...r.away.rows].map((g) => ({
      fixtureId: g.id,
      teamId: g.teamId,
      source: g.source || "",
      xt: g.values.xt,
      sca: g.values.sca,
      touches: g.values.touches,
    }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "metricas-" + r.fixture.id + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filtered = list.filter(
    (f) =>
      (!valueOnly || f.value) &&
      (!league || f.league === league) &&
      (f.name + " " + f.league + " " + f.country).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  if (valueOnly) filtered.sort((a, b) => b.value!.ev - a.value!.ev);
  const best = report?.recommendation;
  const observed = report ? [report.home,report.away].reduce((sum,side)=>
    sum+side.stats.gf.n+side.stats.xg.n+side.stats.target.n+side.stats.corners.n+side.stats.yellow.n,0) : 0;
  return (
    <section className="ma">
      <header className="ma-title">
        <div>
          <span className="ma-label">
            <Activity size={15} /> BETROYALE CLUB
          </span>
          <h2>Analizador de partidos</h2>
        </div>
        {!standalone && <nav aria-label="Vista del analizador">
          {(["agenda", "archive"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                if (v === view) {
                  request.current++;
                  setBusy(false);
                  setReport(null);
                  setError("");
                }
              }}
            >
              {v === "agenda" ? <CalendarDays size={16} /> : <History size={16} />}{" "}
              {v === "agenda" ? "Agenda" : "Registro"}
            </button>
          ))}
        </nav>}
      </header>
      {error && (
        <p className="ma-error" role="alert">
          {error} <button onClick={() => refresh((n) => n + 1)}>Reintentar</button>
        </p>
      )}
      {busy && (
        <p role="status" className="ma-loading">
          <Loader2 className="animate-spin" size={20} /> Consultando datos del partido…
        </p>
      )}
      {!report && view === "agenda" && (
        <>
          <div className="ma-toolbar">
            <label>
              {standalone?.source === "OpenLigaDB" && !day ? "Próximos 14 días · Colombia" : "Fecha · Colombia"}
              <input
                type="date"
                value={day}
                onChange={(e) => {
                  if (e.target.value || standalone?.source === "OpenLigaDB") {
                    setDay(e.target.value);
                    setLeague("");
                  }
                }}
              />
            </label>
            <label>
              Competición
              <select value={league} onChange={(e) => setLeague(e.target.value)}>
                <option value="">Todas las competiciones</option>
                {[...new Set(list.map((f) => f.league))].sort().map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Equipo o país
              <div>
                <Search size={16} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar partido"
                />
              </div>
            </label>
            <button title="Actualizar agenda" aria-label="Actualizar agenda" onClick={() => refresh((n) => n + 1)}>
              <RefreshCw size={17} />
            </button>
          </div>
          {!busy && !error && (
            <>
              {standalone?.source !== "OpenLigaDB" && <label className="ma-filter">
                <input type="checkbox" checked={valueOnly} onChange={(e) => setValueOnly(e.target.checked)} /> Con
                valor esperado positivo
              </label>}
              <h3>
                Próximos encuentros <small>{filtered.length}</small>
              </h3>
              {!filtered.length && (
                <p className="ma-empty">
                  {valueOnly
                    ? "Sin informes con valor positivo para este filtro."
                    : "Sin partidos programados para esta selección."}
                </p>
              )}
              <div className="ma-grid">
                {filtered.slice(0, limit).map((f) => (
                  <article className="ma-card" key={f.id}>
                    <Summary f={f} model={f.summary} />
                    {f.value && (
                      <p className="ma-edge">
                        {f.value.label} · EV +{pct(f.value.ev)}
                      </p>
                    )}
                    <button className="ma-open" onClick={() => open(f.id)}>
                      {f.summary ? "Ver informe" : "Analizar partido"}
                      <ArrowRight size={16} />
                    </button>
                  </article>
                ))}
              </div>
              {filtered.length > limit && (
                <button className="ma-back" onClick={() => setLimit((n) => n + 24)}>
                  Ver más encuentros <ChevronRight size={16} />
                </button>
              )}
            </>
          )}
        </>
      )}
      {!report && !busy && !error && view === "archive" && <Archive items={history} onOpen={open} />}
      {report && (
        <>
          <button
            className="ma-back"
            onClick={() => {
              request.current++;
              setBusy(false);
              setError("");
              setReport(null);
            }}
          >
            <ArrowLeft size={16} /> Volver a {view === "agenda" ? "la agenda" : "registro"}
          </button>
          <div className="ma-details">
            <article className="ma-card">
              <Summary f={report.fixture} model={report.model} report={report} />
              <div className="ma-coverage" title="Goles, xG, remates al arco, córners y amarillas de cinco partidos por equipo">
                <span>Cobertura de la muestra <b>{observed}/50 datos</b></span>
                <progress value={observed} max={50} aria-label="Cobertura de métricas históricas"/>
              </div>
              {report.provider1x2 && (
                <small>
                  API-Football · 1 {report.provider1x2[0]}% · X {report.provider1x2[1]}% · 2{" "}
                  {report.provider1x2[2]}%
                </small>
              )}
            </article>
            <div className="ma-reading">
              <span className="ma-label">PICK PRINCIPAL</span>
              <h3>
                {best ? best.label : report.model ? "Sin pick con valor suficiente" : "Cobertura insuficiente"}
              </h3>
              {best && (
                <div className="ma-prices"><div>Valor esperado<strong>+{pct(best.ev!)}</strong></div>
                  <div>Cuota ofrecida<strong>{dec(best.quote!.odds)}</strong><small>{best.quote!.book}</small></div>
                  <div>Cuota justa<strong>{dec(best.fair)}</strong></div></div>
              )}
              <p>{insight(report)}</p>
              {best?.id.startsWith("CORNERS_")&&<p>El local genera {dec(report.home.stats.corners.value)} córners por encuentro en casa y el visitante concede {dec(report.away.stats.againstCorners.value)} fuera.</p>}
              {best?.id.startsWith("YELLOW_")&&<p>Amarillas por partido en la muestra: {dec(report.home.stats.yellow.value)} del local y {dec(report.away.stats.yellow.value)} del visitante.</p>}
              {best ? (
                <p>
                  Probabilidad entre {pct(best.low)} y {pct(best.high)} en {best.scenarios} escenarios. A esta
                  cuota se necesita acertar el {pct(best.breakeven)} para alcanzar el punto de equilibrio. EV del escenario menos favorable:{" "}
                  {pct(best.floorEV)}.
                </p>
              ) : (
                report.model && (
                  <p>
                    Se requieren cuatro encuentros por sede, una cuota reciente y valor positivo incluso al variar
                    la muestra.
                  </p>
                )
              )}
              {report.markets.some((m) => m.ev != null && m.ev > 0.5) && (
                <p className="ma-warning">
                  Hay diferencias de precio extraordinarias. Verifica la línea y la cuota en la casa.
                </p>
              )}
              <small>
                {report.fixture.date} · Informe {stamp(report.at)} COL · {report.version}
              </small>
              {onDraft&&view==="agenda"&&best&&Date.now()<report.fixture.timestamp*1000&&<button className="ma-draft" onClick={()=>onDraft(report.fixture,best,insight(report)+" Mercado: "+best.label+" · Cuota justa "+dec(best.fair)+".")}><FilePlus2 size={16}/> Crear borrador del pick</button>}
              {!standalone && view === "agenda" && report.model && (
                <button
                  className="ma-back"
                  disabled={busy}
                  onClick={async () => {
                    const seq = ++request.current;
                    setBusy(true);
                    setError("");
                    try {
                      const result = await api.post<{ analysis: string }>(
                        "/api/match-analysis/" + report.fixture.id + "/commentary",
                      );
                      if (seq === request.current) setComment(result.analysis);
                    } catch (e) {
                      if (seq === request.current) setError((e as Error).message);
                    } finally {
                      if (seq === request.current) setBusy(false);
                    }
                  }}
                >
                  <Activity size={15} /> Interpretar con IA
                </button>
              )}
              {comment && <p>{comment}</p>}
            </div>
          </div>
          {report.warnings.map((w) => (
            <p key={w} className="ma-warning">
              {w}
            </p>
          ))}
          <h3>Mercados y cuotas</h3>
          {standalone?.source === "OpenLigaDB" && <p className="ma-muted">Las cuotas justas son estimaciones del modelo. Esta fuente no publica cuotas de casas de apuestas.</p>}
          {standalone && report.markets.length>0 && <div key={report.fixture.id}><QuoteCheck markets={report.markets}/></div>}
          {report.markets.length === 0 ? (
            <p className="ma-empty">
              El modelo requiere tres partidos por equipo en la sede correspondiente y diez partidos de liga
              finalizados.
            </p>
          ) : (
            <div className="ma-markets">
              {report.markets.map((m) => (
                <div className="ma-market" key={m.id}>
                  <strong>{m.label}</strong>
                  <span>
                    Probabilidad<b>{pct(m.p)}</b>
                  </span>
                  <span>
                    Justa<b>{dec(m.fair)}</b>
                  </span>
                  <span>
                    Ofrecida<b>{dec(m.quote?.odds ?? null)}</b>
                    {m.quote && (
                      <small>
                        {m.quote.book} · {stamp(m.quote.time)} COL
                      </small>
                    )}
                  </span>
                  <span>
                    EV<b className={m.ev != null && m.ev > 0 ? "ma-edge" : ""}>{m.ev == null ? "—" : pct(m.ev)}</b>
                  </span>
                  {onDraft && view === "agenda" && Date.now() < report.fixture.timestamp * 1000 && (
                    <button
                      title={"Crear borrador · " + m.label}
                      aria-label={"Crear borrador · " + m.label}
                      onClick={() =>
                        onDraft(
                          report.fixture,
                          m,
                          insight(report) + " Mercado: " + m.label + " · Probabilidad " + pct(m.p) + ".",
                        )
                      }
                    >
                      <FilePlus2 size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <h3>Comparativa por equipo</h3>
          <p className="ma-muted">
            Últimos cinco partidos de la temporada en la misma liga y sede. Cada media indica su muestra.
          </p>
          <div className="ma-table">
            <table>
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>{report.fixture.homeTeamName} · local</th>
                  <th>{report.fixture.awayTeamName} · visitante</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(report.home.stats) as (keyof Profile["stats"])[]).map((k) => (
                  <tr key={k}>
                    <th>{report.home.stats[k].label}</th>
                    {[report.home.stats[k], report.away.stats[k]].map((v, i) => (
                      <td key={i}>
                        {v.value === null ? "Sin dato" : dec(v.value)}
                        {v.n > 0 && <small>n={v.n}</small>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Forma y disponibilidad</h3>
          <div className="ma-context">
            <ContextBlock name={report.fixture.homeTeamName} ctx={report.context.home} profile={report.home} />
            <ContextBlock name={report.fixture.awayTeamName} ctx={report.context.away} profile={report.away} />
          </div>
          <h3>Cruces en esta temporada</h3>
          {report.context.h2h.length ? (
            report.context.h2h.map((g) => (
              <p key={g.date} className="ma-muted">
                {g.date.slice(0, 10)} · {g.home} {g.score} {g.away}
              </p>
            ))
          ) : (
            <p className="ma-muted">Sin cruces previos en la muestra.</p>
          )}
          <details>
            <summary>Fuentes y cobertura</summary>
            <p>
              {standalone?.source || "API-Football"} · {report.leagueSample} partidos de liga. Modelo de goles con ajuste Dixon-Coles y
              estimaciones de córners y amarillas por frecuencia observada. Las cuotas comparadas tienen hasta seis
              horas de antigüedad.
            </p>
            {!standalone && view === "agenda" && Date.now() < report.fixture.timestamp * 1000 && (
              <>
                <p>
                  Para añadir xT neto, SCA/90 y toques en el área, descarga la plantilla, conserva las filas que
                  tengas documentadas e indica la fuente de cada partido.
                </p>
                <button onClick={() => downloadTemplate(report)}>Descargar plantilla JSON</button>{" "}
                <button disabled={busy} onClick={() => file.current?.click()}>
                  <Upload size={15} /> Importar métricas
                </button>
                <input
                  className="hidden"
                  type="file"
                  accept=".json"
                  ref={file}
                  onChange={(e) => {
                    const input = e.target.files?.[0];
                    e.target.value = "";
                    if (input) void importStats(input);
                  }}
                />
              </>
            )}
            {[...new Set([...report.home.rows, ...report.away.rows].map((r) => r.source).filter(Boolean))].map(
              (s) => (
                <p key={s}>{s}</p>
              ),
            )}
          </details>
        </>
      )}
    </section>
  );
}
