/**
 * @file server/services/ai.service.ts
 * @description Servicio para interactuar con Google Gemini AI.
 * Proporciona funcionalidades de análisis de picks y generación de comentarios.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";

/**
 * Genera un análisis profesional para un pick deportivo.
 * @param pickData Datos del pick (equipos, liga, mercado, cuota).
 * @returns Análisis generado por la IA.
 */
export async function generatePickAnalysis(pickData: {
  match_name: string;
  league_name?: string;
  pick: string;
  odds: string | number;
  is_parlay?: boolean;
  selections?: any[];
}): Promise<string> {
  // Validamos que exista la API Key configurada en el servidor
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no está configurada en las variables de entorno del servidor. Agrega GEMINI_API_KEY=tu_clave en el archivo .env.");
  }

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  // Usamos gemini-1.5-flash por su velocidad y disponibilidad en el plan gratuito
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Construimos el contexto detallado según el tipo de pick
  let context = "";
  if (pickData.is_parlay && pickData.selections && pickData.selections.length > 0) {
    // Parlay: listamos cada selección con su mercado y cuota
    context = `Este es un PARLAY (combinada) con cuota total @${pickData.odds}.\nSelecciones:\n`;
    pickData.selections.forEach((sel, i) => {
      const odds = sel.odds ? ` @${Number(sel.odds).toFixed(2)}` : "";
      const market = sel.pick_label || sel.market_label || sel.pick || "";
      context += `${i + 1}. ${sel.match_name} — ${market}${odds}\n`;
    });
  } else {
    // Pick simple: contexto completo con liga, pronóstico y cuota
    context = [
      `Partido: ${pickData.match_name}`,
      pickData.league_name ? `Liga: ${pickData.league_name}` : null,
      `Pronóstico: ${pickData.pick}`,
      `Cuota: @${pickData.odds}`,
    ].filter(Boolean).join("\n");
  }

  const prompt = `
    Eres un experto analista de apuestas deportivas para "BetRoyale Club".
    Tu tarea es generar un comentario analítico breve (máximo 280 caracteres) para el siguiente pick:
    
    ${context}
    
    Instrucciones:
    1. Sé profesional pero entusiasta.
    2. Menciona brevemente por qué el pronóstico tiene sentido (justificación técnica o estadística).
    3. Usa un lenguaje que incite a la confianza pero sin garantizar el éxito (juego responsable).
    4. Si es un parlay, resalta la combinación de eventos y la cuota total atractiva.
    5. No uses hashtags ni emojis.
    6. Responde SOLO con el texto del análisis, sin introducciones ni comillas.
    7. Idioma: Español.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    if (!text) {
      throw new Error("La IA no generó contenido. Intenta de nuevo.");
    }

    return text;
  } catch (error: any) {
    console.error("[AI Service] Error en generatePickAnalysis:", error);

    // Mensajes de error más descriptivos para facilitar diagnóstico
    if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("invalid")) {
      throw new Error("La GEMINI_API_KEY configurada no es válida. Verifica tu clave en Google AI Studio.");
    }
    if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Límite de uso de Gemini alcanzado. Espera unos minutos e intenta de nuevo.");
    }

    // Propagamos el mensaje original de error de Google para diagnóstico
    throw new Error(error.message || "Error al conectar con Gemini AI");
  }
}
