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
  analysis?: string;
}

interface PickTicketProps {
  pick: PickData;
}

/* ─────────────── TEMAS POR TIPO DE PLAN ─────────────── */
interface Theme {
  bg: string;
  leftPanelBg: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  groupBg: string;
  groupBorder: string;
  groupText: string;
  glow1: string;
  glow2: string;
  cardBorder: string;
  oddsColor: string;
  label: string;
}

function getTheme(pickTypeName: string, pickTypeSlug: string): Theme {
  const name = (pickTypeName || pickTypeSlug || '').toLowerCase();

  if (name.includes('free') || pickTypeSlug === 'free') {
    return {
      bg: '#050f0a', leftPanelBg: 'linear-gradient(160deg,#031a0d 0%,#071f10 100%)',
      accent: '#10b981', accentSoft: 'rgba(16,185,129,0.15)', accentText: '#10b981',
      groupBg: 'rgba(16,185,129,0.12)', groupBorder: '#10b981', groupText: '#10b981',
      glow1: 'rgba(16,185,129,0.25)', glow2: 'rgba(212,175,55,0.15)',
      cardBorder: 'rgba(16,185,129,0.2)', oddsColor: '#10b981',
      label: 'FREE',
    };
  }
  if (name.includes('5') || name.includes('cinco')) {
    return {
      bg: '#0a0005', leftPanelBg: 'linear-gradient(160deg,#1a0010 0%,#2d0020 100%)',
      accent: '#e11d48', accentSoft: 'rgba(225,29,72,0.15)', accentText: '#e11d48',
      groupBg: 'rgba(225,29,72,0.12)', groupBorder: '#e11d48', groupText: '#e11d48',
      glow1: 'rgba(225,29,72,0.3)', glow2: 'rgba(212,175,55,0.2)',
      cardBorder: 'rgba(225,29,72,0.2)', oddsColor: '#fbbf24',
      label: 'VIP CUOTA 5+',
    };
  }
  if (name.includes('4') || name.includes('cuatro')) {
    return {
      bg: '#06000f', leftPanelBg: 'linear-gradient(160deg,#0e0025 0%,#1a0040 100%)',
      accent: '#7c3aed', accentSoft: 'rgba(124,58,237,0.15)', accentText: '#a78bfa',
      groupBg: 'rgba(124,58,237,0.12)', groupBorder: '#7c3aed', groupText: '#a78bfa',
      glow1: 'rgba(124,58,237,0.3)', glow2: 'rgba(52,211,153,0.15)',
      cardBorder: 'rgba(124,58,237,0.25)', oddsColor: '#fbbf24',
      label: 'VIP CUOTA 4+',
    };
  }
  if (name.includes('3') || name.includes('tres')) {
    return {
      bg: '#00080f', leftPanelBg: 'linear-gradient(160deg,#001525 0%,#002540 100%)',
      accent: '#0ea5e9', accentSoft: 'rgba(14,165,233,0.15)', accentText: '#38bdf8',
      groupBg: 'rgba(14,165,233,0.12)', groupBorder: '#0ea5e9', groupText: '#38bdf8',
      glow1: 'rgba(14,165,233,0.3)', glow2: 'rgba(212,175,55,0.2)',
      cardBorder: 'rgba(14,165,233,0.2)', oddsColor: '#fbbf24',
      label: 'VIP CUOTA 3+',
    };
  }
  if (name.includes('full') || name.includes('acceso')) {
    return {
      bg: '#070707', leftPanelBg: 'linear-gradient(160deg,#0d0d0d 0%,#1a1a1a 100%)',
      accent: '#d4af37', accentSoft: 'rgba(212,175,55,0.15)', accentText: '#f5e070',
      groupBg: 'rgba(212,175,55,0.1)', groupBorder: '#d4af37', groupText: '#f5e070',
      glow1: 'rgba(212,175,55,0.25)', glow2: 'rgba(212,175,55,0.1)',
      cardBorder: 'rgba(212,175,55,0.2)', oddsColor: '#f5e070',
      label: 'FULL ACCESS',
    };
  }
  // Default: VIP 2+
  return {
    bg: '#04080f', leftPanelBg: 'linear-gradient(160deg,#040d20 0%,#071533 100%)',
    accent: '#d4af37', accentSoft: 'rgba(212,175,55,0.12)', accentText: '#f5e070',
    groupBg: 'rgba(212,175,55,0.1)', groupBorder: '#d4af37', groupText: '#f5e070',
    glow1: 'rgba(212,175,55,0.2)', glow2: 'rgba(59,130,246,0.2)',
    cardBorder: 'rgba(212,175,55,0.18)', oddsColor: '#f5e070',
    label: 'VIP CUOTA 2+',
  };
}

