// Importamos React y useState para manejar el acordeón de preguntas frecuentes.
import React, { useState } from 'react';
// Importamos iconos para acordeón, WhatsApp, correo y acciones.
import { ArrowRight, ChevronDown, ChevronUp, Mail, MessageCircle } from 'lucide-react';

// Número oficial de WhatsApp usado por soporte inmediato.
const WHATSAPP_NUMBER = "573150730901";
// Número visible en formato internacional para soporte.
const WHATSAPP_DISPLAY = "+57 315 073 0901";
// Correo oficial de soporte para casos que requieren más detalle.
const SUPPORT_EMAIL = "soporte@betroyaleclub.com";
// Mensaje prellenado para acelerar la atención desde preguntas frecuentes.
const WHATSAPP_MESSAGE = encodeURIComponent("Hola BetRoyale Club, tengo una duda y necesito soporte inmediato.");
// URL final de WhatsApp para contacto directo.
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;
// URL final de correo con asunto predefinido.
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Soporte BetRoyale Club")}`;

const faqs = [
  {
    question: "¿Qué es un 'Stake' y cómo funciona?",
    answer: "El 'Stake' es el nivel de confianza que le asignamos a un pronóstico y, al mismo tiempo, el porcentaje de tu bankroll (capital total destinado a apuestas) que te recomendamos invertir. En BetRoyale Club utilizamos una escala conservadora donde:\n\n• Stake 1 = 1% de tu bankroll\n• Stake 2 = 2% de tu bankroll\n• Stake 3 = 3% de tu bankroll\n\nPor ejemplo, si tu bankroll total es de $1,000 y enviamos un pick con Stake 2, deberías apostar $20. Nunca recomendamos apostar más del 3-5% en un solo evento para garantizar la rentabilidad a largo plazo y proteger tu capital."
  },
  {
    question: "¿Qué es el 'Bankroll'?",
    answer: "El bankroll es la cantidad total de dinero que has decidido destinar exclusivamente para las apuestas deportivas. Este dinero debe ser una cantidad que puedas permitirte perder sin que afecte tu vida personal o finanzas diarias. Una buena gestión de bankroll es el secreto número uno de los apostadores rentables."
  },
  {
    question: "¿Cómo recibo los pronósticos VIP?",
    answer: "Una vez que adquieres una membresía VIP, tendrás acceso inmediato a la sección 'Picks VIP' dentro de nuestra plataforma. También podrás ver el historial completo, las cuotas recomendadas y el análisis de cada pronóstico directamente en tu panel de usuario."
  },
  {
    question: "¿Garantizan ganancias o aciertos?",
    answer: "No. Ningún servicio profesional y honesto puede garantizar ganancias en las apuestas deportivas, ya que el deporte es impredecible. Lo que sí garantizamos es un trabajo analítico exhaustivo, transparencia total en nuestras estadísticas (todas verificables) y una gestión de riesgo profesional diseñada para buscar rentabilidad a largo plazo."
  },
  {
    question: "¿En qué deportes y mercados se especializan?",
    answer: "Nos enfocamos única y exclusivamente en el Fútbol. Al concentrar todo nuestro análisis y recursos en un solo deporte, logramos una ventaja estadística y un conocimiento mucho más profundo de las principales ligas (Champions League, Premier League, La Liga, Serie A, etc.) y mercados específicos. Buscamos valor en las cuotas donde las casas de apuestas suelen cometer errores."
  },
  {
    question: "¿Qué significa que un pick sea 'Void' o Nulo?",
    answer: "Un pick 'Void' (Nulo) significa que la apuesta se cancela y la casa de apuestas te devuelve el dinero apostado. Esto suele ocurrir en mercados como 'Empate Apuesta No Válida' (Draw No Bet) si el partido termina en empate, o en líneas de hándicap asiático enteras (ej. -1, +2) cuando el resultado coincide exactamente con la línea."
  },
  {
    question: "¿Puedo cancelar mi membresía en cualquier momento?",
    answer: "Sí, puedes cancelar la renovación automática de tu membresía VIP en cualquier momento desde la configuración de tu perfil. Seguirás teniendo acceso a los picks VIP hasta que finalice el período que ya has pagado."
  },
  {
    question: "¿Qué casas de apuestas recomiendan usar?",
    answer: "Recomendamos tener cuentas en al menos 2 o 3 casas de apuestas diferentes para poder comparar y elegir siempre la mejor cuota disponible. A nivel internacional, recomendamos casas sólidas y reconocidas como Betano, BWin, Betsson y Bet365. Adicionalmente, te sugerimos verificar qué casas de apuestas están reguladas y operan legalmente en tu país para asegurar retiros rápidos y sin problemas."
  }
];

