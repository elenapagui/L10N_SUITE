# Briefing del proyecto: L10N Suite

> Aplicación de escritorio para dirigir tu actividad profesional de traducción de videojuegos, tu investigación académica y tu corpus. En este documento se define qué se construye, cómo y en qué orden.

## 1. Contexto

- Ahora mismo tu trabajo está repartido entre Notion (estructura y notas), ClickUp (tareas y proyectos) y Google Sheets (tablas). Además tienes artículos académicos y un corpus de videojuegos que estás construyendo desde cero.
- El objetivo es tener una sola aplicación propia, estable y completa que sustituya a las tres y añada dos secciones de investigación: los artículos académicos y el corpus.
- No es una herramienta de traducción asistida (CAT): no segmenta ni traduce. Sirve para organizar clientes, encargos, plazos, dinero, conocimiento e investigación.
- Punto de partida: el repositorio `elenapagui/L10N_SUITE` está vacío y se trabaja en la rama `claude/inspiring-edison-o70e3v`.

## 2. Decisiones tomadas

| Tema                      | Decisión                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato                   | App de escritorio instalable: Windows (.exe) y macOS con Apple Silicon (.dmg). No hace falta instalar nada más.                                    |
| Notion / ClickUp / Sheets | Se sustituyen (todo en uno). Tus datos actuales se importan una sola vez.                                                                          |
| Académico                 | Mis publicaciones y una biblioteca de referencias tipo Zotero                                                                                      |
| Corpus                    | Gestión y explotación: catálogo, textos, concordanciador, anotación, estadísticas y exportación                                                    |
| Facturación               | Solo seguimiento; la app no emite facturas legales. Para los autónomos, el software que emite facturas deberá cumplir Verifactu desde el 1/7/2027. |
| Dos ordenadores           | Uno principal. Para pasar los datos al otro se usa «Exportar/Importar copia completa». La sincronización automática llega en la última fase.       |
| Orden                     | Primero la base técnica, luego proyectos y tareas, y después el resto                                                                              |

## 3. Principios

1. **Tus datos se quedan en tu equipo.** No hay nube ni cuentas, lo que encaja con los NDA, y la app funciona sin conexión.
2. **La estabilidad va antes que las funciones.** No se pierde nada: hay copias automáticas, papelera y opción de deshacer, y antes de cada migración se hace una copia.
3. **Todo está conectado.** El **juego** es la ficha central que une proyectos, recursos, corpus y publicaciones.
4. **Formatos abiertos.** Todo se puede exportar: Excel, CSV, Markdown, TMX, BibTeX o un ZIP completo.
5. **En español y pensada para KO→ES**, aunque admite otros pares. Fechas dd/mm/aaaa, euros, semanas que empiezan en lunes y tipografía coreana correcta.
6. **Rápida.** Búsqueda global con Ctrl/Cmd+K, atajos de teclado y autoguardado.

## 4. Módulos

### 4.1 Inicio

Panel del día con las tareas de hoy y las vencidas, las entregas de los próximos 7 días, los encargos en curso, el cronómetro activo y las horas de la semana. También muestra el resumen económico del mes (facturado, pendiente de facturar y pendiente de cobro), el estado del corpus, las publicaciones en curso y accesos rápidos.

### 4.2 Trabajo (sustituye a ClickUp)

