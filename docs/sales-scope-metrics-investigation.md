# Ventas: alcance autorizado y métricas predeterminadas

Base `d6ca3ae` (PR #43 integrada). Rama
`feat/sales-resolved-scope-default-metrics`. Sin merge ni despliegue de esta rama.

El alcance de las series mostraba «locales/rubros seleccionados» y una propuesta
del modelo con solo `totalAmount` omitía las cantidades aunque el usuario no
hubiera pedido esa restricción.

La consulta conserva los argumentos efectivos del guard de filtros. El servicio
de ventas obtiene las etiquetas mediante un repositorio nuevo, en la misma
conexión proxy autorizada: `VW_BOT_CLIENTES.NOMBRE_FANTASIA` por `COD_CLIENTE`
y `VW_BOT_RUBROS_LOCALES.DESCRIPCION` por `COD_RUBRO`. Son SELECT con binds de
los IDs efectivos; no se usan etiquetas de argumentos, narraciones o consultas
anteriores. Sin filtro no se consulta ese catálogo. Etiquetas ausentes o
contradictorias no se eligen arbitrariamente; se mantiene un alcance genérico
sin inventar nombres. No cambia la autoridad Oracle ni se modifican permisos.

`get_sales.scope` vincula cada nombre con su ID. El presentador vuelve a verificar
esa correspondencia, restaura los valores protegidos y escapa Markdown antes de
mostrar, por ejemplo, «Alcance: todos los locales del rubro Librería». Se conserva
la grafía autorizada del catálogo. Cada operación obtiene sus etiquetas, por lo
que el recorte, la reselección y la retirada de filtros no recuperan nombres viejos.
La retirada de rubro que usa el atajo de ventas también utiliza el presentador
determinista cuando su resultado es una serie completa.

La política del chat aplica ambas métricas después del guard y cambia solo
`metrics`. Una propuesta de solo importe se convierte por defecto en
`[totalAmount,totalInvoices]`. Una petición explícita de solo importe o solo
facturas se conserva en el estado de esa sesión y en los seguimientos, incluso
después del recorte. «Ambas métricas» restablece las dos; una nueva consulta
autónoma de rubro vuelve al valor predeterminado. Los clientes internos que
invocan el servicio con métricas explícitas conservan su contrato. No se cambia
el SQL ni la regla auditada/fallback de `VW_BOT_VENTAS_LOCALES`.

Las regresiones cubren nombres con IDs correctos/equivocados, nombres propuestos
por el modelo ignorados, PII restaurada antes de escapar, cambios/retiros de ambos
dominios, opciones ambiguas y recorte real. Comprueban argumentos completos,
períodos, agrupaciones, tipo de día, preferencia de métrica y columnas efectivas.
También se revisan el presentador, los seguimientos/exportaciones/comparaciones
afectados y los contratos existentes de cancelación/cierre; no la suite completa.

Controles preparados:

```powershell
.\scripts\run-sales-scope-metrics-dev.ps1 -Preflight
.\scripts\run-sales-scope-metrics-dev.ps1
```

El segundo pide login DEV mediante entradas ocultas, conserva sesión y resultados
en memoria y hace logout solo de la sesión creada. El candidato se copia del
commit limpio a `/tmp` y se verifican sus archivos contra Git. El servicio DEV
publicado no se reconstruye ni se modifica. Se usa modelo controlado, sin cliente
Bedrock real, herramientas de conversión ni peticiones HTTP externas del worker.
La conciliación compara importes, cantidades y monedas con SELECT independientes,
y las etiquetas con lecturas separadas de los catálogos autorizados. Incluye ambos
Nike legítimos, ambos modos de intención y recorte, métricas únicas/restauradas,
cambio de rubro y retirada de filtros. Los nombres, IDs, binds y resultados no se
publican en el reporte. Los logs se revisan en todo el intervalo del helper.

## Evidencia revisada

**82/82 pruebas afectadas en Node 22.23.4**, sobre
`3d31d63c37fd3c396ba790749916622977c81c7e`; 280 archivos verificados contra Git.
SHA-256 de salida enfocada:
`d1dee16c1aa29b7fba6a13c1df92788fab1a0dc64f943800b805424ed314c60d`.
Solo `salesScopeMetrics`, `salesScopeMetricsChat`, `salesSeriesPresentation`,
`librarySalesContext`, `salesCategoryIntentChat`, `salesAutonomousCategory`,
`searchResolutionState`, `salesExportFollowup`, `salesHistory`,
`salesYearComparison`, `searchFilterLifecycle`, `salesLocalRemoval`,
`chatLifecycle` y `oracleSessionClose`. Las dos últimas conservan los contratos
de cancelación y cierre; no se ejecutó la suite completa.

**260/260 verificaciones Oracle aprobadas**, candidato aislado
`43d72926b686b0ce7be9bcf6be6b3d6b0f3169ea`, 09/11/2026,
15:07:22–15:08:47 (Asunción). Código de aplicación/pruebas idéntico a `3d31d63`;
`b6a8cbf` y `43d7292` cambian exclusivamente el ejecutor Oracle. Se reutilizaron
las 82 pruebas por identidad del código y hash; no se repitieron suites.

Modelo controlado: 31 iteraciones, **cero Bedrock y cero proveedor**. Se probaron
ambos Nike legítimos entre cinco opciones autorizadas, ambos tipos de intención
antes/después del recorte y la pregunta literal desde Nike pendiente. También
una métrica por vez y su restauración después del recorte, cambio de rubro y
retirada de local/rubro conservando período y agrupación. Se verificaron:

- Importes, cantidades, monedas y todos los grupos mensuales contra SELECT
  independientes. Se conciliaron 53 grupos positivos con ambas magnitudes a lo
  largo de las consultas; no se presentan como 53 muestras únicas.
- Nombres de cada local/rubro contra lecturas independientes por ID en los
  catálogos autorizados, más su presencia en el alcance mostrado. Sin etiquetas
  inventadas, referencias a filtros retirados o tokens internos en la respuesta.
- Argumentos efectivos, columnas SQL, presentación y estado persistente:
  defecto de dos métricas frente a propuestas de solo importe; excepción del
  usuario para importe/facturas y posterior restauración de ambas.
- Identidad proxy desde la sesión, cierre de todas las conexiones y logout de
  la única sesión creada por el helper. La sesión no se almacenó en archivos.

Los 260 checks son comprobaciones de estos flujos y su infraestructura, no 260
conversaciones independientes ni una suma con las 82 pruebas como cobertura única.
Reporte congelado ignorado `logs/sales-scope-metrics-oracle-43d7292.json`, SHA-256
`478fc660db60d8a96c565e84beb0b5c0853f11993c613ad855d1a75cb475a621`.
Esquema revisado sin claves sensibles ni UUID de sesión. Logs del intervalo
completo: chatbot cero líneas, ERP dos, esquema sanitizado reconocido. Nombres,
IDs, binds, resultados e importes permanecieron en memoria.

El intento previo `b6a8cbf` aprobó 210 verificaciones pero falló la precondición
del caso adicional de retirada: su instantánea tenía un local sin rubro y el
control esperaba conservar librería. La corrección establece explícitamente
ambos filtros antes de retirarlo; no cambia implementación ni datos. Se conserva
el reporte parcial `logs/sales-scope-metrics-partial-b6a8cbf.json`, SHA-256
`7c698455c1541af0c3463279b7ad4444394cc67bda1aff6980a13d1933bc97ce`.
Ese intento no es una aprobación global ni se suma al resultado final; sus
conexiones/logout/logs aprobaron.

La lectura de etiquetas añade hasta dos SELECT de catálogo por operación
filtrada, dentro de la misma conexión. Etiquetas ausentes/contradictorias se
cubren con datos controlados, sin afirmar muestras reales de esos casos. Las
reglas de una sola métrica reconocen importe/monto/ventas totales y facturas/
cantidad/número de facturas; no se afirma cobertura lingüística exhaustiva.

Los controles anteriores de PR #43 no se atribuyen a estos cambios nuevos.
Se conservan sus reservas, muestras pendientes y límites, sin proveedor ni
cambios de datos/permisos/expiraciones. Sin merge ni despliegue de esta rama.

## P2: «no solo» debe nombrar una métrica

La revisión de `74227ca` encontró que la regla trataba cualquier «no solo» como
petición de ambas métricas. Tras «Muestra solo el importe», el seguimiento
«No solo enero, también febrero» añadía facturas y sobrescribía la preferencia
persistente, incluso después del recorte. Las 82 pruebas y los 260 controles
anteriores no cubrían este caso; sus resultados no se atribuyen a la corrección.

La regla ahora exige una referencia inmediata a importe/monto/ventas totales
o facturas/cantidad/número de facturas, con el artículo opcional. Sin esa
referencia no cambia la preferencia de métricas. «No solo el importe, también
las facturas» sigue habilitando ambas. Las peticiones explícitas de ambas y las
reglas existentes de una métrica se conservan. No se modifican fechas, filtros,
agrupaciones, SQL, repositorios ni servicios Oracle.

**Commit validado `300bec0f1905a9f40b7b640ec8e0030fe86cede1`: 7/7 pruebas
afectadas en Node 22.23.4**, 282 archivos verificados contra Git. Son cinco
regresiones nuevas (una de intención y cuatro perfiles de chat) y dos checks
existentes de política de métricas, seleccionados con `--test-name-pattern`.
No se ejecutaron las otras pruebas de los archivos seleccionados ni las suites
anteriores. Comando reproducible:

```powershell
node --test '--test-name-pattern=no-solo|default metric policy|explicit single metric' test/salesMetricsNoSolo.test.js test/salesScopeMetrics.test.js
```

Los cuatro perfiles comprueban, antes y después del recorte real del historial:

- «No solo enero, también febrero» amplía enero a enero–febrero y conserva solo
  el importe, tanto en los argumentos finales como en la preferencia persistente,
  el contexto efectivo, las columnas SQL y la presentación de los dos meses.
- Sobre ese período ampliado, «No solo el importe, también las facturas» habilita
  ambas sin perder febrero, el local, el rubro, la agrupación mensual ni el tipo
  de día. Se verifica también que la preferencia y el contexto persisten.

Los perfiles usan el chat, los guards, el servicio y los repositorios reales con
modelo y conexión Oracle controlados. Son pruebas de interpretación/argumentos/
presentación con datos sintéticos, **sin nuevas llamadas a Oracle, Bedrock ni
proveedor**. La conciliación anterior de importes y cantidades sigue acreditada
solo sobre `43d7292`; no se repitió ni se presenta como prueba de estos casos.

Reporte ignorado `logs/pr44-no-solo-focused.json`; salida congelada
`logs/pr44-no-solo-focused-node22.txt`, SHA-256
`218982f2408a131fa4c6589a9156a189e9a5dc04d8e5abdb95d09edd7bab2d5e`.
Manifest de la copia aislada, SHA-256
`f8e92866f5b96380b1ee3d64fd00f1a176211a6dd56ebb83ab8b6fe272c66052`.
Las reservas anteriores permanecen. PR #44 continúa en borrador hasta revisar
esta corrección; sin merge, despliegue o cambios de datos/permisos/expiraciones.