/**
 * <summary>
 * Renderiza la página de preguntas frecuentes con soporte inmediato al final.
 * </summary>
 */
export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Preguntas Frecuentes</h1>
        <p className="text-muted-foreground text-lg">
          Resolvemos tus dudas sobre nuestro servicio, gestión de banca y apuestas deportivas.
        </p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <div 
            key={index} 
            className="border border-white/10 bg-card rounded-xl overflow-hidden transition-all duration-200"
          >
            <button
              className="w-full px-6 py-5 text-left flex justify-between items-center focus:outline-none"
              onClick={() => toggleFaq(index)}
            >
              <span className="font-semibold text-lg pr-8">{faq.question}</span>
              {openIndex === index ? (
                <ChevronUp className="text-primary flex-shrink-0" size={20} />
              ) : (
                <ChevronDown className="text-muted-foreground flex-shrink-0" size={20} />
              )}
            </button>
            
            <div 
              className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${
                openIndex === index ? "max-h-96 pb-5 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="text-muted-foreground whitespace-pre-line">
                {faq.answer}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Bloque final de soporte inmediato con WhatsApp como canal principal. */}
      <div className="mt-12 overflow-hidden rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-6 text-center md:p-8">
        {/* Icono visual de WhatsApp con color reconocible. */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_0_35px_rgba(37,211,102,0.28)] ring-4 ring-emerald-400/15">
          {/* Icono de conversación directa para representar WhatsApp. */}
          <MessageCircle className="h-8 w-8" />
        </div>
        {/* Título de soporte inmediato. */}
        <h3 className="text-xl font-black text-white">¿Aún tienes dudas?</h3>
        {/* Texto de orientación para elegir el canal correcto. */}
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
          Escríbenos por WhatsApp para soporte inmediato sobre pagos, membresías VIP, acceso a Telegram o problemas con tu cuenta.
        </p>
        {/* Número visible para reforzar confianza. */}
        <p className="mt-4 font-mono text-sm font-bold text-emerald-300">{WHATSAPP_DISPLAY}</p>
        {/* Acciones principales del bloque de soporte. */}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {/* Botón principal hacia WhatsApp. */}
          <a
            // URL directa con mensaje prellenado.
            href={WHATSAPP_URL}
            // Abrimos WhatsApp en una pestaña nueva.
            target="_blank"
            // Protegemos la nueva pestaña.
            rel="noreferrer"
            // Estilos del botón principal de soporte inmediato.
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#25D366] px-6 py-3 text-sm font-black text-white transition-colors hover:bg-[#1fb85a]"
          >
            {/* Icono del botón principal. */}
            <MessageCircle className="h-5 w-5" />
            {/* Texto del botón principal. */}
            Soporte inmediato por WhatsApp
            {/* Flecha visual de acción. */}
            <ArrowRight className="h-4 w-4" />
          </a>
          {/* Botón secundario hacia correo. */}
          <a
            // URL mailto con asunto.
            href={SUPPORT_MAILTO}
            // Estilos del botón secundario.
            className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-white transition-colors hover:border-primary/40 hover:bg-white/10"
          >
            {/* Icono de correo para alternativa de soporte. */}
            <Mail className="h-5 w-5 text-primary" />
            {/* Texto del botón secundario. */}
            Enviar correo
          </a>
        </div>
      </div>
    </div>
  );
}
