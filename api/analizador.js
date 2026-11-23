import { createHash, timingSafeEqual } from "node:crypto";
import { moviOddsFor, moviOddsKey } from "../server/services/moviOdds.mjs";
import { hudlConfigured, hudlHistory } from "../server/services/statsBomb.mjs";
import { modelVersion, priceMarkets, project, rankPicks, teamProfile, venueHistory } from "../dist-server/server/services/matchModel.js";

const zone = "America/Bogota", dayMs = 86400000, cache = new Map();
const dayOf = value => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year:"numeric", month:"2-digit",day:"2-digit" }).format(value);
const leagues = { bl1: "Bundesliga", bl2: "2. Bundesliga" };
const digest = s => createHash("sha256").update(s).digest();
const permitted = req => Boolean(process.env.ANALYZER_ACCESS_CODE &&
  timingSafeEqual(digest(String(req.headers["x-analyzer-access"] || "")), digest(process.env.ANALYZER_ACCESS_CODE)));

async function read(url, secure = false, ttl = 600000) {
  const old = cache.get(url);
  if (old && old.expires > Date.now()) return old.promise;
  if (cache.size > 128) cache.delete(cache.keys().next().value);
  const promise = (async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(9000),
      headers: secure ? { "x-apisports-key": process.env.APIFOOTBALL_API_KEY } : {} });
    if (!res.ok) throw new Error("upstream");
    const json = await res.json();
    if (!secure && Array.isArray(json)) return json;
    if (!Array.isArray(json.response) || Object.keys(json.errors || {}).length) throw new Error("upstream");
    return json.response;
  })();
  cache.set(url, { expires: Date.now() + ttl, promise });
  try { return await promise; } catch (e) { if (cache.get(url)?.promise === promise) cache.delete(url); throw e; }
}
const football = (path, params) => read("https://v3.football.api-sports.io/" + path + "?" + new URLSearchParams(params), true);
const seasonOf = d => d.getUTCFullYear() - Number(d.getUTCMonth() < 6);
async function openLeague(code, season) {
  const data = await read("https://api.openligadb.de/getmatchdata/" + code + "/" + season);
  return data.map(m => {
    const ft = m.matchResults?.find(s => s.resultTypeKind === "After90Minutes" || s.resultTypeID === 2);
    const team = t => ({ id:t.teamId, name:t.teamName, logo:/^https:\/\//i.test(t.teamIconUrl || "") ? t.teamIconUrl : null });
    return { publicId: [code,season,m.matchID].join("-"), fixture:{ id:m.matchID, date:m.matchDateTimeUTC,
      timestamp:Date.parse(m.matchDateTimeUTC)/1000, status:{ short:m.matchIsFinished ? "FT":"NS" } },
      teams:{home:team(m.team1),away:team(m.team2)}, league:{name:leagues[code],country:"Alemania",season},
      score:{fulltime:{home:ft?.pointsTeam1 ?? null,away:ft?.pointsTeam2 ?? null}} };
  });
}
const scheduled = f => f.fixture.status.short === "NS" && f.fixture.timestamp * 1000 > Date.now();
function fixture(f) {
  const d = new Date(f.fixture.timestamp * 1000), h = f.teams.home, a = f.teams.away;
  return { id:String(f.publicId || f.fixture.id), name:h.name+" vs "+a.name, homeTeamName:h.name, awayTeamName:a.name,
    homeLogo:h.logo, awayLogo:a.logo, league:f.league.name, country:f.league.country, flag:f.league.flag,
    timestamp:f.fixture.timestamp,date:dayOf(d),time:d.toLocaleTimeString("es-CO",{timeZone:zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}) };
}

export function makeReport(f, season, detailed=[], offers=[], warnings=[], hudl=null) {
  const cutoff = Math.min(Date.now()/1000,f.fixture.timestamp);
  const played = season.filter(x => x.fixture.status.short === "FT" && x.fixture.timestamp < cutoff &&
    Number.isInteger(x.score?.fulltime?.home) && Number.isInteger(x.score?.fulltime?.away));
  const details = new Map(detailed.map(x=>[x.fixture.id,x]));
  for(const [id,teams] of hudl?.details || []) {
    const old=details.get(id)?.statistics || [];
    details.set(id,{statistics:teams.map(t=>{
      const original=old.find(o=>o.team.id===t.team.id)?.statistics || [];
      return {...t,statistics:[...t.statistics,...original.filter(o=>!t.statistics.some(s=>s.type===o.type))]};
    })});
  }
  const profile = side => teamProfile(venueHistory(played,f.teams[side].id,side,cutoff),side,details,hudl?.extras || new Map());
  const home=profile("home"), away=profile("away"), model=project(home,away,played);
  const markets=model ? priceMarkets(model.p,offers.filter(x=>x.fixture?.id===f.fixture.id),Date.now()) : [];
  const context=()=>({rank:null,formation:null,absences:[],xi:[]});
  const h2h=played.filter(x=>[x.teams.home.id,x.teams.away.id].includes(f.teams.home.id) &&
    [x.teams.home.id,x.teams.away.id].includes(f.teams.away.id)).sort((a,b)=>b.fixture.timestamp-a.fixture.timestamp).slice(0,5)
    .map(x=>({home:x.teams.home.name,away:x.teams.away.name,date:x.fixture.date,score:x.score.fulltime.home+" : "+x.score.fulltime.away}));
  return {fixture:fixture(f),version:modelVersion,at:new Date().toISOString(),model,home,away,leagueSample:played.length,
    markets,recommendation:rankPicks(home,away,played,markets),provider1x2:null,context:{home:context(),away:context(),h2h},warnings,
    ...(hudl?{hudl:hudl.info}:{})};
}

export default async function handler(req,res) {
  const url=new URL(req.url,"https://analizador.local"), p=url.searchParams, id=p.get("id"), date=p.get("date"),
    paid=p.get("source")==="football", now=new Date(), since=Date.now();
  const send=(code,body)=>res.status(code).json(body);
  res.setHeader("Cache-Control","private, no-store");
  if(req.method!=="GET") return send(405,{error:"Método no permitido."});
  const movi=Boolean(moviOddsKey());
  const hudl=p.get("hudl")==="1", codeSet=Boolean(process.env.ANALYZER_ACCESS_CODE);
  if(p.has("capabilities")) return send(200,{football:Boolean(codeSet && process.env.APIFOOTBALL_API_KEY),moviOdds:movi,hudl:codeSet && hudlConfigured()});
  if((paid || hudl) && (!permitted(req) || (paid && !process.env.APIFOOTBALL_API_KEY) || (hudl && !hudlConfigured())))
    return send(403,{error:"El acceso privado no está configurado o el código no es válido."});
  if(date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || Math.abs(Date.parse(date)-since)>370*dayMs))
    return send(400,{error:"Selecciona una fecha del próximo año o del último año."});
  try {
    if (!id) {
      const day=date || dayOf(now), d=new Date(day+"T12:00:00Z"), s=seasonOf(d);
      const years=[...new Set([s,seasonOf(new Date(d.getTime()+(date?0:14*dayMs)))])];
      const games=paid ? await football("fixtures",{date:day,timezone:zone}) :
        (await Promise.all(years.flatMap(y=>Object.keys(leagues).map(l=>openLeague(l,y))))).flat();
      const items=games.filter(scheduled).filter(f=>paid || (date ? dayOf(new Date(f.fixture.timestamp*1000))===date :
        f.fixture.timestamp*1000 <= since+14*dayMs)).sort((a,b)=>a.fixture.timestamp-b.fixture.timestamp).map(f=>{
          const item=fixture(f);
          if(paid) return item;
          const played=games.filter(g=>g.league.name===f.league.name && g.league.season===f.league.season &&
            g.fixture.status.short==="FT" && g.fixture.timestamp<since/1000 && Number.isInteger(g.score.fulltime.home) && Number.isInteger(g.score.fulltime.away));
          const side=s=>teamProfile(venueHistory(played,f.teams[s].id,s,since/1000),s,new Map(),new Map());
          return {...item,summary:project(side("home"),side("away"),played)};
        });
      if(!paid && !hudl) res.setHeader("Cache-Control","public, s-maxage=180, stale-while-revalidate=120");
      return send(200,items);
    }
    let f, season, stats=[], offers=[], warnings=[];
    if(!paid) {
      const m=/^(bl[12])-(\d{4})-(\d{1,9})$/.exec(id);
      if(!m || Math.abs(Number(m[2])-seasonOf(now))>1) return send(400,{error:"Partido inválido."});
      season=await openLeague(m[1],Number(m[2]));
      f=season.find(x=>x.publicId===id);
    } else {
      if(!/^[1-9]\d{0,8}$/.test(id)) return send(400,{error:"Partido inválido."});
      [f]=await football("fixtures",{id});
      if(f && scheduled(f)){
        season=await football("fixtures",{league:f.league.id,season:f.league.season});
        const ids=[...new Set(["home","away"].flatMap(side=>venueHistory(season,f.teams[side].id,side,since/1000).map(g=>g.fixture.id)))];
        [stats,offers]=await Promise.all([ids.length ? football("fixtures",{ids:ids.join("-")}).catch(()=>{warnings.push("Estadísticas detalladas no disponibles.");return [];}) : [],
          movi ? [] : football("odds",{fixture:id}).catch(()=>{warnings.push("Sin cuotas disponibles en el proveedor.");return [];})]);
      }
    }
    if(!f || !scheduled(f)) return send(409,{error:"El encuentro no está disponible para el análisis prepartido."});
    const history=hudl ? [...new Map(["home","away"].flatMap(s=>venueHistory(season,f.teams[s].id,s,since/1000))
      .map(g=>[g.fixture.id,g])).values()] : [];
    const [prices,events]=await Promise.all([movi ? moviOddsFor(f) : null,hudl ? hudlHistory(f.league,history) : null]);
    if(!scheduled(f)) return send(409,{error:"El partido ya comenzó."});
    const report=makeReport(f,season,stats,prices?.offers ?? offers,warnings,events);
    if(prices) report.oddsInfo=prices.status;
    return send(200,report);
  }catch{return send(503,{error:paid?"API-Football no devolvió datos. Revisa la cobertura, la cuota de consultas y la clave.":"OpenLigaDB no respondió. Inténtalo de nuevo en unos minutos."});}
}
