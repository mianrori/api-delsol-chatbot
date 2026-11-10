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
igualdad para matrícula única y el repositorio usa `LIKE` por contenido. Esta
entrega conserva el comportamiento ejecutado (`%matrícula%`); no lo cambia a
igualdad ni añade fuzzy. La etiqueta solicitada aquí es **Ver PDF**, frente a la
etiqueta «Ver factura» del catálogo.

## Adaptación al chatbot

Se conserva Route → Controller → Service → Repository → Oracle. Un normalizador
compartido elimina los espacios en blanco y guiones de la entrada y rechaza un
filtro vacío antes de SQL, evitando `LIKE '%%'`. El repositorio elimina también
whitespace Oracle (tabuladores/saltos incluidos), conservando binds y el predicado
obligatorio de permisos. No se cambia identidad, filtros ni conteos/paginación.

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
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-invoice-plate-pdf-dev.ps1
```

Copia aislada del commit en Docker, servidor HTTP efímero limitado a loopback,
modelo controlado, Oracle real con identidad proxy obtenida de `sessionId` desde
PostgreSQL. Cohorte de matrícula autorizada leída sin publicar valores. Comparación
independiente de filas/conteos y URLs base+PDF en dos páginas; GET de un PDF solo
en el origen configurado (sin redirecciones), estado/tipo/firma PDF sin guardar
el documento. Cierres de conexiones y servidor, logout y logs sanitizados.

Resultados Node 22 y Oracle/HTTP revisados abajo; descarga con reserva HTTP 404. No se llama a Bedrock ni
al proveedor externo. No se publica DEV, ni se alteran datos, permisos o
expiraciones. Se conservan las reservas y evidencias anteriores; no se atribuye
cobertura real a archivos/casos ausentes de la cohorte observada.

## Resultado revisado y reserva de disponibilidad PDF

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

Los commits posteriores a `3cfc59f` de esta entrega solo documentan resultados.
Las reservas históricas, muestras pendientes y límites del balance permanecen.
No se acredita HTTP 200/PDF descargable, cobertura lingüística remota, todas las
matrículas o documentos, ni controles reales de base/archivo ausentes: estos
últimos tienen cobertura sintética.
