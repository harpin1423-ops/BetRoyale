import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Lock, Mail } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Define el modo visible del formulario de acceso.
 */
type LoginMode = 'login' | 'forgot';

export default function Login() {
  // Guardamos el modo actual para alternar login y recuperación.
  const [mode, setMode] = useState<LoginMode>('login');
  // Guardamos el email usado tanto para login como para recuperación.
  const [email, setEmail] = useState('');
  // Guardamos la contraseña solo para el modo login.
  const [password, setPassword] = useState('');
  // Guardamos errores visibles del formulario.
  const [error, setError] = useState('');
  // Guardamos mensajes de éxito visibles del formulario.
  const [success, setSuccess] = useState('');
  // Controlamos el estado de carga de las peticiones.
  const [loading, setLoading] = useState(false);
  // Obtenemos navegación programática del router.
  const navigate = useNavigate();
  // Obtenemos el método de login del contexto global.
  const { login } = useAuth();

  /**
   * Cambia entre login y recuperación limpiando mensajes temporales.
   *
   * @param nextMode - Modo que se mostrará en el card de autenticación.
   */
  const switchMode = (nextMode: LoginMode) => {
    // Actualizamos el modo visible.
    setMode(nextMode);
    // Limpiamos errores previos.
    setError('');
    // Limpiamos mensajes de éxito previos.
    setSuccess('');
  };

  /**
   * Envía credenciales al backend para iniciar sesión.
   *
   * @param e - Evento de envío del formulario de login.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    // Evitamos el submit nativo del navegador.
    e.preventDefault();
    // Limpiamos errores previos.
    setError('');
    // Limpiamos mensajes de éxito previos.
    setSuccess('');
    // Activamos estado de carga.
    setLoading(true);

    try {
      // Enviamos email y contraseña al backend.
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      // Parseamos la respuesta JSON.
      const data = await response.json();

      // Si el login es correcto, guardamos sesión y redirigimos.
      if (response.ok) {
        login(data.token, data.user);
        if (data.user.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/profile');
        }
      } else {
        setError(data.error || 'No pudimos iniciar sesión.');
      }
    } catch (err) {
      // Mostramos error de red o servidor.
      setError('Ocurrió un error. Por favor, inténtalo de nuevo.');
    } finally {
      // Cerramos estado de carga.
      setLoading(false);
    }
  };

  /**
   * Solicita al backend el envío del enlace de recuperación.
   *
   * @param e - Evento de envío del formulario de recuperación.
   */
  const handleForgotSubmit = async (e: React.FormEvent) => {
    // Evitamos el submit nativo del navegador.
    e.preventDefault();
    // Limpiamos errores anteriores.
    setError('');
    // Limpiamos mensajes anteriores.
    setSuccess('');
    // Activamos estado de carga.
    setLoading(true);

    try {
      // Solicitamos al backend un enlace de recuperación.
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      // Parseamos el resultado para mostrar el mensaje del backend.
      const data = await response.json();

      // Mostramos éxito genérico para no revelar si el email existe.
      if (response.ok) {
        setSuccess(data.message || 'Si el email está registrado, recibirás instrucciones para recuperar tu contraseña.');
      } else {
        setError(data.error || 'No pudimos procesar la solicitud.');
      }
    } catch (err) {
      // Mostramos error de red o servidor.
      setError('Ocurrió un error. Por favor, inténtalo de nuevo.');
    } finally {
      // Cerramos estado de carga.
      setLoading(false);
    }
  };

  // Identificamos si el card está en modo recuperación.
  const isForgotMode = mode === 'forgot';

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-[#141414] border border-white/10 rounded-2xl p-8"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/20 text-primary mb-4">
            {isForgotMode ? <KeyRound className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {isForgotMode ? 'Recuperar contraseña' : 'Iniciar Sesión'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isForgotMode
              ? 'Te enviaremos un enlace seguro para crear una nueva clave.'
              : 'BetRoyale Club - Exclusividad, análisis y precisión'}
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        {!isForgotMode ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-4 mb-2">
                <label className="block text-sm font-medium text-gray-300">Contraseña</label>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-xs font-bold text-primary hover:text-primary/80"
                >
                  ¿Olvidaste tu clave?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 mt-2"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email de tu cuenta</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Enviando enlace...' : 'Enviar enlace seguro'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-muted-foreground hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a iniciar sesión
            </button>
          </form>
        )}

        {!isForgotMode && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Regístrate aquí
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