- **Clientes**: tipo (agencia, estudio, editora o particular), datos fiscales, moneda, condiciones de pago, contactos (PM, revisión, finanzas), NDA con su archivo, plataforma o CAT del cliente y notas. Cada cliente tiene estadísticas de facturación, volumen y días medios de cobro, y sus **accesos** (servidor de memoQ u otra herramienta, usuario y contraseña; varios por cliente, guardados sin cifrar).
- **Tarifas**: por cliente, servicio (traducción, revisión, LQA, transcreación, MTPE, subtitulado, terminología…) y par de idiomas. La unidad puede ser la palabra, el **carácter** (lo habitual con el coreano de origen), la hora, el minuto o una tarifa plana, con mínimo y rejilla de descuentos por coincidencias del CAT.
- **Juegos**: es la ficha central. Recoge los títulos KO/ES/EN, la desarrolladora, la editora, el año, los géneros, las plataformas, el modelo de negocio (premium, F2P, gacha, live service), el PEGI y el estado (en desarrollo, publicado, cierre de servicio). Tiene pestañas de proyectos, recursos, corpus, publicaciones y notas.
- **Proyectos y encargos**: un proyecto reúne cliente, juego y par de idiomas. Dentro van los encargos o lotes (parches, eventos, DLC, ficha de tienda…), algo muy habitual en los juegos como servicio coreanos. Cada encargo tiene:
  - servicio, n.º de pedido (PO), tipo de contenido (UI, diálogo, objetos y habilidades, marketing, notas de parche…), fechas y estado;
  - volumen o análisis CAT por bandas, del que salen el volumen ponderado y el importe;
  - estado de facturación, checklist de entrega y un botón para abrir la carpeta local del proyecto;
  - hora de entrega que se rellena sola con la habitual (23:59, configurable).
- **Vistas y periodos**: encargos, proyectos, juegos y clientes se ven en tabla, tarjetas, tablero por estado, agrupados con subtotales o en línea de tiempo. Un selector de periodo (total, año, trimestre, mes) limita las listas y las cifras, también dentro de cada proyecto, cliente o juego.
- **Tareas**:
  - Se organizan en áreas (Trabajo, Académico, Corpus, Administración, Personal) y listas.
  - Admiten subtareas, checklists, prioridad, estados personalizables, fecha y hora, estimación, etiquetas, adjuntos y comentarios.
  - Pueden repetirse (por ejemplo, «facturar el último día del mes»), y las plantillas de proyecto o encargo crean sus tareas automáticamente.
  - Vistas: lista agrupable con edición en línea, tablero kanban con arrastrar y soltar, calendario, tabla y «Mi trabajo» (hoy, vencidas, próximas). Los filtros se pueden guardar.
- **Tiempo**: cronómetro global vinculado a una tarea o un encargo, más entradas manuales. Hay informes por cliente, proyecto y área, y de productividad (palabras por hora y €/hora efectivo).
- **Consultas al cliente**: registro de dudas por encargo (ID de cadena, texto origen, contexto, pregunta, respuesta y estado). Se pueden buscar en todos los proyectos y exportar a Excel con formato de hoja de consultas.
- **Avisos**: notificaciones del sistema para entregas próximas, tareas vencidas y cobros atrasados.
- **Importación**: CSV de ClickUp y Excel/CSV genérico, con un asistente para asignar las columnas.

### 4.3 Finanzas (solo seguimiento; no emite facturas)

- Cada encargo es «no facturable» o pasa de pendiente de facturar a facturado y luego a cobrado. El estado «vencido» se calcula solo.
- **Registro de facturas** que emites con tu programa o tu gestoría:
  - eliges los encargos pendientes de un cliente y se crea el registro: número, fecha, base, IVA, IRPF, total, moneda, tipo de cambio y vencimiento según las condiciones del cliente;
  - adjuntas el PDF de la factura;
  - puedes generar un «Resumen para facturar» en Excel o PDF (no es una factura) para copiar los datos en tu programa.
- **Gastos**: categoría, IVA soportado, si son deducibles, su justificante y el banco del que salen.
- **Gastos recurrentes**: semanales, mensuales, trimestrales o anuales; la app los apunta sola el día que tocan.
- **Bancos**: cuentas con número, banco y saldo manual. Un botón «Cargar» resta cada gasto del saldo cuando se cobra, con historial de movimientos.
- **Informes**:
  - ingresos por mes, trimestre y año, por cliente, juego, servicio y par de idiomas;
  - antigüedad de los cobros pendientes, tarifa efectiva y volumen por mes;
  - resumen trimestral orientativo de IVA (modelo 303) e IRPF (modelo 130);
  - exportación a Excel para la gestoría.
