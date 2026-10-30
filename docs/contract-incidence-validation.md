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

### Corrección de facturas empatadas

La revisión detectó que `BILLING_AMBIGUOUS` anulaba el total y el porcentaje,
pero dejaba en el concepto el importe de la primera fila empatada. La selección
ahora examina todas las filas con la misma prioridad de fecha/número, incluidos
números equivalentes para el comparador como `2` y `02`. Conserva el concepto y
su descripción, pero devuelve `amountExcludingTax=null`, estado y motivo propios.
Solo conserva su moneda si todas las filas empatadas coinciden en una moneda
identificada. La presentación muestra **sin calcular** y explica la ambigüedad.
Los conceptos no afectados conservan sus importes.

Las pruebas enfocadas de esta corrección pasan **29/29 en Node 22**, sin red ni
credenciales. Comparan objetos completos y texto con las facturas invertidas,
en resumen y por mes: importes distintos, monedas distintas/desconocidas, filas
idénticas, tres empates y números equivalentes. Comprueban también que un empate
entre facturas antiguas no invalide una última factura única.

`scripts/check-contract-incidence-ties.mjs` añade los casos de empate al contraste
Oracle del ejecutor con `BOT_TEST_INCIDENCE_TIES=true`. Ejecuta los repositorios
reales contra CTE sintéticas y revierte las filas facturadas recibidas antes de
comparar las respuestas. Comprueba nulos, motivos, conceptos no afectados,
desgloses mensuales/resumen y texto sin importes arbitrarios. No fabrica datos
persistentes.

La ejecución final sobre **`dcd9530` aprobó 309/309 controles**: los 213 controles
de incidencia, conciliación y HTTP se repitieron sobre la corrección; se sumaron
96 comprobaciones Oracle de empates (seis escenarios, resumen/mes y ocho
comprobaciones por combinación). En ambos órdenes se conservaron conceptos y
motivos, con importes afectados nulos, sin subtotales ni texto arbitrarios.
Los diez archivos candidatos comparados coinciden con la copia ejecutada.
También pasaron la denegación con otro usuario Oracle real y los controles de
cierre. `ORA-00942` fue la denegación esperada; los logs compactos del servicio
no muestran errores de cierre, controlador ni carga de módulos.

Se conserva el pendiente de muestra real `ZERO_SALES` descrito abajo. La PR
permanece en borrador hasta revisar esta corrección, sin merge ni despliegue.

### Evidencia anterior a esta corrección

- Medición inicial sobre la base: 108 controles; 14 fallidos, principalmente por
  calcular incidencia con costo incompleto o sin una vigencia contractual inequívoca.
- Pruebas controladas: 263/263 aprobadas en Node 22, contenedor aislado sin red,
  volúmenes ni credenciales. Incluyen resumen ponderado, vigencias, créditos,
  conceptos faltantes, importes nulos, facturas empatadas, monedas, FX inválida,
  cancelación, presentación y preservación de filtros. Los tests del dispatcher
  comprueban autorización por `sessionId`, ignoran `username` en argumentos y
  verifican cierre tanto en éxito como ante ORA-00942/01031.
- **213/213 controles aprobados antes de la corrección de empates** contra Oracle DEV y mediante HTTP
  sobre el código de `f48e163`, para enero–mayo de 2023. Se conciliaron costos,
  ventas e incidencia mensual/resumen, selección exacta de contrato/local y un
  filtro de local sin coincidencias. Los nueve archivos candidatos comparados
  coinciden con los ejecutados en la copia aislada.
- **7/7 límites de vigencia aprobados en Oracle** usando el SQL real y CTE
  sintéticas: inicio exacto, vencimiento exacto, vencimiento abierto, inicio un
  segundo tarde, vencimiento un segundo temprano, contrato expirado o futuro y
  coincidencias superpuestas. Inicio exacto y vencimiento abierto comparten caso.
- Los tres seguimientos HTTP (resumen, período y local) ejecutaron nuevas
  consultas, conservaron los demás filtros y se contrastaron con los controles
  independientes. Las equivalencias PYG/USD se conciliaron con la tasa actual
  retornada, sin usarla para habilitar porcentajes entre monedas distintas.
- Se comprobaron dos usuarios Oracle distintos sin publicar sus identidades,
  denegación real sin datos y cierre de las conexiones de control y denegación.
  `ORA-00942` fue la denegación esperada. No aparecieron errores de cierre,
  controlador o carga de módulos en los logs compactos del servicio.
- **Pendiente real DEV:** no se encontró una muestra de ventas registradas con
  total cero. El caso `ZERO_SALES` pasa con datos controlados; no se fabricaron
  ventas para obtener esa cobertura. Hay muestras reales sin registros de ventas,
  con costo parcial, contrato ausente/ambiguo/parcial y monedas incompatibles.

La preparación final del helper se corrigió para copiar `src/prompts` como parte
de `src`, capturar stdout/stderr sin imprimirlos y registrar etapa/versión en un
diagnóstico sanitizado. El lanzador local `logs/run-contract-incidence-final.ps1`
fuerza la etapa final; `-Preflight` solo comprueba la preparación, sin sesiones.
Estos helpers y todos los reportes continúan ignorados por Git. El servicio
desplegado no se reconstruyó ni reinició para esta validación.

Los controles validan las vistas autorizadas, no auditan las tablas ERP subyacentes.
No se fabrican muestras reales para obtener cobertura. El modo HTTP no prueba todas
las formas de lenguaje ni la desambiguación inicial de nombres históricos. La regla
de última factura y mes de emisión debe distinguirse de un informe de cargos
acumulados o de devengamiento: esta PR no redefine esas reglas de negocio.
