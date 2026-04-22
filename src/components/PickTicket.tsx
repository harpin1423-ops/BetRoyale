import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';

/* ─────────────────────── TIPOS ─────────────────────── */
interface PickSelection {
  match_name: string;
  pick: string;
  market_label?: string;
  odds: number | string;
  league_name?: string;
  league?: string;
  country_flag?: string;
  match_time: string;
  score_home?: number | null;
  score_away?: number | null;
}

interface PickData {
  id: number;
  match_name: string;
  pick: string;
  market_label?: string;
  odds: number | string;
  stake: number | string;
  league?: string;
  league_name?: string;
  country_flag?: string;
  match_date: string;
  status: string;
  pick_type?: string;
  pick_type_name?: string;
  pick_type_slug?: string;
  score_home?: number | null;
  score_away?: number | null;
  is_parlay?: boolean;
  selections?: PickSelection[];
}

/* ─────────────── TEMAS POR PLAN ─────────────── */
interface Theme {
  bg: string; panelBg: string; panelBorder: string;
  gold: string; goldSoft: string;
  accent: string; accentSoft: string; accentGlow: string;
  groupLabel: string; groupBg: string; groupBorder: string; groupText: string;
  cardBg: string; cardBorder: string;
  pronColor: string;
}

function getTheme(slug: string, name: string): Theme {
  const s = (slug + name).toLowerCase();

  if (s.includes('free')) return {
    bg: '#040f09',
    panelBg: 'linear-gradient(175deg, #051a0d 0%, #061510 100%)',
    panelBorder: '#10b98130',
    gold: '#d4af37', goldSoft: '#d4af3715',
    accent: '#10b981', accentSoft: '#10b98118', accentGlow: '#10b98155',
    groupLabel: 'FREE', groupBg: '#10b98118', groupBorder: '#10b981', groupText: '#10b981',
    cardBg: '#0a1f14', cardBorder: '#10b98125',
    pronColor: '#34d399',
  };
  if (s.includes('5')) return {
    bg: '#0a0006',
    panelBg: 'linear-gradient(175deg, #1f0010 0%, #2d0018 100%)',
    panelBorder: '#e11d4830',
    gold: '#d4af37', goldSoft: '#d4af3715',
    accent: '#e11d48', accentSoft: '#e11d4818', accentGlow: '#e11d4855',
    groupLabel: 'VIP CUOTA 5+', groupBg: '#e11d4818', groupBorder: '#e11d48', groupText: '#fb7185',
    cardBg: '#160008', cardBorder: '#e11d4825',
    pronColor: '#fb7185',
  };
  if (s.includes('4')) return {
    bg: '#06000f',
    panelBg: 'linear-gradient(175deg, #0e0025 0%, #1a003f 100%)',
    panelBorder: '#7c3aed30',
    gold: '#d4af37', goldSoft: '#d4af3715',
    accent: '#7c3aed', accentSoft: '#7c3aed18', accentGlow: '#7c3aed55',
    groupLabel: 'VIP CUOTA 4+', groupBg: '#7c3aed18', groupBorder: '#7c3aed', groupText: '#a78bfa',
    cardBg: '#0c0018', cardBorder: '#7c3aed28',
    pronColor: '#c4b5fd',
  };
  if (s.includes('3')) return {
    bg: '#00080f',
    panelBg: 'linear-gradient(175deg, #001525 0%, #002540 100%)',
    panelBorder: '#0ea5e930',
    gold: '#d4af37', goldSoft: '#d4af3715',
    accent: '#0ea5e9', accentSoft: '#0ea5e918', accentGlow: '#0ea5e955',
    groupLabel: 'VIP CUOTA 3+', groupBg: '#0ea5e918', groupBorder: '#0ea5e9', groupText: '#38bdf8',
    cardBg: '#00101a', cardBorder: '#0ea5e928',
    pronColor: '#7dd3fc',
  };
  if (s.includes('full') || s.includes('acceso')) return {
    bg: '#060606',
    panelBg: 'linear-gradient(175deg, #0d0d0d 0%, #1a1a1a 100%)',
    panelBorder: '#d4af3730',
    gold: '#d4af37', goldSoft: '#d4af3715',
    accent: '#d4af37', accentSoft: '#d4af3718', accentGlow: '#d4af3755',
    groupLabel: 'FULL ACCESS', groupBg: '#d4af3718', groupBorder: '#d4af37', groupText: '#f5e070',
    cardBg: '#0f0f0f', cardBorder: '#d4af3728',
    pronColor: '#fde68a',
  };
  // Default: VIP 2+
  return {
    bg: '#04080e',
    panelBg: 'linear-gradient(175deg, #040d1c 0%, #061530 100%)',
    panelBorder: '#d4af3728',
    gold: '#d4af37', goldSoft: '#d4af3715',
    accent: '#d4af37', accentSoft: '#d4af3715', accentGlow: '#d4af3750',
    groupLabel: 'VIP CUOTA 2+', groupBg: '#d4af3715', groupBorder: '#d4af37', groupText: '#f5e070',
    cardBg: '#080e1a', cardBorder: '#d4af3722',
    pronColor: '#fde68a',
  };
}

