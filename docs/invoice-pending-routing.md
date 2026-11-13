# Facturas pendientes: selección de herramienta y alcance

**Estado vigente: PR #52 fusionada y merge 9fa4504 desplegado en Docker DEV.** El recorrido general → «solo las pendientes» → página 2 quedó conciliado en 5400 contra Oracle independiente, con cero proveedor y cierre/logout/logs verificados. [Evidencia desplegada y reservas](invoice-pending-dev-live-9fa4504.md). Las referencias a borrador/sin despliegue siguientes describen las validaciones anteriores.

PR #52 en borrador sobre `feature/chat-sales-pilot`; base **dcfaba0**. Corrección de resultados validada: **36c72b773f016ff66082aace4b60a8251a5e0c64**. La validación Oracle original corresponde exclusivamente a **c6fcb4bcda9a62ebe09df243ac8072bff21489e7**. Sin merge ni despliegue.

## Corrección del falso éxito y conservación del contexto

Antes, un fallo de `get_invoice_balances` podía terminar con «Consulta de facturas pendientes realizada» y reemplazar el contexto válido. En **36c72b7**, el ejecutor clasifica el resultado antes de crear presentación, acciones o protocolo de éxito. Se distinguen datos, vacío válido, `ACCESS_DENIED` y fallo (resultado ausente, `success:false`, error devuelto o estado inesperado). Los estados de bloqueo por integridad siguen mostrando sus explicaciones, sin habilitar cálculos.

Un fallo devuelve únicamente «No se pudo completar la consulta de facturas pendientes. Inténtalo de nuevo». No se publica el error crudo en respuesta, historial o logs. El intento queda como `toolResult.status=error`, sin datos, contexto de paginación ni acciones de éxito. El HTTP de chat conserva su sobre de conversación `success:true`; eso no representa éxito de la herramienta, cuyo estado es error.

El contexto de saldos solo se confirma después de construir un resultado válido. En ambas ramas deterministas, denegación o fallo restauran el estado de resolución anterior, incluido cliente, buscador y contexto de la última consulta válida. Una búsqueda nominal puede resolver un cliente nuevo, pero un fallo posterior no lo convierte en el cliente confirmado de una consulta completada. El vacío válido sí confirma la consulta y muestra ausencia de registros; los datos válidos conservan la tabla existente. No cambian SQL, repositorios de facturas, sesiones, permisos ni expiraciones.

[Reporte de pruebas afectadas de 36c72b7](invoice-pending-result-36c72b7.json): **96/96 con Node 22.23.5**, 13/11/2026 10:31:58–10:32:08 America/Asuncion (13:31 UTC). Incluye **16 regresiones HTTP nuevas**: rama nominal y «solo las pendientes», cada una con `undefined`, excepción capturada, resultado con error y datos/paginación/acciones espurios, denegación lanzada, denegación devuelta, vacío válido, datos válidos y resultado malformado. Comprueban estado anterior intacto en fallos, protocolo de error sin consulta completada, ausencia de error crudo y de efectos de éxito, SQL pendiente y cierres de conexiones simuladas. El SDK controlado no se invoca en estas expresiones.

```text
node --test test/invoicePendingResultHttp.test.js test/invoicePendingRouting.test.js test/invoiceBalances.test.js test/invoiceBalancesHttp.test.js test/invoiceBalanceIntegrity.test.js test/invoiceNamedRequest.test.js test/searchSelection.test.js
```

Solo se ejecutaron pruebas afectadas. Cero llamadas a Oracle real o al proveedor; cero logins, modificaciones de datos, permisos o expiraciones. Se usó una extracción Git temporal del candidato con Node 22 y dependencias de DEV, sin reemplazar el despliegue. La suite global y los controles Oracle ya aprobados **no se repitieron**: sus cifras siguientes son evidencia histórica de c6fcb4b, no una certificación global ni Oracle de 36c72b7. La PR se mantiene en borrador hasta revisar esta corrección.

Pregunta original suministrada por el usuario: **«¿Qué facturas pendientes de pago tiene Impacto?»**.

El prompt anterior indicaba usar `get_invoices` para detalle/resumen de facturas sin separar expresamente las pendientes. El seguimiento solo preservaba contexto dentro de cada herramienta: no existía una transferencia explícita de cliente entre facturación y saldos. No se dispone de una traza histórica del modelo para afirmar qué herramienta eligió en el incidente original. La reproducción documentada corresponde al candidato corregido, con la pregunta literal por HTTP y Oracle real; el intento incorrecto de `get_invoices` se reproduce adicionalmente con SDK controlado en la regresión HTTP.

## Comportamiento corregido

- Las expresiones acotadas de pendientes se resuelven directamente en el servicio de conversación. Para la pregunta original se ejecutan `search_invoice_balance_customers` y `get_invoice_balances`, sin invocar el modelo.
- El ejecutor redirige una propuesta incorrecta de `get_invoices` en una intención pendiente hacia `get_invoice_balances`; una búsqueda incorrecta de clientes de facturación se dirige al buscador de saldos sin sus fechas de emisión.
- El cliente confirmado se conserva mediante sus identificadores protegidos. No se trasladan fecha de emisión, concepto, matrícula, agrupación, filtros antiguos de saldos ni página anterior. Cliente sin resolver exige selección; no se amplía silenciosamente a todos los clientes. Una nueva resolución de saldos sustituye al cliente anterior y retira la solicitud nominal de facturación pendiente.
- La vista sigue siendo `VW_BOT_FACTURAS_SALDOS`, con `DEUDA > 0`. Deuda cero, negativa y desconocida quedan fuera de pendientes. El repositorio y las reglas Oracle no cambian.
- Se conserva la presentación de serie, número, cliente, vencimiento, código de moneda y deuda decimal exacta. No se deduplica el detalle ni se eliminan los bloqueos de totales, rankings y conteos ante identidades inconsistentes.

