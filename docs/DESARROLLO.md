# Desarrollo de L10N Suite

## Requisitos

Node.js 22 (`.nvmrc`). Todo lo demás se instala con `npm install`.

## Estructura

```
apps/desktop      Electron: main.ts (ventana, menú, IPC), engine.ts (motor en utilityProcess),
                  bridge.ts (protocolo app:// ↔ motor), preload.ts, scripts/stage.mjs
apps/server       Motor: Fastify + SQLite (better-sqlite3) + Drizzle
                  src/app.ts (buildApp), src/modules/* (rutas), src/services/* (lógica),
                  src/db/schema/* (esquema), drizzle/ (migraciones SQL)
apps/web          Interfaz: React + Vite + TanStack Router/Query + Tailwind
packages/shared   Esquemas Zod, tipos, cálculos de dinero, fechas, texto e idiomas
e2e/              Pruebas Playwright (contra el motor en modo web)
```

## Cómo funciona la app de escritorio

- **Proceso principal (`apps/desktop/src/main.ts`):** ventana, menús, diálogos nativos e instancia única.
- **Motor (`engine.ts`):** el mismo `buildApp` que el modo web, ejecutado en un `utilityProcess`. Si se cae, `EngineHost` lo reinicia.
- **Comunicación:** la interfaz carga `app://l10n/`. Las peticiones a `app://l10n/api/*` las recoge `bridge.ts` y las pasa al motor por mensajes (`fastify.inject`). No se abre ningún puerto de red.
- **Datos:** la carpeta de datos es `app.getPath('userData')`.
- **better-sqlite3:** trae binarios N-API precompilados para todas las plataformas, así que no hay que compilarlo para Electron.

## Comandos

| Comando                                                 | Qué hace                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run dev`                                           | Motor (`http://127.0.0.1:4317`) e interfaz con recarga en caliente (`http://localhost:5173`)          |
| `npm test`                                              | Pruebas unitarias y de integración (Vitest)                                                           |
| `npm run test:e2e`                                      | Pruebas de extremo a extremo (Playwright; compila antes la interfaz con `npm run build -w @l10n/web`) |
| `npm run lint` / `npm run typecheck` / `npm run format` | Calidad del código                                                                                    |
| `npm run db:generate`                                   | Genera una migración a partir de los cambios del esquema                                              |
| `npm run desktop:stage`                                 | Prepara `apps/desktop/build/app`                                                                      |
| `npm run desktop:dev`                                   | Prepara y abre la app de escritorio                                                                   |
| `npm run desktop:selftest`                              | Autocomprobación de la app de escritorio                                                              |
| `npm run desktop:dist`                                  | Genera el instalador del sistema actual en `apps/desktop/release`                                     |

En Linux, como root o sin entorno gráfico, la app de escritorio se lanza así:

```
L10N_DISABLE_GPU=1 xvfb-run -a npx electron apps/desktop/build/app --no-sandbox --selftest
```

## Convenciones

- **Idioma:** código en inglés; interfaz, mensajes de error y documentación en español.
- **Base de datos:**
  - identificadores UUIDv7;
  - fechas en ISO 8601 (las fechas sin hora, `AAAA-MM-DD`);
  - importes en céntimos y tarifas en millonésimas, ambos enteros (`packages/shared/src/money.ts`);
  - borrado lógico con `deleted_at`: cada tipo de ficha se registra con `registerTrashable`.
- **Búsqueda global:** cada servicio llama a `indexEntity` al crear o editar y a `removeFromIndex` al borrar.
- **Migraciones:**
  - nunca se editan una vez publicadas;
  - las tablas virtuales FTS van en migraciones SQL personalizadas (`drizzle-kit generate --custom`);
  - las tablas FTS se llaman `*_fts`.
- **Validación:** toda entrada a la API se valida con Zod (`parse` de `apps/server/src/lib/validate.ts`).

## Publicar una versión

1. Sube la versión en `package.json` (raíz).
2. Crea y sube una etiqueta `vX.Y.Z`.
3. El flujo **Instaladores** (`.github/workflows/release.yml`):
   - genera el `.exe` y el `.dmg`;
   - arranca cada app empaquetada en modo de autocomprobación;
   - crea la _Release_ con los instaladores.