/* ─────────────── ESTADO CONFIG ─────────────── */
const STATUS: Record<string, { label: string; color: string; bg: string; glow: string }> = {
  pending: { label: 'PENDIENTE', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', glow: '#fbbf2444' },
  won:     { label: 'GANADO',    color: '#10b981', bg: 'rgba(16,185,129,0.12)',  glow: '#10b98144' },
  lost:    { label: 'PERDIDO',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   glow: '#ef444444' },
  void:    { label: 'NULO',      color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', glow: '#94a3b844' },
};

/* ─────────────── HELPERS ─────────────── */
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + ' COL (GMT-5)';
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
}
function flagEmoji(code?: string) {
  if (!code) return '';
  if (code.length === 2) {
    return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
  }
  return code;
}

/* ─────────────── LOGO SVG (inline, no CORS) ─────────────── */
const BetRoyaleLogo = ({ gold }: { gold: string }) => (
  <svg width="180" height="44" viewBox="0 0 180 44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="logoGold" x1="0" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#b8922a"/>
        <stop offset="40%" stopColor="#f5e070"/>
        <stop offset="70%" stopColor="#d4af37"/>
        <stop offset="100%" stopColor="#b8922a"/>
      </linearGradient>
    </defs>
    {/* Corona */}
    <path d="M8 34 L4 14 L14 22 L22 8 L30 22 L40 14 L36 34 Z"
      fill="url(#logoGold)" stroke="#f5e07055" strokeWidth="0.5"/>
    <rect x="6" y="34" width="32" height="4" rx="2" fill="url(#logoGold)"/>
    {/* Texto BETROYALE */}
    <text x="48" y="28" fontFamily="'Inter','Segoe UI',sans-serif"
      fontWeight="900" fontSize="22" letterSpacing="2" fill="url(#logoGold)">BETROYALE</text>
    {/* Texto CLUB */}
    <text x="48" y="40" fontFamily="'Inter','Segoe UI',sans-serif"
      fontWeight="500" fontSize="11" letterSpacing="4" fill="#94a3b8">CLUB</text>
  </svg>
);

/* ═══════════════════ COMPONENTE PRINCIPAL ═══════════════════ */
export function PickTicket({ pick }: { pick: PickData }) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const theme = getTheme(pick.pick_type_slug || pick.pick_type || '', pick.pick_type_name || '');
  const st = STATUS[pick.status] || STATUS.pending;
  const isResolved = pick.status !== 'pending';
  const isParlay = Boolean(pick.is_parlay);
  const leagueName = pick.league_name || pick.league || '';
  const pronLabel = pick.market_label || pick.pick || '';
  const numSel = pick.selections?.length || 0;

  const downloadTicket = async () => {
    if (!ticketRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(ticketRef.current, {
        scale: 3, useCORS: true, allowTaint: true,
        backgroundColor: theme.bg, logging: false,
      });
      const link = document.createElement('a');
      link.download = `BetRoyale-${isParlay ? 'Parlay' : 'Pick'}-${pick.id}-${pick.status}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) { console.error(e); }
    finally { setIsGenerating(false); }
  };

  /* ── Layout constants ── */
  const W = 800, LEFT_W = 210;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      fontFamily: "'Inter','Segoe UI',sans-serif" }}>

      {/* ════════════ TICKET (lo que se captura) ════════════ */}
      <div ref={ticketRef} style={{
        width: W, background: theme.bg, position: 'relative', overflow: 'hidden',
        boxShadow: `0 0 0 1px ${theme.gold}25, 0 20px 60px rgba(0,0,0,0.8), 0 0 80px ${theme.accentGlow}`,
      }}>
        {/* Glow de fondo */}
        <div style={{ position:'absolute', top:-120, left:-120, width:400, height:400, borderRadius:'50%',
          background:`radial-gradient(circle, ${theme.accentGlow} 0%, transparent 65%)`, pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:-100, right:-80, width:320, height:320, borderRadius:'50%',
          background:`radial-gradient(circle, ${theme.goldSoft} 0%, transparent 65%)`, pointerEvents:'none' }}/>
        {/* Líneas de textura diagonales sutiles */}
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', opacity:0.025,
          backgroundImage:'repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 12px)' }}/>

        {/* ── HEADER ── */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'18px 24px 16px',
          background:'rgba(255,255,255,0.02)',
          borderBottom:`1px solid ${theme.gold}20`,
          position:'relative', zIndex:2,
        }}>
          <BetRoyaleLogo gold={theme.gold} />
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
            {/* Grupo */}
            <div style={{
              padding:'5px 16px', borderRadius:6,
              background: theme.groupBg,
              border:`1.5px solid ${theme.groupBorder}`,
              color: theme.groupText,
              fontSize:13, fontWeight:900, letterSpacing:1.5,
            }}>{theme.groupLabel}</div>
            {/* Estado */}
            <div style={{
              padding:'3px 12px', borderRadius:20,
              background: st.bg, border:`1px solid ${st.color}55`,
              color: st.color, fontSize:11, fontWeight:700, letterSpacing:1,
              display:'flex', alignItems:'center', gap:5,
            }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:st.color,
                boxShadow:`0 0 6px ${st.color}`, display:'inline-block' }}/>
              {st.label}
            </div>
            {/* Tipo */}
            {isParlay && (
              <div style={{
                padding:'3px 12px', borderRadius:20,
                background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.3)',
                color:'#818cf8', fontSize:10, fontWeight:700, letterSpacing:1.5,
              }}>▶ PARLAY {numSel} SEL.</div>
            )}
          </div>
        </div>

        {/* ── STATUS BANNER (si resuelto) ── */}
        {isResolved && (
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            padding:'7px 0',
            background: st.bg,
            borderBottom:`1px solid ${st.color}44`,
            position:'relative', zIndex:3,
          }}>
            <div style={{ width:30, height:1, background:`linear-gradient(90deg,transparent,${st.color})` }}/>
            <span style={{ fontSize:12, fontWeight:900, letterSpacing:4, color:st.color, textTransform:'uppercase' }}>
              {st.label}
              {!isParlay && pick.score_home != null && pick.score_away != null &&
                ` · ${pick.score_home} — ${pick.score_away}`}
            </span>
            <div style={{ width:30, height:1, background:`linear-gradient(90deg,${st.color},transparent)` }}/>
          </div>
        )}

        {/* ── BODY ── */}
        <div style={{ display:'flex', position:'relative', zIndex:2 }}>

          {/* Panel Izquierdo */}
          <div style={{
            width: LEFT_W, flexShrink:0,
            background: theme.panelBg,
            borderRight:`1px solid ${theme.panelBorder}`,
            display:'flex', flexDirection:'column', justifyContent:'space-between',
            padding:'22px 18px',
          }}>
            <div>
              {/* Título del tipo */}
              <div style={{ fontSize: isParlay ? 32 : 20, fontWeight:900, color:'#f1f5f9',
                letterSpacing: isParlay ? 3 : 1, marginBottom:2 }}>
                {isParlay ? 'PARLAY' : 'PICK'}
              </div>
              <div style={{ fontSize:10, fontWeight:700, letterSpacing:2.5, color: theme.accent,
                textTransform:'uppercase', marginBottom:18 }}>
                {isParlay ? `${numSel} selecciones` : 'Pick simple'}
              </div>

              {/* Línea dorada decorativa */}
              <div style={{ height:1, background:`linear-gradient(90deg,${theme.gold}70,transparent)`, marginBottom:18 }}/>

              {/* Stake */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:2, textTransform:'uppercase', marginBottom:3 }}>Stake</div>
                <div style={{ fontSize:22, fontWeight:900, color:'#cbd5e1' }}>{pick.stake}<span style={{fontSize:14,color:'#64748b'}}>u</span></div>
              </div>

              {/* Cuota total — protagonista del panel */}
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:2, textTransform:'uppercase', marginBottom:3 }}>Cuota Total</div>
                <div style={{ fontSize:46, fontWeight:900, color: theme.gold, lineHeight:1,
                  textShadow:`0 0 24px ${theme.accentGlow}` }}>
                  @{pick.odds}
                </div>
              </div>
            </div>

            {/* CTA */}
            <div style={{
              borderTop:`1px solid rgba(255,255,255,0.06)`,
              paddingTop:14, marginTop:14,
            }}>
              <div style={{ fontSize:10, color:'#64748b', marginBottom:3 }}>Únete a BetRoyale Club</div>
              <div style={{ fontSize:13, fontWeight:800, color: theme.gold }}>betroyaleclub.com</div>
              <div style={{ fontSize:9, fontStyle:'italic', color:'#475569', marginTop:3 }}>
                Invirtiendo con Inteligencia
              </div>
            </div>
          </div>

          {/* Panel Derecho — selecciones */}
          <div style={{ flex:1, padding:'16px 18px', display:'flex', flexDirection:'column', gap:10 }}>

            {!isParlay ? (
              /* ── PICK SIMPLE ── */
              <>
                <div style={{ fontSize:11, fontWeight:700, color:theme.accent,
                  letterSpacing:1.5, textTransform:'uppercase', marginBottom:4 }}>
                  {flagEmoji(pick.country_flag)} {leagueName}
                </div>
                <div style={{ fontSize:24, fontWeight:900, color:'#f1f5f9', lineHeight:1.2, marginBottom:8 }}>
                  {pick.match_name}
                </div>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:14 }}>
                  📅 {fmtDate(pick.match_date)} &nbsp;·&nbsp; 🕐 {fmtTime(pick.match_date)}
                </div>
                {/* Pronóstico — protagonista */}
                <div style={{
                  background: theme.accentSoft, border:`1.5px solid ${theme.accent}44`,
                  borderRadius:14, padding:'16px 18px',
                  borderLeft:`4px solid ${theme.accent}`,
                }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#64748b', letterSpacing:2,
                    textTransform:'uppercase', marginBottom:6 }}>Pronóstico</div>
                  <div style={{ fontSize:28, fontWeight:900, color: theme.pronColor, lineHeight:1.1 }}>
                    {pronLabel}
                  </div>
                </div>
              </>
            ) : (
              /* ── PARLAY: tarjetas ── */
              (pick.selections || []).map((sel, i) => {
                const pron = sel.market_label || sel.pick || '';
                const flag = flagEmoji(sel.country_flag);
                const league = sel.league_name || sel.league || '';
                const hasScore = sel.score_home != null && sel.score_away != null;

                return (
                  <div key={i} style={{
                    background: theme.cardBg,
                    border:`1px solid ${theme.cardBorder}`,
                    borderLeft:`3px solid ${theme.accent}`,
                    borderRadius:10, padding:'11px 14px',
                    position:'relative',
                  }}>
                    {/* Resultado si resuelto */}
                    {hasScore && (
                      <div style={{
                        position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                        fontSize:13, fontWeight:900, color:st.color,
                        background:`${st.color}15`, padding:'3px 8px', borderRadius:6,
                        border:`1px solid ${st.color}30`,
                      }}>{sel.score_home} - {sel.score_away}</div>
                    )}

                    {/* Liga + país */}
                    <div style={{ fontSize:9, fontWeight:700, color:theme.accent,
                      letterSpacing:1.5, textTransform:'uppercase', marginBottom:5,
                      display:'flex', alignItems:'center', gap:4 }}>
                      {flag} {flag ? '·' : ''} {league}
                    </div>

                    {/* Partido */}
                    <div style={{ fontSize:14, fontWeight:800, color:'#e2e8f0',
                      marginBottom:8, paddingRight: hasScore ? 80 : 0, lineHeight:1.2 }}>
                      {sel.match_name}
                    </div>

                    {/* Pronóstico — protagonista */}
                    <div style={{ fontSize:17, fontWeight:900, color: theme.pronColor,
                      marginBottom:8, lineHeight:1 }}>
                      {pron}
                    </div>

                    {/* Hora + cuota */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      paddingTop:7, borderTop:`1px solid rgba(255,255,255,0.06)` }}>
                      <span style={{ fontSize:11, color:'#64748b', fontWeight:500 }}>
                        🕐 {fmtTime(sel.match_time)}
                      </span>
                      <span style={{
                        fontSize:14, fontWeight:900, color: theme.gold,
                        background: theme.goldSoft,
                        border:`1px solid ${theme.gold}44`,
                        padding:'2px 10px', borderRadius:20,
                      }}>@{sel.odds}</span>
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
          padding:'10px 24px',
          borderTop:`1px solid ${theme.gold}20`,
          background:'rgba(0,0,0,0.35)',
          position:'relative', zIndex:2,
        }}>
          <span style={{ fontSize:12, fontWeight:800, color: theme.gold }}>betroyaleclub.com</span>
          <span style={{ color: theme.gold, fontSize:6, opacity:0.5 }}>◆</span>
          <span style={{ fontSize:11, color:'#475569', fontStyle:'italic' }}>Invirtiendo con Inteligencia</span>
          <span style={{ color: theme.gold, fontSize:6, opacity:0.5 }}>◆</span>
          <span style={{ fontSize:11, color:'#475569' }}>@BetRoyaleClub</span>
        </div>
      </div>

      {/* ── BOTÓN DESCARGA (fuera del ref — NO aparece en la imagen) ── */}
      <button
        onClick={downloadTicket}
        disabled={isGenerating}
        style={{
          width: W,
          background: isGenerating ? '#374151' : `linear-gradient(90deg, ${theme.accent}, ${theme.gold})`,
          color: '#000', fontWeight:800, fontSize:14,
          padding:'13px 0', borderRadius:10, border:'none',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          opacity: isGenerating ? 0.6 : 1, letterSpacing:1,
          transition:'all 0.2s',
        }}
      >
        {isGenerating ? '⏳ Generando imagen HD...' : '📥 Descargar Ticket HD (3x resolución)'}
      </button>
    </div>
  );
}