Argumentos efectivos comprobados, con el identificador redactado únicamente en la evidencia publicada:

```json
{
  "customerIds": ["<mismo cliente resuelto>"],
  "mode": "detail",
  "debtStatus": "pending",
  "page": 1,
  "rows": 20
}
```

## Contraste HTTP y Oracle independiente original: c6fcb4b

[Reporte sanitizado](invoice-pending-oracle-http-c6fcb4b.json), SHA-256 `bfc0d2fee66bb493666657d8b209520ac69fd64777e5b0bb110d1b4568de3582`. Ejecución 13/11/2026, **09:50:13–09:50:38 America/Asuncion** (12:50 UTC).

**178 comprobaciones correctas**, cinco consultas de pendientes con filas reales: pregunta original, «facturas pendientes», «pendientes de pago», «cuánto debe» y «solo las pendientes» después de otro POST que ejecutó `get_invoices` para facturas generales de 2023. El seguimiento retiró las fechas 2023 y recuperó los mismos saldos actuales del cliente confirmado.

En cada caso se inspeccionaron herramienta, argumentos restaurados y SQL/binds efectivos. Se cotejaron el conteo y los campos de cada registro, conservando multiplicidades, contra un SELECT independiente sobre la misma vista, identidad y cliente con `DEUDA>0`. Se comprobó página completa y valores de serie/número/cliente/vencimiento/moneda/deuda en la respuesta HTTP, sin publicar resultados de negocio.

Oracle contiene muestras de deuda cero y negativa; ninguna apareció en las consultas pendientes. También se encontró una identidad duplicada con deuda igual: el resumen permaneció bloqueado y el detalle conservó la advertencia. **No hubo muestra real de duplicados con deudas distintas**; ese caso queda cubierto por pruebas simuladas, sin fabricar ni modificar datos.

El listener HTTP pertenece a una extracción Git del candidato en `/tmp`, con dependencias existentes de DEV; no sustituye `/app` ni modifica el proceso desplegado. La secuencia de lenguaje natural acotado es determinista; el único uso del SDK controlado prepara la consulta general. **Cero llamadas al proveedor real**: esto no certifica la interpretación de un modelo real fuera de la gramática cubierta.

Identidad comprobada: sessionId de login ERP → PostgreSQL → usuario Oracle proxy. **14/14 conexiones cerradas**, driver restaurado, listener/pool cerrados y conversación de prueba limpiada. Logout confirmado en esta ejecución final; auditoría de logs de ambos servicios correcta, sin eventos Bedrock. Imagen y arranque habituales intactos. Expiración de la sesión comprobada sin cambios durante las consultas. Solo SELECT Oracle y ciclo normal de login/actividad/logout ERP; sin cambios de datos de negocio, permisos ni configuración de expiraciones.

Una ejecución preliminar del candidato 9313c23 pasó el contraste pero falló al confirmar logout. Se cerró después exclusivamente esa sesión propia mediante el endpoint ERP, se verificó CLOSED y se auditó el intervalo; no se reutiliza como evidencia del candidato final.

## Regresiones y límites históricos: c6fcb4b

**80/80 pruebas afectadas con Node 22.23.5**:

```text
node --test test/invoicePendingRouting.test.js test/invoiceBalances.test.js test/invoiceBalancesHttp.test.js test/invoiceBalanceIntegrity.test.js test/invoiceNamedRequest.test.js test/searchSelection.test.js
```

La nueva regresión HTTP comprueba la pregunta original, las cuatro expresiones solicitadas, cliente confirmado con filtros incompatibles previos, dos POST de general→pendientes, propuesta incorrecta del modelo, SQL positivo, tabla, duplicados conservados, historial protegido, identidad exclusivamente del servidor y cierre de conexiones. Otra regresión impide ampliar un cliente ambiguo y verifica que una solicitud nueva retire la selección nominal anterior. Las pruebas de integridad existentes cubren duplicados de deuda igual y distinta, información incompleta y separación por moneda.

La suite global **no está verde**: en Node 22, base 566/601 y candidato 570/605, con los mismos 35 nombres de prueba fallidos, sin fallos nuevos. Diecisiete corresponden a que la imagen no dispone del ejecutable `git`; los otros dieciocho también fallan en Windows. El contraste Windows con Node 24 (fuera del rango soportado, evidencia complementaria) dio base 583/601 y candidato 587/605, con los mismos dieciocho fallos previos. No se atribuyen al cambio ni se ocultan como aprobados. [Comparación de suites y nombres fallidos](invoice-pending-test-comparison.json).

No se certifican filtros complejos fuera de las expresiones cubiertas, interpretación por proveedor real, muestras de duplicados con distinta deuda ni los casos históricos de matrícula/permisos de otras PR. Se conservan las reservas del contrato de integridad. La PR permanece en borrador.

Para repetir el contraste con entrada oculta en PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-invoice-pending-dev.ps1`. Requiere candidato comprometido y limpio, Docker DEV y credenciales introducidas por el usuario; no guardar credenciales ni sessionId en archivos.
