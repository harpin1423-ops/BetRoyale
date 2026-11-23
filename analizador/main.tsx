import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { MatchAnalyzer } from "../src/pages/admin/MatchAnalyzer";
import brand from "../public/logo_avatar_premium.png";
import "./panel.css";

function App() {
  const [paid,setPaid]=useState(false), [code,setCode]=useState(""), [active,setActive]=useState(""),[edit,setEdit]=useState(false);
  useEffect(()=>{fetch("/api/analizador?capabilities=1").then(r=>r.json()).then(v=>setPaid(v.football===true)).catch(()=>{});},[]);
  const client=useMemo(()=>({
    source:active?"API-Football":"OpenLigaDB",
    async get<T,>(path:string):Promise<T>{
      const route=new URL(path,location.origin), params=new URLSearchParams();
      const id=route.pathname.split("/").pop();
      if(id!=="fixtures") params.set("id",id!);
      else if(route.searchParams.get("date")) params.set("date",route.searchParams.get("date")!);
      if(active) params.set("source","football");
      const response=await fetch("/api/analizador?"+params,{headers:active?{"x-analyzer-access":active}:{}});
      if(!response.ok){const err=await response.json().catch(()=>({}));throw new Error(err.error || "No se pudo consultar el analizador.");}
      return response.json();
    },
  }),[active]);
  return <>
    <div className="identity"><div><img src={brand} alt="" width="42" height="42"/><strong>BetRoyale Club</strong></div>
      <span className="feed">{client.source}</span>
      {paid && <button className="source-button" onClick={()=>active?(setActive(""),setCode("")):setEdit(!edit)}>{active?"Fuente abierta":"Acceso privado"}</button>}
    </div>
    {edit&&paid&&!active&&<form className="access" onSubmit={e=>{e.preventDefault();setActive(code);setEdit(false);}}>
      <label>Código de acceso <input type="password" value={code} onChange={e=>setCode(e.target.value)} required /></label><button>Conectar API-Football</button>
    </form>}
    <MatchAnalyzer key={active?"private":"open"} standalone={client}/>
    <footer>Datos: {active?"API-Football":<><a href="https://www.openligadb.de/">OpenLigaDB</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a></>}. Probabilidades estimadas; no garantizan resultados.</footer>
  </>;
}
createRoot(document.getElementById("root")!).render(<App/>);
