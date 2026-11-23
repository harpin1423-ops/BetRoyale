import { useState } from "react";

const leagues = [[79,"Alemania · 2. Bundesliga"],[40,"Inglaterra · Championship"],[262,"México · Liga MX"],
  [119,"Dinamarca · Superliga"],[233,"Egipto · Premier League"],[239,"Colombia · Primera A"]];
type Result={liga:string;temporada:number;muestra:number;desde:string|null;hasta:string|null;
  marcador:number;corners:number;amarillas:number;xG:number};

export function LeagueCoverage({code}:{code:string}) {
  const [league,setLeague]=useState("79"),[custom,setCustom]=useState(""),[busy,setBusy]=useState(false),
    [err,setErr]=useState(""),[result,setResult]=useState<Result|null>(null);
  async function check(){
    setBusy(true);setResult(null);setErr("");
    try{
      const id=league==="other"?custom:league;
      const r=await fetch("/api/analizador?coverage="+encodeURIComponent(id),{headers:{"x-analyzer-access":code}});
      const data=await r.json();
      if(!r.ok)throw Error(data.error||"No se pudo medir la cobertura.");
      setResult(data);
    }catch(e){setErr(e instanceof Error?e.message:"Servicio no disponible.");}
    finally{setBusy(false);}
  }
  return <details className="hudl-file"><summary>Cobertura por liga</summary>
    <form className="access" onSubmit={e=>{e.preventDefault();void check();}}>
      <label>Liga <select disabled={busy} value={league} onChange={e=>{setLeague(e.target.value);setResult(null);setErr("");}}>
        {leagues.map(([id,label])=><option key={id} value={id}>{label}</option>)}<option value="other">Otra liga</option>
      </select></label>
      {league==="other"&&<label>ID de API-Football <input value={custom} disabled={busy} required pattern="[1-9][0-9]{0,5}" inputMode="numeric" maxLength={6} onChange={e=>{setCustom(e.target.value);setResult(null);setErr("");}}/></label>}
      <button disabled={busy}>{busy?"Consultando…":"Medir cobertura"}</button>
    </form>
    {err&&<p role="alert">{err}</p>}
    {result&&<div role="status"><p><strong>{result.liga}</strong> · Temporada {result.temporada} · {result.muestra?
      result.muestra+" partidos finalizados ("+result.desde+" a "+result.hasta+")":"Sin partidos finalizados para medir"}</p>
      {result.muestra>0&&<table><thead><tr><th>Dato</th><th>Partidos con ambos equipos</th></tr></thead>
        <tbody>{([["Marcador",result.marcador],["Córners",result.corners],["Amarillas",result.amarillas],["xG",result.xG]]).map(([label,n])=>
          <tr key={label}><th scope="row">{label}</th><td>{n} / {result.muestra}</td></tr>)}</tbody></table>}
    </div>}
  </details>;
}
