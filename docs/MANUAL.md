# Manual de L10N Suite

## Instalación

Descarga el instalador de la última versión en la página **Releases** del repositorio en GitHub:

- **Windows:** `L10N-Suite-<versión>-Windows-x64.exe`
- **macOS (Apple Silicon, M1–M4):** `L10N-Suite-<versión>-macOS-arm64.dmg`

Los instaladores no llevan firma digital de pago, así que el sistema avisará la primera vez. Es normal.

### Windows

1. Abre el `.exe`. Si aparece «Windows protegió su PC», pulsa **Más información → Ejecutar de todas formas**.
2. Sigue el asistente. Puedes elegir la carpeta de instalación.
3. Abre **L10N Suite** desde el menú Inicio o el acceso directo del escritorio.

### macOS

1. Abre el `.dmg` y arrastra **L10N Suite** a la carpeta **Aplicaciones**.
2. Abre la app. macOS dirá que no puede verificar al desarrollador: pulsa **Aceptar**.
3. Ve a **Ajustes del Sistema → Privacidad y seguridad**. Abajo verás un aviso sobre L10N Suite: pulsa **Abrir igualmente** y confirma con tu contraseña.
4. A partir de ahí se abre con normalidad.

Si macOS dice que la app «está dañada», abre Terminal y ejecuta:

```
xattr -dr com.apple.quarantine "/Applications/L10N Suite.app"
```

### Actualizar

Descarga la versión nueva e instálala encima de la anterior. Tus datos no se tocan: al abrir la versión nueva, la app hace una copia de seguridad y después adapta los datos si hace falta.

## Dónde están tus datos

| Sistema | Carpeta                                    |
| ------- | ------------------------------------------ |
| Windows | `%APPDATA%\L10N Suite`                     |
| macOS   | `~/Library/Application Support/L10N Suite` |

Dentro de esa carpeta están:

- `datos/l10n.db`: la base de datos;
- `datos/adjuntos/`: los archivos adjuntos;
- `copias/`: las copias de seguridad, salvo que elijas otra carpeta;
- `logs/`: los registros, útiles si algo falla.

Puedes abrirla desde **Ajustes → Acerca de → Abrir carpeta de datos**.

> No pongas la carpeta de datos dentro de OneDrive, iCloud Drive o Dropbox: una base de datos abierta en una carpeta que se sincroniza puede corromperse. Para tener una copia en la nube, elige allí la **carpeta de las copias de seguridad**.

## Copias de seguridad

- **Automáticas:**
  - al abrir la app, si la última tiene más de 24 horas;
  - al cerrarla, si ha habido cambios;
  - antes de cada actualización.
- **Manuales:** en **Ajustes → Copias de seguridad → Hacer copia ahora**.
- **Qué se conserva:** 7 copias diarias, 4 semanales y 12 mensuales. Las cifras se pueden cambiar.
- **Verificación:** cada copia se comprueba antes de guardarse, y los adjuntos se copian también a la carpeta de copias.
- **Restaurar:** elige una copia y pulsa **Restaurar**. Antes se guarda una copia del estado actual, por si quieres volver atrás.
- **Si los datos se dañan:** si al arrancar la base de datos no supera la comprobación de integridad, la app no la toca y te ofrece restaurar una copia.

## Usar la app en otro ordenador

Los datos viven en tu ordenador principal. Para llevarlos al otro:

1. En el principal: **Ajustes → Copias de seguridad → Exportar copia completa**. Se genera un ZIP con todos los datos y adjuntos.
2. Pasa el ZIP al otro ordenador (memoria USB, nube…).
3. En el otro: **Importar copia completa**. Sus datos se sustituyen por los del ZIP; antes se guarda una copia de seguridad de lo que hubiera.

El ZIP incluye también una carpeta `legible/` con el contenido de cada tabla en JSON, para poder consultarlo sin la app.

## Papelera

Lo que borras va a la **Papelera**, donde se guarda 30 días. Justo después de borrar también puedes pulsar **Deshacer** en el aviso.

## Trabajo: clientes, juegos, proyectos y encargos

