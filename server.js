/**
 * Proxy entry point for Hostinger Node.js Web App.
 * Redirige la ejecución al servidor compilado en dist-server.
 */
import('./dist-server/server.js').catch(err => {
    console.error('Error al iniciar el servidor desde dist-server:', err);
    process.exit(1);
});
