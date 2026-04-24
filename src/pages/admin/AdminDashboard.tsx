import React, { useState, useEffect, useMemo } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Trophy, PlusCircle, List, Users, Settings, LogOut, CheckCircle, XCircle, MinusCircle, Trash2, Edit, Tag, Globe, X, BarChart3, CheckCircle2, Activity, DollarSign, Search, ChevronLeft, ChevronRight, BrainCircuit, Loader2, Send, ExternalLink, Shield, Camera, Sparkles } from "lucide-react";
import { NORMALIZED_PICKS, getPickDisplay, getPlanName } from "../../lib/constants";
import { getLocalizedStatus } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";
import { CountryFlag } from "../../components/CountryFlag";
import { SearchableSelect } from "../../components/SearchableSelect";
import { PickTicket } from "../../components/PickTicket";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { toast } from "sonner";

const formatPaymentMethod = (method: string) => {
  if (!method) return 'N/A';
  const methodMap: Record<string, string> = {
    'master': 'Mastercard',
    'visa': 'Visa',
    'amex': 'American Express',
    'pse': 'PSE',
    'efecty': 'Efecty',
    'account_money': 'Saldo Mercado Pago'
  };
  return methodMap[method.toLowerCase()] || method;
};

// Zona horaria oficial para mostrar y editar vencimientos de cupones.
const PROMO_TIME_ZONE = "America/Bogota";

/**
 * @summary Formatea una fecha absoluta en hora Colombia para inputs datetime-local.
 * @param value - Fecha absoluta que se debe mostrar en hora Colombia.
 * @returns Cadena YYYY-MM-DDTHH:mm compatible con datetime-local.
 */
const formatDateForColombiaInput = (value: Date) => {
  // Obtenemos las partes de fecha/hora sin depender de la zona local del navegador.
  const parts = new Intl.DateTimeFormat("en-CA", {
    // Aplicamos la zona horaria operativa del panel.
    timeZone: PROMO_TIME_ZONE,
    // Solicitamos año numérico para el formato del input.
    year: "numeric",
    // Solicitamos mes de dos dígitos para el formato del input.
    month: "2-digit",
    // Solicitamos día de dos dígitos para el formato del input.
    day: "2-digit",
    // Solicitamos hora de dos dígitos en formato 24 horas.
    hour: "2-digit",
    // Solicitamos minutos de dos dígitos para el input.
    minute: "2-digit",
    // Forzamos ciclo 00-23 para evitar AM/PM.
    hourCycle: "h23",
  }).formatToParts(value);

  // Convertimos las partes en un mapa por tipo.
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  // Devolvemos el formato nativo de datetime-local.
  return `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}`;
};

/**
 * @summary Normaliza el vencimiento de cupón para el input sin convertir DATETIME local a UTC.
 * @param value - Valor recibido desde el backend o desde el formulario.
 * @returns Cadena YYYY-MM-DDTHH:mm para el input.
 */
const formatPromoDateForInput = (value: unknown) => {
  // Evitamos mostrar valores vacíos o nulos.
  if (value === null || value === undefined) return "";

  // Convertimos el valor recibido a texto seguro para parsearlo.
  const text = String(value).trim();

  // Evitamos procesar cadenas vacías.
  if (!text) return "";

  // Detectamos timestamps con zona horaria explícita, como ISO terminado en Z.
  const hasExplicitTimeZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(text);

  // Convertimos timestamps absolutos a hora Colombia solo cuando traen zona explícita.
  if (hasExplicitTimeZone) {
    // Parseamos el timestamp absoluto recibido desde JSON.
    const parsed = new Date(text);

    // Si el timestamp es válido, lo mostramos en hora Colombia.
    if (!Number.isNaN(parsed.getTime())) return formatDateForColombiaInput(parsed);
  }

  // Normalizamos el separador sin aplicar Date, para conservar la hora escrita por el admin.
  const normalized = text.replace("T", " ");

  // Extraemos fecha y minuto desde formatos MySQL o datetime-local.
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);

  // Si no coincide con un formato esperado, dejamos el campo vacío.
  if (!match) return "";

  // Devolvemos el valor listo para datetime-local.
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
};

/**
 * @summary Normaliza el vencimiento del cupón para enviarlo al backend como DATETIME MySQL.
 * @param value - Valor actual del input datetime-local.
 * @returns Cadena YYYY-MM-DD HH:mm:ss o null cuando no hay vencimiento.
 */
const normalizePromoDateForApi = (value: string) => {
  // Convertimos el valor del input a formato estable.
  const inputValue = formatPromoDateForInput(value);

  // Enviamos null cuando el cupón no tiene fecha de vencimiento.
  if (!inputValue) return null;

  // Enviamos DATETIME sin zona horaria para que el backend lo trate como hora Colombia.
  return `${inputValue.replace("T", " ")}:00`;
};

/**
 * @summary Formatea el vencimiento del cupón para la tabla del admin sin desfase UTC.
 * @param value - Valor de valid_until recibido desde el backend.
 * @returns Texto legible con fecha, hora y zona Colombia.
 */
const formatPromoDateForDisplay = (value: unknown) => {
  // Reutilizamos el formato de input para conservar la misma hora exacta.
  const inputValue = formatPromoDateForInput(value);

  // Mostramos que no vence si no hay fecha guardada.
  if (!inputValue) return "Nunca";

  // Separamos la fecha y la hora ya normalizadas.
  const [datePart, timePart] = inputValue.split("T");

  // Separamos año, mes y día para mostrar formato latino.
  const [year, month, day] = datePart.split("-");

  // Mostramos la hora explícitamente como Colombia.
  return `${day}/${month}/${year}, ${timePart} COL`;
};

// Tipamos los destinos donde el panel puede crear equipos rápidamente.
type QuickTeamTarget = 'home_team' | 'away_team' | { selectionIndex: number; field: 'home_team' | 'away_team' };

// Tipamos cada selección de resolución manual para picks combinados.
type ManualResolutionSelectionState = {
  // Conservamos la posición de la selección dentro del parlay.
  index: number;
  // Mostramos el partido de la selección.
  matchName: string;
  // Mostramos el mercado legible de la selección.
  marketLabel: string;
  // Conservamos la referencia técnica del mercado.
  marketReference: string;
  // Guardamos marcador manual local como texto del input.
  score_home: string;
  // Guardamos marcador manual visitante como texto del input.
  score_away: string;
  // Guardamos total de córners si el admin lo conoce directamente.
  corners_total: string;
  // Guardamos córners del local.
  corners_home: string;
  // Guardamos córners del visitante.
  corners_away: string;
  // Guardamos total de amarillas si el admin lo conoce directamente.
  yellow_cards_total: string;
  // Guardamos amarillas del local.
  yellow_cards_home: string;
  // Guardamos amarillas del visitante.
  yellow_cards_away: string;
  // Guardamos la sugerencia calculada por el backend.
  suggested_status: string;
  // Guardamos el razonamiento resumido de la sugerencia.
  suggested_reason: string;
  // Guardamos el estado final que confirma el admin.
  final_status: string;
};

// Tipamos el modal de resolución manual asistida para mantener los campos sincronizados.
type ManualResolutionDialogState = {
  // Indicamos si el modal está visible.
  isOpen: boolean;
  // Guardamos el ID del pick afectado.
  pickId: number;
  // Mostramos el nombre del evento al admin.
  matchName: string;
  // Mostramos el mercado legible para la decisión.
  marketLabel: string;
  // Conservamos la referencia técnica del mercado para etiquetas internas.
  marketReference: string;
  // Indicamos si la resolución se está haciendo sobre un parlay.
  is_parlay: boolean;
  // Guardamos marcador manual local como texto del input.
  score_home: string;
  // Guardamos marcador manual visitante como texto del input.
  score_away: string;
  // Guardamos total de córners si el admin lo conoce directamente.
  corners_total: string;
  // Guardamos córners del local.
  corners_home: string;
  // Guardamos córners del visitante.
  corners_away: string;
  // Guardamos total de amarillas si el admin lo conoce directamente.
  yellow_cards_total: string;
  // Guardamos amarillas del local.
  yellow_cards_home: string;
  // Guardamos amarillas del visitante.
  yellow_cards_away: string;
  // Guardamos la sugerencia calculada por el backend.
  suggested_status: string;
  // Guardamos el razonamiento resumido del backend.
  suggested_reason: string;
  // Guardamos el estado final que confirma el admin.
  final_status: string;
  // Guardamos las selecciones editables cuando el pick es combinado.
  selections: ManualResolutionSelectionState[];
  // Controlamos el loading del botón de sugerencia.
  isSuggesting: boolean;
  // Controlamos el loading del guardado final.
  isSaving: boolean;
};

// Mapeo de ligas tipo Copa a sus ligas fuente (para mostrar equipos de múltiples divisiones)
const CUP_LEAGUES_MAPPING: Record<string, string[]> = {
  "DFB Pokal": ["Bundesliga", "2. Bundesliga"],
  "Copa del Rey": ["La Liga", "Segunda División"],
  "FA Cup": ["Premier League", "Championship", "League One", "League Two"],
  "EFL Cup": ["Premier League", "Championship", "League One", "League Two"],
  "Coppa Italia": ["Serie A", "Serie B"],
  "Coupe de France": ["Ligue 1", "Ligue 2"],
  "Copa Colombia": ["Liga BetPlay", "Torneo BetPlay"],
  "Copa Argentina": ["Liga Profesional", "Primera Nacional"],
  "Copa de la Liga Profesional": ["Liga Profesional"]
};

/**
 * Obtiene los IDs de todas las ligas compatibles para una liga seleccionada (Copa + Fuentes)
 * Esto permite que las Copas puedan usar equipos de Primera y Segunda división.
 */
const getCompatibleLeagueIds = (selectedLeagueId: string | number | null, leagues: any[]) => {
  if (!selectedLeagueId) return [];
  const selectedLeague = leagues.find(l => l.id.toString() === selectedLeagueId.toString());
  if (!selectedLeague) return [selectedLeagueId.toString()];

  const leagueName = selectedLeague.name;
  const sources = CUP_LEAGUES_MAPPING[leagueName];
  
  if (!sources) return [selectedLeagueId.toString()];

  // Buscamos los IDs de las ligas fuente en el mismo país
  const sourceLeagueIds = leagues
    .filter(l => l.country_id === selectedLeague.country_id && (l.name === leagueName || sources.includes(l.name)))
    .map(l => l.id.toString());

  return sourceLeagueIds;
};

/**
 * @summary Detecta si una fila o selección ya tiene marcador completo.
 * @param item - Pick o selección de parlay que puede contener score_home y score_away.
 * @returns Verdadero cuando ambos lados del marcador existen.
 */
const hasResolvedScore = (item: any) => {
  // Validamos local y visitante contra null/undefined, permitiendo marcador cero.
  return item?.score_home !== null && item?.score_home !== undefined && item?.score_away !== null && item?.score_away !== undefined;
};

/**
 * @summary Detecta si una fila o selección está vinculada a una API de resultados.
 * @param item - Pick o selección de parlay que puede contener IDs de API.
 * @returns Verdadero cuando existe un identificador de API-Football o legacy.
 */
const hasResultProviderLink = (item: any) => {
  // Priorizamos el ID oficial de API-Football y mantenemos compatibilidad legacy.
  return Boolean(item?.api_fixture_id || item?.thesportsdb_event_id);
};

/**
 * @summary Construye una fecha de formulario desde la respuesta de API-Football.
 * @param fixture - Partido retornado por el buscador externo.
 * @returns Valor datetime-local o cadena vacía cuando no hay fecha.
 */
const getFixtureDateTimeValue = (fixture: any) => {
  // Evitamos generar fechas incompletas.
  if (!fixture?.date) return "";

  // Normalizamos la hora recibida por TheSportsDB.
  const rawTime = String(fixture.time || "00:00").slice(0, 5);

  // Devolvemos el valor compatible con inputs datetime-local.
  return `${fixture.date}T${rawTime || "00:00"}`;
};

/**
 * @summary Obtiene el nombre que se debe usar para consultar API-Football.
 * @param teams - Catalogo local de equipos cargado en el panel.
 * @param teamId - ID del equipo seleccionado en BetRoyale.
 * @returns Nombre oficial API-Football, alias técnico o nombre visible como respaldo.
 */
const getTeamProviderName = (teams: any[], teamId: string | number | undefined) => {
  // Buscamos el equipo por ID usando comparacion tolerante entre string y number.
  const team = teams.find((item) => String(item.id) === String(teamId || ""));

  // Devolvemos el nombre oficial del proveedor cuando exista, o el alias técnico como respaldo.
  return String(team?.api_provider_name || team?.api_name || team?.name || "").trim();
};

/**
 * @summary Obtiene el ID oficial de API-Football configurado para un equipo local.
 * @param teams - Catalogo local de equipos cargado en el panel.
 * @param teamId - ID del equipo seleccionado en BetRoyale.
 * @returns ID oficial del proveedor o cadena vacía cuando aún no existe vínculo exacto.
 */
const getTeamProviderId = (teams: any[], teamId: string | number | undefined) => {
  // Buscamos el equipo por ID usando comparación tolerante entre string y number.
  const team = teams.find((item) => String(item.id) === String(teamId || ""));

  // Devolvemos el ID oficial del proveedor cuando exista.
  return String(team?.api_team_id || "").trim();
};

/**
 * @summary Construye el contexto completo de búsqueda para API-Football desde los equipos seleccionados.
 * @param homeTeamId - ID local seleccionado en BetRoyale.
 * @param awayTeamId - ID visitante seleccionado en BetRoyale.
 * @param fallback - Nombre visible del partido si no hay IDs.
 * @param teams - Catalogo local de equipos con aliases API.
 * @returns Consulta visible y los IDs oficiales del proveedor cuando existen.
 */
const buildProviderFixtureSearchContext = (homeTeamId: string | number | undefined, awayTeamId: string | number | undefined, fallback: string, teams: any[]) => {
  // Resolvemos nombre tecnico local.
  const homeProviderName = getTeamProviderName(teams, homeTeamId);

  // Resolvemos nombre tecnico visitante.
  const awayProviderName = getTeamProviderName(teams, awayTeamId);

  // Resolvemos ID oficial del proveedor para el equipo local.
  const homeProviderTeamId = getTeamProviderId(teams, homeTeamId);

  // Resolvemos ID oficial del proveedor para el equipo visitante.
  const awayProviderTeamId = getTeamProviderId(teams, awayTeamId);

  // Si ambos lados tienen nombre técnico, construimos una consulta humana clara.
  const query = homeProviderName && awayProviderName ? `${homeProviderName} vs ${awayProviderName}` : String(fallback || "").trim();

  // Devolvemos la consulta visible junto con los IDs exactos para búsquedas precisas.
  return {
    query,
    homeProviderTeamId,
    awayProviderTeamId,
  };
};

/**
 * @summary Extrae YYYY-MM-DD desde un valor datetime-local del formulario.
 * @param value - Fecha/hora del pick o seleccion.
 * @returns Fecha lista para el buscador de API-Football.
 */
const getFixtureSearchDate = (value: string | undefined) => {
  // Validamos que exista un valor antes de cortar.
  if (!value) return "";

  // Tomamos la parte de fecha que comparten datetime-local y DATETIME.
  return String(value).slice(0, 10);
};

/**
 * @summary Obtiene la referencia más útil del mercado para resolución manual.
 * @param pick - Pick cargado desde el backend.
 * @returns Acrónimo o nombre del mercado que verá el admin.
 */
const getManualResolutionMarketReference = (pick: any) => {
  // Priorizamos el acrónimo porque suele ser más corto y exacto.
  return String(pick?.market_acronym || pick?.market_label || pick?.pick || "").trim();
};

/**
 * @summary Detecta si el mercado está relacionado con córners.
 * @param marketReference - Texto del mercado actual.
 * @returns Verdadero cuando el mercado requiere córners.
 */
const isCornersMarketReference = (marketReference: string) => {
  // Detectamos diferentes variantes en español e inglés.
  return /corner|corners|c[oó]rner/i.test(String(marketReference || ""));
};

/**
 * @summary Detecta si el mercado está relacionado con amarillas o tarjetas.
 * @param marketReference - Texto del mercado actual.
 * @returns Verdadero cuando el mercado requiere amarillas.
 */
const isYellowCardsMarketReference = (marketReference: string) => {
  // Detectamos variantes comunes del mercado de tarjetas.
  return /yellow|amarilla|tarjeta/i.test(String(marketReference || ""));
};

/**
 * @summary Construye el estado inicial de una selección dentro del modal manual.
 * @param selection - Selección del parlay recibida desde el backend.
 * @param index - Posición de la selección dentro del parlay.
 * @returns Estado serializable y editable para la selección.
 */
const buildManualResolutionSelectionState = (selection: any, index: number): ManualResolutionSelectionState => {
  // Resolvemos la referencia del mercado para esa selección puntual.
  const marketReference = getManualResolutionMarketReference(selection);

  // Devolvemos la selección en formato editable para el modal.
  return {
    index,
    matchName: String(selection?.match_name || `Selección ${index + 1}`),
    marketLabel: String(selection?.market_label || marketReference || "Mercado"),
    marketReference,
    score_home: selection?.score_home !== null && selection?.score_home !== undefined ? String(selection.score_home) : "",
    score_away: selection?.score_away !== null && selection?.score_away !== undefined ? String(selection.score_away) : "",
    corners_total: selection?.corners_total !== null && selection?.corners_total !== undefined ? String(selection.corners_total) : "",
    corners_home: selection?.corners_home !== null && selection?.corners_home !== undefined ? String(selection.corners_home) : "",
    corners_away: selection?.corners_away !== null && selection?.corners_away !== undefined ? String(selection.corners_away) : "",
    yellow_cards_total: selection?.yellow_cards_total !== null && selection?.yellow_cards_total !== undefined ? String(selection.yellow_cards_total) : "",
    yellow_cards_home: selection?.yellow_cards_home !== null && selection?.yellow_cards_home !== undefined ? String(selection.yellow_cards_home) : "",
    yellow_cards_away: selection?.yellow_cards_away !== null && selection?.yellow_cards_away !== undefined ? String(selection.yellow_cards_away) : "",
    suggested_status: String(selection?.suggested_status || ""),
    suggested_reason: String(selection?.suggested_reason || ""),
    final_status: String(selection?.status || selection?.final_status || "pending"),
  };
};

/**
 * @summary Crea el estado inicial del modal de resolución manual asistida.
 * @param pick - Pick seleccionado por el admin.
 * @returns Estado inicial listo para abrir el modal.
 */
const buildManualResolutionDialogState = (pick: any): ManualResolutionDialogState => {
  // Resolvemos el mercado legible y técnico del pick.
  const marketReference = getManualResolutionMarketReference(pick);

  // Construimos las selecciones editables solo si el pick es un parlay.
  const manualSelections = Array.isArray(pick?.selections)
    ? pick.selections.map((selection: any, index: number) => buildManualResolutionSelectionState(selection, index))
    : [];

  // Devolvemos el estado inicial del modal con los datos ya guardados.
  return {
    isOpen: true,
    pickId: Number(pick.id),
    matchName: String(pick.match_name || ""),
    marketLabel: String(pick.market_label || marketReference || "Mercado"),
    marketReference,
    is_parlay: Boolean(pick?.is_parlay),
    score_home: pick?.score_home !== null && pick?.score_home !== undefined ? String(pick.score_home) : "",
    score_away: pick?.score_away !== null && pick?.score_away !== undefined ? String(pick.score_away) : "",
    corners_total: pick?.corners_total !== null && pick?.corners_total !== undefined ? String(pick.corners_total) : "",
    corners_home: pick?.corners_home !== null && pick?.corners_home !== undefined ? String(pick.corners_home) : "",
    corners_away: pick?.corners_away !== null && pick?.corners_away !== undefined ? String(pick.corners_away) : "",
    yellow_cards_total: pick?.yellow_cards_total !== null && pick?.yellow_cards_total !== undefined ? String(pick.yellow_cards_total) : "",
    yellow_cards_home: pick?.yellow_cards_home !== null && pick?.yellow_cards_home !== undefined ? String(pick.yellow_cards_home) : "",
    yellow_cards_away: pick?.yellow_cards_away !== null && pick?.yellow_cards_away !== undefined ? String(pick.yellow_cards_away) : "",
    suggested_status: "",
    suggested_reason: "",
    final_status: String(pick?.status || "pending"),
    selections: manualSelections,
    isSuggesting: false,
    isSaving: false,
  };
};

