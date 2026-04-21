import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
// Importamos el gestor SEO para sincronizar títulos y metadatos por ruta.
import { SeoManager } from "./components/SeoManager";
import { Home } from "./pages/Home";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { FreePicks } from "./pages/FreePicks";
import { Stats } from "./pages/Stats";
import { Pricing } from "./pages/Pricing";
import { VipPicks } from "./pages/VipPicks";
import Login from "./pages/Login";
import Register from "./pages/Register";
// Importamos la página pública para crear una nueva contraseña desde email.
import ResetPassword from "./pages/ResetPassword";
import { TermsOfService } from "./pages/legal/TermsOfService";
import { PrivacyPolicy } from "./pages/legal/PrivacyPolicy";
import { RefundPolicy } from "./pages/legal/RefundPolicy";
import { ResponsibleGaming } from "./pages/legal/ResponsibleGaming";
import { FAQ } from "./pages/FAQ";
// Importamos la página pública de contacto para soporte oficial.
import { Contact } from "./pages/Contact";
import Profile from "./pages/Profile";
import PaymentReturn from "./pages/PaymentReturn";
import { HistorialPicks } from "./pages/HistorialPicks";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AlertCircle } from "lucide-react";
import { Toaster } from "sonner";

// Placeholder components for routing
const Placeholder = ({ title }: { title: string }) => (
  <div className="flex-1 flex items-center justify-center py-32">
    <div className="text-center">
      <h1 className="text-4xl font-bold mb-4">{title}</h1>
      <p className="text-muted-foreground">Esta página está en construcción según el Roadmap (Fase 1).</p>
    </div>
  </div>
);

// Layout for public pages (with Navbar and Footer)
const PublicLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col bg-background text-foreground relative selection:bg-primary/30">
    <div className="relative z-10 flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  </div>
);

const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string }) => {
  const { user, loading, token } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 animate-pulse">Cargando tu sesión...</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 text-sm text-primary hover:underline"
        >
          ¿Tarda demasiado? Reintentar
        </button>
      </div>
    );
  }

  if (!user) {
    // If we have a token but no user, it means the auth check failed but we haven't cleared the token yet
    if (token) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Sesión no verificada</h2>
          <p className="text-gray-400 max-w-md mb-8">
            No pudimos verificar tu identidad. Esto puede ocurrir si cambiaste de entorno o si la sesión expiró.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors"
            >
              Reintentar
            </button>
            <button 
              onClick={() => {
                localStorage.removeItem('token');
                window.location.href = '/login';
              }}
              className="px-8 py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-colors"
            >
              Ir al Login
            </button>
          </div>
        </div>
      );
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Sincroniza title, description, robots y canonical según la ruta actual. */}
        <SeoManager />
        <Toaster richColors position="top-right" />
        <Routes>
          {/* Admin Route (No Navbar/Footer) */}
          <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminDashboard /></ProtectedRoute>} />

          {/* Public Routes */}
          <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
          <Route path="/free-picks" element={<PublicLayout><FreePicks /></PublicLayout>} />
          <Route path="/stats" element={<PublicLayout><Stats /></PublicLayout>} />
          {/* Historial de picks: nueva página de resultados pasados */}
          <Route path="/historial" element={<PublicLayout><HistorialPicks /></PublicLayout>} />
          <Route path="/pricing" element={<PublicLayout><Pricing /></PublicLayout>} />
          <Route path="/faq" element={<PublicLayout><FAQ /></PublicLayout>} />
          {/* Ruta pública para contacto oficial por WhatsApp y correo. */}
          <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />
          <Route path="/terms" element={<PublicLayout><TermsOfService /></PublicLayout>} />
          <Route path="/privacy" element={<PublicLayout><PrivacyPolicy /></PublicLayout>} />
          <Route path="/refunds" element={<PublicLayout><RefundPolicy /></PublicLayout>} />
          <Route path="/responsible-gaming" element={<PublicLayout><ResponsibleGaming /></PublicLayout>} />
          <Route path="/login" element={<PublicLayout><Login /></PublicLayout>} />
          <Route path="/register" element={<PublicLayout><Register /></PublicLayout>} />
          {/* Ruta pública usada por el enlace seguro de recuperación de contraseña */}
          <Route path="/reset-password" element={<PublicLayout><ResetPassword /></PublicLayout>} />
          
          {/* Protected Routes */}
          <Route path="/profile" element={<ProtectedRoute><PublicLayout><Profile /></PublicLayout></ProtectedRoute>} />
          <Route path="/payment-return" element={<PublicLayout><PaymentReturn /></PublicLayout>} />
          <Route path="/vip-picks" element={<ProtectedRoute requiredRole="vip"><PublicLayout><VipPicks /></PublicLayout></ProtectedRoute>} />
          
          <Route path="*" element={<PublicLayout><Placeholder title="404 - Página no encontrada" /></PublicLayout>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
