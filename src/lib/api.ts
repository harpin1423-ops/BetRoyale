/**
 * @file api.ts
 * @description Cliente HTTP centralizado para todas las llamadas al backend.
 * Encapsula el fetch nativo añadiendo:
 * - Cabecera Authorization automática con el JWT almacenado
 * - Manejo de errores HTTP estandarizado
 * - Tipado genérico para las respuestas
 *
 * Uso:
 *   import { api } from '@/lib/api';
 *   const picks = await api.get<Pick[]>('/api/picks');
 *   await api.post('/api/auth/login', { email, password });
 */

// ─── Tipos del cliente API ────────────────────────────────────────────────────

/**
 * Opciones extendidas de fetch con soporte para
 * cuerpo tipado y header de autenticación automático.
 */
interface OpcionesAPI extends Omit<RequestInit, "body"> {
  /** Cuerpo de la petición (se serializa a JSON automáticamente) */
  body?: unknown;
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Realiza una petición HTTP con autenticación automática.
 * Añade el header Authorization desde localStorage si existe un token.
 *
 * @param url     - URL del endpoint (ej: '/api/picks')
 * @param opciones - Opciones de fetch (method, body, headers, etc.)
 * @returns Respuesta de la API parseada como JSON del tipo T
 * @throws Error con el mensaje del backend si el status no es 2xx
 */
async function peticion<T = unknown>(url: string, opciones: OpcionesAPI = {}): Promise<T> {
  // Construimos los headers base con soporte para JSON
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Pasamos los headers personalizados del llamador (si los hay)
    ...(opciones.headers as Record<string, string>),
  };

  // Añadimos el token JWT si está disponible en localStorage
  const token = localStorage.getItem("token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Ejecutamos la petición con fetch nativo
  const respuesta = await fetch(url, {
    ...opciones,
    headers,
    // Serializamos el body a JSON si fue proporcionado
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });

  // Si la respuesta no es exitosa (status 4xx o 5xx), lanzamos un error descriptivo
  if (!respuesta.ok) {
    // Intentamos extraer el mensaje de error del cuerpo de la respuesta
    const cuerpoError = await respuesta.json().catch(() => ({}));
    const mensaje =
      (cuerpoError as { error?: string }).error ||
      `Error HTTP ${respuesta.status}: ${respuesta.statusText}`;
    throw new Error(mensaje);
  }

  // Parseamos y devolvemos la respuesta como el tipo T
  return respuesta.json() as Promise<T>;
}

// ─── Métodos HTTP helpers ─────────────────────────────────────────────────────

/**
 * Cliente API con métodos GET, POST, PUT, PATCH y DELETE.
 * Todos los métodos incluyen autenticación automática y tipado genérico.
 */
export const api = {
  /**
   * Realiza una petición GET.
   * @example const picks = await api.get<Pick[]>('/api/picks');
   */
  get: <T = unknown>(url: string, opciones?: OpcionesAPI) =>
    peticion<T>(url, { method: "GET", ...opciones }),

  /**
   * Realiza una petición POST con un cuerpo JSON.
   * @example await api.post('/api/auth/login', { email, password });
   */
  post: <T = unknown>(url: string, cuerpo?: unknown, opciones?: OpcionesAPI) =>
    peticion<T>(url, { method: "POST", body: cuerpo, ...opciones }),

  /**
   * Realiza una petición PUT para actualizar un recurso completo.
   * @example await api.put('/api/picks/1', datosActualizados);
   */
  put: <T = unknown>(url: string, cuerpo?: unknown, opciones?: OpcionesAPI) =>
    peticion<T>(url, { method: "PUT", body: cuerpo, ...opciones }),

  /**
   * Realiza una petición PATCH para actualización parcial.
   * @example await api.patch('/api/picks/1/status', { status: 'won' });
   */
  patch: <T = unknown>(url: string, cuerpo?: unknown, opciones?: OpcionesAPI) =>
    peticion<T>(url, { method: "PATCH", body: cuerpo, ...opciones }),

  /**
   * Realiza una petición DELETE para eliminar un recurso.
   * @example await api.delete('/api/picks/1');
   */
  delete: <T = unknown>(url: string, opciones?: OpcionesAPI) =>
    peticion<T>(url, { method: "DELETE", ...opciones }),
};
