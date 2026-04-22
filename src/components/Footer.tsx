import { Link } from "react-router-dom";

// Usamos el logo transparente recortado en círculo de alta calidad.
const BRAND_LOGO_SRC = "/logo_final_80.png";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-card py-12">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-3" aria-label="BetRoyale Club">
              {/* Técnica de zoom circular premium aplicada para consistencia con los tickets. */}
              <div className="flex items-center justify-center overflow-hidden rounded-full shrink-0 shadow-[0_0_18px_rgba(212,175,55,0.16)]" style={{ width: 44, height: 44 }}>
                <img src={BRAND_LOGO_SRC} alt="BetRoyale Club" style={{ width: "160%", height: "160%", maxWidth: "none", maxHeight: "none", flexShrink: 0, objectFit: "contain", imageRendering: "high-quality" }} />
              </div>
              {/* Texto de marca junto al logo para lectura clara. */}
              <span className="font-display text-xl font-bold tracking-tight">BetRoyale Club</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Exclusividad, análisis y precisión. Plataforma premium de pronósticos deportivos con transparencia total y rentabilidad demostrada.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Plataforma</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/free-picks" className="hover:text-primary transition-colors">Picks Gratuitos</Link></li>
              <li><Link to="/stats" className="hover:text-primary transition-colors">Estadísticas y Yield</Link></li>
              <li><Link to="/pricing" className="hover:text-primary transition-colors">Membresías VIP</Link></li>
              <li><Link to="/login" className="hover:text-primary transition-colors">Panel de Usuario</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Soporte</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/faq" className="hover:text-primary transition-colors">Preguntas Frecuentes</Link></li>
              <li><Link to="/contact" className="hover:text-primary transition-colors">Contacto</Link></li>
              <li><a href="#" className="hover:text-primary transition-colors">Canal de Telegram</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/terms" className="hover:text-primary transition-colors">Términos y Condiciones</Link></li>
              <li><Link to="/privacy" className="hover:text-primary transition-colors">Política de Privacidad</Link></li>
              <li><Link to="/refunds" className="hover:text-primary transition-colors">Política de Reembolsos</Link></li>
              <li><Link to="/responsible-gaming" className="hover:text-primary transition-colors">Juego Responsable</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-white/10 text-center space-y-4">
          <p className="text-xs text-muted-foreground">
            Aviso de responsabilidad: Las apuestas deportivas conllevan un alto nivel de riesgo y pueden no ser adecuadas para todos los inversores. El rendimiento pasado no garantiza resultados futuros. Solo para mayores de 18 años. Juega con responsabilidad.
          </p>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} BetRoyale Club. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
