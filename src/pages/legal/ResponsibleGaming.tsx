import React from 'react';

export function ResponsibleGaming() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Juego Responsable</h1>
      
      <div className="space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Nuestro Compromiso</h2>
          <p>
            En BetRoyale Club, promovemos las apuestas deportivas como una forma de entretenimiento y, para algunos, una inversión calculada. 
            Sin embargo, somos plenamente conscientes de los riesgos asociados con el juego y estamos comprometidos a fomentar un entorno de juego responsable.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Principios del Juego Responsable</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>El juego no es una forma garantizada de ganar dinero:</strong> Nunca veas las apuestas como una solución a problemas financieros.</li>
            <li><strong>Apuesta solo lo que puedas permitirte perder:</strong> Establece un presupuesto (bankroll) específico para apuestas y nunca uses dinero destinado a gastos esenciales (alquiler, comida, facturas).</li>
            <li><strong>No persigas las pérdidas:</strong> Si tienes una mala racha, no aumentes tus apuestas para intentar recuperar lo perdido rápidamente. Sigue tu gestión de bankroll (stake).</li>
            <li><strong>Controla tu tiempo:</strong> Las apuestas no deben interferir con tus responsabilidades diarias, trabajo, familia o vida social.</li>
            <li><strong>No apuestes bajo la influencia:</strong> Evita apostar si has consumido alcohol o drogas, o si te sientes deprimido, enojado o emocionalmente inestable.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Gestión de Bankroll (Stake)</h2>
          <p>
            Como parte de nuestro servicio, proporcionamos recomendaciones de "Stake" (nivel de confianza/inversión) para cada pronóstico. 
            Recomendamos encarecidamente a todos nuestros usuarios que sigan una gestión de bankroll estricta:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Un Stake 1 generalmente debe representar entre el 0.5% y el 1% de tu bankroll total.</li>
            <li>Nunca arriesgues una gran parte de tu bankroll en un solo evento, sin importar cuánta confianza tengas.</li>
            <li>La disciplina a largo plazo es más importante que las ganancias a corto plazo.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">Señales de Advertencia</h2>
          <p>
            Podrías estar desarrollando un problema con el juego si:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Ocultas a tu familia o amigos cuánto tiempo y dinero gastas apostando.</li>
            <li>Pides dinero prestado para apostar o para pagar deudas de juego.</li>
            <li>Sientes ansiedad, irritabilidad o depresión cuando intentas dejar de apostar.</li>
            <li>Apuestas para escapar de problemas o aliviar sentimientos de impotencia o culpa.</li>
            <li>Has intentado repetidamente controlar, reducir o detener tus apuestas sin éxito.</li>
          </ul>
        </section>

        <section className="bg-muted p-6 rounded-lg mt-8">
          <h2 className="text-xl font-semibold text-foreground mb-3">¿Necesitas Ayuda?</h2>
          <p className="mb-4">
            Si crees que tú o alguien que conoces tiene un problema con el juego, te instamos a buscar ayuda profesional inmediatamente. 
            Existen numerosas organizaciones gratuitas y confidenciales que pueden ayudarte:
          </p>
          <ul className="space-y-2">
            <li><strong>España:</strong> FEJAR (Federación Española de Jugadores de Azar Rehabilitados) - 900 200 225</li>
            <li><strong>México:</strong> Centro de Atención Ciudadana contra las Adicciones - 800 911 2000</li>
            <li><strong>Colombia:</strong> Jugadores Anónimos Colombia</li>
            <li><strong>Argentina:</strong> Jugadores Anónimos Argentina</li>
            <li><strong>Internacional:</strong> <a href="https://www.gamblersanonymous.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Gamblers Anonymous</a></li>
          </ul>
        </section>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-sm">Última actualización: {new Date().toLocaleDateString('es-ES')}</p>
        </div>
      </div>
    </div>
  );
}
