import React, { useState, useEffect, useMemo } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { Trophy, PlusCircle, List, Users, Settings, LogOut, CheckCircle, XCircle, MinusCircle, Trash2, Edit, Tag, Globe, X, BarChart3, CheckCircle2, Activity, DollarSign, Search, ChevronLeft, ChevronRight, BrainCircuit, Loader2, Send, ExternalLink } from "lucide-react";
import { NORMALIZED_PICKS, getPickDisplay, getPlanName } from "../../lib/constants";
import { getLocalizedStatus } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";
import { CountryFlag } from "../../components/CountryFlag";
import { CustomSelect } from "../../components/CustomSelect";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

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

export function AdminDashboard() {
  const { token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("new-pick");
  const [picks, setPicks] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const picksPerPage = 10;
  const [pickTypes, setPickTypes] = useState<any[]>([]);
  const [markets, setMarkets] = useState<any[]>([]);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [newPromoCode, setNewPromoCode] = useState({ code: '', discount_percentage: '', max_uses: '', valid_until: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [isSubmittingPick, setIsSubmittingPick] = useState(false);
  const [isSubmittingTracking, setIsSubmittingTracking] = useState(false);
  const [trackingMessage, setTrackingMessage] = useState("");
  const [activeTrackingPickId, setActiveTrackingPickId] = useState<number | null>(null);
  const [editingPickId, setEditingPickId] = useState<number | null>(null);
  const [isSubmittingPickType, setIsSubmittingPickType] = useState(false);
  const [pickTypesMessage, setPickTypesMessage] = useState({ type: "", text: "" });

  // Form state
  const [formData, setFormData] = useState({
    match_date: "",
    country_id: "",
    league_id: "",
    match_name: "",
    pick: "",
    odds: "",
    stake: "1",
    pick_type_id: "1",
    analysis: "",
    is_parlay: false,
    selections: [] as any[]
  });

  // Market form state
  const [marketForm, setMarketForm] = useState({ id: null as number | null, label: "", acronym: "" });
  const [marketMessage, setMarketMessage] = useState({ type: "", text: "" });
  const [isSubmittingMarket, setIsSubmittingMarket] = useState(false);

  // League form state
  const [leagueForm, setLeagueForm] = useState({ id: null as number | null, name: "", country_id: "" });
  const [leagueMessage, setLeagueMessage] = useState({ type: "", text: "" });
  const [isSubmittingLeague, setIsSubmittingLeague] = useState(false);

  // Country form state
  const [countryForm, setCountryForm] = useState({ id: null as number | null, name: "", flag: "" });
  const [countryMessage, setCountryMessage] = useState({ type: "", text: "" });
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
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);
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
  const [newlyAddedMarketId, setNewlyAddedMarketId] = useState<string | null>(null);

  const filteredLeagues = useMemo(() => {
    return leagues.filter(l => 
      (!leagueCountryFilter || l.country_id?.toString() === leagueCountryFilter) && 
      (!leagueSearch || l.name.toLowerCase().includes(leagueSearch.toLowerCase()))
    );
  }, [leagues, leagueCountryFilter, leagueSearch]);

  const filteredCountries = useMemo(() => {
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
      const data = await res.json();
      setPicks(data);
    } catch (error) {
      console.error("Error fetching picks:", error);
    }
  };

  const fetchMarkets = async () => {
    try {
      const res = await fetch("/api/markets");
      const data = await res.json();
      setMarkets(data);
    } catch (error) {
      console.error("Error fetching markets:", error);
    }
  };

  const fetchLeagues = async () => {
    try {
      const res = await fetch("/api/leagues");
      const data = await res.json();
      setLeagues(data);
    } catch (error) {
      console.error("Error fetching leagues:", error);
    }
  };

  const fetchCountries = async () => {
    try {
      const res = await fetch("/api/countries");
      const data = await res.json();
      setCountries(data);
    } catch (error) {
      console.error("Error fetching countries:", error);
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
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchPromoCodes = async () => {
    try {
      const res = await fetch("/api/promo-codes", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      setPromoCodes(data);
    } catch (error) {
      console.error("Error fetching promo codes:", error);
    }
  };

  const updatePickType = async (typeId: number, data: any) => {
    setIsSubmittingPickType(true);
    setPickTypesMessage({ type: "", text: "" });
    try {
      const res = await fetch(`/api/pick-types/${typeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (res.ok) {
        setPickTypesMessage({ type: "success", text: "Configuración actualizada correctamente" });
        // Refrescamos los tipos para ver los cambios
        const typesRes = await fetch("/api/pick-types");
        const typesData = await typesRes.json();
        setPickTypes(typesData);
      } else {
        setPickTypesMessage({ type: "error", text: result.error || "Error al actualizar" });
      }
    } catch (error) {
      setPickTypesMessage({ type: "error", text: "Error de red al actualizar" });
    } finally {
      setIsSubmittingPickType(false);
      setTimeout(() => setPickTypesMessage({ type: "", text: "" }), 3000);
    }
  };

  const handleCreatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/promo-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(newPromoCode)
      });
      if (res.ok) {
        setNewPromoCode({ code: '', discount_percentage: '', max_uses: '', valid_until: '' });
        fetchPromoCodes();
        setMessage({ type: "success", text: "Código creado correctamente" });
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Error al crear código" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Error de conexión" });
    }
  };

  const handleDeletePromoCode = async (id: number) => {
    if (!window.confirm("¿Estás seguro de eliminar este código?")) return;
    try {
      const res = await fetch(`/api/promo-codes/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        fetchPromoCodes();
        setMessage({ type: "success", text: "Código eliminado" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Error al eliminar código" });
    }
  };

  const fetchPerformanceStats = async () => {
    try {
      let query = "";
      if (perfStartDate && perfEndDate) {
        query = `?startDate=${perfStartDate} 00:00:00&endDate=${perfEndDate} 23:59:59`;
      }
      const perfRes = await fetch(`/api/stats/performance${query}`);
      const perfData = await perfRes.json();
      setPerformanceStats(perfData);
    } catch (error) {
      console.error("Error fetching performance stats:", error);
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
      setRevenueStats(revData);
    } catch (error) {
      console.error("Error fetching revenue stats:", error);
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
      setAdvancedStats(advData);
    } catch (error) {
      console.error("Error fetching advanced stats:", error);
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
        setPickTypes(data);
        if (data.length > 0 && !editingPickId) {
          setFormData(prev => ({ ...prev, pick_type_id: data[0].id.toString() }));
        }
      } catch (error) {
        console.error("Error fetching pick types:", error);
      }
    };
    
    fetchPickTypes();
    fetchMarkets();
    fetchCountries();
    fetchLeagues();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    
    // Clear error message if user is typing
    if (message.type === 'error') {
      setMessage({ type: "", text: "" });
    }
    
    setFormData(prev => {
      const newData = { ...prev, [name]: type === 'checkbox' ? checked : value };
      
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

  const handleSelectChange = (name: string, value: string) => {
    // Clear error message if user is typing
    if (message.type === 'error') {
      setMessage({ type: "", text: "" });
    }
    
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addSelection = () => {
    setFormData(prev => ({
      ...prev,
      selections: [
        ...prev.selections,
        { country_id: "", league_id: "", match_name: "", match_time: "", pick: "", odds: "" }
      ]
    }));
  };

  const removeSelection = (index: number) => {
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
    
    // Clear error message if user is typing
    if (message.type === 'error') {
      setMessage({ type: "", text: "" });
    }
    
    setFormData(prev => {
      const newSelections = [...prev.selections];
      newSelections[index] = { ...newSelections[index], [name]: value };
      
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
    setMessage({ type: "success", text: editingPickId ? "Actualizando pick..." : "Creando pick..." });

    try {
      console.log("Preparing submission data...");
      const url = editingPickId ? `/api/picks/${editingPickId}` : "/api/picks";
      const method = editingPickId ? "PUT" : "POST";

      // If it's a parlay, we use the date of the first selection as the main match_date
      const submissionData = { ...formData };
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

      setMessage({ type: "success", text: editingPickId ? "¡Pick actualizado exitosamente!" : "¡Pick publicado exitosamente!" });
      
      if (!editingPickId) {
        setFormData({
          match_date: "",
          country_id: "",
          league_id: "",
          match_name: "",
          pick: "",
          odds: "",
          stake: "1",
          pick_type_id: pickTypes.length > 0 ? pickTypes[0].id.toString() : "1",
          analysis: "",
          is_parlay: false,
          selections: []
        });
      }
      
      // Background fetch
      fetchPicks();
      
      if (editingPickId) {
        setEditingPickId(null);
        setFormData({
          match_date: "",
          country_id: "",
          league_id: "",
          match_name: "",
          pick: "",
          odds: "",
          stake: "1",
          pick_type_id: pickTypes.length > 0 ? pickTypes[0].id.toString() : "1",
          analysis: "",
          is_parlay: false,
          selections: []
        });
      }
      
      // Auto-clear message after 3 seconds
      setTimeout(() => {
        setMessage(prev => prev.type === 'success' ? { type: "", text: "" } : prev);
      }, 3000);
    } catch (error: any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsSubmittingPick(false);
    }
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

    setFormData({
      match_date: localISOTime,
      country_id: countryId,
      league_id: pick.league_id ? pick.league_id.toString() : "",
      match_name: pick.match_name || "",
      pick: pick.pick ? pick.pick.toString() : "",
      odds: pick.odds ? pick.odds.toString() : "",
      stake: pick.stake ? pick.stake.toString() : "1",
      pick_type_id: pick.pick_type_id ? pick.pick_type_id.toString() : "1",
      analysis: pick.analysis || "",
      is_parlay: pick.is_parlay === 1 || pick.is_parlay === true,
      selections: parsedSelections
    });
    setEditingPickId(pick.id);
    setActiveTab("new-pick");
    setMessage({ type: "", text: "" });
  };

  const cancelEdit = () => {
    setEditingPickId(null);
    setFormData({
      match_date: "",
      country_id: "",
      league_id: "",
      match_name: "",
      pick: "",
      odds: "",
      stake: "1",
      pick_type_id: pickTypes.length > 0 ? pickTypes[0].id.toString() : "1",
      analysis: "",
      is_parlay: false,
      selections: []
    });
    setMessage({ type: "", text: "" });
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

  const verifyPickResults = async () => {
    if (selectedPicks.length === 0) {
      alert("Selecciona al menos un pick para verificar.");
      return;
    }

    if (!confirm(`¿Estás seguro de verificar los resultados de ${selectedPicks.length} picks seleccionados usando IA?`)) {
      return;
    }

    const picksToVerify = picks.filter(p => selectedPicks.includes(p.id));
    setIsVerifying(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      for (const pick of picksToVerify) {
        try {
          // Si es un parlay, necesitamos buscar los partidos individuales
          // Asumimos que el pick tiene la información necesaria o que la IA puede inferirla del match_name
          const response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: `Busca el resultado final del partido o partidos asociados al pick: "${pick.match_name}" que se jugó el ${pick.match_date}. El pronóstico fue: "${pick.pick}". Determina si el pick fue 'won', 'lost' o 'void'. Responde SOLO con un JSON con la propiedad "status" que contenga una de esas tres palabras.`,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  status: {
                    type: Type.STRING,
                    description: "El resultado del pick: 'won', 'lost', o 'void'",
                  }
                },
                required: ["status"]
              }
            },
          });
          
          const resultText = response.text?.trim() || "{}";
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
      alert("Verificación completada.");
      setSelectedPicks([]); // Limpiar selección
    } catch (error) {
      console.error("Error initializing AI client:", error);
      alert("Error al inicializar la IA. Revisa la consola.");
    } finally {
      setIsVerifying(false);
    }
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
      }
    } catch (error) {
      console.error("Error adding tracking:", error);
    } finally {
      setIsSubmittingTracking(false);
    }
  };

  const handleMarketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingMarket) return;
    
    setIsSubmittingMarket(true);
    setMarketMessage({ type: "", text: "" });
    
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
      
      setMarketMessage({ type: "success", text: "Mercado guardado exitosamente" });
      setMarketForm({ id: null, label: "", acronym: "" });
      
      // Background fetch
      fetchMarkets();
      
      // Auto-clear message after 3 seconds
      setTimeout(() => {
        setMarketMessage(prev => prev.type === 'success' ? { type: "", text: "" } : prev);
      }, 3000);
    } catch (error: any) {
      setMarketMessage({ type: "error", text: error.message });
    } finally {
      setIsSubmittingMarket(false);
    }
  };

  const editMarket = (market: any) => {
    setMarketForm({ id: market.id, label: market.label, acronym: market.acronym });
    setMarketMessage({ type: "", text: "" });
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
    setLeagueMessage({ type: "", text: "" });
    
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
      
      setLeagueMessage({ type: "success", text: "Liga guardada exitosamente" });
      setLeagueForm({ id: null, name: "", country_id: leagueCountryFilter });
      
      // Background fetch
      fetchLeagues();
      
      // Auto-clear message after 3 seconds
      setTimeout(() => {
        setLeagueMessage(prev => prev.type === 'success' ? { type: "", text: "" } : prev);
      }, 3000);
    } catch (error: any) {
      setLeagueMessage({ type: "error", text: error.message });
    } finally {
      setIsSubmittingLeague(false);
    }
  };

  const editLeague = (league: any) => {
    const countryId = league.country_id?.toString() || "";
    setLeagueForm({ id: league.id, name: league.name, country_id: countryId });
    setLeagueCountryFilter(countryId);
    setLeagueMessage({ type: "", text: "" });
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
    setCountryMessage({ type: "", text: "" });
    
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
      
      setCountryMessage({ type: "success", text: "País guardado exitosamente" });
      setCountryForm({ id: null, name: "", flag: "" });
      
      // Background fetch
      fetchCountries();
      
      // Auto-clear message after 3 seconds
      setTimeout(() => {
        setCountryMessage(prev => prev.type === 'success' ? { type: "", text: "" } : prev);
      }, 3000);
    } catch (error: any) {
      setCountryMessage({ type: "error", text: error.message });
    } finally {
      setIsSubmittingCountry(false);
    }
  };

  const editCountry = (country: any) => {
    setCountryForm({ id: country.id, name: country.name, flag: country.flag || "" });
    setCountryMessage({ type: "", text: "" });
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
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar Admin */}
      <aside className="w-full md:w-64 bg-card border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-2 text-primary">
            <Trophy className="h-6 w-6" />
            <span className="font-display text-xl font-bold">Admin Panel</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => { setActiveTab("new-pick"); if(!editingPickId) cancelEdit(); }}
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
          <div className="max-w-4xl mx-auto">
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
            
            <div className="h-12 mb-2">
              {message.text && (
                <div className={`p-4 rounded-xl ${message.type === 'success' ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-destructive/20 text-destructive border border-destructive/50'}`}>
                  {message.text}
                </div>
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
                      <CustomSelect name="country_id" value={formData.country_id} onChange={handleSelectChange} className="w-full">
                        <option value="">Seleccionar...</option>
                        {countries.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </CustomSelect>
                    </div>

                    <div className="md:col-span-6 space-y-3">
                      <label className="text-xs font-black text-primary uppercase tracking-[0.2em]">Liga / Competición</label>
                      <CustomSelect name="league_id" value={formData.league_id} onChange={handleSelectChange} required className="w-full">
                        <option value="" disabled>Seleccionar...</option>
                        {leagues
                          .filter(l => !formData.country_id || l.country_id?.toString() === formData.country_id)
                          .map(l => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </CustomSelect>
                    </div>
                    <div className="md:col-span-6 space-y-3">
                      <label className="text-xs font-black text-primary uppercase tracking-[0.2em]">Mercado / Pronóstico</label>
                      <CustomSelect name="pick" value={formData.pick} onChange={handleSelectChange} required className="w-full">
                        <option value="" disabled>Seleccionar...</option>
                        {markets.map(p => (
                          <option key={p.id} value={p.id}>{p.label} ({p.acronym})</option>
                        ))}
                      </CustomSelect>
                    </div>

                    <div className="md:col-span-12 space-y-3">
                      <label className="text-xs font-black text-primary uppercase tracking-[0.2em]">Partido (Evento)</label>
                      <input 
                        type="text" 
                        name="match_name" 
                        value={formData.match_name} 
                        onChange={handleInputChange} 
                        required 
                        placeholder="Ej: Real Madrid vs Manchester City" 
                        className="w-full bg-background border border-white/10 rounded-2xl px-5 py-4 text-lg font-bold text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-inner placeholder:font-normal placeholder:text-muted-foreground/50" 
                      />
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
                  
                  {formData.selections.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed border-white/10 rounded-2xl bg-black/20">
                      <PlusCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      No hay selecciones añadidas. Haz clic en "Añadir Selección" para empezar.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {formData.selections.map((sel, index) => (
                        <div key={index} className="relative bg-card border border-white/10 rounded-2xl p-8 shadow-xl animate-in zoom-in-95 duration-300">
                          <button 
                            type="button" 
                            onClick={() => removeSelection(index)}
                            className="absolute -top-3 -right-3 w-10 h-10 flex items-center justify-center bg-destructive text-destructive-foreground rounded-full shadow-lg hover:scale-110 transition-all z-10 border-2 border-white/20"
                          >
                            <X className="w-5 h-5" />
                          </button>

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                            {/* Row 1: Location & Time */}
                            <div className="md:col-span-4 space-y-3">
                              <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">País</label>
                              <CustomSelect 
                                name="country_id" 
                                value={sel.country_id} 
                                onChange={(name, value) => handleSelectionChange(index, { target: { name, value } } as any)} 
                                className="w-full"
                              >
                                <option value="">Seleccionar...</option>
                                {countries.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </CustomSelect>
                            </div>

                            <div className="md:col-span-4 space-y-3">
                              <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Liga / Competición</label>
                              <CustomSelect 
                                name="league_id" 
                                value={sel.league_id} 
                                onChange={(name, value) => handleSelectionChange(index, { target: { name, value } } as any)} 
                                required 
                                className="w-full"
                              >
                                <option value="" disabled>Seleccionar...</option>
                                {leagues
                                  .filter(l => !sel.country_id || l.country_id?.toString() === sel.country_id)
                                  .map(l => (
                                  <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                              </CustomSelect>
                            </div>

                            <div className="md:col-span-4 space-y-3">
                              <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Fecha y Hora</label>
                              <input 
                                type="datetime-local" 
                                name="match_time" 
                                value={sel.match_time} 
                                onChange={(e) => handleSelectionChange(index, e)} 
                                required 
                                className="w-full bg-background border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-foreground shadow-inner" 
                              />
                            </div>

                            {/* Row 2: Match, Pick & Odds */}
                            <div className="md:col-span-5 space-y-3">
                              <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Partido (Evento)</label>
                              <input 
                                type="text" 
                                name="match_name" 
                                value={sel.match_name} 
                                onChange={(e) => handleSelectionChange(index, e)} 
                                required 
                                placeholder="Ej: Real Madrid vs Manchester City" 
                                className="w-full bg-background border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all font-bold text-foreground shadow-inner placeholder:font-normal placeholder:text-muted-foreground/30" 
                              />
                            </div>

                            <div className="md:col-span-4 space-y-3">
                              <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Mercado / Pronóstico</label>
                              <CustomSelect 
                                name="pick" 
                                value={sel.pick} 
                                onChange={(name, value) => handleSelectionChange(index, { target: { name, value } } as any)} 
                                required 
                                className="w-full"
                              >
                                <option value="" disabled>Seleccionar...</option>
                                {markets.map(p => (
                                  <option key={p.id} value={p.id}>{p.label} ({p.acronym})</option>
                                ))}
                              </CustomSelect>
                            </div>

                            <div className="md:col-span-3 space-y-3">
                              <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Cuota</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  name="odds" 
                                  value={sel.odds} 
                                  onChange={(e) => handleSelectionChange(index, e)} 
                                  required 
                                  step="0.01" 
                                  placeholder="1.85" 
                                  className="w-full bg-background border border-white/10 rounded-2xl px-5 py-4 text-sm font-black text-primary focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-center shadow-inner" 
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-tighter text-primary/40 pointer-events-none">ODDS</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
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
                  <CustomSelect name="stake" value={formData.stake} onChange={handleSelectChange} className="w-full">
                    {[1,2,3,4,5,6,7,8,9,10].map(num => (
                      <option key={num} value={num}>Stake {num}</option>
                    ))}
                  </CustomSelect>
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
                <label className="text-sm font-medium text-muted-foreground">Comentario / Análisis (Opcional)</label>
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
                <select
                  value={pickFilterStatus}
                  onChange={(e) => setPickFilterStatus(e.target.value)}
                  className="bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                >
                  <option value="">Todos los estados</option>
                  <option value="pending">Pendientes</option>
                  <option value="won">Ganados</option>
                  <option value="lost">Perdidos</option>
                  <option value="void">Nulos</option>
                </select>
                <select
                  value={pickFilterType}
                  onChange={(e) => setPickFilterType(e.target.value)}
                  className="bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                >
                  <option value="">Todos los tipos</option>
                  {pickTypes.map(pt => (
                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                  ))}
                </select>
                <select
                  value={pickFilterIsParlay}
                  onChange={(e) => setPickFilterIsParlay(e.target.value)}
                  className="bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
                >
                  <option value="">Individuales y Parlays</option>
                  <option value="false">Solo Individuales</option>
                  <option value="true">Solo Parlays</option>
                </select>
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
                onClick={verifyPickResults}
                disabled={isVerifying || selectedPicks.length === 0}
                className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
              >
                {isVerifying ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <BrainCircuit size={16} />
                    Verificar Seleccionados con IA
                  </>
                )}
              </button>
            </div>

            <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary/20 border-b border-primary/30 sticky top-0 z-10 backdrop-blur-md">
                    <tr>
                      <th className="p-4 w-10">
                        <input 
                          type="checkbox" 
                          checked={paginatedPicks.length > 0 && selectedPicks.length === paginatedPicks.length}
                          onChange={handleSelectAll}
                          className="rounded border-white/20 bg-background text-primary focus:ring-primary/50"
                        />
                      </th>
                      <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Fecha</th>
                      <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Partido</th>
                      <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Pick</th>
                      <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Cuota</th>
                      <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Tipo</th>
                      <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider">Estado</th>
                      <th className="p-4 text-xs font-bold text-primary uppercase tracking-wider text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {filteredPicks.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">No hay picks que coincidan con los filtros.</td>
                      </tr>
                    ) : (
                      paginatedPicks.map((pick) => (
                        <React.Fragment key={pick.id}>
                        <tr className="hover:bg-white/5 transition-colors">
                          <td className="p-4">
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
                          <td className="p-4">{new Date(pick.match_date).toLocaleString()}</td>
                          <td className="p-4">
                            <div className="font-medium">
                              {pick.is_parlay ? `Parlay (${pick.selections?.length || 0} selecciones)` : pick.match_name}
                            </div>
                            {!pick.is_parlay && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {pick.country_flag && <CountryFlag code={pick.country_flag} />}
                                {pick.league_name || pick.league}
                              </div>
                            )}
                            {pick.is_parlay && pick.selections && (
                              <div className="mt-2 space-y-1">
                                {pick.selections.map((sel: any, idx: number) => (
                                  <div key={idx} className="text-[10px] text-muted-foreground border-l border-white/10 pl-2">
                                    <span className="font-bold text-primary/70">{sel.match_name}</span> 
                                    <span className="mx-1 opacity-50">|</span>
                                    <span className="text-[9px]">{new Date(sel.match_time).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</span>
                                    <span className="mx-1 opacity-50">|</span>
                                    {sel.market_label || sel.pick} ({sel.odds})
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-4 font-medium text-primary">
                            {pick.is_parlay ? (
                              <div className="text-xs text-muted-foreground">Combinada</div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-primary/20 text-xs font-bold">{pick.market_acronym || getPickDisplay(pick.pick).acronym}</span>
                                <span>{pick.market_label || getPickDisplay(pick.pick).label}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-4">{pick.odds}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${pick.pick_type_slug === 'free' ? 'bg-primary/20 text-primary' : 'bg-accent/20 text-accent'}`}>
                              {(pick.pick_type_name || pick.pick_type || 'FREE').toUpperCase()}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              pick.status === 'won' ? 'bg-green-500/20 text-green-500' :
                              pick.status === 'lost' ? 'bg-red-500/20 text-red-500' :
                              pick.status === 'void' ? 'bg-gray-500/20 text-gray-400' :
                              'bg-yellow-500/20 text-yellow-500'
                            }`}>
                              {getLocalizedStatus(pick.status)}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Tracking Button */}
                              <button 
                                onClick={() => setActiveTrackingPickId(activeTrackingPickId === pick.id ? null : pick.id)} 
                                className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors mr-2" 
                                title="Añadir Seguimiento"
                              >
                                <PlusCircle className="w-4 h-4" />
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
                              <button onClick={() => handleEditPick(pick)} className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors ml-2" title="Editar">
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
                            <td colSpan={7} className="p-4 border-t border-white/5">
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
                                              {new Date(t.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
                                      onClick={() => {setActiveTrackingPickId(null); setTrackingMessage("");}}
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
              <CustomSelect
                value={roleFilter}
                onChange={(_, value) => setRoleFilter(value)}
                className="flex-1 min-w-[150px]"
              >
                <option value="">Todos los roles</option>
                <option value="user">Usuario (Gratis)</option>
                <option value="vip">VIP</option>
                <option value="admin">Administrador</option>
              </CustomSelect>
              <CustomSelect
                value={planFilter}
                onChange={(_, value) => setPlanFilter(value)}
                className="flex-1 min-w-[150px]"
              >
                <option value="">Todos los planes</option>
                <option value="cuota_2">VIP Cuota 2+</option>
                <option value="cuota_3">VIP Cuota 3+</option>
                <option value="cuota_4">VIP Cuota 4+</option>
                <option value="cuota_5">VIP Cuota 5+</option>
                <option value="all_plans">Todos los Planes</option>
              </CustomSelect>
              <CustomSelect
                value={periodicityFilter}
                onChange={(_, value) => setPeriodicityFilter(value)}
                className="flex-1 min-w-[150px]"
              >
                <option value="">Todas las periodicidades</option>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </CustomSelect>
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
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              row.role === 'admin' ? 'bg-purple-500/20 text-purple-400' :
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
                                <CustomSelect 
                                  value=""
                                  onChange={(_, value) => {
                                    if (value) {
                                      updateVipStatus(row.id, parseInt(value));
                                    }
                                  }}
                                  className="w-full"
                                >
                                  <option value="">+ Añadir VIP</option>
                                  <option value="30">30 Días (Mensual)</option>
                                  <option value="90">90 Días (Trimestral)</option>
                                  <option value="180">180 Días (Semestral)</option>
                                  <option value="365">365 Días (Anual)</option>
                                </CustomSelect>
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
        )})()}
        {activeTab === "markets" && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-2">Gestionar Mercados</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Formulario de Mercados */}
              <div className="lg:col-span-1">
                <div className="bg-card p-6 rounded-2xl border border-white/10">
                  <h3 className="text-lg font-bold mb-4">{marketForm.id ? "Editar Mercado" : "Nuevo Mercado"}</h3>
                  
                  <div className="h-14 mb-2">
                    {marketMessage.text && (
                      <div className={`p-3 rounded-lg text-sm ${marketMessage.type === 'success' ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-destructive/20 text-destructive border border-destructive/50'}`}>
                        {marketMessage.text}
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleMarketSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Etiqueta (Ej: Gana Local)</label>
                      <input 
                        type="text" 
                        value={marketForm.label} 
                        onChange={(e) => {
                          setMarketForm(prev => ({ ...prev, label: e.target.value }));
                          if (marketMessage.type === 'error') setMarketMessage({ type: "", text: "" });
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
                          if (marketMessage.type === 'error') setMarketMessage({ type: "", text: "" });
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
          <div className="max-w-4xl mx-auto">
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
                  
                  <div className="h-14 mb-2">
                    {leagueMessage.text && (
                      <div className={`p-3 rounded-lg text-sm ${leagueMessage.type === 'success' ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-destructive/20 text-destructive border border-destructive/50'}`}>
                        {leagueMessage.text}
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleLeagueSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">País</label>
                      <CustomSelect 
                        value={leagueForm.country_id} 
                        onChange={(_, value) => {
                          setLeagueForm(prev => ({ ...prev, country_id: value }));
                          setLeagueCountryFilter(value);
                          if (leagueMessage.type === 'error') setLeagueMessage({ type: "", text: "" });
                        }} 
                        className="w-full"
                      >
                        <option value="">Seleccionar...</option>
                        {countries.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </CustomSelect>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Nombre de la Liga</label>
                      <input 
                        type="text" 
                        value={leagueForm.name} 
                        onChange={(e) => {
                          setLeagueForm(prev => ({ ...prev, name: e.target.value }));
                          if (leagueMessage.type === 'error') setLeagueMessage({ type: "", text: "" });
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
                    <CustomSelect 
                      value={leagueCountryFilter} 
                      onChange={(_, value) => setLeagueCountryFilter(value)}
                      className="w-full"
                    >
                      <option value="">Filtrar por país (Todos)</option>
                      {countries.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </CustomSelect>
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
                                  <CustomSelect 
                                    value={inlineLeagueCountryId} 
                                    onChange={(_, value) => setInlineLeagueCountryId(value)}
                                    onKeyDown={(e) => e.key === 'Enter' && saveInlineLeague(league.id)}
                                    className="w-full"
                                  >
                                    <option value="">(Ninguno)</option>
                                    {countries.map(c => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </CustomSelect>
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
                                <td className="p-4 text-muted-foreground">{league.country_name || '-'}</td>
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
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-2">Gestionar Países</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Formulario de Países */}
              <div className="lg:col-span-1">
                <div className="bg-card p-6 rounded-2xl border border-white/10">
                  <h3 className="text-lg font-bold mb-4">{countryForm.id ? "Editar País" : "Nuevo País"}</h3>
                  
                  <div className="h-14 mb-2">
                    {countryMessage.text && (
                      <div className={`p-3 rounded-lg text-sm ${countryMessage.type === 'success' ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-destructive/20 text-destructive border border-destructive/50'}`}>
                        {countryMessage.text}
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleCountrySubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Nombre del País</label>
                      <input 
                        type="text" 
                        value={countryForm.name} 
                        onChange={(e) => {
                          setCountryForm(prev => ({ ...prev, name: e.target.value }));
                          if (countryMessage.type === 'error') setCountryMessage({ type: "", text: "" });
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
                          if (countryMessage.type === 'error') setCountryMessage({ type: "", text: "" });
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
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-bold">Estadísticas y Rendimiento</h2>
              
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-muted-foreground">Plan:</label>
                  <CustomSelect 
                    value={selectedStatsPlan}
                    onChange={(_, value) => setSelectedStatsPlan(value)}
                    className="w-32"
                  >
                    <option value="all">Todos los Planes</option>
                    {pickTypes.map(pt => (
                      <option key={pt.id} value={pt.slug}>{pt.name}</option>
                    ))}
                  </CustomSelect>
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
                                cursor={{fill: 'rgba(255,255,255,0.05)'}}
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
                                  data={(revenueStats?.planDistribution || revenueStats?.distribucionPlanes || []).map((x) => ({count: x.count !== undefined ? Number(x.count) : Number(x.cantidad||0), plan_id: x.plan_id}))}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={100}
                                  paddingAngle={5}
                                  dataKey="count"
                                  nameKey="plan_id"
                                  label={({plan_id, percent}) => `${getPlanName(plan_id)} (${(percent * 100).toFixed(0)}%)`}
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
                            <BarChart data={(advancedStats?.byLeague || advancedStats?.porLiga || []).map((x) => ({...x, league: x.league||x.liga||""}))} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                              <XAxis type="number" tickFormatter={(value) => `${value}%`} stroke="#666" />
                              <YAxis dataKey="league" type="category" width={120} stroke="#666" tick={{fontSize: 12}} />
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
                            <BarChart data={(advancedStats?.byMarket || advancedStats?.porMercado || []).map((x) => ({...x, market: x.market||x.mercado||""}))} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                              <XAxis type="number" tickFormatter={(value) => `${value}%`} stroke="#666" />
                              <YAxis dataKey="market" type="category" width={120} stroke="#666" tick={{fontSize: 12}} />
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
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold">Gestión de Cupones</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1">
                <div className="bg-card border border-white/10 rounded-2xl p-6">
                  <h3 className="text-lg font-bold mb-6">Nuevo Cupón</h3>
                  <form onSubmit={handleCreatePromoCode} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Código</label>
                      <input
                        type="text"
                        required
                        value={newPromoCode.code}
                        onChange={(e) => setNewPromoCode({ ...newPromoCode, code: e.target.value.toUpperCase() })}
                        className="w-full bg-background border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary/50 uppercase"
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
                        placeholder="Ej: 20"
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
                        placeholder="Ej: 100"
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
                    <button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Crear Cupón
                    </button>
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
                            <td className="p-4 text-muted-foreground">
                              {promo.valid_until ? new Date(promo.valid_until).toLocaleString() : 'Nunca'}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => handleDeletePromoCode(promo.id)}
                                className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                title="Eliminar cupón"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold">Configuración de Telegram</h2>
                <p className="text-muted-foreground text-sm mt-1">Configura el canal de Telegram para cada tipo de suscripción</p>
              </div>
            </div>

            {pickTypesMessage.text && (
              <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 ${pickTypesMessage.type === 'success' ? 'bg-primary/20 text-primary border border-primary/50' : 'bg-destructive/20 text-destructive border border-destructive/50'}`}>
                {pickTypesMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {pickTypesMessage.text}
              </div>
            )}

            <div className="grid gap-6">
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
                  Cancelar
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  Confirmar
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
    </div>
  );
}