- **Clientes:** datos fiscales, condiciones (moneda, plazo de pago, IVA, IRPF), contactos, NDA, plataforma del cliente y **tarifas**. En «Datos» puedes ajustar la **rejilla de coincidencias del CAT**, es decir, cuánto paga el cliente por cada banda (100 %, 95–99 %…).
- **Juegos:** la ficha central del juego (títulos KO/ES/EN, desarrolladora, géneros, plataformas, modelo de negocio…). Desde ella ves sus proyectos, encargos y tareas.
- **Proyectos:** reúnen cliente, juego y par de idiomas. Puedes asociarles una carpeta del ordenador y abrirla con un clic.
- **Encargos (lotes):** cada parche, evento, DLC o ficha de tienda. Al crearlo:
  - se aplica sola la tarifa del cliente que coincida en servicio, unidad e idiomas, y si no hay, la general de **Ajustes → Trabajo**;
  - con **Análisis por coincidencias** introduces el recuento por bandas o lo pegas desde Excel o desde el informe del CAT; la app calcula el volumen ponderado y el importe;
  - puedes fijar el importe a mano;
  - la plantilla «Encargo estándar» crea las tareas habituales (traducir, consultas, QA con checklist, entregar, registrar para facturar) con fechas relativas a la entrega.
- **Consultas al cliente:** registra cada duda (ID de cadena, texto origen, pregunta y respuesta) y expórtalas a Excel para enviarlas.

## Tareas

- **Vistas:** «Mi trabajo» (vencidas, hoy, próximos 7 días…), «Lista» (por estado) y «Tablero» (kanban: arrastra las tarjetas entre columnas).
- **Alta rápida:** escribe y pulsa Intro. Si terminas con «hoy», «mañana» o «pasado mañana» se pone la fecha, y «!» al final la marca como urgente. Por ejemplo: «Enviar consultas mañana !».
- **Panel lateral:** al pulsar una tarea se abre el panel con estado, prioridad, fechas, estimación, repetición, proyecto, encargo, juego, etiquetas, descripción, checklist, subtareas y comentarios.
- **Tareas que se repiten:** cada día, semana, mes, mes en el último día laborable, trimestre o año. Al completarla se crea la siguiente.
- **Áreas y listas:** organizan las tareas que no son de un proyecto, como los espacios y listas de ClickUp. Se configuran en **Ajustes → Trabajo**, junto con los estados y las plantillas.

## Tiempo y calendario

- **Cronómetro:** el de la barra superior funciona con cualquier proyecto, encargo o tarea, y solo hay uno en marcha. También puedes añadir tiempo a mano en **Tiempo**.
- **Datos de cada encargo:** muestra el tiempo dedicado y el €/hora efectivo.
- **Calendario:** reúne las entregas y las tareas con fecha. Arrastra un elemento a otro día para cambiar su fecha.
- **Avisos:** la app avisa de las entregas en menos de 24 horas, las entregas atrasadas y las tareas vencidas. Se pueden desactivar en **Ajustes → Preferencias**.

## Importar desde ClickUp, Google Sheets o Excel

En **Ajustes → Importar**:

1. Elige qué importar: clientes, juegos, proyectos o tareas.
2. Sube un archivo .csv o .xlsx:
   - en **ClickUp**, exporta la lista o el espacio a CSV;
   - en **Google Sheets**, usa **Archivo → Descargar → Microsoft Excel**.
3. Revisa a qué campo va cada columna (la app lo propone) y la vista previa.
4. Pulsa **Importar**. Si algo no sale como esperabas, en «Importaciones anteriores» puedes **deshacer** la importación entera.

## Atajos de teclado

| Atajo           | Acción                                 |
| --------------- | -------------------------------------- |
| `Ctrl+K` / `⌘K` | Buscar fichas e ir a cualquier sección |

## Si algo falla

- **Una pantalla da error:** pulsa **Copiar informe de error**.
- **Registros:** están en **Ayuda → Abrir carpeta de registros**.
- **El motor de la app se detiene:** la ventana muestra «Reconectando…» y lo vuelve a arrancar sola.
