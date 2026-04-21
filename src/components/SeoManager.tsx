// Importamos useEffect para sincronizar el head del documento cuando cambia la ruta.
import { useEffect } from "react";
// Importamos useLocation para detectar la ruta actual dentro del navegador.
import { useLocation } from "react-router-dom";

// Dominio público canónico usado por buscadores.
const SITE_URL = "https://betroyaleclub.com";

// Nombre oficial de la marca para construir títulos consistentes.
const BRAND_NAME = "BetRoyale Club";

// Imagen social oficial para Open Graph y Twitter Cards.
const SOCIAL_IMAGE_URL = `${SITE_URL}/og-image.svg`;

// Tipo de configuración SEO que tendrá cada ruta pública.
type SeoRouteConfig = {
  // Título optimizado para buscadores y pestaña del navegador.
  title: string;
  // Descripción optimizada para resultados de búsqueda.
  description: string;
  // Indica si la ruta debe indexarse o mantenerse fuera de buscadores.
  robots: string;
};

// Configuración SEO principal para rutas públicas indexables y rutas privadas no indexables.
const SEO_BY_PATH: Record<string, SeoRouteConfig> = {
  // SEO de la página principal.
  "/": {
    // Título de la home con keywords principales.
    title: "BetRoyale Club | Pronósticos Deportivos Premium y Picks VIP",
    // Descripción de la home para Google y vista previa social.
    description: "Pronósticos deportivos premium, picks VIP, picks gratuitos, estadísticas transparentes y gestión de banca para apuestas deportivas.",
    // Permitimos indexación de la home.
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  },
  // SEO de picks gratuitos.
  "/free-picks": {
    // Título de la página de picks gratis.
    title: "Picks Gratis | Pronósticos Deportivos Gratuitos | BetRoyale Club",
    // Descripción de la página de picks gratis.
    description: "Accede a picks deportivos gratuitos de BetRoyale Club con cuota, stake recomendado y resultados transparentes.",
    // Permitimos indexación de picks gratuitos.
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  },
  // SEO de estadísticas.
  "/stats": {
    // Título de la página de estadísticas.
    title: "Estadísticas y Yield | Resultados Transparentes | BetRoyale Club",
    // Descripción de la página de estadísticas.
    description: "Consulta estadísticas, yield, rendimiento histórico y resultados transparentes de los pronósticos deportivos de BetRoyale Club.",
    // Permitimos indexación de estadísticas públicas.
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  },
  // SEO del historial público.
  "/historial": {
    // Título del historial de picks.
    title: "Historial de Picks | Resultados Verificados | BetRoyale Club",
    // Descripción del historial público.
    description: "Explora el historial de picks deportivos resueltos, resultados verificados y transparencia de BetRoyale Club.",
    // Permitimos indexación del historial público.
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  },
  // SEO de planes VIP.
  "/pricing": {
    // Título de planes VIP.
    title: "Planes VIP | Picks Premium por Telegram | BetRoyale Club",
    // Descripción de planes VIP.
    description: "Elige planes VIP de BetRoyale Club con picks premium, canales privados de Telegram, gestión de banca y análisis profesional.",
    // Permitimos indexación de la página comercial.
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  },
  // SEO de preguntas frecuentes.
  "/faq": {
    // Título de preguntas frecuentes.
    title: "Preguntas Frecuentes | BetRoyale Club",
    // Descripción de preguntas frecuentes.
    description: "Resuelve dudas sobre picks deportivos, planes VIP, stake, gestión de banca, Telegram y funcionamiento de BetRoyale Club.",
    // Permitimos indexación de FAQ.
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  },
  // SEO de términos legales.
  "/terms": {
    // Título de términos de servicio.
    title: "Términos de Servicio | BetRoyale Club",
    // Descripción de términos.
    description: "Consulta los términos de servicio de BetRoyale Club para el uso de la plataforma y sus planes premium.",
    // Permitimos indexación legal.
    robots: "index, follow",
  },
  // SEO de privacidad.
  "/privacy": {
    // Título de política de privacidad.
    title: "Política de Privacidad | BetRoyale Club",
    // Descripción de privacidad.
    description: "Conoce cómo BetRoyale Club protege y gestiona la información de sus usuarios.",
    // Permitimos indexación legal.
    robots: "index, follow",
  },
  // SEO de reembolsos.
  "/refunds": {
    // Título de política de reembolsos.
    title: "Política de Reembolsos | BetRoyale Club",
    // Descripción de reembolsos.
    description: "Consulta la política de reembolsos y condiciones de suscripción de BetRoyale Club.",
    // Permitimos indexación legal.
    robots: "index, follow",
  },
  // SEO de juego responsable.
  "/responsible-gaming": {
    // Título de juego responsable.
    title: "Juego Responsable | BetRoyale Club",
    // Descripción de juego responsable.
    description: "BetRoyale Club promueve el juego responsable, la gestión de banca y el control del riesgo en apuestas deportivas.",
    // Permitimos indexación de juego responsable.
    robots: "index, follow",
  },
  // Evitamos indexar login.
  "/login": {
    // Título de login.
    title: "Entrar | BetRoyale Club",
    // Descripción de login.
    description: "Accede a tu cuenta de BetRoyale Club.",
    // Bloqueamos indexación de páginas de sesión.
    robots: "noindex, nofollow",
  },
  // Evitamos indexar registro.
  "/register": {
    // Título de registro.
    title: "Crear Cuenta | BetRoyale Club",
    // Descripción de registro.
    description: "Crea tu cuenta en BetRoyale Club.",
    // Bloqueamos indexación de páginas de sesión.
    robots: "noindex, nofollow",
  },
  // Evitamos indexar retorno de pago.
  "/payment-return": {
    // Título de retorno de pago.
    title: "Estado del Pago | BetRoyale Club",
    // Descripción de retorno de pago.
    description: "Verificación del estado de pago de BetRoyale Club.",
    // Bloqueamos indexación de estados transaccionales.
    robots: "noindex, nofollow",
  },
};

