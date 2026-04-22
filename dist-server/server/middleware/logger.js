/**
 * @file logger.ts
 * @description Middleware de logging de requests HTTP.
 * Registra el inicio y fin de cada request, su duración y status code.
 * Emite alertas cuando un request tarda más de 1 segundo en responder.
 */
/**
 * Middleware de logging: registra todas las peticiones HTTP que llegan al servidor.
 * - Imprime el método y URL al inicio de cada request.
 * - Al finalizar, imprime duración y código de respuesta.
 * - Alerta si un request supera los 10 segundos (posible hang).
 */
export const requestLogger = (req, res, next) => {
    // Guardamos el timestamp de inicio del request
    const inicio = Date.now();
    const { method, url } = req;
    // Log de inicio del request
    console.log(`[→] ${method} ${url}`);
    // Timer de detección de posibles cuelgues (hangs)
    // Si un request no responde en 10s, lo reportamos como posible problema
    const timerCuelgue = setTimeout(() => {
        // Verificamos que la respuesta no se haya enviado ya
        if (!res.writableEnded) {
            console.error(`[HANG] ${method} ${url} lleva más de 10s sin responder`);
        }
    }, 10_000);
    // Cuando la respuesta termina, calculamos la duración total
    res.on("finish", () => {
        // Cancelamos el timer de detección de cuelgue
        clearTimeout(timerCuelgue);
        const duracion = Date.now() - inicio;
        const status = res.statusCode;
        // Requests lentos (> 1000ms) se muestran como advertencia
        if (duracion > 1000) {
            console.warn(`[LENTO] ${method} ${url} → ${status} en ${duracion}ms`);
        }
        else {
            // Request normal
            console.log(`[←] ${method} ${url} → ${status} en ${duracion}ms`);
        }
    });
    // Limpiamos el timer también si la conexión se cierra abruptamente
    res.on("close", () => clearTimeout(timerCuelgue));
    // Continuamos al siguiente middleware
    next();
};
/**
 * Middleware de log específico para las rutas de API.
 * Se engancha en app.use('/api/*') para registrar sólo las API calls.
 */
export const apiLogger = (req, _res, next) => {
    // Log detallado para cada petición a la API
    console.log(`[API] ${req.method} ${req.url}`);
    next();
};
