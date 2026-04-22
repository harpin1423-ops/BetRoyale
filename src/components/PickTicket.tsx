import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';

/* ─────────── TIPOS ─────────── */
interface PickSelection {
  match_name: string; pick: string; market_label?: string;
  odds: number | string; league_name?: string; league?: string;
  country_flag?: string; match_time: string;
  score_home?: number | null; score_away?: number | null;
}
interface PickData {
  id: number; match_name: string; pick: string; market_label?: string;
  odds: number | string; stake: number | string;
  league?: string; league_name?: string; country_flag?: string;
  match_date: string; status: string;
  pick_type?: string; pick_type_name?: string; pick_type_slug?: string;
  score_home?: number | null; score_away?: number | null;
  is_parlay?: boolean; selections?: PickSelection[];
}

/* ─────────── ESTADO ─────────── */
const STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: 'PENDIENTE', color: '#f59e0b', bg: '#f59e0b18', border: '#f59e0b55' },
  won:     { label: 'GANADO',    color: '#10b981', bg: '#10b98118', border: '#10b98155' },
  lost:    { label: 'PERDIDO',   color: '#ef4444', bg: '#ef444418', border: '#ef444455' },
  void:    { label: 'NULO',      color: '#94a3b8', bg: '#94a3b818', border: '#94a3b855' },
};

/* ─────────── TEMA POR GRUPO ─────────── */
function getGroupLabel(slug: string, name: string): string {
  const s = (slug + name).toLowerCase();
  if (s.includes('free')) return 'FREE';
  if (s.includes('5')) return 'VIP CUOTA 5+';
  if (s.includes('4')) return 'VIP CUOTA 4+';
  if (s.includes('3')) return 'VIP CUOTA 3+';
  if (s.includes('full') || s.includes('acceso')) return 'FULL ACCESS';
  return 'VIP CUOTA 2+';
}

/* ─────────── HELPERS ─────────── */
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase();
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
}
function flagEmoji(code?: string) {
  if (!code || code.length !== 2) return code || '';
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
function calcProfit(stake: number | string, odds: number | string): string {
  const s = parseFloat(String(stake));
  const o = parseFloat(String(odds));
  if (isNaN(s) || isNaN(o)) return '0';
  return ((s * o) - s).toFixed(2);
}
function calcYield(stake: number | string, odds: number | string): string {
  const s = parseFloat(String(stake));
  const o = parseFloat(String(odds));
  if (isNaN(s) || isNaN(o) || s === 0) return '0';
  return (((o - 1) * 100)).toFixed(0);
}

/* ─────────── LOGO SVG CIRCULAR ─────────── */
const BrLogo = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="brGold" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#c9a227"/>
        <stop offset="50%" stopColor="#f5e070"/>
        <stop offset="100%" stopColor="#c9a227"/>
      </linearGradient>
    </defs>
    <circle cx="24" cy="24" r="23" fill="#0d0d1a" stroke="url(#brGold)" strokeWidth="1.5"/>
    {/* Corona */}
    <path d="M12 32 L11 18 L18 24 L24 13 L30 24 L37 18 L36 32 Z"
      fill="url(#brGold)" opacity="0.9"/>
    <rect x="12" y="32" width="24" height="3" rx="1.5" fill="url(#brGold)"/>
  </svg>
);

