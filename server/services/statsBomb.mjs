import {aggregateEvents,fitThreat,netThreat} from "./statsBombMetrics.mjs";

export const hudlConfigured=()=>Boolean(process.env.SB_USERNAME && process.env.SB_PASSWORD);
const norm=v=>String(v||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim();
const names=new Map(Object.entries({
  alemania:"germany", inglaterra:"england", espana:"spain", francia:"france", italia:"italy",
  "1 bundesliga":"bundesliga","bundesliga 1":"bundesliga","bundesliga 2":"2 bundesliga",
  "fc bayern munchen":"bayern munich","bayern munchen":"bayern munich","fc bayern munich":"bayern munich",
  "bayer 04 leverkusen":"bayer leverkusen","rb leipzig":"rasenballsport leipzig",
  "borussia m gladbach":"borussia monchengladbach","1 fc koln":"fc koln",
  "vfl wolfsburg":"wolfsburg","1 fc heidenheim 1846":"heidenheim","1 fc heidenheim":"heidenheim",
  "1 fsv mainz 05":"mainz 05","tsg 1899 hoffenheim":"hoffenheim","tsg hoffenheim":"hoffenheim",
  "sv werder bremen":"werder bremen","fc st pauli":"st pauli","sport club freiburg":"sc freiburg",
}));
const same=(a,b)=>Boolean(norm(a) && (names.get(norm(a))||norm(a))===(names.get(norm(b))||norm(b)));
const unique=rows=>rows.length===1?rows[0]:null;
const validId=n=>Number.isSafeInteger(n) && n>0;
export function competition(rows,league) {
  const women=/\b(women|femenina|frauen)\b/i.test(league.name);
  return unique(rows.filter(c=>validId(c.competition_id) && validId(c.season_id) &&
    same(c.country_name,league.country) && same(c.competition_name,league.name) &&
    c.competition_gender===(women?"female":"male") &&
    /^\d{4}(?:[/-]\d{2,4})?$/.test(c.season_name) && Number(c.season_name.slice(0,4))===Number(league.season)));
}
export function matchHistorical(rows,g) {
  const day=g.fixture.date?.slice(0,10);
  return unique(rows.filter(m=>m.match_date===day && validId(m.match_id) &&
    m.match_status==="available" && m.home_score===g.score.fulltime.home && m.away_score===g.score.fulltime.away &&
    same(m.home_team?.home_team_name,g.teams.home.name) && same(m.away_team?.away_team_name,g.teams.away.name) &&
    validId(m.home_team.home_team_id) && validId(m.away_team.away_team_id)));
}

const cache=new Map();
async function cached(key,ttl,work) {
  const prev=cache.get(key);
  if(prev && prev.until>Date.now()) return prev.promise;
  if(cache.size>=96) cache.delete(cache.keys().next().value);
  const entry={until:Date.now()+ttl,promise:work()};
  cache.set(key,entry);
  try{return await entry.promise;}catch(e){if(cache.get(key)===entry) cache.delete(key);throw e;}
}
function privateReader(signal) {
  const auth=Buffer.from(process.env.SB_USERNAME+":"+process.env.SB_PASSWORD).toString("base64");
  return async path=>{
    const r=await fetch("https://data.statsbombservices.com/api/"+path,{headers:{Authorization:"Basic "+auth},
      signal,redirect:"error"});
    if(!r.ok) throw Object.assign(new Error("Hudl"),{status:r.status});
    const data=await r.json();
    if(!Array.isArray(data)) throw new Error("Respuesta no válida");
    return data;
  };
}
const failure=e=>e?.status===401?"Hudl rechazó las credenciales de la API.":
  e?.status===403?"La licencia de Hudl no permite consultar estos datos.":
  e?.status===429?"Se alcanzó el límite de consultas de Hudl.":"Hudl no respondió o no entregó eventos completos.";

export async function hudlHistory(league,games,options={}) {
  const signal=AbortSignal.timeout(15000), read=options.read || privateReader(signal);
  const remember=options.read?(_k,_ttl,fn)=>fn():cached;
  const details=new Map(), extras=new Map();
  const info={eligible:games.length,matched:0,message:""};
  try {
    if(!games.length) {info.message="No hay partidos históricos elegibles.";return {details,extras,info};}
    const comps=await remember("competitions",600000,()=>read("v4/competitions"));
    const c=competition(comps,league);
    if(!c) {info.message="Esta liga y temporada no tienen una coincidencia única en la cobertura de tu cuenta.";return {details,extras,info};}
    const path="v6/competitions/"+c.competition_id+"/seasons/"+c.season_id+"/matches";
    const matches=await remember(path,600000,()=>read(path)), ready=[];
    const jobs=games.map(g=>({g,m:matchHistorical(matches,g)})).filter(x=>x.m);
    let i=0, note="";
    async function worker() {
      while(i<jobs.length && !signal.aborted) {
        const {g,m}=jobs[i++], ids=[m.home_team.home_team_id,m.away_team.away_team_id];
        try {
          const data=await remember("events/"+m.match_id,3600000,async()=>
            aggregateEvents(await read("v11/events/"+m.match_id),ids));
          if(data) ready.push({g,data,ids});
        } catch(e){note=failure(e);if([401,403,429].includes(e.status)) i=jobs.length;}
      }
    }
    await Promise.all([worker(),worker()]);
    for(const {g,data,ids} of ready) {
      const grid=fitThreat(ready.filter(r=>r.data!==data).map(r=>r.data));
      const statistics=["home","away"].map((side,k)=>{
        const t=data.teams.get(ids[k]), id=g.teams[side].id;
        extras.set(g.fixture.id+"/"+id,{source:"Hudl StatsBomb",sca:t.sca,xt:netThreat(t,grid)});
        return {team:{id},statistics:[{type:"Total Shots",value:t.shots},...(t.xg===null?[]:[{type:"expected_goals",value:t.xg}])]};
      });
      details.set(g.fixture.id,statistics);
    }
    info.matched=ready.length;
    info.message=note || (signal.aborted?"Tiempo de consulta agotado.":ready.length<games.length?
      "Hay partidos sin una coincidencia verificada o sin eventos completos.":"Eventos históricos verificados.");
  } catch(e){info.message=failure(e);}
  return {details,extras,info};
}
