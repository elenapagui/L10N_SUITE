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

### Sincronización automática (recomendada)

Para trabajar en dos ordenadores, uno cada vez, a través de una carpeta que ya sincronice tu servicio en la nube (OneDrive, iCloud Drive, Dropbox, Google Drive…):

1. En los dos ordenadores, **Ajustes → Sincronización**: elige **la misma carpeta de la nube** y pon un nombre a cada ordenador («Sobremesa», «Portátil»).
2. Trabaja con normalidad. **Al cerrar la app**, se deja en esa carpeta una copia de tus datos y adjuntos (en la subcarpeta «L10N Suite - sincronizacion»).
3. **Al abrir la app en el otro ordenador**, si hay una versión más reciente y allí no hay cambios sin enviar, se carga sola. Antes se hace una copia de seguridad y un aviso te lo confirma.

Más cosas que conviene saber:

- **Antes de abrir la app en el otro ordenador**, espera a que el servicio en la nube termine de sincronizar. Si la copia aún no ha llegado entera, la app no la carga y te lo dice.
- **Si has hecho cambios en los dos ordenadores**, la app te pide elegir con qué versión te quedas. La otra se guarda como copia de seguridad («Antes de sincronizar»).
- **El icono de nube** de la barra superior indica el estado: sincronizado, cambios sin enviar, cambios del otro ordenador para cargar o conflicto. Si lo pulsas, abre los ajustes. **Enviar ahora** deja la copia sin cerrar la app.
- **Tus datos de trabajo nunca están directamente en la nube**: se trabaja con la base de datos de tu ordenador y solo se deja allí una copia. Cada ordenador mantiene su propia carpeta de copias de seguridad.
- **Si un ordenador tiene una versión más antigua de la app**, no cargará los datos del otro: actualízala antes.

### A mano, con una copia completa

1. En el principal: **Ajustes → Copias de seguridad → Exportar copia completa**. Se genera un ZIP con todos los datos y adjuntos.
2. Pasa el ZIP al otro ordenador (memoria USB, nube…).
3. En el otro: **Importar copia completa**. Sus datos se sustituyen por los del ZIP; antes se guarda una copia de seguridad de lo que hubiera.

El ZIP incluye también una carpeta `legible/` con el contenido de cada tabla en JSON, para poder consultarlo sin la app.

## Papelera

Lo que borras va a la **Papelera**, donde se guarda 30 días. Justo después de borrar también puedes pulsar **Deshacer** en el aviso.

## Trabajo: clientes, juegos, proyectos y encargos

- **Clientes:** datos fiscales, condiciones (moneda, plazo de pago, IVA, IRPF), contactos, NDA, plataforma del cliente y **tarifas**. En «Datos» puedes ajustar la **rejilla de coincidencias del CAT**, es decir, cuánto paga el cliente por cada banda (100 %, 95–99 %…).
- **Juegos:** la ficha central del juego (títulos KO/ES/EN, desarrolladora, géneros, plataformas, modelo de negocio…). Desde ella ves sus proyectos, encargos y tareas.
- **Proyectos:** reúnen cliente, juego y par de idiomas (coreano, español o inglés). Puedes asociarles una carpeta del ordenador y abrirla con un clic. Si cambias el cliente o los idiomas, la app te propone poner la tarifa nueva en los encargos que aún no has facturado.
- **Encargos (lotes):** cada parche, evento, DLC o ficha de tienda. Al crearlo:
  - al elegir el servicio (traducción, revisión, LQA…), la app busca la tarifa del cliente para ese servicio y ese par de idiomas y rellena **la unidad y la tarifa**: por ejemplo, 0,035 $/carácter. Si el cliente no tiene, usa la general de **Ajustes → Trabajo**. Debajo verás de dónde sale («Tarifa de Hangul Studio para traducción KO→ES») o un enlace para añadirla si no hay ninguna. Puedes cambiarla a mano;
  - en la ficha del encargo, si cambias el servicio o la unidad, la tarifa se actualiza sola, salvo que la hubieras puesto a mano. Si la tarifa del encargo no es la vigente, el botón **Aplicar** la pone. Los encargos ya facturados o con importe fijado a mano no se tocan;
  - **si aparece «Sin tarifa»**, la app explica por qué: el cliente no tiene tarifa para ese servicio, la que tiene es para otro par de idiomas o por otra unidad, el proyecto no tiene cliente o hay dos clientes con el mismo nombre y la tarifa está en el otro. Debajo verás las tarifas más parecidas con el botón **Usar esta tarifa**, que también pone la unidad;
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