- Los importes se guardan en céntimos enteros para evitar errores de redondeo. Admite varias monedas con conversión a euros.

### 4.4 Páginas (sustituye a Notion)

- Árbol de páginas anidadas con iconos, favoritos y recientes.
- Editor por bloques: encabezados, listas, casillas, desplegables, citas, avisos, código, tablas, imágenes y archivos. Los bloques se insertan con el menú «/» y se pueden arrastrar.
- Menciones con «@» a páginas, juegos, proyectos, clientes, referencias y publicaciones. Cada ficha muestra qué páginas la mencionan.
- Plantillas: guía de estilo, kickoff de proyecto, informe de LQA, acta de reunión, ficha de lectura y plan de artículo.
- Autoguardado, historial de versiones, exportación a Markdown o PDF e importación de la exportación de Notion (Markdown + CSV).
- **Recursos por juego**:
  - glosario: término KO/ES/EN, categoría, contexto, estado (propuesto, aprobado o prohibido) y fuente;
  - **personajes**: nombres, género gramatical para la concordancia en español, tratamiento tú/usted (반말/존댓말) y forma de hablar;
  - guía de estilo.

  Todo se importa y exporta en Excel, de forma compatible con los glosarios que ya generas (columna A en coreano, columna B en español).

### 4.5 Tablas (sustituye a Google Sheets)

- Tablas propias con columnas de tipo texto, número, moneda, porcentaje, fecha, casilla, selección simple o múltiple, URL, email, fórmula o relación con fichas de la app (juego, cliente, proyecto…).
- Cada tabla tiene varias vistas: cuadrícula que se edita como una hoja de cálculo (con teclado y copiando y pegando desde Excel), tablero y calendario. Admite filtros, orden, agrupación y una fila de totales.
- Importación de Excel y CSV (en Google Sheets: Descargar como .xlsx) con detección de los tipos de columna; exportación a Excel y CSV.
- La misma cuadrícula se usa en las vistas de tabla de tareas, encargos, corpus y biblioteca.

### 4.6 Corpus de videojuegos

- **Ficha de corpus de cada juego**:
  - fase de construcción: identificado, texto obtenido, limpieza, alineación, revisión, anotación e incluido;
  - versión del juego, fecha del texto, método de obtención e idiomas;
  - dirección de traducción (KO→ES directa, a través del inglés o desconocida) y empresa de localización;
  - permisos y derechos, y notas metodológicas.
- **Textos**:
  - cada juego puede tener varios documentos (diálogos, UI, objetos…);
  - se importan desde Excel o CSV asignando columnas: una por idioma (por defecto, A = coreano y B = español), ID de cadena, hablante, tipo de texto y contexto;
  - la importación avisa de filas vacías, desalineadas o duplicadas, normaliza el Unicode (NFC para el coreano) y permite decidir qué hacer con etiquetas y variables como `{0}`, `%s` o `<color>`.
- **Concordanciador bilingüe**:
  - busca en cualquier idioma por texto exacto, palabra completa, comodines o expresión regular;
  - admite búsquedas combinadas, como «KO contiene 스킬 y ES no contiene habilidad»;
  - muestra resultados KWIC junto al segmento paralelo, que se pueden ordenar por contexto;
  - filtra por juego, género, plataforma, año, tipo de texto, hablante, dirección de traducción y etiqueta;
  - guarda búsquedas y exporta los resultados a Excel.
