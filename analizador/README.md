# Analizador independiente

La configuración de Vercel en la raíz del repositorio publica únicamente este cliente y la función `/api/analizador`. No conecta con MySQL, no utiliza las cuentas de la plataforma y no envía notificaciones ni procesa pagos.

En la portada se muestran los próximos 14 días de Bundesliga y 2. Bundesliga. El calendario y los resultados de 90 minutos provienen de [OpenLigaDB](https://www.openligadb.de/) (ODbL). No requiere claves. La cuota introducida por el usuario se calcula solo en su navegador.

Para habilitar la fuente privada de otras ligas, configura en el proyecto Vercel `APIFOOTBALL_API_KEY` y `ANALYZER_ACCESS_CODE` (un código aleatorio de alta entropía) y vuelve a desplegar. La clave del proveedor no se envía al navegador. El código de acceso solo se mantiene en memoria en el cliente. Cobertura, cuotas y estadísticas pueden variar por temporada y plan. El modo independiente es de consulta a demanda, sin registro histórico persistente.

Comprobaciones: `npm run build:analizador`, `npm run lint` y `node --test tests/standalone-analyzer.test.mjs`. El programa de Vercel reutiliza el modelo compilado en `dist-server/server/services/matchModel.js`: al actualizar el modelo, ejecutar también la compilación del servidor.

Para usar las cuotas de bet365 de una cuenta existente de MoviOdds, configurar `MOVIODDS_API_KEY` como secreto de Production en Vercel y volver a desplegar. Funciona tanto con OpenLigaDB como con API-Football. Al abrir el informe se verifica el cruce, se consulta su ID en MoviOdds y se calcula EV solo para selecciones prepartido disponibles y recientes. Si está configurado, no se sustituyen silenciosamente sus precios con los de otro proveedor.