## Revisión semanal

**Revisión semanal** (en la barra lateral, debajo de Inicio) resume una semana de lunes a domingo:

- **Lo que hiciste:** encargos entregados (con volumen e importe), lo facturado y cobrado, las horas por área, las tareas completadas, los cambios en tus publicaciones y envíos, las lecturas terminadas, las referencias nuevas y los segmentos añadidos al corpus.
- **Lo que viene:** entregas, tareas con fecha, plazos académicos, cobros previstos y tareas vencidas.

Por defecto muestra la semana anterior, y los lunes la app te avisa al abrirla. Con las flechas cambias de semana, y **Imprimir o PDF** la guarda.

## Tiempo y calendario

- **Cronómetro:** el de la barra superior funciona con cualquier proyecto, encargo o tarea, y solo hay uno en marcha. También puedes añadir tiempo a mano en **Tiempo**.
- **Datos de cada encargo:** muestra el tiempo dedicado y el €/hora efectivo.
- **Calendario:** reúne las entregas, las tareas con fecha, los plazos de tus publicaciones, las fechas para enviar cambios a una revista y los vencimientos de cobro de las facturas. Arrastra una entrega, una tarea o un plazo a otro día para cambiar su fecha.
- **Avisos:** la app avisa de las entregas en menos de 24 horas, las entregas atrasadas y las tareas vencidas. Se pueden desactivar en **Ajustes → Preferencias**.

## Finanzas: facturación, gastos e informes

La app **no emite facturas**: las emites con tu programa de facturación (o tu gestoría) y aquí llevas el seguimiento.

- **Facturación → Por facturar:** los encargos entregados que aún no están en ninguna factura, agrupados por cliente y moneda.
  - **Resumen para facturar** descarga un Excel con los encargos, volúmenes e importes para copiarlos en tu programa. Lleva el aviso «No es una factura».
  - **Registrar factura** guarda el número, la fecha, los encargos incluidos y otros conceptos (recargos, gestión de terminología…). El IVA, el IRPF y el vencimiento salen de la ficha del cliente o, si no los tiene, de **Ajustes**. Si la moneda no es la principal, indica el tipo de cambio que aplicas.
- **Facturación → Facturas:** al abrir una factura puedes marcarla como cobrada (con la fecha de cobro), adjuntar su PDF, descargar el resumen o anularla. Al anularla, sus encargos vuelven a «Por facturar». Las facturas vencidas aparecen en rojo, en el inicio y como aviso.
- **Gastos:** concepto, fecha, proveedor, categoría, base, IVA soportado y si es deducible. Después de guardar puedes adjuntar el justificante.
- **Informes → Previsión de cobros:** lo que esperas cobrar a partir de hoy (con IVA e IRPF):
  - lo **vencido sin cobrar**, lo que entrará en los **próximos 30 días** y el total pendiente;
  - un gráfico por mes con las facturas emitidas (en su vencimiento) y los encargos aún sin facturar. Para estos, la app supone que los facturas a fin del mes de entrega y que el cliente paga en su plazo;
  - el desglose por cliente y la lista de partidas, cada una con un enlace a su factura o encargo.

  Los importes en otra moneda se convierten con el tipo de tu última factura en esa moneda. Si aún no tienes ninguna, indica un tipo aproximado en **Ajustes → Preferencias → Tipos de cambio aproximados**. El inicio muestra también los **cobros previstos en 30 días**.

- **Informes:** elige el año para ver:
  - facturado, cobrado, gastos, rendimiento neto, pendiente de cobro y €/hora efectivo;
  - un gráfico mensual de lo facturado y los gastos (el botón de la tabla muestra las cifras);
  - los ingresos por cliente, servicio, juego o par de idiomas;
  - la antigüedad de los cobros pendientes y los días medios de cobro de cada cliente;
  - la **rentabilidad por cliente**: encargos entregados, volumen, tarifa media, ingresos, horas registradas, **€/hora efectivo** (solo con los encargos que tienen tiempo registrado), días medios de cobro e importe vencido. Pulsa el título de una columna para ordenar por ella. La ficha de cada cliente muestra también sus ingresos del año, su €/hora y sus días de cobro;
  - el **resumen trimestral** orientativo de los modelos 303 (IVA) y 130 (IRPF). Es una estimación: revísalo siempre con tu gestoría.

  **Excel para la gestoría** descarga las facturas, los gastos y los resúmenes del año o del trimestre.