- **Anotación**: esquema de etiquetas jerárquico y editable (técnicas de traducción, honoríficos, humor, referencias culturales, nombres propios, variación lingüística…) que se aplica a segmentos o fragmentos, con comentario. Las etiquetas también sirven de filtro en el concordanciador.
- **Estadísticas**: número de juegos, documentos, segmentos, caracteres, eojeol y palabras; distribución por género, plataforma, año y tipo de texto; listas de frecuencia y gráficos.
- **Exportación y versiones**:
  - formatos: TMX, TXT por idioma (para AntConc, Sketch Engine o LancsBox), Excel, CSV y JSON;
  - se puede exportar el corpus entero o un subcorpus filtrado;
  - las versiones llevan fecha («Corpus v0.3: 12 juegos, 85 000 segmentos») para poder citarlas en tus artículos.
- El material de clientes bajo NDA nunca entra en el corpus de forma automática.

### 4.7 Académico

- **Mis publicaciones**:
  - ficha con tipo (artículo, capítulo, ponencia, reseña o libro), coautoría y afiliaciones, resumen, palabras clave e idioma;
  - flujo de estados: idea, esquema, redacción, revisión interna, enviado, revisión por pares, cambios solicitados, reenviado, aceptado, en prensa y publicado, más «rechazado / reorientado»;
  - varios envíos por artículo (revista, ID del manuscrito, fechas, decisión, informes de revisión y carta de respuesta) y versiones de los archivos;
  - tareas con plazo, juegos y versión del corpus utilizados, DOI y cita final;
  - vistas kanban, lista y calendario.
- **Revistas**: ISSN, editorial, indexación, cuartil, acceso abierto y APC, normas y estilo de citas. El tiempo medio de respuesta se calcula a partir de tus envíos.
- **Biblioteca de referencias**:
  - fichas en formato CSL (artículo, libro, capítulo, tesis, ponencia, web, videojuego…);
  - alta por DOI (requiere conexión), pegando BibTeX o RIS, o importando archivos .bib/.ris de Zotero o Mendeley, con detección de duplicados;
  - PDF con visor integrado y búsqueda en su texto;
  - notas de lectura, citas textuales con página, estado de lectura, valoración, colecciones y etiquetas;
  - referencias en APA 7 (en español) y exportación a BibTeX, RIS y CSL-JSON;
  - vínculos con tus publicaciones y con los juegos.

### 4.8 Funciones comunes

- Búsqueda global y acciones rápidas (Ctrl/Cmd+K).
- Calendario unificado con entregas, tareas, plazos académicos, vencimientos de cobro y entrevistas y pruebas de las candidaturas.
- **Empleo:** seguimiento de las candidaturas a ofertas (altas en agencias y puestos en plantilla) con estados, historial de cada paso, avisos de seguimiento, documentos y paso a cliente.
- Etiquetas comunes, adjuntos (se arrastran a la app y se abren con la aplicación predeterminada), vínculos entre fichas y actividad reciente.
- Papelera durante 30 días y opción de deshacer al borrar.
- Ajustes: datos fiscales, moneda, IVA e IRPF por defecto, idiomas y pares, estados y tema claro u oscuro.
- **Copias de seguridad automáticas**:
  - se hacen al abrir la app (si han pasado 24 h), al cerrarla y antes de cada actualización;
  - se conservan 7 diarias, 4 semanales y 12 mensuales;
  - la carpeta de destino es configurable y puede estar en OneDrive, iCloud o Dropbox;
  - hay restauración guiada y se comprueba la integridad de los datos al arrancar.
- **Exportar e importar copia completa**: un ZIP con la base de datos, los adjuntos y una versión legible en CSV/JSON. Es la forma de llevar los datos al ordenador ocasional.
- Cada importación se puede deshacer de una sola vez.

## 5. Fuera de alcance

- Traducción asistida (memorias, segmentación o QA lingüística): no es un CAT.
- Emisión de facturas legales y cumplimiento de Verifactu.
- Acceso web o desde el móvil, varios usuarios y uso simultáneo en dos equipos.
- Sincronización continua con Notion, ClickUp o Sheets (solo se importan los datos).
- Complemento de citas para Word. Si lo necesitas, puedes exportar a Zotero o BibTeX.
- Firma digital de los instaladores, que requiere certificados de pago y se puede añadir más adelante.