export function AdminDashboard() {
  // Leemos la sesión del administrador una sola vez para evitar declaraciones duplicadas.
  const { token, logout } = useAuth();
  // Guardamos la pestaña activa del panel.
  const [activeTab, setActiveTab] = useState("new-pick");
  // Guardamos los picks cargados en administración.
  const [picks, setPicks] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const picksPerPage = 10;
  const [pickTypes, setPickTypes] = useState<any[]>([]);
  const [markets, setMarkets] = useState<any[]>([]);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  // Guardamos nombre local, nombre oficial e ID oficial de API-Football para cada equipo.
  const [teamForm, setTeamForm] = useState({
    // Conservamos el ID local cuando estamos editando.
    id: null as number | null,
    // Guardamos el nombre visible de BetRoyale.
    name: "",
    // Guardamos el alias técnico legacy como respaldo.
    api_name: "",
    // Guardamos el nombre oficial del equipo según API-Football.
    api_provider_name: "",
    // Guardamos el ID oficial del equipo en API-Football.
    api_team_id: "",
    // Guardamos la liga local asociada al equipo.
    league_id: "",
    // Guardamos el país local asociado a la liga.
    country_id: ""
  });
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);
  // Guardamos el loading de sugerencias de alias API-Football para equipos.
  const [isSuggestingTeamAlias, setIsSuggestingTeamAlias] = useState(false);
  // Guardamos la lista de candidatos sugeridos para el alias técnico.
  const [teamAliasSuggestions, setTeamAliasSuggestions] = useState<any[]>([]);
  const [newPromoCode, setNewPromoCode] = useState({ code: '', discount_percentage: '', max_uses: '', valid_until: '' });
  const [editingPromoCodeId, setEditingPromoCodeId] = useState<number | null>(null);
  const [isSubmittingPromoCode, setIsSubmittingPromoCode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmittingPick, setIsSubmittingPick] = useState(false);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [isSubmittingTracking, setIsSubmittingTracking] = useState(false);
  const [activeTrackingPickId, setActiveTrackingPickId] = useState<number | null>(null);
  // Guardamos el mensaje de seguimiento temporal que se publica en Telegram.
  const [trackingMessage, setTrackingMessage] = useState("");
  const [editingPickId, setEditingPickId] = useState<number | null>(null);
  const [isSubmittingPickType, setIsSubmittingPickType] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [telegramFullConfig, setTelegramFullConfig] = useState({ telegram_channel_id: "", telegram_invite_link: "" });
  const [ticketModalPick, setTicketModalPick] = useState<any | null>(null);
  // Guardamos el estado del modal para resolución manual asistida.
  const [manualResolutionDialog, setManualResolutionDialog] = useState<ManualResolutionDialogState | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    match_date: "",
    country_id: "",
    league_id: "",
    home_team: "",
    away_team: "",
    match_name: "",
    pick: "",
    odds: "",
    stake: "1",
    pick_type_id: "1",
    analysis: "",
    is_parlay: false,
    selections: [] as any[],
    api_fixture_id: "" as string | number,
    thesportsdb_event_id: "",
    auto_update: true,
    score_home: "" as string | number,
    score_away: "" as string | number
  });

  const [isRunningCron, setIsRunningCron] = useState(false);

  const handleRunCron = async () => {
    setIsRunningCron(true);
    try {
      const res = await fetch("/api/scores/run-cron", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al ejecutar actualización");
      toast.success(data.message || "Resultados actualizados correctamente");
      fetchPicks();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsRunningCron(false);
    }
  };

  /**
   * @summary Genera un análisis profesional para el pick usando IA.
   */
  const handleGenerateAnalysis = async () => {
    // Verificamos que haya datos suficientes para el análisis
    if (!formData.is_parlay && !formData.match_name) {
      toast.error("Por favor selecciona los equipos o ingresa el nombre del partido.");
      return;
    }

    if (formData.is_parlay && formData.selections.length === 0) {
      toast.error("Por favor agrega al menos una selección al parlay.");
      return;
    }

    setIsGeneratingAnalysis(true);
    try {
      // Obtenemos los nombres legibles de liga y mercado para un mejor análisis
      const leagueName = leagues.find(l => l.id.toString() === formData.league_id)?.name || "";
      const marketLabel = markets.find(m => m.id.toString() === formData.pick)?.label || formData.pick;

      // Enriquecemos selecciones de parlay con etiquetas legibles
      const enrichedSelections = formData.is_parlay ? formData.selections.map(sel => ({
        ...sel,
        pick_label: markets.find(m => m.id.toString() === sel.pick)?.label || sel.pick
      })) : [];

      const res = await fetch("/api/ai/analyze-pick", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          match_name: formData.match_name,
          league_name: leagueName,
          pick: marketLabel,
          odds: formData.odds,
          is_parlay: formData.is_parlay,
          selections: enrichedSelections
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al generar análisis");

      setFormData(prev => ({ ...prev, analysis: data.analysis }));
      toast.success("Análisis generado correctamente");
    } catch (error: any) {
      toast.error(error.message || "Error al conectar con el servicio de IA");
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  // State for fixture search (API-Football)
  const [fixtureSearchResults, setFixtureSearchResults] = useState<any[]>([]);
  const [isSearchingFixtures, setIsSearchingFixtures] = useState(false);
  const [fixtureSearchQuery, setFixtureSearchQuery] = useState("");
  const [activeSelectionFixtureIndex, setActiveSelectionFixtureIndex] = useState<number | null>(null);

  useEffect(() => {
    // Si el formulario ya no es parlay, limpiamos el contexto de selección vinculado al buscador.
    if (!formData.is_parlay && activeSelectionFixtureIndex !== null) {
      setActiveSelectionFixtureIndex(null);
    }
  }, [formData.is_parlay, activeSelectionFixtureIndex]);

  // Market form state
  const [marketForm, setMarketForm] = useState({ id: null as number | null, label: "", acronym: "" });
  const [isSubmittingMarket, setIsSubmittingMarket] = useState(false);

  // League form state
  const [leagueForm, setLeagueForm] = useState({ id: null as number | null, name: "", country_id: "" });
  const [isSubmittingLeague, setIsSubmittingLeague] = useState(false);

  // Country form state
  const [countryForm, setCountryForm] = useState({ id: null as number | null, name: "", flag: "" });
  const [isSubmittingCountry, setIsSubmittingCountry] = useState(false);

  // Inline edit state
  const [editingInlineCountryId, setEditingInlineCountryId] = useState<number | null>(null);
  const [inlineCountryName, setInlineCountryName] = useState("");
  const [inlineCountryFlag, setInlineCountryFlag] = useState("");

  const [editingInlineLeagueId, setEditingInlineLeagueId] = useState<number | null>(null);
  const [inlineLeagueName, setInlineLeagueName] = useState("");
  const [inlineLeagueCountryId, setInlineLeagueCountryId] = useState("");

  // Bulk selection state
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<number[]>([]);

  // Custom Confirm Modal State
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, confirmText?: string, cancelText?: string, variant?: 'destructive' | 'primary' | 'emerald', onConfirm: () => void } | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean, title: string, message: string } | null>(null);

  // Filters for users table
  const [userFilter, setUserFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [periodicityFilter, setPeriodicityFilter] = useState("");

  // Stats state
  const [performanceStats, setPerformanceStats] = useState<any>(null);
  const [revenueStats, setRevenueStats] = useState<any>(null);
  const [advancedStats, setAdvancedStats] = useState<any>(null);
  const [selectedStatsPlan, setSelectedStatsPlan] = useState("all");

  // Performance Stats filter state
  const [perfStartDate, setPerfStartDate] = useState("");
  const [perfEndDate, setPerfEndDate] = useState("");
  const [activePerfDateFilter, setActivePerfDateFilter] = useState("all");

  // Revenue Stats filter state
  const [revStartDate, setRevStartDate] = useState("");
  const [revEndDate, setRevEndDate] = useState("");
  const [activeRevDateFilter, setActiveRevDateFilter] = useState("all");

  // Advanced Stats filter state
  const [advStartDate, setAdvStartDate] = useState("");
  const [advEndDate, setAdvEndDate] = useState("");
  const [activeAdvDateFilter, setActiveAdvDateFilter] = useState("all");

  // New filters for leagues and countries
  const [leagueCountryFilter, setLeagueCountryFilter] = useState("");
  const [leagueSearch, setLeagueSearch] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  // Guardamos el país usado para filtrar la tabla de equipos.
  const [teamCountryFilter, setTeamCountryFilter] = useState("");
  const [teamLeagueFilter, setTeamLeagueFilter] = useState("");

  // Picks filters and bulk actions
  const [pickFilterStatus, setPickFilterStatus] = useState("");
  const [pickFilterLeague, setPickFilterLeague] = useState("");
  const [pickFilterType, setPickFilterType] = useState("");
  const [pickFilterIsParlay, setPickFilterIsParlay] = useState("");
  const [selectedPicks, setSelectedPicks] = useState<number[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);

  // Pagination state
  const [countryPage, setCountryPage] = useState(1);
  const [leaguePage, setLeaguePage] = useState(1);
  const itemsPerPage = 10;
  const [newlyAddedCountryId, setNewlyAddedCountryId] = useState<number | null>(null);
  const [newlyAddedLeagueId, setNewlyAddedLeagueId] = useState<number | null>(null);
  const [newlyAddedTeamId, setNewlyAddedTeamId] = useState<number | null>(null);
  const [newlyAddedMarketId, setNewlyAddedMarketId] = useState<string | null>(null);

  const filteredLeagues = useMemo(() => {
    if (!Array.isArray(leagues)) return [];
    return leagues.filter(l =>
      l &&
      (!leagueCountryFilter || l.country_id?.toString() === leagueCountryFilter) &&
      (!leagueSearch || (l.name || "").toLowerCase().includes(leagueSearch.toLowerCase()))
    );
  }, [leagues, leagueCountryFilter, leagueSearch]);

  const filteredCountries = useMemo(() => {
    if (!Array.isArray(countries)) return [];
    return countries.filter(c =>
      !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase())
    );
  }, [countries, countrySearch]);

  const visibleSelectedLeagues = useMemo(() => {
    return selectedLeagues.filter(id => filteredLeagues.some(l => l.id === id));
  }, [selectedLeagues, filteredLeagues]);

  const visibleSelectedCountries = useMemo(() => {
    return selectedCountries.filter(id => filteredCountries.some(c => c.id === id));
  }, [selectedCountries, filteredCountries]);

  // Reset pagination when filters change
  useEffect(() => {
    setCountryPage(1);
  }, [countrySearch]);

  useEffect(() => {
    setLeaguePage(1);
  }, [leagueCountryFilter, leagueSearch]);

  // Sync leagueCountryFilter with leagueForm.country_id for new leagues
  useEffect(() => {
    if (!leagueForm.id) {
      setLeagueForm(prev => ({ ...prev, country_id: leagueCountryFilter }));
    }
  }, [leagueCountryFilter, leagueForm.id]);

  const formatMoney = (amount: number, currency: string = 'COP') => {
    return new Intl.NumberFormat(currency === 'COP' ? 'es-CO' : 'en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: currency === 'COP' ? 0 : 2
    }).format(amount);
  };

  const fetchPicks = async () => {
    try {
      const res = await fetch("/api/picks");
      if (!res.ok) throw new Error("No se pudieron cargar los picks. Verifica la conexión a la base de datos.");
      const data = await res.json();
      setPicks(Array.isArray(data) ? data : []);
      setGlobalError(null);
    } catch (error: any) {
      console.error("Error fetching picks:", error);
      setGlobalError(error.message);
    }
  };

  const fetchMarkets = async () => {
    try {
      const res = await fetch("/api/markets");
      const data = await res.json();
      setMarkets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching markets:", error);
      setMarkets([]);
    }
  };

  const fetchLeagues = async () => {
    try {
      const res = await fetch("/api/leagues");
      if (!res.ok) throw new Error("Error cargando ligas. Es posible que la base de datos no esté respondiendo.");
      const data = await res.json();
      setLeagues(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching leagues:", error);
    }
  };

  const fetchCountries = async () => {
    try {
      const res = await fetch("/api/countries");
      const data = await res.json();
      setCountries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching countries:", error);
      setCountries([]);
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await fetch("/api/teams");
      const data = await res.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching teams:", error);
      setTeams([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching users:", error);
      setUsers([]);
    }
  };

  const fetchPromoCodes = async () => {
    try {
      const res = await fetch("/api/promo-codes", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      setPromoCodes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching promo codes:", error);
      setPromoCodes([]);
    }
  };

  const updatePickType = async (typeId: number, data: any) => {
    setIsSubmittingPickType(true);
    try {
      // Limpiamos espacios accidentales antes de guardar IDs y enlaces de Telegram.
      const payload = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          typeof value === "string" ? value.trim() : value
        ])
      );

      const res = await fetch(`/api/pick-types/${typeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (res.ok) {
        toast.success("Configuración actualizada correctamente");
        // Refrescamos los tipos para ver los cambios
        const typesRes = await fetch("/api/pick-types", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const typesData = await typesRes.json();
        setPickTypes(Array.isArray(typesData) ? typesData.filter((t: any) => t.slug !== 'cuota_5') : []);
      } else {
        toast.error(result.error || "Error al actualizar");
      }
    } catch (error) {
      toast.error("Error de red al actualizar");
    } finally {
      setIsSubmittingPickType(false);
    }
  };

  /**
   * Carga la configuración global del canal espejo VIP Full.
   *
   * @returns Promesa que actualiza el estado local del panel.
   */
  const fetchTelegramFullConfig = async () => {
    try {
      // Pedimos la configuración global que no pertenece a un tipo de pick.
      const res = await fetch("/api/pick-types/telegram-full", {
        headers: { "Authorization": `Bearer ${token}` }
      });

      // Parseamos la respuesta del backend para llenar la tarjeta Full.
      const data = await res.json();

      // Solo usamos la respuesta cuando el backend devuelve un objeto válido.
      if (res.ok) {
        setTelegramFullConfig({
          telegram_channel_id: data.telegram_channel_id || "",
          telegram_invite_link: data.telegram_invite_link || ""
        });
      }
    } catch (error) {
      // Dejamos el panel usable aunque la configuración global no cargue.
      console.error("Error fetching Telegram Full config:", error);
    }
  };

  /**
   * Actualiza la configuración global del canal espejo VIP Full.
   *
   * @param data - Campos de Telegram que se deben guardar para VIP Full.
   */
  const updateTelegramFullConfig = async (data: any) => {
    setIsSubmittingPickType(true);
    try {
      // Limpiamos espacios accidentales antes de guardar el canal espejo.
      const payload = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          typeof value === "string" ? value.trim() : value
        ])
      );

      // Persistimos la configuración Full en el backend.
      const res = await fetch("/api/pick-types/telegram-full", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      // Parseamos el resultado para reflejar el estado guardado.
      const result = await res.json();

      // Mostramos el estado al administrador y sincronizamos la tarjeta.
      if (res.ok) {
        toast.success(result.message || "VIP Full actualizado correctamente");
        setTelegramFullConfig(result.config || telegramFullConfig);
      } else {
        toast.error(result.error || "Error al actualizar VIP Full");
      }
    } catch (error) {
      // Mostramos un error de red cuando no se pudo contactar al backend.
      toast.error("Error de red al actualizar VIP Full");
    } finally {
      // Cerramos el estado de envío de la tarjeta Full.
      setIsSubmittingPickType(false);
    }
  };

  /**
   * Envía un mensaje de prueba al canal espejo VIP Full.
   *
   * @returns Promesa que muestra el resultado del envío en el panel.
   */
  const sendTestTelegramFullMessage = async () => {
    // Activamos el estado de guardado para evitar pruebas repetidas.
    setIsSubmittingPickType(true);

    try {
      // Pedimos al backend que publique un mensaje real en VIP Full.
      const res = await fetch("/api/pick-types/telegram-full/test", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });

      // Parseamos la respuesta para mostrar el resultado al administrador.
      const result = await res.json();

      // Mostramos éxito o error según la respuesta del backend.
      if (res.ok) {
        toast.success(result.message || "Mensaje de prueba enviado a VIP Full");
      } else {
        toast.error(result.error || "No se pudo enviar el mensaje a VIP Full");
      }
    } catch (error) {
      // Mostramos un error de red cuando no se pudo contactar al backend.
      toast.error("Error de red al probar VIP Full");
    } finally {
      // Cerramos el estado de envío de la prueba Full.
      setIsSubmittingPickType(false);
    }
  };

  /**
   * Envía un mensaje de prueba al canal Telegram configurado para un plan.
   *
   * @param typeId - ID del tipo de pick que se probará desde el panel admin.
   */
  const sendTestPickTypeMessage = async (typeId: number) => {
    // Activamos el estado de guardado para deshabilitar acciones repetidas.
    setIsSubmittingPickType(true);

    try {
      // Pedimos al backend que publique un mensaje real con el bot configurado.
      const res = await fetch(`/api/pick-types/${typeId}/test-telegram`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });

      // Parseamos la respuesta para mostrar el resultado al administrador.
      const result = await res.json();

      // Mostramos éxito o error según la respuesta del backend.
      if (res.ok) {
        toast.success(result.message || "Mensaje de prueba enviado");
      } else {
        toast.error(result.error || "No se pudo enviar el mensaje de prueba");
      }
    } catch (error) {
      // Mostramos un error de red cuando no se pudo contactar al backend.
      toast.error("Error de red al probar Telegram");
    } finally {
      // Cerramos el estado de envío del panel Telegram.
      setIsSubmittingPickType(false);
    }
  };

  const handleTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingTeam) return;

    // Validamos nombre, país y liga para evitar enviar equipos incompletos.
    if (!teamForm.name.trim() || !teamForm.country_id || !teamForm.league_id) {
      toast.error("Completa país, liga y nombre del equipo.");
      return;
    }

    setIsSubmittingTeam(true);

    try {
      const url = teamForm.id ? `/api/teams/${teamForm.id}` : "/api/teams";
      const method = teamForm.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: teamForm.name.trim(),
          api_name: teamForm.api_name.trim() || null,
          api_provider_name: teamForm.api_provider_name.trim() || null,
          api_team_id: teamForm.api_team_id.trim() || null,
          league_id: parseInt(teamForm.league_id),
          country_id: parseInt(teamForm.country_id)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar equipo");

      toast.success("Equipo guardado exitosamente");
      setTeamForm({ id: null, name: "", api_name: "", api_provider_name: "", api_team_id: "", league_id: "", country_id: "" });
      setTeamAliasSuggestions([]);
      fetchTeams();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmittingTeam(false);
    }
  };

  /**
   * @summary Consulta candidatos de vínculo en API-Football para el equipo del formulario o uno elegido desde la tabla.
   * @param teamOverride - Equipo opcional que permite sugerir alias sin depender del formulario actual.
   */
  const handleSuggestTeamAlias = async (teamOverride?: { id?: number | null; name: string; league_id?: string; country_id?: string; api_name?: string; api_provider_name?: string; api_team_id?: string | number }) => {
    // Resolvemos el equipo objetivo desde override o desde el formulario activo.
    const targetTeam = teamOverride || teamForm;

    // Validamos que exista nombre visible suficiente para consultar el proveedor.
    if (!targetTeam.name.trim()) {
      toast.error("Primero define el nombre visible del equipo para sugerir el alias API.");
      return;
    }

    // Reflejamos en el formulario el equipo objetivo para que el admin vea qué está revisando.
    if (teamOverride) {
      setTeamForm({
        id: teamOverride.id ?? null,
        name: targetTeam.name,
        api_name: targetTeam.api_name || "",
        api_provider_name: targetTeam.api_provider_name || "",
        api_team_id: String(targetTeam.api_team_id || ""),
        league_id: targetTeam.league_id || "",
        country_id: targetTeam.country_id || "",
      });
      setTeamCountryFilter(targetTeam.country_id || "");
      setTeamLeagueFilter(targetTeam.league_id || "");
    }

    // Activamos el loading del botón para evitar dobles consultas.
    setIsSuggestingTeamAlias(true);

    try {
      // Consultamos candidatos técnicos al backend administrativo.
      const res = await fetch(`/api/teams/provider-alias-suggestions?q=${encodeURIComponent(targetTeam.name.trim())}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      // Leemos la respuesta como JSON para extraer error o candidatos.
      const data = await res.json();

      // Cortamos si el backend devolvió una validación o error operativo.
      if (!res.ok) throw new Error(data.error || "No se pudieron obtener sugerencias de alias");

      // Normalizamos candidatos como arreglo seguro para la UI.
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];

      // Guardamos los candidatos para que el admin elija o confirme.
      setTeamAliasSuggestions(candidates);

      // Si no hubo coincidencias, informamos de forma clara.
      if (candidates.length === 0) {
        toast.info("No encontré coincidencias de alias en API-Football para ese equipo.");
        return;
      }

      // Aplicamos automáticamente la primera coincidencia como propuesta inicial del vínculo exacto.
      setTeamForm((prev) => ({
        ...prev,
        api_name: candidates[0].provider_name || prev.api_name,
        api_provider_name: candidates[0].provider_name || prev.api_provider_name,
        api_team_id: String(candidates[0].provider_id || prev.api_team_id || ""),
      }));

      // Confirmamos que el vínculo exacto quedó sugerido sin tocar el nombre visible.
      toast.success(`Vínculo sugerido: ${candidates[0].provider_name}${candidates[0].provider_id ? ` · ID ${candidates[0].provider_id}` : ""}`);
    } catch (error: any) {
      toast.error(error.message || "No se pudo sugerir el alias API-Football");
    } finally {
      // Cerramos el loading del botón de sugerencias.
      setIsSuggestingTeamAlias(false);
    }
  };

  /**
   * @summary Aplica una sugerencia puntual de API-Football sobre el formulario de equipos.
   * @param candidate - Candidato elegido por el administrador desde la lista de sugerencias.
   */
  const handleApplySuggestedTeamAlias = (candidate: any) => {
    // Aplicamos el nombre oficial, el ID oficial y el alias técnico sin alterar el nombre visible del equipo.
    setTeamForm((prev) => ({
      ...prev,
      api_name: candidate?.provider_name || prev.api_name,
      api_provider_name: candidate?.provider_name || prev.api_provider_name,
      api_team_id: String(candidate?.provider_id || prev.api_team_id || ""),
    }));

    // Confirmamos la selección para que el admin sepa que ya quedó cargada.
    toast.success(`Vínculo aplicado: ${candidate?.provider_name || "API-Football"}${candidate?.provider_id ? ` · ID ${candidate.provider_id}` : ""}`);
  };

  /**
   * @summary Actualiza el país del formulario de equipos y limpia la liga dependiente.
   * @param value - ID del país seleccionado desde el panel de administración.
   */
  const handleTeamFormCountryChange = (value: string) => {
    // Al cambiar país, la liga previa deja de ser confiable.
    setTeamForm(prev => ({ ...prev, country_id: value, league_id: "" }));

    // Limpiamos sugerencias previas porque el contexto del equipo cambió.
    setTeamAliasSuggestions([]);
  };

  /**
   * @summary Actualiza el filtro de país de equipos y limpia el filtro de liga.
   * @param value - ID del país usado para filtrar la tabla de equipos.
   */
  const handleTeamCountryFilterChange = (value: string) => {
    // Guardamos el país activo del filtro.
    setTeamCountryFilter(value);

    // Limpiamos liga porque las ligas visibles dependen del país seleccionado.
    setTeamLeagueFilter("");
  };

  /**
   * @summary Carga un equipo existente en el formulario para editarlo.
   * @param team - Registro de equipo seleccionado desde la tabla del panel.
   */
  const editTeam = (team: any) => {
    // Buscamos la liga para recuperar país si el registro del equipo no lo trae.
    const teamLeague = leagues.find(l => l.id?.toString() === team.league_id?.toString());

    // Resolvemos país desde el equipo o desde su liga.
    const countryId = team.country_id?.toString() || teamLeague?.country_id?.toString() || "";

    // Cargamos el formulario con valores normalizados como string.
    setTeamForm({
      id: team.id,
      name: team.name || "",
      api_name: team.api_name || "",
      api_provider_name: team.api_provider_name || "",
      api_team_id: team.api_team_id ? String(team.api_team_id) : "",
      league_id: team.league_id?.toString() || "",
      country_id: countryId
    });

    // Limpiamos sugerencias antiguas para cargar recomendaciones frescas bajo demanda.
    setTeamAliasSuggestions([]);

    // Sincronizamos filtros para que el equipo editado quede visible.
    setTeamCountryFilter(countryId);
    setTeamLeagueFilter(team.league_id?.toString() || "");
  };

  const deleteTeam = (id: number, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Eliminar Equipo",
      message: `¿Estás seguro de eliminar el equipo "${name}"?`,
      confirmText: "Eliminar",
      variant: "destructive",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/teams/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            toast.success("Equipo eliminado");
            fetchTeams();
          }
        } catch (error) {
          toast.error("Error al eliminar equipo");
        }
      }
    });
  };

  /**
   * @summary Crea o actualiza un cupón manteniendo su vencimiento en hora Colombia.
   * @param e - Evento submit del formulario de cupones.
   */
  const handleSubmitPromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingPromoCode(true);
    try {
      const url = editingPromoCodeId ? `/api/promo-codes/${editingPromoCodeId}` : "/api/promo-codes";
      const method = editingPromoCodeId ? "PUT" : "POST";
      // Preparamos el payload para enviar la fecha sin conversión UTC.
      const promoPayload = {
        // Conservamos los campos del formulario actual.
        ...newPromoCode,
        // Convertimos datetime-local a DATETIME MySQL en hora Colombia.
        valid_until: normalizePromoDateForApi(newPromoCode.valid_until)
      };

      const res = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(promoPayload)
      });
      if (res.ok) {
        setNewPromoCode({ code: '', discount_percentage: '', max_uses: '', valid_until: '' });
        setEditingPromoCodeId(null);
        fetchPromoCodes();
        toast.success(editingPromoCodeId ? "Código actualizado correctamente" : "Código creado correctamente");
      } else {
        const data = await res.json();
        toast.error(data.error || `Error al ${editingPromoCodeId ? 'actualizar' : 'crear'} código`);
      }
    } catch (error) {
      toast.error("Error de conexión");
    } finally {
      setIsSubmittingPromoCode(false);
    }
  };

  /**
   * @summary Carga un cupón en el formulario de edición sin desplazar la hora guardada.
   * @param promo - Cupón seleccionado desde la tabla de administración.
   */
  const handleEditPromoCodeInit = (promo: any) => {
    setEditingPromoCodeId(promo.id);
    setNewPromoCode({
      code: promo.code,
      discount_percentage: promo.discount_percentage.toString(),
      max_uses: promo.max_uses ? promo.max_uses.toString() : '',
      valid_until: formatPromoDateForInput(promo.valid_until)
    });
    // Scroll up to the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelPromoCodeEdit = () => {
    setEditingPromoCodeId(null);
    setNewPromoCode({ code: '', discount_percentage: '', max_uses: '', valid_until: '' });
  };

  const handleDeletePromoCode = (id: number) => {
    setConfirmDialog({
      isOpen: true,
      title: "Eliminar Cupón",
      message: "¿Estás seguro de eliminar este código promocional?",
      confirmText: "Eliminar",
      variant: "destructive",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/promo-codes/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            fetchPromoCodes();
            toast.success("Código eliminado");
          }
        } catch (error) {
          toast.error("Error al eliminar código");
        }
      }
    });
  };

  const fetchPerformanceStats = async () => {
    try {
      let query = "";
      if (perfStartDate && perfEndDate) {
        query = `?startDate=${perfStartDate} 00:00:00&endDate=${perfEndDate} 23:59:59`;
      }
      const perfRes = await fetch(`/api/stats/performance${query}`);
      const perfData = await perfRes.json();
      setPerformanceStats(perfData && typeof perfData === 'object' && !perfData.error ? perfData : null);
    } catch (error) {
      console.error("Error fetching performance stats:", error);
      setPerformanceStats(null);
    }
  };

  const fetchRevenueStats = async () => {
    try {
      let query = "";
      if (revStartDate && revEndDate) {
        query = `?startDate=${revStartDate} 00:00:00&endDate=${revEndDate} 23:59:59`;
      }
      const revRes = await fetch(`/api/stats/revenue${query}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const revData = await revRes.json();
      setRevenueStats(revData && typeof revData === 'object' && !revData.error ? revData : null);
    } catch (error) {
      console.error("Error fetching revenue stats:", error);
      setRevenueStats(null);
    }
  };

  const fetchAdvancedStats = async () => {
    try {
      let query = "";
      if (advStartDate && advEndDate) {
        query = `?startDate=${advStartDate} 00:00:00&endDate=${advEndDate} 23:59:59`;
      }
      const advRes = await fetch(`/api/stats/advanced${query}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const advData = await advRes.json();
      setAdvancedStats(advData && typeof advData === 'object' && !advData.error ? advData : null);
    } catch (error) {
      console.error("Error fetching advanced stats:", error);
      setAdvancedStats(null);
    }
  };

  useEffect(() => {
    if (activeTab === "list-picks") {
      fetchPicks();
    } else if (activeTab === "markets") {
      fetchMarkets();
    } else if (activeTab === "leagues") {
      fetchLeagues();
      fetchCountries();
    } else if (activeTab === "countries") {
      fetchCountries();
    } else if (activeTab === "users") {
      fetchUsers();
    } else if (activeTab === "promo-codes") {
      fetchPromoCodes();
    } else if (activeTab === "teams") {
      fetchTeams();
      fetchLeagues();
      fetchCountries();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "stats") {
      fetchPerformanceStats();
    }
  }, [activeTab, perfStartDate, perfEndDate]);

  useEffect(() => {
    if (activeTab === "stats") {
      fetchRevenueStats();
    }
  }, [activeTab, revStartDate, revEndDate]);

  useEffect(() => {
    if (activeTab === "stats") {
      fetchAdvancedStats();
    }
  }, [activeTab, advStartDate, advEndDate]);

  useEffect(() => {
    const fetchPickTypes = async () => {
      try {
        const res = await fetch("/api/pick-types", {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        const data = await res.json();
        setPickTypes(Array.isArray(data) ? data.filter((t: any) => t.slug !== 'cuota_5') : []);
        if (data.length > 0 && !editingPickId) {
          setFormData(prev => ({ ...prev, pick_type_id: data[0].id.toString() }));
        }
      } catch (error) {
        console.error("Error fetching pick types:", error);
      }
    };

    const checkApiData = async () => {
      try {
        const [teamsRes, leaguesRes, countriesRes] = await Promise.all([
          fetch("/api/teams"),
          fetch("/api/leagues"),
          fetch("/api/countries")
        ]);
        const t = await teamsRes.json();
        const l = await leaguesRes.json();
        const c = await countriesRes.json();
        console.log("--- DIAGNÓSTICO DE DATOS ---");
        console.log("Equipos:", Array.isArray(t) ? t.length : "ERROR: " + JSON.stringify(t));
        console.log("Ligas:", Array.isArray(l) ? l.length : "ERROR: " + JSON.stringify(l));
        console.log("Países:", Array.isArray(c) ? c.length : "ERROR: " + JSON.stringify(c));
      } catch (e) {
        console.error("Error en diagnóstico de API:", e);
      }
    };

    fetchPickTypes();
    fetchTelegramFullConfig();
    fetchMarkets();
    fetchCountries();
    fetchLeagues();
    fetchTeams();
    checkApiData();
  }, []);

  /**
   * @summary Actualiza el formulario principal de picks y recalcula cuota total en parlays.
   * @param e - Evento de cambio de input, select o textarea del formulario.
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    // Extraemos datos base del control que disparó el cambio.
    const { name, value, type } = e.target;
    // Normalizamos checkboxes para conservar valores booleanos.
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;

    setFormData(prev => {
      const newData = { ...prev, [name]: type === 'checkbox' ? checked : value };

      // Update match_name automatically if home_team or away_team changes
      if (name === 'home_team' || name === 'away_team') {
        const homeId = name === 'home_team' ? value : prev.home_team;
        const awayId = name === 'away_team' ? value : prev.away_team;

        // Find team names for the label
        const homeName = teams.find(t => t.id.toString() === homeId)?.name || "";
        const awayName = teams.find(t => t.id.toString() === awayId)?.name || "";

        if (homeName && awayName) {
          newData.match_name = `${homeName} vs ${awayName}`;
        }
      }

      // Reset or calculate odds if it's a parlay
      if (newData.is_parlay) {
        if (newData.selections.length > 0) {
          const totalOdds = newData.selections.reduce((acc, sel) => acc * (parseFloat(sel.odds) || 1), 1);
          newData.odds = totalOdds > 1 ? totalOdds.toFixed(2) : "";
        } else if (name === 'is_parlay' && checked) {
          // If just switched to parlay and no selections, clear odds
          newData.odds = "";
        }
      }

      return newData;
    });
  };

  const handleQuickTeamCreate = async (name: string, field: QuickTeamTarget) => {
    // Buscamos la selección de parlay si la creación viene desde una fila combinada.
    const selection = typeof field === 'object' ? formData.selections[field.selectionIndex] : null;

    // Usamos país principal para picks simples y país de la selección para parlays.
    const countryId = selection ? selection.country_id : formData.country_id;

    // Usamos liga principal para picks simples y liga de la selección para parlays.
    const leagueId = selection ? selection.league_id : formData.league_id;

    // Sin país/liga no podemos asociar el equipo de forma correcta.
    if (!leagueId || !countryId) {
      toast.error("Selecciona primero el país y la liga para agregar un equipo.");
      return;
    }

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          api_name: name.trim(),
          league_id: parseInt(leagueId),
          country_id: parseInt(countryId)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear equipo");

      toast.success(`Equipo "${name}" creado exitosamente`);
      fetchTeams();

      if (typeof field === 'object') {
        setFormData(prev => {
          // Copiamos selecciones para no mutar el estado original.
          const newSelections = [...prev.selections];

          // Copiamos la selección objetivo antes de escribir el nuevo equipo.
          const currentSelection = { ...newSelections[field.selectionIndex], [field.field]: data.id.toString() };

          // Resolvemos el equipo local con el nuevo nombre si aplica.
          const homeName = field.field === 'home_team' ? name : (teams.find(t => t.id.toString() === currentSelection.home_team)?.name || "");

          // Resolvemos el equipo visitante con el nuevo nombre si aplica.
          const awayName = field.field === 'away_team' ? name : (teams.find(t => t.id.toString() === currentSelection.away_team)?.name || "");

          // Si ya existen ambos equipos, armamos automáticamente el partido.
          if (homeName && awayName) {
            currentSelection.match_name = `${homeName} vs ${awayName}`;
          }

          // Guardamos la selección actualizada en su posición.
          newSelections[field.selectionIndex] = currentSelection;

          // Recalculamos la cuota total del parlay después de editar selecciones.
          const totalOdds = newSelections.reduce((acc, sel) => acc * (parseFloat(sel.odds) || 1), 1);

          // Devolvemos el formulario con selección y cuota total actualizadas.
          return {
            ...prev,
            selections: newSelections,
            odds: newSelections.length > 0 && totalOdds > 1 ? totalOdds.toFixed(2) : ""
          };
        });
      } else {
        setFormData(prev => {
          const newState = { ...prev, [field]: data.id.toString() };
          // If both teams are selected, update match_name
          const otherField = field === 'home_team' ? 'away_team' : 'home_team';
          const otherTeamId = prev[otherField];
          const homeName = field === 'home_team' ? name : (teams.find(t => t.id.toString() === otherTeamId)?.name || "");
          const awayName = field === 'away_team' ? name : (teams.find(t => t.id.toString() === otherTeamId)?.name || "");

          if (homeName && awayName) {
            newState.match_name = `${homeName} vs ${awayName}`;
          }
          return newState;
        });
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  /**
   * @summary Busca partidos en la API externa para vinculación automática.
   * @param queryOverride - Texto puntual que debe usarse en vez del estado del input.
   * @param dateOverride - Fecha puntual para reducir falsos positivos en API-Football.
   * @param providerTeamLinkOverride - IDs exactos del proveedor cuando ambos equipos ya están vinculados.
   */
  const handleSearchFixtures = async (
    queryOverride?: string,
    dateOverride?: string,
    providerTeamLinkOverride?: { homeProviderTeamId?: string; awayProviderTeamId?: string }
  ) => {
    // Definimos la búsqueda final para evitar usar un estado anterior.
    const finalQuery = (queryOverride || fixtureSearchQuery).trim();

    // Definimos la fecha final desde parametro o desde el formulario activo.
    const finalDate = getFixtureSearchDate(dateOverride || (formData.is_parlay && activeSelectionFixtureIndex !== null ? formData.selections[activeSelectionFixtureIndex]?.match_time : formData.match_date));

    // Leemos el vínculo exacto del proveedor si ya fue resuelto por el llamador.
    const providerTeamLink = providerTeamLinkOverride || {};

    // Validamos que exista búsqueda visible o ambos IDs del proveedor.
    if ((!finalQuery && !(providerTeamLink.homeProviderTeamId && providerTeamLink.awayProviderTeamId)) || isSearchingFixtures) return;
    
    setIsSearchingFixtures(true);
    try {
      const params = new URLSearchParams();

      // Solo enviamos q cuando realmente exista texto visible para depuración y fallback.
      if (finalQuery) params.set("q", finalQuery);

      if (finalDate) params.set("date", finalDate);
      if (providerTeamLink.homeProviderTeamId) params.set("home_provider_team_id", providerTeamLink.homeProviderTeamId);
      if (providerTeamLink.awayProviderTeamId) params.set("away_provider_team_id", providerTeamLink.awayProviderTeamId);

      const res = await fetch(`/api/scores/search?${params.toString()}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      
      // Convertimos limites de plan API-Football en advertencia controlada, no en error critico.
      if (data?.code === "API_PLAN_LIMIT") {
        // Limpiamos resultados para evitar que quede un fixture viejo seleccionado visualmente.
        setFixtureSearchResults([]);

        // Mostramos aviso operativo para que el admin sepa que debe vincular manualmente o ampliar plan.
        toast.warning(data.error || "API-Football no permite consultar esa fecha con el plan actual.");

        // Cortamos el flujo sin lanzar error rojo.
        return;
      }

      // Cualquier otro status HTTP sigue siendo error real del flujo.
      if (!res.ok) throw new Error(data.error || "Error al buscar partidos");
      
      const fixtures = Array.isArray(data.fixtures) ? data.fixtures : [];
      setFixtureSearchResults(fixtures);
      
      if (fixtures.length === 0) {
        toast.info("No se encontraron partidos para esa búsqueda en API-Football");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSearchingFixtures(false);
    }
  };

  /**
   * @summary Busca el fixture activo usando aliases API cuando el input esta vacio.
   */
  const handleSearchCurrentFixture = () => {
    // Detectamos si la busqueda pertenece a una seleccion de parlay.
    const activeSelection = formData.is_parlay && activeSelectionFixtureIndex !== null ? formData.selections[activeSelectionFixtureIndex] : null;

    // Construimos el contexto de búsqueda para parlay o pick individual.
    const providerSearchContext = activeSelection
      ? buildProviderFixtureSearchContext(activeSelection.home_team, activeSelection.away_team, activeSelection.match_name, teams)
      : buildProviderFixtureSearchContext(formData.home_team, formData.away_team, formData.match_name, teams);

    // Preferimos lo escrito manualmente, pero si esta vacio usamos aliases API.
    const finalQuery = fixtureSearchQuery.trim() || providerSearchContext.query;

    // Sin consulta visible ni IDs exactos no hay búsqueda posible.
    if (!finalQuery && !(providerSearchContext.homeProviderTeamId && providerSearchContext.awayProviderTeamId)) return;

    // Reflejamos en pantalla la busqueda tecnica que se enviara al proveedor.
    setFixtureSearchQuery(finalQuery);

    // Ejecutamos búsqueda con fecha de la selección o del pick simple.
    handleSearchFixtures(
      finalQuery,
      activeSelection ? activeSelection.match_time : formData.match_date,
      {
        homeProviderTeamId: providerSearchContext.homeProviderTeamId,
        awayProviderTeamId: providerSearchContext.awayProviderTeamId,
      }
    );
  };

  /**
   * @summary Limpia el contexto actual de vinculación con API-Football para pick simple o parlay.
   */
  const resetFixtureSearchState = () => {
    // Limpiamos el índice activo para salir del modo vinculación por selección.
    setActiveSelectionFixtureIndex(null);

    // Limpiamos resultados anteriores para no confundir al admin.
    setFixtureSearchResults([]);

    // Limpiamos el texto de búsqueda visible en el panel.
    setFixtureSearchQuery("");
  };

  /**
   * @summary Aplica un fixture encontrado al pick simple o a la selección activa del parlay.
   * @param fixture - Resultado elegido desde el panel de búsqueda de API-Football.
   */
  const handleApplyFixtureResult = (fixture: any) => {
    // Si existe una selección activa, vinculamos ese fixture dentro del parlay.
    if (formData.is_parlay && activeSelectionFixtureIndex !== null) {
      // Copiamos las selecciones actuales para evitar mutación directa.
      const newSelections = [...formData.selections];

      // Leemos la selección objetivo del parlay.
      const currentSelection = newSelections[activeSelectionFixtureIndex];

      // Protegemos el flujo si la selección ya no existe por un cambio reciente.
      if (!currentSelection) {
        toast.error("La selección que ibas a vincular ya no está disponible.");
        resetFixtureSearchState();
        return;
      }

      // Guardamos el fixture oficial y mantenemos la fecha existente o la de la API como respaldo.
      newSelections[activeSelectionFixtureIndex] = {
        ...currentSelection,
        api_fixture_id: fixture.id,
        thesportsdb_event_id: "",
        match_time: currentSelection.match_time || getFixtureDateTimeValue(fixture)
      };

      // Persistimos la selección vinculada en el formulario.
      setFormData((prev) => ({ ...prev, selections: newSelections }));

      // Confirmamos visualmente el vínculo aplicado.
      toast.success(`Selección vinculada con API-Football: ${fixture.name}`);

      // Cerramos el modo de búsqueda para esa selección.
      resetFixtureSearchState();
      return;
    }

    // Si es pick simple, guardamos el fixture en el formulario principal.
    setFormData((prev) => ({
      ...prev,
      api_fixture_id: fixture.id,
      thesportsdb_event_id: "",
      match_date: prev.match_date || getFixtureDateTimeValue(fixture)
    }));

    // Confirmamos visualmente el vínculo del pick simple.
    toast.success(`Pick vinculado con API-Football: ${fixture.name}`);
  };

  /**
   * @summary Activa la vinculación de una selección del parlay y abre la búsqueda compartida.
   * @param selectionIndex - Posición de la selección que debe vincularse con el proveedor.
   */
  const handleStartSelectionFixtureLink = (selectionIndex: number) => {
    // Leemos la selección objetivo desde el formulario actual.
    const selection = formData.selections[selectionIndex];

    // Cortamos si la selección ya no existe por cambios simultáneos del admin.
    if (!selection) {
      toast.error("No encontré la selección que intentas vincular.");
      return;
    }

    // Construimos la búsqueda técnica usando nombre oficial e IDs API cuando existan.
    const providerSearchContext = buildProviderFixtureSearchContext(selection.home_team, selection.away_team, selection.match_name, teams);

    // Activamos el índice de la selección para que el panel sepa dónde aplicar el fixture.
    setActiveSelectionFixtureIndex(selectionIndex);

    // Reflejamos la consulta en el input del buscador compartido.
    setFixtureSearchQuery(providerSearchContext.query || selection.match_name || "");

    // Disparamos la búsqueda automática cuando ya tenemos datos suficientes.
    if (providerSearchContext.query || selection.match_name || (providerSearchContext.homeProviderTeamId && providerSearchContext.awayProviderTeamId)) {
      handleSearchFixtures(
        providerSearchContext.query || selection.match_name,
        selection.match_time,
        {
          homeProviderTeamId: providerSearchContext.homeProviderTeamId,
          awayProviderTeamId: providerSearchContext.awayProviderTeamId,
        }
      );
    }

    // Llevamos al admin hasta el panel de búsqueda compartido.
    const searchElement = document.getElementById("fixture-search-area");

    // Hacemos scroll suave si el panel ya está montado en pantalla.
    if (searchElement) searchElement.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /**
   * @summary Renderiza el panel compartido de vinculación con API-Football para picks simples y parleys.
   * @returns Bloque visual de búsqueda, selección y confirmación de fixtures.
   */
  const renderFixtureSearchPanel = () => {
    // Resolvemos la selección activa cuando la vinculación viene desde un parlay.
    const activeSelection = formData.is_parlay && activeSelectionFixtureIndex !== null ? formData.selections[activeSelectionFixtureIndex] : null;

    // Detectamos si el panel está en modo vinculación de selección.
    const isSelectionMode = Boolean(activeSelection);

    // Resolvemos el contexto exacto del proveedor para el pick activo o la selección activa.
    const activeProviderSearchContext = isSelectionMode
      ? buildProviderFixtureSearchContext(activeSelection?.home_team, activeSelection?.away_team, activeSelection?.match_name || "", teams)
      : buildProviderFixtureSearchContext(formData.home_team, formData.away_team, formData.match_name, teams);

    // Calculamos el ID actualmente vinculado según el contexto activo del panel.
    const linkedFixtureId = String(isSelectionMode
      ? (activeSelection?.api_fixture_id || activeSelection?.thesportsdb_event_id || "")
      : (formData.api_fixture_id || formData.thesportsdb_event_id || ""));

    // Construimos una etiqueta legible del vínculo actual para mostrar confirmación.
    const linkedFixtureLabel = isSelectionMode
      ? (activeSelection?.api_fixture_id || activeSelection?.thesportsdb_event_id || "")
      : (formData.api_fixture_id || formData.thesportsdb_event_id || "");

    // Detectamos si el fixture ya vinculado aparece en los resultados mostrados.
    const linkedFixtureVisible = fixtureSearchResults.some((fixture: any) => String(fixture.id || fixture.fixture?.id || "") === linkedFixtureId);

    // Renderizamos un único panel reutilizable para los dos flujos.
    return (
      <div id="fixture-search-area" className="p-6 bg-primary/5 border border-primary/20 rounded-3xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Search className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-black text-primary uppercase tracking-widest">Vinculación Automática</h3>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Busca el partido en API-Football para marcadores automáticos</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mr-1">Auto-Update</span>
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, auto_update: !prev.auto_update }))}
              className={`w-12 h-6 rounded-full transition-all relative ${formData.auto_update ? "bg-primary" : "bg-white/10"}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.auto_update ? "left-7" : "left-1"}`} />
            </button>
          </div>
        </div>

        {isSelectionMode && activeSelection && (
          <div className="flex flex-col md:flex-row md:items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-primary/70">Selección activa del parlay</div>
              <div className="text-sm font-black text-foreground truncate">{activeSelection.match_name || "Selección sin nombre final"}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {activeProviderSearchContext.query || "Completa local y visitante para una búsqueda más precisa"}
              </div>
              {activeProviderSearchContext.homeProviderTeamId && activeProviderSearchContext.awayProviderTeamId && (
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300/90">
                  Vinculación exacta API: {activeProviderSearchContext.homeProviderTeamId} vs {activeProviderSearchContext.awayProviderTeamId}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={resetFixtureSearchState}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary transition-all"
            >
              Cancelar vínculo
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder={isSelectionMode ? "Buscar esta selección en API-Football..." : "Buscar equipos (ej: Real Madrid)..."}
            value={fixtureSearchQuery}
            onChange={(e) => setFixtureSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearchCurrentFixture())}
            className="flex-1 bg-background border border-white/10 rounded-2xl px-5 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
          />
          <button
            type="button"
            onClick={handleSearchCurrentFixture}
            disabled={isSearchingFixtures}
            className="bg-primary/20 text-primary border border-primary/30 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary hover:text-primary-foreground transition-all flex items-center gap-2 min-w-[140px] justify-center disabled:opacity-50"
          >
            {isSearchingFixtures ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
          </button>
        </div>

        {activeProviderSearchContext.homeProviderTeamId && activeProviderSearchContext.awayProviderTeamId && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[11px] text-emerald-100">
            <span className="font-black uppercase tracking-[0.18em] text-emerald-300">Búsqueda exacta activa</span>
            <span className="ml-2">Este cruce se está consultando por IDs oficiales de API-Football: {activeProviderSearchContext.homeProviderTeamId} vs {activeProviderSearchContext.awayProviderTeamId}.</span>
          </div>
        )}

        {fixtureSearchResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
            {fixtureSearchResults.map((fixture: any) => (
              <div
                key={fixture.id}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex justify-between items-center gap-4 ${String(fixture.id || fixture.fixture?.id || "") === linkedFixtureId ? "bg-primary/20 border-primary shadow-lg shadow-primary/10" : "bg-black/40 border-white/5 hover:border-white/20"}`}
                onClick={() => handleApplyFixtureResult(fixture)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-black bg-white/10 text-muted-foreground px-1.5 py-0.5 rounded uppercase tracking-tighter">
                      {fixture.league}
                    </span>
                    <span className="text-[9px] font-black text-primary/60 uppercase tracking-widest">
                      {fixture.date} {fixture.time}
                    </span>
                  </div>
                  <div className="text-xs font-black text-foreground truncate">
                    {fixture.name}
                  </div>
                  {fixture.homeScore !== null && (
                    <div className="text-[10px] font-bold text-primary mt-1">
                      Resultado: {fixture.homeScore} - {fixture.awayScore} ({fixture.status})
                    </div>
                  )}
                </div>
                {String(fixture.id || fixture.fixture?.id || "") === linkedFixtureId ? (
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-white/20 shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}

        {linkedFixtureId && !linkedFixtureVisible && (
          <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-2xl">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary">
              Evento vinculado ({linkedFixtureLabel})
            </span>
            <button
              type="button"
              onClick={() => {
                if (activeSelectionFixtureIndex !== null) {
                  const newSelections = [...formData.selections];
                  newSelections[activeSelectionFixtureIndex] = {
                    ...newSelections[activeSelectionFixtureIndex],
                    api_fixture_id: "",
                    thesportsdb_event_id: "",
                  };
                  setFormData((prev) => ({ ...prev, selections: newSelections }));
                  resetFixtureSearchState();
                  return;
                }
                setFormData((prev) => ({ ...prev, api_fixture_id: "", thesportsdb_event_id: "" }));
              }}
              className="ml-auto text-[10px] font-black text-muted-foreground hover:text-destructive transition-colors uppercase tracking-widest"
            >
              Desvincular
            </button>
          </div>
        )}
      </div>
    );
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => {
      // Escribimos el valor seleccionado en el campo del formulario.
      const newData = { ...prev, [name]: value };

      // Si cambia el país, limpiamos liga y equipos para evitar cruces inválidos.
      if (name === 'country_id') {
        newData.league_id = "";
        newData.home_team = "";
        newData.away_team = "";
        newData.match_name = "";
      }

      // Si cambia la liga, limpiamos equipos porque pertenecen a otra competición.
      if (name === 'league_id') {
        newData.home_team = "";
        newData.away_team = "";
        newData.match_name = "";
      }

      // Si cambia equipo local o visitante, armamos automáticamente el partido.
      if (name === 'home_team' || name === 'away_team') {
        const homeId = name === 'home_team' ? value : prev.home_team;
        const awayId = name === 'away_team' ? value : prev.away_team;
        const homeName = teams.find(t => t.id.toString() === homeId)?.name || "";
        const awayName = teams.find(t => t.id.toString() === awayId)?.name || "";

        // Solo actualizamos el evento cuando ambos equipos están definidos.
        if (homeName && awayName) {
          newData.match_name = `${homeName} vs ${awayName}`;
        }
      }

      // Devolvemos el estado coherente con país, liga y equipos.
      return newData;
    });
  };

  const addSelection = () => {
    setFormData(prev => ({
      ...prev,
      selections: [
        ...prev.selections,
        { country_id: "", league_id: "", home_team: "", away_team: "", match_name: "", match_time: "", pick: "", odds: "", api_fixture_id: "", thesportsdb_event_id: "", score_home: null, score_away: null }
      ]
    }));
  };

  const removeSelection = (index: number) => {
    // Si eliminamos la selección activa del panel de búsqueda, reseteamos el contexto.
    if (activeSelectionFixtureIndex === index) {
      resetFixtureSearchState();
    }

    // Si quitamos una fila previa a la activa, ajustamos el índice para mantener coherencia.
    if (activeSelectionFixtureIndex !== null && activeSelectionFixtureIndex > index) {
      setActiveSelectionFixtureIndex(activeSelectionFixtureIndex - 1);
    }

    setFormData(prev => {
      const newSelections = [...prev.selections];
      newSelections.splice(index, 1);

      const totalOdds = newSelections.reduce((acc, sel) => acc * (parseFloat(sel.odds) || 1), 1);

      return {
        ...prev,
        selections: newSelections,
        odds: newSelections.length > 0 && totalOdds > 1 ? totalOdds.toFixed(2) : ""
      };
    });
  };

  const handleSelectionChange = (index: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    setFormData(prev => {
      const newSelections = [...prev.selections];
      const updatedSelection = { ...newSelections[index], [name]: value };

      // Si cambia el país de una selección, limpiamos liga/equipos de esa fila.
      if (name === 'country_id') {
        updatedSelection.league_id = "";
        updatedSelection.home_team = "";
        updatedSelection.away_team = "";
        updatedSelection.match_name = "";
      }

      // Si cambia la liga de una selección, limpiamos equipos de esa fila.
      if (name === 'league_id') {
        updatedSelection.home_team = "";
        updatedSelection.away_team = "";
        updatedSelection.match_name = "";
      }

      // Si cambia equipo local o visitante, armamos automáticamente el partido.
      if (name === 'home_team' || name === 'away_team') {
        const homeId = name === 'home_team' ? value : updatedSelection.home_team;
        const awayId = name === 'away_team' ? value : updatedSelection.away_team;
        const homeName = teams.find(t => t.id.toString() === homeId)?.name || "";
        const awayName = teams.find(t => t.id.toString() === awayId)?.name || "";

        // Solo actualizamos el evento cuando ambos equipos están definidos.
        if (homeName && awayName) {
          updatedSelection.match_name = `${homeName} vs ${awayName}`;
        }
      }

      newSelections[index] = updatedSelection;

      const totalOdds = newSelections.reduce((acc, sel) => acc * (parseFloat(sel.odds) || 1), 1);

      return {
        ...prev,
        selections: newSelections,
        odds: newSelections.length > 0 && totalOdds > 1 ? totalOdds.toFixed(2) : ""
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("handleSubmit called", { editingPickId, formData, isSubmittingPick });
    if (isSubmittingPick) {
      console.log("Already submitting, returning");
      return;
    }

    setIsSubmittingPick(true);

    try {
      console.log("Preparing submission data...");

      // Fecha del pick o primera selección del Parlay
      const dateToCheck = formData.is_parlay && formData.selections.length > 0
        ? formData.selections[0].match_time
        : formData.match_date;

      if (dateToCheck) {
        const year = new Date(dateToCheck).getFullYear();
        const currentYear = new Date().getFullYear();
        if (year > currentYear + 10 || year < 2020) {
          throw new Error(`Fecha inválida: el año ${year} parece ser un error.`);
        }
      }

      const url = editingPickId ? `/api/picks/${editingPickId}` : "/api/picks";
      const method = editingPickId ? "PUT" : "POST";

      // If it's a parlay, we use the date of the first selection as the main match_date
      const submissionData = { 
        ...formData,
        api_fixture_id: formData.api_fixture_id ? Number(formData.api_fixture_id) : null,
        thesportsdb_event_id: formData.thesportsdb_event_id || null,
        auto_update: formData.auto_update ? 1 : 0,
        score_home: (formData as any).score_home !== "" && (formData as any).score_home !== null ? Number((formData as any).score_home) : null,
        score_away: (formData as any).score_away !== "" && (formData as any).score_away !== null ? Number((formData as any).score_away) : null
      };

      if (submissionData.is_parlay && submissionData.selections.length > 0) {
        submissionData.match_date = submissionData.selections[0].match_time;
        submissionData.match_name = `Parlay (${submissionData.selections.length} Selecciones)`;
      }

      console.log("Submission data prepared:", submissionData);
      console.log(`Sending ${method} request to ${url}`);

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(submissionData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || "Error al guardar el pick");
      }

      toast.success(editingPickId ? "¡Pick actualizado exitosamente!" : "¡Pick publicado exitosamente!");

      if (!editingPickId) {
        setFormData({
          match_date: "",
          country_id: "",
          league_id: "",
          home_team: "",
          away_team: "",
          match_name: "",
          pick: "",
          odds: "",
          stake: "1",
          analysis: "",
          is_parlay: false,
          selections: [],
          api_fixture_id: "",
          auto_update: true
        });
        setFixtureSearchQuery("");
        setFixtureSearchResults([]);
      }

      // Background fetch
      fetchPicks();

      if (editingPickId) {
        setEditingPickId(null);
        setFormData({
          match_date: "",
          country_id: "",
          league_id: "",
          home_team: "",
          away_team: "",
          match_name: "",
          pick: "",
          odds: "",
          stake: "1",
          pick_type_id: pickTypes.length > 0 ? pickTypes[0].id.toString() : "1",
          analysis: "",
          api_fixture_id: "",
          auto_update: true,
          is_parlay: false,
          selections: []
        });
        setFixtureSearchQuery("");
        setFixtureSearchResults([]);
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmittingPick(false);
    }
  };

  const resendPickToTelegram = (pickId: number) => {
    setConfirmDialog({
      isOpen: true,
      title: "Reenviar Pick a Telegram",
      message: "¿Seguro que deseas reenviar este pick a Telegram? Esto enviará una notificación a todos los canales correspondientes al plan de este pick.",
      confirmText: "Reenviar",
      variant: "emerald",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/picks/${pickId}/resend-telegram`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          
          const data = await res.json();
          
          if (!res.ok) {
            throw new Error(data.error || "Error al reenviar el pick");
          }
          
          toast.success(data.message || "Pick reenviado exitosamente a Telegram");
        } catch (error: any) {
          toast.error(error.message);
        }
      }
    });
  };

  const handleEditPick = (pick: any) => {
    const date = new Date(pick.match_date);
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);

    // Find the country_id for the league
    const league = leagues.find(l => l.id === pick.league_id);
    const countryId = league?.country_id ? league.country_id.toString() : "";

    let parsedSelections = [];
    if (pick.selections) {
      if (typeof pick.selections === 'string') {
        try {
          parsedSelections = JSON.parse(pick.selections);
        } catch (e) {
          console.error("Error parsing selections:", e);
        }
      } else if (Array.isArray(pick.selections)) {
        parsedSelections = pick.selections;
      }
    }

    // Intentar deducir equipos si no vienen IDs explícitos (compatibilidad con picks viejos)
    let homeTeamId = pick.home_team_id ? pick.home_team_id.toString() : "";
    let awayTeamId = pick.away_team_id ? pick.away_team_id.toString() : "";

    // Si no hay IDs guardados, intentamos encontrarlos por nombre en la liga actual
    if (!homeTeamId && !awayTeamId && pick.match_name && pick.match_name.includes(" vs ")) {
      const parts = pick.match_name.split(" vs ");
      if (parts.length === 2) {
        const hName = parts[0].trim();
        const aName = parts[1].trim();
        const hTeam = teams.find(t => t.name.toLowerCase() === hName.toLowerCase() && t.league_id === pick.league_id);
        const aTeam = teams.find(t => t.name.toLowerCase() === aName.toLowerCase() && t.league_id === pick.league_id);
        if (hTeam) homeTeamId = hTeam.id.toString();
        if (aTeam) awayTeamId = aTeam.id.toString();
      }
    }

    setFormData({
      match_date: localISOTime,
      country_id: countryId,
      league_id: pick.league_id ? pick.league_id.toString() : "",
      home_team: homeTeamId,
      away_team: awayTeamId,
      match_name: pick.match_name || "",
      pick: pick.pick ? pick.pick.toString() : "",
      odds: pick.odds ? pick.odds.toString() : "",
      stake: pick.stake ? pick.stake.toString() : "1",
      pick_type_id: pick.pick_type_id ? pick.pick_type_id.toString() : "1",
      analysis: pick.analysis || "",
      is_parlay: pick.is_parlay === 1 || pick.is_parlay === true,
      selections: parsedSelections,
      api_fixture_id: pick.api_fixture_id || "",
      thesportsdb_event_id: pick.thesportsdb_event_id || "",
      auto_update: pick.auto_update === 1 || pick.auto_update === true,
      score_home: pick.score_home !== null ? pick.score_home : "",
      score_away: pick.score_away !== null ? pick.score_away : ""
    });








    setEditingPickId(pick.id);
    setActiveTab("new-pick");
  };

  const cancelEdit = () => {
    setEditingPickId(null);
    setFormData({
      match_date: "",
      country_id: "",
      league_id: "",
      home_team: "",
      away_team: "",
      match_name: "",
      pick: "",
      odds: "",
      stake: "1",
      pick_type_id: pickTypes.length > 0 ? pickTypes[0].id.toString() : "1",
      analysis: "",
      is_parlay: false,
      selections: [],
      api_fixture_id: "",
      thesportsdb_event_id: "",
      auto_update: true
    });
    setFixtureSearchQuery("");
    setFixtureSearchResults([]);
  };

  const updatePickStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/picks/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      fetchPicks();
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  /**
   * @summary Abre el modal de resolución manual asistida para un pick individual.
   * @param pick - Pick que el admin desea resolver manualmente.
   */
  const openManualResolutionDialog = (pick: any) => {
    // Abrimos el modal con los valores manuales ya guardados, si existen.
    // buildManualResolutionDialogState ya detecta si es parlay y mapea las selecciones.
    setManualResolutionDialog(buildManualResolutionDialogState(pick));
  };

  /**
   * @summary Actualiza un campo editable del modal de resolución manual.
   * @param field - Campo del formulario que se debe modificar.
   * @param value - Nuevo valor digitado por el admin.
   */
  const updateManualResolutionField = (
    field:
      | "score_home"
      | "score_away"
      | "corners_total"
      | "corners_home"
      | "corners_away"
      | "yellow_cards_total"
      | "yellow_cards_home"
      | "yellow_cards_away"
      | "final_status",
    value: string
  ) => {
    if (!manualResolutionDialog) return;

    setManualResolutionDialog({
      ...manualResolutionDialog,
      [field]: value,
      suggested_status: field === "final_status" ? manualResolutionDialog.suggested_status : "",
      suggested_reason: field === "final_status" ? manualResolutionDialog.suggested_reason : "",
    });
  };

  /**
   * @summary Actualiza un campo específico de una selección dentro del parlay.
   * @param index - Índice de la selección afectada.
   * @param field - Campo a modificar dentro de la selección.
   * @param value - Nuevo valor digitado.
   */
  const updateManualResolutionSelectionField = (
    index: number,
    field: keyof ManualResolutionSelectionState,
    value: string
  ) => {
    if (!manualResolutionDialog || !manualResolutionDialog.selections) return;

    const newSelections = [...manualResolutionDialog.selections];
    newSelections[index] = { 
      ...newSelections[index], 
      [field]: value,
      // Limpiamos sugerencia individual cuando cambian los datos fuente.
      suggested_status: field === "final_status" ? newSelections[index].suggested_status : "",
      suggested_reason: field === "final_status" ? newSelections[index].suggested_reason : ""
    };

    setManualResolutionDialog({
      ...manualResolutionDialog,
      selections: newSelections,
      // Al cambiar una selección, la sugerencia global del parlay queda obsoleta.
      suggested_status: "",
      suggested_reason: "",
    });
  };

  /**
   * @summary Solicita al backend una sugerencia de resultado usando los datos manuales cargados.
   */
  const requestManualResolutionSuggestion = async () => {
    // Validamos que el modal esté abierto antes de consultar.
    if (!manualResolutionDialog) return;

    // Marcamos el botón como cargando.
    setManualResolutionDialog({ ...manualResolutionDialog, isSuggesting: true });

    try {
      // Preparamos el cuerpo de la petición según el tipo de pick.
      const requestBody: any = {
        score_home: manualResolutionDialog.score_home,
        score_away: manualResolutionDialog.score_away,
        corners_total: manualResolutionDialog.corners_total,
        corners_home: manualResolutionDialog.corners_home,
        corners_away: manualResolutionDialog.corners_away,
        yellow_cards_total: manualResolutionDialog.yellow_cards_total,
        yellow_cards_home: manualResolutionDialog.yellow_cards_home,
        yellow_cards_away: manualResolutionDialog.yellow_cards_away,
      };

      // Si es un parlay, enviamos las selecciones actuales para sugerencia múltiple.
      if (manualResolutionDialog.is_parlay) {
        requestBody.selections = manualResolutionDialog.selections.map((sel) => ({
          // Enviamos solo los campos manuales necesarios para no contaminar el JSON persistido.
          score_home: sel.score_home,
          // Enviamos solo el marcador visitante digitado.
          score_away: sel.score_away,
          // Enviamos el total de córners manual si existe.
          corners_total: sel.corners_total,
          // Enviamos los córners del local.
          corners_home: sel.corners_home,
          // Enviamos los córners del visitante.
          corners_away: sel.corners_away,
          // Enviamos el total de amarillas manual si existe.
          yellow_cards_total: sel.yellow_cards_total,
          // Enviamos las amarillas del local.
          yellow_cards_home: sel.yellow_cards_home,
          // Enviamos las amarillas del visitante.
          yellow_cards_away: sel.yellow_cards_away,
        }));
      }

      // Enviamos únicamente los datos manuales actuales para obtener la sugerencia.
      const response = await fetch(`/api/picks/${manualResolutionDialog.pickId}/manual-resolution`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      // Leemos el payload para mostrar feedback útil.
      const data = await response.json();

      // Si el backend rechazó la operación, mostramos el mensaje.
      if (!response.ok) {
        throw new Error(data.error || "No se pudo calcular la sugerencia manual.");
      }

      // Refrescamos el modal con la sugerencia calculada.
      setManualResolutionDialog({
        ...manualResolutionDialog,
        isSuggesting: false,
        suggested_status: String(data.suggested_status || "pending"),
        suggested_reason: String(data.suggested_reason || ""),
        final_status: String(data.suggested_status || manualResolutionDialog.final_status || "pending"),
        // Si el backend devolvió selecciones (en caso de parlay), las actualizamos.
        selections: Array.isArray(data.selections) 
          ? data.selections.map((sel: any, idx: number) => ({
              ...manualResolutionDialog.selections[idx],
              suggested_status: sel.suggested_status,
              suggested_reason: sel.suggested_reason,
              final_status: sel.final_status || sel.suggested_status || "pending",
              // Actualizamos también los valores manuales si el backend los normalizó.
              score_home: sel.manual_values?.score_home !== null ? String(sel.manual_values?.score_home) : manualResolutionDialog.selections[idx].score_home,
              score_away: sel.manual_values?.score_away !== null ? String(sel.manual_values?.score_away) : manualResolutionDialog.selections[idx].score_away,
              corners_total: sel.manual_values?.corners_total !== null ? String(sel.manual_values?.corners_total) : manualResolutionDialog.selections[idx].corners_total,
              corners_home: sel.manual_values?.corners_home !== null ? String(sel.manual_values?.corners_home) : manualResolutionDialog.selections[idx].corners_home,
              corners_away: sel.manual_values?.corners_away !== null ? String(sel.manual_values?.corners_away) : manualResolutionDialog.selections[idx].corners_away,
              yellow_cards_total: sel.manual_values?.yellow_cards_total !== null ? String(sel.manual_values?.yellow_cards_total) : manualResolutionDialog.selections[idx].yellow_cards_total,
              yellow_cards_home: sel.manual_values?.yellow_cards_home !== null ? String(sel.manual_values?.yellow_cards_home) : manualResolutionDialog.selections[idx].yellow_cards_home,
              yellow_cards_away: sel.manual_values?.yellow_cards_away !== null ? String(sel.manual_values?.yellow_cards_away) : manualResolutionDialog.selections[idx].yellow_cards_away,
            }))
          : manualResolutionDialog.selections,
        score_home: data.manual_values?.score_home !== null && data.manual_values?.score_home !== undefined ? String(data.manual_values.score_home) : manualResolutionDialog.score_home,
        score_away: data.manual_values?.score_away !== null && data.manual_values?.score_away !== undefined ? String(data.manual_values.score_away) : manualResolutionDialog.score_away,
        corners_total: data.manual_values?.corners_total !== null && data.manual_values?.corners_total !== undefined ? String(data.manual_values.corners_total) : manualResolutionDialog.corners_total,
        corners_home: data.manual_values?.corners_home !== null && data.manual_values?.corners_home !== undefined ? String(data.manual_values.corners_home) : manualResolutionDialog.corners_home,
        corners_away: data.manual_values?.corners_away !== null && data.manual_values?.corners_away !== undefined ? String(data.manual_values.corners_away) : manualResolutionDialog.corners_away,
        yellow_cards_total: data.manual_values?.yellow_cards_total !== null && data.manual_values?.yellow_cards_total !== undefined ? String(data.manual_values.yellow_cards_total) : manualResolutionDialog.yellow_cards_total,
        yellow_cards_home: data.manual_values?.yellow_cards_home !== null && data.manual_values?.yellow_cards_home !== undefined ? String(data.manual_values.yellow_cards_home) : manualResolutionDialog.yellow_cards_home,
        yellow_cards_away: data.manual_values?.yellow_cards_away !== null && data.manual_values?.yellow_cards_away !== undefined ? String(data.manual_values.yellow_cards_away) : manualResolutionDialog.yellow_cards_away,
      });

      // Notificamos que ya existe una sugerencia disponible.
      toast.success("Sugerencia calculada. Tú decides si la confirmas o la ajustas.");
    } catch (error: any) {
      // Dejamos de cargar y mostramos el error sin cerrar el modal.
      setManualResolutionDialog({ ...manualResolutionDialog, isSuggesting: false });
      toast.error(error.message || "No se pudo calcular la sugerencia manual.");
    }
  };

  /**
   * @summary Guarda la resolución manual final elegida por el admin.
   */
  const saveManualResolutionDecision = async () => {
    // Validamos que el modal exista antes de enviar.
    if (!manualResolutionDialog) return;

    // Requerimos que el admin confirme un estado final explícito.
    if (!manualResolutionDialog.final_status) {
      toast.error("Selecciona el estado final antes de guardar.");
      return;
    }

    // Marcamos guardado en curso para evitar doble clic.
    setManualResolutionDialog({ ...manualResolutionDialog, isSaving: true });

    try {
      // Preparamos los datos de guardado final.
      const requestBody: any = {
        score_home: manualResolutionDialog.score_home,
        score_away: manualResolutionDialog.score_away,
        corners_total: manualResolutionDialog.corners_total,
        corners_home: manualResolutionDialog.corners_home,
        corners_away: manualResolutionDialog.corners_away,
        yellow_cards_total: manualResolutionDialog.yellow_cards_total,
        yellow_cards_home: manualResolutionDialog.yellow_cards_home,
        yellow_cards_away: manualResolutionDialog.yellow_cards_away,
        final_status: manualResolutionDialog.final_status,
      };

      // Si es un parlay, enviamos las selecciones con sus estados manuales.
      if (manualResolutionDialog.is_parlay) {
        requestBody.selections = manualResolutionDialog.selections.map((sel) => ({
          // Enviamos solo los campos manuales necesarios para cada selección.
          score_home: sel.score_home,
          // Enviamos el marcador visitante manual.
          score_away: sel.score_away,
          // Enviamos el total de córners si el admin lo conoce.
          corners_total: sel.corners_total,
          // Enviamos los córners del local.
          corners_home: sel.corners_home,
          // Enviamos los córners del visitante.
          corners_away: sel.corners_away,
          // Enviamos el total de amarillas si el admin lo conoce.
          yellow_cards_total: sel.yellow_cards_total,
          // Enviamos las amarillas del local.
          yellow_cards_home: sel.yellow_cards_home,
          // Enviamos las amarillas del visitante.
          yellow_cards_away: sel.yellow_cards_away,
          // Enviamos también el estado final confirmado para esa selección.
          final_status: sel.final_status,
        }));
      }

      // Enviamos estadísticas manuales y el estado final elegido.
      const response = await fetch(`/api/picks/${manualResolutionDialog.pickId}/manual-resolution`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      // Parseamos la respuesta para feedback coherente.
      const data = await response.json();

      // Si hubo error, lo propagamos para el toast.
      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar la resolución manual.");
      }

      // Cerramos el modal y refrescamos la tabla con los nuevos datos.
      setManualResolutionDialog(null);
      toast.success("Resolución manual guardada correctamente.");
      fetchPicks();
    } catch (error: any) {
      // Dejamos de cargar sin perder lo digitado por el admin.
      setManualResolutionDialog({ ...manualResolutionDialog, isSaving: false });
      toast.error(error.message || "No se pudo guardar la resolución manual.");
    }
  };

  const verifyPickResults = () => {
    if (selectedPicks.length === 0) {
      toast.error("Selecciona al menos un pick para verificar.");
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: "Verificar con IA",
      message: `¿Estás seguro de verificar los resultados de ${selectedPicks.length} picks seleccionados usando Gemini IA?`,
      confirmText: "Verificar",
      variant: "primary",
      onConfirm: async () => {
        setConfirmDialog(null);
        const picksToVerify = picks.filter(p => selectedPicks.includes(p.id));
        setIsVerifying(true);

    try {
      // Leemos la clave pública del navegador desde Vite.
      const geminiApiKey = String((import.meta as any)?.env?.VITE_GEMINI_API_KEY || "").trim();

      // Cortamos temprano si el panel no tiene la clave configurada.
      if (!geminiApiKey) {
        throw new Error("Falta VITE_GEMINI_API_KEY para verificar picks con Gemini.");
      }

      // Inicializamos el cliente con la SDK instalada actualmente en el proyecto.
      const ai = new GoogleGenerativeAI(geminiApiKey);

      // Construimos el modelo una sola vez para reutilizarlo en todo el lote.
      const model = ai.getGenerativeModel({ model: "gemini-1.5-pro" });

      for (const pick of picksToVerify) {
        try {
          // Si es un parlay, necesitamos buscar los partidos individuales
          // Asumimos que el pick tiene la información necesaria o que la IA puede inferirla del match_name
          const response = await model.generateContent(
            // Forzamos una salida JSON mínima para no depender de esquemas incompatibles con esta SDK.
            `Busca el resultado final del partido o partidos asociados al pick: "${pick.match_name}" que se jugó el ${pick.match_date}. El pronóstico fue: "${pick.pick}". Determina si el pick fue "won", "lost" o "void". Responde SOLO con JSON válido como {"status":"won"}.`
          );

          // Leemos el texto generado por Gemini para parsearlo como JSON.
          const resultText = response.response.text()?.trim() || "{}";
          let status = "";
          try {
            const result = JSON.parse(resultText);
            status = result.status?.toLowerCase();
          } catch (e) {
            console.error("Error parsing JSON response from AI:", resultText);
          }

          if (['won', 'lost', 'void'].includes(status)) {
            await updatePickStatus(pick.id, status);
          } else {
            console.warn(`AI returned invalid status for pick ${pick.id}: ${status}`);
          }
        } catch (error) {
          console.error(`Error verifying pick ${pick.id}:`, error);
        }
      }
      toast.success("Verificación completada.");
      setSelectedPicks([]); // Limpiar selección
    } catch (error) {
      console.error("Error initializing AI client:", error);
      toast.error("Error al inicializar la IA. Revisa la consola.");
    } finally {
      setIsVerifying(false);
    }
      }
    });
  };

  const bulkUpdatePickStatus = async (status: string) => {
    if (selectedPicks.length === 0) return;
    try {
      await fetch(`/api/picks/bulk/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ pickIds: selectedPicks, status })
      });
      setSelectedPicks([]);
      fetchPicks();
    } catch (error) {
      console.error("Error bulk updating status:", error);
    }
  };

  const bulkDeletePicks = async () => {
    if (selectedPicks.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: "Eliminar Picks",
      message: `¿Estás seguro de eliminar los ${selectedPicks.length} picks seleccionados?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await fetch(`/api/picks/bulk/delete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ pickIds: selectedPicks })
          });
          setSelectedPicks([]);
          fetchPicks();
        } catch (error) {
          console.error("Error bulk deleting picks:", error);
        }
      }
    });
  };

  const deletePick = async (id: number, matchName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Eliminar Pick",
      message: `¿Estás seguro de eliminar el pick "${matchName}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await fetch(`/api/picks/${id}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          fetchPicks();
        } catch (error) {
          console.error("Error deleting pick:", error);
        }
      }
    });
  };

  const handleAddTracking = async (pickId: number) => {
    if (!trackingMessage.trim() || isSubmittingTracking) return;

    setIsSubmittingTracking(true);
    try {
      const res = await fetch(`/api/picks/${pickId}/tracking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ message: trackingMessage })
      });

      if (res.ok) {
        setTrackingMessage("");
        setActiveTrackingPickId(null);
        fetchPicks(); // Refresh picks to show new tracking
        toast.success("Seguimiento añadido correctamente");
      } else {
        toast.error("Error al añadir seguimiento");
      }
    } catch (error) {
      console.error("Error adding tracking:", error);
      toast.error("Error de conexión al añadir seguimiento");
    } finally {
      setIsSubmittingTracking(false);
    }
  };

  const handleMarketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingMarket) return;

    setIsSubmittingMarket(true);

    try {
      const url = marketForm.id ? `/api/markets/${marketForm.id}` : "/api/markets";
      const method = marketForm.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ label: marketForm.label, acronym: marketForm.acronym })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar mercado");

      if (!marketForm.id) {
        setNewlyAddedMarketId(data.id);
        setTimeout(() => setNewlyAddedMarketId(null), 5000);
      }

      toast.success("Mercado guardado exitosamente");
      setMarketForm({ id: null, label: "", acronym: "" });

      // Background fetch
      fetchMarkets();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmittingMarket(false);
    }
  };

  const editMarket = (market: any) => {
    setMarketForm({ id: market.id, label: market.label, acronym: market.acronym });
  };

  const deleteMarket = async (id: number, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Eliminar Mercado",
      message: `¿Estás seguro de eliminar el mercado "${name}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await fetch(`/api/markets/${id}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          fetchMarkets();
        } catch (error) {
          console.error("Error deleting market:", error);
        }
      }
    });
  };

  const handleLeagueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingLeague) return;

    setIsSubmittingLeague(true);

    console.log("Submitting league:", { name: leagueForm.name, country_id: leagueForm.country_id });
    try {
      const url = leagueForm.id ? `/api/leagues/${leagueForm.id}` : "/api/leagues";
      const method = leagueForm.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name: leagueForm.name, country_id: leagueForm.country_id || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar liga");

      if (!leagueForm.id) {
        setNewlyAddedLeagueId(data.id);
        setLeaguePage(1); // Ir a la primera página para ver el nuevo registro
        setTimeout(() => setNewlyAddedLeagueId(null), 5000);
      }

      toast.success("Liga guardada exitosamente");
      setLeagueForm({ id: null, name: "", country_id: leagueCountryFilter });

      // Background fetch
      fetchLeagues();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmittingLeague(false);
    }
  };

  const editLeague = (league: any) => {
    const countryId = league.country_id?.toString() || "";
    setLeagueForm({ id: league.id, name: league.name, country_id: countryId });
    setLeagueCountryFilter(countryId);
  };

  const deleteLeague = async (id: number, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Eliminar Liga",
      message: `¿Estás seguro de eliminar la liga "${name}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/leagues/${id}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Error al eliminar liga");
          fetchLeagues();
        } catch (error: any) {
          console.error("Error deleting league:", error);
          setAlertDialog({ isOpen: true, title: "Error", message: error.message });
        }
      }
    });
  };

  const handleCountrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCountry) return;

    setIsSubmittingCountry(true);

    try {
      const url = countryForm.id ? `/api/countries/${countryForm.id}` : "/api/countries";
      const method = countryForm.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name: countryForm.name, flag: countryForm.flag })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar país");

      if (!countryForm.id) {
        setNewlyAddedCountryId(data.id);
        setCountryPage(1); // Ir a la primera página para ver el nuevo registro
        setTimeout(() => setNewlyAddedCountryId(null), 5000);
      }

      toast.success("País guardado exitosamente");
      setCountryForm({ id: null, name: "", flag: "" });

      // Background fetch
      fetchCountries();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmittingCountry(false);
    }
  };

  const editCountry = (country: any) => {
    setCountryForm({ id: country.id, name: country.name, flag: country.flag || "" });
  };

  const startInlineEditCountry = (country: any) => {
    setEditingInlineCountryId(country.id);
    setInlineCountryName(country.name);
    setInlineCountryFlag(country.flag || "");
  };

  const cancelInlineEditCountry = () => {
    setEditingInlineCountryId(null);
    setInlineCountryName("");
    setInlineCountryFlag("");
  };

  const saveInlineCountry = async (id: number) => {
    try {
      const res = await fetch(`/api/countries/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name: inlineCountryName, flag: inlineCountryFlag })
      });
      if (!res.ok) throw new Error("Error al actualizar país");
      setEditingInlineCountryId(null);
      fetchCountries();
    } catch (error: any) {
      setAlertDialog({ isOpen: true, title: "Error", message: error.message });
    }
  };

  const startInlineEditLeague = (league: any) => {
    setEditingInlineLeagueId(league.id);
    setInlineLeagueName(league.name);
    setInlineLeagueCountryId(league.country_id?.toString() || "");
  };

  const cancelInlineEditLeague = () => {
    setEditingInlineLeagueId(null);
    setInlineLeagueName("");
    setInlineLeagueCountryId("");
  };

  const saveInlineLeague = async (id: number) => {
    try {
      const res = await fetch(`/api/leagues/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name: inlineLeagueName, country_id: inlineLeagueCountryId || null })
      });
      if (!res.ok) throw new Error("Error al actualizar liga");
      setEditingInlineLeagueId(null);
      fetchLeagues();
    } catch (error: any) {
      setAlertDialog({ isOpen: true, title: "Error", message: error.message });
    }
  };

  const deleteCountry = async (id: number, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Eliminar País",
      message: `¿Estás seguro de eliminar el país "${name}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/countries/${id}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Error al eliminar país");
          fetchCountries();
        } catch (error: any) {
          console.error("Error deleting country:", error);
          setAlertDialog({ isOpen: true, title: "Error", message: error.message });
        }
      }
    });
  };

  const bulkDeleteCountries = async () => {
    setConfirmDialog({
      isOpen: true,
      title: "Eliminar Países Seleccionados",
      message: `¿Estás seguro de eliminar los ${selectedCountries.length} países seleccionados?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/countries/bulk-delete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ ids: selectedCountries })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Error al eliminar países");
          setSelectedCountries([]);
          fetchCountries();
        } catch (error: any) {
          console.error("Error deleting countries:", error);
          setAlertDialog({ isOpen: true, title: "Error", message: error.message });
        }
      }
    });
  };

  const bulkDeleteLeagues = async () => {
    setConfirmDialog({
      isOpen: true,
      title: "Eliminar Ligas Seleccionadas",
      message: `¿Estás seguro de eliminar las ${selectedLeagues.length} ligas seleccionadas?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const res = await fetch(`/api/leagues/bulk-delete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ ids: selectedLeagues })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Error al eliminar ligas");
          setSelectedLeagues([]);
          fetchLeagues();
        } catch (error: any) {
          console.error("Error deleting leagues:", error);
          setAlertDialog({ isOpen: true, title: "Error", message: error.message });
        }
      }
    });
  };

  const updateVipStatus = async (userId: number, days: number) => {
    try {
      await fetch(`/api/users/${userId}/vip`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ days })
      });
      fetchUsers();
    } catch (error) {
      console.error("Error updating VIP status:", error);
    }
  };

  const cancelVipStatus = async (userId: number, email: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Cancelar VIP",
      message: `¿Estás seguro de cancelar la suscripción VIP del usuario "${email}"?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await fetch(`/api/users/${userId}/vip`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          fetchUsers();
        } catch (error) {
          console.error("Error canceling VIP status:", error);
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      {/* Global Error State UI */}
      {globalError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-md p-6">
          <div className="max-w-md w-full bg-card border-2 border-destructive/50 rounded-3xl p-10 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center space-y-8 animate-in zoom-in-95 duration-300">
            <div className="w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center mx-auto ring-8 ring-destructive/5">
              <Activity className="w-12 h-12 text-destructive animate-pulse" />
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-black text-foreground tracking-tight">ERROR DE CONEXIÓN</h1>
              <p className="text-muted-foreground text-lg leading-relaxed">
                {globalError}
              </p>
              <div className="p-4 bg-destructive/5 rounded-2xl border border-destructive/10">
                <p className="text-xs font-mono text-destructive/80 break-all bg-white/5 p-2 rounded">
                  Status: Database Connection Failure (Production)
                </p>
              </div>
            </div>
            <div className="pt-4 space-y-4">
              <button
                onClick={() => {
                  setGlobalError(null);
                  fetchPicks();
                  fetchLeagues();
                  fetchCountries();
                }}
                className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground hover:bg-primary/90 py-5 rounded-2xl font-black text-lg transition-all hover:scale-[1.02] active:scale-95 shadow-[0_20px_40px_rgba(16,185,129,0.2)] group"
              >
                <Loader2 className="w-6 h-6 group-hover:rotate-180 transition-transform duration-500" />
                REINTENTAR CONEXIÓN
              </button>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">
                BetRoyale Club Management System v2.0
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="min-h-screen bg-background flex flex-col md:flex-row">
        {/* Sidebar Admin */}
        <aside className="w-full md:w-64 md:sticky md:top-0 md:h-screen bg-card border-r border-white/10 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-2 text-primary">
              <Trophy className="h-6 w-6" />
              <span className="font-display text-xl font-bold">Admin Panel</span>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <button
              onClick={() => { setActiveTab("new-pick"); if (!editingPickId) cancelEdit(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "new-pick" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <PlusCircle className="h-5 w-5" />
              {editingPickId ? "Editar Pick" : "Nuevo Pick"}
            </button>
            <button
              onClick={() => setActiveTab("list-picks")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "list-picks" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <List className="h-5 w-5" />
              Gestionar Picks
            </button>
            <button
              onClick={() => setActiveTab("markets")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "markets" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <Tag className="h-5 w-5" />
              Mercados
            </button>
            <button
              onClick={() => setActiveTab("leagues")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "leagues" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <Globe className="h-5 w-5" />
              Ligas
            </button>
            <button
              onClick={() => setActiveTab("countries")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "countries" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <Globe className="h-5 w-5" />
              Países
            </button>
            <button
              onClick={() => setActiveTab("teams")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "teams" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <Shield className="h-5 w-5" />
              Equipos
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "users" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <Users className="h-5 w-5" />
              Usuarios
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "stats" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <BarChart3 className="h-5 w-5" />
              Estadísticas
            </button>
            <button
              onClick={() => setActiveTab("promo-codes")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "promo-codes" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <Tag className="h-5 w-5" />
              Cupones
            </button>
            <button
              onClick={() => setActiveTab("telegram")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === "telegram" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
            >
              <Send className="h-5 w-5" />
              Telegram
            </button>
          </nav>

          <div className="p-4 border-t border-white/10">
            <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
              <LogOut className="h-5 w-5" />
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
          {activeTab === "new-pick" && (
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold">{editingPickId ? "Editar Pick" : "Publicar Nuevo Pick"}</h2>
                {editingPickId && (
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all font-bold text-sm shadow-[0_0_20px_rgba(239,68,68,0.3)] border-2 border-white/20"
                  >
                    <X className="w-5 h-5" />
                    CANCELAR EDICIÓN
                  </button>
                )}
              </div>

              <form
                className="space-y-6 bg-card p-6 md:p-10 rounded-2xl border border-white/10 shadow-2xl"
                onSubmit={(e) => {
                  console.log("Form onSubmit triggered");
                  handleSubmit(e);
                }}
                noValidate
              >
                <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-xl border border-primary/20">
                  <input
                    type="checkbox"
                    id="is_parlay"
                    name="is_parlay"
                    checked={formData.is_parlay}
                    onChange={handleInputChange}
                    className="w-5 h-5 rounded border-white/10 bg-background text-primary focus:ring-primary cursor-pointer"
                  />
                  <label htmlFor="is_parlay" className="text-base font-bold text-foreground cursor-pointer select-none">
                    Este pick es un Parlay (Apuesta Combinada)
                  </label>
                </div>

                {!formData.is_parlay ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                      <div className="md:col-span-6 space-y-3">
                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em]">Fecha y Hora del Partido</label>
                        <input
                          type="datetime-local"
                          name="match_date"
                          value={formData.match_date}
                          onChange={handleInputChange}
                          required
                          className="w-full bg-background border border-white/10 rounded-2xl px-5 py-4 text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-inner"
                        />
                      </div>
                      <div className="md:col-span-6 space-y-3">
                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em]">País</label>
                        <SearchableSelect
                          options={Array.isArray(countries) ? countries.map(c => ({
                            value: c.id,
                            label: c.name,
                            icon: <CountryFlag countryCode={c.flag} className="w-5 h-4" />
                          })) : []}
                          value={formData.country_id}
                          onChange={(val) => handleSelectChange('country_id', val)}
                          placeholder="Seleccionar país..."
                        />
                      </div>

                      <div className="md:col-span-6 space-y-3">
                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em]">Liga / Competición</label>
                        <SearchableSelect
                          options={leagues
                            .filter(l => !formData.country_id || l.country_id?.toString() === formData.country_id)
                            .map(l => ({
                              value: l.id,
                              label: l.name
                            }))}
                          value={formData.league_id}
                          onChange={(val) => handleSelectChange('league_id', val)}
                          required
                          placeholder="Seleccionar liga..."
                          disabled={!formData.country_id}
                        />
                      </div>
                      <div className="md:col-span-6 space-y-3">
                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em]">Mercado / Pronóstico</label>
                        <SearchableSelect
                          options={markets.map(p => ({
                            value: p.id,
                            label: `${p.label} (${p.acronym})`
                          }))}
                          value={formData.pick}
                          onChange={(val) => handleSelectChange('pick', val)}
                          required
                          placeholder="Seleccionar mercado..."
                        />
                      </div>

                      {/* Reutilizamos el buscador compartido para pick simple y parlay. */}
                      <div className="md:col-span-12">
                        {renderFixtureSearchPanel()}
                      </div>

                      <div className="md:col-span-12 space-y-3">
                        <div className="flex flex-col md:flex-row items-end gap-4 lg:gap-6">
                          <div className="flex-1 space-y-3 w-full">
                            <label className="text-xs font-black text-primary uppercase tracking-[0.2em] pl-1">Equipo Local</label>
                            <SearchableSelect
                              options={teams
                                .filter(t => {
                                  if (!formData.league_id) return true;
                                  const compatibleIds = getCompatibleLeagueIds(formData.league_id, leagues);
                                  return compatibleIds.includes(t.league_id.toString());
                                })
                                .map(t => ({ value: t.id, label: t.name }))}
                              value={formData.home_team}
                              onChange={(val) => handleSelectChange('home_team', val)}
                              onCreatable={(query) => handleQuickTeamCreate(query, 'home_team')}
                              placeholder="Buscar local..."
                              disabled={!formData.league_id}
                            />
                          </div>
                          <div className="hidden md:flex items-center justify-center h-[56px] text-muted-foreground font-black text-xl italic opacity-30 px-2 lg:px-4 leading-none">
                            VS
                          </div>
                          <div className="flex-1 space-y-3 w-full">
                            <label className="text-xs font-black text-primary uppercase tracking-[0.2em] pl-1">Equipo Visitante</label>
                            <SearchableSelect
                              options={teams
                                .filter(t => {
                                  if (!formData.league_id) return true;
                                  const compatibleIds = getCompatibleLeagueIds(formData.league_id, leagues);
                                  return compatibleIds.includes(t.league_id.toString());
                                })
                                .filter(t => t.id.toString() !== formData.home_team)
                                .map(t => ({ value: t.id, label: t.name }))}
                              value={formData.away_team}
                              onChange={(val) => handleSelectChange('away_team', val)}
                              onCreatable={(query) => handleQuickTeamCreate(query, 'away_team')}
                              placeholder="Buscar visitante..."
                              disabled={!formData.league_id}
                            />
                          </div>
                        </div>
                        <div className="pt-2">
                          <div className="text-[10px] font-bold text-primary uppercase tracking-widest pl-1 mb-1 opacity-40">Nombre Final del Evento</div>
                          <input
                            type="text"
                            name="match_name"
                            value={formData.match_name}
                            readOnly
                            required
                            placeholder="Real Madrid vs Manchester City"
                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-3 text-base font-bold text-foreground focus:outline-none transition-all opacity-50 cursor-not-allowed select-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/10">
                      <div>
                        <h3 className="font-bold text-lg text-primary">Selecciones del Parlay</h3>
                        <p className="text-xs text-muted-foreground">Añade los partidos que componen esta combinada</p>
                      </div>
                      <button
                        type="button"
                        onClick={addSelection}
                        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-bold text-sm hover:scale-105 transition-all shadow-lg shadow-primary/20"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Añadir Selección
                      </button>
                    </div>

                    {/* Reutilizamos el panel compartido de búsqueda también dentro del flujo parlay. */}
                    {renderFixtureSearchPanel()}

                    {formData.selections.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed border-white/10 rounded-2xl bg-black/20">
                        <PlusCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        No hay selecciones añadidas. Haz clic en "Añadir Selección" para empezar.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-white/10 shadow-2xl bg-black/20">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-white/5 border-b border-white/10">
                              <th className="px-3 py-4 text-xs font-black text-primary uppercase tracking-[0.2em] w-[180px]">País</th>
                              <th className="px-3 py-4 text-xs font-black text-primary uppercase tracking-[0.2em] w-[200px]">Liga</th>
                              <th className="px-3 py-4 text-xs font-black text-primary uppercase tracking-[0.2em] min-w-[280px]">Evento / Partido</th>
                              <th className="px-3 py-4 text-xs font-black text-primary uppercase tracking-[0.2em] w-[200px]">Fecha</th>
                              <th className="px-3 py-4 text-xs font-black text-primary uppercase tracking-[0.2em] w-[280px]">Mercado</th>
                              <th className="px-3 py-4 text-xs font-black text-primary uppercase tracking-[0.2em] w-[100px] text-center">Cuota</th>
                              <th className="px-3 py-4 text-xs font-black text-primary uppercase tracking-[0.2em] w-[50px]"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {formData.selections.map((sel, index) => (
                              <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-3 py-6">
                                  <SearchableSelect
                                    size="sm"
                                    options={countries.map(c => ({
                                      value: c.id,
                                      label: c.name,
                                      icon: <CountryFlag countryCode={c.flag} className="w-5 h-4" />
                                    }))}
                                    value={sel.country_id}
                                    onChange={(val) => handleSelectionChange(index, { target: { name: 'country_id', value: val } } as any)}
                                    placeholder="País"
                                  />
                                </td>
                                <td className="px-3 py-6">
                                  <SearchableSelect
                                    size="sm"
                                    options={leagues
                                      .filter(l => !sel.country_id || l.country_id?.toString() === sel.country_id)
                                      .map(l => ({
                                        value: l.id,
                                        label: l.name
                                      }))}
                                    value={sel.league_id}
                                    onChange={(val) => handleSelectionChange(index, { target: { name: 'league_id', value: val } } as any)}
                                    required
                                    placeholder="Liga"
                                    disabled={!sel.country_id}
                                  />
                                </td>
                                <td className="px-3 py-6">
                                  <div className="grid grid-cols-1 gap-2">
                                    {/* Equipo local de la selección del parlay. */}
                                    <SearchableSelect
                                      size="sm"
                                      options={teams
                                        .filter(t => {
                                          if (!sel.league_id) return true;
                                          const compatibleIds = getCompatibleLeagueIds(sel.league_id, leagues);
                                          return compatibleIds.includes(t.league_id.toString());
                                        })
                                        .filter(t => t.id.toString() !== sel.away_team)
                                        .map(t => ({ value: t.id, label: t.name }))}
                                      value={sel.home_team || ""}
                                      onChange={(val) => handleSelectionChange(index, { target: { name: 'home_team', value: val } } as any)}
                                      onCreatable={(query) => handleQuickTeamCreate(query, { selectionIndex: index, field: 'home_team' })}
                                      required
                                      placeholder="Equipo local"
                                      disabled={!sel.league_id}
                                    />
                                    {/* Equipo visitante de la selección del parlay. */}
                                    <SearchableSelect
                                      size="sm"
                                      options={teams
                                        .filter(t => {
                                          if (!sel.league_id) return true;
                                          const compatibleIds = getCompatibleLeagueIds(sel.league_id, leagues);
                                          return compatibleIds.includes(t.league_id.toString());
                                        })
                                        .filter(t => t.id.toString() !== sel.home_team)
                                        .map(t => ({ value: t.id, label: t.name }))}
                                      value={sel.away_team || ""}
                                      onChange={(val) => handleSelectionChange(index, { target: { name: 'away_team', value: val } } as any)}
                                      onCreatable={(query) => handleQuickTeamCreate(query, { selectionIndex: index, field: 'away_team' })}
                                      required
                                      placeholder="Equipo visitante"
                                      disabled={!sel.league_id}
                                    />
                                  </div>
                                  <div className="mt-3">
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        name="match_name"
                                        value={sel.match_name}
                                        readOnly
                                        required
                                        placeholder="Ej: Madrid vs City"
                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-foreground opacity-50 cursor-not-allowed select-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleStartSelectionFixtureLink(index)}
                                        className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border transition-all ${hasResultProviderLink(sel) ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-muted-foreground hover:border-primary hover:text-primary'}`}
                                        title="Vincular con API de Resultados"
                                      >
                                        <Activity className="w-4 h-4" />
                                      </button>
                                    </div>
                                    {(sel.thesportsdb_event_id || sel.api_fixture_id) && (
                                      <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/5 border border-primary/20 w-fit">
                                        <CheckCircle2 className="w-3 h-3 text-primary" />
                                        <span className="text-[10px] font-black text-primary">
                                          VINCULADO: {sel.thesportsdb_event_id || sel.api_fixture_id}
                                        </span>
                                        <button 
                                          type="button" 
                                          onClick={() => {
                                            const newSels = [...formData.selections];
                                            newSels[index].api_fixture_id = "";
                                            newSels[index].thesportsdb_event_id = "";
                                            setFormData(p => ({ ...p, selections: newSels }));
                                            if (activeSelectionFixtureIndex === index) resetFixtureSearchState();
                                          }}
                                          className="text-[9px] font-black text-muted-foreground hover:text-destructive underline ml-1"
                                        >
                                          Quitar
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-6">
                                  <input
                                    type="datetime-local"
                                    name="match_time"
                                    value={sel.match_time}
                                    onChange={(e) => handleSelectionChange(index, e)}
                                    required
                                    className="w-full bg-background/50 border border-white/10 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-primary transition-all text-foreground"
                                  />
                                </td>
                                <td className="px-3 py-6">
                                  <SearchableSelect
                                    size="sm"
                                    options={markets.map(p => ({
                                      value: p.id,
                                      label: `${p.label} (${p.acronym})`
                                    }))}
                                    value={sel.pick}
                                    onChange={(val) => handleSelectionChange(index, { target: { name: 'pick', value: val } } as any)}
                                    required
                                    placeholder="Mercado"
                                  />
                                </td>
                                <td className="px-3 py-6">
                                  <input
                                    type="number"
                                    name="odds"
                                    value={sel.odds}
                                    onChange={(e) => handleSelectionChange(index, e)}
                                    required
                                    step="0.01"
                                    placeholder="1.85"
                                    className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-3 text-sm font-black text-primary focus:outline-none focus:border-primary transition-all text-center"
                                  />
                                </td>
                                <td className="px-3 py-6 text-center">
                                  <button
                                    type="button"
                                    onClick={() => removeSelection(index)}
                                    className="p-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                                    title="Quitar selección"
                                  >
                                    <X className="w-5 h-5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Cuota Total</label>
                    {formData.is_parlay ? (
                      <div className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-foreground opacity-70 cursor-not-allowed select-none flex justify-between items-center group">
                        <span className={!formData.odds ? "text-muted-foreground italic text-sm" : "font-bold"}>
                          {formData.odds || "Calculado automáticamente"}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                          Auto
                        </span>
                      </div>
                    ) : (
                      <input
                        type="number"
                        name="odds"
                        value={formData.odds}
                        onChange={handleInputChange}
                        required
                        step="0.01"
                        placeholder="Ej: 1.85"
                        className="w-full bg-background border border-white/10 rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Stake (1-10)</label>
                    <SearchableSelect
                      options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => ({
                        value: num,
                        label: `Stake ${num}`
                      }))}
                      value={formData.stake}
                      onChange={(val) => handleSelectChange('stake', val)}
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-white/10">
                  <label className="text-sm font-medium text-muted-foreground">Tipo de Pick</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {pickTypes.map((pt) => (
                      <label key={pt.id} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${formData.pick_type_id === pt.id.toString() ? 'border-primary bg-primary/10' : 'border-white/10 bg-background hover:border-primary/50'}`}>
                        <input type="radio" name="pick_type_id" value={pt.id} checked={formData.pick_type_id === pt.id.toString()} onChange={handleInputChange} className="hidden" />
                        <span className={`text-sm font-medium ${formData.pick_type_id === pt.id.toString() ? 'text-primary' : 'text-foreground'}`}>{pt.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-muted-foreground">Comentario / Análisis (Opcional)</label>
                    {/* 
                    <button
                      type="button"
                      onClick={handleGenerateAnalysis}
                      disabled={isGeneratingAnalysis}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-black text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
                    >
                      {isGeneratingAnalysis ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} />
                          Generar Análisis con IA
                        </>
                      )}
                    </button>
                    */}
                  </div>
                  <textarea name="analysis" value={formData.analysis} onChange={handleInputChange} rows={3} placeholder="Breve justificación del pick..." className="w-full bg-background border border-white/10 rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingPick}
                  className="w-full py-4 rounded-lg bg-primary text-primary-foreground font-bold text-lg hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingPick ? (
                    <>
                      <Activity className="h-5 w-5 animate-spin" />
                      {editingPickId ? "Actualizando Pick..." : "Publicando Pick..."}
                    </>
                  ) : (
                    editingPickId ? "Actualizar Pick" : "Publicar Pick"
                  )}
                </button>
              </form>
            </div>
          )}

          {activeTab === "list-picks" && (() => {
            const filteredPicks = picks.filter(pick => {
              if (pickFilterStatus && pick.status !== pickFilterStatus) return false;
              if (pickFilterType && pick.pick_type_id?.toString() !== pickFilterType) return false;
              if (pickFilterIsParlay) {
                const isParlay = pickFilterIsParlay === 'true';
                if (Boolean(pick.is_parlay) !== isParlay) return false;
              }
              if (pickFilterLeague) {
                const leagueName = (pick.league_name || pick.league || "").toLowerCase();
                if (!leagueName.includes(pickFilterLeague.toLowerCase())) return false;
              }
              return true;
            });

            const paginatedPicks = filteredPicks.slice((currentPage - 1) * picksPerPage, currentPage * picksPerPage);

            const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (e.target.checked) {
                setSelectedPicks(paginatedPicks.map(p => p.id));
              } else {
                setSelectedPicks([]);
              }
            };

            return (
              <div>
                <h2 className="text-2xl font-bold mb-6">Gestionar Picks</h2>

                {/* Filters and Bulk Actions */}
                <div className="bg-card border border-white/10 rounded-2xl p-4 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
                  <div className="flex flex-wrap gap-4 w-full md:w-auto">
                    <SearchableSelect
                      className="w-[180px]"
                      placeholder="Todos los estados"
                      options={[
                        { value: "", label: "Todos los estados" },
                        { value: "pending", label: "Pendientes" },
                        { value: "won", label: "Ganados" },
                        { value: "lost", label: "Perdidos" },
                        { value: "void", label: "Nulos" },
                      ]}
                      value={pickFilterStatus}
                      onChange={(val) => setPickFilterStatus(val)}
                    />
                    <SearchableSelect
                      className="w-[180px]"
                      placeholder="Todos los tipos"
                      options={[
                        { value: "", label: "Todos los tipos" },
                        ...(Array.isArray(pickTypes) ? pickTypes.map(pt => ({ value: pt.id, label: pt.name })) : [])
                      ]}
                      value={pickFilterType}
                      onChange={(val) => setPickFilterType(val)}
                    />
                    <SearchableSelect
                      className="w-[200px]"
                      placeholder="Individuales y Parlays"
                      options={[
                        { value: "", label: "Individuales y Parlays" },
                        { value: "false", label: "Solo Individuales" },
                        { value: "true", label: "Solo Parlays" },
                      ]}
                      value={pickFilterIsParlay}
                      onChange={(val) => setPickFilterIsParlay(val)}
                    />
                    <input
                      type="text"
                      placeholder="Buscar liga..."
                      value={pickFilterLeague}
                      onChange={(e) => setPickFilterLeague(e.target.value)}
                      className="bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                    />
                  </div>

                  {selectedPicks.length > 0 && (
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                      <span className="text-sm text-muted-foreground self-center mr-2">{selectedPicks.length} seleccionados</span>
                      <button onClick={() => bulkUpdatePickStatus('won')} className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded hover:bg-emerald-500/30 transition-colors">
                        Marcar Ganados
                      </button>
                      <button onClick={() => bulkUpdatePickStatus('lost')} className="px-3 py-1.5 bg-red-500/20 text-red-400 text-xs font-bold rounded hover:bg-red-500/30 transition-colors">
                        Marcar Perdidos
                      </button>
                      <button onClick={() => bulkUpdatePickStatus('void')} className="px-3 py-1.5 bg-gray-500/20 text-gray-400 text-xs font-bold rounded hover:bg-gray-500/30 transition-colors">
                        Marcar Nulos
                      </button>
                      <button onClick={bulkDeletePicks} className="px-3 py-1.5 bg-destructive/20 text-destructive text-xs font-bold rounded hover:bg-destructive/30 transition-colors">
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Picks</h3>
                  <button
                    type="button"
                    onClick={handleRunCron}
                    disabled={isRunningCron}
                    className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-all font-bold shadow-lg shadow-emerald-500/20"
                  >
                    {isRunningCron ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Actualizando...
                      </>
                    ) : (
                      <>
                        <Activity size={16} />
                        Forzar Actualización de Resultados
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
                  <div className="overflow-x-hidden max-h-[600px] overflow-y-auto custom-scrollbar">
                    <table className="w-full table-fixed text-left text-sm">
                      <thead className="bg-primary/20 border-b border-primary/30 sticky top-0 z-10 backdrop-blur-md">
                        <tr>
                          <th className="p-3 w-[3%]">
                            <input
                              type="checkbox"
                              checked={paginatedPicks.length > 0 && selectedPicks.length === paginatedPicks.length}
                              onChange={handleSelectAll}
                              className="rounded border-white/20 bg-background text-primary focus:ring-primary/50"
                            />
                          </th>
                          {/* Fijamos ancho de fecha para que no empuje las columnas de resultado. */}
                          <th className="p-3 w-[11%] text-[11px] font-bold text-primary uppercase tracking-wider">Fecha</th>
                          {/* Reservamos espacio al partido porque aqui viven equipos, liga y selecciones de parlay. */}
                          <th className="p-3 w-[24%] text-[11px] font-bold text-primary uppercase tracking-wider">Partido</th>
                          {/* Mantenemos el pick junto al marcador para validar lectura operacional. */}
                          <th className="p-3 w-[15%] text-[11px] font-bold text-primary uppercase tracking-wider">Pick</th>
                          {/* Acercamos el marcador al pick para que el admin vea resultado y mercado en el mismo bloque visual. */}
                          <th className="p-3 w-[13%] text-[11px] font-bold text-primary uppercase tracking-wider">Marcador</th>
                          {/* Centramos cuota con ancho compacto. */}
                          <th className="p-3 w-[6%] text-[11px] font-bold text-primary uppercase tracking-wider text-center">Cuota</th>
                          {/* Ampliamos plan para evitar doble linea en VIP Cuota 4+ / 5+. */}
                          <th className="p-3 w-[10%] text-[11px] font-bold text-primary uppercase tracking-wider">Plan</th>
                          {/* Dejamos estado con ancho estable. */}
                          <th className="p-3 w-[8%] text-[11px] font-bold text-primary uppercase tracking-wider">Estado</th>
                          {/* Reservamos espacio a todas las acciones sin apretarlas. */}
                          <th className="p-3 w-[10%] text-[11px] font-bold text-primary uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {filteredPicks.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-8 text-center text-muted-foreground">No hay picks que coincidan con los filtros.</td>
                          </tr>
                        ) : (
                          paginatedPicks.map((pick) => (
                            <React.Fragment key={pick.id}>
                              <tr className="hover:bg-white/5 transition-colors">
                                <td className="p-3 align-top">
                                  <input
                                    type="checkbox"
                                    checked={selectedPicks.includes(pick.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedPicks([...selectedPicks, pick.id]);
                                      } else {
                                        setSelectedPicks(selectedPicks.filter(id => id !== pick.id));
                                      }
                                    }}
                                    className="rounded border-white/20 bg-background text-primary focus:ring-primary/50"
                                  />
                                </td>
                                {/* Mostramos fecha en una sola linea para que no rompa la altura de la fila. */}
                                <td className="p-3 align-top text-xs leading-tight">
                                  {/* Partimos fecha y hora para ahorrar ancho sin perder claridad. */}
                                  <div className="font-bold text-foreground">{new Date(pick.match_date).toLocaleDateString()}</div>
                                  {/* Mostramos la hora en una segunda linea compacta. */}
                                  <div className="text-muted-foreground">{new Date(pick.match_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                </td>
                                {/* Agrupamos toda la informacion del partido/parlay en una columna amplia. */}
                                <td className="p-3 align-top break-words">
                                  <div className="font-medium leading-snug">
                                    {pick.is_parlay ? `Parlay (${pick.selections?.length || 0} selecciones)` : pick.match_name}
                                  </div>
                                  {!pick.is_parlay && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      {pick.country_flag && <CountryFlag code={pick.country_flag} />}
                                      {pick.league_name || pick.league}
                                    </div>
                                  )}
                                  {Boolean(pick.is_parlay) && pick.selections && (
                                    <div className="mt-2 space-y-1.5">
                                      {pick.selections.map((sel: any, idx: number) => (
                                        <div key={idx} className="text-[10px] text-muted-foreground border-l border-white/10 pl-2 py-0.5">
                                          <div className="grid grid-cols-[1fr_auto] gap-x-4 items-start">
                                            <div className="flex flex-col">
                                              <span className="font-bold text-primary/80 leading-tight break-words">{sel.match_name}</span>
                                              <div className="flex items-center gap-1.5 mt-0.5 opacity-70">
                                                {sel.country_flag && <CountryFlag code={sel.country_flag} />}
                                                <span className="text-[9px] uppercase font-medium">
                                                  {sel.country_name ? `${sel.country_name} · ` : ""}{sel.league_name || sel.league}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="text-right whitespace-nowrap">
                                              <div className="font-bold text-foreground">@{Number(sel.odds).toFixed(2)}</div>
                                              <div className="text-[9px] opacity-50">{new Date(sel.match_time).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                          </div>
                                          <div className="mt-1 flex items-center gap-1.5 font-medium text-white/90">
                                            <span className="px-1 py-0.5 rounded bg-white/5 text-[8px] uppercase tracking-wider">{sel.market_acronym || "PICK"}</span>
                                            {sel.market_label || sel.pick}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                {/* La columna pick queda antes del marcador para revisar mercado y resultado de corrido. */}
                                <td className="p-3 align-top font-medium text-primary">
                                  {pick.is_parlay ? (
                                    <div className="text-xs text-muted-foreground">Combinada</div>
                                  ) : (
                                    <div className="flex flex-wrap items-center gap-1.5 leading-tight">
                                      <span className="px-1.5 py-0.5 rounded bg-primary/20 text-[10px] font-bold">{pick.market_acronym || getPickDisplay(pick.pick).acronym}</span>
                                      <span className="break-words">{pick.market_label || getPickDisplay(pick.pick).label}</span>
                                    </div>
                                  )}
                                </td>
                                {/* Marcador queda pegado al mercado para corregir la lectura operativa del gestor. */}
                                <td className="p-3 align-top">
                                  {Boolean(pick.is_parlay) && Array.isArray(pick.selections) ? (
                                    <div className="w-full space-y-1.5">
                                      {pick.selections.map((sel: any, idx: number) => (
                                        <div key={`${pick.id}-score-${idx}`} className="flex flex-wrap items-center justify-between gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                                          <span className="text-[10px] font-black text-muted-foreground">#{idx + 1}</span>
                                          {hasResolvedScore(sel) ? (
                                            <span className={`min-w-[3.4rem] rounded px-2 py-0.5 text-center text-xs font-black ${sel.status === 'lost' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                              {sel.score_home} - {sel.score_away}
                                            </span>
                                          ) : (
                                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${hasResultProviderLink(sel) ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-white/5 text-muted-foreground border border-white/10'}`}>
                                              {hasResultProviderLink(sel) ? 'Pendiente API' : 'Sin vínculo'}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : hasResolvedScore(pick) ? (
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-1 bg-primary/10 border border-primary/20 rounded font-black text-primary min-w-[3rem] text-center">
                                        {pick.score_home} - {pick.score_away}
                                      </span>
                                      {hasResultProviderLink(pick) && (
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Actualización automática activa" />
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground italic text-xs">
                                      {hasResultProviderLink(pick) ? 'Pendiente API' : 'Sin vínculo'}
                                    </span>
                                  )}
                                </td>
                                {/* Cuota se muestra compacta y centrada despues del marcador. */}
                                <td className="p-3 align-top text-center font-black text-foreground">{pick.odds}</td>
                                {/* Plan tiene ancho y badge nowrap para que VIP Cuota 4+ no salte de linea. */}
                                <td className="p-3 align-top">
                                  <span title={(pick.pick_type_name || pick.pick_type || 'FREE').toUpperCase()} className={`inline-flex max-w-full whitespace-nowrap overflow-hidden text-ellipsis px-2.5 py-1.5 rounded text-xs font-black tracking-tight ${pick.pick_type_slug === 'free' ? 'bg-primary/20 text-primary' : 'bg-accent/20 text-accent'}`}>
                                    {(pick.pick_type_name || pick.pick_type || 'FREE').toUpperCase()}
                                  </span>
                                </td>
                                {/* Estado conserva un ancho estable y legible. */}
                                <td className="p-3 align-top">
                                  <span className={`inline-flex max-w-full px-2 py-1 rounded text-[10px] font-bold ${pick.status === 'won' ? 'bg-green-500/20 text-green-500' :
                                    pick.status === 'lost' ? 'bg-red-500/20 text-red-500' :
                                      pick.status === 'void' ? 'bg-gray-500/20 text-gray-400' :
                                        'bg-yellow-500/20 text-yellow-500'
                                    }`}>
                                    {getLocalizedStatus(pick.status)}
                                  </span>
                                </td>
                                {/* Acciones tienen ancho minimo para no invadir estado o plan. */}
                                <td className="p-3 align-top text-right">
                                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                                    {/* Tracking Button */}
                                    <button
                                      onClick={() => setActiveTrackingPickId(activeTrackingPickId === pick.id ? null : pick.id)}
                                      className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                                      title="Añadir Seguimiento"
                                    >
                                      <PlusCircle className="w-4 h-4" />
                                    </button>

                                    {/* Resolución manual asistida para confirmar marcador o estadísticas cuando la API no alcanza. */}
                                    <button
                                      onClick={() => openManualResolutionDialog(pick)}
                                      className="p-1.5 rounded hover:bg-amber-500/20 text-amber-400 transition-colors"
                                      title={pick.is_parlay ? "Resolución manual asistida disponible próximamente para parlays" : "Resolución manual asistida"}
                                    >
                                      <Shield className="w-4 h-4" />
                                    </button>

                                    {pick.status === 'pending' && (
                                      <>
                                        <button onClick={() => updatePickStatus(pick.id, 'won')} className="p-1.5 rounded hover:bg-green-500/20 text-green-500 transition-colors" title="Marcar Ganado">
                                          <CheckCircle className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => updatePickStatus(pick.id, 'lost')} className="p-1.5 rounded hover:bg-red-500/20 text-red-500 transition-colors" title="Marcar Perdido">
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => updatePickStatus(pick.id, 'void')} className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400 transition-colors" title="Marcar Nulo">
                                          <MinusCircle className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                    <button onClick={() => resendPickToTelegram(pick.id)} className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors" title="Reenviar a Telegram">
                                      <Send className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setTicketModalPick(pick)} className="p-1.5 rounded hover:bg-purple-500/20 text-purple-400 transition-colors" title="Generar Ticket para Redes">
                                      <Camera className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleEditPick(pick)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors" title="Editar">
                                      <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => deletePick(pick.id, pick.match_name)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive transition-colors" title="Eliminar">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Tracking Row (if active or has tracking) */}
                              {(activeTrackingPickId === pick.id || (pick.tracking && pick.tracking.length > 0)) && (
                                <tr key={`tracking-${pick.id}`} className="bg-white/5">
                                  <td colSpan={9} className="p-4 border-t border-white/5">
                                    <div className="pl-4 border-l-2 border-primary/50">
                                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Seguimiento en vivo</h4>

                                      {pick.tracking && pick.tracking.length > 0 && (
                                        <div className="overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar rounded-lg border border-white/10 mb-3">
                                          <table className="w-full text-left text-sm">
                                            <thead className="bg-primary/20 border-b border-primary/30 sticky top-0 z-10 backdrop-blur-md">
                                              <tr>
                                                <th className="px-3 py-2 text-xs font-bold text-primary uppercase tracking-wider w-24">Hora</th>
                                                <th className="px-3 py-2 text-xs font-bold text-primary uppercase tracking-wider">Actualización</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/10">
                                              {pick.tracking.map((t: any) => (
                                                <tr key={t.id} className="bg-white/5 hover:bg-white/10 transition-colors">
                                                  <td className="px-3 py-2 text-primary/70 font-mono text-xs whitespace-nowrap">
                                                    {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                  </td>
                                                  <td className="px-3 py-2 text-foreground/90">
                                                    {t.message}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}

                                      {activeTrackingPickId === pick.id && (
                                        <div className="flex gap-2 mt-2 max-w-2xl">
                                          <input
                                            type="text"
                                            value={trackingMessage}
                                            onChange={(e) => setTrackingMessage(e.target.value)}
                                            placeholder="Ej: Minuto 30, gol del equipo local..."
                                            className="flex-1 bg-background border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                                            autoFocus
                                          />
                                          <button
                                            onClick={() => handleAddTracking(pick.id)}
                                            disabled={isSubmittingTracking || !trackingMessage.trim()}
                                            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                                          >
                                            {isSubmittingTracking ? (
                                              <>
                                                <Activity className="h-4 w-4 animate-spin" />
                                                Guardando...
                                              </>
                                            ) : "Guardar"}
                                          </button>
                                          <button
                                            onClick={() => { setActiveTrackingPickId(null); setTrackingMessage(""); }}
                                            className="bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-white/20"
                                          >
                                            Cerrar
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {filteredPicks.length > picksPerPage && (
                    <div className="p-4 border-t border-white/10 flex items-center justify-between bg-black/20">
                      <div className="text-xs text-muted-foreground">
                        Mostrando <span className="font-bold text-foreground">{(currentPage - 1) * picksPerPage + 1}</span> a <span className="font-bold text-foreground">{Math.min(currentPage * picksPerPage, filteredPicks.length)}</span> de <span className="font-bold text-foreground">{filteredPicks.length}</span> picks
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1 rounded bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-50 transition-colors"
                        >
                          Anterior
                        </button>
                        {Array.from({ length: Math.ceil(filteredPicks.length / picksPerPage) }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentPage(i + 1)}
                            className={`w-8 h-8 rounded text-xs font-bold transition-colors ${currentPage === i + 1 ? 'bg-primary text-primary-foreground' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                          >
                            {i + 1}
                          </button>
                        ))}
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredPicks.length / picksPerPage)))}
                          disabled={currentPage === Math.ceil(filteredPicks.length / picksPerPage) || filteredPicks.length === 0}
                          className="px-3 py-1 rounded bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-50 transition-colors"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {activeTab === "users" && (() => {
            const flattenedData = users.flatMap(user => {
              if (!user.subscriptions || user.subscriptions.length === 0) {
                return [{
                  ...user,
                  sub_plan_id: null,
                  sub_periodicity: null,
                  sub_created_at: null,
                  sub_expires_at: null,
                  sub_amount: null,
                  sub_amount_usd: null,
                  sub_payment_method: null,
                  sub_currency: null
                }];
              }
              return user.subscriptions.map((sub: any) => ({
                ...user,
                sub_plan_id: sub.plan_id,
                sub_periodicity: sub.periodicity || 'mensual',
                sub_created_at: sub.created_at,
                sub_expires_at: sub.expires_at,
                sub_amount: sub.amount,
                sub_amount_usd: sub.amount_usd,
                sub_payment_method: sub.payment_method,
                sub_currency: sub.currency
              }));
            });

            const filteredData = flattenedData.filter(row => {
              const matchUser = row.email.toLowerCase().includes(userFilter.toLowerCase());
              const matchRole = roleFilter ? row.role === roleFilter : true;
              const matchPlan = planFilter ? row.sub_plan_id === planFilter : true;
              const matchPeriodicity = periodicityFilter ? row.sub_periodicity === periodicityFilter : true;
              return matchUser && matchRole && matchPlan && matchPeriodicity;
            });

            const totalCOP = filteredData.reduce((sum, row) => sum + (Number(row.sub_amount) || 0), 0);
            const totalUSD = filteredData.reduce((sum, row) => {
              if (row.sub_amount_usd) return sum + Number(row.sub_amount_usd);
              if (row.sub_amount) return sum + (Number(row.sub_amount) / 4000);
              return sum;
            }, 0);

            return (
              <div>
                <h2 className="text-2xl font-bold mb-2">Usuarios y Suscripciones</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-card border border-white/10 rounded-2xl p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Registros</h3>
                    <p className="text-2xl font-bold">{filteredData.length}</p>
                  </div>
                  <div className="bg-card border border-white/10 rounded-2xl p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Ingresos Totales (COP)</h3>
                    <p className="text-2xl font-bold text-green-400">
                      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(totalCOP)}
                    </p>
                  </div>
                  <div className="bg-card border border-white/10 rounded-2xl p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Ingresos Totales (USD aprox)</h3>
                    <p className="text-2xl font-bold text-green-400">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalUSD)}
                    </p>
                  </div>
                </div>

                <div className="bg-card border border-white/10 rounded-2xl overflow-hidden mb-6 p-4 flex flex-wrap gap-4">
                  <input
                    type="text"
                    placeholder="Buscar por email..."
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="bg-background border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:border-primary flex-1 min-w-[200px] transition-all"
                  />
                  <SearchableSelect
                    className="flex-1 min-w-[150px]"
                    placeholder="Todos los roles"
                    options={[
                      { value: "", label: "Todos los roles" },
                      { value: "user", label: "Usuario (Gratis)" },
                      { value: "vip", label: "VIP" },
                      { value: "admin", label: "Administrador" },
                    ]}
                    value={roleFilter}
                    onChange={(val) => setRoleFilter(val)}
                  />
                  <SearchableSelect
                    className="flex-1 min-w-[150px]"
                    placeholder="Todos los planes"
                    options={[
                      { value: "", label: "Todos los planes" },
                      { value: "cuota_2", label: "VIP Cuota 2+" },
                      { value: "cuota_3", label: "VIP Cuota 3+" },
                      { value: "cuota_4", label: "VIP Cuota 4+" },
                      // { value: "cuota_5", label: "VIP Cuota 5+" },
                      { value: "all_plans", label: "Todos los Planes" },
                    ]}
                    value={planFilter}
                    onChange={(val) => setPlanFilter(val)}
                  />
                  <SearchableSelect
                    className="flex-1 min-w-[150px]"
                    placeholder="Todas las periodicidades"
                    options={[
                      { value: "", label: "Todas las periodicidades" },
                      { value: "mensual", label: "Mensual" },
                      { value: "trimestral", label: "Trimestral" },
                      { value: "semestral", label: "Semestral" },
                      { value: "anual", label: "Anual" },
                    ]}
                    value={periodicityFilter}
                    onChange={(val) => setPeriodicityFilter(val)}
                  />
                </div>

                <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-primary/20 border-b border-primary/30 sticky top-0 z-10 backdrop-blur-md">
                        <tr>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider">Email</th>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider">Rol</th>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider">Plan</th>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider">Periodicidad</th>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider">Inicio</th>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider">Fin</th>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider">Valor (COP)</th>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider">Valor (USD)</th>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider">Método</th>
                          <th className="px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {filteredData.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                              No se encontraron resultados
                            </td>
                          </tr>
                        ) : (
                          filteredData.map((row, idx) => (
                            <tr key={`${row.id}-${idx}`} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 py-3 font-medium">{row.email}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${row.role === 'admin' ? 'bg-purple-500/20 text-purple-400' :
                                  row.role === 'vip' ? 'bg-primary/20 text-primary' :
                                    'bg-white/10 text-muted-foreground'
                                  }`}>
                                  {row.role}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {row.sub_plan_id ? getPlanName(row.sub_plan_id) : '-'}
                              </td>
                              <td className="px-4 py-3 capitalize text-muted-foreground">
                                {row.sub_periodicity || '-'}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {row.sub_created_at ? new Date(row.sub_created_at).toLocaleDateString() : '-'}
                              </td>
                              <td className="px-4 py-3">
                                {row.sub_expires_at ? (
                                  <span className={new Date(row.sub_expires_at) > new Date() ? "text-green-400" : "text-red-400"}>
                                    {new Date(row.sub_expires_at).toLocaleDateString()}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {row.sub_amount ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: row.sub_currency || 'COP', minimumFractionDigits: 0 }).format(row.sub_amount) : '-'}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {row.sub_amount_usd
                                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.sub_amount_usd)
                                  : row.sub_amount
                                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.sub_amount / 4000)
                                    : '-'}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {row.sub_payment_method ? formatPaymentMethod(row.sub_payment_method) : '-'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {row.role !== 'admin' && (
                                  <div className="flex items-center justify-end gap-2">
                                    <SearchableSelect
                                      value=""
                                      onChange={(value) => {
                                        if (value) {
                                          updateVipStatus(row.id, parseInt(value));
                                        }
                                      }}
                                      className="w-full"
                                      placeholder="+ Añadir VIP"
                                      options={[
                                        { value: "", label: "+ Añadir VIP" },
                                        { value: "30", label: "30 Días (Mensual)" },
                                        { value: "90", label: "90 Días (Trimestral)" },
                                        { value: "180", label: "180 Días (Semestral)" },
                                        { value: "365", label: "365 Días (Anual)" },
                                      ]}
                                    />
                                    {row.role === 'vip' && (
                                      <button
                                        onClick={() => cancelVipStatus(row.id, row.email)}
                                        className="p-1.5 text-destructive hover:bg-destructive/20 rounded-lg transition-colors"
                                        title="Cancelar VIP"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}
          {activeTab === "markets" && (
            <div className="w-full">
              <h2 className="text-2xl font-bold mb-2">Gestionar Mercados</h2>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Formulario de Mercados */}
                <div className="lg:col-span-1">
                  <div className="bg-card p-6 rounded-2xl border border-white/10">
                    <h3 className="text-lg font-bold mb-4">{marketForm.id ? "Editar Mercado" : "Nuevo Mercado"}</h3>

                    <form onSubmit={handleMarketSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Etiqueta (Ej: Gana Local)</label>
                        <input
                          type="text"
                          value={marketForm.label}
                          onChange={(e) => {
                            setMarketForm(prev => ({ ...prev, label: e.target.value }));
                          }}
                          required
                          className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Acrónimo (Ej: 1)</label>
                        <input
                          type="text"
                          value={marketForm.acronym}
                          onChange={(e) => {
                            setMarketForm(prev => ({ ...prev, acronym: e.target.value }));
                          }}
                          required
                          className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmittingMarket}
                          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isSubmittingMarket ? (
                            <>
                              <Activity className="h-4 w-4 animate-spin" />
                              {marketForm.id ? "Actualizando..." : "Creando..."}
                            </>
                          ) : (
                            marketForm.id ? "Actualizar" : "Crear"
                          )}
                        </button>
                        {marketForm.id && (
                          <button type="button" onClick={() => setMarketForm({ id: null, label: "", acronym: "" })} className="px-4 py-2 rounded-lg bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all">
                            Cancelar
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>

                {/* Lista de Mercados */}
                <div className="lg:col-span-2">
                  <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-primary/20 border-b border-primary/30 sticky top-0 z-10 backdrop-blur-md">
                          <tr>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">ID</th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Etiqueta</th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Acrónimo</th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {markets.map(market => (
                            <tr key={market.id} className={`hover:bg-white/5 transition-all duration-500 ${newlyAddedMarketId === market.id ? 'bg-primary/20 border-l-4 border-l-primary' : ''}`}>
                              <td className="p-4 text-muted-foreground">{market.id}</td>
                              <td className="p-4 font-medium">
                                <div className="flex items-center gap-2">
                                  {market.label}
                                  {newlyAddedMarketId === market.id && (
                                    <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-bold animate-pulse">NUEVO</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4"><span className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-bold">{market.acronym}</span></td>
                              <td className="p-4">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => editMarket(market)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors" title="Editar">
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => deleteMarket(market.id, market.label)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive transition-colors" title="Eliminar">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === "leagues" && (
            <div className="w-full">
              <h2 className="text-2xl font-bold mb-2">Gestionar Ligas</h2>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Formulario de Ligas */}
                <div className="lg:col-span-1">
                  <div className="bg-card p-6 rounded-2xl border border-white/10">
                    <h3 className="text-lg font-bold mb-4">
                      {leagueForm.id ? "Editar Liga" : (
                        leagueCountryFilter ? `Nueva Liga (${countries.find(c => c.id.toString() === leagueCountryFilter)?.name})` : "Nueva Liga"
                      )}
                    </h3>

                    <form onSubmit={handleLeagueSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">País</label>
                        <SearchableSelect
                          value={leagueForm.country_id}
                          onChange={(value) => {
                            setLeagueForm(prev => ({ ...prev, country_id: value }));
                            setLeagueCountryFilter(value);
                          }}
                          className="w-full"
                          placeholder="Seleccionar..."
                          options={[
                            { value: "", label: "Seleccionar..." },
                            ...countries.map(c => ({ 
                              value: c.id, 
                              label: c.name,
                              icon: <CountryFlag countryCode={c.flag} className="w-5 h-4" />
                            }))
                          ]}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Nombre de la Liga</label>
                        <input
                          type="text"
                          value={leagueForm.name}
                          onChange={(e) => {
                            setLeagueForm(prev => ({ ...prev, name: e.target.value }));
                          }}
                          required
                          placeholder="Ej: Premier League"
                          className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmittingLeague}
                          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isSubmittingLeague ? (
                            <>
                              <Activity className="h-4 w-4 animate-spin" />
                              {leagueForm.id ? "Actualizando..." : "Creando..."}
                            </>
                          ) : (
                            leagueForm.id ? "Actualizar" : "Crear"
                          )}
                        </button>
                        {leagueForm.id && (
                          <button type="button" onClick={() => setLeagueForm({ id: null, name: "", country_id: leagueCountryFilter })} className="px-4 py-2 rounded-lg bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all">
                            Cancelar
                          </button>
                        )}
                        {!leagueForm.id && (leagueForm.name !== "" || leagueForm.country_id !== "") && (
                          <button type="button" onClick={() => setLeagueForm({ id: null, name: "", country_id: leagueCountryFilter })} className="px-4 py-2 rounded-lg bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all">
                            Limpiar
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>

                {/* Lista de Ligas */}
                <div className="lg:col-span-2">
                  <div className="mb-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative flex-1">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <SearchableSelect
                        value={leagueCountryFilter}
                        onChange={(value) => setLeagueCountryFilter(value)}
                        className="w-full"
                        placeholder="Filtrar por país (Todos)"
                        options={[
                          { value: "", label: "Filtrar por país (Todos)" },
                          ...countries.map(c => ({ 
                            value: c.id, 
                            label: c.name,
                            icon: <CountryFlag countryCode={c.flag} className="w-5 h-4" />
                          }))
                        ]}
                      />
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Buscar liga..."
                        value={leagueSearch}
                        onChange={(e) => setLeagueSearch(e.target.value)}
                        className="w-full bg-card border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:border-primary transition-all"
                      />
                    </div>
                    {visibleSelectedLeagues.length > 0 && (
                      <button
                        onClick={bulkDeleteLeagues}
                        className="px-4 py-2 rounded-xl bg-destructive/20 text-destructive font-bold text-sm hover:bg-destructive/30 transition-all flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar Seleccionadas ({visibleSelectedLeagues.length})
                      </button>
                    )}
                  </div>

                  <div className="bg-card border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-primary/20 border-b border-primary/30 sticky top-0 z-10 backdrop-blur-md">
                          <tr>
                            <th className="p-4">
                              <input
                                type="checkbox"
                                checked={filteredLeagues.length > 0 && visibleSelectedLeagues.length === filteredLeagues.length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    // Add all filtered leagues that are not already selected
                                    const newSelection = [...selectedLeagues];
                                    filteredLeagues.forEach(l => {
                                      if (!newSelection.includes(l.id)) {
                                        newSelection.push(l.id);
                                      }
                                    });
                                    setSelectedLeagues(newSelection);
                                  } else {
                                    // Remove all filtered leagues from selection
                                    setSelectedLeagues(prev => prev.filter(id => !filteredLeagues.some(l => l.id === id)));
                                  }
                                }}
                                className="rounded border-white/10 bg-background text-primary focus:ring-primary"
                              />
                            </th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">ID</th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">País</th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Nombre</th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {(() => {
                            const totalPages = Math.ceil(filteredLeagues.length / itemsPerPage);
                            const paginatedLeagues = filteredLeagues.slice((leaguePage - 1) * itemsPerPage, leaguePage * itemsPerPage);

                            if (filteredLeagues.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={5} className="p-12 text-center text-muted-foreground italic">
                                    {leagueCountryFilter || leagueSearch ? "No se encontraron ligas con estos filtros." : "No hay ligas registradas."}
                                  </td>
                                </tr>
                              );
                            }

                            return paginatedLeagues.map(league => (
                              <tr key={league.id} className={`hover:bg-white/5 transition-all duration-500 ${Number(newlyAddedLeagueId) === Number(league.id) ? 'bg-primary/20 border-l-4 border-l-primary' : ''}`}>
                                <td className="p-4">
                                  <input
                                    type="checkbox"
                                    checked={selectedLeagues.includes(league.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedLeagues(prev => [...prev, league.id]);
                                      } else {
                                        setSelectedLeagues(prev => prev.filter(id => id !== league.id));
                                      }
                                    }}
                                    className="rounded border-white/10 bg-background text-primary focus:ring-primary"
                                  />
                                </td>
                                <td className="p-4 text-muted-foreground">{league.id}</td>
                                {editingInlineLeagueId === league.id ? (
                                  <>
                                    <td className="p-4">
                                      <select
                                        value={inlineLeagueCountryId}
                                        onChange={(e) => setInlineLeagueCountryId(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveInlineLeague(league.id)}
                                        className="w-full bg-background border border-white/10 rounded px-2 py-1 text-sm focus:border-primary focus:outline-none"
                                      >
                                        <option value="">(Ninguno)</option>
                                        {countries.map(c => (
                                          <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="p-4">
                                      <input
                                        type="text"
                                        value={inlineLeagueName}
                                        onChange={(e) => setInlineLeagueName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveInlineLeague(league.id)}
                                        className="w-full bg-background border border-white/10 rounded px-2 py-1 text-sm focus:border-primary focus:outline-none"
                                      />
                                    </td>
                                    <td className="p-4">
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => saveInlineLeague(league.id)} className="p-1.5 rounded hover:bg-green-500/20 text-green-500 transition-colors" title="Guardar">
                                          <CheckCircle className="w-4 h-4" />
                                        </button>
                                        <button onClick={cancelInlineEditLeague} className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400 transition-colors" title="Cancelar">
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="p-4 text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <CountryFlag code={league.country_flag} />
                                        {league.country_name || '-'}
                                      </div>
                                    </td>
                                    <td className="p-4 font-medium">
                                      <div className="flex items-center gap-2">
                                        {league.name}
                                        {Number(newlyAddedLeagueId) === Number(league.id) && (
                                          <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-bold animate-pulse">NUEVA</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-4">
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => startInlineEditLeague(league)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors" title="Editar">
                                          <Edit className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deleteLeague(league.id, league.name)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive transition-colors" title="Eliminar">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls for Leagues */}
                    {(() => {
                      const filteredLeagues = leagues.filter(l => (!leagueCountryFilter || l.country_id?.toString() === leagueCountryFilter) && (!leagueSearch || l.name.toLowerCase().includes(leagueSearch.toLowerCase())));
                      const totalPages = Math.ceil(filteredLeagues.length / itemsPerPage);
                      if (totalPages <= 1) return null;

                      return (
                        <div className="p-4 border-t border-white/10 bg-white/5 flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">
                            Mostrando <span className="text-foreground font-bold">{Math.min(filteredLeagues.length, (leaguePage - 1) * itemsPerPage + 1)}</span> a <span className="text-foreground font-bold">{Math.min(filteredLeagues.length, leaguePage * itemsPerPage)}</span> de <span className="text-foreground font-bold">{filteredLeagues.length}</span> ligas
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setLeaguePage(p => Math.max(1, p - 1))}
                              disabled={leaguePage === 1}
                              className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-all"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum = leaguePage - 2 + i;
                              if (leaguePage <= 2) pageNum = i + 1;
                              if (leaguePage >= totalPages - 1) pageNum = totalPages - 4 + i;
                              return pageNum;
                            }).filter(p => p > 0 && p <= totalPages).map(p => (
                              <button
                                key={p}
                                onClick={() => setLeaguePage(p)}
                                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${leaguePage === p ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'hover:bg-white/10 text-muted-foreground'}`}
                              >
                                {p}
                              </button>
                            ))}
                            <button
                              onClick={() => setLeaguePage(p => Math.min(totalPages, p + 1))}
                              disabled={leaguePage === totalPages}
                              className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-all"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === "countries" && (
            <div className="w-full">
              <h2 className="text-2xl font-bold mb-2">Gestionar Países</h2>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Formulario de Países */}
                <div className="lg:col-span-1">
                  <div className="bg-card p-6 rounded-2xl border border-white/10">
                    <h3 className="text-lg font-bold mb-4">{countryForm.id ? "Editar País" : "Nuevo País"}</h3>

                    <form onSubmit={handleCountrySubmit} className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Nombre del País</label>
                        <input
                          type="text"
                          value={countryForm.name}
                          onChange={(e) => {
                            setCountryForm(prev => ({ ...prev, name: e.target.value }));
                          }}
                          required
                          placeholder="Ej: Colombia"
                          className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Bandera (Emoji o URL)</label>
                        <input
                          type="text"
                          value={countryForm.flag}
                          onChange={(e) => {
                            setCountryForm(prev => ({ ...prev, flag: e.target.value }));
                          }}
                          placeholder="Ej: 🇨🇴"
                          className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="submit"
                          disabled={isSubmittingCountry}
                          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isSubmittingCountry ? (
                            <>
                              <Activity className="h-4 w-4 animate-spin" />
                              {countryForm.id ? "Actualizando..." : "Creando..."}
                            </>
                          ) : (
                            countryForm.id ? "Actualizar" : "Crear"
                          )}
                        </button>
                        {countryForm.id && (
                          <button type="button" onClick={() => setCountryForm({ id: null, name: "", flag: "" })} className="px-4 py-2 rounded-lg bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all">
                            Cancelar
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>

                {/* Lista de Países */}
                <div className="lg:col-span-2">
                  <div className="mb-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="relative flex-1 group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      </div>
                      <input
                        type="text"
                        placeholder="Buscar país por nombre..."
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        className="w-full bg-card border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all shadow-lg"
                      />
                      {countrySearch && (
                        <button
                          onClick={() => setCountrySearch("")}
                          className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {visibleSelectedCountries.length > 0 && (
                      <button
                        onClick={bulkDeleteCountries}
                        className="px-4 py-2 rounded-xl bg-destructive/20 text-destructive font-bold text-sm hover:bg-destructive/30 transition-all flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar Seleccionados ({visibleSelectedCountries.length})
                      </button>
                    )}
                  </div>

                  <div className="bg-card border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-primary/20 border-b border-primary/30 sticky top-0 z-10 backdrop-blur-md">
                          <tr>
                            <th className="p-4">
                              <input
                                type="checkbox"
                                checked={filteredCountries.length > 0 && visibleSelectedCountries.length === filteredCountries.length}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    // Add all filtered countries that are not already selected
                                    const newSelection = [...selectedCountries];
                                    filteredCountries.forEach(c => {
                                      if (!newSelection.includes(c.id)) {
                                        newSelection.push(c.id);
                                      }
                                    });
                                    setSelectedCountries(newSelection);
                                  } else {
                                    // Remove all filtered countries from selection
                                    setSelectedCountries(prev => prev.filter(id => !filteredCountries.some(c => c.id === id)));
                                  }
                                }}
                                className="rounded border-white/10 bg-background text-primary focus:ring-primary"
                              />
                            </th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">ID</th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Bandera</th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Nombre</th>
                            <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {(() => {
                            const totalPages = Math.ceil(filteredCountries.length / itemsPerPage);
                            const paginatedCountries = filteredCountries.slice((countryPage - 1) * itemsPerPage, countryPage * itemsPerPage);

                            if (filteredCountries.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={5} className="p-12 text-center text-muted-foreground italic">
                                    {countrySearch ? "No se encontraron países con ese nombre." : "No hay países registrados."}
                                  </td>
                                </tr>
                              );
                            }

                            return paginatedCountries.map(country => (
                              <tr key={country.id} className={`hover:bg-white/5 transition-all duration-500 ${Number(newlyAddedCountryId) === Number(country.id) ? 'bg-primary/20 border-l-4 border-l-primary' : ''}`}>
                                <td className="p-4">
                                  <input
                                    type="checkbox"
                                    checked={selectedCountries.includes(country.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedCountries(prev => [...prev, country.id]);
                                      } else {
                                        setSelectedCountries(prev => prev.filter(id => id !== country.id));
                                      }
                                    }}
                                    className="rounded border-white/10 bg-background text-primary focus:ring-primary"
                                  />
                                </td>
                                <td className="p-4 text-muted-foreground">{country.id}</td>
                                {editingInlineCountryId === country.id ? (
                                  <>
                                    <td className="p-4">
                                      <input
                                        type="text"
                                        value={inlineCountryFlag}
                                        onChange={(e) => setInlineCountryFlag(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveInlineCountry(country.id)}
                                        className="w-16 bg-background border border-white/10 rounded px-2 py-1 text-sm focus:border-primary focus:outline-none"
                                      />
                                    </td>
                                    <td className="p-4">
                                      <input
                                        type="text"
                                        value={inlineCountryName}
                                        onChange={(e) => setInlineCountryName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveInlineCountry(country.id)}
                                        className="w-full bg-background border border-white/10 rounded px-2 py-1 text-sm focus:border-primary focus:outline-none"
                                      />
                                    </td>
                                    <td className="p-4">
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => saveInlineCountry(country.id)} className="p-1.5 rounded hover:bg-green-500/20 text-green-500 transition-colors" title="Guardar">
                                          <CheckCircle className="w-4 h-4" />
                                        </button>
                                        <button onClick={cancelInlineEditCountry} className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400 transition-colors" title="Cancelar">
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="p-4"><CountryFlag code={country.flag} /></td>
                                    <td className="p-4 font-medium">
                                      <div className="flex items-center gap-2">
                                        {country.name}
                                        {Number(newlyAddedCountryId) === Number(country.id) && (
                                          <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-bold animate-pulse">NUEVO</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="p-4">
                                      <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => startInlineEditCountry(country)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors" title="Editar">
                                          <Edit className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => editCountry(country)} className="p-1.5 rounded hover:bg-primary/20 text-primary transition-colors" title="Editar Completo">
                                          <Settings className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deleteCountry(country.id, country.name)} className="p-1.5 rounded hover:bg-destructive/20 text-destructive transition-colors" title="Eliminar">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls for Countries */}
                    {(() => {
                      const filteredCountries = countries.filter(c => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase()));
                      const totalPages = Math.ceil(filteredCountries.length / itemsPerPage);
                      if (totalPages <= 1) return null;

                      return (
                        <div className="p-4 border-t border-white/10 bg-white/5 flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">
                            Mostrando <span className="text-foreground font-bold">{Math.min(filteredCountries.length, (countryPage - 1) * itemsPerPage + 1)}</span> a <span className="text-foreground font-bold">{Math.min(filteredCountries.length, countryPage * itemsPerPage)}</span> de <span className="text-foreground font-bold">{filteredCountries.length}</span> países
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setCountryPage(p => Math.max(1, p - 1))}
                              disabled={countryPage === 1}
                              className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-all"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum = countryPage - 2 + i;
                              if (countryPage <= 2) pageNum = i + 1;
                              if (countryPage >= totalPages - 1) pageNum = totalPages - 4 + i;
                              return pageNum;
                            }).filter(p => p > 0 && p <= totalPages).map(p => (
                              <button
                                key={p}
                                onClick={() => setCountryPage(p)}
                                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${countryPage === p ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'hover:bg-white/10 text-muted-foreground'}`}
                              >
                                {p}
                              </button>
                            ))}
                            <button
                              onClick={() => setCountryPage(p => Math.min(totalPages, p + 1))}
                              disabled={countryPage === totalPages}
                              className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-all"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "teams" && (() => {
            // Ligas disponibles para el formulario según el país seleccionado.
            const formLeagues = leagues.filter(l => !teamForm.country_id || l.country_id?.toString() === teamForm.country_id);

            // Ligas disponibles para el filtro de tabla según el país seleccionado.
            const filterLeagues = leagues.filter(l => !teamCountryFilter || l.country_id?.toString() === teamCountryFilter);

            // Equipos filtrados por país, liga y texto de búsqueda.
            const filteredTeams = teams.filter(team => {
              // Buscamos la liga del equipo para resolver su país si hace falta.
              const teamLeague = leagues.find(l => l.id?.toString() === team.league_id?.toString());

              // Resolvemos país desde el equipo o desde su liga.
              const countryId = team.country_id?.toString() || teamLeague?.country_id?.toString() || "";

              // Resolvemos liga como string para comparar con el filtro.
              const leagueId = team.league_id?.toString() || "";

              // Validamos coincidencia por país.
              const matchesCountry = !teamCountryFilter || countryId === teamCountryFilter;

              // Validamos coincidencia por liga.
              const matchesLeague = !teamLeagueFilter || leagueId === teamLeagueFilter;

              // Validamos coincidencia por nombre visible, nombre oficial, alias o ID del proveedor.
              const matchesSearch = !teamSearch || `${team.name || ""} ${team.api_provider_name || ""} ${team.api_name || ""} ${team.api_team_id || ""}`.toLowerCase().includes(teamSearch.toLowerCase());

              // Devolvemos solo equipos compatibles con filtros activos.
              return matchesCountry && matchesLeague && matchesSearch;
            });

            // Contamos cuántos equipos visibles aún no tienen un vínculo exacto por ID del proveedor.
            const filteredTeamsWithoutExactLinkCount = filteredTeams.filter((team) => !String(team.api_team_id || "").trim()).length;

            // Renderizamos el módulo completo de equipos.
            return (
              <div className="w-full">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
                  <div>
                    <h2 className="text-2xl font-bold mb-2">Gestionar Equipos</h2>
                    <p className="text-sm text-muted-foreground">Asocia cada equipo a su país y liga correcta para picks simples y parlays.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <div className="bg-card border border-white/10 rounded-xl px-4 py-3">
                      <span className="font-bold text-primary">{filteredTeams.length}</span> equipos visibles
                    </div>
                    <div className="bg-card border border-amber-500/20 rounded-xl px-4 py-3 text-amber-200">
                      <span className="font-bold text-amber-300">{filteredTeamsWithoutExactLinkCount}</span> sin vínculo exacto API
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  <div className="xl:col-span-1">
                    <div className="bg-card p-6 rounded-2xl border border-white/10 shadow-xl">
                      <h3 className="text-lg font-bold mb-5">{teamForm.id ? "Editar Equipo" : "Nuevo Equipo"}</h3>

                      <form onSubmit={handleTeamSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">País</label>
                          <SearchableSelect
                            value={teamForm.country_id}
                            onChange={handleTeamFormCountryChange}
                            placeholder="Seleccionar país..."
                            options={countries.map(country => ({
                              value: country.id,
                              label: country.name,
                              icon: <CountryFlag countryCode={country.flag} className="w-5 h-4" />
                            }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">Liga</label>
                          <SearchableSelect
                            value={teamForm.league_id}
                            onChange={(value) => setTeamForm(prev => ({ ...prev, league_id: value }))}
                            placeholder="Seleccionar liga..."
                            disabled={!teamForm.country_id}
                            options={formLeagues.map(league => ({
                              value: league.id,
                              label: league.name
                            }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">Nombre del equipo</label>
                          <input
                            type="text"
                            value={teamForm.name}
                            onChange={(e) => {
                              setTeamForm(prev => ({ ...prev, name: e.target.value }));
                              setTeamAliasSuggestions([]);
                            }}
                            required
                            placeholder="Ej: Atlético Nacional"
                            className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">Nombre oficial en API-Football</label>
                          <input
                            type="text"
                            value={teamForm.api_provider_name}
                            onChange={(e) => setTeamForm(prev => ({ ...prev, api_provider_name: e.target.value }))}
                            placeholder="Ej: 1. FC Kaiserslautern"
                            className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                          />
                          <p className="text-[11px] text-muted-foreground">Este es el nombre exacto del proveedor. En la web se mantiene tu nombre local.</p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">ID oficial API-Football</label>
                          <input
                            type="number"
                            min="1"
                            value={teamForm.api_team_id}
                            onChange={(e) => setTeamForm(prev => ({ ...prev, api_team_id: e.target.value }))}
                            placeholder="Ej: 745"
                            className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                          />
                          <p className="text-[11px] text-muted-foreground">Cuando este ID existe, la vinculación de fixtures usa el equipo exacto del proveedor.</p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">Alias técnico (fallback)</label>
                          <input
                            type="text"
                            value={teamForm.api_name}
                            onChange={(e) => setTeamForm(prev => ({ ...prev, api_name: e.target.value }))}
                            placeholder="Ej: Kaiserslautern"
                            className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm text-foreground focus:outline-none focus:border-primary transition-all"
                          />
                          <p className="text-[11px] text-muted-foreground">Solo se usa como respaldo si todavía no existe el ID oficial del proveedor.</p>
                          <button
                            type="button"
                            onClick={() => handleSuggestTeamAlias()}
                            disabled={isSuggestingTeamAlias}
                            className="w-full rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isSuggestingTeamAlias ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isSuggestingTeamAlias ? "Buscando vínculo..." : "Sugerir vínculo API-Football"}
                          </button>
                          {teamAliasSuggestions.length > 0 && (
                            <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
                              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70">Sugerencias detectadas</div>
                              <div className="flex flex-col gap-2">
                                {teamAliasSuggestions.map((candidate, suggestionIndex) => (
                                  <button
                                    key={`${candidate.provider_name}-${suggestionIndex}`}
                                    type="button"
                                    onClick={() => handleApplySuggestedTeamAlias(candidate)}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:border-primary hover:bg-primary/10 transition-all"
                                  >
                                    <div className="min-w-0">
                                      <div className="text-sm font-bold text-white truncate">{candidate.provider_name}</div>
                                      <div className="text-[11px] text-muted-foreground truncate">
                                        {candidate.country_name || "Sin país"} {candidate.code ? `· ${candidate.code}` : ""} {candidate.provider_id ? `· ID ${candidate.provider_id}` : ""}
                                      </div>
                                    </div>
                                    <span className="rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                                      Usar
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            type="submit"
                            disabled={isSubmittingTeam}
                            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isSubmittingTeam ? (
                              <>
                                <Activity className="h-4 w-4 animate-spin" />
                                {teamForm.id ? "Actualizando..." : "Creando..."}
                              </>
                            ) : (
                              teamForm.id ? "Actualizar Equipo" : "Crear Equipo"
                            )}
                          </button>

                          {teamForm.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setTeamForm({ id: null, name: "", api_name: "", api_provider_name: "", api_team_id: "", league_id: "", country_id: "" });
                                setTeamAliasSuggestions([]);
                              }}
                              className="px-4 py-3 rounded-xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>

                  <div className="xl:col-span-2">
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="relative md:col-span-1 group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Search className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        </div>
                        <input
                          type="text"
                          placeholder="Buscar equipo..."
                            value={teamSearch}
                            onChange={(e) => setTeamSearch(e.target.value)}
                            className="w-full bg-card border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all shadow-lg"
                          />
                      </div>

                      <SearchableSelect
                        value={teamCountryFilter}
                        onChange={handleTeamCountryFilterChange}
                        placeholder="Filtrar país..."
                        options={[
                          { value: "", label: "Todos los países" },
                          ...countries.map(country => ({
                            value: country.id,
                            label: country.name,
                            icon: <CountryFlag countryCode={country.flag} className="w-5 h-4" />
                          }))
                        ]}
                      />

                      <SearchableSelect
                        value={teamLeagueFilter}
                        onChange={(value) => setTeamLeagueFilter(value)}
                        placeholder="Filtrar liga..."
                        disabled={filterLeagues.length === 0}
                        options={[
                          { value: "", label: "Todas las ligas" },
                          ...filterLeagues.map(league => ({
                            value: league.id,
                            label: league.name
                          }))
                        ]}
                      />
                    </div>

                    <div className="bg-card border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-primary/20 border-b border-primary/30 sticky top-0 z-10 backdrop-blur-md">
                            <tr>
                              <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">País</th>
                              <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Liga</th>
                              <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Tu nombre BD</th>
                              <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">API-Football</th>
                              <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10">
                            {filteredTeams.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-12 text-center text-muted-foreground italic">
                                  No hay equipos que coincidan con los filtros.
                                </td>
                              </tr>
                            ) : (
                              filteredTeams.map(team => {
                                // Buscamos la liga del equipo para mostrar nombre legible.
                                const teamLeague = leagues.find(l => l.id?.toString() === team.league_id?.toString());

                                // Buscamos el país desde el equipo o desde su liga.
                                const teamCountry = countries.find(country => country.id?.toString() === (team.country_id?.toString() || teamLeague?.country_id?.toString() || ""));

                                // Renderizamos una fila compacta y editable.
                                return (
                                  <tr key={team.id} className="hover:bg-white/5 transition-all">
                                    <td className="p-4">
                                      <div className="flex items-center gap-2">
                                        {teamCountry?.flag && <CountryFlag countryCode={teamCountry.flag} className="w-5 h-4" />}
                                        <span className="text-muted-foreground">{teamCountry?.name || "-"}</span>
                                      </div>
                                    </td>
                                    <td className="p-4 text-muted-foreground">{teamLeague?.name || "-"}</td>
                                    <td className="p-4">
                                      <div className="font-bold text-white">{team.name}</div>
                                      <div className="text-[11px] text-muted-foreground">Nombre local BetRoyale</div>
                                    </td>
                                    <td className="p-4">
                                      <div className="flex flex-col gap-2">
                                        {String(team.api_provider_name || team.api_name || "").trim() ? (
                                          <span className={`rounded-lg border px-2 py-1 text-xs font-bold ${String(team.api_team_id || "").trim() ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                                            {team.api_provider_name || team.api_name}
                                          </span>
                                        ) : (
                                          <span className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">
                                            Sin nombre API
                                          </span>
                                        )}
                                        <div className="text-[11px] text-muted-foreground">
                                          {String(team.api_team_id || "").trim() ? `ID oficial: ${team.api_team_id}` : "Sin ID oficial vinculado"}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="p-4">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          onClick={() => handleSuggestTeamAlias({
                                            id: team.id,
                                            name: team.name || "",
                                            api_name: team.api_name || "",
                                            api_provider_name: team.api_provider_name || "",
                                            api_team_id: team.api_team_id || "",
                                            league_id: team.league_id?.toString() || "",
                                            country_id: team.country_id?.toString() || teamLeague?.country_id?.toString() || ""
                                          })}
                                          className="p-1.5 rounded hover:bg-primary/20 text-primary transition-colors"
                                          title="Sugerir vínculo API-Football"
                                        >
                                          <Sparkles className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => editTeam(team)}
                                          className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                                          title="Editar"
                                        >
                                          <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => deleteTeam(team.id, team.name)}
                                          className="p-1.5 rounded hover:bg-destructive/20 text-destructive transition-colors"
                                          title="Eliminar"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === "stats" && (() => {
            const currentPerfStats = performanceStats ? (performanceStats[selectedStatsPlan] || { totalPicks: 0, won: 0, lost: 0, voided: 0, hitRate: "0.00", yield: "0.00", profit: "0.00" }) : null;

            const processedRevenue = (revenueStats?.revenueByDay || revenueStats?.ingresosPorDia) ? (() => {
              const aggregated: Record<string, { month: string, total_cop: number, total_usd: number }> = {};
              (revenueStats?.revenueByDay || revenueStats?.ingresosPorDia || []).forEach((row: any) => {
                if (selectedStatsPlan !== 'all' && row.plan_id !== selectedStatsPlan) return;
                const month = (row.date || row.fecha || "").substring(0, 7); // Extract YYYY-MM
                if (!aggregated[month]) {
                  aggregated[month] = { month: month, total_cop: 0, total_usd: 0 };
                }
                aggregated[month].total_cop += Number(row.total_cop || 0);
                aggregated[month].total_usd += Number(row.total_usd || 0);
              });
              return Object.values(aggregated).sort((a, b) => a.month.localeCompare(b.month));
            })() : [];

            const totalRev = (revenueStats?.totalRevenue || revenueStats?.totalPorPlan) ? (() => {
              let cop = 0;
              let usd = 0;
              (revenueStats?.totalRevenue || revenueStats?.totalPorPlan || []).forEach((row: any) => {
                if (selectedStatsPlan === 'all' || row.plan_id === selectedStatsPlan) {
                  cop += Number(row.total_cop || 0);
                  usd += Number(row.total_usd || 0);
                }
              });
              return { cop, usd };
            })() : { cop: 0, usd: 0 };

            const renderDateFilter = (
              startDate: string,
              setStartDate: (v: string) => void,
              endDate: string,
              setEndDate: (v: string) => void,
              activeFilter: string,
              setActiveFilter: (v: string) => void
            ) => (
              <div className="flex items-center gap-2 bg-card border border-white/10 rounded-lg px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Desde:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setActiveFilter("custom"); }}
                    className="bg-transparent text-sm text-foreground focus:outline-none [color-scheme:dark]"
                  />
                </div>
                <span className="text-muted-foreground">|</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Hasta:</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setActiveFilter("custom"); }}
                    className="bg-transparent text-sm text-foreground focus:outline-none [color-scheme:dark]"
                  />
                </div>
                <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-2">
                  <button
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(end.getDate() - 30);
                      setStartDate(start.toISOString().split('T')[0]);
                      setEndDate(end.toISOString().split('T')[0]);
                      setActiveFilter("30d");
                    }}
                    className={`text-[10px] px-2 py-1 rounded transition-colors ${activeFilter === '30d' ? 'bg-primary text-primary-foreground font-bold' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    30D
                  </button>
                  <button
                    onClick={() => {
                      const end = new Date();
                      const start = new Date(end.getFullYear(), end.getMonth(), 1);
                      setStartDate(start.toISOString().split('T')[0]);
                      setEndDate(end.toISOString().split('T')[0]);
                      setActiveFilter("month");
                    }}
                    className={`text-[10px] px-2 py-1 rounded transition-colors ${activeFilter === 'month' ? 'bg-primary text-primary-foreground font-bold' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    Mes
                  </button>
                  <button
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setMonth(end.getMonth() - 6);
                      setStartDate(start.toISOString().split('T')[0]);
                      setEndDate(end.toISOString().split('T')[0]);
                      setActiveFilter("6m");
                    }}
                    className={`text-[10px] px-2 py-1 rounded transition-colors ${activeFilter === '6m' ? 'bg-primary text-primary-foreground font-bold' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    6M
                  </button>
                </div>
                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(""); setEndDate(""); setActiveFilter("all"); }}
                    className="ml-2 text-xs text-red-400 hover:text-red-300"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            );

            return (
              <div className="w-full">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
                  <h2 className="text-2xl font-bold">Estadísticas y Rendimiento</h2>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-muted-foreground">Plan:</label>
                      <SearchableSelect
                        value={selectedStatsPlan}
                        onChange={(value) => setSelectedStatsPlan(value)}
                        className="w-64"
                        placeholder="Todos los Planes"
                        options={[
                          { value: "all", label: "Todos los Planes" },
                          ...(Array.isArray(pickTypes) ? pickTypes.map(pt => ({ value: pt.slug, label: pt.name })) : [])
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* Performance Stats */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
                  <h3 className="text-xl font-bold text-primary">Rendimiento de Picks</h3>
                  {renderDateFilter(perfStartDate, setPerfStartDate, perfEndDate, setPerfEndDate, activePerfDateFilter, setActivePerfDateFilter)}
                </div>
                {performanceStats ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Trophy className="w-5 h-5" />
                        <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Total Picks</span>
                      </div>
                      <div className="text-3xl font-black text-white tabular-nums">{currentPerfStats.totalPicks}</div>
                      <div className="flex gap-2 mt-2 text-xs font-bold">
                        <span className="text-green-400">{currentPerfStats.won} W</span>
                        <span className="text-red-400">{currentPerfStats.lost} L</span>
                        <span className="text-gray-400">{currentPerfStats.voided} V</span>
                      </div>
                    </div>
                    <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Acierto</span>
                      </div>
                      <div className="text-3xl font-black text-white tabular-nums">{currentPerfStats.hitRate}%</div>
                    </div>
                    <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Activity className="w-5 h-5" />
                        <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Yield</span>
                      </div>
                      <div className={`text-3xl font-black tabular-nums ${Number(currentPerfStats.yield) > 0 ? 'text-green-400' : Number(currentPerfStats.yield) < 0 ? 'text-red-400' : 'text-white'}`}>
                        {Number(currentPerfStats.yield) > 0 ? '+' : ''}{currentPerfStats.yield}%
                      </div>
                    </div>
                    <div className="group p-6 rounded-3xl bg-slate-900/50 border border-white/10 text-left relative overflow-hidden hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <DollarSign className="w-5 h-5" />
                        <span className="text-[10px] uppercase tracking-[0.2em] font-medium">Profit</span>
                      </div>
                      <div className={`text-3xl font-black tabular-nums ${Number(currentPerfStats.profit) > 0 ? 'text-green-400' : Number(currentPerfStats.profit) < 0 ? 'text-red-400' : 'text-white'}`}>
                        {Number(currentPerfStats.profit) > 0 ? '+' : ''}{currentPerfStats.profit}U
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">Cargando estadísticas de rendimiento...</div>
                )}

                {/* Resumen por Tipología */}
                <div className="bg-card border border-white/10 rounded-2xl overflow-hidden mt-8 mb-12">
                  <div className="p-4 bg-white/5 border-b border-white/10">
                    <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Resumen de Picks por Tipología</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground bg-white/5">
                          <th className="p-4 font-medium">Tipo de Plan</th>
                          <th className="p-4 font-medium">Picks</th>
                          <th className="p-4 font-medium">Récord (W-L-V)</th>
                          <th className="p-4 font-medium text-center">% Acierto</th>
                          <th className="p-4 font-medium text-center">Yield</th>
                          <th className="p-4 font-medium text-right">Beneficio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pickTypes.map(pt => {
                          const stats = performanceStats?.[pt.slug] || { totalPicks: 0, won: 0, lost: 0, voided: 0, hitRate: "0.00", yield: "0.00", profit: "0.00" };
                          if (stats.totalPicks === 0 && pt.slug !== 'free') return null;
                          return (
                            <tr key={pt.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="p-4 font-bold text-white">{pt.name}</td>
                              <td className="p-4 text-white tabular-nums">{stats.totalPicks}</td>
                              <td className="p-4">
                                <div className="flex gap-2 text-xs font-bold tabular-nums">
                                  <span className="text-green-400">{stats.won}W</span>
                                  <span className="text-red-400">{stats.lost}L</span>
                                  <span className="text-gray-400">{stats.voided}V</span>
                                </div>
                              </td>
                              <td className="p-4 text-white tabular-nums text-center">{stats.hitRate}%</td>
                              <td className={`p-4 tabular-nums text-center ${Number(stats.yield) > 0 ? 'text-green-400' : Number(stats.yield) < 0 ? 'text-red-400' : 'text-white'}`}>
                                {Number(stats.yield) > 0 ? '+' : ''}{stats.yield}%
                              </td>
                              <td className={`p-4 text-right tabular-nums font-bold ${Number(stats.profit) > 0 ? 'text-green-400' : Number(stats.profit) < 0 ? 'text-red-400' : 'text-white'}`}>
                                {Number(stats.profit) > 0 ? '+' : ''}{stats.profit}U
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Revenue Stats */}
                {selectedStatsPlan !== 'free' && (
                  <>
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4 mt-12">
                      <h3 className="text-xl font-bold text-primary">Ingresos y Suscripciones</h3>
                      {renderDateFilter(revStartDate, setRevStartDate, revEndDate, setRevEndDate, activeRevDateFilter, setActiveRevDateFilter)}
                    </div>
                    {revenueStats ? (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                          <div className="bg-card border border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                            <h4 className="text-sm font-medium text-muted-foreground mb-2">Ingresos Históricos (COP)</h4>
                            <p className="text-3xl font-black text-[#D4AF37]">{formatMoney(totalRev.cop, 'COP')}</p>
                          </div>
                          <div className="bg-card border border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                            <h4 className="text-sm font-medium text-muted-foreground mb-2">Ingresos Históricos (USD)</h4>
                            <p className="text-3xl font-black text-[#10b981]">{formatMoney(totalRev.usd, 'USD')}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Revenue Chart */}
                          <div className="bg-card border border-white/10 rounded-2xl p-6">
                            <h4 className="text-lg font-bold mb-6">Ingresos Mensuales (Últimos 6 meses)</h4>
                            <div className="h-[300px] w-full">
                              <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={processedRevenue}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                  <XAxis dataKey="month" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                                  <YAxis
                                    stroke="#888"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => new Intl.NumberFormat('es-CO', { notation: "compact", compactDisplay: "short" }).format(value)}
                                  />
                                  <RechartsTooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px' }}
                                    formatter={(value: number, name: string) => {
                                      if (name === 'Ingresos COP') return [formatMoney(value, 'COP'), name];
                                      if (name === 'Ingresos USD') return [formatMoney(value, 'USD'), name];
                                      return [value, name];
                                    }}
                                  />
                                  <Legend />
                                  <Bar dataKey="total_cop" name="Ingresos COP" fill="#D4AF37" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="total_usd" name="Ingresos USD" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* Plan Distribution Chart */}
                          {selectedStatsPlan === 'all' && (
                            <div className="bg-card border border-white/10 rounded-2xl p-6">
                              <h4 className="text-lg font-bold mb-6">Distribución de Planes Activos</h4>
                              <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height={300}>
                                  <PieChart>
                                    <Pie
                                      data={(revenueStats?.planDistribution || revenueStats?.distribucionPlanes || []).map((x) => ({ count: x.count !== undefined ? Number(x.count) : Number(x.cantidad || 0), plan_id: x.plan_id }))}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={60}
                                      outerRadius={100}
                                      paddingAngle={5}
                                      dataKey="count"
                                      nameKey="plan_id"
                                      label={({ plan_id, percent }) => `${getPlanName(plan_id)} (${(percent * 100).toFixed(0)}%)`}
                                    >
                                      {(revenueStats?.planDistribution || revenueStats?.distribucionPlanes || []).map((entry: any, index: number) => {
                                        const colors = ['#D4AF37', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
                                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                                      })}
                                    </Pie>
                                    <RechartsTooltip
                                      contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px' }}
                                      formatter={(value: number, name: string) => [value, getPlanName(name)]}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">Cargando estadísticas de ingresos...</div>
                    )}

                    {/* Advanced Stats */}
                    {advancedStats && (
                      <div className="mt-12">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
                          <h3 className="text-xl font-bold text-primary">Estadísticas Avanzadas (Yield)</h3>
                          {renderDateFilter(advStartDate, setAdvStartDate, advEndDate, setAdvEndDate, activeAdvDateFilter, setActiveAdvDateFilter)}
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Yield by League */}
                          <div className="bg-card border border-white/10 rounded-2xl p-6">
                            <h4 className="text-lg font-bold mb-6">Yield por Liga (Top 15)</h4>
                            <div className="h-[400px] w-full">
                              <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={(advancedStats?.byLeague || advancedStats?.porLiga || []).map((x) => ({ ...x, league: x.league || x.liga || "" }))} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                  <XAxis type="number" tickFormatter={(value) => `${value}%`} stroke="#666" />
                                  <YAxis dataKey="league" type="category" width={120} stroke="#666" tick={{ fontSize: 12 }} />
                                  <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px' }}
                                    formatter={(value: any, name: string) => {
                                      if (name === 'yield') return [`${value}%`, 'Yield'];
                                      if (name === 'total_picks') return [value, 'Picks Totales'];
                                      if (name === 'profit') return [`${value} U`, 'Beneficio'];
                                      return [value, name];
                                    }}
                                  />
                                  <Legend />
                                  <Bar dataKey="yield" name="Yield (%)" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                                    {(advancedStats?.byLeague || advancedStats?.porLiga || []).map((entry: any, index: number) => (
                                      <Cell key={`cell-${index}`} fill={parseFloat(entry.yield) >= 0 ? '#10b981' : '#ef4444'} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* Yield by Market */}
                          <div className="bg-card border border-white/10 rounded-2xl p-6">
                            <h4 className="text-lg font-bold mb-6">Yield por Mercado (Top 15)</h4>
                            <div className="h-[400px] w-full">
                              <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={(advancedStats?.byMarket || advancedStats?.porMercado || []).map((x) => ({ ...x, market: x.market || x.mercado || "" }))} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                  <XAxis type="number" tickFormatter={(value) => `${value}%`} stroke="#666" />
                                  <YAxis dataKey="market" type="category" width={120} stroke="#666" tick={{ fontSize: 12 }} />
                                  <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px' }}
                                    formatter={(value: any, name: string) => {
                                      if (name === 'yield') return [`${value}%`, 'Yield'];
                                      if (name === 'total_picks') return [value, 'Picks Totales'];
                                      if (name === 'profit') return [`${value} U`, 'Beneficio'];
                                      return [value, name];
                                    }}
                                  />
                                  <Legend />
                                  <Bar dataKey="yield" name="Yield (%)" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                                    {(advancedStats?.byMarket || advancedStats?.porMercado || []).map((entry: any, index: number) => (
                                      <Cell key={`cell-${index}`} fill={parseFloat(entry.yield) >= 0 ? '#10b981' : '#ef4444'} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {activeTab === "promo-codes" && (
            <div className="w-full">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold">Gestión de Cupones</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                  <div className="bg-card border border-white/10 rounded-2xl p-6">
                    <h3 className="text-lg font-bold mb-6">{editingPromoCodeId ? "Editar Cupón" : "Nuevo Cupón"}</h3>
                    <form onSubmit={handleSubmitPromoCode} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">Código</label>
                        <input
                          type="text"
                          required
                          value={newPromoCode.code}
                          onChange={(e) => setNewPromoCode({ ...newPromoCode, code: e.target.value.toUpperCase() })}
                          className="w-full bg-background border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary/50 uppercase font-mono"
                          placeholder="EJ: VIP50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">Descuento (%)</label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="100"
                          value={newPromoCode.discount_percentage}
                          onChange={(e) => setNewPromoCode({ ...newPromoCode, discount_percentage: e.target.value })}
                          className="w-full bg-background border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary/50"
                          placeholder="Ej: 100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">Límite de usos (Opcional)</label>
                        <input
                          type="number"
                          min="1"
                          value={newPromoCode.max_uses}
                          onChange={(e) => setNewPromoCode({ ...newPromoCode, max_uses: e.target.value })}
                          className="w-full bg-background border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary/50"
                          placeholder="Ej: 10"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">Válido hasta (Opcional)</label>
                        <input
                          type="datetime-local"
                          value={newPromoCode.valid_until}
                          onChange={(e) => setNewPromoCode({ ...newPromoCode, valid_until: e.target.value })}
                          className="w-full bg-background border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary/50"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={isSubmittingPromoCode}
                          className="flex-1 bg-primary text-primary-foreground font-bold py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {isSubmittingPromoCode ? (
                            <div className="flex items-center justify-center gap-2">
                              <Activity className="h-4 w-4 animate-spin" />
                              <span>Procesando...</span>
                            </div>
                          ) : (
                            editingPromoCodeId ? "Guardar Cambios" : "Crear Cupón"
                          )}
                        </button>
                        {editingPromoCodeId && (
                          <button
                            type="button"
                            onClick={handleCancelPromoCodeEdit}
                            className="px-4 bg-white/10 text-white font-bold py-3 rounded-lg hover:bg-white/20 transition-colors"
                          >
                            X
                          </button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/5">
                            <th className="p-4 text-sm font-medium text-muted-foreground">Código</th>
                            <th className="p-4 text-sm font-medium text-muted-foreground">Descuento</th>
                            <th className="p-4 text-sm font-medium text-muted-foreground">Usos</th>
                            <th className="p-4 text-sm font-medium text-muted-foreground">Vencimiento</th>
                            <th className="p-4 text-sm font-medium text-muted-foreground text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {promoCodes.map((promo) => (
                            <tr key={promo.id} className="hover:bg-white/5 transition-colors">
                              <td className="p-4">
                                <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                                  {promo.code}
                                </span>
                              </td>
                              <td className="p-4 font-medium">{promo.discount_percentage}%</td>
                              <td className="p-4">
                                <span className={`${promo.max_uses && promo.current_uses >= promo.max_uses ? 'text-destructive' : 'text-emerald-400'}`}>
                                  {promo.current_uses}
                                </span>
                                {promo.max_uses ? ` / ${promo.max_uses}` : ' (Ilimitado)'}
                              </td>
                              <td className="p-4 text-muted-foreground text-xs">
                                {formatPromoDateForDisplay(promo.valid_until)}
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => handleEditPromoCodeInit(promo)}
                                    className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                    title="Editar cupón"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePromoCode(promo.id)}
                                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                    title="Eliminar cupón"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {promoCodes.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                No hay cupones creados
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === "telegram" && (
            <div className="w-full">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold">Configuración de Telegram</h2>
                  <p className="text-muted-foreground text-sm mt-1">Configura el canal de Telegram para cada tipo de suscripción</p>
                </div>
              </div>

              <div className="grid gap-6">
                <div className="bg-card border border-primary/30 rounded-2xl p-6 shadow-sm group">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary">
                          Espejo VIP
                        </span>
                        <h3 className="text-lg font-bold text-white uppercase tracking-tight">VIP Full Channel</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-6">
                        Recibe automáticamente cada pick VIP publicado en Cuota 2+, 3+, 4+ y 5+.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-muted-foreground uppercase opacity-70">Channel ID</label>
                          <input
                            type="text"
                            placeholder="Ej: -100123456789"
                            value={telegramFullConfig.telegram_channel_id}
                            onChange={(e) => setTelegramFullConfig(prev => ({ ...prev, telegram_channel_id: e.target.value }))}
                            onBlur={(e) => updateTelegramFullConfig({ telegram_channel_id: e.target.value })}
                            className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-muted-foreground uppercase opacity-70">Enlace de Invitación (Opcional)</label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="https://t.me/joinchat/..."
                              value={telegramFullConfig.telegram_invite_link}
                              onChange={(e) => setTelegramFullConfig(prev => ({ ...prev, telegram_invite_link: e.target.value }))}
                              onBlur={(e) => updateTelegramFullConfig({ telegram_invite_link: e.target.value })}
                              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all"
                            />
                            {telegramFullConfig.telegram_invite_link && (
                              <a href={telegramFullConfig.telegram_invite_link} target="_blank" rel="noopener noreferrer" className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center p-4 bg-primary/5 rounded-2xl border border-primary/20 min-w-[120px]">
                      <Send className={`w-8 h-8 mb-2 ${telegramFullConfig.telegram_channel_id ? 'text-primary' : 'text-muted-foreground opacity-30'}`} />
                      <span className="text-[10px] font-bold text-center uppercase text-muted-foreground">
                        {telegramFullConfig.telegram_channel_id ? 'Conectado' : 'Sin Configurar'}
                      </span>
                      {/* Botón de prueba para confirmar que el canal espejo VIP Full recibe mensajes. */}
                      <button
                        type="button"
                        onClick={sendTestTelegramFullMessage}
                        disabled={!telegramFullConfig.telegram_channel_id || isSubmittingPickType}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/30 px-3 py-2 text-[11px] font-bold uppercase text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {/* Indicador visual mientras el backend habla con Telegram. */}
                        {isSubmittingPickType ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Probar
                      </button>
                    </div>
                  </div>
                </div>

                {pickTypes.map((type) => (
                  <div key={type.id} className="bg-card border border-white/10 rounded-2xl p-6 hover:border-primary/30 transition-all transition-colors shadow-sm group">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${type.slug === 'free' ? 'bg-primary/20 text-primary' : 'bg-accent/20 text-accent'}`}>
                            {type.name}
                          </span>
                          <h3 className="text-lg font-bold text-white uppercase tracking-tight">{type.name} Channel</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mb-6">
                          Define el ID del canal donde se enviarán los picks {type.name.toLowerCase()}.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase opacity-70">Channel ID</label>
                            <input
                              type="text"
                              placeholder="Ej: -100123456789"
                              defaultValue={type.telegram_channel_id}
                              onBlur={(e) => updatePickType(type.id, { telegram_channel_id: e.target.value })}
                              className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase opacity-70">Enlace de Invitación (Opcional)</label>
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="https://t.me/joinchat/..."
                                defaultValue={type.telegram_invite_link}
                                onBlur={(e) => updatePickType(type.id, { telegram_invite_link: e.target.value })}
                                className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-all"
                              />
                              {type.telegram_invite_link && (
                                <a href={type.telegram_invite_link} target="_blank" rel="noopener noreferrer" className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80">
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center p-4 bg-primary/5 rounded-2xl border border-primary/10 min-w-[120px]">
                        <Send className={`w-8 h-8 mb-2 ${type.telegram_channel_id ? 'text-primary' : 'text-muted-foreground opacity-30'}`} />
                        <span className="text-[10px] font-bold text-center uppercase text-muted-foreground">
                          {type.telegram_channel_id ? 'Conectado' : 'Sin Configurar'}
                        </span>
                        {/* Botón de prueba para confirmar que BotFather/token/canal están bien conectados. */}
                        <button
                          type="button"
                          onClick={() => sendTestPickTypeMessage(type.id)}
                          disabled={!type.telegram_channel_id || isSubmittingPickType}
                          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/30 px-3 py-2 text-[11px] font-bold uppercase text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {/* Indicador visual mientras el backend habla con Telegram. */}
                          {isSubmittingPickType ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Probar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                <h3 className="flex items-center gap-2 text-blue-400 font-bold mb-3">
                  <BrainCircuit className="w-5 h-5" />
                  ¿Cómo obtener el ID del canal?
                </h3>
                <ul className="text-sm text-blue-200/70 space-y-2 list-disc pl-5">
                  <li>Añade tu Bot de Telegram como <strong>Administrador</strong> en el canal.</li>
                  <li>Envía un mensaje de prueba en el canal.</li>
                  <li>Usa un bot como <code className="bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-300">@userinfobot</code> enviando el mensaje del canal o usa la API de Telegram.</li>
                  <li>Los IDs de canales privados suelen empezar con <code className="bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-300">-100</code>.</li>
                </ul>
              </div>
            </div>
          )}
        </main>

        {/* Confirm Modal */}
        {confirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
              <div className="p-6">
                <h3 className="text-xl font-bold mb-2">{confirmDialog.title}</h3>
                <p className="text-muted-foreground mb-6">{confirmDialog.message}</p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmDialog(null)}
                    className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    {confirmDialog.cancelText || "Cancelar"}
                  </button>
                  <button
                    onClick={confirmDialog.onConfirm}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      confirmDialog.variant === 'emerald'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : confirmDialog.variant === 'primary'
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    }`}
                  >
                    {confirmDialog.confirmText || "Confirmar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alert Modal */}
        {alertDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border overflow-hidden">
              <div className="p-6">
                <h3 className="text-xl font-bold mb-2">{alertDialog.title}</h3>
                <p className="text-muted-foreground mb-6">{alertDialog.message}</p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setAlertDialog(null)}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Aceptar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal para resolución manual asistida con sugerencia automática. */}
        {manualResolutionDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-card w-full max-w-4xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                <div>
                  <h3 className="text-xl font-black text-foreground">Resolución Manual Asistida</h3>
                  <p className="text-sm text-muted-foreground">{manualResolutionDialog.matchName}</p>
                </div>
                <button
                  onClick={() => setManualResolutionDialog(null)}
                  className="rounded-lg p-2 text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
                  title="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
                <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-primary/80">Mercado</div>
                  <div className="mt-1 text-base font-bold text-foreground">{manualResolutionDialog.marketLabel}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {isCornersMarketReference(manualResolutionDialog.marketReference)
                      ? "Este mercado puede resolverse con córners totales o por equipo."
                      : isYellowCardsMarketReference(manualResolutionDialog.marketReference)
                        ? "Este mercado puede resolverse con amarillas totales o por equipo."
                        : "Este mercado se resuelve principalmente con el marcador final."}
                  </div>
                </div>

                {/* UI Condicional: Pick Individual vs Parlay */}
                {!manualResolutionDialog.is_parlay ? (
                  <div className="grid gap-6 lg:grid-cols-3">
                    <div className={`rounded-2xl border px-4 py-4 ${!isCornersMarketReference(manualResolutionDialog.marketReference) && !isYellowCardsMarketReference(manualResolutionDialog.marketReference) ? "border-primary/30 bg-primary/5" : "border-white/10 bg-white/[0.02]"}`}>
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Marcador Final</div>
                      <div className="mt-1 text-xs text-muted-foreground">Útil para mercados de ganador, doble oportunidad y goles.</div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Goles Local</label>
                          <input
                            type="number"
                            min="0"
                            value={manualResolutionDialog.score_home}
                            onChange={(e) => updateManualResolutionField("score_home", e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Goles Visitante</label>
                          <input
                            type="number"
                            min="0"
                            value={manualResolutionDialog.score_away}
                            onChange={(e) => updateManualResolutionField("score_away", e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-2xl border px-4 py-4 ${isCornersMarketReference(manualResolutionDialog.marketReference) ? "border-primary/30 bg-primary/5" : "border-white/10 bg-white/[0.02]"}`}>
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Córners</div>
                      <div className="mt-1 text-xs text-muted-foreground">Puedes cargar total del partido o discriminar local y visitante.</div>
                      <div className="mt-4 grid gap-3">
                        <div>
                          <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Córners Totales</label>
                          <input
                            type="number"
                            min="0"
                            value={manualResolutionDialog.corners_total}
                            onChange={(e) => updateManualResolutionField("corners_total", e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Córners Local</label>
                            <input
                              type="number"
                              min="0"
                              value={manualResolutionDialog.corners_home}
                              onChange={(e) => updateManualResolutionField("corners_home", e.target.value)}
                              className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Córners Visitante</label>
                            <input
                              type="number"
                              min="0"
                              value={manualResolutionDialog.corners_away}
                              onChange={(e) => updateManualResolutionField("corners_away", e.target.value)}
                              className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-2xl border px-4 py-4 ${isYellowCardsMarketReference(manualResolutionDialog.marketReference) ? "border-primary/30 bg-primary/5" : "border-white/10 bg-white/[0.02]"}`}>
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Amarillas</div>
                      <div className="mt-1 text-xs text-muted-foreground">Ideal para mercados de tarjetas del partido, local o visitante.</div>
                      <div className="mt-4 grid gap-3">
                        <div>
                          <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Amarillas Totales</label>
                          <input
                            type="number"
                            min="0"
                            value={manualResolutionDialog.yellow_cards_total}
                            onChange={(e) => updateManualResolutionField("yellow_cards_total", e.target.value)}
                            className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Amarillas Local</label>
                            <input
                              type="number"
                              min="0"
                              value={manualResolutionDialog.yellow_cards_home}
                              onChange={(e) => updateManualResolutionField("yellow_cards_home", e.target.value)}
                              className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Amarillas Visitante</label>
                            <input
                              type="number"
                              min="0"
                              value={manualResolutionDialog.yellow_cards_away}
                              onChange={(e) => updateManualResolutionField("yellow_cards_away", e.target.value)}
                              className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {manualResolutionDialog.selections.map((sel, idx) => (
                      <div key={idx} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                        <div className="bg-white/[0.03] px-6 py-3 border-b border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-black text-primary">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-bold text-foreground">{sel.matchName}</span>
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary/80 bg-primary/10 px-2 py-1 rounded">
                            {sel.marketLabel}
                          </span>
                        </div>
                        
                        <div className="p-6 space-y-6">
                          <div className="text-xs text-muted-foreground">
                            {isCornersMarketReference(sel.marketReference)
                              ? "Esta selección puede resolverse con córners totales o por equipo."
                              : isYellowCardsMarketReference(sel.marketReference)
                                ? "Esta selección puede resolverse con amarillas totales o por equipo."
                                : "Esta selección se resuelve principalmente con el marcador final."}
                          </div>

                          <div className="grid gap-6 md:grid-cols-3">
                            <div className={`rounded-2xl border px-4 py-4 ${!isCornersMarketReference(sel.marketReference) && !isYellowCardsMarketReference(sel.marketReference) ? "border-primary/30 bg-primary/5" : "border-white/10 bg-background/40"}`}>
                              <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Marcador Final</div>
                              <div className="mt-1 text-xs text-muted-foreground">Útil para ganador, goles y doble oportunidad.</div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Goles Local</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={sel.score_home}
                                    onChange={(e) => updateManualResolutionSelectionField(idx, "score_home", e.target.value)}
                                    className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Goles Visitante</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={sel.score_away}
                                    onChange={(e) => updateManualResolutionSelectionField(idx, "score_away", e.target.value)}
                                    className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className={`rounded-2xl border px-4 py-4 ${isCornersMarketReference(sel.marketReference) ? "border-primary/30 bg-primary/5" : "border-white/10 bg-background/40"}`}>
                              <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Córners</div>
                              <div className="mt-1 text-xs text-muted-foreground">Puedes cargar el total del partido o discriminar local y visitante.</div>
                              <div className="mt-4 grid gap-3">
                                <div>
                                  <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Córners Totales</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={sel.corners_total}
                                    onChange={(e) => updateManualResolutionSelectionField(idx, "corners_total", e.target.value)}
                                    className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                                  />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Córners Local</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={sel.corners_home}
                                      onChange={(e) => updateManualResolutionSelectionField(idx, "corners_home", e.target.value)}
                                      className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Córners Visitante</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={sel.corners_away}
                                      onChange={(e) => updateManualResolutionSelectionField(idx, "corners_away", e.target.value)}
                                      className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className={`rounded-2xl border px-4 py-4 ${isYellowCardsMarketReference(sel.marketReference) ? "border-primary/30 bg-primary/5" : "border-white/10 bg-background/40"}`}>
                              <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Amarillas</div>
                              <div className="mt-1 text-xs text-muted-foreground">Ideal para mercados de tarjetas del partido, local o visitante.</div>
                              <div className="mt-4 grid gap-3">
                                <div>
                                  <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Amarillas Totales</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={sel.yellow_cards_total}
                                    onChange={(e) => updateManualResolutionSelectionField(idx, "yellow_cards_total", e.target.value)}
                                    className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                                  />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Amarillas Local</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={sel.yellow_cards_home}
                                      onChange={(e) => updateManualResolutionSelectionField(idx, "yellow_cards_home", e.target.value)}
                                      className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Amarillas Visitante</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={sel.yellow_cards_away}
                                      onChange={(e) => updateManualResolutionSelectionField(idx, "yellow_cards_away", e.target.value)}
                                      className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
                              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sugerencia por selección</div>
                              <div className="mt-3 flex flex-wrap items-center gap-3">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${sel.suggested_status === "won" ? "bg-emerald-500/15 text-emerald-400" : sel.suggested_status === "lost" ? "bg-red-500/15 text-red-400" : sel.suggested_status === "void" ? "bg-slate-500/15 text-slate-300" : "bg-yellow-500/15 text-yellow-400"}`}>
                                  {sel.suggested_status ? getLocalizedStatus(sel.suggested_status) : "Sin calcular"}
                                </span>
                              </div>
                              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                {sel.suggested_reason || "Completa los datos de esta selección y usa “Sugerir resultado” para obtener una recomendación."}
                              </p>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
                              <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">Estado Selección</label>
                              <select
                                value={sel.final_status}
                                onChange={(e) => updateManualResolutionSelectionField(idx, "final_status", e.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                              >
                                <option value="pending">Pendiente</option>
                                <option value="won">Ganado</option>
                                <option value="lost">Perdido</option>
                                <option value="void">Nulo</option>
                                <option value="half-won">Medio Ganado</option>
                                <option value="half-lost">Medio Perdido</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex-1">
                      <label className="mb-2 block text-[11px] font-bold uppercase text-muted-foreground">
                        {manualResolutionDialog.is_parlay ? "Estado Global del Parlay" : "Estado Final Confirmado por Admin"}
                      </label>
                      <select
                        value={manualResolutionDialog.final_status}
                        onChange={(e) => updateManualResolutionField("final_status", e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                      >
                        <option value="pending">Pendiente</option>
                        <option value="won">Ganado</option>
                        <option value="lost">Perdido</option>
                        <option value="void">Nulo</option>
                        <option value="half-won">Medio Ganado</option>
                        <option value="half-lost">Medio Perdido</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={requestManualResolutionSuggestion}
                        disabled={manualResolutionDialog.isSuggesting || manualResolutionDialog.isSaving}
                        className="inline-flex items-center gap-2 rounded-xl border border-primary/30 px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {manualResolutionDialog.isSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                        Sugerir resultado
                      </button>
                      <button
                        type="button"
                        onClick={saveManualResolutionDecision}
                        disabled={manualResolutionDialog.isSaving || manualResolutionDialog.isSuggesting}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {manualResolutionDialog.isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Guardar resolución
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-background/60 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sugerencia del sistema</span>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${manualResolutionDialog.suggested_status === "won" ? "bg-emerald-500/15 text-emerald-400" : manualResolutionDialog.suggested_status === "lost" ? "bg-red-500/15 text-red-400" : manualResolutionDialog.suggested_status === "void" ? "bg-slate-500/15 text-slate-300" : "bg-yellow-500/15 text-yellow-400"}`}>
                        {manualResolutionDialog.suggested_status ? getLocalizedStatus(manualResolutionDialog.suggested_status) : "Sin calcular"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      {manualResolutionDialog.suggested_reason || "Ingresa los datos y pulsa “Sugerir resultado” para recibir una recomendación basada en reglas."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Ticket Modal */}
        {ticketModalPick && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative">
              <button 
                onClick={() => setTicketModalPick(null)} 
                className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
              <div className="scale-75 sm:scale-100 origin-top">
                <PickTicket pick={ticketModalPick} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
