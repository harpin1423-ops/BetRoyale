import React from 'react';

export function PrivacyPolicy() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Política de Privacidad</h1>
      
      <div className="space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">1. Información que Recopilamos</h2>
          <p>
            En BetRoyale Club, recopilamos diferentes tipos de información para proporcionar y mejorar nuestros servicios:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Información de la cuenta:</strong> Nombre, dirección de correo electrónico y contraseña cuando te registras.</li>
            <li><strong>Información de pago:</strong> Datos procesados de forma segura por nuestros proveedores de pago (Mercado Pago, etc.). Nosotros no almacenamos los datos completos de tu tarjeta de crédito.</li>
            <li><strong>Datos de uso:</strong> Información sobre cómo interactúas con nuestra plataforma, qué pronósticos visitas y tu historial de navegación en nuestro sitio.</li>
            <li><strong>Comunicaciones:</strong> Registros de tus interacciones con nuestro equipo de soporte.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">2. Uso de la Información</h2>
          <p>
            Utilizamos la información recopilada para los siguientes propósitos:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Proporcionar, mantener y mejorar nuestros servicios de pronósticos deportivos.</li>
            <li>Procesar tus transacciones y gestionar tu membresía VIP.</li>
            <li>Enviarte notificaciones importantes sobre tu cuenta, nuevos picks o cambios en nuestros servicios.</li>
            <li>Responder a tus comentarios, preguntas y solicitudes de soporte al cliente.</li>
            <li>Detectar, prevenir y abordar problemas técnicos o actividades fraudulentas.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">3. Compartir tu Información</h2>
          <p>
            No vendemos, comercializamos ni alquilamos tu información personal a terceros. Solo compartimos información en las siguientes circunstancias:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Proveedores de servicios:</strong> Con empresas que nos ayudan a operar nuestro negocio (procesadores de pago, servicios de correo electrónico, análisis web).</li>
            <li><strong>Cumplimiento legal:</strong> Cuando sea requerido por ley o para proteger nuestros derechos legales.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">4. Seguridad de los Datos</h2>
          <p>
            Implementamos medidas de seguridad técnicas y organizativas diseñadas para proteger tu información personal contra acceso no autorizado, alteración, divulgación o destrucción. Sin embargo, ningún método de transmisión por Internet es 100% seguro.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">5. Tus Derechos</h2>
          <p>
            Tienes derecho a acceder, corregir, actualizar o solicitar la eliminación de tu información personal. Puedes gestionar la mayor parte de esta información directamente desde tu panel de usuario o contactando a nuestro equipo de soporte.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground mb-3">6. Cookies</h2>
          <p>
            Utilizamos cookies y tecnologías de seguimiento similares para rastrear la actividad en nuestro servicio y mantener cierta información. Puedes configurar tu navegador para rechazar todas las cookies o para indicar cuándo se envía una cookie.
          </p>
        </section>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-sm">Última actualización: {new Date().toLocaleDateString('es-ES')}</p>
        </div>
      </div>
    </div>
  );
}