## 6. Arquitectura técnica

- **Escritorio**: Electron (Chromium + Node.js). electron-builder genera en GitHub Actions el instalador .exe (NSIS, Windows x64) y el .dmg (macOS arm64), que se adjuntan a una _Release_ de GitHub al publicar cada versión.
- **Procesos**:
  - el proceso principal es ligero: ventana, menús, diálogos nativos, notificaciones y control de instancia única;
  - el **motor** (API y base de datos) va en un `utilityProcess` aparte, para que una importación pesada no congele la ventana y para poder reiniciarlo si falla;
  - la interfaz se comunica con el motor a través de un protocolo interno `app://`, sin abrir puertos de red, lo que es más seguro y evita los avisos del cortafuegos;
  - en desarrollo y en las pruebas, el mismo motor funciona como servidor web local.
- **Datos**:
  - SQLite (better-sqlite3) en la carpeta de datos del sistema: `%APPDATA%\L10N Suite` en Windows y `~/Library/Application Support/L10N Suite` en macOS;
  - modo WAL, claves foráneas y migraciones versionadas con Drizzle, con una copia automática antes de cada migración;
  - búsqueda con FTS5 y el tokenizador _trigram_, que encuentra subcadenas en coreano y en español (las consultas de 1 o 2 sílabas usan LIKE), más una función REGEXP propia;
  - identificadores UUIDv7, importes en céntimos y borrado lógico.
- **Motor**: Fastify + Zod para validar todo lo que entra, ExcelJS, Papa Parse, citation-js (BibTeX, RIS, DOI, APA), un generador de TMX y compresión ZIP para las copias.
- **Interfaz**: React + Vite + TypeScript estricto, TanStack Router/Query/Table/Virtual, Tailwind + shadcn/ui, dnd-kit, FullCalendar, BlockNote, Recharts, cmdk y PDF.js. Tipografías con soporte para coreano (Malgun Gothic y Apple SD Gothic Neo).
- **Componentes comunes en todos los módulos**: cuadrícula de datos, asistente de importación, selector de vínculos, panel de detalle y editor de bloques. Así la experiencia es coherente y hay menos código que pueda fallar.
- **Seguridad de Electron**: contextIsolation, sandbox, sin nodeIntegration, CSP estricta y un _preload_ mínimo.
- **Estructura** (monorepo con npm workspaces). El código está en inglés; la interfaz y la documentación, en español.
  ```
  apps/desktop      Electron: main.ts, bridge.ts (app:// ↔ motor), electron-builder.yml
  apps/server       Motor: src/app.ts, src/db/schema/*, drizzle/ (migraciones),
                    src/modules/<módulo>/ (rutas + servicio + pruebas), src/backup/
  apps/web          Interfaz: src/routes/, src/components/{data-grid,import-wizard,...}
  packages/shared   Esquemas Zod, tipos, enumeraciones, src/calc/ (volumen ponderado, importes, impuestos)
  e2e/              Pruebas Playwright
  docs/             BRIEFING.md, MANUAL.md (guía de uso), DESARROLLO.md
  .github/workflows ci.yml (en cada push) · release.yml (instaladores)
  ```

## 7. Modelo de datos (resumen)

