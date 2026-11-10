# Facturas por matrícula y enlaces PDF

Base del chatbot: PR #45 desplegada en `883805c`. Rama separada
`feat/invoice-plate-pdf-links`; sin merge ni despliegue de esta entrega.

## Referencias del ERP

Archivos consultados en `mianrori/api-delsol-erp`, rama predeterminada `main`,
el 2026-11-09 mediante el conector GitHub:

| Archivo del ERP | Lógica reutilizada | SHA del blob consultado |
| --- | --- | --- |
| [src/repositories/invoices/invoices.repository.js](https://github.com/mianrori/api-delsol-erp/blob/main/src/repositories/invoices/invoices.repository.js) | Entrada en mayúsculas sin espacios/guiones; filtro `plate` con binds, permisos `USER_CAN_CONSULT`, filtros y detalle paginado. | `932c95bc36b01261593582f727de07d8a38feade` |
| [src/services/invoices/invoices.service.js](https://github.com/mianrori/api-delsol-erp/blob/main/src/services/invoices/invoices.service.js) | Une base sin barras finales y `PDF` sin barras iniciales; `pdfUrl` y omisión del campo `pdf` crudo. | `7a9999cabefdb9cb48c89b7504c470b97d90e7bf` |
| [config.js](https://github.com/mianrori/api-delsol-erp/blob/main/config.js) | `urlEndPointDePdf` toma `process.env.URL_ENDPOINT_DE_PDF`. El chatbot ya conserva esta variable. | `58d3b02bc95219f267aa890922a958133a8da565` |
| [src/catalogs/oracle/facturas/VW_BOT_FACTURAS.catalog.js](https://github.com/mianrori/api-delsol-erp/blob/main/src/catalogs/oracle/facturas/VW_BOT_FACTURAS.catalog.js) | URL fuera del SQL, archivo autorizado sin inventar extensiones, no atribuir automáticamente la matrícula a parking. | `9c4c288900db41587f6988ecdcb37f876496b3ce` |

Hay una divergencia previa entre catálogo y ejecución ERP: el catálogo recomienda
igualdad para matrícula única y el repositorio usa `LIKE` por contenido. La versión inicial `2826a4d` conservaba ese `LIKE`. La revisión `cfb5f50` lo
corrige a igualdad normalizada para impedir coincidencias con matrículas más
largas; conserva espacios/guiones como diferencias de presentación y no añade fuzzy. La etiqueta solicitada aquí es **Ver PDF**, frente a la
etiqueta «Ver factura» del catálogo.

## Adaptación al chatbot

Se conserva Route → Controller → Service → Repository → Oracle. Un normalizador
compartido elimina los espacios en blanco y guiones de la entrada y rechaza un
filtro vacío antes de SQL, evitando `LIKE '%%'`. El repositorio elimina también
whitespace Oracle (tabuladores/saltos incluidos), conservando binds y el predicado
obligatorio de permisos. La comparación actual es igualdad normalizada, sin
patrones de matrícula. No se cambia identidad, filtros ni conteos/paginación.

La unión de URL existente del servicio sigue la del ERP. La presentación de una
página de detalle toma exclusivamente las filas y `pdfUrl` del resultado fresco,
restaura los tokens antes de escapar Markdown y muestra todas las filas. Ofrece
`[Ver PDF](<url>)` para URLs HTTP(S), con escape de delimitadores/espacios; sin
archivo/base/enlace válido no inventa un PDF. Mantiene `response` y
`actions.invoicePagination`; los resúmenes siguen su contrato existente.

Las instrucciones distinguen buscar facturas de una matrícula (filtro `plate`)
de identificar al cliente de facturación. El usuario no debe elegir un cliente
solo para aplicar ese filtro; los filtros confirmados siguen conservándose.

## Pruebas y contraste

Pruebas enfocadas: normalización, filtro vacío, binds/permisos/count/detail,
base+archivo ERP, archivo/base ausentes, tokens, escapes de URL y nombres,
resúmenes, todas las filas y paginación. Fixture HTTP con router/controller/chat
reales y modelo/datos controlados: sesión inválida, identidad del cuerpo ignorada,
segunda página con filtros preservados y sin enlaces de la página anterior.

Ejecutor DEV protegido:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-invoice-pdf-diagnostic-dev.ps1
```

Copia aislada del commit en Docker, servidor HTTP efímero limitado a loopback,
modelo controlado, Oracle real con identidad proxy obtenida de `sessionId` desde
PostgreSQL. Cohorte de matrícula autorizada leída sin publicar valores. Comparación
independiente de filas/conteos y URLs base+PDF en dos páginas; GET de un PDF solo
en el origen configurado (sin redirecciones), estado/tipo/firma PDF sin guardar
el documento. Cierres de conexiones y servidor, logout y logs sanitizados.

Diagnóstico actual: una muestra ausente (404) y otra legítima disponible (200),
con la misma URL base. Los resultados iniciales se conservan como históricos. No se llama a Bedrock ni
al proveedor externo. No se publica DEV, ni se alteran datos, permisos o
expiraciones. Se conservan las reservas y evidencias anteriores; no se atribuye
cobertura real a archivos/casos ausentes de la cohorte observada.

## Histórico: resultados de `2826a4d` y `3cfc59f`

**Aplicación y pruebas: `2826a4d8a0cc09e90bb53c2a6a9708d11968ea55`.**
13/13 pruebas afectadas en Node 22.23.4 (dos archivos: `invoices` e
`invoicePlatePdf`), sin suite completa. Salida congelada ignorada
`logs/invoice-plate-pdf-focused-node22.txt`, SHA-256
`8714175107362226ca77bbfbf4959c8a9b7edc968298f7684c93baf20d80c5c0`.

El contraste inicial sobre ese commit aprobó **23 de 24 aserciones**: identidad
proxy desde sesión, HTTP, filtros, búsqueda con espacios/tabuladores, conteos,
importes, paginación de dos filas/páginas y ausencia correcta de enlaces donde
`PDF` era nulo. Falló la condición final de descargar un PDF: esas dos páginas
no tenían archivo aunque había otras filas de la cohorte con `PDF`. **No hizo
GET de un documento y no fue una aprobación global.** Cierres y logout aprobados.
Reporte congelado `logs/invoice-plate-pdf-2826a4d-partial.json`, SHA-256
`dbf28115d3b3ecbfd85bd62d5280d76a7873552cc0f53912c1ba0e7888395d79`.

**Ejecutor ajustado: `3cfc59f44330dcc6c79ba5b1c7277b6c4d9cdc67`.** Solo modifica
los dos scripts de control: encuentra la página que efectivamente contiene PDF,
conserva la evidencia de las dos páginas aprobadas y las 13 pruebas mediante
hash/identidad de código, y comprueba únicamente esa página restante. No cambia
aplicación ni pruebas. Se verificaron 295 archivos de la copia aislada; manifiesto
SHA-256 `749dafc5c3bae091928b1d3acb507bcc8fdafc633f6fff9200ac2d576e255622`.

Este control adicional aprobó **17 de 18 aserciones**: la fila y los conteos
coinciden con Oracle independiente; `pdfUrl` coincide exactamente con base +
`PDF` autorizado y el HTTP conversacional ofrece «Ver PDF» con ese destino.
El GET al origen configurado devolvió **404**, sin tipo ni firma PDF válidos.
La descarga **no está aprobada**. Este resultado no se suma a las 23 aserciones
anteriores como cobertura única ni se transforma en un control global verde.
Reporte congelado `logs/invoice-plate-pdf-3cfc59f-http404.json`, SHA-256
`c9ae5550b28884e7a91811062a529b0ac851cc99555c547264085ca33998e8cb`.

La revisión de la ruta del ERP añadió estas referencias (2026-11-10):

- [src/routes/base.route.js](https://github.com/mianrori/api-delsol-erp/blob/main/src/routes/base.route.js),
  blob `af7fae9c5b3205cf49fc349fc799a5d39c3ba292`: `/factura/pdf/:cdc`.
- [src/controllers/base/download-de.controller.js](https://github.com/mianrori/api-delsol-erp/blob/main/src/controllers/base/download-de.controller.js),
  blob `bccaa88ee4caee1c77a3e051a8b862be8a643668`: añade `.pdf` al parámetro y devuelve
  404 si no encuentra el archivo en el directorio configurado.

La configuración observada apunta a esa forma de ruta. No se publicaron URL,
parámetro, matrícula, cliente ni contenido del documento. La evidencia acredita
la misma construcción de URL que el servicio ERP, pero no determina si el 404
se debe al archivo disponible o a una diferencia entre `PDF` y el parámetro
esperado por esa ruta. No se quitó/agregó una extensión al dato Oracle, ni se
cambió `URL_ENDPOINT_DE_PDF`, ni se copió/generó un archivo para hacer pasar el
control. **Queda pendiente verificar la disponibilidad del documento en el
endpoint; mantener la PR en borrador.**

Cierres y logout aprobados en ambos intentos. Logs: cero líneas del chatbot y
solo eventos ERP con esquema sanitizado reconocido (dos en el primero y tres en
el segundo). Modelo controlado: dos llamadas en el primer intento y una en el
adicional; cero Bedrock/proveedor. HTTP del candidato en loopback efímero,
router/controller/servicio/repositorio reales y Oracle proxy autorizado. Sin
valores sensibles ni documentos en reportes versionados.

DEV conserva los 292 archivos comprobados de `883805c`; el candidato no está en
`/app` y la salud es correcta. La instancia cambió respecto del reporte histórico
de arranque de PR #45: no se afirma que sea la misma instancia. No se ejecutó
merge, reconstrucción ni despliegue durante esta tarea. Revisión sanitizada
local: `logs/invoice-plate-pdf-evidence-review.json`.

Hasta `1755d68`, los cambios posteriores a `3cfc59f` eran documentales. La
revisión posterior de matrícula y disponibilidad se identifica a continuación.
Las reservas históricas, muestras pendientes y límites del balance permanecen.
No se acredita HTTP 200/PDF descargable, cobertura lingüística remota, todas las
matrículas o documentos, ni controles reales de base/archivo ausentes: estos
últimos tienen cobertura sintética.

## Diagnóstico actualizado de PR #46: parámetro PDF, archivo y matrícula

### Construcción y configuración

El valor de `/:cdc` es **exactamente `PDF` recuperado de Oracle**, sin sustituirlo
por un número de factura, quitarle una extensión o inventar un archivo. En ambas
muestras observadas `PDF` era un solo segmento sin extensión. El controlador ERP
forma `${req.params.cdc}.pdf`, por lo que añade una sola extensión en estos casos.
El chatbot conserva su unión base + campo `PDF`; no necesitó una corrección del
código de URL y no cambió `URL_ENDPOINT_DE_PDF`.

La variable coincide entre `.env`, chatbot DEV y ERP DEV. La ruta configurada
coincide con `/delsolerp/api/factura/pdf/:cdc`, sin query ni fragmento. Además de
`base.route.js` y `download-de.controller.js`, se revisaron:

| Fuente ERP | Montaje confirmado | SHA del blob |
| --- | --- | --- |
| [index.js](https://github.com/mianrori/api-delsol-erp/blob/main/index.js) | `app.use('/delsolerp/api', router)` | `442a22e850c73e192ab9826c9305fc18a5ffa67c` |
| [src/routes/index.js](https://github.com/mianrori/api-delsol-erp/blob/main/src/routes/index.js) | `router.use('/', baseRouter)` | `6696049c374d9d235c72e106f84f80561aae8423` |

### Ausencia real y positivo legítimo, sin alterar el enlace

- La cohorte anterior se reconstruyó con su mismo criterio; su muestra PDF dio
  **404** con el payload conocido **«Archivo no encontrado»**, no el 404 de ruta
  inexistente. El parámetro decodificado coincide con Oracle y no tiene extensión.
  En la auditoría local, `${PDF}.pdf` tampoco existe (ni el nombre literal sin
  extensión). No hay indicio observado de doble `.pdf` o URL mal construida.
- Se encontró otra muestra legítima mediante la intersección de archivos ERP
  existentes y filas Oracle autorizadas por el usuario proxy. Con la **misma base
  configurada**, sin cambiar el campo `PDF`, respondió **HTTP 200**,
  **`application/pdf`** y firma **`%PDF-`**. El archivo esperado por el controlador
  existe, se leyó su firma y el HTTP conversacional ofreció «Ver PDF» al mismo
  destino conciliado con Oracle.
- El destino configurado no es el ERP local. La auditoría del directorio DEV se
  identifica como local, no como inspección directa del filesystem remoto. El
  payload remoto de archivo ausente y el positivo remoto son pruebas HTTP
  separadas. El diagnóstico respalda **archivo ausente en la ruta de descarga
  observada**, no un fallo general de código/configuración.
- La identidad del archivo del 404 histórico no se había retenido por privacidad.
  No se afirma que el CDC reconstruido sea byte por byte el del intento anterior.
  Se conserva el 404 histórico y la ausencia reconfirmada como reservas; el
  positivo no hace aparecer ese archivo ni acredita todos los documentos.

La búsqueda fue acotada: hasta 256 entradas del directorio local, 64 nombres
candidatos usados solo en IPC privado, selección Oracle autorizada y tope de 13
GETs. **Solo se hicieron dos GETs**, el 404 y el 200, y se detuvo al encontrar el
positivo. No se crearon, copiaron ni modificaron archivos; no se publicaron
nombres, matrículas, URLs, sesiones o contenido PDF. Los bytes de la firma se
verificaron en memoria y no se guardó ningún documento.

### Guiones y coincidencias indebidas

Eliminar guiones y whitespace corresponde a la normalización del repositorio
ERP y a su catálogo. Eso conserva letras y números; no es fuzzy ni corrección de
una matrícula. El riesgo encontrado era **`LIKE '%AB123%'`**, que puede incluir
`XAB123` o `AB1234` y tratar `%`/`_` como patrones. Se corrigió en el chatbot a
**igualdad de la matrícula completa normalizada**, manteniendo binds y permisos.

Las regresiones verifican formatos equivalentes con guiones/espacios/tabuladores,
identificadores más cortos/largos, caracteres distintos y comodines literales.
El control Oracle ejecutó el **predicado extraído del repositorio actual** contra
valores sintéticos de solo lectura en `DUAL`: admite únicamente las tres variantes
normalizadas equivalentes y excluye los cuatro casos de prefijo/sufijo/comodín.
No inserta registros ni fabrica archivos. En la cohorte comercial observada no
hubo filas adicionales por substring; no se inventa un caso comercial de colisión.

No se añadió búsqueda parcial ni separación de varias matrículas en una celda.
La búsqueda ahora exige que el contenido normalizado completo corresponda al
identificador solicitado. Esto adapta deliberadamente el `LIKE` ejecutado por
el ERP a la condición de evitar coincidencias indebidas y sigue la estrategia de
igualdad descrita en su catálogo.

### Commit cubierto y controles afectados

- **`cfb5f508d2016b079e7009f933f4a912ad586e30`: aplicación y pruebas, 15/15 en
  Node 22.23.4.** Dos regresiones nuevas de identificadores/comodines y actualización
  de las pruebas de factura/HTTP afectadas por la igualdad. Salida congelada
  `logs/invoice-pdf-diagnostic-focused-node22.txt`, SHA-256
  `642e23091d2768df609429eec406fe7531f762b517533df0d30a03e9d3f783b9`.
- **`a7112a63dd9a6b66e08a7b7f204b0ba6a2a0de4a`: diagnóstico Oracle/HTTP y auditoría
  de solo lectura, 40/40 comprobaciones.** No cambia aplicación/pruebas respecto
  de `cfb5f50`; solo completa la inspección independiente del nombre literal y del
  nombre que forma el controlador. 298 archivos verificados; manifiesto SHA-256
  `b282e9b4c1013e8ad32a4866fcc031e877322ba8b48c03a08be92ae3e5e150cd`.
- Dos páginas con igualdad, cliente/concepto, fechas, anulación y paginación se
  conciliaron con Oracle independiente. El positivo PDF tuvo además otra consulta
  HTTP de detalle y enlace con su fila autorizada. Modelo controlado: tres
  llamadas; cero Bedrock/proveedor. Conexiones, servidor efímero y logout cerrados.
  Logs: cero líneas de chatbot y cuatro eventos ERP de esquema sanitizado.
- **`c52a77e`** solo sustituye los tres ejecutores anteriores por alias al diagnóstico
  actual, evitando conservar un comando activo que todavía esperase `LIKE`.
  Su preflight por el comando original pasó, reutilizando las 15 pruebas y sin
  repetir las consultas Oracle ni las descargas. El código activo del diagnóstico
  validado y la aplicación no cambian.

Reporte congelado ignorado `logs/invoice-pdf-diagnostic-a7112a6.json`, SHA-256
`1a4045afba9a36d9dff26ac725e0dc1de44f8dbcf5f77a38add002f2638fdeff`.
Revisión sanitizada: `logs/pr46-pdf-diagnostic-review.json`. Los resultados 13/13,
23/24 y 17/18 anteriores siguen siendo evidencia histórica sobre `LIKE`, no
cobertura de esta corrección a igualdad; no se suman a los nuevos conteos.

La descarga queda acreditada para **una muestra legítima disponible**, manteniendo
la reserva del archivo ausente, los límites de muestreo y todas las salvedades del
balance. PR #46 permanece **en borrador hasta revisar el diagnóstico**. Sin merge,
despliegue ni cambios de datos, configuración, permisos o expiraciones.
