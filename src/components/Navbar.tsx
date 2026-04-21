import { Link } from "react-router-dom";
// Importamos solo los iconos de navegación porque el logo visual usa el asset oficial.
import { Menu, X, User, Lock } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

// Ruta pública del logo oficial con fondo sólido para evitar transparencias no deseadas.
const BRAND_LOGO_SRC = "/icon-512.png";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-3" aria-label="BetRoyale Club">
          {/* Logo oficial de BetRoyale Club con fondo sólido. */}
          <img src={BRAND_LOGO_SRC} alt="BetRoyale Club" className="h-10 w-10 rounded-md object-cover shadow-[0_0_18px_rgba(212,175,55,0.18)]" />
          {/* Texto de marca visible para mantener legibilidad en tamaños pequeños. */}
          <span className="font-display text-xl font-bold tracking-tight">BetRoyale Club</span>
        </Link>
        
        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link to="/free-picks" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Free Picks</Link>
          <Link to="/stats" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Estadísticas</Link>
          <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Planes VIP</Link>
          {/* Enlace público de contacto para soporte comercial y operativo. */}
          <Link to="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Contacto</Link>
          
          {(user?.role === 'vip' || user?.role === 'admin') && (
            <Link to="/vip-picks" className="text-sm font-bold text-primary flex items-center gap-1 hover:text-primary/80 transition-colors">
              <Lock className="w-4 h-4" /> VIP Picks
            </Link>
          )}

          <div className="h-4 w-px bg-white/10"></div>
          
          {user ? (
            <div className="flex items-center gap-4">
              <Link to="/profile" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
                <User className="w-4 h-4" />
                Mi Perfil
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="text-sm font-medium hover:text-primary transition-colors">Admin</Link>
              )}
              <button onClick={logout} className="text-sm font-medium text-muted-foreground hover:text-red-400 transition-colors">Salir</button>
            </div>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium hover:text-primary transition-colors">Entrar</Link>
              <Link to="/pricing" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors shadow-[0_0_15px_rgba(212,175,55,0.3)]">
                Hazte VIP
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button className="md:hidden text-foreground" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Nav */}
      {isOpen && (
        <div className="md:hidden border-t border-white/10 bg-card px-4 py-4 flex flex-col gap-4">
          <Link to="/free-picks" className="text-sm font-medium text-muted-foreground hover:text-foreground">Free Picks</Link>
          <Link to="/stats" className="text-sm font-medium text-muted-foreground hover:text-foreground">Estadísticas</Link>
          <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground">Planes VIP</Link>
          {/* Enlace público de contacto disponible también en menú móvil. */}
          <Link to="/contact" className="text-sm font-medium text-muted-foreground hover:text-foreground">Contacto</Link>
          
          {(user?.role === 'vip' || user?.role === 'admin') && (
            <Link to="/vip-picks" className="text-sm font-bold text-primary flex items-center gap-2">
              <Lock className="w-4 h-4" /> VIP Picks
            </Link>
          )}

          <div className="h-px w-full bg-white/10"></div>
          
          {user ? (
            <>
              <Link to="/profile" className="text-sm font-medium flex items-center gap-2 hover:text-primary">
                <User className="w-4 h-4" /> Mi Perfil
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="text-sm font-medium hover:text-primary">Panel Admin</Link>
              )}
              <button onClick={logout} className="text-sm font-medium text-red-400 text-left">Cerrar Sesión</button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium flex items-center gap-2"><User className="h-4 w-4"/> Entrar</Link>
              <Link to="/pricing" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-semibold text-center mt-2">
                Hazte VIP
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