- **Común**: `settings`, `areas`, `tags`/`taggings`, `attachments`, `links` (vínculos y menciones), `activity_log`, `import_batches` y `deleted_at` para la papelera.
- **Trabajo**: `clients`, `contacts`, `client_accounts`, `rates` (con rejilla de coincidencias), `games`, `projects`, `jobs` (encargos, con `cat_analysis`), `task_statuses`, `task_lists`, `tasks` (con `parent_id`, recurrencia y vínculos), `checklist_items`, `comments`, `time_entries`, `client_queries`, `templates`.
- **Finanzas**: `invoices` (registro), `invoice_jobs`, `expenses`, `exchange_rates`, `bank_accounts`, `bank_movements`, `recurring_expenses`.
- **Conocimiento**: `pages` (árbol, con el contenido en JSON y en texto plano para la búsqueda), `page_revisions`, `glossary_terms`, `characters`, `custom_tables`, `custom_columns`, `custom_rows` (valores en JSON), `custom_views`.
- **Corpus**: `corpus_profiles` (1:1 con `games`), `corpus_documents`, `segments`, `segment_texts` (una fila por idioma, con índice FTS), `annotation_tags` (árbol), `annotations`, `corpus_versions`, `saved_searches`.
- **Académico**: `publications`, `publication_authors`, `submissions`, `publication_files`, `journals`, `references` (CSL-JSON y campos indexados), `reference_notes`, `quotes`, `collections`.

## 8. Hoja de ruta

Cada fase termina con todas las pruebas superadas, los instaladores generados, el `MANUAL.md` actualizado y los cambios subidos a la rama. Podrás instalar y usar la app desde el final de la Fase 0.

| Fase                   | Contenido                                                                                                                                                                                                                         | Está terminada cuando…                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0 · Base               | Monorepo; motor, SQLite y migraciones; Electron con protocolo interno; barra lateral, Ctrl+K y tema; ajustes, etiquetas, adjuntos y papelera; copias automáticas y exportar/importar copia completa; CI e instaladores            | El .exe y el .dmg se instalan, la app arranca, crea su base de datos y hace y restaura una copia |
| 1 · Proyectos y tareas | Clientes, contactos, tarifas, juegos, proyectos y encargos (volumen ponderado e importe); tareas con todas sus vistas, plantillas y recurrencia; tiempo, consultas, panel de inicio y notificaciones; importador de ClickUp y CSV | Funciona todo el flujo: cliente → juego → proyecto → encargo → tareas → tiempo → entregado       |
| 2 · Finanzas           | Estados de facturación, registro de facturas, resumen para facturar, gastos, informes y gráficos, exportación para la gestoría                                                                                                    | Un encargo entregado pasa a facturado y a cobrado, y los informes cuadran con los datos          |
| 3 · Páginas y tablas   | Editor por bloques, árbol, plantillas, menciones y versiones; tablas personalizadas con vistas; recursos por juego; importadores de Notion y de Excel/Sheets                                                                      | Puedes migrar tu Notion y tus hojas de cálculo                                                   |
| 4 · Corpus             | Fichas y flujo de construcción, importación de textos, concordanciador, anotación, estadísticas, exportaciones y versiones                                                                                                        | Se importa un Excel KO-ES, se busca, se anota y se exporta a TMX/TXT                             |
| 5 · Académico          | Publicaciones, envíos y revistas; biblioteca con PDF, notas, citas APA 7 e importación BibTeX/RIS                                                                                                                                 | Importas tu biblioteca de Zotero y sigues un artículo desde la idea hasta la publicación         |
| 6 · Extras             | Calendario unificado completo, objetivos anuales, sincronización entre ordenadores por carpeta en la nube, análisis morfológico del coreano (opcional) y mejoras de rendimiento                                                   | Se decide según lo que pidas después de usar la app                                              |

## 9. Estabilidad y calidad

- TypeScript estricto en todo el código y validación con Zod tanto en la entrada del motor como en los formularios.
- **Pruebas**:
  - unitarias de los cálculos, importadores, exportadores y la normalización de texto;
  - de integración de la API sobre una base de datos temporal, incluidas las migraciones y las copias;
  - de extremo a extremo de los flujos clave con Playwright;
  - de arranque de la app de escritorio en Linux (con xvfb);
  - de **autocomprobación de la app empaquetada** en los ejecutores Windows y macOS de GitHub Actions: la app arranca en modo de prueba, migra la base de datos, hace una copia, carga la interfaz y debe terminar sin errores.