- Los importes en otras monedas se convierten a la principal con el tipo de cambio de cada factura o gasto.

## Páginas (sustituyen a Notion)

- **Árbol de páginas:** a la izquierda. Arrastra una página sobre otra para meterla dentro, o encima o debajo para cambiar el orden. Con «…» puedes añadirla a favoritas, duplicarla, sacarla a la raíz o eliminarla (se lleva sus subpáginas a la papelera y vuelven con ella si la restauras).
- **Editor por bloques:**
  - escribe «/» para insertar títulos, listas, casillas, desplegables, citas, **avisos**, código, tablas, imágenes, vídeos o archivos;
  - arrastra los bloques con el asa que aparece a su izquierda;
  - las imágenes y archivos que pegues o arrastres se guardan como adjuntos de la página.
- **Menciones:** escribe «@» para enlazar una página, un juego, un cliente, un proyecto, un encargo, una tarea, un término o un personaje. Si escribes un nombre que no existe, puedes crear una subpágina con él. La ficha mencionada muestra «Mencionado en».
- **Guardado automático:** arriba a la derecha verás «Guardado». Si la misma página se modifica en otra ventana, la app avisa en lugar de pisar los cambios.
- **Historial:** el reloj abre las versiones anteriores (se guarda una cada 10 minutos de edición). Puedes verlas y restaurarlas; la versión que tenías se conserva.
- **Plantillas:** guía de estilo, kickoff de proyecto, informe de LQA, acta de reunión, ficha de lectura y plan de artículo.
- **Exportar:** en «…», a Markdown o «Imprimir o guardar en PDF».
- **Importar:** un archivo Markdown suelto desde **Páginas → Importar Markdown**; un espacio de Notion entero desde **Ajustes → Importar** (ver más abajo).

## Tablas (sustituyen a Google Sheets)

- **Crear o importar:** en **Tablas**, crea una tabla vacía o importa un Excel o CSV. Cada hoja del Excel se convierte en una tabla, y la app detecta el tipo de cada columna (número, moneda, porcentaje, fecha, casilla, selección, enlace, correo…). Desde Google Sheets: **Archivo → Descargar → Microsoft Excel**.
- **Columnas:** pulsa el nombre de una columna para editarla, ordenar, moverla, ocultarla o eliminarla; arrastra su borde para cambiar el ancho; «+» añade una nueva. Al cambiar el tipo, los valores se convierten (los que no encajan se vacían).
- **Tipos especiales:**
  - **Selección y selección múltiple:** opciones con color; se crean al escribirlas o al pegar valores nuevos.
  - **Relación:** enlaza cada fila con juegos, clientes, proyectos, encargos, páginas, términos o filas de otra tabla.
  - **Fórmula:** se calcula sola en cada fila. Las columnas van entre llaves y los argumentos se separan con «;»: `REDONDEAR({Palabras} * {Tarifa}; 2)`, `SI({Estado} = "Aceptada"; 1; 0)`, `DIAS({Entrega}; HOY())`, `{Fecha} + 30`. Los decimales se escriben con punto.
- **Como en una hoja de cálculo:** muévete con las flechas, Tab e Intro; escribe para editar; Supr borra; selecciona varias celdas arrastrando o con Mayús; **copia y pega desde Excel** (si pegas más filas de las que hay, se crean); `Ctrl+Z` deshace. El icono ⤢ de cada fila abre su ficha completa.
- **Vistas:** cada tabla puede tener varias vistas (cuadrícula, **tablero** por una selección o casilla, **calendario** por una fecha), cada una con sus filtros, orden, agrupación, columnas visibles y fila de totales (suma, media, mínimo, máximo, recuento…).
- **Exportar:** a Excel o CSV con los filtros y el orden de la vista.

## Recursos de cada juego

En la ficha de cada juego:

- **Glosario:** término en coreano, español e inglés, categoría, estado (propuesto, aprobado o prohibido), contexto, fuente y notas. Añade términos desde la fila superior (Intro para el siguiente). **Importar Excel** reconoce las cabeceras habituales («Coreano», «Español», «Inglés», «Contexto»…); si el archivo no tiene cabeceras, la columna A es el coreano y la B el español. No se duplican los términos que ya existen, y la importación se puede deshacer en **Ajustes → Importar**. **Exportar** genera un Excel con el glosario (A coreano, B español…) y una hoja de personajes.
- **Personajes:** nombres, género gramatical para la concordancia, tratamiento en español (tú, usted…), nivel de habla en coreano (반말, 해요체, 하십시오체) y forma de hablar.
- **Páginas y tablas:** crea la **guía de estilo** del juego desde su plantilla, otras páginas o tablas vinculadas, y consulta qué páginas mencionan el juego.

## Importar desde Notion

1. En Notion: **Configuración → Exportar todo el contenido del espacio** (o «Exportar» en una página), con el formato **Markdown & CSV** e incluyendo las subpáginas.
2. En la app: **Ajustes → Importar → Notion** y elige el ZIP.
3. Todo queda dentro de una página «Importación de Notion · fecha» con la misma jerarquía; las imágenes y archivos pasan a ser adjuntos y cada base de datos se convierte en una tabla. Arrastra las páginas donde quieras.
4. Si algo no ha salido bien, deshaz la importación entera en «Importaciones anteriores».

## Corpus de videojuegos

### Catálogo y fichas

- En **Corpus → Juegos**, **Añadir juego** incorpora al corpus un juego que ya exista en la app. Cada juego tiene su **ficha de corpus**: fase de construcción (identificado → texto obtenido → limpieza → alineación → revisión → anotación → incluido), versión del juego, fecha del texto, método de obtención, idiomas, dirección de traducción (directa KO→ES, a través del inglés o desconocida), empresa de localización, derechos y notas metodológicas.
- **Uso restringido:** marca así el material bajo NDA o sin permiso; no se incluye en las exportaciones ni en las versiones salvo que lo pidas en los filtros. Ningún texto de tus encargos entra en el corpus de forma automática.

### Importar textos

1. En la ficha de corpus del juego, **Importar textos** y elige un Excel o CSV con una columna por idioma.
2. La app propone el uso de cada columna (coreano, español, inglés, ID de cadena, hablante, contexto…). Si el archivo no tiene cabeceras, la columna A es el coreano y la B el español.
3. Decide qué hacer con las etiquetas de formato (`<color>`, `[b]`…) y con las variables (`{0}`, `%s`, `$NAME$`…): conservarlas, quitarlas o sustituir las variables por ⟨VAR⟩. El texto se normaliza (NFC), y «\n» escrito se puede convertir en salto de línea.
4. Al terminar verás cuántas filas estaban vacías, desalineadas (les falta algún idioma) o repetidas. La importación se puede deshacer en **Ajustes → Importar**.

En el documento puedes corregir cualquier segmento (lápiz) o eliminarlo.

### Concordancias

- Escribe lo que buscas y elige el modo: **contiene** (sin distinguir mayúsculas ni tildes), **palabra completa**, **empieza por** (útil con las partículas coreanas: «마법사» encuentra «마법사가»), **comodines** (`*` y `?`), **expresión regular** o, en coreano, **lema**.
- **Lema (coreano):** encuentra todas las formas de una palabra gracias al análisis morfológico. Por ejemplo, «먹다» (o «먹었어요») encuentra 먹었다, 먹고, 먹는…, y «마법사» encuentra 마법사가, 마법사를, 마법사의… e incluso compuestos como 흑마법사. Se resalta la palabra entera. Necesita el analizador (ver **Estadísticas**).
- **Condiciones combinadas:** añade condiciones en otros idiomas y marca «Excluir» para descartar segmentos. Por ejemplo: coreano contiene «스킬» y, excluyendo, español contiene «habilidad».
- **Filtros:** juego, género, plataforma, año, tipo de texto, dirección de traducción, hablante y etiquetas de anotación.
- Los resultados se muestran en formato KWIC con la traducción debajo. Ordénalos por el contexto izquierdo o derecho, pulsa una línea para ver el segmento completo, anotar la coincidencia o abrirla en su documento, y exporta todas las coincidencias a Excel. Las búsquedas se pueden guardar.
- Con 3 o más caracteres la búsqueda usa el índice y es inmediata; las de 1 o 2 sílabas (frecuentes en coreano) también funcionan, pero tardan algo más en corpus muy grandes.