/**
 * <summary>
 * Crea o actualiza una etiqueta meta del documento por nombre o propiedad.
 * </summary>
 * <param name="selector">Selector CSS usado para encontrar la etiqueta existente.</param>
 * <param name="attribute">Atributo que identifica el tipo de meta, como name o property.</param>
 * <param name="key">Valor del atributo identificador de la meta.</param>
 * <param name="content">Contenido que se escribirá en la meta.</param>
 */
function setMetaTag(selector: string, attribute: "name" | "property", key: string, content: string) {
  // Buscamos una etiqueta existente para no duplicar metadata.
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  // Creamos la etiqueta cuando no existe todavía.
  if (!element) {
    // Instanciamos un meta tag nuevo.
    element = document.createElement("meta");
    // Asignamos el identificador correspondiente.
    element.setAttribute(attribute, key);
    // Insertamos la etiqueta en el head.
    document.head.appendChild(element);
  }

  // Actualizamos el contenido SEO final.
  element.setAttribute("content", content);
}

/**
 * <summary>
 * Crea o actualiza el enlace canónico del documento para la ruta actual.
 * </summary>
 * <param name="href">URL canónica absoluta de la ruta.</param>
 */
function setCanonicalLink(href: string) {
  // Buscamos el canonical existente para evitar duplicados.
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  // Creamos el canonical si no existe.
  if (!element) {
    // Instanciamos un link tag nuevo.
    element = document.createElement("link");
    // Marcamos el link como canonical.
    element.setAttribute("rel", "canonical");
    // Insertamos el canonical en el head.
    document.head.appendChild(element);
  }

  // Actualizamos la URL canónica absoluta.
  element.setAttribute("href", href);
}

/**
 * <summary>
 * Sincroniza título, descripción, robots, Open Graph, Twitter Card y canonical por ruta.
 * </summary>
 */
export function SeoManager() {
  // Obtenemos la ruta actual del navegador.
  const location = useLocation();

  // Ejecutamos la sincronización SEO cada vez que cambia la ruta.
  useEffect(() => {
    // Normalizamos la ruta para buscar configuración SEO.
    const pathname = location.pathname || "/";

    // Obtenemos configuración específica o fallback seguro para rutas no registradas.
    const seo = SEO_BY_PATH[pathname] || {
      // Título fallback de marca.
      title: `${BRAND_NAME} | Pronósticos Deportivos Premium`,
      // Descripción fallback de marca.
      description: "Plataforma de pronósticos deportivos premium, picks VIP, picks gratuitos y estadísticas transparentes.",
      // Evitamos indexar rutas desconocidas o privadas.
      robots: "noindex, nofollow",
    };

    // Construimos canonical sin querystrings para evitar URLs duplicadas.
    const canonicalUrl = `${SITE_URL}${pathname === "/" ? "/" : pathname}`;

    // Actualizamos el título visible en la pestaña.
    document.title = seo.title;

    // Actualizamos la descripción principal.
    setMetaTag('meta[name="description"]', "name", "description", seo.description);

    // Actualizamos directivas de robots por ruta.
    setMetaTag('meta[name="robots"]', "name", "robots", seo.robots);

    // Actualizamos application-name para coherencia de marca.
    setMetaTag('meta[name="application-name"]', "name", "application-name", BRAND_NAME);

    // Actualizamos Open Graph title.
    setMetaTag('meta[property="og:title"]', "property", "og:title", seo.title);

    // Actualizamos Open Graph description.
    setMetaTag('meta[property="og:description"]', "property", "og:description", seo.description);

    // Actualizamos Open Graph URL.
    setMetaTag('meta[property="og:url"]', "property", "og:url", canonicalUrl);

    // Actualizamos Open Graph image.
    setMetaTag('meta[property="og:image"]', "property", "og:image", SOCIAL_IMAGE_URL);

    // Actualizamos Open Graph image alt.
    setMetaTag('meta[property="og:image:alt"]', "property", "og:image:alt", `${BRAND_NAME} - Pronósticos Deportivos Premium`);

    // Actualizamos Twitter title.
    setMetaTag('meta[name="twitter:title"]', "name", "twitter:title", seo.title);

    // Actualizamos Twitter description.
    setMetaTag('meta[name="twitter:description"]', "name", "twitter:description", seo.description);

    // Actualizamos Twitter image.
    setMetaTag('meta[name="twitter:image"]', "name", "twitter:image", SOCIAL_IMAGE_URL);

    // Actualizamos el canonical de la ruta actual.
    setCanonicalLink(canonicalUrl);
  }, [location.pathname]);

  // Este componente solo administra metadata y no renderiza UI visible.
  return null;
}
