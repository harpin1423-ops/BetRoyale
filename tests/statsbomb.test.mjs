import test from "node:test";
import assert from "node:assert/strict";
import {aggregateEvents,fitThreat,netThreat} from "../server/services/statsBombMetrics.mjs";
import {competition,matchHistorical,hudlHistory} from "../server/services/statsBomb.mjs";
import handler,{makeReport} from "../api/analizador.js";

const event=(type,id,extra={})=>({type:{name:type},team:{id},period:1,possession:id,possession_team:{id},location:[35,35],...extra});
const end=p=>event("Half End",1,{period:p,timestamp:"00:45:00.000"});
const events=[event("Pass",1,{pass:{end_location:[80,40]}}),event("Carry",1,{carry:{end_location:[99,43]}}),
  event("Shot",1,{shot:{statsbomb_xg:0.25}}),event("Pass",2,{pass:{end_location:[40,30]}}),end(1),end(2),
  event("Shot",2,{period:3,shot:{statsbomb_xg:0.9}})].map((e,index)=>({...e,index}));
const c={competition_id:9,season_id:1,season_name:"2025/2026",country_name:"Germany",competition_gender:"male",competition_name:"1. Bundesliga"};
const league={season:2025,name:"Bundesliga",country:"Alemania"};
const g={fixture:{id:202,date:"2025-10-20T16:00:00Z",timestamp:1760976000,status:{short:"FT"}},
  teams:{home:{id:341,name:"FC Bayern München"},away:{id:290,name:"Test FC"}},score:{fulltime:{home:1,away:0}},league};
const match={match_id:997,match_status:"available",match_date:"2025-10-20",home_score:1,away_score:0,
  home_team:{home_team_id:1,home_team_name:"Bayern Munich"},away_team:{away_team_id:2,away_team_name:"Test FC"}};
test("tiempo reglamentario y fase ofensiva: xG y SCA observados, cero real distinto de ausencia",()=>{
  const agg=aggregateEvents(events,[1,2]);
  assert.equal(agg.teams.get(1).xg,0.25);assert.equal(agg.teams.get(1).sca,2);
  assert.equal(agg.teams.get(2).xg,0);assert.equal(agg.teams.get(2).shots,0);
  assert.equal(aggregateEvents(events.filter(e=>e.period!==2),[1,2]),null);
  const incomplete=events.map(e=>e.type.name==="Shot"?{...e,shot:{},possession:3}:e);
  assert.equal(aggregateEvents(incomplete,[1,2]).teams.get(1).xg,null);
  assert.equal(aggregateEvents(incomplete,[1,2]).teams.get(1).sca,0);
});
test("xT exige cobertura de tiros y zonas; conserva movimientos negativos",()=>{
  const agg=aggregateEvents(events,[1,2]);
  assert.equal(fitThreat([agg]),null);
  assert.equal(netThreat(agg.teams.get(1),null),null);
  const sample={...agg,usableGrid:true,shots:20,attempts:Array(24).fill(4),rewards:Array(24).fill(0),transitions:Array(576).fill(0)};
  sample.rewards[0]=1;sample.transitions[24]=2;
  const grid=fitThreat(Array(5).fill(sample));
  assert.equal(grid[0],0.25);assert.equal(grid[1],0.125);
  const moves=Array(576).fill(0);moves[1]=1;
  assert.equal(netThreat({located:true,moves},grid),-0.125);
});
test("no confunde temporadas, categorías, partidos ambiguos o marcadores",()=>{
  assert.equal(competition([c],league),c);assert.equal(competition([c],{...league,season:2024}),null);
  assert.equal(competition([{...c,competition_gender:"female"}],league),null);
  assert.equal(matchHistorical([match],g),match);assert.equal(matchHistorical([match,match],g),null);
  assert.equal(matchHistorical([{...match,away_score:2}],g),null);
});
test("conector privado usa IDs Hudl y entrega las observaciones bajo los IDs del calendario",async()=>{
  const paths=[];
  const h=await hudlHistory(league,[g],{read:async path=>{
    paths.push(path);
    if(path==="v4/competitions")return [c];
    if(path==="v6/competitions/9/seasons/1/matches")return [match];
    if(path==="v11/events/997")return events;
    throw Error("ruta inesperada");
  }});
  assert.equal(paths.length,3);assert.equal(h.info.matched,1);
  const f={...g,fixture:{...g.fixture,id:203,timestamp:Date.now()/1000+50000}};
  const r=makeReport(f,[g],[{fixture:g.fixture,statistics:[{team:{id:341},statistics:[{type:"Corner Kicks",value:5}]}]}],[],[],h);
  assert.equal(r.home.stats.xg.value,0.25);assert.equal(r.home.stats.sca.value,2);
  assert.equal(r.home.stats.corners.value,5);assert.equal(r.home.stats.xt.value,null);
});
test("sin licencia o sin permiso conserva el informe sin inventar eventos",async()=>{
  const h=await hudlHistory(league,[g],{read:async()=>{throw Object.assign(Error(),{status:403});}});
  assert.equal(h.info.matched,0);assert.match(h.info.message,/licencia/);
  let status;await handler({url:"/?hudl=1&id=bl1-2026-1",method:"GET",headers:{}},
    {setHeader(){},status(s){status=s;return this;},json(){}});
  assert.equal(status,403);
});
