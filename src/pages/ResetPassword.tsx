import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, KeyRound, Lock } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ResetPassword() {
  // Leemos el token recibido desde el enlace enviado por email.
  const [searchParams] = useSearchParams();
  // Guardamos la nueva contraseña ingresada por el usuario.
  const [password, setPassword] = useState('');
  // Guardamos la confirmación de contraseña.
  const [confirmPassword, setConfirmPassword] = useState('');
  // Guardamos errores visibles del formulario.
  const [error, setError] = useState('');
  // Guardamos mensajes de éxito visibles del formulario.
  const [success, setSuccess] = useState('');
  // Controlamos el estado de carga de la petición.
  const [loading, setLoading] = useState(false);
  // Extraemos el token desde la querystring.
  const token = searchParams.get('token') || '';

  /**
   * Envía la nueva contraseña al backend usando el token del enlace.
   *
   * @param e - Evento de envío del formulario de restablecimiento.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    // Evitamos el submit nativo del navegador.
    e.preventDefault();
    // Limpiamos errores previos.
    setError('');
    // Limpiamos mensajes previos.
    setSuccess('');

    // Validamos que el enlace sí traiga token.
    if (!token) {
      setError('El enlace de recuperación no es válido.');
      return;
    }

    // Validamos longitud mínima coherente con el backend.
    if (password.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    // Validamos coincidencia antes de enviar al backend.
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    // Activamos estado de carga.
    setLoading(true);

    try {
      // Enviamos token y contraseña nueva al backend.
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      // Parseamos la respuesta del backend.
      const data = await response.json();

      // Mostramos éxito y limpiamos campos si el token fue válido.
      if (response.ok) {
        setSuccess(data.message || 'Contraseña actualizada correctamente.');
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(data.error || 'No pudimos actualizar tu contraseña.');
      }
    } catch (err) {
      // Mostramos error de red o servidor.
      setError('Ocurrió un error. Por favor, inténtalo de nuevo.');
    } finally {
      // Cerramos estado de carga.
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-[#141414] border border-white/10 rounded-2xl p-8"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/20 text-primary mb-4">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Crear nueva contraseña</h1>
          <p className="text-muted-foreground text-sm">
            Protege tu cuenta con una clave nueva y segura.
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

        {!success ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Nueva contraseña</label>
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

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Confirmar contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </form>
        ) : (
          <Link
            to="/login"
            className="block w-full text-center bg-primary text-primary-foreground font-bold py-3 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Ir a iniciar sesión
          </Link>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          ¿Recordaste tu clave?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Volver al login
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
