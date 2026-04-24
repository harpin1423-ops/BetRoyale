/**
 * @file server/services/ai.service.ts
 * @description Servicio multi-proveedor para generación de análisis de picks con IA.
 * Soporta Gemini, Groq y OpenAI con auto-fallback automático:
 * si un proveedor falla por límite de cuota, intenta el siguiente disponible.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { env } from "../config/env.js";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type AIProvider = "gemini" | "groq" | "openai" | "deepseek" | "auto";

export interface PickAnalysisInput {
  match_name: string;
  league_name?: string;
  pick: string;
  odds: string | number;
  is_parlay?: boolean;
  selections?: any[];
  /** Proveedor preferido. "auto" intentará en orden: Gemini → Groq → OpenAI */
  provider?: AIProvider;
}

export interface PickAnalysisResult {
  analysis: string;
  /** Proveedor que generó el análisis exitosamente */
  usedProvider: AIProvider;
}

// ─── Lista de proveedores disponibles ────────────────────────────────────────
// El orden define la prioridad de fallback automático
// Gemini → Groq → DeepSeek → OpenAI
const PROVIDER_ORDER: AIProvider[] = ["gemini", "groq", "deepseek", "openai"];

/** Devuelve true si el proveedor tiene API key configurada */
function isProviderAvailable(provider: AIProvider): boolean {
  switch (provider) {
    case "gemini":   return Boolean(env.GEMINI_API_KEY);
    case "groq":     return Boolean(env.GROQ_API_KEY);
    case "deepseek": return Boolean(env.DEEPSEEK_API_KEY);
    case "openai":   return Boolean(env.OPENAI_API_KEY);
    default: return false;
  }
}

/** Devuelve el nombre legible del proveedor para toasts/logs */
export function getProviderLabel(provider: AIProvider): string {
  switch (provider) {
    case "gemini":   return "Google Gemini";
    case "groq":     return "Groq (Llama 3)";
    case "deepseek": return "DeepSeek V3";
    case "openai":   return "OpenAI (GPT-4o-mini)";
    default: return "IA";
  }
}

// ─── Construcción del contexto del prompt ────────────────────────────────────

function buildPromptContext(pickData: PickAnalysisInput): string {
  if (pickData.is_parlay && pickData.selections && pickData.selections.length > 0) {
    let context = `PARLAY (combinada) con cuota total @${pickData.odds}.\nSelecciones:\n`;
    pickData.selections.forEach((sel, i) => {
      const odds = sel.odds ? ` @${Number(sel.odds).toFixed(2)}` : "";
      const market = sel.pick_label || sel.market_label || sel.pick || "";
      context += `${i + 1}. ${sel.match_name} — ${market}${odds}\n`;
    });
    return context;
  }

  return [
    `Partido: ${pickData.match_name}`,
    pickData.league_name ? `Liga: ${pickData.league_name}` : null,
    `Pronóstico: ${pickData.pick}`,
    `Cuota: @${pickData.odds}`,
  ].filter(Boolean).join("\n");
}

function buildSystemPrompt(context: string): string {
  return `Eres un experto analista de apuestas deportivas para "BetRoyale Club".
Tu tarea es generar un comentario analítico breve (máximo 280 caracteres) para el siguiente pick:

${context}

Instrucciones:
1. Sé profesional pero entusiasta.
2. Menciona brevemente por qué el pronóstico tiene sentido (justificación técnica o estadística).
3. Usa un lenguaje que incite a la confianza pero sin garantizar el éxito (juego responsable).
4. Si es un parlay, resalta la combinación de eventos y la cuota total atractiva.
5. No uses hashtags ni emojis.
6. Responde SOLO con el texto del análisis, sin introducciones ni comillas.
7. Idioma: Español.`;
}

// ─── Generadores por proveedor ───────────────────────────────────────────────

