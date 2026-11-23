import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { MatchAnalyzer } from "../src/pages/admin/MatchAnalyzer";
import { HudlFile } from "./HudlFile";
import "./panel.css";
const brand = new URL("../public/logo_avatar_premium.png", import.meta.url).href;

function App() {
  const [paid,setPaid]=useState(false), [code,setCode]=useState(""), [active,setActive]=useState(""),[edit,setEdit]=useState(false);
  const [hudl,setHudl]=useState(false),[useFootball,setUseFootball]=useState(false);
  useEffect(()=>{fetch("/api/analizador?capabilities=1").then(r=>r.json()).then(v=>{
    setPaid(v.football===true);setUseFootball(v.football===true);setHudl(v.hudl===true);
  }).catch(()=>{});},[]);
  const client=useMemo(()=>({
    source:active && paid && useFootball?"API-Football":"OpenLigaDB",
    async get<T,>(path:string):Promise<T>{
      const route=new URL(path,location.origin), params=new URLSearchParams();
      const id=route.pathname.split("/").pop();
      if(id!=="fixtures") params.set("id",id!);
      else if(route.searchParams.get("date")) params.set("date",route.searchParams.get("date")!);
      if(active && paid && useFootball) params.set("source","football");
      if(active && hudl) params.set("hudl","1");
      const response=await fetch("/api/analizador?"+params,{headers:active?{"x-analyzer-access":active}:{}});
      if(!response.ok){const err=await response.json().catch(()=>({}));throw new Error(err.error || "No se pudo consultar el analizador.");}
      return response.json();
    },
  }),[active,hudl,paid,useFootball]);
  return <>
    <div className="identity"><div><img src={brand} alt="" width="42" height="42"/><strong>BetRoyale Club</strong></div>
      <span className="feed">{client.source}{active && hudl?" + Hudl":""}</span>
      {(paid || hudl) && <button className="source-button" onClick={()=>active?(setActive(""),setCode("")):setEdit(!edit)}>{active?"Salir":"Acceso privado"}</button>}
    </div>
    {edit&&(paid || hudl)&&!active&&<form className="access" onSubmit={e=>{e.preventDefault();setActive(code);setEdit(false);}}>
      <label>Código de acceso <input type="password" value={code} onChange={e=>setCode(e.target.value)} required /></label>
      {hudl && paid && <label>Calendario <select value={useFootball?"football":"open"} onChange={e=>setUseFootball(e.target.value==="football")}><option value="football">API-Football</option><option value="open">OpenLigaDB</option></select></label>}
      <button>Abrir analizador privado</button>
    </form>}
    <div key={active?"private":"open"}><MatchAnalyzer standalone={client}/></div>
    <HudlFile/>
    <footer>Datos: {client.source==="API-Football"?"API-Football":<><a href="https://www.openligadb.de/">OpenLigaDB</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a></>}. Probabilidades estimadas; no garantizan resultados.</footer>
  </>;
}
createRoot(document.getElementById("root")!).render(<App/>);
