# L10N Suite — notas para el desarrollo asistido

- Lee `docs/BRIEFING.md` (alcance y hoja de ruta) y `docs/DESARROLLO.md` (arquitectura y convenciones).
- Interfaz, mensajes y documentación en español de España; código en inglés.
- Antes de dar algo por terminado: `npm run lint && npm run typecheck && npm test`, y `npm run test:e2e` si cambia la interfaz.
- Nuevos tipos de ficha: esquema en `apps/server/src/db/schema`, migración con `npm run db:generate`, servicio + rutas en `apps/server/src/modules`, registro en papelera/búsqueda, pruebas en `apps/server/test`.
- Electron en este contenedor: `L10N_DISABLE_GPU=1 xvfb-run -a npx electron apps/desktop/build/app --no-sandbox --selftest`.