/* ─────────────────── HELPERS ─────────────────── */
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; stamp: string; stampColor: string; stampBorder: string }> = {
  pending:  { label: 'PENDIENTE', bg: 'rgba(251,191,36,0.15)',  color: '#fbbf24', stamp: 'PENDIENTE', stampColor: '#fbbf24', stampBorder: '#fbbf24' },
  won:      { label: 'GANADO ✓',  bg: 'rgba(16,185,129,0.15)', color: '#10b981', stamp: 'GANADO',    stampColor: '#10b981', stampBorder: '#10b981' },
  lost:     { label: 'PERDIDO ✗', bg: 'rgba(239,68,68,0.15)',  color: '#ef4444', stamp: 'PERDIDO',   stampColor: '#ef4444', stampBorder: '#ef4444' },
  void:     { label: 'NULO',      bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', stamp: 'NULO',      stampColor: '#94a3b8', stampBorder: '#94a3b8' },
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + ' COL (GMT-5)';
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function flagEmoji(code?: string) {
  if (!code) return '';
  if (code.length === 2) {
    return code.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
  }
  return code;
}

/* ═══════════════════ COMPONENTE PRINCIPAL ═══════════════════ */
export function PickTicket({ pick }: PickTicketProps) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const theme = getTheme(pick.pick_type_name || '', pick.pick_type_slug || pick.pick_type || '');
  const statusCfg = STATUS_CONFIG[pick.status] || STATUS_CONFIG.pending;
  const isResolved = pick.status !== 'pending';
  const isParlay = Boolean(pick.is_parlay);

  const leagueName = pick.league_name || pick.league || '';
  const pronLabel = pick.market_label || pick.pick || '';

  const downloadTicket = async () => {
    if (!ticketRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(ticketRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: theme.bg,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `BetRoyale-${isParlay ? 'Parlay' : 'Pick'}-${pick.id}-${pick.status}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Error generando imagen:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  /* ── ESTILOS INLINE (necesarios para html2canvas) ── */
  const S = {
    wrapper: {
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 16,
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    },
    ticket: {
      position: 'relative' as const,
      width: 800, minHeight: 480,
      background: theme.bg,
      display: 'flex', flexDirection: 'column' as const,
      overflow: 'hidden',
      boxShadow: isResolved
        ? `0 0 60px ${statusCfg.stampColor}55, 0 0 0 2px ${statusCfg.stampColor}55, 0 0 120px rgba(0,0,0,0.8)`
        : `0 0 60px ${theme.glow1}, 0 0 120px rgba(0,0,0,0.8)`,
    },
    // Glows
    glow1: {
      position: 'absolute' as const, top: -80, left: -80,
      width: 300, height: 300,
      background: `radial-gradient(circle, ${theme.glow1} 0%, transparent 70%)`,
      pointerEvents: 'none' as const,
    },
    glow2: {
      position: 'absolute' as const, bottom: -80, right: -80,
      width: 280, height: 280,
      background: `radial-gradient(circle, ${theme.glow2} 0%, transparent 70%)`,
      pointerEvents: 'none' as const,
    },
    // HEADER
    header: {
      position: 'relative' as const, zIndex: 2,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 28px 14px',
      borderBottom: `1px solid rgba(255,255,255,0.06)`,
      background: 'rgba(255,255,255,0.02)',
    },
    logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
    logoIcon: { fontSize: 28 },
    logoText: {
      fontSize: 24, fontWeight: 900, letterSpacing: 2,
      background: `linear-gradient(90deg, ${theme.accent}, #f5e070, ${theme.accent})`,
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    headerRight: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 6 },
    groupBadge: {
      padding: '4px 14px', borderRadius: 20,
      border: `1.5px solid ${theme.groupBorder}`,
      background: theme.groupBg,
      color: theme.groupText,
      fontSize: 12, fontWeight: 800, letterSpacing: 1.5,
    },
    statusBadge: {
      padding: '3px 12px', borderRadius: 20,
      background: statusCfg.bg,
      color: statusCfg.color,
      fontSize: 11, fontWeight: 700, letterSpacing: 1,
    },
    typeBadge: {
      padding: '3px 12px', borderRadius: 20,
      background: 'rgba(99,102,241,0.15)',
      color: '#818cf8',
      border: '1px solid rgba(99,102,241,0.3)',
      fontSize: 11, fontWeight: 700, letterSpacing: 1,
    },
    // BODY
    body: {
      position: 'relative' as const, zIndex: 2,
      display: 'flex', flex: 1,
    },
    // LEFT PANEL
    leftPanel: {
      width: 220, flexShrink: 0,
      background: theme.leftPanelBg,
      borderRight: `1px solid ${theme.accent}22`,
      display: 'flex', flexDirection: 'column' as const,
      justifyContent: 'space-between',
      padding: '24px 20px',
    },
    leftTitle: {
      fontSize: isParlay ? 36 : 22, fontWeight: 900,
      color: '#fff', letterSpacing: isParlay ? 3 : 1,
      marginBottom: 4,
    },
    leftSub: {
      fontSize: 11, fontWeight: 700, letterSpacing: 2,
      color: theme.accentText, textTransform: 'uppercase' as const,
    },
    dividerLine: {
      height: 1, background: `linear-gradient(90deg, ${theme.accent}55, transparent)`,
      margin: '16px 0',
    },
    stakeBox: { marginBottom: 8 },
    stakeLabel: { fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 2 },
    stakeVal: { fontSize: 20, fontWeight: 900, color: '#cbd5e1' },
    oddsBox: { marginBottom: 4 },
    oddsLabel: { fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 2 },
    oddsVal: { fontSize: 42, fontWeight: 900, color: theme.oddsColor, lineHeight: 1, textShadow: `0 0 20px ${theme.glow1}` },
    ctaBox: {
      marginTop: 'auto' as const,
      borderTop: `1px solid rgba(255,255,255,0.06)`,
      paddingTop: 14,
    },
    ctaJoin: { fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 3 },
    ctaWeb: { fontSize: 13, fontWeight: 800, color: theme.accentText },
    ctaSlogan: { fontSize: 10, fontStyle: 'italic', color: '#64748b', marginTop: 2 },
    // RIGHT PANEL
    rightPanel: {
      flex: 1, padding: '20px 24px',
      display: 'flex', flexDirection: 'column' as const, gap: 10,
      overflowY: 'hidden' as const,
    },
    // Single pick
    singleLeague: { fontSize: 11, fontWeight: 700, color: theme.accentText, letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 8 },
    singleMatch: { fontSize: 22, fontWeight: 900, color: '#f1f5f9', lineHeight: 1.2, marginBottom: 12 },
    singleVs: { fontSize: 13, fontWeight: 900, color: '#334155', margin: '4px 0' },
    singleMeta: { display: 'flex', gap: 16, fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 16 },
    pronBox: {
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: 14, padding: '14px 18px',
    },
    pronLabel: { fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 6 },
    pronVal: { fontSize: 26, fontWeight: 900, color: '#f8fafc', lineHeight: 1.2 },
    // Parlay cards
    selCard: {
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: 12, padding: '12px 16px',
      position: 'relative' as const,
    },
    selLeague: { fontSize: 10, fontWeight: 700, color: theme.accentText, letterSpacing: 1.2, textTransform: 'uppercase' as const, marginBottom: 4 },
    selMatch: { fontSize: 15, fontWeight: 800, color: '#f1f5f9', marginBottom: 8, paddingRight: 60 },
    selBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
    selPronLabel: { fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 2 },
    selPronVal: { fontSize: 13, fontWeight: 800, color: '#e2e8f0' },
    selTimeLabel: { fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 2, textAlign: 'right' as const },
    selOddsRow: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
    selTime: { fontSize: 10, color: '#64748b' },
    selOddsBadge: {
      padding: '3px 10px', borderRadius: 20,
      background: theme.accentSoft,
      border: `1px solid ${theme.accent}55`,
      color: theme.oddsColor,
      fontSize: 13, fontWeight: 900,
    },
    selScore: {
      position: 'absolute' as const, right: 12, top: '50%',
      transform: 'translateY(-50%)',
      fontSize: 14, fontWeight: 900, color: theme.oddsColor,
    },
    // STAMP — cinta diagonal esquina INFERIOR derecha
    stampRibbon: {
      position: 'absolute' as const,
      bottom: 42, right: -60,
      zIndex: 20,
      width: 240,
      padding: '11px 0',
      transform: 'rotate(-35deg)',
      background: statusCfg.stampColor,
      boxShadow: `0 0 28px ${statusCfg.stampColor}bb, 0 2px 10px rgba(0,0,0,0.7)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    },
    stampRibbonText: {
      fontSize: 16, fontWeight: 900, letterSpacing: 3,
      color: pick.status === 'void' ? '#1e293b' : '#000',
      textShadow: 'none',
    },
    // Borde coloreado en la parte superior del ticket
    statusBar: {
      position: 'absolute' as const,
      top: 0, left: 0, right: 0,
      height: 4,
      background: `linear-gradient(90deg, transparent, ${statusCfg.stampColor}, transparent)`,
      zIndex: 20,
    },
    stampScore: {
      fontSize: 28, fontWeight: 900,
      background: `rgba(0,0,0,0.6)`, padding: '6px 20px',
      borderRadius: 10, color: statusCfg.stampColor,
      border: `2px solid ${statusCfg.stampBorder}44`,
    },
    // FOOTER
    footer: {
      position: 'relative' as const, zIndex: 2,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      padding: '10px 28px',
      borderTop: `1px solid ${theme.accent}33`,
      background: 'rgba(0,0,0,0.3)',
    },
    footerDot: { color: theme.accent, fontSize: 8 },
    footerText: { fontSize: 11, color: '#475569', fontWeight: 500 },
    footerAccent: { fontSize: 11, color: theme.accentText, fontWeight: 700 },
    // STATUS BANNER — entre header y body (flujo normal)
    statusBanner: {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      padding: '8px 28px',
      background: `${statusCfg.stampColor}18`,
      borderTop: `1px solid ${statusCfg.stampColor}44`,
      borderBottom: `1px solid ${statusCfg.stampColor}44`,
      position: 'relative' as const, zIndex: 3,
    },
    statusBannerDot: {
      width: 8, height: 8, borderRadius: '50%',
      background: statusCfg.stampColor,
      boxShadow: `0 0 8px ${statusCfg.stampColor}`,
    },
    statusBannerText: {
      fontSize: 13, fontWeight: 900, letterSpacing: 3,
      color: statusCfg.stampColor,
      textTransform: 'uppercase' as const,
    },
  };

  return (
    <div style={S.wrapper}>
      <div ref={ticketRef} style={S.ticket}>
        {/* Glows decorativos */}
        <div style={S.glow1} />
        <div style={S.glow2} />

        {/* ── HEADER ── */}
        <div style={S.header}>
          <div style={S.logoGroup}>
            <span style={S.logoIcon}>🏆</span>
            <span style={S.logoText}>BETROYALE CLUB</span>
          </div>
          <div style={S.headerRight}>
            <span style={S.groupBadge}>{theme.label}</span>
            <span style={S.statusBadge}>● {statusCfg.label}</span>
            {isParlay && <span style={S.typeBadge}>▶ PARLAY {pick.selections?.length || ''} SEL.</span>}
          </div>
        </div>

        {/* ── STATUS BANNER (solo cuando está resuelto) ── */}
        {isResolved && (
          <div style={S.statusBanner}>
            <div style={S.statusBannerDot} />
            <span style={S.statusBannerText}>{statusCfg.stamp}</span>
            {!isParlay && pick.score_home != null && pick.score_away != null && (
              <span style={{ fontSize: 13, fontWeight: 900, color: statusCfg.stampColor, marginLeft: 8, opacity: 0.85 }}>
                &nbsp;·&nbsp; {pick.score_home} — {pick.score_away}
              </span>
            )}
            <div style={S.statusBannerDot} />
          </div>
        )}

        {/* ── BODY ── */}
        <div style={S.body}>
          {/* Panel Izquierdo */}
          <div style={S.leftPanel}>
            <div>
              <div style={S.leftTitle}>{isParlay ? 'PARLAY' : 'PICK'}</div>
              <div style={S.leftSub}>{isParlay ? `${pick.selections?.length || ''} selecciones` : 'Pick Simple'}</div>
              <div style={S.dividerLine} />
              <div style={S.stakeBox}>
                <div style={S.stakeLabel}>Stake</div>
                <div style={S.stakeVal}>{pick.stake}u</div>
              </div>
              <div style={S.oddsBox}>
                <div style={S.oddsLabel}>Cuota Total</div>
                <div style={S.oddsVal}>@{pick.odds}</div>
              </div>
            </div>
            <div style={S.ctaBox}>
              <div style={S.ctaJoin}>Únete a BetRoyale Club</div>
              <div style={S.ctaWeb}>betroyaleclub.com</div>
              <div style={S.ctaSlogan}>Invirtiendo con Inteligencia</div>
            </div>
          </div>

          {/* Panel Derecho */}
          <div style={S.rightPanel}>
            {!isParlay ? (
              /* ── PICK SIMPLE ── */
              <>
                <div style={S.singleLeague}>
                  {flagEmoji(pick.country_flag)} {leagueName}
                </div>
                <div>
                  {pick.match_name.toLowerCase().includes(' vs ') ? (
                    pick.match_name.split(/ vs /i).map((t, i, arr) => (
                      <React.Fragment key={i}>
                        <div style={S.singleMatch}>{t.trim()}</div>
                        {i < arr.length - 1 && <div style={S.singleVs}>VS</div>}
                      </React.Fragment>
                    ))
                  ) : (
                    <div style={S.singleMatch}>{pick.match_name}</div>
                  )}
                </div>
                <div style={S.singleMeta}>
                  <span>📅 {fmtDate(pick.match_date)}</span>
                  <span>🕐 {fmtTime(pick.match_date)}</span>
                </div>
                <div style={S.pronBox}>
                  <div style={S.pronLabel}>Pronóstico</div>
                  <div style={S.pronVal}>{pronLabel}</div>
                </div>
              </>
            ) : (
              /* ── PARLAY ── */
              (pick.selections || []).map((sel, i) => {
                const selPron = sel.market_label || sel.pick || '';
                const hasScore = sel.score_home != null && sel.score_away != null;
                return (
                  <div key={i} style={S.selCard}>
                    {hasScore && (
                      <div style={S.selScore}>{sel.score_home} - {sel.score_away}</div>
                    )}
                    <div style={S.selLeague}>
                      {flagEmoji(sel.country_flag)} {sel.league_name || sel.league || 'Competición'}
                    </div>
                    <div style={S.selMatch}>{sel.match_name}</div>
                    <div style={S.selBottom}>
                      <div>
                        <div style={S.selPronLabel}>Pronóstico</div>
                        <div style={S.selPronVal}>{selPron}</div>
                      </div>
                      <div>
                        <div style={S.selTimeLabel}>Hora & Cuota</div>
                        <div style={S.selOddsRow}>
                          <span style={S.selTime}>🕐 {fmtTime(sel.match_time)}</span>
                          <span style={S.selOddsBadge}>@{sel.odds}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={S.footer}>
          <span style={S.footerAccent}>betroyaleclub.com</span>
          <span style={S.footerDot}>◆</span>
          <span style={S.footerText}>Invirtiendo con Inteligencia</span>
          <span style={S.footerDot}>◆</span>
          <span style={S.footerText}>@BetRoyaleClub</span>
        </div>

      )}
      </div>

      {/* Botón de descarga (no aparece en la captura) */}
      <button
        onClick={downloadTicket}
        disabled={isGenerating}
        style={{
          width: 800,
          background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentText})`,
          color: '#000',
          fontWeight: 800,
          fontSize: 15,
          padding: '14px 0',
          borderRadius: 12,
          border: 'none',
          cursor: isGenerating ? 'not-allowed' : 'pointer',
          opacity: isGenerating ? 0.6 : 1,
          letterSpacing: 1,
        }}
      >
        {isGenerating ? '⏳ Generando imagen HD...' : '📥 Descargar Ticket HD (4:3)'}
      </button>
    </div>
  );
}