### Anotación

- Selecciona un fragmento de texto en un documento (o pulsa **Anotar la coincidencia** en el concordanciador) y elige una etiqueta; puedes añadir un comentario. El rotulador de cada fila anota el segmento entero.
- El **esquema de anotación** (técnicas de traducción, honoríficos y tratamiento, humor, referencias culturales, nombres propios, variación lingüística…) se edita en **Corpus → Esquema de anotación**: añade subetiquetas, cambia nombres y colores. Filtrar por una etiqueta incluye sus subetiquetas.

### Estadísticas

Número de juegos, documentos, segmentos y anotaciones; por idioma, caracteres (sin espacios), **eojeol** en coreano y palabras en el resto, formas distintas y media por segmento; distribución por tipo de texto, género, plataforma, año, fase y dirección; y **lista de frecuencias** (con o sin palabras vacías) exportable a CSV. Todo se puede calcular sobre un subcorpus filtrado.

**Análisis morfológico del coreano.** Arriba, en Estadísticas, puedes descargar el analizador libre **Kiwi** (unos 90 MB, una sola vez; después funciona sin conexión). Analiza en segundo plano todos los textos coreanos, separando partículas y terminaciones (마법사 + 가, 먹 + 었 + 다), y lo vuelve a hacer con los textos que importes o corrijas. Con él:

- el concordanciador permite buscar por **lema**;
- la lista de frecuencias del coreano puede contar **lemas** con su categoría (sustantivo, verbo, adjetivo, partícula…), con la opción de quitar partículas y terminaciones.

Kiwi acierta en la gran mayoría de los casos, pero puede dividir de forma inesperada algunos préstamos y nombres propios poco frecuentes.

### Exportar y versiones

- **Exportar:** TMX, TXT por idioma (un segmento por línea, también un archivo por juego, para AntConc, Sketch Engine o LancsBox), Excel, CSV o JSON, del corpus completo o de un subcorpus.
- **Versiones:** fija el estado del corpus en una fecha («v0.3»). Cada versión guarda un ZIP con TMX, TXT, CSV y un manifiesto, y te da el texto para citarla en tus artículos.

## Académico

### Publicaciones

- En **Publicaciones** cada artículo, capítulo, ponencia, reseña o libro es una tarjeta del **tablero**. El tablero tiene una columna por estado (idea → esquema → redacción → revisión interna → enviado → revisión por pares → cambios solicitados → reenviado → aceptado → en prensa → publicado, más «rechazado o reorientado»). Arrastra la tarjeta para cambiarla de estado. La vista **Lista** muestra lo mismo en una tabla. Arriba aparecen los próximos plazos.
- **Nueva publicación** crea la ficha con tu nombre en la autoría (lo toma de **Ajustes → Perfil**). La ficha tiene varias pestañas:
  - **Ficha:** tipo, revista, plazo, idioma, extensión, palabras clave, resumen, versión del corpus que has usado, juegos estudiados, DOI, URL y la cita final para tu CV. En **Autoría** puedes añadir coautores y coautoras con su afiliación y ORCID, cambiar el orden y marcar la autoría de correspondencia (★).
  - **Envíos:** cada envío a una revista o congreso, con el ID del manuscrito, las fechas, la decisión, el plazo para enviar los cambios y notas (informes de revisión, carta de respuesta). Cada envío tiene sus propios archivos. La decisión actualiza sola el estado de la publicación: «Cambios mayores» la pasa a «Cambios solicitados», un nuevo envío a «Reenviado», etc.
  - **Tareas:** las tareas de la publicación, que también aparecen en **Tareas** dentro del área Académico.
  - **Bibliografía:** las referencias de tu biblioteca que citas, ordenadas en APA 7. Puedes copiarla con formato (cursivas incluidas) para pegarla en Word o exportarla a BibTeX, RIS o CSL-JSON.
  - **Archivos** (borradores y material complementario) y **Notas**.
- La barra de progreso indica en qué punto está la publicación, y arriba ves cuántos días lleva en ese estado.

### Revistas

