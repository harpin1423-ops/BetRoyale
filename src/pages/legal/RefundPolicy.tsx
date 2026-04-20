import React from 'react';

export function RefundPolicy() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Política de Reembolsos</h1>
      
      <div className="space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. Naturaleza de los Servicios Digitales</h2>
          <p>
            BetRoyale Club proporciona acceso inmediato a información digital, análisis y pronósticos deportivos (picks). 
            Debido a la naturaleza digital e intangible de nuestros servicios, y al hecho de que la información no puede ser "devuelta" una vez vista, 
            nuestra política de reembolsos es estricta.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">2. Política General de No Reembolso</h2>
          <p>
            Como regla general, <strong>todas las ventas son definitivas y no se emitirán reembolsos</strong> por las suscripciones VIP 
            una vez que el pago haya sido procesado y el acceso a la plataforma haya sido otorgado.
          </p>
          <p className="mt-2">
            No ofrecemos reembolsos basados en:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>El rendimiento de los pronósticos (ganancias o pérdidas).</li>
            <li>Falta de uso de la plataforma durante el período de suscripción.</li>
            <li>Cambio de opinión después de la compra.</li>
            <li>Desacuerdo con las cuotas o líneas disponibles en su casa de apuestas local.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">3. Cancelación de Suscripciones</h2>
          <p>
            Puedes cancelar la renovación automática de tu suscripción en cualquier momento desde tu panel de usuario. 
            La cancelación evitará futuros cargos, pero mantendrás el acceso a los servicios VIP hasta el final de tu período de facturación actual.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">4. Excepciones</h2>
          <p>
            Solo consideraremos solicitudes de reembolso en circunstancias excepcionales, tales como:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Cargos duplicados accidentales por el mismo período de suscripción.</li>
            <li>Fallo técnico prolongado de nuestra plataforma que impida el acceso a los servicios por más de 48 horas consecutivas.</li>
          </ul>
          <p className="mt-2">
            Cualquier solicitud de excepción debe enviarse a nuestro equipo de soporte dentro de los 7 días posteriores al cargo.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">5. Suspensión de Cuenta</h2>
          <p>
            Si tu cuenta es suspendida o cancelada por violar nuestros Términos de Servicio (por ejemplo, por compartir picks VIP con terceros), 
            perderás inmediatamente el acceso a la plataforma y no tendrás derecho a ningún reembolso por el tiempo restante de tu suscripción.
          </p>
        </section>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-sm">Última actualización: {new Date().toLocaleDateString('es-ES')}</p>
        </div>
      </div>
    </div>
  );
}
