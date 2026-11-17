# Deuda cancelada: intención, estado y paginación

**Estado vigente: PR #53 fusionada y merge e471261 desplegado en Docker DEV.** El literal, pendientes→«ahora las canceladas» y las páginas 1/2, incluida continuación tras recorte, quedaron conciliados en el proceso habitual 5400. [Control desplegado, cierre y reservas](invoice-settled-dev-live-e471261.md). Las referencias a borrador/sin despliegue siguientes corresponden a las validaciones anteriores.

Rama separada `fix/invoice-settled-intent`, base **649c8bc**. PR en borrador; sin merge ni despliegue. Candidato validado: **879dcf27f65462d95e8729724749f9cf9ce82a38**.

Pregunta literal: **«Mostrame las facturas de Impacto cuya deuda ya está cancelada»**.

## Corrección

La intención de deuda cancelada precede a la detección de «pendiente», para que «sin deuda pendiente» no active el filtro positivo. La frase literal resuelve Impacto con `search_invoice_balance_customers` y consulta exclusivamente `get_invoice_balances`, `debtStatus="settled"`, `mode="detail"`, página 1 y 20 registros. El repositorio existente aplica **`VW_BOT_FACTURAS_SALDOS` y `DEUDA = 0`**; no cambia su SQL ni los permisos Oracle.

También se cubren «facturas pagadas», «sin deuda pendiente» y «ahora las canceladas» desde una consulta de saldos. Ese seguimiento conserva el cliente confirmado, reinicia página y retira la condición pending y los filtros antiguos incompatibles. Sin contexto de saldos, «ahora las canceladas» solicita indicar cliente; no amplía la consulta automáticamente. Se corrige una propuesta controlada del modelo que intenta usar `get_invoices`/`cancelled=true`.

Deuda cancelada significa deuda cero, **no factura anulada**. La presentación lo explica, conserva serie/número/cliente/vencimiento/moneda/deuda y etiqueta las filas como deuda cancelada. «Facturas anuladas» y la expresión aislada ambigua «facturas canceladas» no se convierten por esta corrección en deuda cero. Si no existen filas, se informa ausencia de facturas con deuda cancelada, sin llamar al listado general ni inventar filas o acciones.

La protección PII ahora separa el nombre del cliente de «cuya deuda ya está cancelada» y «sin deuda pendiente». Antes, la regla genérica podía absorber toda la condición dentro del token del nombre y ocultar la intención. Se protegen también los nombres tras «facturas pagadas de…». No se envían identidades originales al modelo ni se registran filas sensibles.

Para continuar tras recortar el historial se conserva por sesión únicamente el contexto protegido y los metadatos mínimos de la última página válida, sin filas ni conexiones. Una nueva consulta settled sustituye pending; la página siguiente conserva settled incluso sin toolResults antiguos en el historial. Una denegación/fallo marca ese cursor como error y no permite reanudar una página de éxito obsoleta; no reemplaza el contexto válido de resolución anterior. Reset elimina también esos metadatos. El mensaje genérico de fallo ahora se refiere a saldos, sin etiquetar erróneamente toda operación como pendiente.

## Pruebas enfocadas

[Reporte de pruebas](invoice-settled-tests-879dcf2.json): **118/118 con Node 22.23.5**, incluidas **20 regresiones HTTP nuevas** (diez escenarios antes/después de recortar realmente los mensajes anteriores): literal, pagadas, sin deuda pendiente, seguimiento desde pendientes, vacío válido, denegación, resultado ausente, propuesta incorrecta del modelo, cliente ambiguo y falta de contexto. Además, clasificación de intención y límites PII/restauración.

Se verifican argumentos efectivos, SQL `DEUDA = 0` sin `DEUDA > 0` ni ANULADO, cliente, reinicio de página, filas/estado/presentación, página 2, PII, identidad del servidor y cierre de conexiones simuladas. Después de la primera respuesta settled también se recorta el historial y se solicita directamente la siguiente página, sin reemitir la consulta. Denegación y resultado ausente preservan el estado válido anterior e impiden reanudar el cursor tras el recorte. Las regresiones afectadas de pendientes, errores, selección, integridad y consultas nominales siguen pasando.

```text
node --test test/invoiceSettledIntent.test.js test/invoicePendingResultHttp.test.js test/invoicePendingRouting.test.js test/invoiceBalances.test.js test/invoiceBalancesHttp.test.js test/invoiceBalanceIntegrity.test.js test/invoiceNamedRequest.test.js test/searchSelection.test.js
```

Oracle y sesiones son simulados en esas pruebas. Las expresiones acotadas no invocan el SDK. Solo el escenario de propuesta incorrecta usa una respuesta SDK controlada, sin proveedor remoto.

## Pregunta literal por HTTP y Oracle independiente

[Reporte Oracle/HTTP sanitizado](invoice-settled-oracle-http-879dcf2.json), SHA-256 `0db4ee1d4476fc8b0f8330c674e1dff9823c7b2e3d0718255c83196afe14bd4e`: **143 comprobaciones correctas**, 13/11/2026 **11:42:32–11:42:41 America/Asuncion** (14:42 UTC), sobre una extracción limpia de 879dcf2 en un puerto HTTP efímero. Se ejecutan router, controller, servicio de conversación, ejecutor, servicios/repositorios y Oracle reales. No sustituye ni modifica el proceso desplegado en 5400.

La consulta ejecutó exactamente el catálogo de saldos y `get_invoice_balances`, con el mismo cliente resuelto, `debtStatus="settled"`, detalle/página 1/20 y sin filtros de facturación. Se inspeccionaron SQL y binds efectivos: deuda cero, sin filtro positivo ni anulación. SQL independiente de la misma identidad concilió conteo, campos, deuda cero, orden y metadatos de paginación; también se cotejaron los valores de la tabla presentada. **Hubo filas reales con deuda cero**. La rama de ausencia fue comprobada únicamente con Oracle simulado; no se fabricó una ausencia real ni se acudió a `get_invoices`.

**Cero invocaciones de modelo y cero llamadas al proveedor** en el caso literal. El SDK controlado del control real rechaza preventivamente cualquier intento; no se invocó. No acredita interpretación de un modelo real fuera de la gramática cubierta.

Sesión de login ERP → PostgreSQL → USER/PROXY_USER verificada. **3/3 conexiones cerradas**, driver restaurado, listener/pool/conversación propios limpiados; logout y auditoría sanitizada de ambos servicios aprobados. Expiración sin cambios durante consultas; imagen/arranque DEV sin cambios. Solo SELECT Oracle y ciclo normal de login/actividad/logout ERP; sin cambios de datos de negocio, permisos o configuración de expiraciones.

## Reservas

El contraste Oracle nuevo cubre la pregunta literal y su primera página/metadatos. Seguimiento, recorte, página 2, ausencia, ambigüedad, denegación y fallos de esta corrección se acreditan mediante pruebas simuladas; no se presentan como nuevas ejecuciones Oracle reales. Se mantienen los bloqueos por duplicados y las reservas anteriores, incluidas duplicados con deuda distinta sin muestra y los casos independientes de PR #50/#51.

No se ejecutó una suite completa ni se repitieron perfiles administrativos. Los fallos globales históricos de c6fcb4b (35 Node 22, de los cuales 17 por falta de git; 18 Windows/Node 24 fuera del rango admitido) permanecen separados y no certifican el estado global de 879dcf2. No se modifican los reportes históricos. Los commits posteriores de documentación/evidencia no cambian el candidato ejecutable.
