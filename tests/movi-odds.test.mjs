import test from "node:test";
import assert from "node:assert/strict";
import {findMatch,mapOffers,moviOddsFor,moviOddsKey} from "../server/services/moviOdds.mjs";
import handler from "../api/analizador.js";
import {priceMarkets} from "../dist-server/server/services/matchModel.js";

const now=Date.parse("2026-11-23T12:00:00Z"), kickoff="2026-11-23T19:00:00Z";
const f={fixture:{id:713,timestamp:Date.parse(kickoff)/1000},teams:{home:{name:"1. FC Nürnberg"},away:{name:"VfL Bochum 1848"}}};
const m={id:"42",sport:"soccer",in_play:false,kickoff_utc:kickoff,home:"Nurnberg",away:"Bochum"};
const q={fixture_id:"42",group_id:"40",group_name:"Full Time Result",label:"Nurnberg",odds_dec:2.1};
const snap={polled_at:"2026-11-23T11:59:00Z",quotes:[q]};

test("MOVIODD habilita el analizador y autentica la solicitud sin exponer la clave", async t=>{
  assert.equal(moviOddsKey({MOVIODDS_API_KEY:"principal",MOVIODD:"alias"}),"principal");
  assert.equal(moviOddsKey({MOVIODDS_API_KEY:" ",MOVIODD:" "}),"");
  const old=[process.env.MOVIODDS_API_KEY,process.env.MOVIODD];
  t.after(()=>["MOVIODDS_API_KEY","MOVIODD"].forEach((name,i)=>{
    if(old[i]===undefined) delete process.env[name]; else process.env[name]=old[i];
  }));
  delete process.env.MOVIODDS_API_KEY;
  process.env.MOVIODD=" valor-de-prueba ";
  let capabilities;
  await handler({url:"/?capabilities=1",method:"GET",headers:{}},{
    setHeader(){},status(){return this},json(value){capabilities=value}
  });
  assert.equal(capabilities.moviOdds,true);
  assert.ok(!JSON.stringify(capabilities).includes("valor-de-prueba"));
  const upstream=t.mock.method(globalThis,"fetch",async (_url,opts)=>{
    assert.equal(opts.headers["X-API-Key"],"valor-de-prueba");
    return Response.json({fixtures:[]});
  });
  assert.equal((await moviOddsFor(f)).status,"Sin partido coincidente en MoviOdds.");
  assert.equal(upstream.mock.callCount(),1);
});

test("se vincula únicamente un partido prepartido con ambos equipos en el mismo orden",()=>{
  assert.equal(findMatch(f,[m],now),m);
  for(const changed of [{id:"43"},{in_play:true},{home:"Nurnberg II"},{away:"Bochum U19"},{sport:"esoccer"},
    {kickoff_utc:"2026-11-23T19:45:00Z"},{home:m.away,away:m.home}]){
    const alt={...m,...changed};
    assert.equal(findMatch(f,changed.id?[m,alt]:[alt],now),null);
  }
});
test("no usa cotizaciones caducadas, ambiguas, suspendidas o de otro partido",()=>{
  for(const data of [{...snap,fi:"111"},{...snap,polled_at:"2026-11-23T08:00:00Z"},
    {...snap,group_status:{40:{stale:true}}},{quotes:[q]},...[
      {suspended:true},{phase:"inplay"},{fixture_id:"9"},{odds_dec:0},{period:"1"},
      {group_name:"Half Time Result"},{group_id:2000,group_name:"Number of Cards in Match",label:"Over 4.5"}
    ].map(v=>({...snap,quotes:[{...q,...v}]}))]) assert.deepEqual(mapOffers(f,m,data,now),[]);
});
test("calcula el EV para el lado y la línea exactos con la hora de verificación del proveedor",()=>{
  const quotes=[q,{...q,group_id:"77",group_name:"Goals Over/Under",side:"Over",line:"2.5",label:"",odds_dec:1.95},
    {...q,group_id:"88",group_name:"Both Teams To Score",label:"Yes",odds_dec:2.2}];
  const offers=mapOffers(f,m,{...snap,quotes},now);
  const priced=priceMarkets({"1":0.5,"+2.5":0.6,"-2.5":0.4,AEM:0.5},offers,now);
  const home=priced.find(x=>x.id==="1");
  assert.ok(Math.abs(home.ev-.05)<1e-10);
  assert.equal(home.quote.book,"bet365 · MoviOdds");
  assert.equal(Date.parse(home.quote.time),Date.parse(snap.polled_at));
  assert.equal(priced.find(x=>x.id==="-2.5").quote,null);
  assert.equal(priced.find(x=>x.id==="+2.5").quote.odds,1.95);
  assert.equal(priced.find(x=>x.id==="AEM").quote.odds,2.2);
});
