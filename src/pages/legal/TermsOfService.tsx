import React from 'react';

export function TermsOfService() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Términos y Condiciones de Servicio</h1>
      
      <div className="space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. Aceptación de los Términos</h2>
          <p>
            Al acceder y utilizar la plataforma BetRoyale Club, usted acepta estar sujeto a estos Términos y Condiciones. 
            Si no está de acuerdo con alguna parte de estos términos, no debe utilizar nuestros servicios.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">2. Naturaleza del Servicio</h2>
          <p>
            BetRoyale Club es un servicio de información y análisis deportivo. Proporcionamos pronósticos, 
            estadísticas y análisis ("picks") basados en nuestra propia investigación y modelos estadísticos.
          </p>
          <p className="mt-2 font-medium text-foreground">
            IMPORTANTE: BetRoyale Club NO es una casa de apuestas. No aceptamos apuestas ni gestionamos fondos 
            destinados a apuestas. Nuestro servicio es estrictamente informativo y educativo.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">3. Riesgo y Responsabilidad</h2>
          <p>
            Las apuestas deportivas conllevan un alto nivel de riesgo. El rendimiento pasado de nuestros pronósticos 
            no garantiza resultados futuros. Usted es el único responsable de sus decisiones de inversión y apuestas.
          </p>
          <p className="mt-2">
            BetRoyale Club, sus analistas y representantes no se hacen responsables de ninguna pérdida financiera 
            que pueda resultar del uso de la información proporcionada en nuestra plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">4. Membresías y Pagos</h2>
          <p>
            El acceso a nuestros pronósticos VIP requiere una membresía activa. Los pagos se procesan de forma segura 
            a través de nuestros proveedores de pago autorizados. Las suscripciones pueden ser canceladas en cualquier 
            momento, pero no se emitirán reembolsos por períodos ya facturados, salvo lo estipulado en nuestra Política de Reembolsos.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">5. Propiedad Intelectual y Distribución</h2>
          <p>
            Toda la información, análisis y pronósticos proporcionados son propiedad exclusiva de BetRoyale Club. 
            Está estrictamente prohibida la reventa, distribución, publicación o compartición de nuestros picks VIP 
            en otros canales, grupos, redes sociales o con terceros.
          </p>
          <p className="mt-2">
            El incumplimiento de esta norma resultará en la cancelación inmediata y permanente de su cuenta sin derecho a reembolso.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">6. Edad Mínima</h2>
          <p>
            Debe tener al menos 18 años de edad (o la mayoría de edad legal en su jurisdicción) para utilizar 
            nuestros servicios. Al registrarse, usted confirma que cumple con este requisito.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">7. Modificaciones</h2>
          <p>
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor 
            inmediatamente después de su publicación en esta página. Es su responsabilidad revisar estos términos periódicamente.
          </p>
        </section>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-sm">Última actualización: {new Date().toLocaleDateString('es-ES')}</p>
        </div>
      </div>
    </div>
  );
}
