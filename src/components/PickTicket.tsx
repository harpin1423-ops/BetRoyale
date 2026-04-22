import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Trophy, CheckCircle, XCircle, MinusCircle, Clock, Calendar, ListChecks } from 'lucide-react';
import { CountryFlag } from './CountryFlag';

interface PickSelection {
  match_name: string;
  pick: string;
  odds: number | string;
  league_name?: string;
  league?: string;
  country_flag?: string;
  match_time: string;
  score_home?: number | null;
  score_away?: number | null;
  status?: string;
}

interface PickData {
  id: number;
  match_name: string;
  pick: string;
  odds: number | string;
  stake: number | string;
  league: string;
  match_date: string;
  status: 'pending' | 'won' | 'lost' | 'void' | string;
  pick_type?: string;
  score_home?: number | null;
  score_away?: number | null;
  is_parlay?: boolean;
  selections?: PickSelection[];
}

interface PickTicketProps {
  pick: PickData;
}

export function PickTicket({ pick }: PickTicketProps) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadTicket = async () => {
    if (!ticketRef.current) return;
    setIsGenerating(true);
    try {
      // Tomamos la captura en alta resolución (escala 3x)
      const canvas = await html2canvas(ticketRef.current, {
        scale: 3, 
        useCORS: true,
        backgroundColor: '#020617', // slate-950
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `BetRoyale-Pick-${pick.id}-${pick.status}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Error generando imagen", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const isResolved = pick.status !== 'pending';
  const isWon = pick.status === 'won';
  const isLost = pick.status === 'lost';
  const isVoid = pick.status === 'void';

  // Format date
  const dateObj = new Date(pick.match_date);
  const dateStr = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  const timeStr = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  // Separate match name if possible (Team A vs Team B)
  const teams = pick.match_name.split(/ vs /i);
  const homeTeam = teams[0] || pick.match_name;
  const awayTeam = teams[1] || '';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Contenedor del Ticket (Lo que se captura) */}
      <div 
        ref={ticketRef}
        className="relative overflow-hidden bg-slate-950 text-white w-[400px] min-h-[500px] p-8 flex flex-col justify-between"
        style={{
          fontFamily: "'Inter', sans-serif",
          boxShadow: "0 0 40px rgba(0,0,0,0.5)"
        }}
      >
        {/* Fondo decorativo */}
        <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-emerald-500/20 rounded-full blur-[60px] pointer-events-none" />
        <div className="absolute bottom-[-50px] left-[-50px] w-48 h-48 bg-blue-500/20 rounded-full blur-[60px] pointer-events-none" />

        {/* Header: Logo / Branding */}
        <div className="flex items-center justify-between z-10 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-8 h-8 text-emerald-400" />
            <h1 className="text-2xl font-black tracking-wider bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
              BETROYALE
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
              {pick.pick_type?.includes('free') ? '🔥 FREE' : '💎 VIP'}
            </div>
            {pick.is_parlay && (
              <div className="text-[9px] font-black uppercase text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded flex items-center gap-1 border border-purple-500/20">
                <ListChecks className="w-3 h-3" /> PARLAY
              </div>
            )}
          </div>
        </div>

        {/* Content: Match & Pick */}
        <div className="flex-1 flex flex-col justify-center z-10 py-6 gap-6">
          {!pick.is_parlay ? (
            // VISTA SIMPLE (1 PICK)
            <div className="text-center">
              <div className="text-emerald-400 text-sm font-semibold tracking-widest uppercase mb-3 flex justify-center items-center gap-2">
                {pick.league}
              </div>
              
              {awayTeam ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xl font-bold text-slate-100 text-center leading-tight">{homeTeam}</span>
                  <span className="text-sm font-black text-slate-600">VS</span>
                  <span className="text-xl font-bold text-slate-100 text-center leading-tight">{awayTeam}</span>
                </div>
              ) : (
                <span className="text-xl font-bold text-slate-100 text-center leading-tight">{pick.match_name}</span>
              )}
              
              <div className="flex items-center justify-center gap-4 mt-4 text-slate-400 text-sm font-medium">
                <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {dateStr}</span>
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {timeStr}</span>
              </div>
            </div>
          ) : (
            // VISTA PARLAY (MÚLTIPLES PICKS)
            <div className="flex flex-col gap-4">
              {pick.selections?.map((sel, idx) => {
                const selDateObj = new Date(sel.match_time);
                const selTimeStr = selDateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                
                return (
                  <div key={idx} className="bg-slate-900/50 rounded-xl p-3 border border-slate-800/50 flex flex-col relative overflow-hidden">
                    {/* Indicador de estado de la selección si el parlay está resuelto o si la selección específica lo está */}
                    {sel.score_home != null && sel.score_away != null && (
                      <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center px-3 bg-slate-950/40 border-l border-slate-800/50">
                        <span className="font-black text-emerald-400 text-sm">{sel.score_home} - {sel.score_away}</span>
                      </div>
                    )}
                    
                    <div className="text-[10px] text-emerald-400 font-bold uppercase flex items-center gap-1 mb-1 opacity-80">
                      {sel.country_flag && <CountryFlag code={sel.country_flag} />}
                      {sel.league_name || sel.league || "Competición"}
                    </div>
                    <div className="text-sm font-bold text-white mb-2 pr-12 leading-tight">
                      {sel.match_name}
                    </div>
                    <div className="flex justify-between items-end mt-auto pt-2 border-t border-slate-800/50">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Pronóstico</span>
                        <span className="text-xs font-black text-blue-300">{sel.pick}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Hora & Cuota</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {selTimeStr}</span>
                          <span className="text-sm font-black text-emerald-400">@{sel.odds}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 text-center relative overflow-hidden backdrop-blur-sm mt-2">
            {!pick.is_parlay && (
              <>
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Pronóstico</div>
                <div className="text-2xl font-black text-white mb-3 leading-tight">{pick.pick}</div>
              </>
            )}
            
            <div className={`flex justify-center gap-6 ${!pick.is_parlay ? 'border-t border-slate-800 pt-3' : ''}`}>
              <div>
                <div className="text-slate-500 text-[10px] uppercase font-bold">Cuota Total</div>
                <div className="text-emerald-400 font-black text-xl">@{pick.odds}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase font-bold">Stake</div>
                <div className="text-blue-400 font-black text-xl">{pick.stake}/10</div>
              </div>
            </div>
          </div>
        </div>

        {/* Status Overlay (If Resolved) */}
        {isResolved && (
          <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-md bg-slate-950/60 transition-all`}>
            {isWon && (
              <div className="transform -rotate-12 flex flex-col items-center">
                <CheckCircle className="w-24 h-24 text-emerald-500 mb-2 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                <span className="text-5xl font-black text-emerald-500 tracking-widest drop-shadow-[0_0_15px_rgba(16,185,129,0.5)] border-4 border-emerald-500 px-6 py-2 rounded-xl">WIN</span>
                {(!pick.is_parlay && pick.score_home != null && pick.score_away != null) && (
                  <div className="mt-4 bg-emerald-950/80 px-4 py-2 rounded-lg border border-emerald-800/50 text-emerald-200 font-bold text-xl">
                    {pick.score_home} - {pick.score_away}
                  </div>
                )}
              </div>
            )}
            {isLost && (
              <div className="transform -rotate-12 flex flex-col items-center">
                <XCircle className="w-24 h-24 text-rose-500 mb-2 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
                <span className="text-5xl font-black text-rose-500 tracking-widest drop-shadow-[0_0_15px_rgba(244,63,94,0.5)] border-4 border-rose-500 px-6 py-2 rounded-xl">LOSS</span>
                {(!pick.is_parlay && pick.score_home != null && pick.score_away != null) && (
                  <div className="mt-4 bg-rose-950/80 px-4 py-2 rounded-lg border border-rose-800/50 text-rose-200 font-bold text-xl">
                    {pick.score_home} - {pick.score_away}
                  </div>
                )}
              </div>
            )}
            {isVoid && (
              <div className="transform -rotate-12 flex flex-col items-center">
                <MinusCircle className="w-24 h-24 text-slate-400 mb-2" />
                <span className="text-5xl font-black text-slate-400 tracking-widest border-4 border-slate-400 px-6 py-2 rounded-xl">VOID</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center z-10 border-t border-slate-800 pt-4 mt-4">
          <p className="text-slate-500 text-xs font-medium">Únete a nuestro canal VIP de Telegram</p>
          <p className="text-slate-400 text-sm font-bold mt-1">@BetRoyaleClub</p>
        </div>
      </div>

      {/* Controles de descarga (no aparecen en la imagen) */}
      <button
        onClick={downloadTicket}
        disabled={isGenerating}
        className="w-[400px] flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all disabled:opacity-50"
      >
        {isGenerating ? (
          <span className="animate-pulse">Generando Imagen...</span>
        ) : (
          <>Descargar Ticket HD</>
        )}
      </button>
    </div>
  );
}