/** Genera análisis usando Google Gemini */
async function generateWithGemini(prompt: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  // gemini-2.0-flash — compatible con SDK @google/generative-ai v0.21
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/** Genera análisis usando Groq (API compatible con OpenAI, plan gratuito generoso) */
async function generateWithGroq(prompt: string): Promise<string> {
  const groq = new OpenAI({
    apiKey: env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 150,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

/** Genera análisis usando DeepSeek (API compatible con OpenAI, calidad GPT-4) */
async function generateWithDeepSeek(prompt: string): Promise<string> {
  const deepseek = new OpenAI({
    apiKey: env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/v1",
  });

  const response = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 150,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

/** Genera análisis usando OpenAI GPT-4o-mini */
async function generateWithOpenAI(prompt: string): Promise<string> {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 150,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

/** Ejecuta el generador del proveedor indicado */
async function callProvider(provider: AIProvider, prompt: string): Promise<string> {
  switch (provider) {
    case "gemini":   return generateWithGemini(prompt);
    case "groq":     return generateWithGroq(prompt);
    case "deepseek": return generateWithDeepSeek(prompt);
    case "openai":   return generateWithOpenAI(prompt);
    default: throw new Error(`Proveedor desconocido: ${provider}`);
  }
}

/** Determina si un error es de cuota/rate-limit (para activar el fallback) */
function isRateLimitError(error: any): boolean {
  const msg = (error?.message || "").toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("rate") ||
    msg.includes("resource_exhausted") ||
    msg.includes("429") ||
    msg.includes("too many requests") ||
    error?.status === 429
  );
}

// ─── Función principal ───────────────────────────────────────────────────────

/**
 * Genera un análisis profesional para un pick deportivo.
 * Si provider = "auto", intenta en orden Gemini → Groq → OpenAI hasta que uno responda.
 * Si se especifica un proveedor, lo usa directamente sin fallback.
 */
export async function generatePickAnalysis(
  pickData: PickAnalysisInput
): Promise<PickAnalysisResult> {
  const context = buildPromptContext(pickData);
  const prompt = buildSystemPrompt(context);
  const requestedProvider = pickData.provider || "auto";

  // ── Proveedor específico solicitado (sin fallback) ──────────────────────
  if (requestedProvider !== "auto") {
    if (!isProviderAvailable(requestedProvider)) {
      throw new Error(
        `El proveedor "${getProviderLabel(requestedProvider)}" no tiene API key configurada en el servidor.`
      );
    }
    const text = await callProvider(requestedProvider, prompt);
    if (!text) throw new Error("La IA no generó contenido. Intenta de nuevo.");
    return { analysis: text, usedProvider: requestedProvider };
  }

  // ── Modo automático: intenta cada proveedor disponible en orden ─────────
  const availableProviders = PROVIDER_ORDER.filter(isProviderAvailable);

  if (availableProviders.length === 0) {
    throw new Error(
      "No hay proveedores de IA configurados. Agrega al menos una de estas variables en el .env: GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY"
    );
  }

  const errors: string[] = [];

  for (const provider of availableProviders) {
    try {
      console.log(`[AI] Intentando con proveedor: ${getProviderLabel(provider)}`);
      const text = await callProvider(provider, prompt);

      if (!text) {
        errors.push(`${getProviderLabel(provider)}: respuesta vacía`);
        continue;
      }

      console.log(`[AI] Análisis generado exitosamente con ${getProviderLabel(provider)}`);
      return { analysis: text, usedProvider: provider };
    } catch (error: any) {
      const msg = error?.message || "Error desconocido";
      console.warn(`[AI] Fallo con ${getProviderLabel(provider)}: ${msg}`);

      if (isRateLimitError(error)) {
        errors.push(`${getProviderLabel(provider)}: límite de cuota alcanzado`);
        // Continúa al siguiente proveedor
        continue;
      }

      // Error no relacionado con cuota (clave inválida, etc.) — detiene el fallback
      errors.push(`${getProviderLabel(provider)}: ${msg}`);
      throw new Error(msg);
    }
  }

  // Todos los proveedores fallaron por límite de cuota
  throw new Error(
    `Todos los proveedores de IA alcanzaron su límite de uso:\n${errors.join("\n")}\n\nEspera unos minutos o configura más proveedores.`
  );
}