- **CI**: en cada push se ejecutan lint, formato, comprobación de tipos, pruebas, compilación y e2e. Los instaladores solo se compilan al publicar una versión, para ahorrar minutos de GitHub Actions, sobre todo los de macOS.
- **Robustez**:
  - solo se puede abrir una instancia de la app;
  - las escrituras van en transacciones y el autoguardado tiene indicador;
  - los cambios se ven al momento en pantalla y se deshacen solos si fallan;
  - los errores se explican en español, se registran en `logs/` y se pueden copiar con el botón «Copiar informe de error»;
  - si el motor se detiene, la ventana lo reinicia y muestra «Reconectando…».
- **Rendimiento**: arranque en menos de 3 s, listas de 10 000 tareas fluidas gracias a la virtualización y concordancias sobre 1 millón de segmentos en menos de 1 s (en consultas de 3 o más caracteres).
- Las versiones de las dependencias quedan fijadas en `package-lock.json`.

## 10. Riesgos y cómo se cubren

| Riesgo                                                                                           | Cómo se cubre                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Los instaladores sin firma provocan avisos de Windows SmartScreen y de macOS Gatekeeper          | El manual explica cómo abrirlos paso a paso. Más adelante se puede firmar con una cuenta de Apple Developer (99 $/año) y un certificado para Windows. |
| Sin firma, macOS no permite actualizar la app automáticamente                                    | Se instala la versión nueva encima; tus datos se conservan y se migran con una copia previa                                                           |
| better-sqlite3 es un módulo nativo que hay que compilar para Electron                            | Se compila en ejecutores nativos de cada sistema y se pasa la autocomprobación del instalable                                                         |
| Una base de datos SQLite dentro de una carpeta sincronizada (OneDrive, iCloud) puede corromperse | Los datos de trabajo quedan fuera de la nube; solo las copias van a la carpeta sincronizada                                                           |
| El alcance es muy amplio                                                                         | Las fases están cerradas y son usables; cada una se prueba antes de pasar a la siguiente                                                              |
| Derechos sobre los textos del corpus                                                             | Cada juego tiene campos de permisos y fuente, y el material bajo NDA se mantiene separado                                                             |

## 11. Primeros pasos tras tu aprobación

1. Guardar este briefing como `docs/BRIEFING.md` y hacer el primer commit en `claude/inspiring-edison-o70e3v`.
2. Completar la Fase 0, hacer push y lanzar `release.yml` para obtener los primeros instaladores de prueba.
3. Seguir con la Fase 1 y las siguientes, con un commit por bloque funcional y un push al terminar cada fase. No se abrirá un pull request salvo que lo pidas.

## 12. Verificación

- **En el contenedor de desarrollo**: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (pruebas unitarias y de integración), `npm run test:e2e` (Playwright con Chromium contra el motor en modo web) y `xvfb-run npm run test:electron` (arranque de la app de escritorio).
- **Datos de ejemplo** (`npm run seed`): clientes, juegos, proyectos y encargos, un Excel KO-ES pequeño para el corpus y un archivo .bib de prueba. Con ellos se revisa cada módulo y se hacen capturas con Playwright.
- **Instaladores**: se ejecuta `release.yml` en GitHub Actions (Windows y macOS) y se revisan los registros con las herramientas de GitHub. La autocomprobación de la app empaquetada tiene que superarse en ambos sistemas.
- **Al cerrar cada fase**: te pasaré una lista corta de comprobaciones manuales.

## Fuentes

- [Infoautónomos: Verifactu, cuándo es obligatorio y a quién afecta](https://www.infoautonomos.com/blog/verifactu-cuando-es-obligatorio-a-quien-afecta/)
- [Maldita.es: Hacienda retrasa a 2027 la entrada en vigor de Verifactu](https://maldita.es/malditobulo/20251203/hacienda-retrasa-a-2027-la-entrada-en-vigor-de-verifactu-el-sistema-de-verificacion-de-facturas-para-pymes-y-autonomos)
