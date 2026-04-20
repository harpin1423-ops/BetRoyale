import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
      
      <div className="mt-12 text-center bg-primary/10 border border-primary/20 rounded-2xl p-8">
        <h3 className="text-xl font-bold mb-2">¿Aún tienes dudas?</h3>
        <p className="text-muted-foreground mb-6">
          Nuestro equipo de soporte está disponible para ayudarte con cualquier otra pregunta.
        </p>
        <a 
          href="mailto:soporte@betroyaleclub.com" 
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          Contactar Soporte
        </a>
      </div>
    </div>
  );
}
