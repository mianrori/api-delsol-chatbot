# Compras por promoción y campaña: validación DEV

Base: `8e80887` (PR #34 desplegada). Rama: `test/promotion-purchases-dev`.
Alcance: búsqueda/selección de promoción y campaña, compras del socio asociadas,
filtros, monedas, desgloses y paginación. No se modifican datos de DEV ni expiraciones.

## Reglas y correcciones

- `sessionId` sigue resolviéndose en PostgreSQL; Oracle se abre por proxy del
  usuario resuelto. `username` y una `connection` incluidos en argumentos no
  deciden la identidad ni reemplazan la conexión autorizada. Cada operación
  finaliza cerrando su conexión, incluso ante ORA-00942/01031.
- Se eliminaron los logs de SQL y binds del repositorio promocional: incluían
  el documento del socio. No se registran documentos, facturas, nombres ni filas.
- La pertenencia al socio se exige con `COD_SOCIO=:documentNumber`. Los filtros
  por promoción, campaña, local, rubro y origen usan binds; no se interpolan valores.
  Las fechas corresponden a `FECHA_COMPRA`, con inicio inclusivo y fin exclusivo
  del día siguiente. No se confunden con la fecha de registro.
- La selección se comprueba en el catálogo autorizado `VW_BOT_PROMOCIONES`.
  Una selección que corresponde a varios pares requiere elección (`AMBIGUOUS`),
  salvo una consulta explícita de múltiples IDs o desglose por promoción/campaña.
  `SELECTION_NOT_FOUND` significa que los IDs no corresponden al catálogo;
  `NO_PURCHASES` significa selección válida sin compras. Una búsqueda ambigua
  dentro de la misma ronda impide ejecutar automáticamente una compra elegida
  por el modelo. La selección explícita conserva el socio y los demás filtros.
- Sin filtros de selección se pueden consultar todas las participaciones del
  socio. Las cantidades son **registros de participación**, no facturas distintas:
  una factura asociada a varias promociones puede figurar varias veces.
- Los importes agregados se separan por moneda original. Una moneda desconocida
  o contradictoria deja su agregado sin calcular con motivo. No hay conversión
  implícita ni total monetario que sume PYG con USD. Los importes nulos no se
  sustituyen por cero; una suma realmente cero sigue siendo cero.
- La paginación siempre obtiene el conteo actual de Oracle con los mismos filtros.
  `knownTotalRows` externo se ignora y se retiró del esquema de la herramienta.
  La medición inicial reprodujo que un cero suministrado podía falsificar el fin.
- El tamaño efectivo respeta `LIMIT_FILTER` cuando es un entero positivo y el
  máximo técnico de 100; el valor efectivo se devuelve como `rows`. Se rechazan
  páginas fraccionarias, no positivas, no finitas o fuera del rango entero seguro.
- El detalle usa `ROW_NUMBER()` y ordena por fecha de compra/registro, factura,
  promoción, campaña y los demás campos visibles. Filas idénticas se concilian
  como multiconjunto, sin exigir que representen facturas distintas.
- En continuaciones explícitas se conservan documento, promoción, campaña,
  fechas, local, rubro, origen y tamaño; se cambia solo el campo pedido y se vuelve
  a la primera página. El fin real usa `hasMore`/`nextPage`, sin pedir una página
  adicional ni depender del modelo para reconstruir los filtros.

## Seguimientos y presentación

Ejemplos de cambios de un solo campo que conservan los demás filtros:

- `Siguiente página`
- `Ahora muestra el resumen; conserva los demás filtros`
- `Ahora muestra el detalle; conserva los demás filtros`
- `Ahora cambia el período a 01/01/2023 al 31/01/2023; conserva los demás filtros`
- `Ahora cambia el socio a "Otro documento"; conserva los demás filtros`
- `Ahora cambia el local a "Otro local"; conserva los demás filtros`
- `Ahora desglosa por mes; conserva los demás filtros`
- `Opción 2` cuando la última consulta promocional devolvió opciones ambiguas

Los IDs de nombres nuevos provienen del flujo normal de resolución. Cambios
compuestos u otro tema siguen el flujo normal. La tabla se genera desde resultados
de la herramienta, con restauración autorizada de PII y escape de Markdown, sin
recalcular importes con el modelo ni mostrar identificadores comerciales internos.

## Contraste independiente

`scripts/run-promotion-purchases-dev.mjs` lee directamente las filas de la vista
para el documento indicado y el catálogo por separado. Filtra y agrega en
JavaScript, sin reutilizar el SQL del repositorio para crear los valores de
control. Recorre todas las páginas del par promoción/campaña con más registros
del socio, dentro de un límite explícito de 200 páginas, y concilia el multiconjunto
completo de detalle, las cantidades y los importes separados por moneda.

El control abarca fechas, local, rubro, origen, búsqueda paginada contra el catálogo,
selección inexistente frente a ausencia de compras y conteo externo falso. Los
límites de filas se comprueban para evitar validar un control truncado. El modo
`BOT_TEST_PROMO_HTTP=true` añade rutas/controladores reales en un servidor temporal
de la copia candidata, con un contexto previo real para aislar los seguimientos.

Entradas privadas: `BOT_TEST_SESSION_ID`, `BOT_TEST_PROMO_DOCUMENT` y, opcionalmente,
`BOT_TEST_DENIED_SESSION_ID`. Se introducen solo mediante entradas ocultas en el
helper local ignorado `logs/run-promotion-purchases-dev.ps1 -Stage baseline|final`.
Se restauran las variables al terminar. `BOT_TEST_REPORT` define el reporte
sanitizado; no contiene identidades, nombres, documentos, facturas, importes ni
cotizaciones. Los datos sensibles se usan exclusivamente en memoria.

La copia se ejecuta en `/tmp/promotion-candidate`, sin reemplazar `/app` ni
reconstruir/reiniciar el servicio desplegado. El runner suprime logs crudos de
la base durante la medición inicial y conserva únicamente códigos de diagnóstico.

## Evidencia disponible y límites

- Base Oracle DEV: 57 controles, con un fallo reproducido por `knownTotalRows=0`.
  El socio proporcionado tiene varias páginas y el catálogo ofrece varias opciones.
- 277/277 pruebas aprobadas sobre `78b1adc` en Node 22, contenedor aislado sin red,
  volúmenes ni credenciales. Las 21/21 pruebas enfocadas de la revisión posterior
  también pasan en Node 22. Incluyen monedas mixtas, importes nulos,
  suma cero, paginación, identidad, selección y preservación de filtros. El ciclo
  HTTP controlado comprueba que el modelo no elija compras tras búsqueda ambigua,
  elección explícita, continuaciones sin modelo y denegación sin datos.
- El primer contraste final ejecutó 110 controles y encontró una diferencia de
  representación en la selección explícita: la restauración PII devuelve el ID
  de campaña como texto numérico y el control esperaba un número. Documento,
  valores de IDs, filtros efectivos, importes y cantidades coincidieron. El
  control corregido acepta solo enteros seguros no negativos equivalentes para
  `campaignIds`; documento, promoción y demás filtros conservan comparación
  estricta. No se cambia la restauración PII ni la identidad Oracle. Una prueba
  con el protector/restaurador real verifica este recorrido.
- Los IDs nulos de promoción/campaña en desgloses amplios se conservan nulos,
  sin convertirlos en cero o en el texto `null`.
- El nuevo contraste final DEV y sus limitaciones se consignarán al revisar el reporte.

No se fabrican compras o socios para obtener muestras. Los controles validan las
vistas permitidas, no sus tablas ERP subyacentes. La búsqueda aproximada se cubre
con pruebas controladas; no se presenta como una verificación independiente de
todos los criterios lingüísticos. El HTTP parte de un contexto previo preparado
y no prueba toda la desambiguación inicial de personas y nombres. No se mantiene
una conexión/snapshot Oracle entre páginas: cambios concurrentes en las vistas
pueden cambiar un recorrido posterior; el control detecta diferencias al conciliar.