/* ═══════ COMPONENTE PRINCIPAL ═══════ */
export function PickTicket({ pick }: { pick: PickData }) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);

  const st = STATUS[pick.status] || STATUS.pending;
  const isParlay = Boolean(pick.is_parlay);
  const isWon = pick.status === 'won';
  const isResolved = pick.status !== 'pending';
  const groupLabel = getGroupLabel(pick.pick_type_slug || pick.pick_type || '', pick.pick_type_name || '');
  const numSel = pick.selections?.length || 0;
  const leagueName = pick.league_name || pick.league || '';
  const pronLabel = pick.market_label || pick.pick || '';

  const profit = calcProfit(pick.stake, pick.odds);
  const yieldPct = calcYield(pick.stake, pick.odds);

  const download = async () => {
    if (!ticketRef.current) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(ticketRef.current, {
        scale: 3, useCORS: true, allowTaint: true,
        backgroundColor: '#080c18', logging: false,
      });
      const a = document.createElement('a');
      a.download = `BetRoyale-${isParlay ? 'Parlay' : 'Pick'}-${pick.id}-${pick.status}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  };

  /* ── Colores base ── */
  const bg = '#080c18';
  const cardBg = '#0d1220';
  const gold = '#d4af37';
  const goldLight = '#f5e070';
  const panelBg = '#0a0e1c';

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14,
      fontFamily:"'Inter','Segoe UI',Arial,sans-serif" }}>

      {/* ══════════ TICKET ══════════ */}
      <div ref={ticketRef} style={{
        width: 800, background: bg, position:'relative', overflow:'hidden',
        boxShadow:`0 0 0 1px ${gold}22, 0 24px 80px rgba(0,0,0,0.85)`,
      }}>

        {/* Glow ambiental */}
        <div style={{ position:'absolute', top:-80, left:-80, width:300, height:300, borderRadius:'50%',
          background:'radial-gradient(circle,rgba(212,175,55,0.1) 0%,transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:-80, right:-80, width:280, height:280, borderRadius:'50%',
          background:'radial-gradient(circle,rgba(16,185,129,0.06) 0%,transparent 70%)', pointerEvents:'none' }}/>
        {/* Textura sutil */}
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0.02,
          backgroundImage:'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 1px,transparent 10px)' }}/>

        {/* ── HEADER ── */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 20px',
          background:'linear-gradient(135deg,#0d1220 0%,#080c18 100%)',
          borderBottom:`1px solid ${gold}20`,
          position:'relative', zIndex:2,
          gap: 12,
        }}>
          {/* Logo + nombre */}
          <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <BrLogo />
            <div>
              <div style={{
                fontSize:20, fontWeight:900, letterSpacing:2.5,
                background:`linear-gradient(90deg,${gold},${goldLight},${gold})`,
                WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
              }}>BETROYALE CLUB</div>
              <div style={{ fontSize:9, fontWeight:600, letterSpacing:3, color:'#475569',
                textTransform:'uppercase', marginTop:2 }}>Invirtiendo con Inteligencia</div>
            </div>
          </div>

          {/* Badges derecha — apilados verticalmente */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
            {/* Grupo */}
            <div style={{
              padding:'5px 14px', borderRadius:6,
              background:`${gold}18`, border:`1.5px solid ${gold}`,
              color: goldLight, fontSize:11, fontWeight:900, letterSpacing:1.5,
              whiteSpace:'nowrap',
            }}>{groupLabel}</div>

            {/* Estado */}
            <div style={{
              padding:'4px 14px', borderRadius:20,
              background: st.bg, border:`1.5px solid ${st.border}`,
              color: st.color, fontSize:12, fontWeight:900, letterSpacing:1.5,
              whiteSpace:'nowrap',
            }}>{st.label}</div>

            {/* Tipo (parlay) */}
            {isParlay && (
              <div style={{
                padding:'3px 12px', borderRadius:20,
                background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.35)',
                color:'#818cf8', fontSize:10, fontWeight:700, letterSpacing:1.5,
                whiteSpace:'nowrap',
              }}>PARLAY · {numSel} SELECCIONES</div>
            )}
          </div>
        </div>

        {/* ── BARRA DE FECHA ── */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'flex-start',
          padding:'8px 20px',
          background:'rgba(0,0,0,0.25)',
          borderBottom:`1px solid rgba(255,255,255,0.04)`,
          position:'relative', zIndex:2,
        }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background: gold,
            boxShadow:`0 0 6px ${gold}`, display:'inline-block', marginRight:10, flexShrink:0 }}/>
          <span style={{ fontSize:11, fontWeight:600, color:'#94a3b8', letterSpacing:1 }}>
            {fmtDate(pick.match_date)} · COL (GMT-5)
          </span>
        </div>

        {/* ── BODY ── */}
        <div style={{ display:'flex', position:'relative', zIndex:2 }}>

          {/* Panel Izquierdo */}
          <div style={{
            width:200, flexShrink:0,
            background:`linear-gradient(175deg,${panelBg} 0%,#080c18 100%)`,
            borderRight:`1px solid ${gold}18`,
            display:'flex', flexDirection:'column', justifyContent:'space-between',
            padding:'22px 18px',
            minHeight:340,
          }}>
            <div>
              <div style={{ fontSize:32, fontWeight:900, color:'#f1f5f9', letterSpacing:3, marginBottom:2 }}>
                {isParlay ? 'PARLAY' : 'PICK'}
              </div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, color: gold,
                textTransform:'uppercase', marginBottom:18 }}>
                {isParlay ? `${numSel} selecciones` : 'Pick simple'}
              </div>
              <div style={{ height:1, background:`linear-gradient(90deg,${gold}60,transparent)`, marginBottom:18 }}/>

              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:2,
                  textTransform:'uppercase', marginBottom:3 }}>Stake</div>
                <div style={{ fontSize:26, fontWeight:900, color:'#e2e8f0' }}>
                  {pick.stake}<span style={{ fontSize:14, color:'#64748b' }}>u</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:2,
                  textTransform:'uppercase', marginBottom:4 }}>Cuota Total</div>
                <div style={{ fontSize:44, fontWeight:900, color: gold, lineHeight:1,
                  textShadow:`0 0 20px ${gold}55` }}>
                  @{pick.odds}
                </div>
              </div>

              {/* Bloque PROFIT — solo cuando GANADO */}
              {isWon && (
                <div style={{
                  marginTop:18, padding:'12px 14px', borderRadius:10,
                  background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)',
                }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:2,
                    textTransform:'uppercase', marginBottom:6 }}>Profit</div>
                  <div style={{ fontSize:26, fontWeight:900, color:'#10b981', marginBottom:8 }}>
                    +{profit}u
                  </div>
                  <div style={{ display:'flex', gap:14 }}>
                    <div>
                      <div style={{ fontSize:8, color:'#475569', letterSpacing:1.5, textTransform:'uppercase', marginBottom:2 }}>Yield</div>
                      <div style={{ fontSize:13, fontWeight:800, color:'#10b981' }}>{yieldPct}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize:8, color:'#475569', letterSpacing:1.5, textTransform:'uppercase', marginBottom:2 }}>Ganancia</div>
                      <div style={{ fontSize:13, fontWeight:800, color:'#f1f5f9' }}>+{profit}u</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <div style={{ borderTop:`1px solid rgba(255,255,255,0.06)`, paddingTop:14 }}>
              <div style={{ fontSize:10, color:'#64748b', marginBottom:2 }}>Únete a BetRoyale Club</div>
              <div style={{ fontSize:13, fontWeight:800, color: gold }}>betroyaleclub.com</div>
              <div style={{ fontSize:9, fontStyle:'italic', color:'#475569', marginTop:3, lineHeight:1.4 }}>
                Análisis, disciplina y gestión de banca.
              </div>
            </div>
          </div>

          {/* Panel Derecho — selecciones */}
          <div style={{ flex:1, padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>

            {!isParlay ? (
              /* ── PICK SIMPLE ── */
              <>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5,
                  color:'#10b981', textTransform:'uppercase', marginBottom:4,
                  display:'flex', alignItems:'center', gap:5 }}>
                  {flagEmoji(pick.country_flag)}&nbsp;{leagueName}
                </div>
                <div style={{ fontSize:22, fontWeight:900, color:'#f1f5f9', lineHeight:1.2, marginBottom:6 }}>
                  {pick.match_name}
                </div>
                <div style={{ fontSize:10, color:'#64748b', marginBottom:14 }}>
                  {fmtTime(pick.match_date)} COL (GMT-5)
                </div>
                <div style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${gold}22`,
                  borderLeft:`3px solid ${gold}`, borderRadius:10, padding:'14px 16px' }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:2,
                    textTransform:'uppercase', marginBottom:6 }}>Pronóstico</div>
                  <div style={{ fontSize:26, fontWeight:900, color:'#f8fafc' }}>{pronLabel}</div>
                </div>
                {isResolved && pick.score_home != null && pick.score_away != null && (
                  <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginTop:4 }}>
                    Resultado: {pick.score_home}-{pick.score_away}
                  </div>
                )}
              </>
            ) : (
              /* ── PARLAY ── */
              (pick.selections || []).map((sel, i) => {
                const pron = sel.market_label || sel.pick || '';
                const flag = flagEmoji(sel.country_flag);
                const league = sel.league_name || sel.league || '';
                const hasScore = sel.score_home != null && sel.score_away != null;

                return (
                  <div key={i} style={{
                    background: cardBg,
                    border:`1px solid rgba(255,255,255,0.06)`,
                    borderLeft:`3px solid ${gold}`,
                    borderRadius:8, padding:'11px 14px',
                    display:'flex', justifyContent:'space-between', alignItems:'stretch',
                  }}>
                    {/* Lado izquierdo */}
                    <div style={{ flex:1, paddingRight:12 }}>
                      {/* Liga */}
                      <div style={{ fontSize:9, fontWeight:700, letterSpacing:1.5,
                        color:'#10b981', textTransform:'uppercase', marginBottom:5,
                        display:'flex', alignItems:'center', gap:5 }}>
                        {flag && <span>{flag}</span>}
                        {flag && <span style={{ color:'#334155' }}>·</span>}
                        <span style={{ color:'#64748b' }}>{league.toUpperCase()}</span>
                      </div>
                      {/* Partido */}
                      <div style={{ fontSize:14, fontWeight:800, color:'#e2e8f0',
                        marginBottom:7, lineHeight:1.2 }}>
                        {sel.match_name}
                      </div>
                      {/* Pronóstico — protagonista */}
                      <div style={{ fontSize:9, fontWeight:700, color:'#475569',
                        letterSpacing:1.5, textTransform:'uppercase', marginBottom:3 }}>
                        Pronóstico
                      </div>
                      <div style={{ fontSize:16, fontWeight:900, color:'#f1f5f9', lineHeight:1 }}>
                        {pron}
                      </div>
                      {/* Resultado si resuelto */}
                      {hasScore && (
                        <div style={{ fontSize:10, fontWeight:600, color:'#64748b', marginTop:6 }}>
                          Resultado: {sel.score_home}-{sel.score_away}
                        </div>
                      )}
                    </div>

                    {/* Lado derecho — hora + cuota */}
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end',
                      justifyContent:'space-between', flexShrink:0, minWidth:70 }}>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:8, fontWeight:700, color:'#475569',
                          letterSpacing:1.5, textTransform:'uppercase', marginBottom:3 }}>Hora</div>
                        <div style={{ fontSize:13, fontWeight:800, color:'#cbd5e1', lineHeight:1 }}>
                          {fmtTime(sel.match_time)} COL
                        </div>
                        <div style={{ fontSize:9, color:'#475569', marginTop:1 }}>GMT-5</div>
                      </div>
                      <div style={{
                        marginTop:8, padding:'4px 12px', borderRadius:20,
                        background:`${gold}18`, border:`1.5px solid ${gold}55`,
                        color: goldLight, fontSize:14, fontWeight:900,
                        whiteSpace:'nowrap',
                      }}>@{sel.odds}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          padding:'10px 20px',
          borderTop:`1px solid ${gold}18`,
          background:'rgba(0,0,0,0.3)',
          position:'relative', zIndex:2,
        }}>
          <span style={{ fontSize:12, fontWeight:800, color: gold }}>betroyaleclub.com</span>
          <span style={{ color: gold, fontSize:7, opacity:0.5 }}>•</span>
          <span style={{ fontSize:11, color:'#475569' }}>Invirtiendo con Inteligencia</span>
          <span style={{ color: gold, fontSize:7, opacity:0.5 }}>•</span>
          <span style={{ fontSize:11, color:'#475569' }}>@BetRoyaleClub</span>
        </div>
      </div>

      {/* Botón descarga — FUERA del ticket, no aparece en la imagen */}
      <button onClick={download} disabled={generating} style={{
        width:800, padding:'13px 0', borderRadius:10, border:'none',
        background: generating ? '#1e293b' : `linear-gradient(90deg,#c9a227,${goldLight},#c9a227)`,
        color:'#000', fontWeight:800, fontSize:14, letterSpacing:1,
        cursor: generating ? 'not-allowed' : 'pointer',
        opacity: generating ? 0.5 : 1,
      }}>
        {generating ? '⏳ Generando imagen...' : '📥 Descargar Ticket HD'}
      </button>
    </div>
  );
}
