import test from "node:test";
import assert from "node:assert/strict";
import handler, {makeReport} from "../api/analizador.js";

async function call(url, method="GET") {
  let status, body;
  await handler({url,method,headers:{}},{setHeader(){},status(n){status=n;return this},json(data){body=data}});
  return {status,body};
}
test("la fuente privada nunca acepta una consulta anónima",async()=>{
  assert.equal((await call("/?source=football")).status,403);
});
test("la API solo lee y no acepta IDs de proveedores arbitrarios",async()=>{
  assert.equal((await call("/","POST")).status,405);
  assert.equal((await call("/?id=invalid")).status,400);
});
test("el informe sin cobertura no inventa precios, xG ni resultados",()=>{
  const f={publicId:"bl2-2026-123",fixture:{id:123,status:{short:"NS"},timestamp:Date.now()/1000+86400},
    league:{name:"2. Bundesliga",country:"Alemania"},teams:{home:{id:5,name:"Local"},away:{id:7,name:"Visitante"}}};
  const r=makeReport(f,[]);
  assert.equal(r.leagueSample,0);
  assert.equal(r.home.stats.xg.value,null);
  assert.equal(r.model,null);
  assert.equal(r.recommendation,null);
});
