# Incidencia contractual: validación DEV

Base: `68847db` (PR #33 desplegada). Rama: `test/contract-incidence-dev`.
Alcance: costo contractual facturado sin IVA, ventas auditadas e incidencia.
No se modifican ventas por m², compras por promoción, datos ERP ni expiraciones.

## Reglas y límites del indicador

- La regla de facturación existente se conserva: **última factura válida por
  cliente, concepto oficial y mes de emisión**, no suma de todas las facturas.
  El intervalo exacto limita tanto `FECHA_EMISION` como la fecha de las ventas.
  `PERIODO` de la factura no se interpreta como fecha ni se redistribuyen importes.
- Los conceptos oficiales siguen siendo los configurados: no se agregan códigos
  ni se usa `MONTO_GASTO` configurado para reemplazar un importe facturado ausente.
  Se exige vigencia del concepto en la fecha de emisión seleccionada. Facturas
  anuladas o no consultables se excluyen mediante los permisos existentes.
- Cada intervalo mensual solicitado debe tener un único contrato histórico que
  lo cubra por completo. Los meses extremos se recortan a las fechas solicitadas.
  Inicio y vencimiento son inclusivos; Oracle DATE conserva precisión de segundos.
  Un vencimiento abierto es válido. No se exige estado contractual actual.
- Varios contratos dentro del intervalo, incluso si se suceden sin superponerse,
  dejan el indicador sin calcular: las facturas se vinculan por cliente/concepto
  y no permiten atribuir importes a una secuencia de contratos. No se elige el
  contrato con mayor número o fecha ni se usa el contrato más próximo.
- Los filtros de cliente, local e identidad contractual se enlazan como parámetros.
  La identidad exacta debe estar completa. La facturación sigue vinculada al cliente
  y concepto, según la regla de la vista; no se inventa una unión factura/contrato.
- Costo o ventas con monedas mezcladas, desconocidas o contradictorias no producen
  un importe monetario agregado. Se conservan desgloses identificados por moneda.
  La incidencia requiere costo y ventas en la misma moneda original.
- Para PYG se ofrecen equivalentes USD con la cotización de **venta actual**.
  No es una cotización histórica y no habilita calcular una incidencia histórica
  cruzando monedas. USD nativo conserva USD. Si falla la tasa, o es cero, negativa
  o no finita, el equivalente queda sin calcular; la incidencia nativa válida sigue
  disponible.
- Ausencia de registros (`NO_SALES`) y total registrado cero (`ZERO_SALES`) tienen
  motivos distintos. Ambos dejan el porcentaje sin calcular. Lo mismo ocurre con
  contratos ausentes, ambiguos o de cobertura parcial; costo incompleto; última
  factura empatada; importes ausentes y monedas incompatibles.
- La incidencia válida es `100 * costo / ventas`, redondeada a cuatro decimales.
  El resumen divide los totales del mismo intervalo: no promedia porcentajes
  mensuales ni omite meses inválidos. Si algún mes es inválido, el resumen conserva
  los motivos y deja el porcentaje sin calcular. No se prorratean cargos ni se
  estima facturación que la vista no proporciona.

## Seguimientos y presentación

Los seguimientos explícitos de un solo cambio conservan los demás filtros de la
última consulta de incidencia exitosa:

- `Ahora cambia el período a 01/01/2023 al 31/01/2023; conserva los demás filtros`
- `Ahora cambia el local a "Otro local"; conserva los demás filtros`
- `Ahora muestra por mes; conserva los demás filtros`
- `Ahora muestra el resumen; conserva los demás filtros`

Los IDs del local provienen de las herramientas normales de resolución. Cambios
compuestos, otro tema o una llamada anterior fallida siguen el flujo normal.
La respuesta se construye desde los valores de la herramienta y sus motivos, sin
pedir al modelo que recalcule porcentajes. Los nombres se restauran únicamente
para la respuesta autorizada y se escapan como celdas de Markdown.

## Controles independientes

`scripts/run-contract-incidence-dev.mjs` lee ventas, contratos, conceptos y facturas
por separado, sin reutilizar los repositorios ni sus SQL para construir el control.
Asocia vigencias, elige facturas y agrega importes en JavaScript. Límites explícitos
de filas impiden validar controles truncados. Las cifras se usan solo en memoria.

El modo `BOT_TEST_INCIDENCE_HTTP=true` añade selección exacta de contrato/local,
filtro sin coincidencias, tres seguimientos HTTP y límites de vigencia ejecutando
el SQL real del repositorio sobre filas sintéticas en CTE de Oracle. Estas últimas
no crean ni modifican tablas o vistas de DEV. La prueba HTTP usa rutas y controladores
reales en un servidor temporal dentro de la copia candidata, con un contexto previo
real preparado para aislar el seguimiento de la búsqueda inicial de nombres.

Configuración privada por variables de proceso: `BOT_TEST_SESSION_ID` y,
opcionalmente, `BOT_TEST_DENIED_SESSION_ID`. Fechas por defecto: enero–mayo de 2023;
se pueden definir `BOT_TEST_INCIDENCE_FROM` y `BOT_TEST_INCIDENCE_TO`.
`BOT_TEST_REPORT` selecciona la ruta del reporte sanitizado.

El helper local ignorado `logs/run-contract-incidence-dev.ps1 -Stage baseline|final`
solicita las sesiones con `Read-Host -AsSecureString`, restaura las variables al
terminar y ejecuta una copia en `/tmp/incidence-candidate`, separada de `/app`.
Los reportes contienen solo códigos, cobertura, pendientes y tiempos. No incluyen
identidades, nombres, contratos, facturas, cotizaciones ni importes. Si falta un
usuario distinto sin permisos, esa cobertura queda pendiente, no aprobada.

## Evidencia y pendientes

- Medición inicial sobre la base: 108 controles; 14 fallidos, principalmente por
  calcular incidencia con costo incompleto o sin una vigencia contractual inequívoca.
- Pruebas controladas: 263/263 aprobadas en Node 22, contenedor aislado sin red,
  volúmenes ni credenciales. Incluyen resumen ponderado, vigencias, créditos,
  conceptos faltantes, importes nulos, facturas empatadas, monedas, FX inválida,
  cancelación, presentación y preservación de filtros. Los tests del dispatcher
  comprueban autorización por `sessionId`, ignoran `username` en argumentos y
  verifican cierre tanto en éxito como ante ORA-00942/01031.
- El contraste final DEV y sus muestras faltantes se consignan en la PR.

Los controles validan las vistas autorizadas, no auditan las tablas ERP subyacentes.
No se fabrican muestras reales para obtener cobertura. El modo HTTP no prueba todas
las formas de lenguaje ni la desambiguación inicial de nombres históricos. La regla
de última factura y mes de emisión debe distinguirse de un informe de cargos
acumulados o de devengamiento: esta PR no redefine esas reglas de negocio.
