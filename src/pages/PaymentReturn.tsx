import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PaymentReturn() {
  const [message, setMessage] = useState('Procesando pago...');
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentId = params.get("payment_id");
    const status = params.get("status");

    if (!paymentId) {
      setMessage("No se recibió información del pago.");
      setTimeout(() => navigate("/pricing"), 3000);
      return;
    }

    const run = async () => {
      try {
        // Llamada al backend para sincronizar
        const res = await fetch(`/api/payments/sync?payment_id=${paymentId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setMessage("¡Pago exitoso! Redirigiendo...");
          setTimeout(() => navigate("/profile?payment=ok"), 1500);
        } else {
          setMessage(data.message || `Estado del pago: ${status}`);
          setTimeout(() => navigate("/pricing"), 3000);
        }
      } catch (error) {
        setMessage("Error al validar el pago. Por favor contacta soporte.");
        setTimeout(() => navigate("/pricing"), 3000);
      }
    };

    run();
  }, [location.search, navigate, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-white">
      <div className="text-center p-8 bg-card rounded-2xl border border-white/10 shadow-xl">
        <h2 className="text-2xl font-bold mb-4">Verificando Pago</h2>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
