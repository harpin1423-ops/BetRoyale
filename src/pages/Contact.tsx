// Importamos iconos visuales para reforzar cada vía de soporte.
import { ArrowRight, BadgeCheck, Clock, ExternalLink, Mail, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
// Importamos Link para enviar al usuario hacia páginas internas relacionadas.
import { Link } from "react-router-dom";

// Número oficial de WhatsApp usado por soporte de BetRoyale.
const WHATSAPP_NUMBER = "573150730901";
// Número visible con formato internacional para mejorar confianza.
const WHATSAPP_DISPLAY = "+57 315 073 0901";
// Correo público de soporte usado en la sección de preguntas frecuentes.
const SUPPORT_EMAIL = "soporte@betroyaleclub.com";
// Mensaje inicial prellenado para que el soporte pueda clasificar el caso más rápido.
const WHATSAPP_MESSAGE = encodeURIComponent("Hola BetRoyale Club, necesito soporte con mi cuenta, pago o acceso VIP.");
// URL final de WhatsApp con número y mensaje prellenado.
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`;
// URL final del correo con asunto profesional predefinido.
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Soporte BetRoyale Club")}`;

// Lista de temas frecuentes para orientar al usuario antes de contactarnos.
const SUPPORT_TOPICS = [
  // Tema de soporte para pagos y membresías VIP.
  "Pagos, renovaciones y activación de planes VIP",
  // Tema de soporte para accesos privados de Telegram.
  "Acceso a canales privados de Telegram",
  // Tema de soporte para cuenta y recuperación de acceso.
  "Cuenta, inicio de sesión y recuperación de contraseña",
  // Tema de soporte para dudas operativas sobre picks.
  "Dudas sobre picks, stake, bankroll y resultados",
];

// Lista de compromisos visibles de atención para dar claridad al usuario.
const SUPPORT_PROMISES = [
  // Compromiso de atención con zona horaria oficial.
  { label: "Horario base", value: "Colombia COL (GMT-5)" },
  // Compromiso de prioridad para usuarios con suscripción.
  { label: "Prioridad", value: "Usuarios VIP activos" },
  // Compromiso de seguridad para solicitudes sensibles.
  { label: "Seguridad", value: "Nunca pedimos contraseñas" },
];

/**
 * <summary>
 * Renderiza la página pública de contacto oficial de BetRoyale Club.
 * </summary>
 */
export function Contact() {
  // Renderizamos la experiencia pública de soporte con canales directos.
  return (
    // Contenedor principal con fondo consistente al resto del sitio.
    <div className="min-h-screen bg-background text-foreground">
      {/* Sección principal con mensaje claro de soporte y confianza. */}
      <section className="border-b border-white/10 px-4 py-16 md:px-6 md:py-24">
        {/* Contenedor responsive centrado. */}
        <div className="container mx-auto">
          {/* Encabezado principal sin tarjeta para mantener jerarquía limpia. */}
          <div className="mx-auto max-w-3xl text-center">
            {/* Etiqueta superior de soporte oficial. */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              {/* Icono de verificación de marca. */}
              <BadgeCheck className="h-4 w-4" />
              {/* Texto corto de contexto. */}
              Soporte oficial
            </div>
            {/* Título principal orientado a búsqueda y conversión. */}
            <h1 className="font-display text-4xl font-black tracking-tight text-white md:text-6xl">
              Contacto BetRoyale Club
            </h1>
            {/* Descripción profesional de la página. */}
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
              Atención directa para membresías VIP, pagos, acceso a Telegram, cuenta y soporte operativo de la plataforma.
            </p>
          </div>
        </div>
      </section>

      {/* Sección de canales directos de contacto. */}
      <section className="px-4 py-12 md:px-6 md:py-16">
        {/* Contenedor responsive de contenido. */}
        <div className="container mx-auto max-w-6xl">
          {/* Grilla principal con canales de atención. */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Tarjeta individual para contacto por WhatsApp. */}
            <a
              // URL segura hacia WhatsApp con mensaje prellenado.
              href={WHATSAPP_URL}
              // Abrimos WhatsApp en una pestaña nueva.
              target="_blank"
              // Protegemos la nueva pestaña contra acceso al opener.
              rel="noreferrer"
              // Estilos visuales de tarjeta accionable con acento de WhatsApp.
              className="group rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-6 transition-all hover:-translate-y-0.5 hover:border-emerald-400/60 hover:bg-emerald-400/15 md:p-8"
            >
              {/* Fila superior del canal. */}
              <div className="flex items-start justify-between gap-4">
                {/* Icono principal del canal con estilo visual de WhatsApp. */}
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_0_35px_rgba(37,211,102,0.32)] ring-4 ring-emerald-400/15">
                  {/* Icono de mensajería directa. */}
                  <MessageCircle className="h-8 w-8" />
                  {/* Punto visual para reforzar estado disponible. */}
                  <span className="absolute -right-1 -top-1 h-5 w-5 rounded-full border-2 border-background bg-emerald-200" />
                </div>
                {/* Icono de salida externa. */}
                <ExternalLink className="h-5 w-5 text-emerald-300 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              {/* Nombre del canal. */}
              <h2 className="mt-6 text-2xl font-black text-white">WhatsApp Soporte</h2>
              {/* Descripción del canal. */}
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                La vía más rápida para casos de pago, acceso VIP, canales de Telegram o soporte urgente de cuenta.
              </p>
              {/* Dato visible del contacto. */}
              <p className="mt-5 font-mono text-lg font-bold text-emerald-300">{WHATSAPP_DISPLAY}</p>
              {/* Botón textual dentro de la tarjeta. */}
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-emerald-300">
                {/* Texto de acción. */}
                Escribir por WhatsApp
                {/* Flecha de continuidad. */}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </a>

            {/* Tarjeta individual para contacto por correo. */}
            <a
              // URL mailto con asunto prellenado.
              href={SUPPORT_MAILTO}
              // Estilos visuales de tarjeta accionable secundaria.
              className="group rounded-lg border border-white/10 bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/[0.04] md:p-8"
            >
              {/* Fila superior del canal. */}
              <div className="flex items-start justify-between gap-4">
                {/* Icono principal del canal. */}
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-white/10 text-primary">
                  {/* Icono de correo electrónico. */}
                  <Mail className="h-6 w-6" />
                </div>
                {/* Icono de salida externa. */}
                <ExternalLink className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
              </div>
              {/* Nombre del canal. */}
              <h2 className="mt-6 text-2xl font-black text-white">Correo de Soporte</h2>
              {/* Descripción del canal. */}
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Ideal para solicitudes con comprobantes, detalles de transacción o casos que requieren revisión más completa.
              </p>
              {/* Dato visible del contacto. */}
              <p className="mt-5 break-all font-mono text-lg font-bold text-primary">{SUPPORT_EMAIL}</p>
              {/* Botón textual dentro de la tarjeta. */}
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary">
                {/* Texto de acción. */}
                Enviar correo
                {/* Flecha de continuidad. */}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* Sección de orientación previa al contacto. */}
      <section className="px-4 pb-16 md:px-6 md:pb-24">
        {/* Contenedor responsive de contenido inferior. */}
        <div className="container mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Panel de temas de soporte. */}
          <div className="rounded-lg border border-white/10 bg-card p-6 md:p-8">
            {/* Encabezado del panel de temas. */}
            <div className="mb-6 flex items-center gap-3">
              {/* Icono premium del panel. */}
              <Sparkles className="h-5 w-5 text-primary" />
              {/* Título del panel. */}
              <h2 className="text-xl font-black text-white">Podemos ayudarte con</h2>
            </div>
            {/* Lista responsive de temas frecuentes. */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Primer tema de soporte. */}
              <div className="rounded-md border border-white/10 bg-background/60 p-4 text-sm font-semibold text-muted-foreground">{SUPPORT_TOPICS[0]}</div>
              {/* Segundo tema de soporte. */}
              <div className="rounded-md border border-white/10 bg-background/60 p-4 text-sm font-semibold text-muted-foreground">{SUPPORT_TOPICS[1]}</div>
              {/* Tercer tema de soporte. */}
              <div className="rounded-md border border-white/10 bg-background/60 p-4 text-sm font-semibold text-muted-foreground">{SUPPORT_TOPICS[2]}</div>
              {/* Cuarto tema de soporte. */}
              <div className="rounded-md border border-white/10 bg-background/60 p-4 text-sm font-semibold text-muted-foreground">{SUPPORT_TOPICS[3]}</div>
            </div>
            {/* Nota de seguridad para proteger al usuario. */}
            <div className="mt-6 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-7 text-emerald-100">
              {/* Texto de seguridad. */}
              Por seguridad, nunca compartas tu contraseña, códigos de verificación ni datos completos de tarjetas por chat.
            </div>
          </div>

          {/* Panel de estándares de atención. */}
          <div className="rounded-lg border border-white/10 bg-card p-6 md:p-8">
            {/* Encabezado del panel de atención. */}
            <div className="mb-6 flex items-center gap-3">
              {/* Icono de reloj para tiempos de soporte. */}
              <Clock className="h-5 w-5 text-primary" />
              {/* Título del panel. */}
              <h2 className="text-xl font-black text-white">Atención y confianza</h2>
            </div>
            {/* Lista de compromisos de atención. */}
            <div className="space-y-4">
              {/* Primer compromiso visible. */}
              <div className="flex items-start gap-3 rounded-md border border-white/10 bg-background/60 p-4">
                {/* Icono de compromiso. */}
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                {/* Contenido del compromiso. */}
                <div>
                  {/* Etiqueta del compromiso. */}
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{SUPPORT_PROMISES[0].label}</p>
                  {/* Valor del compromiso. */}
                  <p className="mt-1 font-bold text-white">{SUPPORT_PROMISES[0].value}</p>
                </div>
              </div>
              {/* Segundo compromiso visible. */}
              <div className="flex items-start gap-3 rounded-md border border-white/10 bg-background/60 p-4">
                {/* Icono de compromiso. */}
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                {/* Contenido del compromiso. */}
                <div>
                  {/* Etiqueta del compromiso. */}
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{SUPPORT_PROMISES[1].label}</p>
                  {/* Valor del compromiso. */}
                  <p className="mt-1 font-bold text-white">{SUPPORT_PROMISES[1].value}</p>
                </div>
              </div>
              {/* Tercer compromiso visible. */}
              <div className="flex items-start gap-3 rounded-md border border-white/10 bg-background/60 p-4">
                {/* Icono de compromiso. */}
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                {/* Contenido del compromiso. */}
                <div>
                  {/* Etiqueta del compromiso. */}
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{SUPPORT_PROMISES[2].label}</p>
                  {/* Valor del compromiso. */}
                  <p className="mt-1 font-bold text-white">{SUPPORT_PROMISES[2].value}</p>
                </div>
              </div>
            </div>
            {/* Enlace secundario hacia preguntas frecuentes. */}
            <Link
              // Ruta interna de preguntas frecuentes.
              to="/faq"
              // Estilos del enlace secundario.
              className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80"
            >
              {/* Texto del enlace secundario. */}
              Ver preguntas frecuentes
              {/* Flecha de continuidad. */}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
