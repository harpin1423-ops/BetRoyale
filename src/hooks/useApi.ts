/**
 * @file useApi.ts
 * @description Hook personalizado para llamadas a la API con estado de carga y error.
 * Evita repetir la lógica de loading/error en cada componente.
 *
 * Uso:
 *   const { data, loading, error, ejecutar } = useApi<Picks[]>();
 *   useEffect(() => { ejecutar(() => api.get('/api/picks')); }, []);
 */

import { useState, useCallback } from "react";

/**
 * Estado que retorna el hook para manejo de peticiones async.
 */
interface EstadoAPI<T> {
  /** Datos recibidos de la API (null si aún no se ha cargado) */
  data: T | null;
  /** true mientras la petición está en curso */
  loading: boolean;
  /** Mensaje de error si la petición falló */
  error: string | null;
  /** Función para disparar la petición manualmente */
  ejecutar: (fn: () => Promise<T>) => Promise<T | null>;
  /** Resetea el estado de error y datos */
  resetear: () => void;
}

/**
 * Hook para gestionar el estado de llamadas asíncronas a la API.
 * Proporciona loading, error y data automáticamente.
 *
 * @template T - Tipo de los datos esperados en la respuesta
 * @returns EstadoAPI con data, loading, error y función ejecutar
 */
export function useApi<T = unknown>(): EstadoAPI<T> {
  // Estado de los datos recibidos de la API
  const [data, setData] = useState<T | null>(null);

  // Estado de carga: true mientras la petición está pendiente
  const [loading, setLoading] = useState(false);

  // Estado de error: null si no hay error, string con el mensaje si lo hay
  const [error, setError] = useState<string | null>(null);

  /**
   * Ejecuta una función asíncrona y gestiona automáticamente
   * los estados de loading, data y error.
   */
  const ejecutar = useCallback(async (fn: () => Promise<T>): Promise<T | null> => {
    // Activamos el estado de carga y limpiamos errores previos
    setLoading(true);
    setError(null);

    try {
      // Ejecutamos la función pasada (ej: () => api.get('/api/picks'))
      const resultado = await fn();

      // Guardamos el resultado en el estado
      setData(resultado);

      return resultado;
    } catch (err: any) {
      // Guardamos el mensaje de error
      const mensajeError = err?.message || "Error desconocido";
      setError(mensajeError);
      console.error("[useApi]", mensajeError);
      return null;
    } finally {
      // Siempre desactivamos el loading al terminar
      setLoading(false);
    }
  }, []);

  /**
   * Limpia el estado del hook volviendo a los valores iniciales.
   */
  const resetear = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
  }, []);

  return { data, loading, error, ejecutar, resetear };
}
