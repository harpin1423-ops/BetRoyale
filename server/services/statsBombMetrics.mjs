// StatsBomb uses attacking coordinates on a 120 x 80 pitch. Extra time is excluded.
const cells = 24;
function cell(point) {
  if (!Array.isArray(point) || point.length < 2) return null;
  const [x,y] = point;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x<0 || x>120 || y<0 || y>80) return null;
  return Math.min(3,Math.floor(y/20))*6 + Math.min(5,Math.floor(x/20));
}
function elapsed(time) {
  const m = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)$/.exec(time);
  return m ? Number(m[1])*60 + Number(m[2]) + Number(m[3])/60 : 0;
}
const vec = n=>Array(n).fill(0);
export function aggregateEvents(events, ids) {
  if (!Array.isArray(events) || ids.length!==2 || ids[0]===ids[1] || !ids.every(Number.isSafeInteger)) return null;
  const teams = new Map(ids.map(id=>[id,{shots:0,xg:0,sca:0,moves:vec(cells*cells),located:true,actions:0}]));
  const attempts=vec(cells), rewards=vec(cells), transitions=vec(cells*cells), halves=[0,0];
  let phase, chain=[], validPossessions=true, usableGrid=true;
  for (const e of events.filter(e=>e?.period===1 || e?.period===2).sort((a,b)=>a.index-b.index)) {
    const type=e.type?.name, t=teams.get(e.team?.id);
    if (type==="Half End") {
      if (e.half_end?.early_video_end) return null;
      halves[e.period-1]=Math.max(halves[e.period-1],elapsed(e.timestamp));
    }
    if (!t) continue;
    const key=e.period+"/"+e.possession+"/"+e.possession_team?.id;
    if (key!==phase) {chain=[];phase=key;}
    const onBall=e.team.id===e.possession_team?.id;
    const move=type==="Pass" || type==="Carry";
    if (move || type==="Shot") {
      t.actions++;
      const start=cell(e.location);
      if (start===null) {t.located=false;usableGrid=false;}
      else attempts[start]++;
      if (!Number.isSafeInteger(e.possession) || !e.possession_team?.id) validPossessions=false;
      if (type==="Shot") {
        t.shots++;
        const xg=e.shot?.statsbomb_xg;
        if (!Number.isFinite(xg) || xg<0 || xg>1) {t.xg=null;usableGrid=false;}
        else {if(t.xg!==null) t.xg+=xg; if(start!==null) rewards[start]+=xg;}
        if(onBall) t.sca+=chain.length;
        chain=[];
      } else {
        const ok=type==="Carry" || !e.pass?.outcome;
        if (ok) {
          const end=cell((type==="Carry"?e.carry:e.pass)?.end_location);
          if (end===null) {t.located=false;usableGrid=false;}
          else if(start!==null) {t.moves[start*cells+end]++;transitions[start*cells+end]++;}
        }
        if (ok && onBall) chain=[...chain.slice(-1),type];
        else chain=[];
      }
    } else if(type==="Dribble" && onBall) {
      chain=e.dribble?.outcome?.name==="Complete"?[...chain.slice(-1),type]:[];
    } else if(type==="Dispossessed" || type==="Miscontrol" || e.out) chain=[];
  }
  if (halves.some(m=>m<40) || [...teams.values()].some(t=>!t.actions)) return null;
  for(const t of teams.values()) t.sca=validPossessions?t.sca*90/(halves[0]+halves[1]):null;
  return {teams,attempts,rewards,transitions,usableGrid,shots:[...teams.values()].reduce((a,t)=>a+t.shots,0)};
}

// A local, coarse xT baseline, trained without the game being evaluated.
export function fitThreat(samples) {
  const games=samples.filter(x=>x?.usableGrid);
  if(games.length<5 || games.reduce((n,g)=>n+g.shots,0)<80) return null;
  const sums=(key,length)=>games.reduce((acc,g)=>acc.map((v,i)=>v+g[key][i]),vec(length));
  const n=sums("attempts",cells), r=sums("rewards",cells), moves=sums("transitions",cells*cells);
  if(n.some(count=>count<3)) return null;
  let grid=vec(cells);
  for(let it=0;it<300;it++) {
    const next=n.map((count,i)=>grid.reduce((v,val,j)=>v+val*moves[i*cells+j],r[i])/count);
    if(next.every((v,i)=>Math.abs(v-grid[i])<0.000001)) return next;
    grid=next;
  }
  return null;
}
export function netThreat(t,grid) {
  if(!grid || !t.located) return null;
  return t.moves.reduce((total,count,k)=>total+count*(grid[k%cells]-grid[Math.floor(k/cells)]),0);
}
