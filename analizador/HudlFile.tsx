import {useRef,useState} from "react";
import {aggregateEvents} from "../server/services/statsBombMetrics.mjs";

type Row={name:string;shots:number;xg:number|null;sca:number|null};
const fmt=(v:number|null)=>v==null?"Sin dato":v.toLocaleString("es-CO",{maximumFractionDigits:2});
export function HudlFile(){
  const [rows,setRows]=useState<Row[]>([]),[note,setNote]=useState(""),generation=useRef(0);
  async function inspect(file?:File){
    const id=++generation.current;
    setRows([]);setNote("");
    if(!file) return;
    if(file.size>12*1024*1024){setNote("El archivo supera el límite de 12 MB.");return;}
    try {
      const events=JSON.parse(await file.text());
      if(id!==generation.current) return;
      if(!Array.isArray(events)) throw new Error();
      const teams=new Map<number,string>();
      for(const e of events) if(e?.type?.name==="Starting XI" && e.team?.name) teams.set(e.team.id,e.team.name);
      const result=aggregateEvents(events,[...teams.keys()]);
      if(!result) throw new Error();
      setRows([...teams].map(([key,name])=>({name,...result.teams.get(key)})));
      setNote("Tiempo reglamentario. El archivo no se sube ni modifica tus pronósticos.");
    }catch{if(id===generation.current)setNote("No se reconoció un partido completo. Elige el JSON de eventos de StatsBomb, no el de alineaciones o partidos.");}
  }
  return <details className="hudl-file"><summary>Hudl StatsBomb · Revisar archivo de eventos</summary>
    <label>Archivo JSON de un partido <input type="file" accept=".json,application/json" onChange={e=>void inspect(e.target.files?.[0])}/></label>
    <p role="status">{note}</p>
    {!!rows.length && <table><thead><tr><th>Equipo</th><th>Remates</th><th>xG</th><th>SCA/90*</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.name}><th scope="row">{r.name}</th><td>{r.shots}</td><td>{fmt(r.xg)}</td><td>{fmt(r.sca)}</td></tr>)}</tbody></table>}
    {!!rows.length && <p>*Estimación propia a partir de las acciones previas al tiro. Un archivo aislado no permite entrenar xT.</p>}
  </details>;
}
