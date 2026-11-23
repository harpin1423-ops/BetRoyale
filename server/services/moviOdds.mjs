// Solo cotizaciones prepartido verificables; los IDs de MoviOdds no son los de las otras fuentes.
export function moviOddsKey(env = process.env) {
  return env.MOVIODDS_API_KEY?.trim() || env.MOVIODD?.trim() || "";
}
const plain = value => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function team(value) {
  return plain(value).replace(/ß/g,"ss").replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/)
    .filter(word => !["fc","cf","afc","sv","vfl","vfb","tsg","sc","fsv","ev","1"].includes(word) && !/^(18|19)\d\d$/.test(word)).join(" ");
}
export function findMatch(f, rows, now) {
  const h=team(f.teams.home.name), a=team(f.teams.away.name), kickoff=f.fixture.timestamp*1000;
  if (!h || !a || h===a || kickoff<=now) return null;
  const candidates=rows.filter(m=>/^\d+$/.test(String(m.id)) && m.in_play===false &&
    (!m.sport || m.sport==="soccer") && Date.parse(m.kickoff_utc)>now &&
    Math.abs(Date.parse(m.kickoff_utc)-kickoff)<=5*60000 && team(m.home)===h && team(m.away)===a);
  return candidates.length===1 ? candidates[0] : null;
}
function selection(q,m) {
  const group=plain(q.group_name), label=plain(q.label), side=plain(q.side), line=String(q.line ?? "");
  if(String(q.group_id)==="40" && (!group || group==="full time result")) {
    const key=String(q.n2 || "").toUpperCase();
    const result={"1":"Home","X":"Draw","2":"Away"}[key] ||
      (label==="draw"?"Draw":label==="home" || team(label)===team(m.home)?"Home":label==="away" || team(label)===team(m.away)?"Away":null);
    if(result) return [1,"Match Winner",result];
  }
  if(group==="both teams to score" && label==="yes") return [8,"Both Teams Score","Yes"];
  if(group==="double chance") {
    if(["1x","home or draw",plain(m.home)+" or draw","draw or "+plain(m.home)].includes(label)) return [12,"Double Chance","Home/Draw"];
    if(["x2","draw or away","draw or "+plain(m.away),plain(m.away)+" or draw"].includes(label)) return [12,"Double Chance","Draw/Away"];
  }
  const pair=/^(over|under)\s+(\d+(?:\.\d+)?)$/.exec(label);
  const direction=side || pair?.[1], threshold=line || pair?.[2];
  if(pair && ((side && side!==pair[1]) || (line && line!==pair[2]))) return null;
  if(!["over","under"].includes(direction)) return null;
  const value=(direction==="over"?"Over ":"Under ")+threshold;
  if(["goals over/under","alternative total goals","match goals","goal line"].includes(group) && ["1.5","2.5"].includes(threshold)) return [5,"Goals Over/Under",value];
  if(["total corners","corners","alternative corners"].includes(group) && threshold==="9.5") return [45,"Corners Over/Under",value];
  // Los mercados de puntos por tarjetas no equivalen a un total de amarillas.
  return null;
}
export function mapOffers(f,m,snap,now) {
  if(!Array.isArray(snap?.quotes) || snap.in_play || (snap.fi!=null && String(snap.fi)!==String(m.id)) ||
     (snap.fixture_id!=null && String(snap.fixture_id)!==String(m.id)) || Date.parse(m.kickoff_utc)<=now) return [];
  const offers=[];
  for(const q of snap.quotes){
    if(q.suspended || q.period || (q.phase && q.phase!=="prematch") || (q.fixture_id!=null && String(q.fixture_id)!==String(m.id))) continue;
    const s=selection(q,m), odds=Number(q.odds_dec), group=snap.group_status?.[q.group_id];
    const t=Date.parse(group?.polled_at ?? snap.polled_at), age=now-t;
    if(!s || !Number.isFinite(odds) || odds<=1 || group?.stale || !Number.isFinite(t) || age<0 ||
       age>(Date.parse(m.kickoff_utc)-now>72*3600000?60:30)*60000) continue;
    offers.push({fixture:{id:f.fixture.id},update:new Date(t).toISOString(),bookmakers:[{name:"bet365 · MoviOdds",
      bets:[{id:s[0],name:s[1],values:[{value:s[2],odd:odds}]}]}]});
  }
  return offers;
}
const cache=new Map();
async function read(path,ttl) {
  const prior=cache.get(path);
  if(prior && prior.until>Date.now()) return prior.data;
  if(cache.size>=128) cache.delete(cache.keys().next().value);
  const entry={until:Date.now()+ttl,data:null};
  entry.data=(async()=>{
    const res=await fetch("https://moviodds.com"+path,{headers:{"X-API-Key":moviOddsKey()},redirect:"error",signal:AbortSignal.timeout(8000)});
    if(!res.ok) throw new Error(String(res.status));
    return res.json();
  })().catch(e=>{entry.until=Date.now()+60000;throw e;});
  cache.set(path,entry);
  return entry.data;
}
export async function moviOddsFor(f) {
  try {
    const catalog=await read("/catalog?sport=soccer",5*60000);
    if(!Array.isArray(catalog.fixtures)) throw new Error("catalog");
    const match=findMatch(f,catalog.fixtures,Date.now());
    if(!match) return {offers:[],status:"Sin partido coincidente en MoviOdds."};
    const snap=await read("/snapshot?fi="+encodeURIComponent(match.id),2*60000);
    const offers=mapOffers(f,match,snap,Date.now());
    return {offers,status:offers.length?"Cuotas prepartido confirmadas por MoviOdds.":"Sin cuotas vigentes para los mercados analizados."};
  } catch(e) {
    const status=e.message==="429"?"MoviOdds alcanzó el límite de consultas.":
      ["401","403"].includes(e.message)?"MoviOdds no autorizó la consulta.":"MoviOdds no respondió.";
    return {offers:[],status};
  }
}
