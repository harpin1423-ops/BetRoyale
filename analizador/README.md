# Analizador independiente

**Auditar cobertura internacional:** con una clave privada y vigente en `APIFOOTBALL_API_KEY`, ejecutar `node scripts/audit-football-coverage.mjs`. Revisa 2. Bundesliga, Championship, Liga MX, Superliga danesa, Premier League egipcia y Primera A colombiana. Para otras ligas, pasa sus IDs separados por espacios. Solo consulta datos; no compra servicios ni publica picks. Por liga hace hasta tres solicitudes: temporada actual, partidos finalizados y detalles de los últimos 20. La tabla indica cuántos de la muestra traen marcador, córners, amarillas y xG para **ambos equipos**; muestra cero significa que no hay muestra, no que la cobertura sea 0 %. No mide precisión predictiva ni implica cobertura futura. Un plan que rechaza la consulta no se registra como cero.

La configuración de Vercel en la raíz del repositorio publica únicamente este cliente y la función `/api/analizador`. No conecta con MySQL, no utiliza las cuentas de la plataforma y no envía notificaciones ni procesa pagos.

En la portada se muestran los próximos 14 días de Bundesliga y 2. Bundesliga. El calendario y los resultados de 90 minutos provienen de [OpenLigaDB](https://www.openligadb.de/) (ODbL). No requiere claves. La cuota introducida por el usuario se calcula solo en su navegador.

Para habilitar la fuente privada de otras ligas, configura en el proyecto Vercel `APIFOOTBALL_API_KEY` y `ANALYZER_ACCESS_CODE` (un código aleatorio de alta entropía) y vuelve a desplegar. La clave del proveedor no se envía al navegador. El código de acceso solo se mantiene en memoria en el cliente. Cobertura, cuotas y estadísticas pueden variar por temporada y plan. El modo independiente es de consulta a demanda, sin registro histórico persistente.

Comprobaciones: `npm run build:analizador`, `npm run lint` y `node --test tests/standalone-analyzer.test.mjs`. El programa de Vercel reutiliza el modelo compilado en `dist-server/server/services/matchModel.js`: al actualizar el modelo, ejecutar también la compilación del servidor.

Para usar las cuotas de bet365 de una cuenta existente de MoviOdds, el servidor admite el secreto `MOVIODD` o `MOVIODDS_API_KEY` en Production de Vercel; no es necesario duplicarlo. Si existen ambos, tiene prioridad `MOVIODDS_API_KEY`. Tras cambiar las variables se debe volver a desplegar. Funciona tanto con OpenLigaDB como con API-Football. Al abrir el informe se verifica el cruce, se consulta su ID en MoviOdds y se calcula EV solo para selecciones prepartido disponibles y recientes. Si está configurado, no se sustituyen silenciosamente sus precios con los de otro proveedor.
# Hudl StatsBomb

Para activar la integración en Vercel Production, configura de forma privada `SB_USERNAME` y `SB_PASSWORD` de la **API de datos** de Hudl StatsBomb y `ANALYZER_ACCESS_CODE`. Vuelve a desplegar, abre **Acceso privado**, elige el calendario y abre un partido. Confirma con Hudl las ligas, temporadas y permisos para el uso previsto. No requiere cambiar MoviOdds. Las respuestas privadas no se almacenan en la CDN. El servidor no descarga archivos del archivo abierto como sustituto de partidos actuales.

La fuente se verifica por competición, país, temporada, equipos, fecha y resultado. Los IDs de un proveedor no se reutilizan en otro. Se analizan los últimos cinco partidos en casa del local y cinco fuera del visitante, anteriores al inicio. Solo se aceptan eventos con ambas mitades reglamentarias completas. La cobertura y los datos ausentes se muestran en el informe.

- xG: suma de `shot.statsbomb_xg`; si falta el valor de un tiro, no se usa ese total de Hudl. Las métricas que aporta otra fuente no se eliminan.
- SCA/90: definición propia basada en hasta dos pases, conducciones o regates exitosos de la misma posesión antes del tiro. Se normaliza con los minutos observados, incluido el añadido.
- xT experimental: cuadrícula de 6 × 4; recompensa de los tiros y transiciones de pases y conducciones completados. La valoración de cada partido excluye ese partido del entrenamiento. Requiere cinco partidos adicionales, 80 tiros y cobertura de las 24 zonas. No es una métrica oficial de Hudl. El modelo de goles puede incorporar xG histórico; xT y SCA aportan contexto y no determinan EV por sí solos.

Sin cuenta API se puede usar **Hudl StatsBomb · Revisar archivo de eventos** con un JSON autorizado. Se procesa en el navegador; no requiere claves y no sube el archivo ni modifica pronósticos. Pruebas: `node --test tests/statsbomb.test.mjs`. Referencia: [cliente oficial de Hudl](https://github.com/hudl/statsbombpy).
