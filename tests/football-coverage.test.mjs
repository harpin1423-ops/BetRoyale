import assert from "node:assert/strict";
import test from "node:test";
import { auditLeague, coverage } from "../server/services/footballCoverage.mjs";
import handler from "../api/analizador.js";

test("el diagnóstico tampoco permite usar la clave privada desde la agenda pública",async()=>{
  let status;
  await handler({url:"/?coverage=40",method:"GET",headers:{}},{setHeader(){},status(s){status=s;return this;},json(){}});
  assert.equal(status,403);
});

const game = id => ({fixture:{id,status:{short:"FT"},timestamp:1000+id},league:{id:40,season:2026},
  teams:{home:{id:1},away:{id:2}},score:{fulltime:{home:0,away:0}}});
const stats = (id,value) => ({team:{id},statistics:[{type:"Corner Kicks",value},{type:"Yellow Cards",value:null}]});
test("denominador original y observaciones de ambos equipos; un cero sí cuenta",()=>{
  const games=[game(1),game(2),game(3)];
  const details=[{fixture:{id:1},statistics:[stats(2,"0"),stats(1,3)]},{fixture:{id:2},statistics:[stats(1,0),stats(2,"")]}];
  assert.deepEqual(coverage(games,details),{muestra:3,marcador:3,corners:1,amarillas:0,xG:0});
});
test("solo los 20 partidos terminados más recientes de la temporada auditada, sin duplicados",async()=>{
  let requested="";
  const report=await auditLeague(40,async(path,p)=>{
    if(path==="leagues") return [{league:{id:40,name:"Championship"},seasons:[{year:2026,current:true}]}];
    if(p.ids) {requested=p.ids;return [];}
    return [...Array.from({length:25},(_,i)=>game(i+1)),game(4),{...game(29),league:{id:99,season:2026}},game(2000)];
  },1050*1000);
  assert.equal(report.muestra,20);assert.equal(requested,Array.from({length:20},(_,i)=>25-i).join("-"));
});
test("no sustituye la temporada actual por una histórica ni convierte un rechazo en cero cobertura",async()=>{
  await assert.rejects(auditLeague(40,async()=>[{league:{id:40},seasons:[{year:2024,current:false}]}]),/temporada actual/);
  await assert.rejects(auditLeague(40,async()=>{throw Error("HTTP 403")}),/403/);
});
