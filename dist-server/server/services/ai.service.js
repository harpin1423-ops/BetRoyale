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
export async function generatePickAnalysis(pickData) {
    if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY no configurada en el servidor.");
    }
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Usamos flash para velocidad y costo
    let context = "";
    if (pickData.is_parlay && pickData.selections) {
        context = `Este es un Parlay (combinada) con las siguientes selecciones:\n`;
        pickData.selections.forEach((sel, i) => {
            context += `${i + 1}. ${sel.match_name} - Pronóstico: ${sel.pick_label || sel.pick}\n`;
        });
    }
    else {
        context = `Partido: ${pickData.match_name}\nLiga: ${pickData.league_name || 'Desconocida'}\nPronóstico: ${pickData.pick}\nCuota: ${pickData.odds}`;
    }
    const prompt = `
    Eres un experto analista de apuestas deportivas para "BetRoyale Club".
    Tu tarea es generar un comentario analítico breve (máximo 280 caracteres) para el siguiente pick:
    
    ${context}
    
    Instrucciones:
    1. Sé profesional pero entusiasta.
    2. Menciona brevemente por qué el pronóstico tiene sentido (justificación técnica).
    3. Usa un lenguaje que incite a la confianza pero sin garantizar el éxito (juego responsable).
    4. Si es un parlay, resalta la combinación de eventos.
    5. No uses hashtags.
    6. Responde SOLO con el texto del análisis.
    7. Idioma: Español.
  `;
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    }
    catch (error) {
        console.error("Error en generatePickAnalysis:", error);
        throw new Error("No se pudo generar el análisis con IA.");
    }
}
