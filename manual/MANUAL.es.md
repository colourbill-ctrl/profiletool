<!-- (c) 2026 William Li -->

<!-- es translation of MANUAL.md. Translate the text; keep every {#anchor src=…} exactly as it is. -->

# ICC Profile Tool — Manual del usuario {#icc-profile-tool-user-manual src=38bba1de}

**ICC Profile Tool** (profiletool; en la interfaz en español, **Herramienta de perfiles ICC**) es una herramienta basada en el navegador para inspeccionar, validar y editar de ida y vuelta perfiles de color **ICC.1** e **ICC.2 (iccMAX)**. Se ejecuta íntegramente en el navegador —sin subir archivos ni instalar nada— mediante una compilación WebAssembly de [iccDEV](https://github.com/InternationalColorConsortium/iccDEV), la implementación de demostración oficial de IccProfLib del ICC.

**Qué puedes hacer:**

- **Explorar el encabezado**: todos los campos del encabezado de 128 bytes del perfil, decodificados en texto legible.
- **Explorar el directorio de etiquetas**: cada etiqueta con su firma, tipo, desplazamiento en bytes, tamaño y bytes de relleno. Haz clic en cualquier etiqueta para desplegar una descripción completa específica de su tipo (la misma salida que la vista «Describe» de `wxProfileDump` de iccDEV) y, en las etiquetas que la admiten, una **visualización** integrada: curvas de respuesta tonal, diagramas de cromaticidad, imágenes de CLUT y de gama, nubes de puntos de colores con nombre, además de un **evaluador de transformaciones** de un solo punto.
- **Validar**: ejecuta la lista de comprobación del ICC Profile Assessment Working Group (Seguridad / Conformidad / Calidad), con un veredicto por comprobación y filtrable por categoría.
- **Editar de ida y vuelta**: convierte el perfil a XML o JSON, edítalo en el editor de código integrado, vuelve a convertirlo a ICC y revalídalo. El botón de guardar descarga el binario editado.
- **Encadenar perfiles**: en la pestaña **Enlazar**, arrastra perfiles del conjunto a una cadena ordenada y conviértela en un **DeviceLink**, **transforma una imagen** a través de ella (con control total de la codificación de salida, la compresión, la disposición planar y la incrustación ICC) o **transforma un conjunto de datos de color**.
- **Trabajar con HDR**: comprueba un perfil frente a las reglas de ICC.1 para perfiles HDR ColorSpace (cláusula 8.7.1), lee sus puntos de código cICP y representa su curva de ganancia adaptativa a cualquier margen de pantalla. La pestaña **HDR** muestra una imagen HDR en tu pantalla, y **Ajustes → Entorno** indica qué pueden hacer este navegador y esta pantalla.
- **Abrir desde chardata**: abre aquí directamente un perfil cargado en [chardata](https://chardata.colourbill.com/); los bytes se transfieren dentro del navegador mediante `postMessage`.
- **Abrir con una URL**: abre un enlace que indica a la herramienta un perfil alojado en la web y, opcionalmente, la pestaña en la que empezar (p. ej., `…/profiletool#url=…&tab=VAL`).

Todo se ejecuta en el cliente. Los bytes del perfil nunca salen de la pestaña del navegador.

<div class="note">
<strong>La compatibilidad con ICC.2 (iccMAX) es parcial.</strong> Los perfiles ICC.2 se cargan, inspeccionan, validan y editan de ida y vuelta igual que los ICC.1: la lista de comprobación incluye comprobaciones específicas de iccMAX, se decodifican el PCS espectral y las etiquetas de elementos de procesamiento múltiple (MPE), y los motores de transformación se compilan con la pila iccMAX completa. Aún no se cubren: los flujos de trabajo <strong>ICS</strong> (Interchange Color Space) de varias partes, la selección de un <em>subperfil</em> V5 al aplicar una transformación y la búsqueda inversa en algunos perfiles ICC.2. Cabe esperar carencias en las funciones más exóticas de ICC.2; se van cubriendo versión a versión.
</div>

<div class="note">
<strong>La compatibilidad con perfiles HDR ColorSpace sigue un borrador.</strong> Las comprobaciones HDR, las vistas de <code>headroomAdaptiveGainCurveTag</code> y la pestaña HDR implementan la enmienda HDR de ICC.1 tal como está actualmente. La enmienda aún no se ha publicado, por lo que algunos detalles pueden cambiar antes de su publicación.
</div>

---

## Contenido {#contents src=54605fa3}

1. [El espacio de trabajo](#1-the-workspace)
2. [Panel de ajustes](#2-settings-panel)
3. [Vistas del perfil](#3-profile-views)
   - [Encabezado](#3-1-header)
   - [Etiquetas](#3-2-tags)
   - [Validación](#3-3-validation)
   - [Análisis](#3-4-analysis)
   - [XML](#3-5-xml)
   - [JSON](#3-6-json)
4. [Pestaña Enlazar](#4-combine-tab)
   - [Crear una cadena](#4-1-building-a-chain)
   - [Crear DeviceLink](#4-2-make-devicelink)
   - [Transformar imagen](#4-3-transform-image)
   - [Transformar datos](#4-4-transform-data)
   - [Cambio de observador](#4-5-observer-change)
   - [Pestañas Comparar y Espectral](#4-6-compare-and-spectral-tabs)
   - [Pestaña HDR](#4-7-hdr-tab)
5. [Edición de ida y vuelta](#5-round-trip-editing)
6. [Abrir desde chardata](#6-launching-from-chardata)
7. [Abrir con una URL](#7-launching-with-a-url)
8. [Móvil](#8-mobile)
9. [Límites y seguridad](#9-limits-and-security)

---

## 1. El espacio de trabajo {#1-the-workspace src=4bc9350f}

profiletool es un **banco de trabajo multiperfil**. La ventana tiene tres partes:

- el panel **Perfiles** a la izquierda: el *conjunto* de todo lo que has cargado;
- el **lienzo** a la derecha, con cinco pestañas en la parte superior: **Perfil**, **Comparar**, **Enlazar**, **Espectral** y **HDR**;
- el panel lateral de **Ajustes** en el borde derecho (consulta [Panel de ajustes](#2-settings-panel)).

### Cargar perfiles {#loading-profiles src=2cd0f653}

Puedes cargar archivos de dos maneras:

- Haz clic en **Cargar perfiles** en la parte superior del panel Perfiles y elige uno o varios archivos, o bien
- **Arrastra y suelta** los archivos sobre el panel Perfiles.

Puedes cargar perfiles `.icc` / `.icm` *e* imágenes. Si sueltas un **TIFF, PNG, JPEG, HEIC o AVIF**, la herramienta extrae su **perfil ICC incrustado** y lo añade al conjunto. Solo lee los metadatos del archivo, nunca los píxeles. En HEIC y AVIF recorre las cajas (boxes) del archivo, de modo que funciona en todos los navegadores, incluso en los que no pueden mostrar esos formatos. Un archivo **JPEG XL** también se rechaza: su perfil está comprimido dentro del codestream, que profiletool todavía no descomprime. Los vídeos y archivos raw de cámara que comparten el contenedor de HEIC (MP4, QuickTime, Canon CR3) no se tratan como imágenes. Un archivo **OpenEXR** o **Radiance HDR** (`.hdr`) se rechaza indicando el motivo: ninguno de los dos formatos tiene un lugar para un perfil ICC. OpenEXR declara su color mediante cromaticidades, y Radiance HDR mediante una línea de encabezado `PRIMARIES` opcional. Para *ver* una imagen, usa la [pestaña HDR](#4-7-hdr-tab). El botón **＋ Nuevo desde .cube** crea un DeviceLink a partir de una LUT `.cube`. El resultado se añade al conjunto y se abre en la pestaña **Perfil**; no se descarga nada hasta que haces clic en **Guardar perfil ICC**.

Un perfil se acepta si sus primeros 36 bytes contienen la firma `acsp` y IccProfLib lo analiza correctamente mediante `ValidateIccProfile`. Los archivos que no lo superan aparecen en un resumen de rechazos con el motivo concreto; sus bytes no se conservan.

### El panel Perfiles {#the-profiles-pane src=04750126}

Los perfiles cargados se agrupan en secciones contraíbles por **clase de perfil** (Input, Display, Output, DeviceLink, ColorSpace, Abstract, Named Color, …). Los **Perfiles HDR ColorSpace** (HDR ColorSpace Profiles) de la cláusula 8.7.1 de ICC.1 tienen en cambio su propia sección en la parte superior (son perfiles de clase ColorSpace, así que se separan de la sección ColorSpace), dividida según la transferencia en **Transferencia lineal** y **Transferencia no lineal (PQ, HLG)**, con la transferencia indicada como distintivo en cada fila. Esta división importa en la [pestaña HDR](#4-7-hdr-tab), donde solo un perfil con transferencia lineal puede asignarse a una imagen OpenEXR o Radiance HDR. Cada fila muestra el nombre del archivo y distintivos de clase, espacio de color, versión y tamaño; un perfil que solo se pudo analizar parcialmente aparece marcado. Usa el botón **A–Z** para alternar el orden (orden de carga → ascendente → descendente), la **×** de una fila para quitarla y el tirador del borde derecho del panel para cambiar su tamaño, o contrae el panel por completo.

Haz clic para seleccionar una fila; Ctrl/Cmd-clic para alternar la selección y Mayús-clic para seleccionar un intervalo. **Arrastra filas del conjunto a una pestaña** para ponerlas a trabajar.

<div class="note">
<strong>El conjunto solo dura la sesión.</strong> No se sube ni se guarda nada: tu sistema de archivos sigue siendo el almacenamiento permanente. Al recargar la página, el conjunto se vacía.
</div>

### Las pestañas {#the-tabs src=034c9677}

| Pestaña | Qué hace |
|---|---|
| **Perfil** | Inspecciona **un** perfil: encabezado, etiquetas, validación, análisis, XML, JSON. Soltar aquí un perfil nuevo sustituye al actual. |
| **Comparar** | Superpone las gamas de **dos o más** perfiles. |
| **Enlazar** | Encadena perfiles en un DeviceLink o transforma una imagen o un conjunto de datos a través de ellos. |
| **Espectral** | Ensambla imágenes espectrales de un solo canal en un único TIFF multicanal. |
| **HDR** | Muestra **una** imagen HDR en tu pantalla, con un control SDR ↔ HDR. Consulta [Pestaña HDR](#4-7-hdr-tab). |

Espectral y HDR aceptan directamente archivos de imagen en lugar de perfiles del conjunto. Cada una de las demás pestañas tiene su propio grupo de perfiles, que se muestran como fichas extraíbles bajo la barra de pestañas, con un contador en la propia pestaña. El primer perfil que cargas se abre automáticamente en la pestaña **Perfil**; a partir de ahí, arrastra desde el conjunto a la pestaña que quieras. Si sueltas archivos directamente sobre una pestaña, se cargan en el conjunto *y* se colocan en esa pestaña en una sola acción.

<div class="note">
<strong>Límite de tamaño:</strong> el cargador rechaza cualquier archivo de más de 256 MB. Los perfiles reales suelen ocupar bastante menos de 10 MB; el límite existe solo para evitar que una carga o un postMessage malintencionados agoten el heap WASM de la pestaña.
</div>

---

## 2. Panel de ajustes {#2-settings-panel src=3bf599d9}

Abre los ajustes haciendo clic en el botón **⚙** del borde derecho de la pantalla (o en el icono de engranaje de la esquina superior derecha en móvil). El panel se desliza sobre el contenido sin cambiar su tamaño.

Debajo de ⚙ hay dos botones más:

- **?** abre esta guía **dentro de la aplicación**, en un panel que se desliza sobre la ventana. Tiene un cuadro de búsqueda en su encabezado: escribe para resaltar las coincidencias y usa `Enter` / `Shift+Enter` (o los botones `˄` `˅`) para recorrerlas; `Escape` borra la búsqueda y un segundo `Escape` cierra el panel.
- **✉** abre el formulario de contacto de colourbill.com en una nueva pestaña del navegador.

El panel tiene dos grupos, **Visualización** y **Entorno**. Para ensanchar o estrechar el panel, arrastra su borde izquierdo (220–560 px); el ancho se recuerda.

### Fondo {#background src=1450fe76}

Cambia la aplicación entre los temas **Claro**, **Oscuro** y **Sistema** (sigue la preferencia del sistema operativo). La elección se conserva entre sesiones. En el modo **Sistema**, la aplicación se suscribe a `prefers-color-scheme` y cambia automáticamente cuando cambia el tema del sistema operativo; elegir explícitamente Claro u Oscuro desactiva esa escucha.

### Formato numérico {#number-format src=af65622c}

Elige cómo se muestran los valores numéricos en todas las vistas del perfil: **Hexadecimal** o **Decimal**.

### Idioma {#language src=38c60535}

Sustituye el idioma de la interfaz. **Predeterminado del sistema (…)** detecta la configuración regional del navegador y usa el idioma admitido más cercano, con el nombre nativo entre paréntesis para que veas cuál ha elegido. La traducción abarca la interfaz de la aplicación: el panel Perfiles, las etiquetas de las pestañas, las herramientas Enlazar, Espectral y HDR, las vistas de curvas de ganancia HDR en Etiquetas, el panel de ajustes (incluido Entorno y sus explicaciones) y la interfaz de esta guía. Algunos textos no se traducen:
- Los textos que genera IccProfLib (descripciones de etiquetas, mensajes de validación, nombres de campos del encabezado) proceden de la biblioteca C++ en inglés.
- El nombre del flag del navegador se mantiene en inglés para que coincida con la propia página de flags del navegador.
- Las entradas del registro **Eventos de pantalla** del panel Entorno se mantienen en inglés, para poder pegarlas tal cual en un informe de errores.
- Esta guía sigue el mismo ajuste, salvo sus secciones sobre HDR, que se mantienen en inglés mientras la compatibilidad con HDR está en beta y su texto aún cambia. Una sección revisada en inglés desde la última actualización de su traducción también se muestra en inglés, con una nota, hasta que la traducción se ponga al día.

Idiomas admitidos: English, Français, Deutsch, Italiano, Español, Português (PT), Português (BR), Svenska, 中文（简体）, 中文（繁體）, 日本語, 한국어. El panel de ajustes de chardata ofrece el mismo conjunto, de modo que cambiar el idioma en una aplicación ofrece una experiencia de lectura coherente en la otra.

### Entorno {#environment src=2eb1ea2c}

Muestra qué pueden hacer **este** navegador, esta plataforma y esta pantalla, para que, cuando un formato o una función HDR no estén disponibles, puedas ver por qué. De arriba abajo:

- **Resumen**: el navegador y el sistema operativo, y si la pantalla informa de HDR.
- **Flags del navegador** (Chrome, Edge, Opera, Brave): si está activado *Experimental Web Platform features*. Ese flag habilita el lienzo HDR y permite a la página leer el margen HDR de una pantalla.
  - Cuando se sabe que el flag está desactivado, el recuadro aparece resaltado. Se marca como **necesario** si este navegador no tiene WebGPU utilizable, ya que entonces el lienzo HDR es la única forma de representar HDR. En caso contrario, es **opcional**.
  - La inspección de perfiles nunca lo necesita.
  - Una página web no puede abrir ni cambiar los flags del navegador. Haz clic en **Copiar**, pega la dirección en la barra de direcciones, pon el flag en *Enabled* y reinicia el navegador.
- **Datos de la pantalla**: **Pantalla HDR**, **Gamut amplio** (sRGB, Display P3 o Rec. 2020), **Relación de píxeles** y la **Ruta de lienzo HDR** en uso (`float16-canvas`, `webgpu` o ninguna). Se actualizan solos cuando arrastras la ventana a una pantalla donde son distintos. El cambio se produce cuando la mayor parte de la ventana está en la nueva pantalla.
- **Identificar pantallas** (navegadores Chromium): solicita permiso para saber en qué monitor está la ventana. Una vez concedido, el panel se actualiza incluso entre monitores que parecen iguales, indica el **Monitor actual** y muestra el **Margen HDR** cuando el navegador lo expone (Chrome con el flag anterior), por ejemplo *1,35 pasos (≈2,55× el blanco SDR)*. Si deniegas el permiso, cámbialo en la configuración del sitio.
  - El margen es el espacio por encima del blanco SDR, así que en el panel HDR integrado de un portátil **disminuye al subir el brillo** (el blanco SDR se vuelve más brillante mientras el pico del panel no cambia) y aumenta al bajarlo. Para ver HDR, baja el brillo.
  - En Windows, el nuevo valor llega unos segundos después de cambiar el brillo, cuando el controlador de pantalla lo comunica. También se actualiza cuando la ventana pasa a otra pantalla o Chrome vuelve a ser la aplicación activa.
- **Eventos de pantalla**: un registro contraíble de las últimas 20 actualizaciones y de lo que provocó cada una. Resulta útil al informar de un problema de pantalla.
- **Tabla de formatos**: una fila por formato (perfil ICC, TIFF, PNG, JPEG, OpenEXR, Radiance HDR, AVIF, HEIC/HEIF, JPEG XL), con tres preguntas:
  - **Inspeccionar**: ¿se puede leer el perfil incrustado?
  - **Mostrar**: ¿se pueden mostrar los píxeles?
  - **HDR**: ¿puede representarse con más brillo que el blanco?

  Pasa el puntero sobre una fila para ver el motivo de una ✕; los formatos que no se pueden mostrar se enumeran con sus motivos debajo de la tabla. Un punto marca los formatos que profiletool decodifica por sí mismo, que funcionan igual en todos los navegadores. **Inspeccionar** muestra ✓ en todos los formatos excepto JPEG XL, cuyo perfil está comprimido dentro del codestream.

---

## 3. Vistas del perfil {#3-profile-views src=ccf59d34}

Arrastra un perfil del conjunto a la pestaña **Perfil** para inspeccionarlo. La pestaña muestra una barra con el nombre del archivo y un botón **Guardar perfil ICC** (más una etiqueta *● Modificado — sin guardar* cuando lo has editado) y, debajo, el visor: una barra de título (nombre del archivo · tamaño en bytes · versión de IccProfLib · distintivo de validez) y su propia barra de pestañas.

El distintivo resume el informe de **Validación**: verde **Aprobado** cuando ninguna comprobación falla ni advierte, ámbar **Advertencia** cuando al menos una comprobación advierte, y rojo **Fallido** cuando alguna comprobación falla.

<div class="note">
<strong>Perfiles analizados parcialmente:</strong> si un perfil está tan dañado que el validador solo puede leerlo estructuralmente, aparece un aviso y solo están disponibles las pestañas <strong>Encabezado</strong> y <strong>Etiquetas</strong>; Validación, Análisis, XML y JSON se ocultan, porque el perfil no debe aplicarse.
</div>

### 3.1 Encabezado {#3-1-header src=45c71bd0}

Una tabla de dos columnas con todos los campos del encabezado binario de 128 bytes del perfil ICC. Los valores se decodifican en texto legible (firmas expandidas, fechas con formato, valores de coma fija convertidos) mediante `CIccInfo` de IccProfLib. El **ID del perfil** (hash MD5 del encabezado) se muestra en una franja resaltada en la parte superior.

### 3.2 Etiquetas {#3-2-tags src=90f22730}

Una cuadrícula de seis columnas con todas las etiquetas del directorio de etiquetas del perfil:

| Columna | Significado |
|---|---|
| `#` | Posición en el directorio (empezando por 1) |
| `Name` | Nombre largo legible (p. ej., `profileDescriptionTag`) |
| `ID` | Firma de 4 caracteres (p. ej., `desc`) |
| `Offset` | Desplazamiento en bytes desde el inicio del archivo |
| `Size` | Tamaño en bytes de los datos de la etiqueta |
| `Pad` | Bytes de relleno entre esta etiqueta y la siguiente |

La firma del **tipo** de la etiqueta (p. ej., `descType`, `mft2`, `mAB`) se muestra junto con el desplazamiento y el tamaño en la parte superior de la etiqueta desplegada.

Las etiquetas se ordenan por desplazamiento. La columna **Relleno** usa un código de colores: `Pad < 0` (etiquetas superpuestas, no conforme) se muestra en rojo; `Pad > 3` (relleno superior al que permite la especificación) se muestra en ámbar.

**Haz clic en cualquier fila** para desplegarla en su sitio (un acordeón: solo una etiqueta abierta a la vez). El detalle desplegado siempre termina con la descripción completa específica del tipo, equivalente a ejecutar `CIccTag::Describe(verbosity = 100)` de IccProfLib. En las etiquetas que contienen CLUT o curvas grandes (p. ej., `A2B0`, `B2A0`), esto incluye cada celda de la cuadrícula o cada punto de la curva.

Por encima de esa descripción, las etiquetas con datos visualizables muestran una o varias **visualizaciones integradas**, cada una en una sección contraíble:

| Tipo de etiqueta | Visualizaciones |
|---|---|
| Curvas tonales (`rTRC`/`gTRC`/`bTRC`/`kTRC`) | La curva de respuesta tonal trazada frente a la línea de identidad; la tabla de la curva aparece contraída debajo. |
| Colorantes RGB (`rXYZ`/`gXYZ`/`bXYZ`) y punto blanco (`wtpt`) | Un diagrama de cromaticidad CIE 1931 con el primario correspondiente (o el punto blanco) resaltado; los datos del colorante o del punto blanco se muestran debajo. |
| Transformaciones LUT (`A2B0–3`, `B2A0–3`, `gamt`, `pre0–2`) | Curvas tonales del lado de entrada y del lado de salida (superpuestas, con un color por colorante y una leyenda para mostrar u ocultar trazas); la retícula de la CLUT como imagen; la **imagen de gama** (para la `gamutTag` del perfil, con código de colores: neutro = dentro de la gama, rojo = fuera de la gama); el **evaluador** (ver más abajo); y la tabla de datos sin procesar, contraída. |
| Tablas de colores con nombre / colorantes (`ncl2`/`nmcl`/`clrt`/`clot`) | Una nube de puntos de los colores en los diagramas a\*b\* de CIELAB (y xy de CIE); las tablas aparecen contraídas debajo. |
| Puntos de código independientes de la codificación (`cicp`) | **Puntos de código**: primarios de color, características de transferencia, coeficientes de matriz e indicador de rango completo, cada uno con el nombre que le da la UIT-T H.273. Se marcan los valores que H.273 no asigna, así como los bytes reservados distintos de cero. |
| Curva de ganancia adaptativa (`headroomAdaptiveGainCurveTag`) | **Ganancia a un margen de pantalla**, más **Curva de ganancia** cuando la etiqueta almacena imágenes alternativas. Consulta *HDR gain curves (HAGC)* más abajo. |

<div class="note">
<strong>Los datos mal formados nunca se ocultan.</strong> Si una curva u otro elemento visualizable no supera la validación de IccProfLib (por ejemplo, una curva tonal con un gamma degenerado de 0), la sección muestra igualmente lo que puede y presenta una advertencia ⚠ con el motivo exacto que da la biblioteca, en lugar de omitir el gráfico sin avisar.
</div>

#### El evaluador de transformaciones {#the-transform-evaluator src=c70f94b4}

En las transformaciones LUT (etiquetas `A2B*` / `B2A*` / de previsualización), la sección **Evaluar** aplica la transformación de esa etiqueta concreta a un único color que tú indicas, usando directamente IccProfLib, sin ningún motor de color externo. La dirección la determina la etiqueta (`A2B*` va de dispositivo → PCS; `B2A*` va de PCS → dispositivo), y el propósito de representación está implícito en la etiqueta (`…0` perceptual, `…1` colorimétrico relativo, `…2` saturación).

- Introduce la entrada como valores de **coma flotante** (canales del dispositivo, o PCS en unidades Lab/XYZ legibles) o, cuando la etiqueta tiene una CLUT, por índice de **punto de cuadrícula** (la posición de un nodo en la retícula).
- La salida se muestra **tanto** en la codificación interna normalizada 0–1 como en unidades legibles (Lab/XYZ para un resultado en PCS).

La etiqueta de gama (`gamt`) no tiene evaluador: es un mapa de un canal dentro/fuera de gama, no una transformación invertible; en su lugar se muestra su imagen de gama.

### 3.3 Validación {#3-3-validation src=b72d6c69}

Ejecuta la lista de comprobación del **ICC Profile Assessment Working Group** sobre el perfil cargado y la muestra como informe. Las comprobaciones proceden de la herramienta `iccPawgReport` de iccDEV, compilada en un módulo WebAssembly independiente que solo se descarga la primera vez que abres esta pestaña. (El mismo informe determina el distintivo de validez de la barra de título y se puede abrir desde una URL tanto con `VAL` como con el código heredado `PAWG`).

Cada comprobación se agrupa en **Seguridad**, **Conformidad** o **Calidad**, y tiene un único veredicto. Los perfiles con contenido HDR tienen un cuarto grupo, **HDR**. Su primera comprobación indica si el perfil es un **perfil HDR ColorSpace** conforme a ICC.1 (cláusula 8.7.1), y las demás comprueban los metadatos HDR en los que se basa esa cláusula:

| Veredicto | Significado |
|---|---|
| **Aprobado** (PASS) | La comprobación se superó |
| **Advertencia** (WARN) | Un problema no fatal que conviene revisar |
| **Fallido** (FAIL) | El perfil no cumple la comprobación |
| **Carencia** (GAP) | La comprobación no se pudo evaluar por completo (p. ej., aún no está implementada) |
| **N/A** | La comprobación no se aplica a este perfil |
| **No ejecutada** (NOT RUN) | La comprobación se omitió |

La fila de resumen de la parte superior cuenta cada veredicto en una píldora de color. **Haz clic en una píldora para filtrar** el informe de debajo: un halo azul marca las categorías que se muestran, y las píldoras con cero elementos están inactivas. Por ejemplo, desactiva **Aprobado** (PASS) y **N/A** para centrarte solo en las advertencias y los fallos.

### 3.4 Análisis {#3-4-analysis src=9478bc94}

Análisis de calidad del perfil completo derivados de sus transformaciones de color: los calcula un módulo WebAssembly dedicado (el motor de visualización de iccDEV), que solo se descarga la primera vez que abres esta pestaña, y se representan con el estilo propio de la aplicación.

Cada análisis es una sección contraíble y **todas empiezan cerradas**. Es intencionado: cada sección requiere una pasada completa de transformación sobre el perfil, así que abrir una es una decisión explícita tuya, en lugar de lanzar seis análisis en cuanto cambias de pestaña. Los resultados se guardan en caché, por lo que volver a abrir una sección es instantáneo. Una sección que no se aplica al perfil cargado muestra en su lugar una breve nota de *no aplicable* (por ejemplo, un perfil de pantalla matriz/TRC no tiene CLUT dispositivo↔PCS que analizar).

#### Estadísticas del perfil {#profile-statistics src=f2d4f2db}

Métricas del perfil completo para **un** propósito de representación seleccionado, controladas por dos listas desplegables y una casilla:

- **Propósito de representación**: Perceptual / Colorimétrico relativo / Saturación / Colorimétrico absoluto.
- **Tipo de ida y vuelta**: qué métrica de precisión se muestra (ver más abajo).
- **Usar etiquetas MPE (color)**: desactivada = las tablas de consulta colorimétricas; activada = las etiquetas de elementos de procesamiento múltiple (MPE) / de color. No influye en el resumen dentro de gama, donde está deshabilitada.

La tabla muestra el **volumen de gama** (en ΔE\*ab³, encerrado por la transformación `A2B` dispositivo → PCS, medido voxelizando el contorno y contando las celdas encerradas) junto con los valores **mín. / media / desv. típica / P90 / máx.** de ΔE\*ab de la ida y vuelta seleccionada. Debajo hay un histograma de la distribución de ΔE (barras de frecuencia relativa con una línea de frecuencia acumulada), además de los valores `L, a, b` del peor error y, para PRMG, si el perfil implica la Perceptual Reference Medium Gamut.

Los cuatro tipos de ida y vuelta:

- **Resumen dentro de gama (RT0)**: una cuadrícula de valores de dispositivo se lleva al PCS, de vuelta al dispositivo y de nuevo al PCS; el ΔE\*ab se mide entre las dos pasadas por el PCS. Una comprobación rápida de estabilidad dentro de la gama.
- **Inversión + gama (RT1)**: ΔE\*ab entre el PCS de cada color de dispositivo y su PCS tras una ida y vuelta Lab → dispositivo → Lab. Refleja la precisión de la inversión *y* el mapeo de gama.
- **Reproducibilidad (RT2)**: ΔE\*ab entre la primera y la segunda ida y vuelta: lo estable que es una ida y vuelta repetida, con independencia del recorte de gama de la primera.
- **Interoperabilidad PRMG**: colores PCS dentro de la Perceptual Reference Medium Gamut sometidos a una ida y vuelta; la distribución de ΔE indica la interoperabilidad entre perfiles.

Debajo del histograma, **ΔE de ida y vuelta por claridad** responde a la pregunta que las cifras de resumen no pueden responder: *dónde* de la escala tonal tiene problemas la inversión y *hasta qué punto del interior de la gama* llegan.

Muestrea 32 niveles de claridad. En cada nivel toma 64 puntos **en el contorno de la gama** y los repite desplazados hacia el eje neutro al 80 %, 50 % y 20 % de su croma: 8192 puntos en total, cada uno representado por separado, con separadores punteados entre niveles.

Léelo franja a franja. Dentro de una franja, los puntos van de la superficie de la gama, a la izquierda, al neutro, a la derecha, así que el error debería **ir disminuyendo** a lo largo de la franja: los colores cercanos al contorno son los más difíciles de invertir, y los cercanos al neutro, los más fáciles. Una franja cuyo error se mantiene alto hasta el neutro indica un perfil con problemas en esa claridad. Los picos más altos marcan los niveles de claridad en los que el propio contorno de la gama se invierte peor.

Por construcción, todas las semillas están dentro de la gama, así que lo que ves es un desacuerdo real entre `B2A`/`A2B` y no colores recortados por ser inalcanzables. Ten en cuenta que este gráfico tiene su **propio** muestreo, ponderado deliberadamente hacia el contorno de la gama, por lo que su media y su máximo son mayores que los de la tabla anterior y no son comparables con ellos. Sigue el propósito de representación, pero no el tipo de ida y vuelta.

Un perfil que carece de las transformaciones dispositivo↔PCS que necesita una métrica muestra una nota de *no aplicable*; un espacio de dispositivo demasiado amplio para muestrearlo se indica como omitido, no como error.

#### Colorimetría de los extremos {#extrema-colorimetry src=be6c9597}

Los extremos del rango de reproducción del perfil: las cifras que un operador de impresión suele leer primero.

- **Punto blanco**: el color con **colorante cero**, es decir, el soporte desnudo.
- **Punto negro**: se obtiene llevando el negro del PCS (L\*=0, a\*=b\*=0) a través de la tabla `B2A` seleccionada para obtener el entintado que el perfil *elige* para el negro, y leyendo después ese entintado de vuelta a través de `A2B1`.
- Ambos se muestran en colorimetría **relativa** y **absoluta**. La absoluta muestra el color propio del soporte (un papel blanco azulado da algo como L\* 95, b\* −4); la relativa lo refiere a un blanco perfecto. Si las dos columnas son idénticas, es normal: el blanco del medio simplemente coincide con el iluminante. Un perfil sin etiqueta de punto blanco del medio muestra solo la relativa.
- **Entintado en el punto negro** y **TAC**: la tinta por canal en ese negro y su suma, la cobertura total de superficie, es decir, la cifra de límite de tinta.

Como cada tabla `B2A` elige su propio entintado para el negro, el punto negro realmente difiere entre propósitos; de ahí el selector de propósito de representación.

Debajo, **Tinta plena frente a croma máximo**: para cada esquina de tinta (C, M, Y, R, G, B y K), dónde cae en matiz / croma / claridad, y el punto más cromático encontrado en el camino desde el soporte desnudo hasta ella. Estas filas se miden a través de `A2B1` y, por tanto, **no cambian con el selector de propósito**. En un perfil bien construido, las dos filas coinciden. Cuando el croma máximo se alcanza *antes* de la tinta plena, la fila se marca: a partir de ese punto, la tinta adicional ya no aporta croma, solo oscurece.

**Solo perfiles de salida (impresora)**: el análisis supone que colorante cero significa soporte desnudo. La tabla por matiz requiere además un espacio de dispositivo **CMYK o CMY**: un perfil de n colores (nCLR) nombra sus canales en cualquier orden, así que no se puede saber qué canal es el «cian», y la tabla lo indica en lugar de adivinarlo.

#### Entintado del eje neutro {#neutral-axis-inking src=aa5449e4}

Recorre el eje neutro (a\*=b\*=0) desde el blanco (L\*=100) hasta el negro (L\*=0) a través de la tabla `B2A` (PCS → dispositivo) del perfil y representa cuánto de cada colorante del dispositivo deposita el perfil a lo largo del recorrido: la clásica curva de GCR / composición del neutro. Una curva por canal del dispositivo, con un color por colorante.

Sobre la separación se traza una curva adicional:

- **L\* de salida (tono)**: la respuesta tonal, es decir, dónde cae realmente en claridad el eje neutro tras una ida y vuelta a través del perfil. Su forma indica dos cosas. Si se hunde por debajo de la diagonal, los grises se reproducen más oscuros de lo solicitado. Y, más útil aún, la curva **se aplana en la claridad más oscura que puede alcanzar el perfil**: esa meseta *es* el punto negro del medio, y debería coincidir con la sección Colorimetría de los extremos anterior.

**Solo perfiles de salida (impresora)**; las demás clases de perfil muestran una nota.

#### Uso de tinta en las sombras {#ink-usage-in-shadows src=e62016b7}

Cuatro trayectos rectos a través del plano a\*b\* a una claridad constante y deliberadamente oscura (0°, 45°, 90° y 135°) se pasan por la tabla `B2A` seleccionada, y se representa la separación resultante de cada uno.

Como todas las muestras de un trayecto comparten la misma L\*, cualquier salto brusco o inversión en un colorante se debe únicamente al tratamiento del matiz y del croma. Esa es la firma de un artefacto de mapeo de gama en las sombras, el tipo de defecto que aparece en la impresión como bandas o un cambio de color repentino en las zonas oscuras. Los trayectos van desde muy fuera de la gama, la atraviesan y salen por el otro lado, de modo que también ves dónde empieza a recortar el perfil.

El plano de claridad se elige automáticamente: a medio camino entre la esquina Azul del perfil y la más oscura de C, M, Y, R y G. En las tablas perceptual y de saturación, la claridad se estira primero desde el punto negro del medio hasta el negro del PCS (esas tablas esperan el negro ahí), y la sección indica tanto el plano compensado como el original.

**Solo perfiles de salida (impresora)**, con la misma restricción CMYK/CMY que la tabla por matiz anterior (el plano se deriva de las esquinas de tinta).

#### Trayectorias de entintado primario por el neutro {#primary-inking-paths-through-neutral src=cb510c25}

Tres trayectos (Cian→Rojo, Magenta→Verde, Amarillo→Azul), cada uno trazado desde una esquina primaria, **pasando por el eje neutro** a la claridad media de sus dos extremos, hasta la esquina opuesta, se pasan por la tabla `B2A` seleccionada y se representan como separación.

Es la contrapartida dentro de gama de Uso de tinta en las sombras. Allí, los trayectos salen deliberadamente de la gama para poner de manifiesto artefactos de mapeo de gama; aquí, **todas las muestras están dentro de la gama por construcción**: ambos extremos son primarios del propio perfil y el pivote está sobre el eje neutro. Así, un salto, un quiebro o una inversión en un colorante a lo largo de uno de estos trayectos no puede atribuirse al recorte de gama: es un defecto de suavidad de la CLUT. El pivote neutro es el punto medio de cada gráfico, donde debería verse una composición del neutro equilibrada.

En las tablas perceptual y de saturación, la claridad se compensa por punto negro según el propósito, exactamente igual que en Uso de tinta en las sombras.

**Solo perfiles de salida (impresora)**, con la misma restricción CMYK/CMY (las esquinas proceden de la misma fuente que la tabla por matiz).

#### Estadísticas de uso de tinta {#ink-usage-statistics src=191fd7cd}

Cuánto de cada colorante deposita el perfil, como cobertura media y como **proporción del total**: la huella de consumo de tinta de la separación.

La tabla suma cada colorante a lo largo del eje neutro e indica su cobertura media y su porcentaje sobre toda la tinta depositada. La columna de proporción es la que sirve para el diagnóstico: es la huella de composición del neutro del perfil (un equilibrio de grises con predominio del cian se lee distinto de uno con predominio del negro) y no depende de cuántas muestras se tomaron.

Una segunda tabla, el uso de tinta en **todos los colores sobre el contorno y dentro de la gama**, figura como *pendiente*: necesita una construcción del contorno de la gama que todavía no existe.

**Solo perfiles de salida (impresora).**

#### Imagen CLUT {#clut-image src=a3fec568}

La tabla de consulta de color de una transformación dispositivo↔PCS, dispuesta en mosaico como imagen, con un selector para elegir la tabla de propósito de representación que se muestra (`A2B0`–`A2B3`, `B2A0`–`B2A3` y las tablas de previsualización). Útil para detectar de un vistazo daños estructurales en una tabla. Amplía, desplaza y restablece la vista con los controles del lienzo.

Si seleccionas una **tabla `B2A` (PCS → dispositivo)**, debajo de la retícula aparece una **imagen de cobertura de tinta en escala de grises para cada colorante**: las separaciones por tinta, donde más oscuro significa más de esa tinta. Un aviso en la parte superior de la sección te remite a ellas, ya que la sección se abre con una tabla `A2B` (cuya salida es L\*a\*b\*, no tintas). En una **salida de n colores (nCLR)** (de 5, 6 o 7 colores), donde no hay una previsualización de color sencilla, la imagen principal se **gestiona en color a través de la `A2B` directa del perfil**, de modo que se sigue mostrando en color real en lugar de en un gris de un solo canal.

#### Imagen de gama {#gamut-image src=92f58c0f}

El mapa dentro/fuera de gama de la etiqueta de gama: neutro donde un color PCS es reproducible, rojo donde queda fuera de la gama del dispositivo. Solo aparece cuando el perfil contiene una etiqueta `gamt`.

### 3.5 XML {#3-5-xml src=dfd43c4e}

Convierte el perfil a XML (mediante IccLibXML, el mismo generador que usa la CLI `iccToXml` de iccDEV) y lo muestra en un editor CodeMirror con resaltado de sintaxis. Edita el XML y haz clic en **Convertir a ICC** para volver al binario; el visor revalida y el botón **Guardar perfil ICC** de la barra de la pestaña Perfil descarga el resultado.

Un indicador de **cambios pendientes** aparece cuando el texto del editor difiere de la última salida del conversor, para que sepas de un vistazo si tus ediciones se han aplicado. Si la conversión falla, el error de análisis de IccLibXML se muestra encima del editor con la línea / columna del problema.

### 3.6 JSON {#3-6-json src=59c3f2e5}

La misma idea que la pestaña XML, pero con una representación JSON del perfil generada por el wrapper del validador (`json-wrapper.cpp`). Edita, haz clic en **Convertir a ICC** y guarda. La forma JSON es más compacta y más fácil de manipular con scripts; la forma XML resulta más familiar si has usado las herramientas CLI de iccDEV.

---

## 4. Pestaña Enlazar {#4-combine-tab src=735d6198}

profiletool guarda todos los perfiles cargados en un **conjunto de perfiles** (Profile Pool) a la izquierda. En la parte superior hay cinco pestañas: **Perfil** (el visor de un solo perfil descrito arriba), **Comparar**, **Enlazar**, **Espectral** y **HDR**. La pestaña **Enlazar** es donde encadenas perfiles y los pones a trabajar: crea un **DeviceLink**, **transforma una imagen** o **transforma un conjunto de datos de color** a través de la cadena.

### 4.1 Crear una cadena {#4-1-building-a-chain src=83ab772c}

Arrastra uno o varios perfiles del conjunto a la tarjeta Enlazar para añadirlos a la cadena, en orden. La cadena es una **pila vertical**: el origen está arriba y el destino, abajo. Cada perfil aporta **una transformación**, y la herramienta muestra el espacio de color que entra y el que sale de ella (p. ej., `RGB → Lab`), con el **espacio de conexión** indicado en la línea entre etapas. El motor valida toda la cadena en tiempo real e indica el flujo de extremo a extremo (p. ej., *Cadena: RGB → CMYK*) o explica, etapa por etapa, dónde no conecta.

- **Reordena** una etapa arrastrando su asa (`⠿`) o con los botones ▲ / ▼; quita una con ×.
- **Invertir la dirección**: el botón ⇅ de la transformación inicial invierte la dirección de la cadena y el cambio se propaga a las etapas siguientes.
- **Propósito de representación**: elige uno para toda la cadena con *Intención de renderizado (todas)*, o sustitúyelo en cualquier etapa con su propia lista desplegable. Pasa el puntero sobre cualquiera de los dos controles para ver una descripción del propósito seleccionado. Además de los cuatro propósitos básicos, un perfil que contiene las tablas necesarias ofrece también las variantes *no D2Bx/B2Dx* y *+ BPC* (compensación de punto negro).

<div class="note">
<strong>Perfil HDR ColorSpace en la cadena.</strong> Un perfil HDR ColorSpace de ICC.1 no tiene etiquetas TRC (la cláusula 8.7 no define ninguna para un perfil ColorSpace), así que una transformación a través de él usa su <code>AToB0Tag</code>. Esa tabla es la representación HDR&#8594;SDR que la cláusula 8.7.1.5 exige para el software sin procesamiento HDR. La tarjeta lo indica cuando una cadena contiene un perfil HDR ColorSpace: el DeviceLink, la imagen o los datos que generes reflejan ese respaldo SDR, no el comportamiento HDR del perfil.
</div>

### 4.2 Crear DeviceLink {#4-2-make-devicelink src=2cb72a0d}

Convierte toda la cadena en un único perfil **DeviceLink** (una adaptación para el navegador de `iccApplyToLink` de iccDEV). Ponle nombre y haz clic en **Crear DeviceLink**; el resultado llega al conjunto y a la lista de la pestaña Enlazar como cualquier otro perfil, listo para inspeccionarlo en la pestaña Perfil o reutilizarlo en otra cadena.

### 4.3 Transformar imagen {#4-3-transform-image src=461fcd83}

Suelta una imagen ráster (TIFF, PNG o JPEG) en la ranura de imagen y haz clic en **Transformar imagen** para pasarla por la cadena (una adaptación para el navegador de `iccApplyProfiles`). Primero, la imagen se valida con una comprobación solo del encabezado: su espacio de color debe coincidir con la entrada de la cadena. El resultado **se descarga**; las imágenes nunca se guardan en el conjunto.

Cuando se carga una imagen válida, aparece un panel **Opciones de salida de imagen** con los ajustes de destino equivalentes a los de la CLI `iccApplyProfiles`:

- **Codificación**: *Igual que el origen*, 8 bits, 16 bits o **Flotante (32 bits)**.
- **Compresión**: Ninguna, **LZW** o **ZIP** (Deflate).
- **Planar**: planos **Compuesto** (entrelazado) o **Separado**.
- **Interpolación CMM**: **Tetraédrica** o **Lineal**.
- **Incrustar ICC**: etiqueta la salida con el último perfil de la cadena (el del espacio de salida).

El valor predeterminado mantiene la salida RGB/gris como PNG; elegir un ajuste exclusivo de TIFF (flotante, LZW/ZIP o planos separados) cambia el contenedor a TIFF.

<div class="note">
<strong>Perfiles incrustados:</strong> si la imagen soltada contiene su propio perfil ICC incrustado, un aviso ofrece <strong>extraerlo</strong>: el perfil se añade al conjunto y se coloca al principio de la cadena (como su espacio de origen) con un solo clic.
</div>

### 4.4 Transformar datos {#4-4-transform-data src=96934eec}

Suelta un conjunto de datos de color (CGATS/IT8, CSV, CxF o JSON) en la ranura de datos y haz clic en **Transformar datos** para pasar cada parche por la cadena (el equivalente de `iccApplyNamedCmm`). La herramienta lee los tipos de datos del conjunto (dispositivo / Lab / XYZ / espectral) y proporciona el que necesita la entrada de la cadena; una entrada **espectral** se convierte a colorimetría con la calculadora canónica de iccDEV, usando el **Observador** y el **Iluminante** que elijas. Los parches duplicados se pueden filtrar (mediana o media). El resultado se abre en una tabla que puedes **Guardar** como CSV.

### 4.5 Cambio de observador {#4-5-observer-change src=738ba4d4}

La pestaña Enlazar contiene **dos** tarjetas creadoras. Encima del Flujo de enlace, la tarjeta **Cambio de observador** crea un perfil de pantalla matriz/TRC v4.3 a partir de un perfil de pantalla RGB V5 y un perfil de observador V5 (PCC). Arrastra ambos a la tarjeta (se asignan automáticamente a las ranuras **Pantalla RGB V5** y **Observador V5 (PCC)** según la clase de perfil) y después haz clic en **Crear perfil de pantalla V4**, ponle nombre y haz clic en **Crear**. El resultado se incorpora al conjunto y a esta pestaña. Un perfil que no es ninguno de los dos se ignora con una advertencia.

### 4.6 Pestañas Comparar y Espectral {#4-6-compare-and-spectral-tabs src=b934d7e3}

La pestaña **Comparar** superpone los contornos de gama de dos o más perfiles del conjunto (una envoltura 3D y un corte 2D de claridad) para ver en qué se diferencian. Cuando se comparan perfiles HDR ColorSpace, una nota **Mostrando el respaldo SDR** explica que cada gama se construye a partir de la representación SDR de `AToB0Tag`, no del rango HDR del perfil, que no se puede dibujar en un PCS acotado. La pestaña **Espectral** ensambla un conjunto de imágenes espectrales de un solo canal (soltadas en el orden de los canales) en un único TIFF multicanal (`iccSpecSepToTiff`).

## 5. Edición de ida y vuelta {#5-round-trip-editing src=595f380b}

Tanto la pestaña XML como la JSON pueden volver a escribir el perfil en binario ICC. El flujo de trabajo habitual:

1. **Carga** un perfil ICC.
2. Abre la pestaña **XML** o **JSON**. Haz clic en **Convertir a XML** / **Convertir a JSON** para rellenar el editor.
3. **Edita** en el editor de la página. Junto a la barra de herramientas aparece un indicador de cambios pendientes.
4. Haz clic en **Convertir a ICC**. El wrapper crea un perfil nuevo, vuelve a ejecutar la validación y actualiza las pestañas Encabezado / Etiquetas / Validación.
5. Junto al nombre del archivo, en la barra de la pestaña Perfil, aparece la etiqueta **● Modificado — sin guardar**.
6. Haz clic en **Guardar perfil ICC**. Los bytes editados se descargan como `<original>-edited.icc`.

Los dos editores son independientes: editar el XML y luego el JSON no mezcla ambas vías. Lo que se guarda son los bytes ICC generados más recientemente.

<div class="note">
<strong>Advertencia:</strong> la fidelidad de la conversión depende de lo que IccLibXML / el wrapper JSON admitan para cada tipo de etiqueta. Si un tipo de etiqueta no se puede representar, la ida y vuelta perderá detalle; revisa la pestaña Validación tras la conversión de vuelta para confirmar que todo se sigue analizando correctamente.
</div>

La pestaña Etiquetas resalta cualquier etiqueta cuyos bytes difieran de los cargados originalmente, de modo que es fácil ver qué han cambiado tus ediciones.

---

## 6. Abrir desde chardata {#6-launching-from-chardata src=b39a6805}

En **chardata**, después de cargar un perfil ICC, haz clic en **Display File** para abrir el visor de la página y luego en **Launch editor**. Se abre aquí una nueva pestaña con `?source=chardata` en la URL.

La transferencia se realiza íntegramente en el navegador:

1. profiletool se abre, detecta `?source=chardata` y envía `{type:'profiletool:ready'}` a `window.opener` mediante `postMessage`.
2. chardata responde con `{type:'profiletool:load', filename, bytes}`.
3. profiletool acepta los bytes (tras comprobar el origen del remitente frente a una lista de permitidos y el tamaño frente al límite de 256 MB), ejecuta la validación y muestra el perfil.

Sin subidas ni ida y vuelta al servidor. El flujo es unidireccional: las ediciones que hagas aquí se guardan haciendo clic en **Guardar perfil ICC**, no se devuelven a chardata.

---

## 7. Abrir con una URL {#7-launching-with-a-url src=f9a8d871}

Puedes abrir la herramienta con un enlace que indique un perfil que cargar (y la pestaña en la que empezar) mediante un **fragmento de URL** (la parte que sigue a `#`):

```
https://chardata.colourbill.com/profiletool#url=<profile-url>&tab=<tab>
```

Ambos parámetros son opcionales:

- **`url=`**: la dirección web de la que se obtiene el perfil. Los bytes se descargan en tu navegador y luego siguen exactamente el mismo camino que un archivo local: la comprobación del encabezado `acsp`, `ValidateIccProfile` completo, el límite de tamaño de 256 MB y la alternativa de mejor esfuerzo para perfiles que no se pueden analizar. No se sube nada: los bytes obtenidos solo alimentan al validador y nunca se reenvían.
- **`tab=`**: la vista que se abre una vez cargado el perfil.

Un ejemplo completo:

```
https://chardata.colourbill.com/profiletool#url=https://example.org/profiles/sRGB.icc&tab=VAL
```

<div class="note">
<strong>¿Por qué un fragmento y no una cadena de consulta?</strong> La parte que sigue a <code>#</code> nunca se envía a un servidor web, así que la dirección del perfil que inspeccionas se queda en tu propio equipo.
</div>

### Nombres de pestañas {#tab-names src=d3a4dbae}

`tab=` admite dos esquemas de nombres intercambiables que no distinguen mayúsculas de minúsculas. Los códigos **cortos** son la forma preferida:

| Vista | Código corto | Nombre largo |
|---|---|---|
| Encabezado | `HEADER` | `Header` |
| Etiquetas | `TAGS` | `Tags` |
| Validación | `VAL` | `Validation` |
| Análisis | `ANALYSIS` | `Analysis` |
| XML | `XML` | `XML` |
| JSON | `JSON` | `JSON` |

Los nombres largos son las etiquetas de las pestañas en inglés sin espacios. Ambos esquemas se mantienen estables aunque cambien las etiquetas visibles, así que los enlaces existentes siguen funcionando. La pestaña Validación también responde al código heredado `PAWG` (antes se llamaba «Profile Assessment WG»). Un valor de `tab=` no reconocido se ignora y se abre la vista Encabezado.

<div class="note">
<strong>Requisitos de <code>url=</code>:</strong> el perfil debe servirse por <strong>HTTPS</strong> y el servidor que lo aloja debe permitir lecturas de origen cruzado (un encabezado <code>Access-Control-Allow-Origin</code> / CORS permisivo). Si falta cualquiera de los dos, el navegador bloquea la descarga y la herramienta muestra un error de obtención. Si la propia URL del perfil contiene <code>&</code> o <code>#</code> (su propia cadena de consulta), codifica con porcentajes todo el valor de <code>url=</code> para que esos caracteres no terminen el fragmento antes de tiempo.
</div>

---

## 8. Móvil {#8-mobile src=cb948e3c}

En pantallas de menos de 700 px de ancho:

- El panel de ajustes se convierte en un cajón que se desliza desde la derecha.
- Un botón flotante **⚙** en la esquina superior derecha abre / cierra los ajustes.
- Un botón **?** debajo de ⚙ abre esta guía en su panel deslizante.
- Un botón **✉** abre el formulario de contacto en una nueva pestaña del navegador.
- Al tocar el fondo atenuado se cierra el cajón abierto.
- La tabla de etiquetas pasa de una cuadrícula ancha a tarjetas apiladas, de modo que todas las columnas se leen sin desplazamiento horizontal; una etiqueta se sigue desplegando en su sitio.
- **El toque sustituye a arrastrar y soltar.** iOS no admite arrastrar y soltar, así que arrastrar un perfil del conjunto a una pestaña no funciona allí. En su lugar, **toca los perfiles para seleccionarlos y luego toca la pestaña** en la que los quieres: el resultado es el mismo que al arrastrar. El conjunto muestra este recordatorio mientras se usa una pantalla táctil.
- **En iPhone y iPad, los selectores de archivos muestran todos los archivos.** iOS compara un filtro de tipo de archivo con los tipos que conoce y no tiene ninguno para `.icc`, `.icm`, `.cube` ni `.exr`, así que filtrar atenuaría precisamente los archivos que quieres abrir. Elige el perfil por su nombre; cualquier archivo que no sea un perfil se sigue rechazando, con el motivo, tras cargarlo.

Todas las funciones están disponibles; el diseño se adapta a la pantalla más pequeña.

---

## 9. Límites y seguridad {#9-limits-and-security src=ce1e9474}

profiletool no realiza solicitudes de red tras la carga inicial de la página. El validador, el conversor XML, el conversor JSON y los códecs de imagen son todos WebAssembly compilado a partir de código fuente C++ y se ejecutan íntegramente en el cliente. La pestaña HDR muestra una imagen soltada mediante una URL de objeto local, así que la imagen nunca sale de la pestaña. **Identificar pantallas** pregunta al navegador, no a un servidor, en qué monitor está la ventana.

| Límite | Dónde | Notas |
|---|---|---|
| **256 MB** | postMessage / carga de archivos | Rechaza cargar cualquier cosa mayor; evita el agotamiento del heap por parte de un opener malintencionado |
| **32 MB** | Conversores XML y JSON | Lo aplican tanto la protección JS (`MAX_XML_BYTES` / `MAX_JSON_BYTES`) como los wrappers C++ (`kMaxXmlBytes` / `kMaxJsonBytes`); el lado C++ es autoritativo por sí solo |
| **Protección contra bombas de entidades XML** | Conversor XML | Cualquier XML que contenga `<!DOCTYPE` o `<!ENTITY`, o un byte NUL, se rechaza antes de que libxml2 lo vea. Los límites de expansión de entidades propios de libxml2 también están activos, así que es una segunda capa de defensa frente a entradas de tipo billion laughs |
| **512 MB** | Archivo de la pestaña HDR | Se comprueba con el tamaño del archivo antes de leer nada de él; replica el límite de entrada de 512 MB de los propios códecs de imagen |
| **40 megapíxeles**, **64 píxeles por byte** | Decodificación Radiance HDR (pestaña HDR) | Ambos se comprueban a partir del encabezado y del tamaño del archivo antes de reservar memoria para píxeles; el segundo rechaza bombas de descompresión basadas en marcadores de repetición |
| **Presupuesto de decodificación EXR** | Decodificación OpenEXR | Ancho × alto × canales × 4 bytes debe caber en 512 MB, lo que se comprueba a partir del encabezado antes de que el decodificador reserve nada |
| **Recorrido de cajas HEIC/AVIF** | Extracción del perfil | Los tamaños de caja se comprueban sin desbordamiento; el anidamiento está limitado a 8, un perfil a 64 MB (por archivo, en total) y las asociaciones de elementos a 65 536 |
| **Lista de orígenes permitidos** | Apertura por postMessage | Solo el mismo origen y los orígenes de desarrollo de chardata pueden enviar bytes `profiletool:load` |
| **HTTPS + CORS** | Apertura con `#url=` | Un perfil abierto por URL debe servirse por HTTPS desde un host que permita lecturas de origen cruzado; los bytes obtenidos solo alimentan al validador y nunca se reenvían |

La apertura con `#url=` (añadida en la versión 1.1.5) es el único caso en que la herramienta realiza una solicitud fuera de su origen tras cargar la página: amplía la directiva `connect-src` de la Content-Security-Policy a `https:` para poder obtener el perfil indicado. La carga de scripts **no** se amplía, solo las solicitudes de datos.

Si necesitas inspeccionar un perfil que supera estos límites, compila iccDEV desde el código fuente y usa las herramientas CLI nativas, que no tienen los límites del lado JS.

### Licencia {#licence src=e7a2a884}

profiletool se publica con la licencia MIT. La aplicación también incluye componentes de terceros con sus propias licencias: IccProfLib de iccDEV (International Color Consortium), LibTIFF, libpng, zlib, libxml2, JSON for Modern C++, el runtime de Emscripten y paquetes JavaScript, entre ellos React, Plotly y CodeMirror. Este software se basa en parte en el trabajo del Independent JPEG Group. Los avisos completos están en [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

### Cobertura de ICC.2 (iccMAX) {#icc-2-iccmax-coverage src=3d2b33e8}

Se admiten tanto perfiles **ICC.1** como **ICC.2**, pero la cobertura de ICC.2 es **incompleta**. La carga, las vistas de encabezado y etiquetas, la validación, la ida y vuelta XML/JSON y los motores de transformación entienden ICC.2; las carencias conocidas son los flujos de intercambio **ICS** de varias partes, la elección de un **subperfil** V5 al aplicar una transformación y la búsqueda inversa en algunos perfiles ICC.2. Un perfil que usa una construcción ICC.2 no admitida se indica en la pestaña Validación, en lugar de leerse mal sin avisar.
