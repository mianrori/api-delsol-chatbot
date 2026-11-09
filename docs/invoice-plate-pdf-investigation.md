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

Resultados Node 22 y Oracle/HTTP pendientes de revisar. No se llama a Bedrock ni
al proveedor externo. No se publica DEV, ni se alteran datos, permisos o
expiraciones. Se conservan las reservas y evidencias anteriores; no se atribuye
cobertura real a archivos/casos ausentes de la cohorte observada.