En **Revistas** guardas dónde publicas o quieres publicar: ISSN, editorial, idiomas, web y normas para autores, indexación (JCR, SJR, Scopus, ESCI, Dialnet…), cuartil, tipo de acceso abierto y APC, estilo de citas y límite de palabras. A partir de tus envíos, la app calcula el **tiempo medio de respuesta** y la **tasa de aceptación** (aceptados entre las decisiones finales).

### Biblioteca de referencias

- **Añadir** te ofrece cuatro formas de crear referencias:
  - **Por DOI:** la app descarga los datos (necesita conexión a internet) y te avisa si la referencia ya está en la biblioteca.
  - **Pegar BibTeX o RIS:** copia las referencias desde Google Académico, el catálogo de una biblioteca o una base de datos.
  - **Importar archivo:** .bib, .ris o CSL-JSON. Desde **Zotero**, selecciona la colección y usa **Exportar colección… → BibTeX**; desde **Mendeley**, **Exportar → BibTeX** o **RIS**.
  - **Manual:** rellenas la ficha a mano.
- Las referencias repetidas (mismo DOI, o mismo título y año) no se vuelven a crear. Una importación se puede deshacer entera en **Ajustes → Importar**.
- Pulsa una referencia para abrir su ficha. Arriba ves la referencia en **APA 7** y la cita en el texto («(Bernal-Merino, 2015)»), que puedes copiar. La ficha tiene cuatro pestañas:
  - **Ficha:** los datos bibliográficos. En la autoría, escribe una persona por línea («Apellidos, Nombre»). Para una institución, empieza la línea con «=».
  - **Lectura y citas:** estado de lectura (pendiente, leyendo, leída), valoración, notas de lectura y **citas textuales** con su página. Cada cita se puede copiar ya con su referencia («(Bernal-Merino, 2015, p. 42)»).
  - **PDF:** adjunta el PDF y léelo dentro de la app. Su texto se extrae y se incluye en la búsqueda.
  - **Vínculos:** colecciones, juegos y publicaciones en las que la citas.
- A la izquierda puedes filtrar por estado de lectura o por **colección** y crear colecciones nuevas. El buscador encuentra referencias por título, autoría, revista, palabras clave, notas, citas y texto del PDF. Las referencias también aparecen en la búsqueda global (`Ctrl+K`).
- Selecciona varias referencias para añadirlas a una colección, copiarlas en APA 7 (ya ordenadas) o exportarlas. Sin selección, **Exportar** descarga la vista actual.

## Importar desde ClickUp, Google Sheets o Excel

En **Ajustes → Importar**:

1. Elige qué importar: clientes, juegos, proyectos o tareas.
2. Sube un archivo .csv o .xlsx:
   - en **ClickUp**, exporta la lista o el espacio a CSV;
   - en **Google Sheets**, usa **Archivo → Descargar → Microsoft Excel**.
3. Revisa a qué campo va cada columna (la app lo propone) y la vista previa.
4. Pulsa **Importar**. Si algo no sale como esperabas, en «Importaciones anteriores» puedes **deshacer** la importación entera.

## Atajos de teclado

| Atajo               | Acción                                                    |
| ------------------- | --------------------------------------------------------- |
| `Ctrl+K` / `⌘K`     | Buscar fichas e ir a cualquier sección                    |
| `/`                 | En una página: insertar un bloque                         |
| `@`                 | En una página: mencionar una ficha                        |
| `Ctrl+C` / `Ctrl+V` | En una tabla: copiar y pegar celdas (también desde Excel) |
| `Ctrl+Z`            | En una tabla: deshacer el último cambio                   |
| `Intro` / `F2`      | En una tabla: editar la celda                             |
| `Supr`              | En una tabla: vaciar las celdas seleccionadas             |

## Si algo falla

- **Una pantalla da error:** pulsa **Copiar informe de error**.
- **Registros:** están en **Ayuda → Abrir carpeta de registros**.
- **El motor de la app se detiene:** la ventana muestra «Reconectando…» y lo vuelve a arrancar sola. Si no lo consigue tras varios intentos, aparece el botón **Reintentar**.
- **Al cerrar, la ventana tarda en desaparecer:** muestra «Guardando una copia y sincronizando…» mientras hace la copia al cerrar y deja la copia de sincronización. Espera a que termine.
